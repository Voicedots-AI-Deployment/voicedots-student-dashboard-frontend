import { test, expect, type Page } from "@playwright/test";

async function harness(page: Page, enabled = true) {
  await page.route("**/interview.js*", (route) => route.abort());
  await page.goto("/interview.html");
  await page.evaluate(async ({ enabled }) => {
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
        if (url.endsWith("photo-verification")) return new Response(JSON.stringify({ enabled, reference_ready: false }));
        if (w.delayNext) await new Promise((resolve) => { w.finishRequest = resolve; });
        return new Response(JSON.stringify({ verified: w.matchNext, reference_ready: true, message: "Frame mismatch" }));
      },
    });
    await w.verifier.load("session-1");
  }, { enabled });
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
