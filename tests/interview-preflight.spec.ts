import { test, expect, type Page } from "@playwright/test";

const pageErrors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => { expect(pageErrors.get(page) || []).toEqual([]); });

async function prepare(page: Page, failure = "") {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  const counts = { create: 0, identity: 0, readiness: 0, preflight: 0 };
  let failed = failure;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/student-me")) return route.fulfill({ json: { csrf_token: "csrf", student: { id: "student-1", full_name: "Test Student" } } });
    if (path.endsWith("/preflight")) {
      counts.preflight++;
      return route.fulfill({ json: { preflight_id: "proof-12345678901234567890", direction: 1 } });
    }
    if (path.endsWith("/identity")) {
      counts.identity++;
      expect(route.request().postDataJSON().captures).toHaveLength(6);
      return route.fulfill({ status: failed === "identity" ? 422 : 200, json: failed === "identity" ? { detail: "Retry identity verification." } : { verified: true } });
    }
    if (path.endsWith("/interview") && route.request().method() === "POST") {
      counts.create++;
      expect(route.request().postDataJSON()).toEqual({ preflight_id: "proof-12345678901234567890", camera: true, microphone: true, display_surface: "monitor" });
      return route.fulfill({ json: { session_id: "session-1", status: "ready" } });
    }
    if (path.endsWith("/photo-verification")) return route.fulfill({ json: { enabled: true, reference_ready: true, verified: true } });
    return route.fulfill({ status: 404, json: { detail: "Not found" } });
  });
  await page.routeWebSocket("**/ws/**", socket => {
    if (socket.url().includes("/ws/interview/")) {
      socket.send(JSON.stringify(failed === "runtime" ? { type: "error", detail: "Interview service connection failed." } : { type: "interview_started" }));
      return;
    }
    expect(socket.url()).toContain("/ws/interview-preflight/sub-1");
    counts.readiness++;
    socket.send(JSON.stringify(failed === "network" ? { type: "error", detail: "Service unavailable" } : { type: "ready" }));
  });
  await page.addInitScript(({ failure }) => {
    const w = window as any;
    w.mediaCalls = [];
    w.shares = 0;
    w.starts = 0;
    w.failure = failure;
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: "videoinput", deviceId: "camera-1", label: "Camera" },
      { kind: "audioinput", deviceId: "microphone-1", label: "Microphone" },
    ] as MediaDeviceInfo[];
    const videoTrack = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      ctx.fillRect(0, 0, 640, 480);
      setInterval(() => ctx.fillRect(0, 0, 640, 480), 50);
      return canvas.captureStream(20).getVideoTracks()[0];
    };
    w.roomChecks = 0;
    navigator.mediaDevices.getUserMedia = async (constraints = {}) => {
      // The quiet-room check's unfiltered feed is counted on its own.
      if (typeof constraints.audio === "object" && (constraints.audio as MediaTrackConstraints).noiseSuppression === false) w.roomChecks++;
      else w.mediaCalls.push(constraints);
      if (constraints.video && w.failure === "camera") throw new DOMException("Camera denied", "NotAllowedError");
      const tracks: MediaStreamTrack[] = [];
      if (constraints.video) tracks.push(videoTrack());
      if (constraints.audio) {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        oscillator.frequency.value = 440;
        const gain = context.createGain();
        // The quiet-room check opens an unfiltered feed: that one carries the
        // room noise (quiet unless a test makes it loud).
        const roomCheck = typeof constraints.audio === "object" && (constraints.audio as MediaTrackConstraints).noiseSuppression === false;
        gain.gain.value = roomCheck ? (w.failure === "noisy" ? .8 : .0003) : ["microphone", "silent"].includes(w.failure) ? 0 : .8;
        if (!roomCheck) w.environmentMicGain = gain;
        const destination = context.createMediaStreamDestination();
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        await context.resume();
        const audioTracks = destination.stream.getAudioTracks();
        for (const track of audioTracks) Object.defineProperty(track, 'muted', {get:()=>w.failure === "microphone"});
        tracks.push(...audioTracks);
      }
      return new MediaStream(tracks);
    };
    navigator.mediaDevices.getDisplayMedia = async () => {
      if (!navigator.userActivation.isActive) throw new DOMException("Screen picker requires a fresh click", "InvalidStateError");
      w.shares++;
      if (w.failure === "screen") throw new DOMException("Share cancelled", "NotAllowedError");
      const track = videoTrack();
      track.getSettings = () => ({ displaySurface: w.failure === "window" ? "window" : "monitor" });
      return new MediaStream([track]);
    };
    // Behave like a browser: a granted request sets the full-screen element.
    let fullscreen: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreen });
    Element.prototype.requestFullscreen = async function () { fullscreen = this; document.dispatchEvent(new Event("fullscreenchange")); };
  }, { failure });
  await page.route("**/interview.js*", async route => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({ response, body: source + `
      startCameraAnalysis = async () => {
        setInterval(() => {
          cameraAnalysisPassing = hasLiveTrack("video") && lobbyVideoEl.readyState >= 2;
        }, 60);
      };
      const originalWait = waitForPreflight;
      waitForPreflight = (check, message) => originalWait(check, message, 1800);
      window.__testFace = points => { faceLandmarker = faceLandmarker || {}; latestFaceLandmarks = points; latestFaceLandmarksAt = Date.now(); faceCountDetected = 1; };
      window.__testRecordingSetup = (session, stream, destination) => {
        currentSessionId = session;
        userMediaStream = stream;
        recordingAudioDestination = destination;
        if (candidateVideoEl) { candidateVideoEl.srcObject = stream; void candidateVideoEl.play().catch(error => { if (error.name !== "AbortError") throw error; }); }
      };
      window.__testStartRecording = startInterviewRecording;
      window.__testStopRecording = stopInterviewRecording;
      window.__testControlMessage = handleControlMessage;
      window.__testFinalizeRecording = finalizePendingInterviewRecording;
      window.__testEmitRecordingChunk = blob => interviewRecorder?.ondataavailable?.({ data: blob });
      window.__testSaveRecordingQueue = () => recordingPersistenceQueue;
      window.__testFlushRecordingQueue = () => retryRecordingFlush(true);
      window.__testPendingRecordingCount = async () => (await pendingRecordingChunks()).length;
      window.__testRecordingState = () => ({ active: !!interviewRecorder, state: interviewRecorder?.state, dropped: recordingDataDropped, segment: recordingSegmentId });
      window.__testInterviewRecordingFormat = { select: selectInterviewRecordingMimeType, describe: describeInterviewRecordingFormat };
      if (window.failure !== "runtime") startInterview = async () => { window.starts++; };
      else {
        const originalControl = handleControlMessage;
        handleControlMessage = payload => {
          originalControl(payload);
          if (payload.type === "interview_started") window.starts++;
        };
      }
    ` });
  });
  await page.goto("/interview.html?id=sub-1");
  await expect(page.getByRole("button", { name: "Start AI Interview", exact: true })).toBeVisible();
  await expect(page.locator("#pj-join-btn")).toBeDisabled();
  await page.locator("#recording-consent").check();
  await expect(page.locator("#pj-join-btn")).toBeEnabled();
  return {
    counts,
    recover: async () => { failed = ""; await page.evaluate(() => { (window as any).failure = ""; }); },
  };
}

