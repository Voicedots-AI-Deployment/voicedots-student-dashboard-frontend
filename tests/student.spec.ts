import { test, expect, type Page } from "@playwright/test";

const identity = {
  student: {
    id: "student-1",
    full_name: "Asha Kumar",
    email: "asha@college.edu",
    roll_number: "CS2026001",
    college_name: "Example College of Engineering",
    program: "B.Tech",
    department_code: "CSE",
    graduation_year: 2027,
    cgpa: 8.6,
  },
};
const readiness = {
  overall_score: null,
  status: "incomplete",
  axis_scores: {},
  not_assessed: ["interview_readiness", "resume_readiness"],
};
const dashboard = { reports: [], attempts: [], readiness, drives: [] };

async function mockStudent(page: Page, options: { signedIn?: boolean } = {}) {
  let signedIn = options.signedIn ?? true;
  let passwordSetupCompleted = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/student-me")
      return route.fulfill({
        status: signedIn ? 200 : 401,
        json: signedIn ? identity : { detail: "Authentication required." },
      });
    if (
      path === "/api/auth/student-login" ||
      path === "/api/auth/student-enroll"
    ) {
      signedIn = true;
      return route.fulfill({ json: identity });
    }
    if (path === "/api/auth/student-password-setup-status") return route.fulfill({ json: { status: passwordSetupCompleted ? "completed" : "valid" } });
    if (path === "/api/auth/student-password-setup") { passwordSetupCompleted = true; return route.fulfill({ json: { status: "password_set" } }); }
    if (path === "/api/auth/student-password-link") return route.fulfill({ json: { status: "accepted" } });
    if (path === "/api/auth/student-logout") {
      signedIn = false;
      return route.fulfill({ json: { status: "ok" } });
    }
    const responses: Record<string, unknown> = {
      "/api/student/dashboard": dashboard,
      "/api/student/academics": {status:"not_connected",message:"Academic records are not connected yet."},
      "/api/student/readiness": readiness,
      "/api/student/drives": [],
      "/api/student/reports": { reports: [] },
      "/api/student/calendar/personal-events": { events: [] },
      "/api/student/resume-library": { resumes: [] },
      "/api/student/resume-library/identity-check": { matches:true,candidate_name:"Asha Kumar",student_name:"Asha Kumar" },
      "/api/student/practice/resumable": { attempts: [] },
      "/api/student/coach/latest-recommendation": { available: false, weak_skills: [], message: "Complete a placement interview to receive focused coaching recommendations." },
      "/api/student/coach/training-cycles": { cycles: [] },
      "/api/student/coach/overview": { upcoming_drives: [], plans: [], completed_drive_recommendation: null },
    };
    return route.fulfill({
      status: path in responses ? 200 : 404,
      json: responses[path] || { detail: "Not found." },
    });
  });
}

async function mockActiveResume(page: Page) {
  await page.route("**/api/student/resume-library", route => route.fulfill({ json: { resumes: [
    { resume_id: "resume-main-file", submission_id: "resume-main", label: "Active resume", original_filename: "active-resume.pdf", is_primary: true, uploaded_at: "2026-09-28T10:00:00Z" },
  ] } }));
  await page.route("**/api/student/resume-library/resume-main-file/file", route => route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4 active profile resume" }));
}

test("AI Coach opens a non-layout-shifting question drawer with provenance and local search", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/coach/overview", route => route.fulfill({ json: {
    upcoming_drives: [{ drive_id: "drive-q", company_name: "Example Co", role_title: "Backend Engineer", window_start_at: "2026-10-20T10:00:00Z" }],
    completed_placements: [], plans: [], main_resume: { submission_id: "resume-q", label: "Main Resume" },
  } }));
  await page.route("**/api/student/coach/drives/drive-q/context", route => route.fulfill({ json: {
    drive_id: "drive-q", company_name: "Example Co", role_title: "Backend Engineer", job_description: "Build APIs with PostgreSQL.", preparation_mode: "upcoming_placement",
  } }));
  await page.route("**/api/student/coach/drives/drive-q/previous-questions**", route => {
    const questions = [{ id: "question-1", question_text: "Explain REST APIs.", round_type: "Technical", canonical_skill: "REST APIs", difficulty: "Intermediate", report_count: 3, last_reported_at: "2026-02-01T00:00:00Z", source_type: "STUDENT_REPORTED", verified: false }];
    return route.fulfill({ json: { company_name: "Example Co", role_name: "Backend Engineer", count: questions.length, questions } });
  });
  await page.goto("/coach?drive=drive-q");
  const stepToolbar = page.locator(".coach-step-session-toolbar");
  await expect(stepToolbar).toContainText("STEP 1 OF 5");
  await expect(stepToolbar.getByRole("button", { name: /Previous Interview Questions/ })).toBeVisible();
  const open = page.getByRole("button", { name: /Previous Interview Questions/ });
  const toolbarBefore = await stepToolbar.boundingBox();
  await expect(open).toBeVisible();
  await open.click();
  expect(await stepToolbar.boundingBox()).toEqual(toolbarBefore);
  await expect(page.getByRole("dialog", { name: "Previous Interview Questions" })).toBeVisible();
  await expect(page.getByText("Example Co · Backend Engineer")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Explain REST APIs." })).toBeVisible();
  await expect(page.getByText("Reported in 3 interviews")).toBeVisible();
  await expect(page.getByText("Candidate reported")).toBeVisible();
  await expect(page.getByRole("button", { name: "System Design" })).toHaveCount(0);
  await page.getByLabel("Search questions").fill("missing phrase");
  await expect(page.getByText("No questions match this search.")).toBeVisible();
  await page.getByRole("button", { name: "Close previous interview questions" }).click();
  await expect(page.getByRole("dialog", { name: "Previous Interview Questions" })).toHaveCount(0);
});

test("AI Coach question drawer separates loading, empty, and retryable error states", async ({page}) => {
  await mockStudent(page);
  await page.route("**/api/student/coach/overview", route => route.fulfill({json:{upcoming_drives:[{drive_id:"drive-q",company_name:"Example Co",role_title:"Backend Engineer"}],completed_placements:[],plans:[],main_resume:{submission_id:"resume-q",label:"Main Resume"}}}));
  await page.route("**/api/student/coach/drives/drive-q/context", route => route.fulfill({json:{drive_id:"drive-q",company_name:"Example Co",role_title:"Backend Engineer",job_description:"Build APIs with PostgreSQL.",preparation_mode:"upcoming_placement"}}));
  let requestCount=0;
  let releaseFirstRequest!: () => void;
  const firstRequestGate = new Promise<void>(resolve => { releaseFirstRequest = resolve; });
  await page.route("**/api/student/coach/drives/drive-q/previous-questions", async route => { requestCount++; if(requestCount===1){await firstRequestGate;return route.fulfill({status:503,json:{detail:"unavailable"}});} return route.fulfill({json:{company_name:"Example Co",role_name:"Backend Engineer",count:0,questions:[]}}); });
  await page.goto("/coach?drive=drive-q");
  await page.getByRole("button",{name:/Previous Interview Questions/}).click();
  await expect(page.getByRole("dialog", { name: "Previous Interview Questions" }).getByRole("status")).toContainText("Loading previous interview questions");
  releaseFirstRequest();
  await expect(page.getByRole("alert")).toContainText("Previous interview questions couldn’t be loaded.");
  await page.getByRole("button",{name:"Retry"}).click();
  const drawer=page.getByRole("dialog",{name:"Previous Interview Questions"});
  await expect(drawer).toContainText("No previous interview questions are available for Example Co · Backend Engineer yet.");
  await expect(drawer.getByRole("button",{name:"All",exact:true})).toHaveCount(0);
  await expect(drawer.getByLabel("Search questions")).toHaveCount(0);
  expect(requestCount).toBe(2);
});

test("sign in uses student auth and restores the requested page", async ({
  page,
}) => {
  await mockStudent(page, { signedIn: false });
  await page.goto("/practice");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.getByLabel("Email").fill("asha@college.edu");
  await page.getByLabel("Password", { exact: true }).fill("MyStrongPassword1!");
  const login = page.waitForRequest("**/api/auth/student-login");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await login).headers()["x-portal-role"]).toBe("student");
  await expect(
    page.getByRole("heading", { name: "Let’s get you interview-ready" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("vd_student_data")!).id,
    ),
  ).toBe("student-1");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("vd_student_data")),
  ).toBeNull();
});

test("single-use emailed link sets a student password without roll-number verification", async ({ page }) => {
  await mockStudent(page, { signedIn: false });
  await page.goto("/?setup_token=single-use-test-token");
  await page.locator('input[name="password"]').fill("MyStrongPassword1!");
  await page.getByLabel("Confirm new password").fill("MyStrongPassword1!");
  const setup = page.waitForRequest("**/api/auth/student-password-setup");
  await page.getByRole("button", { name: "Save password" }).click();
  expect((await setup).postDataJSON()).toEqual({ token: "single-use-test-token", password: "MyStrongPassword1!" });
  await page.goto("/?setup_token=single-use-test-token");
  await expect(page.getByText("Password already created. Sign in with your password.")).toBeVisible();
  await page.getByRole("button", { name: "Return to sign in" }).click();
  await page.getByLabel("Email").fill("asha@college.edu");
  await page.getByRole("button", { name: "Email me a password setup or reset link" }).click();
  await expect(page.getByRole("status")).toContainText("email will arrive shortly");
});

test("overview is honest about missing data and is responsive", async ({
  page,
}) => {
  await mockStudent(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hello, Asha." }),
  ).toBeVisible();
  await expect(page.getByTestId("overview-kpis").getByText("—", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Your first insight is one interview away",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.screenshot({
    path: "test-results/overview-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const mobileLayout = await page.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    content: (() => {
      const main = document.querySelector<HTMLElement>(".dashboard-content")!;
      const actions = main.querySelector<HTMLElement>(".welcome-banner")!;
      const button = actions.querySelector<HTMLElement>(".button")!;
      return { main: main.getBoundingClientRect().toJSON(), actions: actions.getBoundingClientRect().toJSON(), button: button.getBoundingClientRect().toJSON(), display: getComputedStyle(actions).display, grid: getComputedStyle(actions).gridTemplateColumns, width: getComputedStyle(actions).width, minWidth: getComputedStyle(actions).minWidth };
    })(),
    overflowing: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 10)
      .map((element) => ({
        tag: element.tagName,
        className: typeof element.className === "string" ? element.className : "",
        right: Math.round(element.getBoundingClientRect().right),
        width: Math.round(element.getBoundingClientRect().width),
      })),
  }));
  expect(mobileLayout.fits, JSON.stringify(mobileLayout)).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({
    path: "test-results/profile-mobile.png",
    fullPage: true,
  });
});

