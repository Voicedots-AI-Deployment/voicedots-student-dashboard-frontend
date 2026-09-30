import { test, expect, type Page } from "@playwright/test";

const identity = { student: { id: "s1", full_name: "Student", email: "student@example.edu", roll_number: "CS01" } };

async function camera(page: Page, denied = false) {
  await page.addInitScript(({ denied }) => {
    const state = { stopped: 0 };
    (window as unknown as { cameraState: typeof state }).cameraState = state;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      if (denied) throw new DOMException("Denied", "NotAllowedError");
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 480;
      canvas.getContext("2d")!.fillRect(0, 0, 640, 480);
      const stream = canvas.captureStream(5);
      stream.getTracks().forEach((track) => {
        const stop = track.stop.bind(track);
        track.stop = () => { state.stopped++; stop(); };
      });
      return stream;
    } });
  }, { denied });
}

async function auth(page: Page, options: { mismatch?: boolean; conflict?: boolean; rosterPhoto?: boolean; photoValidationError?: boolean } = {}) {
  let signedIn = false;
  let hasPhoto = Boolean(options.rosterPhoto);
  const signedInIdentity = () => ({ student: { ...identity.student, ...(hasPhoto ? { photo_url: "/api/student/profile/photo" } : {}) } });
  const captures: Record<string, unknown>[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/student-me") return route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? signedInIdentity() : { detail: "Authentication required." } });
    if (path === "/api/student/profile/photo" && route.request().method() === "GET") {
      if (!hasPhoto) return route.fulfill({ status: 404, json: { detail: "No profile photo saved." } });
      return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=", "base64") });
    }
    if (path === "/api/student/profile/photo" && route.request().method() === "POST") {
      if (hasPhoto) return route.fulfill({ status: 409, json: { detail: "Your verified profile photo is locked." } });
      if (options.photoValidationError) return route.fulfill({ status: 422, json: { detail: "No face detected in the uploaded photo." } });
      hasPhoto = true;
      return route.fulfill({ json: { photo_url: "/api/student/profile/photo" } });
    }
    if (["/api/auth/student-login", "/api/auth/student-enroll"].includes(path)) {
      const body = route.request().postDataJSON();
      if (!body.webcam_photo) return route.fulfill({ status: 403, json: { detail: { code: "PHOTO_REQUIRED", message: "Take a photo." } } });
      captures.push(body);
      if (options.mismatch) return route.fulfill({ status: 403, json: { detail: { code: "PHOTO_MISMATCH", message: "Photo did not match. Please retake it." } } });
      if (options.conflict && !body.replace_active_session) return route.fulfill({ status: 409, json: { detail: { code: "ACTIVE_SESSION_EXISTS", message: "Account already active." } } });
      signedIn = true;
      return route.fulfill({ json: signedInIdentity() });
    }
    return route.fulfill({ json: path.includes("dashboard") ? { reports: [], attempts: [], drives: [], readiness: { status: "incomplete", overall_score: null, axis_scores: {}, not_assessed: [] } } : {} });
  });
  return captures;
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("student@example.edu");
  await page.getByLabel("Password", { exact: true }).fill("CorrectPassword1!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verify your photo." })).toBeVisible();
}

test("login waits for a camera match and stops the camera", async ({ page }) => {
    await camera(page);
    const captures = await auth(page);
    await signIn(page);
    expect(await page.evaluate(() => sessionStorage.getItem("vd_student_data"))).toBeNull();
    await page.getByRole("button", { name: "Capture and verify" }).click();
    await expect(page.getByRole("heading", { name: "Verify your photo." })).not.toBeVisible();
    expect(captures).toHaveLength(1);
    expect(captures[0].webcam_photo).toMatch(/^data:image\/jpeg;base64,/);
    expect(captures[0].password).toBe("CorrectPassword1!");
    expect(await page.evaluate(() => (window as unknown as { cameraState: { stopped: number } }).cameraState.stopped)).toBeGreaterThan(0);
    expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain("CorrectPassword1!");
});

test("mismatch keeps the student at the camera and allows a retry", async ({ page }) => {
  await camera(page);
  const captures = await auth(page, { mismatch: true });
  await signIn(page);
  await page.getByRole("button", { name: "Capture and verify" }).click();
  await expect(page.getByText("Photo did not match. Please retake it.")).toBeVisible();
  await page.getByRole("button", { name: "Capture and verify" }).click();
  await expect.poll(() => captures.length).toBe(2);
  expect(await page.evaluate(() => sessionStorage.getItem("vd_student_data"))).toBeNull();
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  expect(await page.evaluate(() => (window as unknown as { cameraState: { stopped: number } }).cameraState.stopped)).toBeGreaterThan(0);
});