async function completeScreenSharing(page: Page) {
  await expect.poll(async () => {
    if (await page.locator("#pj-panel-3").isVisible() && await page.locator("#pj-share-allow").isEnabled()) return true;
    if (await page.locator("#call-screen").isVisible()) return true;
    for (const id of ["#pj-cam-retry", "#pj-mic-retry", "#pj-photo-capture", "#pj-network-retry"]) {
      if (await page.locator(id).isVisible() && await page.locator(id).isEnabled()) return true;
    }
    return false;
  }, {timeout:15000}).toBe(true);
  if (!await page.locator("#pj-panel-3").isVisible()) return;
  await expect(page.locator("#pj-share-allow")).toBeEnabled();
  await page.locator("#pj-share-allow").click();
  await startInFullscreen(page);
}

// Choosing a screen in the share picker leaves full screen, so the interview
// starts from one more explicit click that requests it.
async function startInFullscreen(page: Page) {
  const start = page.locator("#pj-fullscreen-start");
  await expect.poll(async () => {
    if (await start.isVisible() || await page.locator("#call-screen").isVisible() || await page.locator("#pj-share-allow").isVisible()) return true;
    // A check can also fail once sharing is done; its retry button is a final state too.
    for (const id of ["#pj-cam-retry", "#pj-mic-retry", "#pj-photo-capture", "#pj-network-retry"]) {
      if (await page.locator(id).isVisible()) return true;
    }
    return false;
  }, { timeout: 15000 }).toBe(true);
  if (await start.isVisible()) await start.click();
}

test("recording disclosure requires explicit consent before interview setup starts", async ({ page }) => {
  const { counts } = await prepare(page);
  await page.locator("#recording-consent").uncheck();
  await expect(page.locator("#pj-join-btn")).toBeDisabled();
  expect(counts).toEqual({ create: 0, identity: 0, readiness: 0, preflight: 0 });
});

test("permissions and identity are preserved through explicit screen-sharing steps", async ({ page }) => {
  const { counts } = await prepare(page);
  expect(counts.create).toBe(0);
  expect(await page.evaluate(() => (window as any).mediaCalls.length)).toBe(0);
  await page.getByRole("button", { name: "Start AI Interview", exact: true }).click();
  await completeScreenSharing(page);
  await expect.poll(() => page.evaluate(() => (window as any).starts), { timeout: 15_000 }).toBe(1);
  expect(counts).toEqual({ create: 1, identity: 1, readiness: 1, preflight: 1 });
  expect(await page.evaluate(() => (window as any).shares)).toBe(1);
  expect(await page.evaluate(() => (window as any).mediaCalls.length)).toBe(1);
});

