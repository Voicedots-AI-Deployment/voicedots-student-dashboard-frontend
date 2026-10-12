import { test, expect, type Page } from "@playwright/test";

type StudentOverrides = Record<string, unknown>;

const readiness = { overall_score: null, status: "incomplete", axis_scores: {}, not_assessed: [] };
const responses: Record<string, unknown> = {
  "/api/student/dashboard": { reports: [], attempts: [], readiness, drives: [] },
  "/api/student/readiness": readiness,
  "/api/student/drives": [],
  "/api/student/reports": { reports: [] },
  "/api/student/calendar/personal-events": { events: [] },
  "/api/student/resume-library": { resumes: [] },
  "/api/student/practice/resumable": { attempts: [] },
  "/api/student/coach/latest-recommendation": { available: false, weak_skills: [] },
  "/api/student/coach/training-cycles": { cycles: [] },
  "/api/student/coach/overview": { upcoming_drives: [], plans: [], completed_drive_recommendation: null },
  "/api/student/academics": { status: "not_connected" },
};

async function signIn(page: Page, overrides: StudentOverrides = {}) {
  const student = {
    id: "student-1", full_name: "ASHA KUMAR", email: "asha@college.edu", roll_number: "CS01",
    college_name: "Example College", allow_student_photo_upload: true, ...overrides,
  };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/student-me") return route.fulfill({ json: { student } });
    if (path === "/api/auth/student-logout") return route.fulfill({ json: { status: "ok" } });
    return route.fulfill({ status: path in responses ? 200 : 404, json: responses[path] ?? { detail: "Not found." } });
  });
}

const welcome = (page: Page) => page.getByRole("dialog", { name: "Welcome, Asha!" });

test("a new student is welcomed with the two required profile steps and direct actions", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  const dialog = welcome(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Upload your Main Resume")).toBeVisible();
  await expect(dialog.getByText("Add your profile photo")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Upload resume" })).toHaveAttribute("href", "/profile#resume-library");
  await expect(dialog.getByRole("link", { name: "Add photo" })).toHaveAttribute("href", "/profile#profile-photo");
  await dialog.getByRole("link", { name: "Upload resume" }).click();
  await expect(page).toHaveURL(/\/profile#resume-library$/);
  // The profile page is where the student completes these, so the prompt stays out of the way.
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("skipping lasts for this sign-in only and the prompt returns after signing in again", async ({ page }) => {
  await signIn(page, { current_resume_submission_id: "resume-main" });
  await page.goto("/");
  const dialog = welcome(page);
  await expect(dialog.getByText("Main Resume added")).toBeVisible();
  await dialog.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("vd_profile_setup_skipped"))).toBeNull();
  await page.goto("/");
  await expect(welcome(page)).toBeVisible();
});

test("features that need the resume or photo ask again even after skipping", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await welcome(page).getByRole("button", { name: "Skip for now" }).click();

  await page.goto("/practice");
  const interview = page.getByRole("dialog", { name: "Interview practice needs your Main Resume and profile photo" });
  await expect(interview).toBeVisible();
  await expect(interview.getByRole("link", { name: "Upload resume" })).toBeVisible();
  await expect(interview.getByRole("link", { name: "Add photo" })).toBeVisible();
  await interview.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("link", { name: "AI Coach" }).first().click();
  const coach = page.getByRole("dialog", { name: "AI Coach needs your Main Resume" });
  await expect(coach).toBeVisible();
  await expect(coach.getByText("Add your profile photo")).toHaveCount(0);
});

test("a feature only asks for what it needs", async ({ page }) => {
  await signIn(page, { current_resume_submission_id: "resume-main" });
  await page.goto("/coach");
  // Coaching only reads the resume, which is present, so no feature prompt.
  await expect(page.getByRole("dialog", { name: /AI Coach needs/ })).toHaveCount(0);
  await page.goto("/placements");
  const placements = page.getByRole("dialog", { name: "Placement interviews needs your Main Resume and profile photo" });
  await expect(placements.getByText("Main Resume added")).toBeVisible();
  await expect(placements.getByRole("link", { name: "Add photo" })).toBeVisible();
});

test("a photo managed by the placement team is shown as pending without an upload action", async ({ page }) => {
  await signIn(page, { current_resume_submission_id: "resume-main", allow_student_photo_upload: false });
  await page.goto("/");
  const dialog = welcome(page);
  await expect(dialog.getByText("Your placement team adds this photo.", { exact: false })).toBeVisible();
  await expect(dialog.getByText("Pending")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Add photo" })).toHaveCount(0);
});

test("a student with a complete profile is never interrupted", async ({ page }) => {
  await signIn(page, { current_resume_submission_id: "resume-main", photo_url: "/api/student/profile/photo" });
  for (const path of ["/", "/practice", "/placements", "/coach", "/career"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("the welcome prompt fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await signIn(page);
  await page.goto("/");
  const dialog = welcome(page);
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
});
