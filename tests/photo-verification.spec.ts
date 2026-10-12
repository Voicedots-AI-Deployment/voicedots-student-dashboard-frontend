import { test, expect, type Page } from "@playwright/test";

const identity = { student: { id: "s1", full_name: "Student", email: "student@example.edu", roll_number: "CS01", allow_student_photo_upload: true } };

async function camera(page: Page, denied = false, fill = "#000000") {
  await page.addInitScript(({ denied, fill }) => {
    const state = { stopped: 0 };
    (window as unknown as { cameraState: typeof state }).cameraState = state;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      if (denied) throw new DOMException("Denied", "NotAllowedError");
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 480;
      const context = canvas.getContext("2d")!;
      context.fillStyle = fill;
      context.fillRect(0, 0, 640, 480);
      const stream = canvas.captureStream(5);
      stream.getTracks().forEach((track) => {
        const stop = track.stop.bind(track);
        track.stop = () => { state.stopped++; stop(); };
      });
      return stream;
    } });
  }, { denied, fill });
}

async function auth(page: Page, options: { mismatch?: boolean; conflict?: boolean; rosterPhoto?: boolean; photoValidationError?: boolean; photoPermission?: boolean } = {}) {
  let signedIn = false;
  let hasPhoto = Boolean(options.rosterPhoto);
  const signedInIdentity = () => ({ student: { ...identity.student, allow_student_photo_upload: options.photoPermission ?? true, ...(hasPhoto ? { photo_url: "/api/student/profile/photo" } : {}) } });
  const captures: Record<string, unknown>[] = [];
  // These students have not finished their profile, so the welcome prompt
  // appears after sign-in; they skip it as a student would, then continue.
  await page.addLocatorHandler(page.getByRole("button", { name: "Skip for now" }), button => button.click());
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
      // Mirrors the API: one method per sign-in. Password needs no photo;
      // face sign-in needs a camera photo.
      if (body.auth_method !== "face" && path === "/api/auth/student-login") { captures.push(body); signedIn = true; return route.fulfill({ json: signedInIdentity() }); }
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
  await page.getByRole("button", { name: "Face", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.getByLabel("Email").fill("student@example.edu");
  await page.getByRole("button", { name: "Open camera" }).click();
  await expect(page.getByRole("heading", { name: "Verify your photo." })).toBeVisible();
}

test("password sign-in uses only the email and password, with no camera step", async ({ page }) => {
  const captures = await auth(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Email & password" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Email").fill("student@example.edu");
  await page.getByLabel("Password", { exact: true }).fill("CorrectPassword1!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verify your photo." })).toHaveCount(0);
  await expect.poll(() => captures.length).toBe(1);
  expect(captures[0].webcam_photo).toBeUndefined();
  expect(captures[0].password).toBe("CorrectPassword1!");
});

test("face sign-in asks only for the email and a camera photo", async ({ page }) => {
  await camera(page);
  await auth(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Face", exact: true }).click();
  await expect(page.getByRole("button", { name: "Face", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Email me a password/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Email & password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});

test("login waits for a camera match and stops the camera", async ({ page }) => {
    await camera(page);
    const captures = await auth(page);
    await signIn(page);
    expect(await page.evaluate(() => sessionStorage.getItem("vd_student_data"))).toBeNull();
    await page.getByRole("button", { name: "Capture and verify" }).click();
    await expect(page.getByRole("heading", { name: "Verify your photo." })).not.toBeVisible();
    expect(captures).toHaveLength(1);
    expect(captures[0].webcam_photo).toMatch(/^data:image\/jpeg;base64,/);
    expect(captures[0].auth_method).toBe("face");
    expect(captures[0].password).toBe("");
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
  await expect(page.getByRole("button", { name: "Open camera" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { cameraState: { stopped: number } }).cameraState.stopped)).toBeGreaterThan(0);
});

test("unavailable face sign-in returns to password login and releases the camera", async ({ page }) => {
  await camera(page);
  await auth(page);
  await page.route("**/api/auth/student-login", route => route.fulfill({ status: 403, json: { detail: {
    code: "FACE_LOGIN_NOT_ENABLED", message: "Face sign-in is not available. Use email and password, or contact your placement team.",
  } } }));
  await signIn(page);
  await page.getByRole("button", { name: "Capture and verify" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Face sign-in is not available");
  await expect(page.getByRole("heading", { name: "Verify your photo." })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { cameraState: { stopped: number } }).cameraState.stopped)).toBeGreaterThan(0);
  expect(await page.evaluate(() => sessionStorage.getItem("vd_student_data"))).toBeNull();
});

test("appearance changes can recover through password login without accepting a mismatch", async ({ page }) => {
  await camera(page);
  const captures = await auth(page, { mismatch: true });
  await signIn(page);
  await page.getByRole("button", { name: "Capture and verify" }).click();
  await expect(page.getByText(/appearance has changed/)).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("vd_student_data"))).toBeNull();
  await page.getByRole("button", { name: "Sign in with password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page.getByLabel("Email").fill("student@example.edu");
  await page.getByLabel("Password", { exact: true }).fill("CorrectPassword1!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.poll(() => captures.length).toBe(2);
  expect(captures[1].webcam_photo).toBeUndefined();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toHaveCount(0);
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

test("My Profile hides photo controls when placement manages the photo", async ({ page }) => {
  await camera(page);
  await auth(page, { photoPermission: false });
  await page.route("**/api/student/resume-library", route => route.fulfill({ json: { resumes: [] } }));
  await page.route("**/api/student/resume-studio/resumes", route => route.fulfill({ json: [] }));
  await signIn(page);
  await page.getByRole("button", { name: "Capture and verify" }).click();
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  await expect(page.getByText("Your profile photo is managed by the placement team.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload photo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use webcam" })).toHaveCount(0);
});

for (const [fill, hint] of [["#000000", "Too dark: face a window or lamp"], ["#9a9a9a", "Good light. Line up your face and capture"]] as const) {
  test(`profile camera shows a live lighting check (${hint.split(":")[0].split(".")[0]})`, async ({ page }) => {
    await camera(page, false, fill);
    await auth(page);
    await page.route("**/api/student/resume-library", route => route.fulfill({ json: { resumes: [] } }));
    await page.route("**/api/student/resume-studio/resumes", route => route.fulfill({ json: [] }));
    await signIn(page);
    await page.getByRole("button", { name: "Capture and verify" }).click();
    await page.getByRole("link", { name: "My profile", exact: true }).click();
    await page.getByRole("button", { name: "Use webcam" }).click();
    await expect(page.getByRole("list", { name: "Tips for a clear photo" })).toBeVisible();
    await expect(page.locator(".profile-face-outline")).toBeVisible();
    await expect(page.locator(".photo-light")).toHaveText(hint);
  });
}

