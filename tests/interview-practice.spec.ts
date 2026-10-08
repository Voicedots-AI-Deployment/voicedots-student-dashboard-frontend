import { expect, test, type Page } from "@playwright/test";

const identity = { student: {
  id: "student-1", full_name: "Asha Kumar", email: "asha@example.edu",
  roll_number: "CS01", college_name: "Example College", program: "B.Tech",
  department_code: "CSE", graduation_year: 2027, cgpa: 8.6,
  current_resume_submission_id: "main-submission",
} };

const activeResume = { resume_id: "main-file", submission_id: "main-submission", original_filename: "Quant_Engineer_Sample_Resume.pdf", label: "Main Resume", is_primary: true, uploaded_at: "2026-10-01T00:00:00Z" };

function activeDrive(overrides: Record<string, unknown> = {}) {
  return {
    id: "drive-active", company_name: "Razorpay", role_title: "Backend Developer",
    status: "active", eligibility_status: "eligible", main_resume_available: true,
    interview_action: "start", interview_status: "open", interview_duration_minutes: 45,
    interview_max_attempts: 2, ...overrides,
  };
}

function driveContext(overrides: Record<string, unknown> = {}) {
  return {
    drive_id: "drive-active", company_name: "Razorpay", role_title: "Backend Developer",
    location: "Bengaluru", job_description: "Build reliable services and APIs.",
    duration_minutes: 45, attempt_number: 2, max_attempts: 2,
    attempts_used: 1, attempts_remaining: 1, next_attempt_number: 2,
    action: "start", can_start: true, can_resume: false,
    can_start_next_attempt: true, interview_window: "open",
    interview_window_start_at: "2026-10-05T10:00:00+05:30",
    interview_window_end_at: "2026-10-08T18:00:00+05:30",
    main_resume_required: true, main_resume_available: true,
    publication_status: "hidden", attempt_history: [],
    interview_panel: [
      { order: 1, track: "domain", name: "Arjun Mehta", role: "Technical Interviewer", persona: "analytical", description: "Explore your technical decisions." },
      { order: 2, track: "manager", name: "Vikram Rao", role: "Manager Round", persona: "senior leadership", description: "Discuss ownership and judgment." },
    ],
    ...overrides,
  };
}

async function mockPortal(page: Page, options: { resumes?: boolean; drives?: unknown[]; context?: Record<string, unknown>; practiceAttempts?: unknown[] } = {}) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/student-me") return route.fulfill({ json: identity });
    if (path === "/api/student/resume-library") return route.fulfill({ json: { resumes: options.resumes === false ? [] : [activeResume] } });
    if (path === "/api/student/resume-library/main-file/file") return route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4 resume" });
    if (path === "/api/student/drives") return route.fulfill({ json: options.drives ?? [activeDrive()] });
    if (path === "/api/student/drives/drive-active/interview-context") return route.fulfill({ json: options.context ?? driveContext() });
    if (path === "/api/student/practice/resumable") return route.fulfill({ json: { attempts: options.practiceAttempts ?? [] } });
    if (path === "/api/student/dashboard") return route.fulfill({ json: { reports: [], attempts: [], readiness: { status: "incomplete", axis_scores: {}, not_assessed: [] }, drives: [] } });
    return route.fulfill({ status: 404, json: { detail: "Not found." } });
  });
}