test("overview follows the requested section order and keeps feedback percentage fitted", async ({ page }) => {
  await mockStudent(page);
  let interviewContextRequests = 0;
  await page.route("**/api/student/coach/overview", route => route.fulfill({ json: {
    upcoming_drives: [{ drive_id: "drive-1", company_name: "Example Co", role_title: "Data Analyst", job_description: "Analyze data and build dashboards for business teams.", window_start_at: "2026-10-01T10:00:00+05:30", has_coaching_plan: false }],
    plans: [],
    completed_drive_recommendation: null,
  } }));
  await page.route("**/api/student/drives/drive-1/interview-context", route => {
    interviewContextRequests += 1;
    return route.fulfill({ status: 404, json: { detail: "Placement drive assignment not found." } });
  });
  await page.route("**/api/student/dashboard", route => route.fulfill({ json: {
    reports: [{ evaluation_id: "report-1", session_id: "session-1", submission_id: "submission-1", status: "released", created_at: "2026-09-20T12:00:00Z", completed_at: "2026-09-20T12:30:00Z", target_role: "Data Analyst", drive_id: "drive-1", report: { overall_score: 21, status: "released", priority_improvement_areas: [{ focus: "SQL" }] } }],
    attempts: [{ submission_id: "sub-drive-1", session_id: "session-drive-1", target_role: "Data Analyst", duration_minutes: 30, submitted_at: "2026-09-26T09:00:00Z", drive_id: "drive-1", company_name: "Example Co", source: "placement" }],
    readiness: { ...readiness, overall_score: 72 },
    drives: [{ id: "drive-1", company_name: "Example Co", role_title: "Data Analyst", status: "active", interview_action: "start" }],
  } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hello, Asha." })).toBeVisible();
  await expect(page.getByTestId("overview-latest-drive")).toContainText("Data Analyst");
  await expect(page.getByTestId("overview-feedback").locator(".feedback-score strong")).toHaveText("21%");
  const overviewContentStarts = await page.evaluate(() => [
    document.querySelector(".page-heading")!,
    document.querySelector(".overview-drives")!,
    document.querySelector(".stats-grid")!,
  ].map(node => Math.round(node.getBoundingClientRect().left)));
  expect(Math.max(...overviewContentStarts) - Math.min(...overviewContentStarts)).toBeLessThanOrEqual(1);
  const order = await page.evaluate(() => [
    document.querySelector(".page-heading")!,
    document.querySelector("[data-testid='overview-hero']")!,
    document.querySelector("[data-testid='overview-kpis']")!,
    document.querySelector("[data-testid='overview-latest-drive']")!,
    document.querySelector("[data-testid='overview-feedback']")!,
    document.querySelector("[data-testid='overview-next-steps']")!,
  ].map(node => Array.from(document.querySelectorAll(".dashboard-content > *")).indexOf(node.parentElement?.classList.contains("overview-columns") ? node.parentElement : node)));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  const scoreFontSize = await page.getByTestId("overview-feedback").locator(".feedback-score strong").evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(scoreFontSize).toBeGreaterThanOrEqual(20);
  expect(scoreFontSize).toBeLessThanOrEqual(40);
  const scoreIsCentered = await page.getByTestId("overview-feedback").locator(".feedback-score").evaluate(circle => {
    const value = circle.querySelector("strong")!.getBoundingClientRect();
    const bounds = circle.getBoundingClientRect();
    return Math.abs((value.left + value.right) / 2 - (bounds.left + bounds.right) / 2) < 2;
  });
  expect(scoreIsCentered).toBe(true);
  await page.screenshot({path:"/root/voicedots/artifacts/overview-step/student-overview-corrected.png",fullPage:false});
  await page.evaluate(()=>window.scrollTo(0,document.querySelector('.overview-columns')!.getBoundingClientRect().top+window.scrollY-105));
  await page.screenshot({path:"/root/voicedots/artifacts/overview-step/student-overview-feedback-corrected.png"});
  await page.getByRole('button',{name:'Close navigation'}).click();
  await page.screenshot({path:"/root/voicedots/artifacts/overview-step/student-overview-sidebar-closed.png"});
  await page.getByRole('button',{name:'Open navigation'}).click();
  await expect(page.getByTestId("overview-latest-drive").getByRole("link", { name: /Start AI Interview/ })).toHaveAttribute("href", /\/practice\?drive=drive-1/);
  const resumableKpi = page.locator(".stat-card").filter({ hasText: "Interviews to resume" });
  await expect(resumableKpi.locator("strong")).toHaveText("1");
  await expect(page.getByRole("heading", { name: "Ready when you are" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Practice your focus areas" })).toHaveAttribute("href", "/coach");
  const quickActions = page.getByTestId("overview-next-steps").getByRole("link");
  await expect(quickActions).toHaveCount(5);
  await expect(page.getByTestId("overview-hero")).toBeVisible();
  await page.getByTestId("overview-latest-drive").getByRole("link", { name: /^AI Coach/ }).click();
  await expect(page.getByRole("heading", { name: "AI Coach" })).toBeVisible();
  await expect(page.getByLabel("Placement opportunity")).toBeVisible();
  await expect(page.getByText("Placement drive assignment not found.")).toHaveCount(0);
  expect(interviewContextRequests).toBe(0);
});

test("an unreleased placement report never offers an export", async ({
  page,
}) => {
  await mockStudent(page);
  await page.route("**/api/student/reports", (route) =>
    route.fulfill({
      json: {
        reports: [
          {
            evaluation_id: "e1",
            session_id: "s1",
            status: "released",
            drive_id: "d1",
            target_role: "Software engineer",
            created_at: "2026-09-01",
            report: { status: "awaiting_release" },
          },
        ],
      },
    }),
  );
  await page.goto("/reports");
  await expect(
    page.getByText("Awaiting release", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Open report/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Download PDF report/ })).toHaveCount(0);
  await expect(page.locator(".student-report-card__result strong")).toHaveText("Awaiting release");
});

test("a released placement report identifies the company and offers web and PDF views", async ({page}) => {
  await mockStudent(page);
  await page.route("**/api/student/reports", route => route.fulfill({json:{reports:[{
    evaluation_id:"e2",session_id:"s2",status:"released",drive_id:"d2",
    company_name:"Example Company",target_role:"Data Analyst",attempt_number:2,
    created_at:"2026-09-01",report:{status:"released",overall_score:82,readiness:"Ready"},
  }]}}));
  await page.goto("/reports");
  await expect(page.getByText("Example Company · Data Analyst")).toBeVisible();
  await expect(page.getByText(/Attempt 2/)).toBeVisible();
  await expect(page.getByRole("link",{name:"Open report for Data Analyst"})).toHaveAttribute("href","/reports/s2");
  await expect(page.getByRole("link",{name:"Download PDF report for Data Analyst"})).toHaveAttribute("href",/\/s2\/evaluation\/report.pdf$/);
});

test("reports show a scannable overview and search and filter the report list", async ({page}) => {
  await mockStudent(page);
  await page.route("**/api/student/reports", route => route.fulfill({json:{reports:[
    {evaluation_id:"practice-1",session_id:"s-practice",status:"released",target_role:"Python Developer",created_at:"2026-09-01",report:{status:"released",overall_score:76,readiness:"Ready",executive_summary:"Clear project examples.",priority_improvement_areas:[{focus:"Testing"}]}},
    {evaluation_id:"placement-1",session_id:"s-placement",status:"released",drive_id:"d1",company_name:"Northwind",target_role:"Data Analyst",created_at:"2026-09-02",report:{status:"released",overall_score:88,readiness:"Ready"}},
    {evaluation_id:"pending-1",session_id:"s-pending",status:"released",drive_id:"d2",company_name:"Contoso",target_role:"Software Engineer",created_at:"2026-09-03",report:{status:"awaiting_release"}},
  ]}}));
  await page.goto("/reports");
  await expect(page.getByRole("heading",{name:"Reports & feedback"})).toBeVisible();
  await expect(page.locator(".student-reports-overview article").nth(0)).toContainText("3");
  await expect(page.locator(".student-reports-overview article").nth(1)).toContainText("2");
  await expect(page.locator(".student-reports-overview article").nth(2)).toContainText("1");
  await expect(page.locator(".student-report-card")).toHaveCount(3);
  await expect(page.locator(".student-report-focus")).toHaveCount(0);
  await page.getByLabel("Interview type").selectOption("placement");
  await expect(page.locator(".student-report-card")).toHaveCount(2);
  await page.getByLabel("Search reports").fill("northwind");
  await expect(page.locator(".student-report-card")).toHaveCount(1);
  await expect(page.locator(".student-report-card")).toContainText("Northwind");
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth",390);
});

test("upload polls a durable operation across refresh and opens the existing session", async ({
  page,
  context,
}) => {
  await mockStudent(page);
  await context.addCookies([
    {
      name: "vd_student_csrf",
      value: "test-csrf",
      url: "http://127.0.0.1:5175",
    },
  ]);
  let prepared = false;
  let uploads = 0;
  await page.route("**/api/student/interview/start", async (route) => {
    uploads += 1;
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
    await route.fulfill({
      status: 202,
      json: {
        status: "in_progress",
        stage: "analyzing_resume",
        operation_id: "op-1",
        submission_id: "sub-1",
      },
    });
  });
  await page.route("**/api/student/interview/preparation/op-1", (route) =>
    route.fulfill({
      status: prepared ? 200 : 202,
      json: prepared
        ? { status: "ready", submission_id: "sub-1", session_id: "session-1" }
        : {
            status: "in_progress",
            operation_id: "op-1",
            stage: "generating_questions",
          },
    }),
  );
  await mockActiveResume(page);
  await page.goto("/practice");
  await expect(page.getByText("active-resume.pdf")).toBeVisible();
  await page
    .getByLabel("Target role", { exact: true })
    .fill("Software engineer");
  await page.getByRole("button", { name: "Start practice interview" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Preparing your personalized questions",
    }),
  ).toBeVisible();
  await page.reload();
  prepared = true;
  await expect(
    page.getByRole("heading", { name: "Your panel is ready." }),
  ).toBeVisible();
  expect(uploads).toBe(1);
  await page.route("**/interview.html?**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Device check</h1>" }),
  );
  await page.getByRole("button", { name: "Continue to device check" }).click();
  await expect(page).toHaveURL(/interview.html\?id=sub-1&session_id=session-1/);
});

test("practice generates a clean role JD without references and preserves manual text on error", async ({ page }) => {
  await mockStudent(page);
  await mockActiveResume(page);
  await page.route("**/api/student/practice/job-description", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    expect(route.request().postDataJSON()).toEqual({ role_title: "AI Engineer" });
    return route.fulfill({ json: { role_title: "AI Engineer", job_description: "AI Engineer\n\nResponsibilities\nBuild and evaluate AI systems.\n\nRequired qualifications\nPython and machine learning experience." } });
  });
  await page.goto("/practice");
  const jdLabelRow = page.locator(".practice-jd-label-row");
  await expect(jdLabelRow.getByText("Job description")).toBeVisible();
  const generate = page.getByRole("button", { name: "Generate latest JD" });
  await expect(jdLabelRow.getByRole("button", { name: "Generate latest JD" })).toBeVisible();
  await expect(generate).toBeDisabled();
  await page.getByLabel("Target role", { exact: true }).fill("AI Engineer");
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(page.getByLabel("Job description")).toContainText("Build and evaluate AI systems");
  await expect(page.getByLabel("Job description")).toContainText("Required qualifications");
  await expect(page.getByRole("link", { name: "Recent AI Engineer listing" })).toHaveCount(0);
  await expect(page.getByText(/not an employer’s official posting/)).toHaveCount(0);
  await page.getByLabel("Job description").fill("My manually edited description");
  await expect(page.getByRole("link", { name: "Recent AI Engineer listing" })).toHaveCount(0);
  await page.route("**/api/student/practice/job-description", route => route.fulfill({ status: 502, json: { detail: "Current listings are temporarily unavailable. Your form has not changed; please retry." } }));
  await generate.click();
  await expect(page.getByRole("alert")).toContainText("Current listings are temporarily unavailable");
  await expect(page.getByLabel("Job description")).toHaveValue("My manually edited description");
});

test("practice clearly labels a saved JD used when current listings cannot be refreshed", async ({ page }) => {
  await mockStudent(page);
  await mockActiveResume(page);
  await page.route("**/api/student/practice/job-description", route => route.fulfill({ json: {
    role_title: "Data Analyst",
    job_description: "Saved role JD",
    cache_status: "stale_fallback",
    generated_at: "2026-09-28T12:00:00+00:00",
  } }));
  await page.goto("/practice");
  await page.getByLabel("Target role", { exact: true }).fill("Data Analyst");
  await page.getByRole("button", { name: "Generate latest JD" }).click();
  await expect(page.getByLabel("Job description")).toHaveValue("Saved role JD");
  await expect(page.getByRole("status")).toContainText("Current listings could not be refreshed");
  await expect(page.getByRole("status")).toContainText("9/28/2026");
});

test("My growth readiness appears on Overview, not in sidebar or a separate page", async ({ page }) => {
  await mockStudent(page);
  let readiness: Record<string, unknown> = { overall_score: 72, axis_scores: { interview_readiness: 68, resume_readiness: 76 } };
  await page.route("**/api/student/readiness", route => route.fulfill({ json: readiness }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My growth" })).toBeVisible();
  await expect(page.getByRole("link", { name: "My growth" })).toHaveCount(0);
  await page.goto("/growth");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "My growth" })).toBeVisible();
  readiness = {};
  await page.reload();
  await expect(page.getByRole("heading", { name: "My growth" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
});

test("practice View resume opens an in-page preview of the active PDF", async ({ page }) => {
  await mockStudent(page);
  await mockActiveResume(page);
  await page.goto("/practice");
  await page.getByRole("button", { name: "View resume" }).click();
  const dialog = page.getByRole("dialog", { name: /active-resume\.pdf/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("iframe")).toHaveAttribute("title", "Resume preview: active-resume.pdf");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("resume clarification is saved before continuing preparation", async ({
  page,
}) => {
  await mockStudent(page);
  await page.route("**/api/student/interview/start", (route) =>
    route.fulfill({
      json: {
        status: "needs_clarification",
        submission_id: "sub-1",
        source_extraction_id: "extract-1",
        clarification_required: true,
        prompts: [
          {
            entry_id: "project-1",
            name: "Weather app",
            missing_fields: ["ownership"],
          },
        ],
      },
    }),
  );
  await page.route("**/api/resume/sub-1/amendments", (route) =>
    route.fulfill({ json: { status: "ok" } }),
  );
  await page.route("**/api/student/interview/sub-1/prepare", (route) =>
    route.fulfill({
      json: { status: "ready", submission_id: "sub-1", session_id: "s1" },
    }),
  );
  await mockActiveResume(page);
  await page.goto("/practice");
  await page
    .getByLabel("Target role", { exact: true })
    .fill("Software engineer");
  await page.getByRole("button", { name: "Start practice interview" }).click();
  await page
    .getByLabel("What was your personal contribution?")
    .fill("I built the API and wrote integration tests.");
  const amendment = page.waitForRequest("**/api/resume/sub-1/amendments");
  await page.getByRole("button", { name: "Save and continue" }).click();
  expect((await amendment).postDataJSON().answers[0].entry_id).toBe(
    "project-1",
  );
  await expect(
    page.getByRole("heading", { name: "Your panel is ready." }),
  ).toBeVisible();
});

test("eligibility without assignment is explained and does not enable interview start", async ({
  page,
}) => {
  await mockStudent(page);
  await page.route("**/api/student/drives", (route) =>
    route.fulfill({
      json: [
        {
          id: "d1",
          company_name: "Example Company",
          role_title: "Graduate engineer",
          status: "active",
          eligibility_status: "eligible",
        },
      ],
    }),
  );
  await page.route("**/api/student/drives/d1/interview-context", route => route.fulfill({ json: {
    drive_id: "d1", attempt_number: 1, max_attempts: 5, attempts_used: 0, attempts_remaining: 5,
    action: "not_assigned", assignment_status: "not_assigned", current_attempt: null, attempt_history: [],
    can_start: false, can_resume: false, eligibility: { status: "eligible" }, interview_window: "open", main_resume_required: true, main_resume_available: true,
  } }));
  await page.goto("/placements");
  await page.getByRole("button", { name: "View opportunity" }).click();
  await expect(
    page.getByText(/hasn’t assigned an interview attempt yet/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare for interview" }),
  ).toHaveCount(0);
});

test("Coach-required score rule keeps the next placement attempt locked", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [
    { id: "drive-coach", company_name: "Example Company", role_title: "Graduate engineer", status: "active", eligibility_status: "eligible" },
  ] }));
  await page.route("**/api/student/drives/drive-coach/interview-context", route => route.fulfill({ json: {
    drive_id: "drive-coach", company_name: "Example Company", role_title: "Graduate engineer",
    action: "blocked", assignment_status: "completed", attempt_number: 1, max_attempts: 2,
    attempts_used: 1, attempts_remaining: 1, attempt_history: [{ attempt_number: 1, submission_id: "sub-1" }],
    coach_gate_required: true, coach_gate_complete: false, coach_gate_locked: true,
    lock_reason: "ai_coach_required", eligibility: { status: "eligible" }, interview_window: "open",
    main_resume_required: true, main_resume_available: true,
    can_start: false, can_resume: false,
  } }));
  await page.goto("/placements");
  await page.getByRole("button", { name: "View opportunity" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Complete the required AI Coach preparation to unlock your next attempt")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Continue with AI Coach" })).toHaveAttribute("href", "/coach?drive=drive-coach");
  await expect(dialog.getByRole("button", { name: /Start attempt/ })).toHaveCount(0);
  await expect(dialog.getByText(/Your assignment is blocked/)).toHaveCount(0);
});

test("API failures show retry and expired sessions return to sign in", async ({
  page,
}) => {
  await mockStudent(page);
  await page.route("**/api/student/dashboard", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Student service temporarily unavailable." },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Student service temporarily unavailable.",
  );
  await page.route("**/api/student/dashboard", (route) =>
    route.fulfill({ json: dashboard }),
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your first insight is one interview away",
    }),
  ).toBeVisible();
  await page.route("**/api/student/reports", (route) =>
    route.fulfill({ status: 401, json: { detail: "Session expired." } }),
  );
  await page.getByRole("link", { name: "My reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Your session has expired.",
  );
});

test("campus placements show eligible drives only and filter by interview window", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [
    { id: "eligible-open", company_name: "Zoho", role_title: "Data Analyst", status: "active", eligibility_status: "eligible", job_type: "full_time", salary_currency: "INR", salary_min_amount: 500000, salary_max_amount: 700000, salary_period: "annual" },
    { id: "eligible-upcoming", company_name: "Razorpay", role_title: "Backend Developer", status: "scheduled", eligibility_status: "eligible", job_type: "internship" },
    { id: "ineligible", company_name: "VoiceDot", role_title: "Software Engineer", status: "active", eligibility_status: "ineligible" },
  ] }));
  await page.goto("/placements");
  await expect(page.getByRole("heading", { name: "Data Analyst" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Backend Developer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Software Engineer" })).toHaveCount(0);
  await expect(page.getByText("2 opportunities")).toBeVisible();
  await page.getByLabel("Interview status").selectOption("open");
  await expect(page.getByRole("heading", { name: "Data Analyst" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Backend Developer" })).toHaveCount(0);
  const topbar = page.locator(".dashboard-topbar");
  const scrollPosition = await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); return window.scrollY; });
  expect(scrollPosition).toBeGreaterThan(0);
  expect(await topbar.evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(0);
});

test("closed eligible drives remain viewable without offering an interview start", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [
    { id: "closed-drive", company_name: "VoiceDot", role_title: "Software Engineer", status: "closed", interview_status: "closed", interview_action: "not_assigned", eligibility_status: "eligible" },
  ] }));
  await page.route("**/api/student/drives/closed-drive/interview-context", route => route.fulfill({ json: {
    drive_id: "closed-drive", company_name: "VoiceDot", role_title: "Software Engineer", action: "not_assigned",
    attempt_number: 1, max_attempts: 2, attempts_used: 0, attempts_remaining: 2, attempt_history: [],
    eligibility: { status: "eligible" }, interview_window: "closed", can_start: false, can_resume: false, main_resume_required: true, main_resume_available: true,
  } }));
  await page.goto("/placements");
  await expect(page.getByRole("heading", { name: "Software Engineer" })).toBeVisible();
  await page.getByLabel("Interview status").selectOption("closed");
  await expect(page.getByText("Interview closed")).toBeVisible();
  await page.getByRole("button", { name: "View opportunity" }).click();
  await expect(page.getByText("This placement drive is closed. No further interview action is available.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start interview" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume interview" })).toHaveCount(0);
});

test("overview never offers interview actions for a closed drive", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/dashboard", route => route.fulfill({ json: {
    reports: [], attempts: [], readiness, drives: [
      { id: "closed-drive", company_name: "VoiceDot", role_title: "Software Engineer", status: "closed", interview_status: "closed", interview_action: "blocked" },
    ],
  } }));
  await page.goto("/");
  const latest = page.getByTestId("overview-latest-drive");
  await expect(latest).toHaveCount(0);
  await expect(latest.getByRole("link", { name: /Start AI Interview|Resume interview/ })).toHaveCount(0);
  await expect(latest.getByRole("link", { name: /^AI Coach/ })).toHaveCount(0);
});

