import { test, expect, type Page } from "@playwright/test";

const ready = { id: "student-1", full_name: "Asha Kumar", email: "asha@college.edu", roll_number: "CS01",
  photo_url: "/api/student/profile/photo", current_resume_submission_id: "resume-main" };
const dashboard = (drives: unknown[] = []) => ({ attempts: [], reports: [], drives,
  readiness: { overall_score: null, status: "incomplete", axis_scores: {}, not_assessed: [] } });
const drive = { id: "d1", company_name: "Razorpay", role_title: "Backend Developer", status: "active", interview_status: "open",
  interview_action: "start", is_locked: false, eligibility_status: "eligible", window_start_at: new Date().toISOString() };

async function open(page: Page, { pending = true, student = ready, drives = [drive] as unknown[] } = {}) {
  const saved: unknown[] = [];
  await page.route("**/api/**", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/student-me", route => route.fulfill({ json: { student } }));
  await page.route("**/api/student/dashboard", route => route.fulfill({ json: dashboard(drives) }));
  await page.route("**/api/student/product-tour", route => {
    if (route.request().method() === "POST") { saved.push(route.request().postDataJSON()); return route.fulfill({ json: { pending: false } }); }
    return route.fulfill({ json: { version: 1, pending } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Hello, Asha/ })).toBeVisible();
  return saved;
}
const tour = (page: Page) => page.getByRole("dialog", { name: /Welcome to VoiceDots|Start an AI interview|Your progress|placement drives|feedback|way forward|Interview practice|Placements|AI Coach|Resume Studio|Career coach|My performance|My reports|Calendar|My ERP|My profile|menu|Replay/ });

test("first visit opens the tour and Next walks through real features in order", async ({ page }) => {
  const saved = await open(page);
  await expect(page.getByRole("dialog", { name: "Welcome to VoiceDots, Asha!" })).toBeVisible();
  await expect(page.locator(".vt-count")).toHaveText("1 of 17");
  await page.getByRole("button", { name: "Show me around" }).click();
  await expect(page.getByRole("dialog", { name: "Start an AI interview" })).toBeVisible();
  // The spotlight sits on the real "Start an interview" button.
  const target = await page.locator('[data-testid="overview-hero"] .button.white').boundingBox();
  await expect.poll(async () => {
    const hole = await page.locator(".vt-hole").boundingBox();
    return hole && target ? Math.abs(hole.x + 8 - target.x) < 2 && Math.abs(hole.width - 16 - target.width) < 2 : false;
  }).toBe(true);
  const titles: string[] = [];
  for (let step = 2; step <= 17; step += 1) {
    titles.push((await page.locator("#vt-title").textContent()) || "");
    await page.getByRole("button", { name: step === 17 ? "Finish" : "Next" }).click();
  }
  expect(titles).toEqual(["Start an AI interview", "Your progress at a glance", "Latest placement drives", "Your latest feedback",
    "A simple way forward", "Interview practice", "Placements", "AI Coach", "Resume Studio", "Career coach", "My performance",
    "My reports", "Calendar", "My ERP", "My profile", "Replay this tour"]);
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => saved).toEqual([{ outcome: "completed" }]);
});

test("Back returns to the previous step and keyboard controls work", async ({ page }) => {
  const saved = await open(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#vt-title")).toHaveText("Your progress at a glance");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.locator("#vt-title")).toHaveText("Start an AI interview");
  await page.keyboard.press("Escape");
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => saved).toEqual([{ outcome: "skipped" }]);
});

test("skipping is remembered and the tour can be replayed from the top bar", async ({ page }) => {
  const saved = await open(page);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => saved).toEqual([{ outcome: "skipped" }]);
  await page.getByRole("link", { name: "My performance" }).click();
  await page.getByRole("button", { name: "Take the product tour" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("dialog", { name: "Welcome to VoiceDots, Asha!" })).toBeVisible();
});

test("a student who has seen the tour is not shown it again", async ({ page }) => {
  await open(page, { pending: false });
  await page.waitForTimeout(500);
  await expect(page.locator(".vt-root")).toHaveCount(0);
});

test("sections that are not on screen are skipped", async ({ page }) => {
  await open(page, { drives: [] });
  await expect(page.locator(".vt-count")).toHaveText("1 of 16");
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: /Show me around|Next/ }).click();
  await expect(page.locator("#vt-title")).toHaveText("Your latest feedback");
});

test("the tour waits for the profile setup prompt before starting", async ({ page }) => {
  await open(page, { student: { ...ready, photo_url: null, current_resume_submission_id: null } as never });
  await expect(page.getByRole("heading", { name: "Welcome, Asha!" })).toBeVisible();
  await expect(page.locator(".vt-root")).toHaveCount(0);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("dialog", { name: "Welcome to VoiceDots, Asha!" })).toBeVisible();
});

test("on a phone the tour uses a bottom sheet and points to the menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.locator(".vt-count")).toHaveText("1 of 8");
  const titles: string[] = [];
  for (let step = 0; step < 7; step += 1) {
    await page.getByRole("button", { name: /Show me around|Next/ }).click();
    titles.push((await page.locator("#vt-title").textContent()) || "");
  }
  expect(titles.slice(-2)).toEqual(["Everything else is in the menu", "Replay this tour"]);
  const card = await page.locator(".vt-card").boundingBox();
  expect(card!.x).toBeGreaterThanOrEqual(0);
  expect(card!.x + card!.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
  await expect.poll(async () => (await page.getByRole("button", { name: "Finish" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