test("consented recording aggregates queued chunks and uploads multipart bytes directly to storage", async ({ page }) => {
  await prepare(page);
  const calls: { start?: any; part?: number; put?: number; options?: number; finalize?: any } = {};
  await page.route("**/recording/start", async route => {
    calls.start = route.request().postDataJSON();
    await route.fulfill({ json: { status: "recording" } });
  });
  await page.route("**/recording/parts/*/*/authorize", async route => {
    calls.part = Number(new URL(route.request().url()).pathname.split("/").slice(-2, -1)[0]);
    await route.fulfill({ json: { url: "https://r2.invalid/signed-part" } });
  });
  await page.route("https://r2.invalid/**", async route => {
    const origin = route.request().headers().origin || "http://127.0.0.1:4173";
    if (route.request().method() === "OPTIONS") {
      calls.options = (calls.options || 0) + 1;
      await route.fulfill({ status: 200, headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "PUT",
        "access-control-allow-headers": "content-type",
        "access-control-expose-headers": "ETag",
      } });
      return;
    }
    calls.put = (calls.put || 0) + 1;
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataBuffer()?.byteLength || 0).toBeGreaterThan(0);
    await route.fulfill({ status: 200, headers: {
      etag: '"test-etag"', "access-control-allow-origin": origin,
      "access-control-expose-headers": "ETag",
    } });
  });
  await page.route("**/recording/finalize", async route => {
    calls.finalize = route.request().postDataJSON();
    await route.fulfill({ json: { status: "processing" } });
  });
  await page.evaluate(async () => {
    const input = document.createElement("canvas"); input.width = 640; input.height = 360;
    const inputContext = input.getContext("2d")!;
    inputContext.fillStyle = "#7340e8"; inputContext.fillRect(0, 0, 640, 360);
    const inputStream = input.captureStream(15);
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const destination = audioContext.createMediaStreamDestination();
    oscillator.connect(destination); oscillator.start(); await audioContext.resume();
    (window as any).__testRecordingSetup("recording-test-session", inputStream, destination);
  });
  await page.evaluate(() => (window as any).__testStartRecording());
  await page.evaluate(() => (window as any).__testEmitRecordingChunk(new Blob([new Uint8Array([1, 2, 3])], { type: "video/webm" })));
  await page.evaluate(() => (window as any).__testSaveRecordingQueue());
  await page.evaluate(() => (window as any).__testStopRecording(true));
  expect(calls.start).toMatchObject({ consent: true, mime_type: "video/webm", extension: "webm" });
  expect(calls.part).toBe(1);
  expect(calls.put).toBe(1);
  expect(calls.finalize?.parts).toEqual([{ PartNumber: 1, ETag: '"test-etag"' }]);
  expect(calls.finalize?.duration_seconds).toEqual(expect.any(Number));
});

test("interrupted placement interview explains the proctor stop and finalizes its recording", async ({ page }) => {
  await prepare(page);
  let finalized: any;
  await page.route("**/recording/start", route => route.fulfill({ json: { status: "recording" } }));
  await page.route("**/recording/parts/*/*/authorize", route => route.fulfill({ json: { url: "https://r2.invalid/signed-part" } }));
  await page.route("https://r2.invalid/**", async route => {
    const origin = route.request().headers().origin || "http://127.0.0.1:5175";
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 200, headers: { "access-control-allow-origin": origin, "access-control-allow-methods": "PUT", "access-control-allow-headers": "content-type", "access-control-expose-headers": "ETag" } });
      return;
    }
    await route.fulfill({ status: 200, headers: { etag: '"stop-etag"', "access-control-allow-origin": origin, "access-control-expose-headers": "ETag" } });
  });
  await page.route("**/recording/finalize", async route => {
    finalized = route.request().postDataJSON();
    await route.fulfill({ json: { status: "processing" } });
  });
  await page.evaluate(async () => {
    const input = document.createElement("canvas"); input.width = 640; input.height = 360;
    const inputStream = input.captureStream(15);
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const destination = audioContext.createMediaStreamDestination();
    oscillator.connect(destination); oscillator.start(); await audioContext.resume();
    (window as any).__testRecordingSetup("interrupted-session", inputStream, destination);
  });
  await page.evaluate(() => (window as any).__testStartRecording());
  await page.waitForTimeout(1200);
  await page.evaluate(() => (window as any).__testEmitRecordingChunk(new Blob([new Uint8Array([7, 8, 9])], { type: "video/webm" })));
  await page.evaluate(() => (window as any).__testSaveRecordingQueue());
  expect(await page.evaluate(() => (window as any).__testRecordingState())).toMatchObject({ active: true, dropped: false, segment: expect.any(String) });
  expect(await page.evaluate(() => (window as any).__testPendingRecordingCount())).toBe(1);
  await page.evaluate(() => (window as any).__testControlMessage({
    type: "session_incomplete", reason: "proctor_terminated", completed_rounds: 1, required_rounds: 4,
    detail: "The placement interview ended because multiple people were detected in view. Placement staff can review the recorded event.",
  }));
  await expect(page.locator("#incomplete-message")).toContainText("multiple people were detected in view");
  await page.evaluate(() => (window as any).__testStopRecording(true));
  await expect.poll(() => finalized?.parts?.length || 0).toBeGreaterThan(0);
});