test("placement opportunity shows full details and a truthful unassigned attempt state", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [
    { id: "zoho", company_name: "Zoho", company_description: "A product company", role_title: "Data Analyst", status: "active", eligibility_status: "eligible", criteria_min_cgpa: 7.5, criteria_department_codes: ["CSE"], criteria_graduation_years: [2027], criteria_required_skills: ["SQL", "Python"], criteria_min_skill_matches: 1, criteria_require_resume: true, location: "Chennai", job_type: "full_time", window_start_at: "2026-10-01T09:00:00+05:30", window_end_at: "2026-10-05T17:00:00+05:30", application_deadline: "2026-09-30T17:00:00+05:30", interview_duration_minutes: 30, difficulty_tier: "intermediate", agent_selection: [{ track: "hr", agent_id: "private-persona-id" }, { track: "domain", agent_id: "private-persona-id-2" }], salary_type: "range", salary_min_amount: 500000, salary_max_amount: 700000, salary_currency: "INR", salary_period: "annual" },
  ] }));
  await page.route("**/api/student/drives/zoho/interview-context", route => route.fulfill({ json: {
    drive_id: "zoho", company_name: "Zoho", company_description: "A product company", company_website: "https://zoho.example", company_linkedin: "https://linkedin.com/company/zoho", role_title: "Data Analyst",
    job_description: "Analyze data", duration_minutes: null, attempt_number: 1, max_attempts: 1,
    action: "not_assigned", assignment_status: "not_assigned", attempts_used: 0, attempts_remaining: 1,
    attempt_history: [], current_attempt: null, eligibility: { status: "eligible" }, difficulty_tier: "intermediate",
    round_count: 2, can_start: false, can_resume: false, publication_status: "unavailable", decision: "undecided",
    interview_window: "open", location: "Chennai", main_resume_required: true, main_resume_available: true,
  } }));
  await page.goto("/placements");
  await page.getByRole("button", { name: "View opportunity" }).click();
  const opportunityDialog = page.getByRole("dialog");
  await expect(opportunityDialog.getByText(/₹5,00,000/).first()).toBeVisible();
  await expect(opportunityDialog.getByText("Interview process")).toBeVisible();
  await expect(opportunityDialog.getByText("Application deadline")).toBeVisible();
  await expect(opportunityDialog.getByText("Talent Acquisition Specialist")).toBeVisible();
  await expect(opportunityDialog.getByText("Senior Domain Specialist")).toBeVisible();
  await expect(opportunityDialog.getByText("private-persona-id", { exact: true })).toHaveCount(0);
  await expect(opportunityDialog.getByText(/0 completed · 1 remaining · Awaiting assignment/)).toBeVisible();
  await expect(opportunityDialog.getByRole("link", { name: /Visit company website/ })).toHaveAttribute("href", "https://zoho.example/");
  await expect(opportunityDialog.getByRole("link", { name: /Company on LinkedIn/ })).toHaveAttribute("href", "https://linkedin.com/company/zoho");
  await expect(opportunityDialog.getByText("OPPORTUNITY SNAPSHOT")).toBeVisible();
  await expect(opportunityDialog.getByText("Eligibility criteria")).toBeVisible();
  await expect(opportunityDialog.getByText("Skills considered: SQL, Python · Match at least 1")).toBeVisible();
  await expect(opportunityDialog).toHaveCSS("width", /\d+px/);
  await expect(opportunityDialog.getByText("Attempts remaining")).toHaveCount(0);
  await expect(opportunityDialog.getByRole("button", { name: "Resume interview" })).toHaveCount(0);
});

test("completed placement attempt unlocks only the next attempt and released results", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [
    { id: "zoho", company_name: "Zoho", role_title: "Data Analyst", status: "active", interview_status: "open", interview_action: "start", interview_assignment_status: "completed", eligibility_status: "eligible", interview_attempt_number: 1, interview_max_attempts: 3, interview_attempts_used: 1, interview_attempts_remaining: 2, interview_completed_attempts: 1, interview_next_attempt_number: 2, window_start_at: "2026-10-01T09:00:00+05:30", window_end_at: "2026-10-05T17:00:00+05:30" },
  ] }));
  await page.route("**/api/student/drives/zoho/interview-context", route => route.fulfill({ json: {
    drive_id: "zoho", company_name: "Zoho", company_description: "", role_title: "Data Analyst", job_description: "Analyze data",
    duration_minutes: 30, attempt_number: 1, max_attempts: 3, action: "start", assignment_status: "completed",
    attempts_used: 1, attempts_remaining: 2, completed_attempts: 1, current_attempt_number: null, next_attempt_number: 2,
    attempt_history: [{ attempt_number: 1, submission_id: "released-submission", completed_at: "2026-10-02T10:00:00Z", evaluation_status: "released", result_available: true }],
    current_attempt: null, eligibility: { status: "eligible" }, difficulty_tier: "intermediate", round_count: 1,
    can_start: true, can_resume: false, publication_status: "released", decision: "undecided", interview_window: "open", main_resume_required: true, main_resume_available: true,
  } }));
  await page.goto("/placements");
  await expect(page.getByText("Active now")).toBeVisible();
  await page.getByRole("button", { name: "View opportunity" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("1 completed · 2 remaining")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "View result" })).toHaveAttribute("href", "/reports?submission=released-submission");
  await expect(dialog.getByText("1 more attempt")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Start Attempt 2" })).toHaveCount(1);
  await expect(dialog.getByText("Attempt 3", { exact: true })).toHaveCount(0);
});

test("placement search and filters share aligned labels and controls on desktop and tablet", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [] }));
  await page.goto("/placements");
  for (const width of [1440, 1024, 820]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 1440) await page.screenshot({ path: "test-results/placement-filters-desktop.png", fullPage: true });
    const bounds = await page.locator(".placement-filter-grid label").evaluateAll(labels => labels.map(label => {
      const labelBox = label.getBoundingClientRect();
      const controlBox = label.querySelector("input, select")!.getBoundingClientRect();
      return { labelTop: labelBox.top, controlTop: controlBox.top, controlHeight: controlBox.height };
    }));
    expect(bounds).toHaveLength(3);
    expect(Math.max(...bounds.map(item => item.labelTop)) - Math.min(...bounds.map(item => item.labelTop))).toBeLessThanOrEqual(1);
    expect(Math.max(...bounds.map(item => item.controlTop)) - Math.min(...bounds.map(item => item.controlTop))).toBeLessThanOrEqual(1);
    expect(bounds.every(item => item.controlHeight === 42)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test("placement filters align on phone and interview status filters persisted states", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [
    { id: "open", company_name: "Zoho", role_title: "Data Analyst", status: "active", eligibility_status: "eligible", interview_status: "open" },
    { id: "progress", company_name: "Razorpay", role_title: "Backend Developer", status: "active", eligibility_status: "eligible", interview_status: "in_progress", interview_assignment_status: "in_progress", interview_attempt_number: 2, interview_max_attempts: 5, interview_attempts_used: 2, interview_attempts_remaining: 3 },
    { id: "done", company_name: "Acme", role_title: "QA Engineer", status: "active", eligibility_status: "eligible", interview_status: "completed", interview_assignment_status: "completed", interview_attempt_number: 2, interview_max_attempts: 3, interview_attempts_used: 2, interview_attempts_remaining: 1 },
  ] }));
  let contextRequests = 0;
  await page.route("**/api/student/drives/*/interview-context", route => { contextRequests += 1; return route.fulfill({ status: 404, json: { detail: "not found" } }); });
  await page.goto("/placements");
  await expect(page.getByRole("heading", { name: "Data Analyst" })).toBeVisible();
  await expect(page.getByText("Eligible", { exact: true }).first()).toHaveCSS("color", "rgb(22, 116, 71)");
  await expect(page.getByLabel("Search opportunities")).toBeVisible();
  await expect(page.getByLabel("Interview status")).toBeVisible();
  await expect(page.getByLabel("Sort by")).toBeVisible();
  await expect(page.getByText("Location", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Eligibility", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Backend Developer" })).toBeVisible();
  await expect(page.locator(".drive-card").filter({ has: page.getByRole("heading", { name: "Backend Developer" }) })).toContainText("1 completed · Attempt 2 in progress · 3 remaining");
  await expect(page.locator(".drive-card").filter({ has: page.getByRole("heading", { name: "QA Engineer" }) })).toContainText("2 completed · 1 remaining");
  expect(contextRequests).toBe(0);
  await page.getByLabel("Interview status").selectOption("in_progress");
  await expect(page.getByRole("heading", { name: "Backend Developer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Data Analyst" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const filterBounds = await page.locator(".placement-filter-grid label").evaluateAll(labels => labels.map(label => {
    const box = label.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width };
  }));
  expect(filterBounds.every(bounds => bounds.width > 0 && bounds.left >= 0 && bounds.right <= 390)).toBe(true);
});

test("placement cards align their opportunity buttons and missing Main Resume routes to My Profile", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [
    { id: "resume-required", company_name: "Razorpay", role_title: "Project Manager", status: "active", eligibility_status: "resume_required", main_resume_required: true, main_resume_available: false, interview_status: "open", interview_action: "start", interview_max_attempts: 5, interview_attempts_remaining: 5, interview_completed_attempts: 0, criteria_require_resume: false },
    { id: "second", company_name: "Example", role_title: "Senior Software Engineer with a longer role title", status: "active", eligibility_status: "eligible", main_resume_required: true, main_resume_available: true, interview_status: "open", interview_action: "start", interview_max_attempts: 3, interview_attempts_remaining: 3, interview_completed_attempts: 0 },
    { id: "third", company_name: "Acme", role_title: "Analyst", status: "active", eligibility_status: "eligible", main_resume_required: true, main_resume_available: true, interview_status: "open", interview_action: "start", interview_max_attempts: 2, interview_attempts_remaining: 2, interview_completed_attempts: 0 },
  ] }));
  await page.route("**/api/student/drives/resume-required/interview-context", route => route.fulfill({ json: {
    drive_id: "resume-required", company_name: "Razorpay", role_title: "Project Manager", job_description: "", duration_minutes: 30,
    action: "start", interview_window: "open", can_start: true, can_resume: false, main_resume_required: true, main_resume_available: false,
    attempt_number: 1, max_attempts: 5, attempts_used: 0, completed_attempts: 0, attempts_remaining: 5,
    attempt_history: [], assignment_status: "assigned", publication_status: "unavailable", decision: "undecided",
  } }));

  await page.goto("/placements");
  const cards = page.locator(".drive-card");
  await expect(cards).toHaveCount(3);
  const buttonTops = await cards.locator(":scope > .button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
  expect(Math.max(...buttonTops) - Math.min(...buttonTops)).toBeLessThanOrEqual(1);
  await expect(cards.first()).toContainText("Main Resume required");
  await expect(cards.first().getByRole("link", { name: "My Profile" })).toHaveAttribute("href", "/profile");

  await cards.first().getByRole("button", { name: /View opportunity/ }).click();
  await expect(page.getByText("A Main Resume is required for every placement interview.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to My Profile" })).toHaveAttribute("href", "/profile");
  await expect(page.getByRole("button", { name: /Start interview/ })).toHaveCount(0);
  await expect(page.getByText("Resume not required", { exact: true })).toHaveCount(0);
});

test("replacing an active login requires selecting the replacement checkbox", async ({
  page,
}) => {
  await mockStudent(page, { signedIn: false });
  await page.route("**/api/auth/student-login", (route) => {
    if (!route.request().postDataJSON().replace_active_session)
      return route.fulfill({
        status: 409,
        json: {
          detail: {
            code: "ACTIVE_SESSION_EXISTS",
            message: "You have an active session elsewhere.",
          },
        },
      });
    return route.fallback();
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("asha@college.edu");
  await page.getByLabel("Password", { exact: true }).fill("MyStrongPassword1!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const replacement = page.getByRole("checkbox", {
    name: "End my previous session and sign in here",
  });
  await expect(replacement).not.toBeChecked();
  await replacement.check();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Asha." }),
  ).toBeVisible();
});

