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
      expect(route.request().postDataJSON().captures).toHaveLength(3);
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
    navigator.mediaDevices.getUserMedia = async (constraints = {}) => {
      w.mediaCalls.push(constraints);
      if (constraints.video && w.failure === "camera") throw new DOMException("Camera denied", "NotAllowedError");
      const tracks: MediaStreamTrack[] = [];
      if (constraints.video) tracks.push(videoTrack());
      if (constraints.audio) {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        oscillator.frequency.value = 440;
        const gain = context.createGain();
        gain.gain.value = w.failure === "microphone" ? 0 : .8;
        const destination = context.createMediaStreamDestination();
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        await context.resume();
        tracks.push(...destination.stream.getAudioTracks());
      }
      return new MediaStream(tracks);
    };
    navigator.mediaDevices.getDisplayMedia = async () => {
      w.shares++;
      if (w.failure === "screen") throw new DOMException("Share cancelled", "NotAllowedError");
      const track = videoTrack();
      track.getSettings = () => ({ displaySurface: w.failure === "window" ? "window" : "monitor" });
      return new MediaStream([track]);
    };
    Element.prototype.requestFullscreen = async () => {};
  }, { failure });
  await page.route("**/interview.js*", async route => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({ response, body: source + `
      startCameraAnalysis = async () => {
        setInterval(() => {
          cameraAnalysisPassing = hasLiveTrack("video") && lobbyVideoEl.readyState >= 2;
          const instruction = document.getElementById("preflight-status").textContent;
          preflightYaw = cameraAnalysisPassing ? (instruction.includes("turn your head") ? .35 : 0) : null;
          preflightYawAt = Date.now();
        }, 60);
      };
      const originalWait = waitForPreflight;
      waitForPreflight = (check, message) => originalWait(check, message, 1800);
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
  return {
    counts,
    recover: async () => { failed = ""; await page.evaluate(() => { (window as any).failure = ""; }); },
  };
}

test("one click checks permissions and identity before creating the session, with no preflight STT", async ({ page }) => {
  const { counts } = await prepare(page);
  expect(counts.create).toBe(0);
  expect(await page.evaluate(() => (window as any).mediaCalls.length)).toBe(0);
  await page.getByRole("button", { name: "Start AI Interview", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).starts)).toBe(1);
  expect(counts).toEqual({ create: 1, identity: 1, readiness: 1, preflight: 1 });
  expect(await page.evaluate(() => (window as any).shares)).toBe(1);
  expect(await page.evaluate(() => (window as any).mediaCalls.length)).toBe(1);
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
    await expect.poll(() => page.evaluate(() => (window as any).starts)).toBe(1);
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
  await expect(page.locator("#pj-network-retry")).toBeVisible();
  expect(counts.create).toBe(1);
  expect(await page.evaluate(() => (window as any).starts)).toBe(0);
  await recover();
  await page.locator("#pj-network-retry").click();
  await expect.poll(() => page.evaluate(() => (window as any).starts)).toBe(1);
  expect(counts).toEqual({ create: 2, identity: 1, readiness: 2, preflight: 1 });
  expect(await page.evaluate(() => (window as any).mediaCalls.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).shares)).toBe(1);
});


test("failed controls remain reachable on a short mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 620 });
  await prepare(page, "camera");
  await page.getByRole("button", { name: "Start AI Interview", exact: true }).click();
  await expect(page.locator("#pj-cam-retry")).toBeEnabled();
  await page.locator("#pj-cam-retry").scrollIntoViewIfNeeded();
  await expect(page.locator("#pj-cam-retry")).toBeInViewport();
  await page.locator("#preflight-title").scrollIntoViewIfNeeded();
  await expect(page.locator("#preflight-title")).toBeInViewport();
});