test("camera denial cannot complete sign in", async ({ page }) => {
  await camera(page, true);
  const captures = await auth(page);
  await signIn(page);
  await expect(page.getByRole("alert")).toContainText("Camera permission was denied");
  await expect(page.getByRole("button", { name: "Capture and verify" })).toBeDisabled();
  expect(captures).toHaveLength(0);
});

test("session replacement still requires another verified camera request", async ({ page }) => {
  await camera(page);
  const captures = await auth(page, { conflict: true });
  await signIn(page);
  await page.getByRole("button", { name: "Capture and verify" }).click();
  await page.getByLabel("End my previous session and sign in here").check();
  await page.getByRole("button", { name: "Capture and verify" }).click();
  await expect(page.getByRole("heading", { name: "Verify your photo." })).not.toBeVisible();
  expect(captures).toHaveLength(2);
  expect(captures[1].replace_active_session).toBe(true);
});

test("My Profile places upload and webcam actions in the header when no photo exists", async ({ page }) => {
  await camera(page);
  await auth(page);
  await page.route("**/api/student/resume-library", route => route.fulfill({ json: { resumes: [] } }));
  await page.route("**/api/student/resume-studio/resumes", route => route.fulfill({ json: [] }));
  await signIn(page);
  await page.getByRole("button", { name: "Capture and verify" }).click();
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use webcam" })).toBeVisible();
  await expect(page.getByLabel("Choose profile photo")).toBeAttached();
  await expect(page.getByRole("heading", { name: "Verification photo" })).toHaveCount(0);
});

test("My Profile displays a roster photo once and does not offer an edit control", async ({ page }) => {
  await camera(page);
  await auth(page, { rosterPhoto: true });
  await page.route("**/api/student/resume-library", route => route.fulfill({ json: { resumes: [] } }));
  await page.route("**/api/student/resume-studio/resumes", route => route.fulfill({ json: [] }));
  await signIn(page);
  await page.getByRole("button", { name: "Capture and verify" }).click();
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  await expect(page.getByRole("img", { name: "Your verified profile", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload photo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use webcam" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Verification photo" })).toHaveCount(0);
});

test("student photo upload works from the top-avatar edit control and locks after save", async ({ page }) => {
  await camera(page);
  await auth(page);
  await page.route("**/api/student/resume-library", route => route.fulfill({ json: { resumes: [] } }));
  await page.route("**/api/student/resume-studio/resumes", route => route.fulfill({ json: [] }));
  await signIn(page);
  await page.getByRole("button", { name: "Capture and verify" }).click();
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload photo" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "profile.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByRole("img", { name: "Your verified profile", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload photo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use webcam" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Verification photo" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Profile photo saved and locked.");
});

test("webcam capture can be retaken or saved through the canonical photo endpoint", async ({ page }) => {
  await camera(page);
  await auth(page);
  await page.route("**/api/student/resume-library", route => route.fulfill({ json: { resumes: [] } }));
  await page.route("**/api/student/resume-studio/resumes", route => route.fulfill({ json: [] }));
  await signIn(page);
  await page.getByRole("button", { name: "Capture and verify" }).click();
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  await page.getByRole("button", { name: "Use webcam" }).click();
  await expect(page.getByLabel("Webcam preview")).toBeVisible();
  await page.evaluate(() => {
    const video = document.querySelector("video[aria-label='Webcam preview']") as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 640 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 480 });
  });
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByRole("img", { name: "Captured profile photo preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload photo" })).toHaveCount(0);
  await page.getByRole("button", { name: "Retake" }).click();
  await expect(page.getByLabel("Webcam preview")).toBeVisible();
  await page.evaluate(() => {
    const video = document.querySelector("video[aria-label='Webcam preview']") as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 640 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 480 });
  });
  await page.getByRole("button", { name: "Capture" }).click();
  await page.getByRole("button", { name: "Use this photo" }).click();
  await expect(page.getByRole("button", { name: "Upload photo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use webcam" })).toHaveCount(0);
});


test("profile photo validation errors are shown instead of a generic connection error", async ({ page }) => {
  await camera(page);
  await auth(page, { photoValidationError: true });
  await page.route("**/api/student/resume-library", route => route.fulfill({ json: { resumes: [] } }));
  await page.route("**/api/student/resume-studio/resumes", route => route.fulfill({ json: [] }));
  await signIn(page);
  await page.getByRole("button", { name: "Capture and verify" }).click();
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload photo" }).click();
  await (await chooserPromise).setFiles({ name: "profile.png", mimeType: "image/png", buffer: Buffer.from("image") });
  await expect(page.getByRole("alert")).toContainText("No face detected in the uploaded photo.");
  await expect(page.getByRole("alert")).not.toContainText("Unable to connect to VoiceDots");
});