test("retrying an ambiguous upload reuses its idempotency key", async ({
  page,
}) => {
  await mockStudent(page);
  const keys: string[] = [];
  await page.route("**/api/student/interview/start", (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    return keys.length === 1
      ? route.fulfill({ status: 503, json: { detail: "Please retry." } })
      : route.fulfill({
          json: { status: "ready", submission_id: "sub-1", session_id: "s1" },
        });
  });
  await mockActiveResume(page);
  await page.goto("/practice");
  await page
    .getByLabel("Target role", { exact: true })
    .fill("Software engineer");
  await page.getByRole("button", { name: "Start practice interview" }).click();
  await expect(
    page.getByRole("heading", { name: "Your panel is ready." }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

test("placement interview setup is read-only and comes from the selected drive", async ({ page }) => {
  await mockStudent(page);
  await mockActiveResume(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [{
    id: "d1", company_name: "Example Company", role_title: "Graduate engineer", status: "active",
    eligibility_status: "eligible", main_resume_available: true, interview_action: "start",
    interview_status: "open", interview_duration_minutes: 45, interview_max_attempts: 2,
  }] }));
  await page.route("**/api/student/drives/d1/interview-context", route => route.fulfill({ json: {
    drive_id: "d1", company_name: "Example Company", role_title: "Graduate engineer",
    job_description: "Frozen campaign job description.", duration_minutes: 45,
    action: "start", can_start: true, can_resume: false, interview_window: "open",
    interview_window_start_at: "2026-10-05T10:00:00+05:30", interview_window_end_at: "2026-10-08T18:00:00+05:30",
    attempt_number: 1, max_attempts: 2, attempts_used: 0, attempts_remaining: 2,
    main_resume_required: true, main_resume_available: true,
    interview_panel: [{ order: 1, track: "hr", name: "Priya Sharma", role: "People Partner", persona: "warm", description: "Welcome." }],
  } }));
  await page.goto("/practice?drive=d1");
  await expect(page.getByRole("tab", { name: "Placement Interview" })).toHaveAttribute("aria-selected", "true");
  await page.locator(".placement-jd-details summary").click();
  await expect(page.getByText("Frozen campaign job description.")).toBeVisible();
  await expect(page.getByLabel("Select placement opportunity")).toHaveValue("d1");
  await expect(page.getByLabel("Target role", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Interview duration")).toHaveCount(0);
  await expect(page.getByLabel("Job description")).toHaveCount(0);
  await expect(page.locator(".placement-panel-person")).toHaveCount(1);
  await expect(page.getByText("People Partner")).toBeVisible();
  await expect(page.locator(".interview-active-resume")).toHaveCount(1);
  await page.getByRole("tab", { name: "Practice Interview" }).click();
  await expect(page.getByLabel("Target role", { exact: true })).toBeEditable();
  await expect(page.getByLabel("Interview duration")).toBeEnabled();
  await expect(page.locator(".panel-person")).toHaveCount(4);
});

test("the real interview runtime restores a new-tab identity and loads device checks", async ({
  page,
}) => {
  await mockStudent(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("No test camera", "NotAllowedError");
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/interview.html?id=sub-1&session_id=s1");
  await expect(
    page.getByRole("heading", { name: "Start AI Interview" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(sessionStorage.getItem("vd_student_data") || "{}").id,
      ),
    )
    .toBe("student-1");
  const logo = page.locator(".topbar-brand img");
  await expect(logo).toHaveAttribute("src", "/voicedotslogo.svg");
  expect(
    await logo.evaluate(
      (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("restores the API-host CSRF token without a frontend cookie", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/auth/student-me", (route) => route.fulfill({
    json: { ...identity, csrf_token: "api-host-csrf" },
  }));
  let signedOut = false;
  await page.route("**/api/auth/student-logout", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("api-host-csrf");
    expect(new URL(route.request().url()).origin).toBe(
      process.env.VITE_API_URL || new URL(page.url()).origin,
    );
    signedOut = true;
    await route.fulfill({ json: { status: "ok" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  expect(signedOut).toBe(true);
});

test("sidebar keeps the account visible at desktop and short viewport heights", async ({ page }) => {
  await mockStudent(page);
  for (const [width, height] of [[1280, 720], [954, 935], [768, 650]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/practice");
    await expect(page.getByRole("heading", { name: "Let’s get you interview-ready" })).toBeVisible();
    const layout = await page.locator(".sidebar").evaluate(el => {
      const account = el.querySelector(".sidebar-account")!.getBoundingClientRect();
      return { overflow: el.scrollHeight - el.clientHeight, accountBottom: account.bottom, accountTop: account.top };
    });
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.accountBottom).toBeLessThanOrEqual(height);
    expect(layout.accountTop).toBeGreaterThan(0);
  }
});

test("wider desktop sidebar stays aligned and does not overflow tablet or mobile layouts", async ({ page }) => {
  await mockStudent(page);
  for (const [width, expectedSidebarWidth] of [[1440, 264], [1024, 218]]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/practice");
    await expect(page.getByRole("heading", { name: "Let’s get you interview-ready" })).toBeVisible();
    const layout = await page.evaluate(() => ({
      sidebar: document.querySelector(".sidebar")!.getBoundingClientRect(),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(layout.sidebar.width).toBe(expectedSidebarWidth);
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/practice");
  const opener = page.getByRole("button", { name: "Open navigation" });
  await opener.click();
  await expect.poll(() => page.locator(".sidebar").evaluate(el => el.getBoundingClientRect().left)).toBe(0);
  const mobile = await page.evaluate(() => ({
    sidebar: document.querySelector(".sidebar")!.getBoundingClientRect(),
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(mobile.sidebar.left).toBe(0);
  expect(mobile.pageWidth).toBeLessThanOrEqual(mobile.viewportWidth);
});

test("mobile navigation traps focus, closes with Escape and restores scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockStudent(page);
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Student navigation" })).toBeHidden();
  const opener = page.getByRole("button", { name: "Open navigation" });
  await opener.click();
  await expect(page.getByRole("dialog", { name: "Student workspace" })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.getByRole("button", { name: "Sign out" }).focus();
  await page.keyboard.press("Tab");
  expect(await page.locator(".sidebar").evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(opener).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("long placement company names fit a narrow phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [{
    id: "long-company", company_name: "InternationalSoftwareEngineeringAndInfrastructure",
    role_title: "CloudPlatformEngineeringSpecialist", location: "Remote", status: "published",
    eligibility_status: "eligible",
  }] }));
  await page.goto("/placements");
  await expect(page.getByRole("heading", { name: "CloudPlatformEngineeringSpecialist" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('Resume Studio saves project evidence and reloads it from the student API',async({page})=>{
 await mockStudent(page);
 let savedProject:any=null;
 await page.route('**/api/student/resume-studio/**',route=>{
  const path=new URL(route.request().url()).pathname,method=route.request().method();
  if(path.endsWith('/templates'))return route.fulfill({json:[]});
  if(path.endsWith('/resumes')&&method==='GET')return route.fulfill({json:savedProject?[savedProject]:[]});
  if(path.endsWith('/resumes')&&method==='POST'){savedProject={id:'studio-1',title:'Resume 1',revision:1,document:route.request().postDataJSON().document,presentation:{},updated_at:'2026-09-26T10:00:00Z'};return route.fulfill({status:201,json:savedProject})}
  if(path.endsWith('/studio-1/preview')&&method==='POST'){const draft=route.request().postDataJSON();return route.fulfill({contentType:'text/html',body:`<html><body><h1>${draft.document.personal_details.full_name||draft.title}</h1></body></html>`})}
  if(path.endsWith('/studio-1')&&method==='GET')return route.fulfill({json:savedProject});
  if(path.endsWith('/studio-1')&&method==='PUT'){const body=route.request().postDataJSON();savedProject={...savedProject,...body,revision:savedProject.revision+1};return route.fulfill({json:savedProject})}
  return route.fulfill({status:404,json:{detail:`Not found ${method} ${path}`}});
 });
 await page.goto('/resume-studio');
 await page.getByRole('button',{name:'Create manually',exact:true}).click();
 await page.getByRole('tab',{name:'Resume editor'}).click();
 await page.getByRole('button',{name:'Add content'}).click();
 await page.getByRole('button',{name:/Projects Academic, personal/}).click();
 await page.getByRole('button',{name:'Add Project',exact:true}).click();
 await page.getByLabel('Project title',{exact:true}).fill('Library API');
 await page.getByLabel('Description / achievements',{exact:true}).fill('Built a Python API with book search.');
 await expect(page.locator('.rs-save-state')).toHaveText('Saved',{timeout:5000});
 // Separate edits may legitimately autosave as one or several revisions.
 // The persisted content and reload below are the correctness contract.
 expect(savedProject.revision).toBeGreaterThanOrEqual(2);
 await page.reload();
 await page.getByRole('button',{name:/Open Resume 1/}).click();
 await page.getByRole('tab',{name:'Resume editor'}).click();
 await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('Library API');
 await expect(page.getByLabel('Description / achievements',{exact:true})).toContainText('Built a Python API with book search.');
});

test('AI Coach moves through placement, skills, diagnostic, schedule, and the combined Neha lesson',async({page})=>{
 await page.setViewportSize({width:1700,height:1000});
 await mockStudent(page);const day={day:1,session_id:'plan-1:day:1',title:'Python APIs',focus:'Request handling',activities:['Build one endpoint','Explain an API response'],success_check:'Explain a request'};const plan={id:'plan-1',drive_id:'drive-1',company_name:'Example Co',role_title:'Backend engineer',target_date:'2027-01-01',plan:{summary:'Learn reliable API design',goal:'Explain and build APIs',daily_roadmap:[day],discussion_starters:['Show today’s plan']},messages:[{id:'m1',role:'coach',content:'Let’s learn API design.'}]};let created=false;let booked:Record<string,unknown>|null=null;
 await page.route('**/api/student/coach/overview',route=>route.fulfill({json:{upcoming_drives:[{drive_id:'drive-1',company_name:'Example Co',role_title:'Backend engineer',job_description:'Build Python APIs and reliable database services.',window_start_at:'2027-01-01T10:00:00+05:30'}],plans:created?[plan]:[],main_resume:{submission_id:'resume-1',label:'My Main Resume'},completed_placements:[]}}));
 await page.route('**/api/student/coach/drives/drive-1/context',route=>route.fulfill({json:{company_name:'Example Co',role_title:'Backend engineer',job_description:'Build Python APIs and reliable database services.',window_start_at:'2027-01-01T10:00:00+05:30',preparation_mode:'upcoming_placement'}}));
 await page.route('**/api/student/coach/drives/drive-1/skill-match',route=>route.fulfill({json:{company_name:'Example Co',role_title:'Backend engineer',resume_label:'My Main Resume',groups:{resume_match:['Python'],related_evidence:['APIs'],no_resume_evidence:['Testing']},language_options:[],language_is_alternative:false}}));
 await page.route('**/api/student/coach/drives/drive-1/diagnostic**',route=>route.fulfill({json:{id:'diagnostic-1',status:'completed',tasks_json:[],answers_json:{},result_json:{skills:[]}}}));
 await page.route('**/api/student/coach/plans**',route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith('/messages')){plan.messages.push({id:'m2',role:'student',content:'Explain APIs'},{id:'m3',role:'coach',content:'An API receives a request and returns a response.'});return route.fulfill({json:{reply:plan.messages[2].content}})}if(path.endsWith('/schedule')&&route.request().method()==='PUT'){booked=route.request().postDataJSON().sessions[0];Object.assign(day,{planned_at:(booked as any).scheduled_for,duration_minutes:45,schedule_status:'scheduled'});return route.fulfill({json:{sessions:[day]}})}if(path.endsWith('/plans')&&route.request().method()==='POST'){created=true;return route.fulfill({json:plan})}if(path.includes('/sessions/'))return route.fulfill({json:{id:day.session_id,stage:'teaching',skill:'Python APIs',learning_objective:'Explain a request'}});return route.fulfill({json:plan})});
 await page.goto('/coach');await page.getByLabel('Placement opportunity').selectOption('drive-1');const rails: {x:number;width:number}[]=[];const rail=async(selector:string)=>{const box=await page.locator(selector).boundingBox();expect(box).not.toBeNull();rails.push({x:box!.x,width:box!.width})};await rail('.coach-placement-layout');await page.getByRole('button',{name:'Build preparation plan'}).click();await expect(page.getByRole('heading',{name:'Your skills for Example Co'})).toBeVisible();await rail('.coach-skills-stage');await page.screenshot({path:'/root/voicedots/artifacts/student-ui-20261007/student-coach-skills-corrected.png'});await page.getByRole('button',{name:'Continue to validate skills'}).click();await expect(page.getByText('Diagnostic saved. These results guide your plan')).toBeVisible();await rail('.coach-diagnostic-stage');await page.getByRole('button',{name:'Continue to plan'}).click();await expect(page.getByText('Python APIs',{exact:true})).toBeVisible();await expect(page.getByText('Build one endpoint')).toBeVisible();await rail('.coach-plan-stage');await page.getByRole('button',{name:'Confirm & add all sessions'}).click();await expect(page.getByText('Scheduled ·')).toBeVisible();expect(booked).toMatchObject({session_id:day.session_id,duration_minutes:45});await page.getByRole('button',{name:'Open lesson'}).click();await expect(page.getByText('Connect with Neha',{exact:true})).toBeVisible();await rail('.coach-lesson-stage');expect(Math.max(...rails.map(item=>item.width))-Math.min(...rails.map(item=>item.width))).toBeLessThanOrEqual(1);expect(Math.max(...rails.map(item=>item.x))-Math.min(...rails.map(item=>item.x))).toBeLessThanOrEqual(1);await expect(page.getByAltText('Neha, AI preparation coach')).toBeVisible();await expect(page.getByText('What would you like to work through first about Request handling?')).toBeVisible();await page.getByLabel('Ask Neha or share your answer').fill('Explain APIs');await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.getByText('An API receives a request and returns a response.')).toBeVisible();
 const lessonWidth=await page.locator('.coach-lesson-stage').evaluate(el=>el.getBoundingClientRect().width);
 expect(lessonWidth).toBeGreaterThanOrEqual(1200);
 expect(lessonWidth).toBeLessThanOrEqual(await page.locator(".coach-approved-page").evaluate(el=>el.getBoundingClientRect().width));
 const avatar=page.locator('.coach-lesson-portrait .coach-call-avatar');
 expect(await avatar.evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(190);
 await expect(avatar.locator('span')).toHaveCount(0);
 await page.screenshot({path:'test-results/ai-coach-lesson-desktop.png',fullPage:true});
 await expect(page.locator('.coach-voice-turn.student')).toBeVisible();
 await expect(page.locator('.coach-lesson-status')).not.toHaveClass(/error/);
 const chatWidths=await page.evaluate(()=>({panel:document.querySelector('.coach-call-transcript')!.getBoundingClientRect().width,transcript:document.querySelector('.coach-live-transcript')!.getBoundingClientRect().width,compose:document.querySelector('.coach-chat-compose')!.getBoundingClientRect().width,textarea:document.querySelector('.coach-chat-compose textarea')!.getBoundingClientRect().width}));
 expect(chatWidths.transcript).toBeGreaterThan(chatWidths.panel*.8);
 expect(chatWidths.compose).toBeGreaterThan(chatWidths.panel*.8);
 expect(chatWidths.textarea).toBeGreaterThan(600);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('AI Coach does not block a Data Analyst diagnostic on a generic software-development phrase',async({page})=>{
 await mockStudent(page);
 const jd='Use Python, SQL, and dashboards to analyze business data. This software development role also maintains internal tools.';
 await page.route('**/api/student/coach/overview',route=>route.fulfill({json:{upcoming_drives:[{drive_id:'analyst-drive',company_name:'Zoho',role_title:'Data Analyst',job_description:jd,window_start_at:'2026-10-05T10:00:00+05:30'}],plans:[],main_resume:{submission_id:'resume-1',label:'Main Resume'},completed_placements:[]}}));
 await page.route('**/api/student/coach/drives/analyst-drive/context',route=>route.fulfill({json:{company_name:'Zoho',role_title:'Data Analyst',job_description:jd,window_start_at:'2026-10-05T10:00:00+05:30',preparation_mode:'upcoming_placement'}}));
 await page.route('**/api/student/coach/drives/analyst-drive/skill-match',route=>route.fulfill({json:{company_name:'Zoho',role_title:'Data Analyst',resume_label:'Main Resume',groups:{resume_match:['SQL'],related_evidence:['Python'],no_resume_evidence:['Dashboards']},language_options:[],language_is_alternative:false}}));
 await page.route('**/api/student/coach/drives/analyst-drive/diagnostic**',route=>route.fulfill({json:{id:'analyst-diagnostic',status:'completed',tasks_json:[],answers_json:{},result_json:{skills:[]}}}));
 await page.goto('/coach');await page.getByLabel('Placement opportunity').selectOption('analyst-drive');await page.getByRole('button',{name:'Build preparation plan'}).click();
 await expect(page.getByRole('heading',{name:'Your skills for Zoho'})).toBeVisible();await expect(page.getByText(/role title says Data Analyst/i)).toHaveCount(0);
 await page.getByRole('button',{name:'Continue to validate skills'}).click();await expect(page.getByText('Diagnostic saved. These results guide your plan')).toBeVisible();
});

test('AI Coach placement layout follows the approved desktop ratio and stacks on mobile', async ({page}) => {
  await mockStudent(page);
  await page.route('**/api/student/coach/overview', route => route.fulfill({json:{
    upcoming_drives:[], completed_placements:[], plans:[], main_resume:{submission_id:'resume-layout',label:'Main Resume'},
  }}));
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/coach');
  await expect(page.getByRole('heading',{name:'Create a preparation plan'})).toBeVisible();
  await page.screenshot({path:'test-results/ai-coach-placement-desktop.png',fullPage:true});
  const desktop=await page.evaluate(()=>{const builder=document.querySelector('.coach-placement-builder')!.getBoundingClientRect(),saved=document.querySelector('.coach-saved-plans')!.getBoundingClientRect();return {ratio:builder.width/saved.width,builderTop:builder.top,savedTop:saved.top}});
  expect(desktop.ratio).toBeGreaterThan(1.6);expect(desktop.ratio).toBeLessThan(2.2);expect(Math.abs(desktop.builderTop-desktop.savedTop)).toBeLessThan(3);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/ai-coach-placement-mobile.png',fullPage:true});
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const mobile=await page.evaluate(()=>{const builder=document.querySelector('.coach-placement-builder')!.getBoundingClientRect(),saved=document.querySelector('.coach-saved-plans')!.getBoundingClientRect();return {builderTop:builder.top,savedTop:saved.top,pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth}});
  expect(mobile.savedTop).toBeGreaterThan(mobile.builderTop);expect(mobile.pageWidth).toBeLessThanOrEqual(mobile.viewportWidth);
});

test('completed placements keep unreleased feedback private until the placement team releases it', async ({page}) => {
  await mockStudent(page);
  await page.route('**/api/student/coach/overview', route => route.fulfill({json: {
    upcoming_drives: [], completed_placements: [{drive_id: 'closed-drive', company_name: 'Example Co', role_title: 'Analyst', feedback_status: 'awaiting_release', completed_at: '2026-09-20T10:00:00Z', has_coaching_plan: false}], plans: [], main_resume:{submission_id:'resume-1',label:'Main Resume'},
  }}));
  await page.route('**/api/student/coach/drives/closed-drive/context', route => route.fulfill({json:{company_name:'Example Co',role_title:'Analyst',job_description:'Analyze data using SQL and dashboards.',preparation_mode:'completed_placement'}}));
  await page.route('**/api/student/coach/drives/closed-drive/skill-match', route => route.fulfill({json:{company_name:'Example Co',role_title:'Analyst',resume_label:'Main Resume',groups:{resume_match:['SQL'],related_evidence:[],no_resume_evidence:['Dashboards']},language_options:[],language_is_alternative:false}}));
  await page.goto('/coach');
  await expect(page.getByText('Results awaiting release')).toBeVisible();
  await expect(page.getByRole('link',{name:'View feedback'})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Feedback not released'})).toBeDisabled();
  await expect(page.getByRole('heading',{name:'Your skills for Example Co'})).toHaveCount(0);
});

test('completed placement can contribute confirmed voice questions without showing student identity', async ({page}) => {
  await mockStudent(page);
  await page.addInitScript(() => {
    class Recognition {
      continuous = false; interimResults = false; lang = ''; onresult: any = null; onerror: any = null; onend: any = null;
      start() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: Object.assign([{ isFinal: true, 0: { transcript: 'What is REST? How do retries work?' } }], { length: 1 }) }); this.onend?.(); }, 0); }
      stop() {}
    }
    (window as any).SpeechRecognition = Recognition;
  });
  await page.route('**/api/student/coach/overview', route => route.fulfill({json:{upcoming_drives:[],completed_placements:[{drive_id:'closed-drive',company_name:'Example Co',role_title:'Analyst',feedback_status:'awaiting_release',completed_at:'2026-09-20T10:00:00Z'}],plans:[],main_resume:{submission_id:'resume-1',label:'Main Resume'}}}));
  await page.route('**/api/student/coach/drives/closed-drive/context', route => route.fulfill({json:{company_name:'Example Co',role_title:'Analyst',job_description:'Analyze data using SQL and dashboards.',preparation_mode:'completed_placement'}}));
  await page.route('**/api/student/coach/drives/closed-drive/question-contribution/extract', route => route.fulfill({json:{candidates:[{question_text:'What is REST?',round_type:'Technical'},{question_text:'How do retries work?',round_type:'Technical'}]}}));
  let contribution: any;
  await page.route('**/api/student/coach/drives/closed-drive/question-contribution', async route => {
    if (route.request().method() === 'POST') { contribution = route.request().postDataJSON(); return route.fulfill({json:{count:2,questions:[]}}); }
    return route.fulfill({json:{has_contributed:false}});
  });
  await page.goto('/coach');
  await page.getByRole('button', {name:'Help future students prepare'}).click();
  await expect(page.getByRole('dialog')).toContainText('What questions were you asked?');
  await page.getByRole('button', {name:'Speak questions'}).click();
  await expect(page.getByText('Review and edit before confirming')).toBeVisible();
  const firstQuestion = page.getByLabel('Question 1');
  await firstQuestion.fill('What is REST in a web API?');
  const submit = page.getByRole('button', {name:'Confirm and submit'});
  await expect(submit).toBeDisabled();
  await page.getByRole('checkbox', {name:/I confirm these are questions/}).check();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('status').filter({hasText:'2 questions added'})).toBeVisible();
  expect(contribution.confirmed).toBe(true);
  expect(contribution.questions[0].question_text).toBe('What is REST in a web API?');
  expect(JSON.stringify(contribution)).not.toContain('student-1');
});

test('Coach schedule confirms the complete plan once and supports rescheduling and cancellation', async ({page}) => {
  await mockStudent(page);
  const first:Record<string,unknown> = {day:1,session_id:'plan-booking:day:1',title:'SQL joins',focus:'Combine tables',activities:['Practice joins'],success_check:'Explain a join'};
  const second:Record<string,unknown> = {day:2,session_id:'plan-booking:day:2',title:'Clear communication',focus:'Explain findings',activities:['Summarize a finding'],success_check:'Explain your conclusion'};
  const plan:any = {id:'plan-booking',drive_id:'drive-booking',company_name:'Example Co',role_title:'Analyst',target_date:'2027-01-01',plan:{summary:'Prepare SQL',goal:'Explain SQL joins',daily_roadmap:[first,second],discussion_starters:[]},messages:[]};
  let batchCalls=0;
  await page.route('**/api/student/coach/overview', route => route.fulfill({json:{upcoming_drives:[],completed_placements:[],plans:[plan]}}));
  await page.route('**/api/student/coach/plans/plan-booking**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/sessions/plan-booking%3Aday%3A1/schedule') || path.endsWith('/sessions/plan-booking:day:1/schedule') || path.endsWith('/sessions/plan-booking%3Aday%3A2/schedule') || path.endsWith('/sessions/plan-booking:day:2/schedule')) {
      const sessionId = decodeURIComponent(path.split('/sessions/')[1].split('/schedule')[0]);
      const item = [first, second].find(row => row.session_id === sessionId)!;
      if (route.request().method() === 'PUT') { const body = route.request().postDataJSON(); Object.assign(item, {planned_at:body.scheduled_for,duration_minutes:body.duration_minutes,schedule_status:'scheduled'}); }
      else Object.assign(item, {schedule_status:'cancelled',planned_at:undefined});
      return route.fulfill({json:item});
    }
    if (path.endsWith('/schedule') && route.request().method() === 'PUT') {
      batchCalls++;
      const sessions = route.request().postDataJSON().sessions;
      for (const session of sessions) { const item = [first, second].find(row => row.session_id === session.session_id)!; Object.assign(item, {planned_at:session.scheduled_for,duration_minutes:session.duration_minutes,schedule_status:'scheduled'}); }
      return route.fulfill({json:{sessions:[first,second]}});
    }
    return route.fulfill({json:plan});
  });
  await page.goto('/coach?plan=plan-booking');
  await expect(page.getByText('Not scheduled')).toBeVisible();
  await page.getByRole('button',{name:'Confirm & add all sessions'}).click();
  await expect(page.getByText('Scheduled ·')).toBeVisible();
  expect(batchCalls).toBe(1);
  expect((first as any).planned_at).toBeTruthy();expect((second as any).planned_at).toBeTruthy();
  await page.getByRole('button',{name:'Confirm updated schedule'}).click();
  await expect.poll(()=>batchCalls).toBe(2);
  expect(new Set([(first as any).session_id,(second as any).session_id]).size).toBe(2);
  await page.getByRole('button',{name:'Reschedule'}).click();
  await page.getByRole('button',{name:'Save Day 1 changes'}).click();
  await expect(page.getByRole('button',{name:'Cancel booking'})).toBeVisible();
  await page.getByRole('button',{name:'Cancel booking'}).click();
  await expect(page.getByText('Not scheduled')).toBeVisible();
});

test('My Placement Skills distinguishes resume evidence from unassessed requirements', async ({page}) => {
  await mockStudent(page);
  await page.route('**/api/student/coach/plans/plan-skills/skills', route => route.fulfill({json: {
    company_name: 'Example Co', role_title: 'Analyst', score: 30,
    skills: [
      {skill: 'SQL', importance: 3, state: 'some_evidence', source: 'main_resume', resume_evidence:'some_evidence', evidence_note: 'Mentioned in Main Resume.', training_stage: 'practice', session_id: 'sql-session'},
      {skill: 'Statistics', importance: 2, state: 'unassessed', source: 'not_assessed', resume_evidence:'none', evidence_note: 'No independent demonstration.', training_stage: 'not_started',objectives:[{task_id:'stat-1',question:'Explain variance.',status:'unassessed'}]},
    ],
  }}));
  await page.goto('/coach/skills?plan=plan-skills');
  await expect(page.getByRole('heading', {name: 'What your evidence shows'})).toBeVisible();
  await expect(page.getByText('Mentioned in Main Resume.')).toBeVisible();
  await expect(page.getByText('No independent demonstration.')).toBeVisible();
  await expect(page.getByText('Main Resume: No evidence found')).toBeVisible();
  await page.getByText('Assessment details · 1 tasks').click();
  await expect(page.getByText('Explain variance.')).toBeVisible();
  await expect(page.getByRole('link', {name: 'Continue lesson'})).toHaveAttribute('href', '/coach?plan=plan-skills&session=sql-session');
});

test('AI Coach diagnostic streams mic audio, shows transcripts, and finalizes once', async ({page})=>{
 await mockStudent(page);
 const diagnostic:any={id:'diagnostic-voice',status:'in_progress',tasks_json:[{task_id:'sql-voice',sub_skill:'SQL',format:'scenario',question:'Explain how a join combines rows.',question_source_type:'PREVIOUS_INTERVIEW_QUESTION',source_question_id:'q-1'}],answers_json:{},result_json:{skills:[]}};
 let started=false, audioChunks=0, finalized=0;
 const plan={id:'plan-diagnostic',drive_id:'drive-1',company_name:'Example Co',role_title:'Analyst',target_date:'2027-01-01',plan:{summary:'Practice SQL',goal:'Explain SQL joins',daily_roadmap:[{day:1,session_id:'plan-diagnostic:day:1',title:'SQL joins',focus:'Combine tables',activities:['Practice a join'],success_check:'Explain a join'}],discussion_starters:[]}};
 await page.route('**/api/student/coach/overview',route=>route.fulfill({json:{upcoming_drives:[{drive_id:'drive-1',company_name:'Example Co',role_title:'Analyst',job_description:'Analyze data using SQL and dashboards.',window_start_at:'2027-01-01T10:00:00+05:30'}],plans:[],main_resume:{submission_id:'resume-1',label:'Main Resume'},completed_placements:[]}}));
 await page.route('**/api/student/coach/drives/drive-1/context',route=>route.fulfill({json:{company_name:'Example Co',role_title:'Analyst',job_description:'Analyze data using SQL and dashboards.',window_start_at:'2027-01-01T10:00:00+05:30',preparation_mode:'upcoming_placement'}}));
 await page.route('**/api/student/coach/drives/drive-1/skill-match',route=>route.fulfill({json:{company_name:'Example Co',role_title:'Analyst',resume_label:'Main Resume',groups:{resume_match:['SQL'],related_evidence:[],no_resume_evidence:[]},language_options:[],language_is_alternative:false}}));
 await page.route('**/api/student/coach/drives/drive-1/diagnostic**',route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith('/answers')){Object.assign(diagnostic.answers_json,route.request().postDataJSON().answers);return route.fulfill({json:diagnostic})}if(path.endsWith('/complete')){diagnostic.status='completed';diagnostic.result_json.skills=[{skill:'SQL',state:'some_evidence',assessed_tasks:1,demonstrated_tasks:1}];return route.fulfill({json:diagnostic})}if(route.request().method()==='POST')started=true;return route.fulfill({json:started?diagnostic:{detail:'Not started'},status:started?200:404})});
 await page.route('**/api/student/coach/plans**',route=>route.fulfill({json:plan}));
 await page.addInitScript(()=>{(window as any).diagnosticMicReleased=false;Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{value:async()=>[{kind:'audioinput',deviceId:'default',label:'Default microphone',groupId:'test'},{kind:'audioinput',deviceId:'usb-mic',label:'USB microphone',groupId:'test'}]});Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{const ctx=new AudioContext(),destination=ctx.createMediaStreamDestination(),track=destination.stream.getAudioTracks()[0],stop=track.stop.bind(track);Object.defineProperty(track,'getSettings',{value:()=>({deviceId:'usb-mic'})});track.stop=()=>{(window as any).diagnosticMicReleased=true;stop();void ctx.close()};return destination.stream}});(window as any).AudioWorkletNode=class extends AudioWorkletNode{constructor(context:BaseAudioContext,name:string,options?:AudioWorkletNodeOptions){super(context,name,options);setTimeout(()=>this.port.onmessage?.({data:new Float32Array(480).fill(.15)} as MessageEvent),120)}}});
 await page.routeWebSocket('**/ws/coach-diagnostic/**',ws=>{ws.onMessage(message=>{if(message instanceof Buffer){audioChunks++;if(audioChunks===1)ws.send(JSON.stringify({type:'partial_transcript',text:'A join combines'}));return}const data=JSON.parse(String(message));if(data.type==='start_answer')ws.send(JSON.stringify({type:'listening_started',task_id:'sql-voice'}));if(data.type==='stop_answer'){finalized++;ws.send(JSON.stringify({type:'final_transcript',text:'A join combines matching rows from two tables.'}));ws.send(JSON.stringify({type:'processing'}));ws.send(JSON.stringify({type:'diagnostic_answer_complete',task_id:'sql-voice',transcript:'A join combines matching rows from two tables.',evaluation:{demonstrated:true,confidence:.9},skipped:false,accepted:true}))}});ws.send(JSON.stringify({type:'diagnostic_started',task_id:'sql-voice',question:'Explain how a join combines rows.',question_source_type:'PREVIOUS_INTERVIEW_QUESTION'}));});
 await page.goto('/coach');await page.getByRole('button',{name:'Build preparation plan'}).click();await page.getByRole('button',{name:'Continue to validate skills'}).click();
 await expect(page.getByRole('heading',{name:'Explain how a join combines rows.'})).toBeVisible();await expect(page.getByText('Listening',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Voice answer',exact:true}).click();await expect(page.getByRole('button',{name:'Start answering'})).toBeVisible();await expect(page.getByRole('textbox',{name:'Diagnostic transcript'})).toHaveCount(0);await page.getByRole('button',{name:'Start answering'}).click();await expect.poll(()=>audioChunks).toBeGreaterThan(0);await expect(page.getByText('A join combines',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Finish answer'})).toBeEnabled();await expect(page.getByLabel('Microphone input')).toHaveValue('usb-mic');const micBox=await page.getByLabel('Microphone input').boundingBox(),stopBox=await page.getByRole('button',{name:'Finish answer'}).boundingBox();expect(Math.abs(micBox!.y-stopBox!.y)).toBeLessThanOrEqual(2);await page.screenshot({path:'/root/voicedots/artifacts/student-ui-20261007/student-coach-voice-corrected.png'});await page.getByRole('button',{name:'Finish answer'}).click();await expect(page.getByText('A join combines matching rows from two tables.')).toBeVisible();await expect(page.getByText('Your baseline is ready to evaluate.')).toBeVisible();expect(finalized).toBe(1);await expect.poll(()=>page.evaluate(()=>(window as any).diagnosticMicReleased)).toBe(true);
});

test("Calendar opens the exact persisted AI Coach session from its event", async ({ page }) => {
  await mockStudent(page);
  const sessionId = "session-exact-calendar";
  const plan = {
    id: "plan-calendar", company_name: "Example Company", role_title: "Backend Engineer",
    target_date: "2026-09-26",
    plan: {
      summary: "Prepare for the role", goal: "Understand backend reliability", priority_topics: [],
      daily_roadmap: [{ day: 1, session_id: sessionId, title: "Database indexes", focus: "Query performance",
        activities: ["Review query plans"], success_check: "Explain index tradeoffs" }],
      discussion_starters: [],
    },
  };
  await page.route("**/api/student/coach/overview", route => route.fulfill({json:{upcoming_drives:[],completed_placements:[],plans:[plan],main_resume:{submission_id:"resume-calendar",label:"Main Resume"}}}));
  await page.route("**/api/student/drives", route => route.fulfill({ json: [] }));
  await page.route("**/api/student/coach/calendar", route => route.fulfill({ json: { events: [{
    id: "calendar-event-1", date: "2027-01-01", title: "Database indexes",
    subtitle: "Example Company · Backend Engineer", kind: "coach", plan_id: plan.id, session_id: sessionId,
  }] } }));
  await page.route(`**/api/student/coach/plans/${plan.id}`, route => route.fulfill({ json: plan }));
  await page.route(`**/api/student/coach/plans/${plan.id}/sessions/${sessionId}`, route => route.fulfill({ json: {
    id: sessionId, stage: "teaching", skill: "Database indexes", learning_objective: "Explain index tradeoffs",
  } }));

  await page.goto("/calendar");
  await page.getByRole("button", { name: "View Database indexes" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Open session" }).click();
  await expect(page).toHaveURL(new RegExp(`/coach\\?plan=${plan.id}&session=${sessionId}&stage=coach`));
  await expect(page.locator(".coach-lesson-identity").getByRole("heading", { name: "Database indexes" })).toBeVisible();
  await expect(page.getByText("Explain index tradeoffs", {exact:true}).first()).toBeVisible();
});

test("Calendar opens the selected placement and displays Coach time in IST", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [{
    id: "drive-calendar", company_name: "Example Company", role_title: "Data Analyst",
    status: "active", eligibility_status: "eligible", window_start_at: "2027-01-01T09:00:00+05:30",
    window_end_at: "2027-01-02T18:00:00+05:30",
  }] }));
  await page.route("**/api/student/drives/drive-calendar/interview-context", route => route.fulfill({ json: {
    drive_id: "drive-calendar", action: "not_assigned", interview_window: "open",
    attempt_number: 1, max_attempts: 2, attempts_used: 0, attempts_remaining: 2,
    attempt_history: [], eligibility: { status: "eligible" },
  } }));
  await page.route("**/api/student/coach/calendar", route => route.fulfill({ json: { events: [{
    id: "coach-calendar", date: "2027-01-01", time: "2027-01-01T18:30:00+05:30",
    title: "SQL lesson", subtitle: "Example Company · Data Analyst", kind: "coach",
    status: "scheduled", duration_minutes: 30,
  }] } }));
  await page.goto("/calendar");
  await expect(page.locator(".calendar-event-card").filter({ hasText: "SQL lesson" })).toContainText("6:30 pm");
  await expect(page.locator(".calendar-event-card").filter({ hasText: "SQL lesson" })).toContainText("30 min");
  await page.getByRole("button", { name: "View Data Analyst" }).click();
  await page.getByRole("button", { name: "View opportunity" }).last().click();
  await expect(page).toHaveURL(/\/placements\?drive=drive-calendar/);
  await expect(page.getByRole("dialog")).toContainText("Example Company");
});

test("Calendar orders mixed events by timestamp and labels date-only drives", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({json: [
    {id: "date-only", company_name: "Example Co", role_title: "Time pending", status: "scheduled", drive_date: "2027-01-01"},
    {id: "timed", company_name: "Example Co", role_title: "Morning interview", status: "active", window_start_at: "2027-01-01T09:00:00+05:30", window_end_at: "2027-01-01T17:00:00+05:30"},
  ]}));
  await page.route("**/api/student/coach/calendar", route => route.fulfill({json: {events: [{
    id: "midday-coach", date: "2027-01-01", time: "2027-01-01T12:00:00+05:30", title: "Midday lesson", subtitle: "Example Co", kind: "coach", status: "scheduled", duration_minutes: 30,
  }]}}));
  await page.goto("/calendar");
  const cards = page.locator(".calendar-event-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("Time pending");
  await expect(cards.nth(0)).toContainText("Time to be confirmed (IST)");
  await expect(cards.nth(1)).toContainText("Morning interview");
  await expect(cards.nth(2)).toContainText("Midday lesson");
});

test("Calendar opens focused Coach interview events in their linked practice cycle", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [] }));
  await page.route("**/api/student/coach/calendar", route => route.fulfill({ json: { events: [{
    id: "cycle-interview", date: "2027-01-01", time: "2027-01-01T18:30:00+05:30",
    title: "Focused AI interview", subtitle: "Example Company · Analyst", kind: "coach",
    cycle_id: "cycle-7", plan_id: "plan-7", session_id: "plan-7:day:1", session_type: "validation",
  }] } }));

  await page.goto("/calendar");
  await page.getByRole("button", { name: "View Focused AI interview" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Open session" }).click();
  await expect(page).toHaveURL(/\/practice\?coach_cycle=cycle-7/);
});

test("Calendar opens a scheduled Coach call using its persisted cycle ID", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [] }));
  await page.route("**/api/student/coach/calendar", route => route.fulfill({ json: { events: [{
    id: "cycle-call", date: "2027-01-01", time: "2027-01-01T18:30:00+05:30",
    title: "AI Coach teaching session", subtitle: "Example Company · Analyst", kind: "coach",
    plan_id: "plan-7", cycle_id: "cycle-9", session_type: "teaching",
  }] } }));

  await page.goto("/calendar");
  await page.getByRole("button", { name: "View AI Coach teaching session" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Open session" }).click();
  await expect(page).toHaveURL(/\/coach\/session\?plan=plan-7&cycle=cycle-9/);
});

