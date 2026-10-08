import { test, expect, type Page } from "@playwright/test";

const identity = { student: { id: "student-calendar", full_name: "Asha Kumar", email: "asha@example.edu", roll_number: "CS001", college_name: "Example College", program: "B.Tech", department_code: "CSE", graduation_year: 2027, cgpa: 8.6 } };

async function mockStudent(page: Page, options: { withEvents?: boolean } = {}) {
  await page.clock.setFixedTime(new Date("2026-10-06T08:00:00+05:30"));
  const personalEvents: any[] = [];
  const drives = options.withEvents === false ? [] : [{
    id: "drive-1", company_name: "Razorpay", role_title: "Backend Developer", status: "active",
    interview_status: "open", interview_action: "start", interview_result_available: true,
    window_start_at: "2026-10-06T14:48:00+05:30", window_end_at: "2026-10-06T16:00:00+05:30", location: "Bengaluru, Karnataka",
  }];
  const coachEvents = options.withEvents === false ? [] : [{
    id: "coach-1", date: "2026-10-06", time: "2026-10-06T18:30:00+05:30", title: "Python backend validation",
    subtitle: "Razorpay · Backend Developer", kind: "coach", status: "scheduled", duration_minutes: 30,
    plan_id: "plan-1", session_id: "plan-1:day:1",
  }];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/auth/student-me") return route.fulfill({ json: identity });
    if (path === "/api/student/drives") return route.fulfill({ json: drives });
    if (path === "/api/student/coach/calendar") return route.fulfill({ json: { events: coachEvents } });
    if (path === "/api/student/calendar/personal-events") {
      if (method === "POST") {
        const body = route.request().postDataJSON();
        const event = { id: `personal-${personalEvents.length + 1}`, ...body };
        personalEvents.push(event);
        return route.fulfill({ json: { event } });
      }
      return route.fulfill({ json: { events: personalEvents } });
    }
    if (path.startsWith("/api/student/calendar/personal-events/") && method === "PATCH") {
      const id = path.split("/").pop();
      const body = route.request().postDataJSON();
      const index = personalEvents.findIndex((event) => event.id === id);
      if (index < 0) return route.fulfill({ status: 404, json: { detail: "Not found" } });
      personalEvents[index] = { ...personalEvents[index], ...body };
      return route.fulfill({ json: { event: personalEvents[index] } });
    }
    if (path.startsWith("/api/student/calendar/personal-events/") && method === "DELETE") {
      const id = path.split("/").pop();
      const index = personalEvents.findIndex((event) => event.id === id);
      if (index >= 0) personalEvents.splice(index, 1);
      return route.fulfill({ json: { status: "deleted", id } });
    }
    if (path === "/api/student/reports") return route.fulfill({ json: { reports: [{ drive_id: "drive-1", submission_id: "submission-released", status: "completed" }] } });
    if (path === "/api/student/dashboard") return route.fulfill({ json: { reports: [], attempts: [], drives, readiness: { status: "incomplete", axis_scores: {}, not_assessed: [] } } });
    if (path === "/api/student/academics") return route.fulfill({ json: { status: "not_connected", message: "Not connected" } });
    if (path === "/api/student/readiness") return route.fulfill({ json: { status: "incomplete", axis_scores: {}, not_assessed: [] } });
    if (path === "/api/student/reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/student/coach/latest-recommendation") return route.fulfill({ json: { available: false } });
    if (path === "/api/student/coach/training-cycles") return route.fulfill({ json: { cycles: [] } });
    if (path === "/api/student/coach/overview") return route.fulfill({ json: { upcoming_drives: [], plans: [], completed_placements: [] } });
    return route.fulfill({ status: 404, json: { detail: "Not found" } });
  });
  return { personalEvents };
}

