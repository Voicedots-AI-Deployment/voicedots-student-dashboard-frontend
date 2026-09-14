import { test, expect, type Page } from "@playwright/test";

async function harness(page: Page, enabled = true, monitor = false) {
  await page.route("**/interview.js*", (route) => route.abort());
  await page.goto("/interview.html");
  await page.evaluate(async ({ enabled, monitor }) => {
    const w = window as any;
    w.cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => { w.cameraRequests++; throw new Error("Must reuse current stream"); };
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 480;
    canvas.getContext("2d")!.fillRect(0, 0, 640, 480);
    const video = document.createElement("video");
    video.muted = true; video.autoplay = true;
    video.srcObject = canvas.captureStream(10);
    document.body.append(video);
    await video.play();
    w.existingVideo = video;
    w.photoRequests = [];
    w.photoUpdates = [];
    w.matchNext = true;
    w.delayNext = false;
    // @ts-expect-error The runtime helper is a browser-native public module.
    const { createFeedPhotoVerifier } = await import("/feed-photo-verifier.js");
    w.verifier = createFeedPhotoVerifier({
      getVideo: () => video,
      apiBase: "http://localhost",
      onChange: (state: any) => { w.photoUpdates.push(state); },
      request: async (url: string, options: any) => {
        w.photoRequests.push({ url, body: options?.body });
        if (options?.signal) options.signal.addEventListener("abort", () => { w.aborted = true; });
        if (url.endsWith("photo-verification")) return new Response(JSON.stringify({ enabled, reference_ready: false, monitor_path: monitor ? "/ws/interview/session-1/face-monitor" : undefined }));
        if (w.delayNext) await new Promise((resolve) => { w.finishRequest = resolve; });
        return new Response(JSON.stringify({ verified: w.matchNext, reference_ready: true, message: "Frame mismatch" }));
      },
    });
    await w.verifier.load("session-1");
  }, { enabled, monitor });
}

test("captures existing video and checks periodic frames without reopening the camera", async ({ page }) => {
  await harness(page);
  expect(await page.evaluate(() => (window as any).verifier.isReady())).toBe(false);
  expect(await page.evaluate(() => (window as any).verifier.captureReference())).toBe(true);
  await page.clock.install();
  await page.evaluate(() => (window as any).verifier.start());
  await page.clock.runFor(15000);
  const requests = await page.evaluate(() => (window as any).photoRequests);
  expect(requests.map((r: any) => r.url.split("/").pop())).toEqual(["photo-verification", "photo-reference", "photo-check"]);
  expect(JSON.parse(requests[1].body).webcam_photo).toMatch(/^data:image\/jpeg;base64,/);
  expect(JSON.parse(requests[2].body).webcam_photo).toMatch(/^data:image\/jpeg;base64,/);
  expect(await page.evaluate(() => (window as any).cameraRequests)).toBe(0);
  await page.evaluate(() => (window as any).verifier.stop());
  await page.clock.runFor(45000);
  expect(await page.evaluate(() => (window as any).photoRequests.length)).toBe(3);
  // The verifier owns sampling, not the interview's camera track.
  expect(await page.evaluate(() => (window as any).existingVideo.srcObject.getVideoTracks()[0].readyState)).toBe("live");
});

test("a mismatch clears verified state and a later match recovers", async ({ page }) => {
  await harness(page);
  await page.evaluate(() => (window as any).verifier.captureReference());
  await page.clock.install();
  await page.evaluate(() => { (window as any).matchNext = false; (window as any).verifier.start(); });
  await page.clock.runFor(15000);
  expect(await page.evaluate(() => (window as any).verifier.isReady())).toBe(false);
  expect(await page.evaluate(() => (window as any).photoUpdates.at(-1).state)).toBe("mismatch");
  await page.evaluate(() => { (window as any).matchNext = true; });
  await page.clock.runFor(15000);
  expect(await page.evaluate(() => (window as any).verifier.isReady())).toBe(true);
});