test("Calendar explains when a legacy Coach event has no safe session link", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/drives", route => route.fulfill({ json: [] }));
  await page.route("**/api/student/coach/calendar", route => route.fulfill({ json: { events: [{
    id: "legacy-cycle", date: "2027-01-01", time: "2027-01-01T18:30:00+05:30",
    title: "Older Coach session", subtitle: "Example Company · Analyst", kind: "coach", plan_id: "plan-legacy",
  }] } }));

  await page.goto("/calendar");
  await page.getByRole("button", { name: "View Older Coach session" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Open session" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "not linked to a specific session" })).toBeVisible();
  await expect(page).toHaveURL(/\/calendar$/);
});

test("student can save and reload one editable date-of-birth field", async ({ page }) => {
  await mockStudent(page);
  let dateOfBirth: string | null = null;
  const sentPayloads: Record<string, unknown>[] = [];
  await page.route("**/api/auth/student-me", route => route.fulfill({
    json: { ...identity, student: { ...identity.student, date_of_birth: dateOfBirth } },
  }));
  await page.route("**/api/student/profile", async route => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const payload = route.request().postDataJSON();
    sentPayloads.push(payload);
    if (Object.hasOwn(payload, "date_of_birth")) dateOfBirth = payload.date_of_birth;
    await route.fulfill({ json: { date_of_birth: dateOfBirth } });
  });

  await page.goto("/profile");
  await expect(page.locator(".profile-details dt").filter({ hasText: "Date of birth" })).toHaveCount(0);
  await expect(page.getByLabel("Date of birth")).toHaveCount(1);
  await page.getByLabel("Date of birth").fill("2005-01-02");
  await page.getByRole("button", { name: "Save date of birth" }).click();
  await expect(page.getByRole("status")).toContainText("profile details have been saved");
  await expect(page.getByLabel("Date of birth")).toHaveValue("2005-01-02");
  expect(sentPayloads[0]).toEqual({ date_of_birth: "2005-01-02" });
  await expect(page.getByLabel("Target role")).toHaveCount(0);
  expect(sentPayloads).toHaveLength(1);
  await page.reload();
  await expect(page.locator(".profile-details dt").filter({ hasText: "Date of birth" })).toHaveCount(0);
  await expect(page.getByLabel("Date of birth")).toHaveCount(1);
  await expect(page.getByLabel("Date of birth")).toHaveValue("2005-01-02");
  expect(dateOfBirth).toBe("2005-01-02");
});

