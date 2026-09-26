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
      "/api/student/resume-library": { resumes: [] },
      "/api/student/practice/resumable": { attempts: [] },
      "/api/student/coach/latest-recommendation": { available: false, weak_skills: [], message: "Complete a placement interview to receive focused coaching recommendations." },
      "/api/student/coach/training-cycles": { cycles: [] },
    };
    return route.fulfill({
      status: path in responses ? 200 : 404,
      json: responses[path] || { detail: "Not found." },
    });
  });
}

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

test("enrollment activates a roster account", async ({ page }) => {
  await mockStudent(page, { signedIn: false });
  await page.goto("/");
  await page.getByRole("button", { name: "First time here?" }).click();
  await page.getByLabel("Roll number").fill("CS2026001");
  await page.getByLabel("Email").fill("asha@college.edu");
  await page.getByLabel("Password", { exact: true }).fill("MyStrongPassword1!");
  const enrollment = page.waitForRequest("**/api/auth/student-enroll");
  await page.getByRole("button", { name: "Activate account" }).click();
  expect((await enrollment).postDataJSON().roll_number).toBe("CS2026001");
  await expect(
    page.getByRole("heading", { name: "Hello, Asha." }),
  ).toBeVisible();
});

test("overview is honest about missing data and is responsive", async ({
  page,
}) => {
  await mockStudent(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hello, Asha." }),
  ).toBeVisible();
  await expect(page.getByText("Not assessed", { exact: true })).toBeVisible();
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
      const actions = main.querySelector<HTMLElement>(".career-actions")!;
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
  await expect(page.getByText("Not assessed", { exact: true })).toBeVisible();
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
  await page.goto("/practice");
  await page
    .getByLabel("Upload resume")
    .setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test resume"),
    });
  await page
    .getByLabel("Target role", { exact: true })
    .fill("Software engineer");
  await page.getByRole("button", { name: "Prepare my interview" }).click();
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
  await page.goto("/practice");
  await page
    .getByLabel("Upload resume")
    .setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 resume"),
    });
  await page
    .getByLabel("Target role", { exact: true })
    .fill("Software engineer");
  await page.getByRole("button", { name: "Prepare my interview" }).click();
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
        },
      ],
    }),
  );
  await page.goto("/placements");
  await page.getByRole("button", { name: "View opportunity" }).click();
  await expect(
    page.getByText(/has not assigned an interview yet/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare for interview" }),
  ).toHaveCount(0);
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
  await page.goto("/practice");
  await page
    .getByLabel("Upload resume")
    .setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 resume"),
    });
  await page
    .getByLabel("Target role", { exact: true })
    .fill("Software engineer");
  await page.getByRole("button", { name: "Prepare my interview" }).click();
  await expect(
    page.getByRole("heading", { name: "Your panel is ready." }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

test("placement preparation uses the frozen role, JD, and duration", async ({
  page,
}) => {
  await mockStudent(page);
  await page.route("**/api/student/drives/d1/interview-context", (route) =>
    route.fulfill({
      json: {
        drive_id: "d1",
        role_title: "Graduate engineer",
        job_description: "Frozen campaign job description.",
        duration_minutes: 15,
        action: "start",
        interview_window: "open",
      },
    }),
  );
  await page.goto("/practice?drive=d1");
  await expect(page.getByLabel("Target role", { exact: true })).toHaveValue(
    "Graduate engineer",
  );
  await expect(page.getByLabel("Target role", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await expect(page.getByLabel("Interview duration")).toHaveValue("15");
  await expect(page.getByLabel("Interview duration")).toBeDisabled();
  await expect(page.getByLabel("Job description")).toHaveValue(
    "Frozen campaign job description.",
  );
  await page
    .getByRole("link", { name: "Interview practice", exact: true })
    .click();
  await expect(
    page.getByLabel("Target role", { exact: true }),
  ).not.toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Interview duration")).toBeEnabled();
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
      process.env.VITE_API_URL || "http://127.0.0.1:5175",
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
  if(path.endsWith('/studio-1/preview'))return route.fulfill({contentType:'text/html',body:'<html><body>Resume preview</body></html>'});
  if(path.endsWith('/studio-1')&&method==='GET')return route.fulfill({json:savedProject});
  if(path.endsWith('/studio-1')&&method==='PUT'){const body=route.request().postDataJSON();savedProject={...savedProject,...body,revision:savedProject.revision+1};return route.fulfill({json:savedProject})}
  return route.fulfill({status:404,json:{detail:`Not found ${method} ${path}`}});
 });
 await page.goto('/resume-studio');
 await page.getByRole('button',{name:'Create resume',exact:true}).click();
 await page.getByLabel('Add resume section').selectOption('projects');
 await page.getByRole('button',{name:'Add Project',exact:true}).click();
 await page.getByLabel('Title',{exact:true}).fill('Library API');
 await page.getByLabel('Description / details',{exact:true}).fill('Built a Python API with book search.');
 await page.getByRole('button',{name:'Save resume',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Resume saved as a new revision');
 expect(savedProject.revision).toBe(2);
 await page.reload();
 await page.getByRole('button',{name:/Resume 1 Revision 2/}).click();
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Library API');
 await expect(page.getByLabel('Description / details',{exact:true})).toHaveValue('Built a Python API with book search.');
});

test('coach creates a saved roadmap and continues the conversation',async({page})=>{
 await mockStudent(page);const plan={id:'plan-1',role_title:'Backend engineer',target_date:'2027-01-01',plan:{summary:'Learn reliable API design',goal:'Explain and build APIs',priority_topics:[],daily_roadmap:[{day:1,title:'Python APIs',focus:'Request handling',activities:['Build one endpoint'],success_check:'Explain a request'}],discussion_starters:['Show today’s plan']},messages:[{id:'m1',role:'coach',content:'Let’s learn API design.'}]};let created=false;
 await page.route('**/api/student/coach/plans**',route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith('/messages')){plan.messages.push({id:'m2',role:'coach',content:'An API receives a request and returns a response.'});return route.fulfill({json:{reply:plan.messages[1].content}})}if(path.endsWith('/plans')){if(route.request().method()==='POST'){created=true;return route.fulfill({json:plan})}return route.fulfill({json:{plans:created?[plan]:[]}})}return route.fulfill({json:plan})});
 await page.goto('/coach');await page.getByLabel('Target role',{exact:true}).fill('Backend engineer');await page.getByLabel('Interview date').fill('2027-01-01');await page.getByLabel('Job description',{exact:true}).fill('Build Python APIs and reliable database services.');await page.getByRole('button',{name:'Create preparation plan'}).click();await expect(page.getByText('Learn reliable API design')).toBeVisible();await expect(page.getByText('Python APIs',{exact:true})).toBeVisible();await expect(page.getByText('Build one endpoint')).toBeVisible();await page.getByLabel('Ask your coach').fill('Explain APIs');await page.getByRole('button',{name:'Send message'}).click();await expect(page.getByText('An API receives a request and returns a response.')).toBeVisible();await page.getByText('Python APIs',{exact:true}).locator('xpath=ancestor::article[1]').click();await page.getByRole('button',{name:'Connect',exact:true}).click();await expect(page).toHaveURL(/\/coach\/session\?plan=plan-1&session=/);await expect(page.getByRole('heading',{name:'VoiceDot AI Coach'})).toBeVisible();
});

test('coach voice acknowledges played audio and releases the microphone on navigation',async({page})=>{
 await mockStudent(page);const plan={id:'voice-1',role_title:'Engineer',target_date:'2027-01-01',plan:{summary:'Learn APIs',goal:'Understand requests',priority_topics:[],daily_roadmap:[],discussion_starters:[]},messages:[]};
 await page.route('**/api/student/coach/training-cycles',r=>r.fulfill({json:{cycles:[{id:'cycle-1',plan_id:'voice-1',focus_skills:[],call_scheduled_for:'2026-09-20T10:00:00Z',call_duration_minutes:10,practice_status:'pending'}]}}));
 await page.route('**/api/student/coach/plans**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/plans')?{plans:[plan]}:plan}));
 await page.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{const ctx=new AudioContext(),destination=ctx.createMediaStreamDestination(),track=destination.stream.getAudioTracks()[0],stop=track.stop.bind(track);track.stop=()=>{(window as any).micReleased=true;stop();void ctx.close()};return destination.stream}})});
 let acknowledged=false,ended=false;
 await page.routeWebSocket('**/ws/coach/**',ws=>{ws.onMessage(message=>{if(typeof message==='string'){const p=JSON.parse(message);if(p.type==='playback_complete'&&p.audio_epoch===1)acknowledged=true;if(p.type==='end_interview')ended=true}});ws.send(JSON.stringify({type:'tts_begin',audio_epoch:1,text:'Welcome to your lesson.'}));const packet=Buffer.alloc(964);packet.writeUInt32BE(1);ws.send(packet);ws.send(JSON.stringify({type:'tts_end',audio_epoch:1}));});
 await page.goto('/coach/session?plan=voice-1&session=voice-1%3Aday%3A1');await page.getByRole('button',{name:'Connect AI Coach'}).click();await expect.poll(()=>acknowledged).toBe(true);await expect(page.getByText('Listening to you',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Back to AI Coach'}).click();await expect.poll(()=>ended).toBe(true);await expect.poll(()=>page.evaluate(()=>(window as any).micReleased)).toBe(true);
});