test("recording chunks persist while an earlier R2 upload is still in progress", async ({ page }) => {
  await prepare(page);
  let releaseUpload!: () => void;
  let uploadStarted!: () => void;
  const uploadGate = new Promise<void>(resolve => { releaseUpload = resolve; });
  const started = new Promise<void>(resolve => { uploadStarted = resolve; });
  await page.route("**/recording/start", route => route.fulfill({ json: { status: "recording" } }));
  await page.route("**/recording/parts/*/*/authorize", route => route.fulfill({ json: { url: "https://r2.invalid/signed-part" } }));
  await page.route("https://r2.invalid/**", async route => {
    const origin = route.request().headers().origin || "http://127.0.0.1:5175";
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 200, headers: { "access-control-allow-origin": origin, "access-control-allow-methods": "PUT", "access-control-allow-headers": "content-type", "access-control-expose-headers": "ETag" } });
      return;
    }
    uploadStarted();
    await uploadGate;
    await route.fulfill({ status: 200, headers: { etag: '"ordered-etag"', "access-control-allow-origin": origin, "access-control-expose-headers": "ETag" } });
  });
  await page.evaluate(async () => {
    const input = document.createElement("canvas"); input.width = 640; input.height = 360;
    const inputStream = input.captureStream(15);
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const destination = audioContext.createMediaStreamDestination();
    oscillator.connect(destination); oscillator.start(); await audioContext.resume();
    (window as any).__testRecordingSetup("parallel-upload-session", inputStream, destination);
  });
  await page.evaluate(() => (window as any).__testStartRecording());
  await page.evaluate(() => (window as any).__testEmitRecordingChunk(new Blob([new Uint8Array([1, 2, 3])], { type: "video/webm" })));
  await page.evaluate(() => (window as any).__testSaveRecordingQueue());
  await page.evaluate(() => { (window as any).__testFlush = (window as any).__testFlushRecordingQueue(); });
  await started;
  await page.evaluate(() => (window as any).__testEmitRecordingChunk(new Blob([new Uint8Array([4, 5, 6])], { type: "video/webm" })));
  await page.evaluate(() => (window as any).__testSaveRecordingQueue());
  expect(await page.evaluate(() => (window as any).__testPendingRecordingCount())).toBe(2);
  releaseUpload();
  await page.evaluate(() => (window as any).__testFlush);
});

test("recording format selection supports Chromium WebM and Safari MP4 fallback", async ({ page }) => {
  await prepare(page);
  const formats = await page.evaluate(() => {
    const helpers = (window as any).__testInterviewRecordingFormat;
    const webm = helpers.select((type: string) => type.startsWith("video/webm"));
    const safari = helpers.select((type: string) => type.startsWith("video/mp4"));
    return { webm: helpers.describe(webm), safari: helpers.describe(safari) };
  });
  expect(formats.webm).toEqual({ mimeType: "video/webm", extension: "webm", codec: "vp8,opus" });
  expect(formats.safari).toEqual({ mimeType: "video/mp4", extension: "mp4", codec: "h264,aac" });
});

for (const [failure, retry, panel] of [
  ["camera", "#pj-cam-retry", "#pj-panel-1"],
  ["microphone", "#pj-mic-retry", "#pj-panel-2"],
  ["identity", "#pj-photo-capture", "#pj-photo-verification"],
  ["network", "#pj-network-retry", "#pj-network-panel"],
  ["screen", "#pj-share-allow", "#pj-panel-3"],
  ["window", "#pj-share-allow", "#pj-panel-3"],
]) {
  test(`${failure} failure blocks creation and retry preserves successful checks`, async ({ page }) => {
    const { counts, recover } = await prepare(page, failure);
    await page.getByRole("button", { name: "Start AI Interview", exact: true }).click();
  await completeScreenSharing(page);
    await expect(page.locator(retry)).toBeEnabled();
    await expect(page.locator(panel)).toBeVisible();
    expect(counts.create).toBe(0);
    await expect(page.locator("#pj-join-btn")).toBeHidden();
    for (const other of ["#pj-panel-1", "#pj-panel-2", "#pj-photo-verification", "#pj-network-panel", "#pj-panel-3"]) {
      if (other !== panel) await expect(page.locator(other)).toBeHidden();
    }
    const before = { ...counts };
    const mediaBefore = await page.evaluate(() => (window as any).mediaCalls.length);
    await recover();
    await page.locator(retry).click();
    await completeScreenSharing(page);
    await expect.poll(() => page.evaluate(() => (window as any).starts), {timeout:15000}).toBe(1);
    expect(counts.create).toBe(1);
    expect(counts.preflight).toBe(1);
    expect(counts.readiness).toBe(before.readiness + (failure === "network" ? 1 : 0));
    expect(counts.identity).toBe(before.identity + (["camera", "identity"].includes(failure) ? 1 : 0));
    expect(await page.evaluate(() => (window as any).mediaCalls.length)).toBe(mediaBefore + (["camera", "microphone"].includes(failure) ? 1 : 0));
  });
}