test("Career Coach uses owned resume and interests without a personal target role", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/resume-library", route => route.fulfill({ json: { resumes: [
    { submission_id: "resume-main", label: "Main Resume", original_filename: "resume.pdf", is_primary: true },
  ] } }));
  const reportHistory: any[] = [];
  await page.route("**/api/student/career/reports", route => route.fulfill({ json: { reports: reportHistory } }));
  let posted: Record<string, unknown> = {};
  await page.route("**/api/student/career/finder", route => {
    posted = route.request().postDataJSON();
    const report = {
      saved_report_id: "career-report-1",
      career_profile: "Your Python project supports backend work.",
      strongest_current_fit: "Backend Developer", strongest_growth_path: "Data Engineer",
      career_gap_analysis: "Build data pipeline evidence.",
      analysis_status: "ai",
      recommended_roles: [{ role: "Backend Developer", why: "Your API project is relevant.", evidence_level: "project_evidence", project_evidence: ["Python"], matched_skills: ["Python"], missing_skills: ["SQL"] }],
      what_to_learn_next: ["SQL joins"], best_project_next: "Build a data API.",
      market_data_note: "Live market data is not connected.",
    };
    reportHistory.unshift({ id: "career-report-1", resume_id: "resume-main", created_at: "2026-09-28T10:00:00Z", model_version: "career-finder-v3", answers: posted, report });
    return route.fulfill({ json: report });
  });
  await page.goto("/career");
  await page.getByLabel("What topics interest you?").fill("APIs and data");
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(page.getByLabel("What work do you enjoy doing?")).toBeVisible();
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.getByLabel("What topics interest you?")).toHaveValue("APIs and data");
  await page.reload();
  await expect(page.getByLabel("What topics interest you?")).toHaveValue("APIs and data");
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByLabel("What work do you enjoy doing?").fill("Build APIs and analyse project results");
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByLabel("What matters most in your career?").fill("Growth and meaningful work");
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByLabel("How open are you to learning new skills?").fill("Very open to adjacent tools");
  await expect(page.getByLabel("How open are you to learning new skills?")).toHaveValue("Very open to adjacent tools");
  await page.getByRole("button", { name: "Explore career paths" }).click();
  await expect(page.getByText("Backend Developer", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Data Engineer", { exact: true })).toBeVisible();
  await expect(page.getByText("Build a data API.")).toBeVisible();
  expect(posted).toMatchObject({ interests: "APIs and data", preferred_work: "Build APIs and analyse project results", priorities: "Growth and meaningful work", learning_openness: "Very open to adjacent tools" });
  expect(posted).not.toHaveProperty("submission_id");
  expect(posted).not.toHaveProperty("target_role");
  expect(posted).not.toHaveProperty("career_direction");
  await expect(page.getByText("AI analysis grounded against extracted resume evidence")).toBeVisible();
  await page.getByRole("button", { name: "View report" }).first().click();
  await expect(page.getByLabel("What topics interest you?")).toHaveValue("APIs and data");
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(page.getByLabel("What work do you enjoy doing?")).toHaveValue("Build APIs and analyse project results");
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(page.getByLabel("What matters most in your career?")).toHaveValue("Growth and meaningful work");
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(page.getByLabel("How open are you to learning new skills?")).toHaveValue("Very open to adjacent tools");
});

test("profile upload becomes the single active resume and enables replacement", async ({ page }) => {
  await mockStudent(page);
  let active: any = null;
  await page.route("**/api/auth/student-me", route => route.fulfill({ json: { student: { ...identity.student, current_resume_submission_id: active?.submission_id || null } } }));
  await page.route("**/api/student/resume-library", async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postData() || "";
      expect(body).toContain('name="analyze_for_coaching"\r\n\r\ntrue');
      active = { resume_id: "profile-file-1", submission_id: "profile-submission-1", label: "profile-resume", original_filename: "profile-resume.pdf", is_primary: true, uploaded_at: "2026-09-29T10:00:00Z" };
      return route.fulfill({ json: { analysis_status: "ready", resume_id: "profile-file-1" } });
    }
    return route.fulfill({ json: { resumes: active ? [active] : [] } });
  });
  await page.route("**/api/student/resume-library/profile-file-1/file", route => route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4 profile resume" }));
  let profileSyncBody = "";
  await page.route("**/api/student/resume-studio/resumes/import", async route => { profileSyncBody = route.request().postData() || ""; return route.fulfill({ status: 201, json: { id: "studio-profile-1", import_report: { warnings: [] } } }); });
  await page.goto("/profile");
  await page.getByLabel("Add resume").setInputFiles({ name: "profile-resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 profile resume") });
  await expect(page.getByRole("status")).toContainText("ready to use across AI Coach, placement interviews, self-practice, and Career Coach");
  await expect(page.getByText("profile-resume", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Replace active resume")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit in Resume Studio" })).toHaveAttribute("href", "/resume-studio?resume=studio-profile-1");
  expect(profileSyncBody).toContain('name="profile_resume_id"');
  expect(profileSyncBody).toContain("profile-file-1");
});

test("profile supports viewing, downloading and confirmed deletion of the active resume", async ({ page }) => {
  await mockStudent(page);
  const active = { resume_id: "profile-main", submission_id: "profile-submission", label: "Main resume", original_filename: "main-resume.pdf", is_primary: true, uploaded_at: "2026-10-01T00:00:00Z" };
  let exists = true;
  let deletedId = "";
  await page.route("**/api/student/resume-library", route => route.fulfill({ json: { resumes: exists ? [active] : [] } }));
  await page.route("**/api/student/resume-library/profile-main/file", route => route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4 test resume" }));
  await page.route("**/api/student/resume-library/profile-main", async route => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletedId = "profile-main";
    exists = false;
    return route.fulfill({ json: { status: "deleted", resume_id: deletedId } });
  });
  await page.route("**/api/student/resume-studio/resumes", route => route.fulfill({ json: [{ id: "studio-main", linked_resume_id: "profile-main" }] }));
  await page.goto("/profile");
  await page.getByRole("button", { name: "View resume" }).click();
  await expect(page.getByRole("dialog", { name: /main-resume\.pdf/i }).locator("iframe")).toBeVisible();
  await page.getByRole("button", { name: "Close resume preview" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("main-resume.pdf");
  await expect(page.locator(".saved-resumes-panel")).not.toContainText(/https?:\/\//);
  await expect(page.getByRole("link", { name: "Edit in Resume Studio" })).toHaveAttribute("href", "/resume-studio?resume=studio-main");
  await page.getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this active resume?" });
  await expect(confirm).toContainText("separate Resume Studio project");
  await confirm.getByRole("button", { name: "Delete resume" }).click();
  await expect(page.getByText(/The active resume was deleted from your profile/)).toBeVisible();
  await expect(page.getByText("No active resume", { exact: true })).toBeVisible();
  expect(deletedId).toBe("profile-main");
  await expect(page.getByRole("link", { name: "Open Resume Studio" })).toHaveAttribute("href", "/resume-studio");
  await expect(page.getByText("No active resume", { exact: true })).toBeVisible();
  await expect(page.getByText("Add a resume to use it across Interview Practice, Placements, AI Coach and Career Coach.")).toBeVisible();
  await expect(page.getByLabel("Add resume")).toBeVisible();
});

test("profile rejects unsupported and oversized resume files with a clear message", async ({ page }) => {
  await mockStudent(page);
  await page.route("**/api/student/resume-library", route => route.fulfill({ json: { resumes: [] } }));
  await page.goto("/profile");
  const input = page.getByLabel("Add resume");
  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a resume") });
  await expect(page.getByText("Choose a non-empty PDF or DOCX up to 5 MB.")).toBeVisible();
  await input.setInputFiles({ name: "large.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 65) });
  await expect(page.getByText("Choose a non-empty PDF or DOCX up to 5 MB.")).toBeVisible();
});

test("replacing the active resume with identical content remains the single persisted Main Resume", async ({ page }) => {
  await mockStudent(page);
  const active = { resume_id: "same-resume", submission_id: "same-submission", label: "Main resume", original_filename: "same.pdf", is_primary: true, uploaded_at: "2026-10-01T00:00:00Z" };
  let replacementUploaded = false;
  await page.route("**/api/auth/student-me", route => route.fulfill({ json: { student: { ...identity.student, current_resume_submission_id: active.submission_id } } }));
  await page.route("**/api/student/resume-library", async route => {
    if (route.request().method() === "POST") {
      replacementUploaded = true;
      return route.fulfill({ json: { analysis_status: "ready", resume_id: active.resume_id, submission_id: active.submission_id } });
    }
    return route.fulfill({ json: { resumes: [active] } });
  });
  await page.route("**/api/student/resume-studio/resumes", route => route.fulfill({ json: [] }));
  await page.route("**/api/student/resume-library/same-resume/file", route => route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4 same" }));
  await page.goto("/profile");
  await page.getByLabel("Replace active resume").setInputFiles({ name: "same.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 same") });
  await expect(page.getByRole("status")).toContainText("ready to use across");
  await expect(page.getByText("Main Resume · active across coaching and interviews")).toBeVisible();
  expect(replacementUploaded).toBe(true);
  await page.reload();
  await expect(page.getByText("Main Resume · active across coaching and interviews")).toBeVisible();
  await expect(page.locator(".saved-resume-row")).toHaveCount(1);
});

test("Career Coach retries a failed AI request without presenting synthetic results", async ({ page }) => {
  await mockStudent(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/student/resume-library", route => route.fulfill({ json: { resumes: [
    { submission_id: "resume-limited", label: "Limited resume", original_filename: "resume.pdf", is_primary: true },
  ] } }));
  await page.route("**/api/student/career/reports", route => route.fulfill({ json: { reports: [] } }));
  let analysisCalls = 0;
  await page.route("**/api/student/career/finder", route => {
    analysisCalls += 1;
    if (analysisCalls === 1) return route.fulfill({ status: 503, json: {
      detail: "The AI career analysis service could not complete the request. Please retry.",
    } });
    return route.fulfill({ json: {
      analysis_status: "ai", career_profile: "Your interests and resume evidence support a path to explore.",
      strongest_current_fit: "Not enough resume evidence yet", strongest_growth_path: "Data Analyst", recommended_roles: [],
    } });
  });
  await page.goto("/career");
  await expect(page.getByText(/Using active profile resume: Limited resume/)).toBeVisible();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await expect.poll(() => analysisCalls).toBe(1);
  await expect(page.getByRole("alert")).toContainText("AI career analysis service could not complete the request");
  await expect(page.getByRole("heading", { name: "Your career picture" })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("AI analysis grounded against extracted resume evidence")).toBeVisible();
  expect(analysisCalls).toBe(2);
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
});

test('coach voice acknowledges played audio and releases the microphone on navigation',async({page})=>{
 await mockStudent(page);const plan={id:'voice-1',role_title:'Engineer',target_date:'2027-01-01',plan:{summary:'Learn APIs',goal:'Understand requests',priority_topics:[],daily_roadmap:[],discussion_starters:[]},messages:[]};
 await page.route('**/api/student/coach/training-cycles',r=>r.fulfill({json:{cycles:[{id:'cycle-1',plan_id:'voice-1',focus_skills:[],call_scheduled_for:'2026-09-20T10:00:00Z',call_duration_minutes:10,practice_status:'pending'}]}}));
 await page.route('**/api/student/coach/plans**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/plans')?{plans:[plan]}:plan}));
 await page.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{const ctx=new AudioContext(),destination=ctx.createMediaStreamDestination(),track=destination.stream.getAudioTracks()[0],stop=track.stop.bind(track);track.stop=()=>{(window as any).micReleased=true;stop();void ctx.close()};return destination.stream}})});
 let acknowledged=false,ended=false;
 await page.routeWebSocket('**/ws/coach/**',ws=>{ws.onMessage(message=>{if(typeof message==='string'){const p=JSON.parse(message);if(p.type==='playback_complete'&&p.audio_epoch===1)acknowledged=true;if(p.type==='end_interview')ended=true}});ws.send(JSON.stringify({type:'tts_begin',audio_epoch:1,text:'Welcome to your lesson.'}));const packet=Buffer.alloc(964);packet.writeUInt32BE(1);ws.send(packet);ws.send(JSON.stringify({type:'tts_end',audio_epoch:1}));});
 await page.goto('/coach/session?plan=voice-1&session=voice-1%3Aday%3A1');await page.getByRole('button',{name:'Connect with Neha'}).click();await expect.poll(()=>acknowledged).toBe(true);await expect(page.locator('.coach-call-state')).toContainText('Listening to you');await page.getByRole('link',{name:/AI coach/i}).click();await expect.poll(()=>ended).toBe(true);await expect.poll(()=>page.evaluate(()=>(window as any).micReleased)).toBe(true);
});