test.describe("Student Calendar", () => {
  test.use({ timezoneId: "Asia/Kolkata" });

  test("agenda is prominent on desktop and search/category filters affect both views", async ({ page }, testInfo) => {
    await page.clock.install({ time: new Date("2026-10-06T12:00:00+05:30") });
    await mockStudent(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/calendar");
    await page.screenshot({ path: testInfo.outputPath("calendar-desktop.png"), fullPage: true });
    await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
    const searchBox = await page.locator(".calendar-search").boundingBox();
    const searchInput = await page.getByRole("searchbox", { name: "Search events" }).boundingBox();
    expect(searchBox && searchInput).toBeTruthy();
    expect(Math.abs((searchInput!.y + searchInput!.height / 2) - (searchBox!.y + searchBox!.height / 2))).toBeLessThanOrEqual(1);
    await expect(page.locator(".calendar-search > svg")).toBeVisible();
    const agenda = await page.locator(".calendar-agenda").boundingBox();
    const calendar = await page.locator(".calendar-month").boundingBox();
    expect(agenda && calendar).toBeTruthy();
    expect(agenda!.x).toBeLessThan(calendar!.x);
    expect(agenda!.width).toBeGreaterThan(400);
    expect(agenda!.width / (agenda!.width + calendar!.width)).toBeGreaterThan(0.39);
    await expect(page.getByText("Backend Developer", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "AI Coach", exact: true }).click();
    await expect(page.getByRole("button", { name: "View Backend Developer" })).toHaveCount(0);
    await expect(page.locator('.calendar-card-main[aria-label="View Python backend validation"]')).toBeVisible();
    await expect(page.locator(".calendar-chip.placement")).toHaveCount(0);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search events" }).fill("razorpay");
    await expect(page.locator('.calendar-card-main[aria-label="View Backend Developer"]')).toBeVisible();
    await expect(page.locator('.calendar-card-main[aria-label="View Python backend validation"]')).toBeVisible();
  });

  test("date selection filters agenda and month navigation/view switching works", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-06T12:00:00+05:30") });
    await mockStudent(page);
    await page.goto("/calendar");
    const sixth = page.locator('.calendar-day[aria-label="Tue, 6 Oct 2026, 2 events"] .calendar-day-number');
    await sixth.click();
    await expect(page.locator(".calendar-date-filter")).toContainText("6 Oct 2026");
    await expect(page.locator(".calendar-agenda-group")).toContainText("Backend Developer");
    await page.getByRole("button", { name: "Next period" }).click();
    await expect(page.locator(".calendar-period-controls h2")).toContainText("November 2026");
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(page.locator(".calendar-grid.week")).toBeVisible();
    await page.getByRole("button", { name: "Day", exact: true }).click();
    await expect(page.locator(".calendar-grid.day")).toBeVisible();
    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    await expect(page.locator(".calendar-agenda-view")).toBeVisible();
  });

  test("personal event creates, persists on reload, edits and deletes with confirmation", async ({ page }) => {
    await mockStudent(page, { withEvents: false });
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Create Event" }).click();
    await page.getByLabel("Event title *").fill("Review database indexing");
    await page.getByLabel("Date *").fill("2026-10-06");
    await page.getByLabel("Start time *").fill("19:00");
    await page.getByLabel("End time *").fill("20:00");
    await page.getByLabel("Category").selectOption("study");
    await page.getByLabel("Location").fill("Library");
    await page.getByRole("button", { name: "Create event", exact: true }).click();
    await expect(page.locator('.calendar-card-main[aria-label="View Review database indexing"]')).toBeVisible();
    await expect(page.locator(".calendar-chip.personal")).toBeVisible();
    await page.reload();
    await expect(page.locator('.calendar-card-main[aria-label="View Review database indexing"]')).toBeVisible();
    await page.getByRole("button", { name: "More actions for Review database indexing" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await page.getByLabel("Event title *").fill("Review Postgres indexes");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator('.calendar-card-main[aria-label="View Review Postgres indexes"]')).toBeVisible();
    await page.getByRole("button", { name: "More actions for Review Postgres indexes" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Delete this event?" })).toBeVisible();
    await page.getByRole("button", { name: "Delete event" }).click();
    await expect(page.locator('.calendar-card-main[aria-label="View Review Postgres indexes"]')).toHaveCount(0);
  });

  test("all-day events hide times and submit an all-day date span", async ({ page }) => {
    await mockStudent(page, { withEvents: false });
    let created: any;
    page.on("request", request => { if (request.url().endsWith("/api/student/calendar/personal-events") && request.method() === "POST") created = request.postDataJSON(); });
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Create Event" }).click();
    await page.getByLabel("Event title *").fill("Full day workshop");
    await page.getByLabel("Date *").fill("2026-10-06");
    await page.getByLabel("All day").check();
    await expect(page.getByLabel("Start time *")).toHaveCount(0);
    await expect(page.getByLabel("End time *")).toHaveCount(0);
    await page.getByRole("button", { name: "Create event", exact: true }).click();
    await expect.poll(() => created?.all_day).toBe(true);
    expect(created.start_at).toBe("2026-10-05T18:30:00.000Z");
    expect(created.end_at).toBe("2026-10-06T18:30:00.000Z");
  });

  test("interview and Coach events are read-only and use the existing action flows", async ({ page }) => {
    await mockStudent(page);
    await page.goto("/calendar");
    await expect(page.locator('.calendar-event-card.placement button[aria-label^="More actions"]')).toHaveCount(0);
    await expect(page.locator('.calendar-event-card.coach button[aria-label^="More actions"]')).toHaveCount(0);
    await page.locator('.calendar-card-main[aria-label="View Backend Developer"]').click();
    await expect(page.getByRole("heading", { name: "Backend Developer", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Join / Continue" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View result" })).toHaveAttribute("href", /reports\?submission=submission-released/);
    await page.getByRole("dialog").getByRole("button", { name: "Close details" }).click();
    await page.locator('.calendar-card-main[aria-label="View Python backend validation"]').click();
    await expect(page.getByRole("heading", { name: "Python backend validation", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Open session" })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("dialog").getByRole("button", { name: "Delete" })).toHaveCount(0);
  });

  test("mobile puts the compact calendar before the event agenda", async ({ page }, testInfo) => {
    await mockStudent(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/calendar");
    await page.screenshot({ path: testInfo.outputPath("calendar-mobile.png"), fullPage: true });
    const calendar = await page.locator(".calendar-month").boundingBox();
    const agenda = await page.locator(".calendar-agenda").boundingBox();
    expect(calendar && agenda).toBeTruthy();
    expect(calendar!.y).toBeLessThan(agenda!.y);
    expect(calendar!.width).toBeLessThanOrEqual(390);
    await expect(page.getByRole("button", { name: "Create Event" })).toBeVisible();
  });
});
