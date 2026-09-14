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

async function auth(page: Page, options: { mismatch?: boolean; conflict?: boolean } = {}) {
  let signedIn = false;
  const captures: Record<string, unknown>[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/student-me") return route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? identity : { detail: "Authentication required." } });
    if (["/api/auth/student-login", "/api/auth/student-enroll"].includes(path)) {
      const body = route.request().postDataJSON();
      if (!body.webcam_photo) return route.fulfill({ status: 403, json: { detail: { code: "PHOTO_REQUIRED", message: "Take a photo." } } });
      captures.push(body);
      if (options.mismatch) return route.fulfill({ status: 403, json: { detail: { code: "PHOTO_MISMATCH", message: "Photo did not match. Please retake it." } } });
      if (options.conflict && !body.replace_active_session) return route.fulfill({ status: 409, json: { detail: { code: "ACTIVE_SESSION_EXISTS", message: "Account already active." } } });
      signedIn = true;
      return route.fulfill({ json: identity });
    }
    return route.fulfill({ json: path.includes("dashboard") ? { reports: [], attempts: [], drives: [], readiness: { status: "incomplete", overall_score: null, axis_scores: {}, not_assessed: [] } } : {} });
  });
  return captures;
}

async function signIn(page: Page, enroll = false) {
  await page.goto("/");
  if (enroll) {
    await page.getByRole("button", { name: "First time here?" }).click();
    await page.getByLabel("Roll number").fill("CS01");
  }
  await page.getByLabel("Email").fill("student@example.edu");
  await page.getByLabel("Password", { exact: true }).fill("CorrectPassword1!");
  await page.getByRole("button", { name: enroll ? "Activate account" : "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verify your photo." })).toBeVisible();
}

for (const enroll of [false, true]) {
  test(`${enroll ? "enrollment" : "login"} waits for a camera match and stops the camera`, async ({ page }) => {
    await camera(page);
    const captures = await auth(page);
    await signIn(page, enroll);
    expect(await page.evaluate(() => sessionStorage.getItem("vd_student_data"))).toBeNull();
    await page.getByRole("button", { name: "Capture and verify" }).click();
    await expect(page.getByRole("heading", { name: "Verify your photo." })).not.toBeVisible();
    expect(captures).toHaveLength(1);
    expect(captures[0].webcam_photo).toMatch(/^data:image\/jpeg;base64,/);
    expect(captures[0].password).toBe("CorrectPassword1!");
    if (enroll) expect(captures[0].roll_number).toBe("CS01");
    expect(await page.evaluate(() => (window as unknown as { cameraState: { stopped: number } }).cameraState.stopped)).toBeGreaterThan(0);
    expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toContain("CorrectPassword1!");
  });
}

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
