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
      "/api/student/readiness": readiness,
      "/api/student/drives": [],
      "/api/student/reports": { reports: [] },
      "/api/student/resume-library": { resumes: [] },
      "/api/student/practice/resumable": { attempts: [] },
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
  await page.getByLabel("College email").fill("asha@college.edu");
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
  await page.getByLabel("College email").fill("asha@college.edu");
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
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
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
  await page.getByLabel("College email").fill("asha@college.edu");
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
  await expect(page.getByRole("alert")).toContainText("Please retry.");
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
    page.getByRole("heading", { name: "Check your camera" }),
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
