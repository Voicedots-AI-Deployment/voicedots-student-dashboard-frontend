import { test, expect, type Page } from "@playwright/test";
import { detail } from "../preview/vite.config";

// The page renders GET /api/student/performance as-is; these responses use the
// shape produced by the backend's app/student_performance.py build_performance.
const student = { id: "student-1", full_name: "Asha Kumar", email: "asha@college.edu", roll_number: "CS01",
  photo_url: "/api/student/profile/photo", current_resume_submission_id: "resume-main" };

const day = 24 * 3600 * 1000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
const point = (id: string, daysAgo: number, score: number, placement = false, label = "Backend Developer") =>
  ({ session_id: `s-${id}`, at: iso(daysAgo), score, placement, label });
const weeks = (counts: number[]) => ({
  weeks: counts.map((count, index) => ({ week_start: iso((counts.length - index) * 7), week_end: iso((counts.length - 1 - index) * 7), count })),
  active_weeks: counts.filter(Boolean).length,
});
const skill = (dimension: string, label: string, average: number | null, change: number | null = null) =>
  ({ dimension, label, average, latest: average, change });
const lockedReadiness = { overall_score: null, label: null, status: "incomplete", axes: [], drives: [], history: [] };
const empty = { generated_at: iso(0), pending_release_count: 0, has_results: false, readiness: lockedReadiness, open_opportunities: [],
  summary: null, trend: [], skills: [], strengths: [], focus: [], actions: [], communication: null, activity: weeks([0, 0, 0, 0, 0, 0, 0, 0]), placement_results: [] };

const full = {
  ...empty,
  pending_release_count: 1,
  has_results: true,
  readiness: { overall_score: 74.4, label: "Interview Ready", status: "ok",
    axes: [{ axis: "interview_readiness", score: 72, weight: 70 }, { axis: "resume_readiness", score: 80, weight: 30 }],
    drives: [{ drive_id: "d1", company_name: "Razorpay", role_title: "Backend Developer", best_score: 72 }], history: [] },
  open_opportunities: [{ drive_id: "d2", company_name: "Freshworks", role_title: "Product Engineer" }],
  summary: {
    released_count: 3, placement_count: 1, practice_count: 2,
    latest: { ...point("3", 3, 78.5, true, "Razorpay · Backend Developer"), change: 17.5, label_readiness: "Interview Ready" },
    recent_average: { score: 61.2, count: 3, label: "Approaching Ready" },
    best: point("3", 3, 78.5, true, "Razorpay · Backend Developer"),
    first_to_latest_change: 34.5,
  },
  trend: [point("1", 40, 44), point("2", 20, 61), point("3", 3, 78.5, true, "Razorpay · Backend Developer")],
  skills: [skill("communication", "Communication", 66.7, 25), skill("resume_ownership", "Resume ownership", 75, 50),
    skill("confidence_conduct", "Confidence", 58.3, 25), skill("structured_thinking", "Structured thinking", 50, 50),
    skill("domain_knowledge", "Domain knowledge", 66.7, 25), skill("applied_evidence", "Applied examples", 50, 50),
    skill("role_awareness", "Role awareness", 58.3, 25)],
  strengths: ["resume_ownership"],
  focus: ["structured_thinking", "applied_evidence", "role_awareness"],
  actions: [{ focus: "Applied Evidence", action: "Prepare one measurable result for each project." }],
  communication: { speaking_speed_wpm: 132, pace_label: "Good", filler_word_count: 3, filler_change: -2, top_filler_words: ["um"],
    scores: { clarity: 75, answer_structure: 50, confidence: 75 } },
  activity: weeks([0, 0, 1, 0, 0, 1, 0, 1]),
  placement_results: [point("3", 3, 78.5, true, "Razorpay · Backend Developer")],
};