test('academics shows source dates, attendance and private marks reports on mobile',async({page})=>{
 await mockStudent(page);await page.setViewportSize({width:390,height:844});
 await page.route('**/api/student/academics',r=>r.fulfill({json:{status:'connected',source_name:'Campus academic records',notice:'Imported academic records, not a live ERP feed.',attendance:[{period_start:'2026-07-06',period_end:'2026-09-04',hours_conducted:100,hours_present:85,hours_absent:15,percentage:85,source_file:'Attendance.xlsx',subjects:[{subject:'Python (24 hrs)',reported_value:20}]}],marks_reports:[{report_id:'report-1',title:'Semester marks',page_number:1}]}}));
 await page.route('**/api/student/academics/reports/report-1',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8X8AAAAASUVORK5CYII=','base64')}));
 await page.goto('/academics');await expect(page.getByText('85%',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Marks and attendance',exact:true})).toBeVisible();await expect(page.getByText('Hours present',{exact:true})).toBeVisible();await expect(page.getByText('Python (24 hrs)',{exact:true})).toBeVisible();await expect(page.getByText('Imported academic records, not a live ERP feed.')).toBeVisible();await expect(page.getByRole('img',{name:'Your marks report: Semester marks'})).toBeVisible();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download report'}).click();expect((await download).suggestedFilename()).toBe('My-marks-report.png');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('academics distinguishes missing records and service errors without invented marks',async({page})=>{
 await mockStudent(page);let unavailable=false;
 await page.route('**/api/student/academics',r=>r.fulfill({status:unavailable?503:200,json:unavailable?{detail:'Academic records are temporarily unavailable.'}:{status:'not_found',message:'No academic record matches your registered roll number.'}}));
 await page.goto('/academics');await expect(page.getByText('No academic record matches your registered roll number.')).toBeVisible();await expect(page.getByRole('button',{name:'Download report'})).toHaveCount(0);unavailable=true;await page.reload();await expect(page.getByText('Academic records are temporarily unavailable.')).toBeVisible();
});

test('AI Coach blocks premature teaching checks and gives a useful next step after a 409',async({page})=>{
 await mockStudent(page);
 const planId='teaching-guard-plan',sessionId='teaching-guard-session';
 const plan={id:planId,company_name:'Example Company',role_title:'Backend Engineer',target_date:'2026-10-01',plan:{summary:'Prepare',goal:'Explain the fundamentals',priority_topics:[],daily_roadmap:[{day:1,session_id:sessionId,title:'Database indexes',focus:'Index tradeoffs',activities:['Explain an index'],success_check:'Describe index tradeoffs'}],discussion_starters:[]},messages:[{id:'m1',role:'student',content:'An index speeds up lookup.'}]};
 let studentTurns=1;
 await page.route('**/api/student/coach/overview',route=>route.fulfill({json:{upcoming_drives:[],plans:[plan],completed_drive_recommendation:null}}));
 await page.route('**/api/student/coach/plans**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
  if(path.endsWith('/messages')&&method==='POST'){studentTurns++;return route.fulfill({json:{ok:true}})}
  if(path.endsWith('/sessions/'+sessionId)&&method==='GET')return route.fulfill({json:{id:sessionId,stage:'teaching',skill:'Database indexes',learning_objective:'Explain index tradeoffs'}});
  if(path.endsWith('/sessions/'+sessionId+'/teaching')&&method==='POST')return route.fulfill({status:409,json:{detail:'The saved conversation does not yet cover the learning objective. Add another example and try again.'}});
  if(path==='/api/student/coach/plans'&&method==='GET')return route.fulfill({json:{plans:[plan]}});
  if(path==='/api/student/coach/plans/'+planId&&url.searchParams.has('session_id'))return route.fulfill({json:{...plan,messages:Array.from({length:studentTurns},(_,i)=>({id:'m'+i,role:'student',content:i?'An index improves lookup but has write and storage costs.':'An index speeds up lookup.'}))}});
  return route.fulfill({status:404,json:{detail:'Not found'}});
 });
 await page.goto('/coach?plan='+planId+'&session='+sessionId);
 const complete=page.getByRole('button',{name:'Save lesson & continue'});
 await expect(complete).toBeDisabled();await expect(page.getByText('Continue the conversation with Neha so she can check today’s topic before practice begins.')).toBeVisible();
 await page.getByLabel('Ask Neha or share your answer').fill('An index can speed lookup, but adds storage and write costs.');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(complete).toBeEnabled();await complete.click();
 await expect(page.getByRole('alert')).toContainText('does not yet cover the learning objective');
 await expect(complete).toBeDisabled();
 await expect(page.getByText('Add a clear example or explanation in the chat, then try saving again.')).toBeVisible();
});

test('AI Coach validation lets a student skip a task without claiming ability',async({page})=>{
 await mockStudent(page);
 const planId='validation-plan',sessionId='validation-session';
 const plan={id:planId,drive_id:'drive-1',company_name:'Example Co',role_title:'Analyst',target_date:'2026-10-01',plan:{summary:'Prepare SQL',goal:'Explain joins',priority_topics:[],daily_roadmap:[{day:1,session_id:sessionId,title:'SQL joins',focus:'SQL joins',activities:[],success_check:'Explain LEFT JOIN'}],discussion_starters:[]},messages:[]};
 const state={id:sessionId,stage:'validation',skill:'SQL joins',learning_objective:'Explain LEFT JOIN',validation_tasks:[{task_id:'task-1',sub_skill:'LEFT JOIN',format:'scenario',question:'Explain a LEFT JOIN.'},{task_id:'task-2',sub_skill:'LEFT JOIN',format:'debugging',question:'Find the join bug.'}]};
 let submitted:Record<string,unknown>|null=null;
 await page.route('**/api/student/coach/overview',route=>route.fulfill({json:{upcoming_drives:[],plans:[plan]}}));
 await page.route('**/api/student/coach/plans**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/sessions/'+sessionId+'/validation')&&route.request().method()==='POST'){submitted=route.request().postDataJSON();return route.fulfill({json:{...state,validation:{status:'unassessed'},stage:'validation'}})}
  if(path.endsWith('/sessions/'+sessionId+'/validation/answers'))return route.fulfill({json:state});
  if(path.endsWith('/sessions/'+sessionId))return route.fulfill({json:state});
  if(path.endsWith('/plans/'+planId))return route.fulfill({json:plan});
  return route.fulfill({json:{plans:[plan]}});
 });
 await page.goto(`/coach?plan=${planId}&session=${sessionId}`);
 await expect(page.getByText('Explain a LEFT JOIN.')).toBeVisible();
 await page.getByRole('button',{name:'Skip this task'}).first().click();
 await page.getByRole('button',{name:'Skip this task'}).nth(1).click();
 await expect(page.getByRole('button',{name:'Submit Validation'})).toBeEnabled();
 await page.getByRole('button',{name:'Submit Validation'}).click();
 await expect.poll(()=>submitted).not.toBeNull();
 expect(submitted).toMatchObject({answers:[{task_id:'task-1',response:''},{task_id:'task-2',response:''}]});
});

test('Resume Studio asks before connecting its single resume as Main Resume',async({page})=>{
 await mockStudent(page);
 const project={id:'handoff-1',title:'Verified resume',revision:2,document:{title:'Verified resume',personal_details:{full_name:'Test Student'},sections:[{id:'summary',kind:'summary',name:'Professional Summary',hidden:false,entries:[{id:'summary-entry',title:'',body_html:'Experienced analyst with SQL project work.',tags:[],hidden:false}]}]},presentation:{},updated_at:'2026-09-27T10:00:00Z'};
 const uploads:Array<{primary:string;label:string;name:string}>=[];
 await page.route('**/api/student/resume-studio/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/templates'))return route.fulfill({json:[]});
  if(path.endsWith('/resumes'))return route.fulfill({json:[project]});
  if(path.endsWith('/handoff-1'))return route.fulfill({json:project});
  if(path.endsWith('/handoff-1/preview'))return route.fulfill({contentType:'text/html',body:'<p>Preview</p>'});
  if(path.endsWith('/handoff-1/export'))return route.fulfill({contentType:'application/pdf',body:'%PDF-1.4\nTest'});
  return route.fulfill({status:404,json:{detail:'Not found'}});
 });
 await page.route('**/api/student/resume-library',async route=>{
  if(route.request().method()!=='POST')return route.fallback();
  const body=route.request().postData()||'';
  uploads.push({primary:body.match(/name="analyze_for_coaching"\r?\n\r?\n([^\r\n]+)/)?.[1]||'',label:body.match(/name="label"\r?\n\r?\n([^\r\n]+)/)?.[1]||'',name:body.includes('filename="Verified-resume.pdf"')?'Verified-resume.pdf':''});
  return route.fulfill({json:{analysis_status:'ready'}});
 });
 await page.goto('/resume-studio');
 await page.getByRole('button',{name:/Open Verified resume/}).click();
 await page.getByRole('tab',{name:'Resume editor'}).click();
 await page.getByRole('button',{name:'Set as Main Resume'}).click();
 const confirm=page.getByRole('dialog',{name:'Use this as your Main Resume?'});
 await expect(confirm).toBeVisible();
 expect(uploads).toHaveLength(0);
 await confirm.getByRole('button',{name:'Cancel'}).click();
 expect(uploads).toHaveLength(0);
 await page.getByRole('button',{name:'Set as Main Resume'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Allow and set Main Resume'}).click();
 await expect(page.getByText(/Main Resume updated from Verified resume and shared across your student features/)).toBeVisible();
 expect(uploads).toEqual([{primary:'true',label:'Verified resume',name:'Verified-resume.pdf'}]);
});

test('general practice does not inherit the removed profile target role',async({page})=>{
 await mockStudent(page);
 await page.route('**/api/auth/student-me',route=>route.fulfill({json:{student:{...identity.student,target_role:'Legacy role'}}}));
 await page.goto('/practice');
 await expect(page.getByLabel('Target role',{exact:true})).toHaveValue('');
});

test('locked placement keeps compact badges and disables resume even with a stale actionable context',async({page})=>{
 await mockStudent(page);
 const drive={id:'locked-drive',company_name:'Netflix',role_title:'Senior analyst',status:'active',is_locked:true,main_resume_available:true,interview_status:'in_progress',interview_action:'resume',interview_max_attempts:1,interview_attempts_used:1,interview_current_attempt_number:1};
 await page.route('**/api/student/drives',route=>route.fulfill({json:[drive]}));
 await page.route('**/api/student/drives/locked-drive/interview-context',route=>route.fulfill({json:{drive_id:drive.id,company_name:drive.company_name,role_title:drive.role_title,is_locked:true,action:'resume',can_resume:true,can_start:true,main_resume_available:true,interview_window:'open',session_id:'session-1',submission_id:'submission-1',max_attempts:1,attempt_number:1,attempts_used:1,assignment_status:'in_progress'}}));
 await page.goto('/placements');
 await expect(page.locator('.drive-status-badges').getByText('Locked',{exact:true})).toBeVisible();
 const badge=await page.locator('.placement-locked-badge').boundingBox();expect(badge!.width).toBeLessThan(90);
 await page.screenshot({path:'/root/voicedots/artifacts/student-ui-20261007/student-placement-lock-corrected.png'});
 await page.getByRole('button',{name:'View opportunity'}).click();
 await expect(page.getByRole('button',{name:/Resume interview|Start.*interview/i})).toHaveCount(0);
 await page.screenshot({path:'/root/voicedots/artifacts/student-ui-20261007/student-placement-modal-corrected.png'});
});