test("a service connection failure after readiness returns to the failed check and reuses preparation", async ({ page }) => {
  const { counts, recover } = await prepare(page, "runtime");
  await page.getByRole("button", { name: "Start AI Interview", exact: true }).click();
  await completeScreenSharing(page);
  await expect(page.locator("#pj-network-retry")).toBeVisible();
  expect(counts.create).toBe(1);
  expect(await page.evaluate(() => (window as any).starts)).toBe(0);
  await recover();
  await page.locator("#pj-network-retry").click();
  await expect.poll(() => page.evaluate(() => (window as any).starts), {timeout:15000}).toBe(1);
  expect(counts).toEqual({ create: 2, identity: 1, readiness: 2, preflight: 1 });
  expect(await page.evaluate(() => (window as any).mediaCalls.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).shares)).toBe(1);
});


test("failed controls remain reachable on a short mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 620 });
  await prepare(page, "camera");
  await page.getByRole("button", { name: "Start AI Interview", exact: true }).click();
  await completeScreenSharing(page);
  await expect(page.locator("#pj-cam-retry")).toBeEnabled();
  await page.locator("#pj-cam-retry").scrollIntoViewIfNeeded();
  await expect(page.locator("#pj-cam-retry")).toBeInViewport();
  await page.locator("#preflight-title").scrollIntoViewIfNeeded();
  await expect(page.locator("#preflight-title")).toBeInViewport();
});

test("recording retries through authenticated API when direct storage upload fails", async ({ page }) => {
  await prepare(page);
  const calls: { start?: any; part?: number; put?: number; options?: number; finalize?: any } = {};
  await page.route("**/recording/start", async route => {
    calls.start = route.request().postDataJSON();
    await route.fulfill({ json: { status: "recording" } });
  });
  await page.route("**/recording/parts/*/*/authorize", async route => {
    calls.part = Number(new URL(route.request().url()).pathname.split("/").slice(-2, -1)[0]);
    await route.fulfill({ json: { url: "https://r2.invalid/signed-part" } });
  });
  await page.route("https://r2.invalid/**", route => route.abort());
  await page.route("**/recording/parts/*/*", async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    calls.put = (calls.put || 0) + 1;
    expect(route.request().postDataBuffer()?.byteLength || 0).toBeGreaterThan(0);
    await route.fulfill({json:{ETag:'"test-etag"'}});
  });
  await page.route("**/recording/finalize", async route => {
    calls.finalize = route.request().postDataJSON();
    await route.fulfill({ json: { status: "processing" } });
  });
  await page.evaluate(async () => {
    const input = document.createElement("canvas"); input.width = 640; input.height = 360;
    const inputContext = input.getContext("2d")!;
    inputContext.fillStyle = "#7340e8"; inputContext.fillRect(0, 0, 640, 360);
    const inputStream = input.captureStream(15);
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const destination = audioContext.createMediaStreamDestination();
    oscillator.connect(destination); oscillator.start(); await audioContext.resume();
    (window as any).__testRecordingSetup("recording-test-session", inputStream, destination);
  });
  await page.evaluate(() => (window as any).__testStartRecording());
  await page.evaluate(() => (window as any).__testEmitRecordingChunk(new Blob([new Uint8Array([1, 2, 3])], { type: "video/webm" })));
  await page.evaluate(() => (window as any).__testSaveRecordingQueue());
  await page.evaluate(() => (window as any).__testStopRecording(true));
  expect(calls.start).toMatchObject({ consent: true, mime_type: "video/webm", extension: "webm" });
  expect(calls.part).toBe(1);
  expect(calls.put).toBe(1);
  expect(calls.finalize?.parts).toEqual([{ PartNumber: 1, ETag: '"test-etag"' }]);
  expect(calls.finalize?.duration_seconds).toEqual(expect.any(Number));
});


test("video finalization retries an ended-status race without discarding uploaded parts",async({page})=>{
  await prepare(page);let attempts=0,failed=0;
  await page.route("**/recording/start",route=>route.fulfill({json:{status:'recording'}}));
  await page.route("**/recording/parts/*/*/authorize",route=>route.fulfill({json:{url:'https://r2.invalid/part'}}));
  await page.route("https://r2.invalid/**",route=>route.abort());
  await page.route(/\/recording\/parts\/[^/]+\/\d+$/,route=>route.fulfill({json:{ETag:'saved-etag'}}));
  await page.route("**/recording/fail",route=>{failed++;return route.fulfill({json:{status:'failed'}});});
  await page.route("**/recording/finalize",route=>{attempts++;return attempts===1?route.fulfill({status:409,json:{detail:'This interview must end before its recording can be finalized.'}}):route.fulfill({json:{status:'processing'}});});
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;
    const stream=canvas.captureStream(15),audio=new AudioContext(),destination=audio.createMediaStreamDestination();
    const oscillator=audio.createOscillator();oscillator.connect(destination);oscillator.start();await audio.resume();
    (window as any).__testRecordingSetup('race-session',stream,destination);
  });
  await page.evaluate(()=>(window as any).__testStartRecording());
  await page.evaluate(()=>(window as any).__testEmitRecordingChunk(new Blob([new Uint8Array([1,2,3])],{type:'video/webm'})));
  await page.evaluate(()=>(window as any).__testSaveRecordingQueue());
  await page.evaluate(()=>(window as any).__testStopRecording(true));
  expect(attempts).toBe(2);expect(failed).toBe(0);
});

