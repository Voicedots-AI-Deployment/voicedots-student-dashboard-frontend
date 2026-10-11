import { test, expect, type Page } from "@playwright/test";

const student = { id: "student-1", full_name: "Asha Kumar", email: "asha@college.edu", roll_number: "CS01",
  photo_url: "/api/student/profile/photo", current_resume_submission_id: "resume-main" };

const day = 24 * 3600 * 1000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
const dims = (bands: number[]) => ({
  core_dimensions: ["communication", "resume_ownership", "confidence_conduct", "structured_thinking"].map((dimension, i) => ({ dimension, band: bands[i], percentage: bands[i] * 25 })),
  domain_dimensions: ["domain_knowledge", "applied_evidence", "role_awareness"].map((dimension, i) => ({ dimension, band: bands[4 + i], percentage: bands[4 + i] * 25 })),
});
function report(id: string, daysAgo: number, score: number | null, bands: number[], extra: Record<string, unknown> = {}) {
  return {
    evaluation_id: `e-${id}`, session_id: `s-${id}`, submission_id: `sub-${id}`, status: "released",
    created_at: iso(daysAgo), completed_at: iso(daysAgo), target_role: "Backend Developer",
    report: score == null ? { status: "awaiting_release" } : {
      status: "ok", overall_score: score, ...dims(bands),
      communication: { speaking_speed_wpm: 132, pace_label: "Good", filler_word_count: 3, top_filler_words: ["um"], scores: { clarity: 75, answer_structure: 50, confidence: 75 } },
      priority_improvement_areas: [{ focus: "Applied Evidence", actions: ["Prepare one measurable result for each project."] }],
    },
    ...extra,
  };
}

async function open(page: Page, dashboard: Record<string, unknown>) {
  await page.route("**/api/**", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/student-me", route => route.fulfill({ json: { student } }));
  await page.route("**/api/student/dashboard", route => route.fulfill({ json: { attempts: [], drives: [], ...dashboard } }));
  await page.goto("/performance");
  await expect(page.getByRole("heading", { name: "My performance" })).toBeVisible();
}

const readiness = { overall_score: 74.4, status: "ok", axis_scores: { interview_readiness: 72, resume_readiness: 80 }, not_assessed: [],
  weights: { interview_readiness: 70, resume_readiness: 30 },
  interview_readiness: { drives: [{ drive_id: "d1", company_name: "Razorpay", role_title: "Backend Developer", best_score: 72 }] } };

test("the dashboard summarises released interviews, skills and readiness from the student's own data", async ({ page }) => {
  await open(page, {
    readiness,
    reports: [
      report("3", 3, 78.5, [3, 4, 3, 3, 3, 3, 3], { drive_id: "d1", company_name: "Razorpay" }),
      report("2", 20, 61, [3, 3, 2, 2, 3, 2, 2]),
      report("1", 40, 44, [2, 2, 2, 1, 2, 1, 2]),
      report("p", 1, null, []),
    ],
    drives: [{ id: "d2", company_name: "Freshworks", role_title: "Product Engineer", status: "active", interview_action: "start" }],
  });
  const kpis = page.getByRole("region", { name: "Performance summary" });
  await expect(kpis.getByText("Placement readiness")).toBeVisible();
  await expect(kpis.locator(".stat-card strong")).toHaveText(["74", "79", "61", "79"]);
  await expect(kpis.getByText("+17.5 pts")).toBeVisible();
  await expect(page.getByText("3 released interviews · 1 placement · 2 practice · 1 awaiting release")).toBeVisible();
  await expect(page.getByRole("img", { name: "Interview score trend across 3 interviews" })).toBeVisible();
  // Accessible data table behind the chart, oldest first.
  await expect(page.locator(".perf-chart table tbody tr td:nth-child(3)")).toHaveText(["44", "61", "79"]);
  await expect(page.getByRole("meter", { name: "Resume ownership" })).toBeVisible();
  await expect(page.locator(".perf-skill-list li", { hasText: "Resume ownership" })).toContainText("75%");
  await expect(page.locator(".perf-skill-list li", { hasText: "Resume ownership" })).toContainText("+50%");
  await expect(page.getByText("Prepare one measurable result for each project.")).toBeVisible();
  await expect(page.getByText("132")).toBeVisible();
  await expect(page.locator(".perf-drive-scores")).toContainText("Razorpay");
  await expect(page.getByText("1 open opportunity")).toBeVisible();
  await expect(page.getByRole("link", { name: "Practice an interview" })).toHaveAttribute("href", "/practice");
});

test("results awaiting release are not scored and the empty state says why", async ({ page }) => {
  await open(page, { readiness: { overall_score: null, status: "incomplete", axis_scores: {}, not_assessed: [] }, reports: [report("p", 1, null, [])] });
  await expect(page.getByText("Your performance dashboard is waiting for its first result")).toBeVisible();
  await expect(page.getByText("still being reviewed", { exact: false })).toBeVisible();
  await expect(page.locator(".perf-kpis")).toHaveCount(0);
});

test("a student with no interviews is pointed to practice", async ({ page }) => {
  await open(page, { readiness: { overall_score: null, status: "incomplete", axis_scores: {}, not_assessed: [] }, reports: [] });
  await expect(page.getByText("Complete a practice interview", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /Start practicing/ })).toHaveAttribute("href", "/practice");
});

test("practice-only history keeps readiness locked instead of inventing an index", async ({ page }) => {
  await open(page, { readiness: { overall_score: null, status: "incomplete", axis_scores: {}, not_assessed: ["interview_readiness"] },
    reports: [report("1", 10, 52, [2, 2, 2, 2, 2, 2, 2])] });
  await expect(page.locator(".perf-kpis .stat-card").first()).toContainText("—");
  await expect(page.getByText("Complete a placement interview to unlock")).toBeVisible();
  await expect(page.getByText("First result")).toBeVisible();
  await expect(page.getByText("No placement interview results yet.")).toBeVisible();
});

test("the dashboard fits a phone screen and the nav links to it", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, { readiness, reports: [report("2", 5, 70, [3, 3, 3, 3, 3, 3, 3]), report("1", 30, 50, [2, 2, 2, 2, 2, 2, 2])] });
  await expect(page.locator(".perf-chart svg")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const labelSize = await page.locator(".perf-grid text").first().evaluate(element => element.getBoundingClientRect().height);
  expect(labelSize).toBeGreaterThan(7);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("link", { name: "My performance" }).click();
  await expect(page).toHaveURL(/\/performance$/);
});