test("Practice mode uses editable setup, one Main Resume and the standard four-person panel", async ({ page }) => {
  await mockPortal(page, { practiceAttempts: [{ submission_id: "practice-sub", session_id: "practice-session", target_role: "Quant Engineer", submitted_at: "2026-10-04T12:00:00Z", duration_minutes: 30 }] });
  await page.goto("/practice");
  await expect(page.getByRole("tab", { name: "Practice Interview" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Target role", { exact: true })).toBeEditable();
  await expect(page.getByLabel("Interview duration")).toBeEnabled();
  await expect(page.getByLabel("Interview difficulty")).toBeEnabled();
  await expect(page.getByLabel("Job description")).toBeEditable();
  const fieldSpacing = await page.evaluate(() => {
    const role = document.querySelector('.interview-fields label');
    const nextRow = document.querySelector('.interview-field-row');
    if (!role || !nextRow) return Number.POSITIVE_INFINITY;
    return Math.round(nextRow.getBoundingClientRect().top - role.getBoundingClientRect().bottom);
  });
  expect(fieldSpacing).toBeLessThanOrEqual(12);
  const practiceCardGaps = await page.evaluate(() => {
    const setup = document.querySelector('.interview-setup-grid');
    const cards = document.querySelectorAll('.interview-resume-card');
    if (!setup || cards.length < 2) return [Number.POSITIVE_INFINITY];
    return [
      Math.round(cards[0].getBoundingClientRect().top - setup.getBoundingClientRect().bottom),
      Math.round(cards[1].getBoundingClientRect().top - cards[0].getBoundingClientRect().bottom),
    ];
  });
  expect(practiceCardGaps.every((gap) => gap <= 13)).toBe(true);
  await expect(page.locator(".interview-active-resume")).toHaveCount(1);
  await expect(page.getByText("Quant_Engineer_Sample_Resume.pdf")).toBeVisible();
  await expect(page.getByRole("button", { name: /upload resume|change resume/i })).toHaveCount(0);
  await expect(page.locator(".panel-person")).toHaveCount(4);
  await expect(page.locator(".interview-session-row")).toContainText("Practice Interview");
  await expect(page.locator(".interview-session-row")).toContainText("Quant Engineer");
  await expect(page.getByText("Why practice?", { exact: true })).toHaveCount(0);
  await expect(page.getByText("What you’ll get", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/interview-practice-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/interview-practice-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/interview\.html\?id=practice-sub&session_id=practice-session/);
});

test("practice setup fields persist in session storage when returning to the section", async ({page})=>{
  await mockPortal(page);
  await page.goto("/practice");
  await page.getByLabel("Target role",{exact:true}).fill("Platform Engineer");
  await page.getByLabel("Job description").fill("Build dependable APIs for students.");
  await page.getByRole("link",{name:"Calendar"}).click();
  await page.getByRole("link",{name:"Interview practice"}).click();
  await expect(page.getByLabel("Target role",{exact:true})).toHaveValue("Platform Engineer");
  await expect(page.getByLabel("Job description")).toHaveValue("Build dependable APIs for students.");
  expect(await page.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith("vd_practice_draft_student-1")))).toBe(true);
});

test("Placement mode filters unavailable drives and renders only its configured read-only panel", async ({ page }) => {
  await mockPortal(page, { drives: [
    activeDrive(),
    activeDrive({ id: "unassigned", company_name: "Unassigned Co", interview_action: "not_assigned", interview_status: "awaiting_assignment" }),
    activeDrive({ id: "closed", company_name: "Closed Co", status: "closed", interview_status: "closed" }),
    activeDrive({ id: "ineligible", company_name: "Ineligible Co", eligibility_status: "ineligible" }),
    activeDrive({ id: "scheduled", company_name: "Scheduled Co", status: "scheduled" }),
  ] });
  await page.goto("/practice");
  await page.getByRole("tab", { name: "Placement Interview" }).click();
  const selector = page.getByLabel("Select placement opportunity");
  await expect(selector).toHaveValue("drive-active");
  await expect(selector.locator("option")).toHaveCount(1);
  await expect(page.locator(".placement-role-heading strong")).toHaveText("Razorpay");
  await expect(page.getByText("Attempt 2 of 2")).toBeVisible();
  await expect(page.getByText("1 completed · 1 remaining")).toBeVisible();
  await expect(page.getByLabel("Target role", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Interview difficulty")).toHaveCount(0);
  await expect(page.getByLabel("Job description")).toHaveCount(0);
  await expect(page.locator(".placement-panel-person")).toHaveCount(2);
  await expect(page.locator(".placement-panel-person").nth(0)).toContainText("Technical Interviewer");
  await expect(page.locator(".placement-panel-person").nth(1)).toContainText("Manager Round");
  await expect(page.getByText("HR interviewer", { exact: true })).toHaveCount(0);
  const placementCardGap = await page.evaluate(() => {
    const setup = document.querySelector('.interview-setup-grid');
    const resume = document.querySelector('.interview-resume-card');
    if (!setup || !resume) return Number.POSITIVE_INFINITY;
    return Math.round(resume.getBoundingClientRect().top - setup.getBoundingClientRect().bottom);
  });
  expect(placementCardGap).toBeLessThanOrEqual(13);
  await page.locator(".placement-jd-details summary").click();
  await expect(page.getByText("Build reliable services and APIs.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start attempt 2" })).toBeEnabled();
  await page.screenshot({ path: "test-results/placement-interview-desktop.png", fullPage: true });
});

test("Placement continuation and results follow backend session and release state", async ({ page }) => {
  await mockPortal(page, {
    drives: [activeDrive({ interview_action: "resume", interview_status: "in_progress" })],
    context: driveContext({
      action: "resume", can_start: false, can_resume: true, can_start_next_attempt: false,
      session_id: "placement-session", submission_id: "placement-submission",
      attempt_number: 1, current_attempt_number: 1, next_attempt_number: 1,
      attempts_used: 1, attempts_remaining: 1,
    }),
  });
  await page.goto("/practice");
  await page.getByRole("tab", { name: "Placement Interview" }).click();
  await expect(page.locator(".placement-primary-action").getByRole("button", { name: "Continue interview" })).toBeVisible();
  await expect(page.locator(".interview-session-row")).toContainText("Attempt 1");
  await page.locator(".placement-primary-action").getByRole("button", { name: "Continue interview" }).click();
  await expect(page).toHaveURL(/interview\.html\?id=placement-submission&session_id=placement-session/);

  await page.route("**/api/student/drives/drive-active/interview-context", route => route.fulfill({ json: driveContext({
    action: "completed", can_start: false, can_resume: false, interview_status: "completed",
    submission_id: "placement-submission", publication_status: "released",
    attempt_history: [{ attempt_number: 1, submission_id: "placement-submission", completed_at: "2026-10-04T15:00:00Z", result_available: true }],
  }) }));
  await page.goto("/practice");
  await page.getByRole("tab", { name: "Placement Interview" }).click();
  await expect(page.getByRole("link", { name: "View result" })).toHaveAttribute("href", "/reports?submission=placement-submission");
  await expect(page.getByRole("button", { name: "Start placement interview" })).toHaveCount(0);
});

test("missing Main Resume blocks both modes and links to My Profile without an uploader", async ({ page }) => {
  await mockPortal(page, { resumes: false, drives: [activeDrive({ main_resume_available: false, eligibility_status: "resume_required" })] });
  await page.goto("/practice");
  await expect(page.getByText("No active resume")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to My Profile" })).toHaveAttribute("href", "/profile#resume-library");
  await expect(page.getByRole("button", { name: "Start practice interview" })).toBeDisabled();
  await page.getByRole("tab", { name: "Placement Interview" }).click();
  await expect(page.locator(".interview-setup-card .interview-empty-state")).toContainText("No active placement interviews");
  await expect(page.locator("input[type=file]")).toHaveCount(0);
});