test('temporary finalization failure retries automatically without reuploading confirmed video parts',async({page})=>{
  await prepare(page);let finalized=0,uploads=0;
  await page.route('**/recording/start',route=>route.fulfill({json:{status:'recording'}}));
  await page.route('**/recording/parts/*/*/authorize',route=>route.fulfill({json:{url:'https://r2.invalid/retry'}}));
  await page.route('https://r2.invalid/**',route=>route.abort());
  await page.route(/\/recording\/parts\/[^/]+\/\d+$/,route=>{uploads++;return route.fulfill({json:{ETag:'retry-etag'}});});
  await page.route('**/recording/finalize',route=>{finalized++;return finalized===1?route.fulfill({status:503,json:{detail:'Temporary storage error'}}):route.fulfill({json:{status:'processing'}});});
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;
    const audio=new AudioContext(),destination=audio.createMediaStreamDestination(),oscillator=audio.createOscillator();oscillator.connect(destination);oscillator.start();await audio.resume();
    (window as any).__testRecordingSetup('auto-retry-session',canvas.captureStream(15),destination);
  });
  await page.evaluate(()=>(window as any).__testStartRecording());
  await page.evaluate(()=>(window as any).__testEmitRecordingChunk(new Blob([new Uint8Array([1,2,3])],{type:'video/webm'})));
  await page.evaluate(()=>(window as any).__testSaveRecordingQueue());
  await page.evaluate(()=>(window as any).__testStopRecording(true));
  expect(finalized).toBe(1);
  await expect.poll(()=>finalized,{timeout:22000}).toBe(2);
  expect(uploads).toBe(1);
  expect(await page.evaluate(()=>(window as any).__testPendingRecordingCount())).toBe(0);
});


test("a silent default microphone is replaced by another one before the check fails", async ({page})=>{
 const {counts}=await prepare(page,"silent");
 await page.getByRole("button",{name:"Start AI Interview",exact:true}).click();
 await expect(page.locator("#pj-panel-2")).toContainText("No microphone audio was detected",{timeout:20000});
 expect(counts.create).toBe(0);
 await expect(page.locator("#pj-panel-2")).toBeVisible();
 const calls=await page.evaluate(()=>(window as any).mediaCalls);
 // The default is tried first, then each other microphone, before failing.
 expect(calls).toHaveLength(2);expect(calls[0].audio.deviceId).toEqual({ideal:"default"});
 expect(calls[1].audio.deviceId).toEqual({exact:"microphone-1"});
});

test("setup and microphone recovery stay aligned on desktop and mobile",async({page})=>{
 await page.setViewportSize({width:1280,height:800});await prepare(page,"microphone");
 await expect(page.locator('.recording-consent')).toHaveCSS('display','flex');
 await page.screenshot({path:'/root/voicedots/artifacts/interview-camera-frame-20261008/setup-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Start AI Interview',exact:true}).click();
  await completeScreenSharing(page);
 await expect(page.locator('#pj-mic-retry')).toBeEnabled();
 await expect(page.locator('#lobby-video')).toHaveCSS('object-fit','contain');
 const preview=await page.locator('#cam-preview').boundingBox();
 expect(preview!.width / preview!.height).toBeCloseTo(4 / 3, 1);
 await expect(page.locator('#mic-select')).toHaveValue('');
 await page.screenshot({path:'/root/voicedots/artifacts/interview-camera-frame-20261008/microphone-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 await page.screenshot({path:'/root/voicedots/artifacts/interview-camera-frame-20261008/microphone-mobile.png',fullPage:true});
});

test('practice start and reconnect never start video recording', async ({page}) => {
  await prepare(page);
  let starts=0;
  await page.route('**/recording/start',route=>{starts++;return route.fulfill({json:{status:'recording'}});});
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
    const context=new AudioContext();const destination=context.createMediaStreamDestination();
    (window as any).__testRecordingSetup('practice-session',canvas.captureStream(15),destination);
    (window as any).__testControlMessage({type:'interview_started',recording_enabled:false,total_rounds:1});
    (window as any).__testControlMessage({type:'resume_state',completed_rounds:[],turns_completed:1});
    await (window as any).__testStartRecording();
  });
  await expect.poll(()=>page.evaluate(()=>(window as any).__testRecordingState().active)).toBe(false);
  expect(starts).toBe(0);
});


test("screen capture requires a fresh click without the removed remote-app warning", async ({page}) => {
  const {counts} = await prepare(page);
  await page.locator("#pj-join-btn").click();
  await expect(page.locator("#pj-share-allow")).toBeEnabled();
  expect(counts.create).toBe(0);
  expect(await page.evaluate(()=>(window as any).shares)).toBe(0);
  await expect(page.locator("#pj-environment-panel")).toHaveCount(0);
  await expect(page.locator("#prejoin-screen")).not.toContainText("remote-control apps");
  await page.locator("#pj-share-allow").click();
  await startInFullscreen(page);
  await expect.poll(()=>counts.create).toBe(1);
  expect(counts.identity).toBe(1);
});