test("stopping ignores late responses and aborts in-flight checks", async ({ page }) => {
  await harness(page);
  await page.evaluate(() => {
    (window as any).delayNext = true;
    void (window as any).verifier.captureReference();
  });
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishRequest)).toBe("function");
  await page.evaluate(() => { (window as any).verifier.stop(); (window as any).finishRequest(); });
  expect(await page.evaluate(() => (window as any).aborted)).toBe(true);
  expect(await page.evaluate(() => (window as any).verifier.isReady())).toBe(false);
});

test("camera replacement invalidates the local verification result", async ({ page }) => {
  await harness(page);
  await page.evaluate(() => (window as any).verifier.captureReference());
  expect(await page.evaluate(() => (window as any).verifier.isReady())).toBe(true);
  await page.evaluate(() => (window as any).verifier.invalidate());
  expect(await page.evaluate(() => (window as any).verifier.isReady())).toBe(false);
  await page.evaluate(() => (window as any).verifier.captureReference());
  expect(await page.evaluate(() => (window as any).verifier.isReady())).toBe(true);
});

test("disabled verification never captures or sends frames", async ({ page }) => {
  await harness(page, false);
  await page.clock.install();
  await page.evaluate(async () => {
    (window as any).verifier.start();
    await (window as any).verifier.verifyBeforeJoin();
  });
  await page.clock.runFor(45000);
  expect(await page.evaluate(() => (window as any).photoRequests.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).verifier.isReady())).toBe(true);
});

test("WebSocket monitoring reuses video, waits for each result, and stops cleanly", async ({ page }) => {
  let messages: string[] = [];
  let send: (message: string) => void = () => {};
  let connections = 0;
  await page.routeWebSocket('ws://localhost/ws/interview/session-1/face-monitor', socket => {
    connections++;
    send = message => socket.send(message);
    socket.onMessage(message => messages.push(String(message)));
  });
  await harness(page, true, true);
  await page.clock.install();
  await page.evaluate(() => (window as any).verifier.start());
  await expect.poll(() => messages.length).toBe(1);
  expect(JSON.parse(messages[0]).data).toMatch(/^data:image\/jpeg;base64,/);
  await page.clock.runFor(5000);
  expect(messages).toHaveLength(1);
  send(JSON.stringify({ type: 'status', verified: false, reason: 'Lighting too dark.' }));
  await expect.poll(() => page.evaluate(() => (window as any).photoUpdates.at(-1).message)).toBe('Lighting too dark.');
  expect(await page.evaluate(() => (window as any).photoUpdates.at(-1).state)).toBe('pending');
  await page.clock.runFor(1000);
  await expect.poll(() => messages.length).toBe(2);
  send(JSON.stringify({ type: 'status', verified: true }));
  await expect.poll(() => page.evaluate(() => (window as any).verifier.isReady())).toBe(true);
  expect(await page.evaluate(() => (window as any).cameraRequests)).toBe(0);
  expect(await page.evaluate(() => (window as any).photoRequests.length)).toBe(1);
  await page.evaluate(() => (window as any).verifier.stop());
  await page.clock.runFor(60000);
  expect(messages).toHaveLength(2);
  expect(connections).toBe(1);
  expect(await page.evaluate(() => (window as any).existingVideo.srcObject.getVideoTracks()[0].readyState)).toBe('live');
});

test("camera replacement reconnects monitoring without opening another camera", async ({ page }) => {
  let connections = 0;
  let frames = 0;
  await page.routeWebSocket('ws://localhost/ws/interview/session-1/face-monitor', socket => {
    connections++;
    socket.onMessage(() => { frames++; socket.send(JSON.stringify({ type: 'status', verified: true })); });
  });
  await harness(page, true, true);
  await page.clock.install();
  await page.evaluate(() => (window as any).verifier.start());
  await expect.poll(() => frames).toBe(1);
  await page.evaluate(() => (window as any).verifier.invalidate());
  await expect.poll(() => connections).toBe(2);
  await expect.poll(() => frames).toBe(2);
  await page.evaluate(() => (window as any).verifier.stop());
  await page.clock.runFor(60000);
  expect(frames).toBe(2);
  expect(connections).toBe(2);
  expect(await page.evaluate(() => (window as any).cameraRequests)).toBe(0);
});