test("overview shows up to four active drives and balanced feedback with compact paused rows", async ({ page }) => {
  await mockStudent(page);
  await page.setViewportSize({width:1706,height:960});
  const drives = Array.from({length:6},(_,i)=>({id:`drive-${i}`,company_name:["Razorpay","Netflix","Zoho","Freshworks","Example","Old Co"][i],role_title:["Backend Developer","Senior Analyst","Data Analyst","Software Engineer","Project Manager","Designer"][i],status:i===5?"closed":"active",window_start_at:`2026-10-${String(10-i).padStart(2,"0")}T10:00:00Z`,location:"Chennai",interview_action:"start",is_locked:i===2}));
  const report = {evaluation_id:"report-1",session_id:"session-1",status:"released",company_name:"Razorpay",target_role:"Backend Developer",drive_id:"drive-0",created_at:"2026-10-01T10:00:00Z",attempt_number:1,report:{overall_score:46,status:"released",readiness:"developing",priority_improvement_areas:[{focus:"Communication"},{focus:"Resume ownership"}]}};
  const attempts = Array.from({length:3},(_,i)=>({submission_id:`sub-${i}`,session_id:`session-${i}`,target_role:"Forward Deployed Engineer – Enterprise AI",company_name:"AetherGrid Technologies",duration_minutes:30,submitted_at:"2026-10-07T10:00:00Z"}));
  await page.route("**/api/student/dashboard",route=>route.fulfill({json:{reports:[report],drives,attempts,readiness:{...readiness,overall_score:31}}}));
  await page.route("**/api/student/readiness",route=>route.fulfill({json:{...readiness,overall_score:31,axis_scores:{interview_readiness:31,resume_readiness:86}}}));
  await page.goto("/");
  await expect(page.locator(".overview-drive")).toHaveCount(4);
  await expect(page.locator(".overview-drive").first()).toContainText("Razorpay");
  await expect(page.getByTestId("overview-latest-drive").getByRole("link",{name:"View all"})).toHaveAttribute("href","/placements");
  await expect(page.locator(".overview-drive").filter({hasText:"Zoho"}).getByRole("link",{name:/Start AI Interview|AI Coach/})).toHaveCount(0);
  await expect(page.getByTestId("overview-kpis").locator(".stat-card")).toHaveCount(4);
  const ringCenter = await page.locator(".feedback-score").evaluate(node=>getComputedStyle(node,"::before").backgroundColor);
  expect(ringCenter).toBe("rgb(255, 255, 255)");
  const heights = await page.locator(".overview-columns>.panel").evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
  expect(Math.abs(heights[0]-heights[1])).toBeLessThanOrEqual(1);
  const rows = await page.locator(".overview-paused .record").evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
  expect(rows.every(h=>h<90)).toBe(true);
  await page.screenshot({path:"/root/voicedots/artifacts/overview-step/overview-desktop.png",fullPage:true});
  await page.getByRole("button",{name:"Close navigation"}).click();
  await page.waitForTimeout(400);
  await page.screenshot({path:"/root/voicedots/artifacts/overview-step/overview-sidebar-closed.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:"/root/voicedots/artifacts/overview-step/overview-mobile.png",fullPage:true});
  await page.setViewportSize({width:1706,height:960});
  await page.route("**/api/student/dashboard",route=>route.fulfill({json:{reports:[{...report,status:"completed",report:{status:"awaiting_release"}}],drives:[],attempts:[],readiness}}));
  await page.reload();
  await expect(page.getByTestId("overview-latest-drive")).toHaveCount(0);
  await expect(page.getByTestId("overview-feedback")).toContainText("Your feedback is on its way");
  await expect(page.locator(".feedback-score")).toHaveCount(0);
  await expect(page.getByTestId("overview-feedback")).not.toContainText("Not assessed");
  await page.screenshot({path:"/root/voicedots/artifacts/overview-step/overview-pending-feedback.png",fullPage:true});
  await page.getByTestId("overview-hero").getByRole("link",{name:"Start an interview"}).click();
  await expect(page).toHaveURL(/\/practice$/);
});

test("placement card and table views preserve filters, data and alphabetical sorting", async ({page}) => {
  await mockStudent(page);
  await page.setViewportSize({width:1706,height:960});
  const drives = [
    {id:'beta',company_name:'Beta Co',role_title:'Senior Backend Developer',location:'Chennai',status:'active',eligibility_status:'eligible',interview_status:'in_progress',interview_action:'resume',interview_duration_minutes:30,interview_max_attempts:3,interview_attempts_used:1,interview_current_attempt_number:1,salary_min_amount:1000000,salary_type:'fixed',job_type:'full_time'},
    {id:'alpha',company_name:'Alpha Co',role_title:'Data Analyst',location:'Bengaluru',status:'active',eligibility_status:'eligible',interview_status:'open',interview_action:'start',interview_duration_minutes:45,interview_max_attempts:2,interview_attempts_used:0,job_type:'full_time'},
    {id:'locked',company_name:'Locked Co',role_title:'Engineer',status:'active',eligibility_status:'eligible',is_locked:true,interview_status:'in_progress',interview_action:'resume'},
  ];
  await page.route('**/api/student/drives',route=>route.fulfill({json:drives}));
  await page.route('**/api/student/drives/alpha/interview-context',route=>route.fulfill({json:{drive_id:'alpha',company_name:'Alpha Co',role_title:'Data Analyst',action:'start',main_resume_available:true,interview_window:'open',can_start:true,max_attempts:2,attempts_used:0,attempt_number:1,job_description:'Analyze business data'}}));
  await page.goto('/placements');
  await expect(page.locator('.drive-card')).toHaveCount(3);
  const cards=await page.locator('.drive-card').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.getAttribute('data-drive-id'),n.textContent!.replace(/\s+/g,' ')])));
  const heights=await page.locator('.drive-card').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
  expect(heights.every(h=>h<400)).toBe(true);
  await page.getByLabel('Sort by').selectOption('company');
  await expect(page.locator('.placement-group').first().locator('.drive-company-name').first()).toHaveText('Alpha Co');
  await page.getByRole('button',{name:'Table',exact:true}).click();
  await expect(page.getByRole('button',{name:'Table',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.placement-table tbody tr')).toHaveCount(3);
  for(const drive of drives){const row=page.locator(`tr[data-drive-id="${drive.id}"]`);await expect(row).toContainText(drive.company_name);await expect(row).toContainText(drive.role_title);if(drive.location)await expect(row).toContainText(drive.location);}
  await expect(page.locator('tr[data-drive-id="beta"]')).toContainText('Attempt 1 in progress');
  await expect(page.locator('tr[data-drive-id="beta"]')).toContainText('2 remaining');
  await expect(page.locator('tr[data-drive-id="locked"]')).toContainText('Locked');
  await page.getByPlaceholder('Company or role').fill('Alpha');
  await expect(page.locator('.placement-table tbody tr')).toHaveCount(1);
  await page.locator('.placement-table tbody tr').getByRole('button',{name:/View opportunity/}).click();
  await expect(page.getByRole('dialog')).toContainText('Analyze business data');
  await page.getByRole('button',{name:'Close details'}).click();
  await page.getByRole('button',{name:'Cards',exact:true}).click();
  await expect(page.locator('.drive-card')).toHaveCount(1);
  await expect(page.locator('.drive-card')).toContainText('Alpha Co');
  await page.getByPlaceholder('Company or role').fill('');
  await page.getByLabel('Interview status').selectOption('open');
  await expect(page.locator('.drive-card')).toHaveCount(1);
  expect(cards.beta).toContain('Beta Co');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Table',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("placement details ignore a stale response after another opportunity opens", async ({page}) => {
  await mockStudent(page);
  await page.route('**/api/student/drives',route=>route.fulfill({json:[{id:'a',company_name:'Alpha',role_title:'Analyst',status:'active',interview_status:'open',interview_action:'start'},{id:'b',company_name:'Beta',role_title:'Developer',status:'active',interview_status:'open',interview_action:'start'}]}));
  await page.route('**/api/student/drives/*/interview-context',async route=>{const isAlpha=route.request().url().includes('/a/');if(isAlpha)await new Promise(resolve=>setTimeout(resolve,800));await route.fulfill({json:{drive_id:isAlpha?'a':'b',company_name:isAlpha?'Alpha':'Beta',role_title:isAlpha?'Analyst':'Developer',job_description:isAlpha?'Only Alpha details':'Only Beta details',main_resume_available:true,interview_window:'open',action:'start',max_attempts:1,attempts_used:0,attempt_number:1}})});
  await page.goto('/placements');
  await page.locator('[data-drive-id="a"]').getByRole('button',{name:'View opportunity'}).click();
  await page.getByRole('button',{name:'Close opportunity details'}).click();
  await page.locator('[data-drive-id="b"]').getByRole('button',{name:'View opportunity'}).click();
  await expect(page.getByRole('dialog')).toContainText('Only Beta details');
  await page.waitForTimeout(1000);
  await expect(page.getByRole('dialog')).not.toContainText('Only Alpha details');
});

test('Coach stops loading on invalid JD and recovers when a different placement is selected',async({page})=>{
 await mockStudent(page);let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/api/student/coach/overview',async route=>{await gate;await route.fulfill({json:{upcoming_drives:[{drive_id:'bad',company_name:'No JD',role_title:'Analyst'},{drive_id:'good',company_name:'Valid Co',role_title:'Engineer'}],completed_placements:[],plans:[],main_resume:{submission_id:'r',label:'Main Resume'}}})});
 await page.route('**/api/student/coach/drives/bad/context',route=>route.fulfill({status:422,json:{detail:'This placement drive does not have a usable job description yet.'}}));
 await page.route('**/api/student/coach/drives/good/context',route=>route.fulfill({json:{company_name:'Valid Co',role_title:'Engineer',job_description:'Build reliable APIs with Python and SQL.',preparation_mode:'upcoming_placement'}}));
 await page.goto('/coach');await expect(page.getByRole('status').filter({hasText:'Loading your placements'})).toBeVisible();await expect(page.locator('.coach-placement-layout')).toHaveCount(0);release();
 await expect(page.locator('.coach-context-error')).toBeVisible();await expect(page.getByText('Loading placement details…')).toHaveCount(0);await expect(page.getByRole('button',{name:'Build preparation plan'})).toBeDisabled();
 await page.getByLabel('Placement opportunity').selectOption('good');await expect(page.getByRole('button',{name:'Build preparation plan'})).toBeEnabled();await expect(page.locator('.coach-context-error')).toHaveCount(0);
});

test('Coach skill comparison retries failed extraction and uses the full row for keywords',async({page})=>{
 await mockStudent(page);
 await page.route('**/api/student/coach/overview',route=>route.fulfill({json:{upcoming_drives:[{drive_id:'skills',company_name:'Skills Co',role_title:'Engineer'}],completed_placements:[],plans:[],main_resume:{submission_id:'r',label:'Main Resume'}}}));
 await page.route('**/api/student/coach/drives/skills/context',route=>route.fulfill({json:{company_name:'Skills Co',role_title:'Engineer',job_description:'Build reliable Python APIs and use SQL.',preparation_mode:'upcoming_placement'}}));
 let calls=0;await page.route('**/api/student/coach/drives/skills/skill-match**',route=>{calls++;return route.fulfill(calls===1?{status:503,json:{detail:'Could not compare requirements.'}}:{json:{company_name:'Skills Co',role_title:'Engineer',resume_label:'Main Resume',groups:{resume_match:[],related_evidence:[],no_resume_evidence:['Python','SQL','REST APIs','Testing']},language_options:['Python'],language_is_alternative:false}})});
 await page.goto('/coach');await page.getByRole('button',{name:'Build preparation plan'}).click();await expect(page.locator('.coach-match-empty')).toBeVisible();await expect(page.locator('.coach-evidence-loading')).toHaveCount(0);await page.getByRole('button',{name:'Refresh skills'}).click();await expect(page.locator('.coach-evidence-tags span')).toHaveCount(4);
 const sizes=await page.locator('.coach-evidence-band').evaluate(el=>({band:el.getBoundingClientRect().width,parent:el.parentElement!.getBoundingClientRect().width,tagTops:Array.from(el.querySelectorAll('.coach-evidence-tags span')).map(n=>n.getBoundingClientRect().top)}));expect(sizes.band/sizes.parent).toBeGreaterThan(.98);expect(new Set(sizes.tagTops).size).toBe(1);expect(calls).toBe(2);
});

test('Coach diagnostic saves typed answers, exposes skip before voice, and resumes unanswered tasks',async({page})=>{
 await mockStudent(page);const diagnostic:any={id:'d',status:'in_progress',tasks_json:[{task_id:'inactive',active:false,sub_skill:'Old',format:'scenario',question:'Old task'},{task_id:'one',sub_skill:'Python',format:'scenario',question:'Explain error handling.'},{task_id:'two',sub_skill:'SQL',format:'scenario',question:'Explain joins.'}],answers_json:{}};
 await page.route('**/api/student/coach/overview',route=>route.fulfill({json:{upcoming_drives:[{drive_id:'answer',company_name:'Answer Co',role_title:'Engineer'}],completed_placements:[],plans:[],main_resume:{submission_id:'r',label:'Main Resume'}}}));
 await page.route('**/api/student/coach/drives/answer/context',route=>route.fulfill({json:{company_name:'Answer Co',role_title:'Engineer',job_description:'Build reliable Python APIs and use SQL.',preparation_mode:'upcoming_placement'}}));
 await page.route('**/api/student/coach/drives/answer/skill-match**',route=>route.fulfill({json:{company_name:'Answer Co',role_title:'Engineer',groups:{resume_match:['Python'],related_evidence:[],no_resume_evidence:['SQL']},language_options:[],language_is_alternative:false}}));
 await page.route('**/api/student/coach/drives/answer/diagnostic**',route=>{if(route.request().method()==='PUT')Object.assign(diagnostic.answers_json,route.request().postDataJSON().answers);return route.fulfill({json:diagnostic})});
 await page.goto('/coach');await page.getByRole('button',{name:'Build preparation plan'}).click();await page.getByRole('button',{name:'Continue to validate skills'}).click();await expect(page.getByText('Question 1 of 2')).toBeVisible();await page.getByLabel('Your answer',{exact:true}).fill('Catch specific exceptions, log context and return a safe error.');await page.getByRole('button',{name:'Save answer',exact:true}).click();await expect(page.getByText('Question 2 of 2')).toBeVisible();expect(diagnostic.answers_json.one).toContain('specific exceptions');
 await page.getByRole('button',{name:'Voice answer',exact:true}).click();await expect(page.getByRole('button',{name:'Skip question',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Skip question',exact:true}).click();await expect(page.getByText('You answered or skipped all 2 questions.')).toBeVisible();expect(diagnostic.answers_json.two).toBe('');
});

 test('Career Coach shares the page anchor and shows actionable next steps and keyword evidence',async({page})=>{await mockStudent(page);await page.route('**/api/student/resume-library',route=>route.fulfill({json:{resumes:[{resume_id:'r',submission_id:'r',is_primary:true,label:'Main resume'}]}}));await page.route('**/api/student/career/reports',route=>route.fulfill({json:{reports:[]}}));await page.route('**/api/student/career/finder',route=>route.fulfill({json:{analysis_status:'ai',career_profile:'Backend experience',strongest_current_fit:'Backend Engineer',strongest_growth_path:'AI Engineer',best_project_next:'Build a tested API',what_to_learn_next:['Python','API testing'],career_gap_analysis:'Add a deployment example.',recommended_roles:[{role:'Backend Engineer',why:'Python project evidence',matched_skills:['Python','SQL'],missing_skills:['Docker'],project_evidence:['Python API'],evidence_level:'project_evidence'}]}}));await page.goto('/career');await page.getByRole('button',{name:'Explore from my resume'}).click();await expect(page.getByRole('heading',{name:'Your next steps'})).toBeVisible();await expect(page.getByText('Add a deployment example.')).toBeVisible();await page.getByText('Supporting evidence and gaps',{exact:true}).click();await expect(page.locator('.career-keywords').first()).toContainText('Python');expect(await page.locator('.career-keywords ul').count()).toBe(0);const anchors=await page.evaluate(()=>({content:document.querySelector('.dashboard-content')!.getBoundingClientRect().left+parseFloat(getComputedStyle(document.querySelector('.dashboard-content')!).paddingLeft),heading:document.querySelector('.career-discovery>.page-heading')!.getBoundingClientRect().left,card:document.querySelector('.career-discovery-input')!.getBoundingClientRect().left}));expect(Math.abs(anchors.heading-anchors.content)).toBeLessThan(2);expect(Math.abs(anchors.card-anchors.heading)).toBeLessThan(2);});