test("the interview starts only from an explicit full-screen click after screen sharing", async ({page}) => {
  const {counts} = await prepare(page);
  await page.locator("#pj-join-btn").click();
  await expect(page.locator("#pj-share-allow")).toBeEnabled();
  // The browser picker exits full screen when a screen is chosen.
  await page.evaluate(() => Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null }));
  await page.evaluate(() => { const original = Element.prototype.requestFullscreen; (window as any).fullscreenRequests = 0;
    Element.prototype.requestFullscreen = async function () { (window as any).fullscreenRequests++; Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => this }); return original?.call(this); }; });
  await page.locator("#pj-share-allow").click();
  const start = page.getByRole("button", { name: "Enter full screen and start" });
  await expect(start).toBeVisible();
  await expect(page.locator("#preflight-status")).toContainText("All checks passed");
  expect(counts.create).toBe(0);
  await start.click();
  await expect.poll(() => counts.create).toBe(1);
  expect(await page.evaluate(() => (window as any).fullscreenRequests)).toBe(1);
});


test("completed placement reload recovers its final local video chunk", async ({page})=>{
  await prepare(page);
  let uploaded=0, finalParts:any[]=[];
  await page.route("**/api/interview/recovery-session",route=>route.fulfill({json:{status:"completed",turns:[{agent_type:"hr"}]}}));
  await page.route("**/recording/parts/*/*/authorize",route=>route.fulfill({json:{url:"https://r2.invalid/recovery"}}));
  await page.route("https://r2.invalid/**",route=>route.abort());
  await page.route(/\/recording\/parts\/[^/]+\/\d+$/,route=>{uploaded=route.request().postDataBuffer()?.length || 0;return route.fulfill({json:{ETag:"recovered-etag"}});});
  await page.route("**/recording/finalize",route=>{finalParts=route.request().postDataJSON().parts;return route.fulfill({json:{status:"processing"}});});
  await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open("voicedots-interview-recording-v1",1);r.onupgradeneeded=()=>{r.result.createObjectStore("meta",{keyPath:"id"});r.result.createObjectStore("chunks",{keyPath:"id"});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction(["meta","chunks"],"readwrite");
      tx.objectStore("meta").put({id:"recovery-session:segment",session:"recovery-session",segment:"segment",startedAt:Date.now()-20000,duration:20,mimeType:"video/webm",nextPart:1,parts:[]});
      tx.objectStore("chunks").put({id:"recovery-session:segment:0",session:"recovery-session",segment:"segment",sequence:0,createdAt:Date.now(),blob:new Blob([new Uint8Array(1024)],{type:"video/webm"})});
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });db.close();
  });
  await page.goto("/interview.html?id=sub-1&session_id=recovery-session");
  await expect.poll(()=>uploaded).toBe(1024);
  await expect.poll(()=>finalParts.length).toBe(1);
  expect(finalParts[0].ETag || finalParts[0].etag).toBe("recovered-etag");
  await expect(page.locator("#results-recording-status")).toContainText("processing");
  await expect(page.locator("#prejoin-screen")).toBeHidden();
});

// Simulates the face tracker: a live person follows the arrow prompts; a
// photo or replay stays still.
async function simulateFace(page: Page, mode: "live" | "still") {
  await page.evaluate((mode) => {
    const face = (nose: number) => { const points = Array.from({ length: 264 }, () => ({ x: .5, y: .5 })); points[33] = { x: .4, y: .45 }; points[263] = { x: .6, y: .45 }; points[1] = { x: nose, y: .55 }; return points; };
    (window as any).__testFace(face(.5));
    setInterval(() => {
      const side = document.getElementById("pf-liveness")?.dataset.side;
      const nose = mode === "still" || document.getElementById("pf-liveness")?.hidden ? .5 : side === "left" ? .57 : side === "right" ? .43 : .5;
      (window as any).__testFace(face(nose));
    }, 60);
  }, mode);
}