test('academics shows source dates, attendance and private marks reports on mobile',async({page})=>{
 await mockStudent(page);await page.setViewportSize({width:390,height:844});
 await page.route('**/api/student/academics',r=>r.fulfill({json:{status:'connected',source_name:'Campus academic records',notice:'Imported academic records, not a live ERP feed.',attendance:[{period_start:'2026-07-06',period_end:'2026-09-04',hours_conducted:100,hours_present:85,hours_absent:15,percentage:85,source_file:'Attendance.xlsx',subjects:[{subject:'Python (24 hrs)',reported_value:20}]}],marks_reports:[{report_id:'report-1',title:'Semester marks',page_number:1}]}}));
 await page.route('**/api/student/academics/reports/report-1',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8X8AAAAASUVORK5CYII=','base64')}));
 await page.goto('/');await expect(page.getByText('85%',{exact:true})).toBeVisible();await page.getByRole('link',{name:'View marks and attendance →'}).click();await expect(page.getByRole('heading',{name:'Marks and attendance',exact:true})).toBeVisible();await expect(page.getByText('Hours present',{exact:true})).toBeVisible();await expect(page.getByText('Python (24 hrs)',{exact:true})).toBeVisible();await expect(page.getByText('Imported academic records, not a live ERP feed.')).toBeVisible();await expect(page.getByRole('img',{name:'Your marks report: Semester marks'})).toBeVisible();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download report'}).click();expect((await download).suggestedFilename()).toBe('My-marks-report.png');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('academics distinguishes missing records and service errors without invented marks',async({page})=>{
 await mockStudent(page);let unavailable=false;
 await page.route('**/api/student/academics',r=>r.fulfill({status:unavailable?503:200,json:unavailable?{detail:'Academic records are temporarily unavailable.'}:{status:'not_found',message:'No academic record matches your registered roll number.'}}));
 await page.goto('/academics');await expect(page.getByText('No academic record matches your registered roll number.')).toBeVisible();await expect(page.getByRole('button',{name:'Download report'})).toHaveCount(0);unavailable=true;await page.reload();await expect(page.getByText('Academic records are temporarily unavailable.')).toBeVisible();
});