async function open(page: Page, performance: Record<string, unknown>) {
  const requested: string[] = [];
  await page.route("**/api/**", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/student-me", route => route.fulfill({ json: { student } }));
  await page.route("**/api/student/dashboard", route => { requested.push("dashboard"); return route.fulfill({ json: { attempts: [], drives: [], reports: [], readiness: lockedReadiness } }); });
  await page.route("**/api/student/performance/overview", route => { requested.push("performance"); return route.fulfill({ json: performance }); });
  await page.route("**/api/student/performance", route => route.fulfill({ json: performance.has_results ? detail : {latest:null,competencies:[],comparable_trend:[]} }));
  await page.goto("/performance");
  await expect(page.getByRole("heading", { name: "Student Assessment Intelligence" })).toBeVisible();
  return requested;
}

test("the dashboard shows the backend's performance summary without recalculating it", async ({ page }) => {
  const requested = await open(page, full);
  const kpis = page.getByRole("region", { name: "Performance summary" });
  await expect(kpis.getByText("Placement readiness")).toBeVisible();
  await expect(kpis.locator(".spi-score strong")).toHaveText("79");
  await expect(kpis.locator(".spi-value").first()).toContainText("74");
  await expect(page.getByText("1 awaiting release",{exact:true})).toBeVisible();
  await expect(page.getByRole("img", { name: "Interview score trend across 3 interviews" })).toBeVisible();
  await expect(page.locator(".perf-chart table tbody tr td:nth-child(3)")).toHaveText(["44", "61", "79"]);
  await expect(page.getByRole("meter", { name: "Resume ownership" })).toHaveAttribute("aria-valuenow","75");
  await expect(page.getByText("Prepare one measurable result for each project.")).toBeVisible();
  await expect(page.getByText("132 words/min")).toBeVisible();
  await expect(page.getByRole("link", { name: "New interview" })).toHaveAttribute("href", "/practice");
  expect(requested).toContain("performance");
});

test("results awaiting release are not scored and the empty state says why", async ({ page }) => {
  await open(page, { ...empty, pending_release_count: 1 });
  await expect(page.getByText("Your performance dashboard is waiting for its first result")).toBeVisible();
  await expect(page.getByText("still being reviewed", { exact: false })).toBeVisible();
  await expect(page.locator(".spi-kpis")).toHaveCount(0);
});

test("a student with no interviews is pointed to practice", async ({ page }) => {
  await open(page, empty);
  await expect(page.getByText("Complete a practice interview", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /Start practicing/ })).toHaveAttribute("href", "/practice");
});

test("practice-only history keeps readiness locked instead of inventing an index", async ({ page }) => {
  const only = point("1", 10, 52);
  await open(page, { ...empty, has_results: true,
    summary: { released_count: 1, placement_count: 0, practice_count: 1, latest: { ...only, change: null, label_readiness: "Developing" },
      recent_average: { score: 52, count: 1, label: "Developing" }, best: only, first_to_latest_change: null },
    trend: [only], activity: weeks([0, 0, 0, 0, 0, 0, 1, 0]) });
  await expect(page.locator(".spi-kpis .spi-card").nth(1)).toContainText("—");
  await expect(page.getByText("Complete a placement interview to unlock")).toBeVisible();
  await expect(page.getByText("Placement / practice")).toBeVisible();

});

test("a failed performance request shows an error instead of made-up numbers", async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/student-me", route => route.fulfill({ json: { student } }));
  await page.route("**/api/student/performance/overview", route => route.fulfill({ status: 500, json: { detail: "down" } }));
  await page.goto("/performance");
  await expect(page.getByRole("heading", { name: "Student Assessment Intelligence" })).toBeVisible();
  await expect(page.locator(".spi-kpis")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /retry|try again/i }).or(page.getByRole("alert")).first()).toBeVisible();
});

test("the dashboard fits a phone screen and the nav links to it", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, full);
  await expect(page.locator(".perf-chart svg")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const labelSize = await page.locator(".perf-grid text").first().evaluate(element => element.getBoundingClientRect().height);
  expect(labelSize).toBeGreaterThan(7);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("link", { name: "My performance" }).click();
  await expect(page).toHaveURL(/\/performance$/);
});

test('restored performance keeps scorecard creation and revocation connected',async({page})=>{
 await open(page,full);let saved:unknown,revoked=false;
 await page.route('**/api/student/scorecard-shares',route=>{if(route.request().method()==='POST'){saved=route.request().postDataJSON();return route.fulfill({json:{token:'opaque-share-token'}});}return route.fulfill({json:{items:[{id:'share-1',session_id:full.summary.latest.session_id,expires_at:'2099-10-13'}]}});});
 await page.route('**/api/student/scorecard-shares/share-1',route=>{revoked=true;return route.fulfill({json:{revoked:true}});});
 await page.getByRole('button',{name:'Share scorecard',exact:true}).first().click();await page.getByRole('button',{name:'Create share link'}).click();await expect(page.getByLabel('Share link')).toHaveValue(/shared-scorecard\/opaque-share-token/);expect(saved).toEqual({session_id:full.summary.latest.session_id,days:7});
 await page.getByRole('button',{name:'Revoke',exact:true}).click();await expect(page.getByRole('dialog').getByRole('status').filter({hasText:'Access revoked'})).toBeVisible();expect(revoked).toBe(true);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('public shared scorecard remains available without signing in',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({status:401,json:{detail:'Sign-in required'}}));await page.route('**/api/scorecard-shares/token',route=>route.fulfill({json:{candidate:'Asha Kumar',role:'Engineer',score:78,competencies:{communication:74},strengths:['Clear explanations'],development:['SQL optimisation']}}));await page.goto('/shared-scorecard/token');await expect(page.getByRole('heading',{name:'Asha Kumar'})).toBeVisible();await expect(page.getByText('Overall score: 78/100')).toBeVisible();
});

test('restored growth dashboard renders at desktop, tablet and mobile widths',async({page})=>{
 const {mkdirSync}=await import('node:fs');const out='/root/voicedots/artifacts/student-performance-reference-20261013/regression';mkdirSync(out,{recursive:true});
 for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:1000});await open(page,full);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width===1440||width===390)await page.screenshot({path:`${out}/student-performance-${width}.png`,fullPage:true});}
});