for (const [width, height] of [[1440, 1000], [390, 844]]) {
  test(`liveness arrow stays in view with checklist at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await prepare(page);
    await simulateFace(page, "still");
    await page.getByRole("button", { name: "Start AI Interview", exact: true }).click();
    await expect(page.locator("#pf-liveness")).toBeVisible();
    const camera = await page.locator("#cam-preview").boundingBox();
    const checklist = await page.locator("#pf-steps").boundingBox();
    const arrow = await page.locator("#pf-liveness .pf-arrow").boundingBox();
    expect(camera).not.toBeNull(); expect(checklist).not.toBeNull(); expect(arrow).not.toBeNull();
    if (width >= 960) expect(checklist!.x + checklist!.width).toBeLessThanOrEqual(camera!.x);
    else expect(camera!.y + camera!.height).toBeLessThanOrEqual(checklist!.y);
    expect(arrow!.y).toBeGreaterThanOrEqual(0);
    expect(arrow!.y + arrow!.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: `../.local/ui/preflight-${width}.png`, fullPage: true });
  });
}

test("environment microphone waveform follows detected audio and settles in silence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await prepare(page);
  await simulateFace(page, "still");
  await page.getByRole("button", { name: "Start AI Interview", exact: true }).click();
  const meter = page.locator("#mic-activity");
  await expect(meter).toHaveAttribute("data-signal", "active");
  await expect(page.locator("#mic-activity-label")).toHaveText("Voice detected");
  await expect.poll(() => meter.locator(".pf-mic-bar").evaluateAll(bars => Math.max(...bars.map(bar => parseFloat((bar as HTMLElement).style.height))))).toBeGreaterThan(8);
  await page.evaluate(() => { (window as any).environmentMicGain.gain.value = 0; });
  await expect(meter).toHaveAttribute("data-signal", "quiet");
  await expect(page.locator("#mic-activity-label")).toHaveText("Listening for your voice");
  await expect.poll(() => meter.locator(".pf-mic-bar").evaluateAll(bars => Math.max(...bars.map(bar => parseFloat((bar as HTMLElement).style.height))))).toBeLessThan(5);
  await page.evaluate(() => { (window as any).environmentMicGain.gain.value = .2; });
  await expect(meter).toHaveAttribute("data-signal", "active");
  await expect.poll(() => meter.locator(".pf-mic-bar").evaluateAll(bars => Math.max(...bars.map(bar => parseFloat((bar as HTMLElement).style.height))))).toBeGreaterThan(14);
  await page.screenshot({ path: "../.local/ui/environment-microphone.png", fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await meter.locator(".pf-mic-bar").first().evaluate(bar => getComputedStyle(bar).height)).toBe("4px");
});

test("a live person passes liveness by following the arrows, and the checklist shows every check", async ({ page }) => {
  const { counts } = await prepare(page);
  await simulateFace(page, "live");
  await page.getByRole("button", { name: "Start AI Interview", exact: true }).click();
  const steps = page.locator("#pf-steps li");
  await expect(steps).toHaveCount(7);
  await expect(page.locator('#pf-steps [data-check="liveness"]')).toHaveAttribute("data-state", "passed", { timeout: 15000 });
  await expect(page.locator('#pf-steps [data-check="noise"]')).toHaveAttribute("data-state", "passed");
  await expect(page.locator('#pf-steps [data-check="noise"] small')).toContainText(/Quiet enough · about \d+ dB/);
  await completeScreenSharing(page);
  await expect.poll(() => counts.create).toBe(1);
});

test("a still photo or replay fails liveness and blocks the interview", async ({ page }) => {
  const { counts } = await prepare(page);
  await simulateFace(page, "still");
  await page.getByRole("button", { name: "Start AI Interview", exact: true }).click();
  await expect(page.locator("#pj-liveness-panel")).toContainText("couldn't confirm a live person", { timeout: 15000 });
  await expect(page.locator('#pf-steps [data-check="liveness"]')).toHaveAttribute("data-state", "failed");
  await expect(page.locator('#pf-steps [data-check="identity"]')).toHaveAttribute("data-state", "pending");
  expect(counts.identity).toBe(0);
  expect(counts.create).toBe(0);
});

test("a noisy room blocks the interview with its noise level until it is quiet", async ({ page }) => {
  const { counts, recover } = await prepare(page, "noisy");
  await page.getByRole("button", { name: "Start AI Interview", exact: true }).click();
  await expect(page.locator("#pj-noise-panel")).toContainText(/too noisy \(about \d+ dB\)/, { timeout: 15000 });
  await expect(page.locator('#pf-steps [data-check="noise"]')).toHaveAttribute("data-state", "failed");
  expect(counts.create).toBe(0);
  await recover();
  await page.getByRole("button", { name: "Measure again" }).click();
  await expect(page.locator('#pf-steps [data-check="noise"]')).toHaveAttribute("data-state", "passed", { timeout: 15000 });
  await completeScreenSharing(page);
  await expect.poll(() => counts.create).toBe(1);
});

test("duplicate Windows microphone entries are shown once and a working one is chosen automatically", async ({ page }) => {
  const { counts } = await prepare(page, "silent");
  // Windows lists one headset three times; only the laptop microphone picks up sound.
  await page.evaluate(() => {
    const w = window as any;
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: "videoinput", deviceId: "camera-1", label: "Camera", groupId: "g-cam" },
      { kind: "audioinput", deviceId: "default", label: "Default - Headset Mic (USB)", groupId: "g-headset" },
      { kind: "audioinput", deviceId: "communications", label: "Communications - Headset Mic (USB)", groupId: "g-headset" },
      { kind: "audioinput", deviceId: "headset", label: "Headset Mic (USB)", groupId: "g-headset" },
      { kind: "audioinput", deviceId: "laptop", label: "Laptop Mic (Realtek)", groupId: "g-laptop" },
    ] as MediaDeviceInfo[];

    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints: any = {}) => {
      const exact = constraints.audio?.deviceId?.exact;
      w.failure = exact === "laptop" ? "" : (exact || constraints.video) ? "silent" : w.failure;
      return original(constraints);
    };
  });
  await page.getByRole("button", { name: "Start AI Interview", exact: true }).click();
  await expect(page.locator('#pf-steps [data-check="microphone"]')).toHaveAttribute("data-state", "passed", { timeout: 20000 });
  await expect(page.locator("#mic-select option")).toHaveText(["System default (Headset Mic (USB))", "Headset Mic (USB)", "Laptop Mic (Realtek)"]);
  await expect(page.locator("#mic-select")).toHaveValue("laptop");
  await completeScreenSharing(page);
  await expect.poll(() => counts.create).toBe(1);
});
