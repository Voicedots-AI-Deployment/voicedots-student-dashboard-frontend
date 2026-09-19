export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
export const apiUrl = (path: string) => `${API_BASE}${path}`;
let csrfToken = "";

export type Student = {
  id: string;
  full_name: string;
  email: string;
  roll_number: string;
  college_name?: string;
  program?: string;
  department_code?: string;
  graduation_year?: number;
  cgpa?: number;
  target_role?: string;
  current_resume_submission_id?: string;
  photo_url?: string;
};
export type Identity = {
  student: Student;
  logo_url?: string;
  primary_color?: string;
};
export type Attempt = {
  submission_id: string;
  session_id: string;
  target_role?: string;
  duration_minutes?: number;
  submitted_at?: string;
};
export type Report = {
  evaluation_id: string;
  session_id: string;
  submission_id: string;
  status: string;
  created_at: string;
  completed_at?: string;
  target_role?: string;
  drive_id?: string;
  report: {
    overall_score?: number | null;
    status?: string;
    readiness?: string;
    executive_summary?: string;
    priority_improvement_areas?: Array<{ focus?: string; problem?: string }>;
    weaknesses?: Array<string | { focus?: string; area?: string }>;
    improvements?: Array<string | { focus?: string; area?: string }>;
  } | null;
};
export type Drive = {
  id: string;
  company_name: string;
  company_description?: string;
  role_title: string;
  location?: string;
  drive_date?: string;
  window_start_at?: string;
  window_end_at?: string;
  application_deadline?: string;
  status: string;
};
export type DriveContext = {
  drive_id: string;
  company_name: string;
  company_description: string;
  role_title: string;
  job_description: string;
  duration_minutes: number;
  attempt_number: number;
  max_attempts: number;
  action: string;
  can_start_next_attempt?: boolean;
  publication_status: string;
  decision: string;
  submission_id?: string;
  session_id?: string;
  interview_window: string;
  interview_window_start_at?: string;
  interview_window_end_at?: string;
  location?: string;
};
export type Readiness = {
  overall_score: number | null;
  status: string;
  axis_scores: Record<string, number>;
  not_assessed: string[];
};
export type Dashboard = {
  reports: Report[];
  attempts: Attempt[];
  readiness: Readiness;
  drives: Drive[];
};
export type Resume = {
  resume_id: string;
  original_filename: string;
  label?: string;
  is_primary: boolean;
  submission_id?: string;
  uploaded_at: string;
};
export type Preparation = {
  status: string;
  operation_id?: string;
  stage?: string;
  submission_id?: string;
  id?: string;
  session_id?: string;
  message?: string;
  source_extraction_id?: string;
  clarification_required?: boolean;
  can_continue_without_answers?: boolean;
  prompts?: { entry_id: string; name: string; missing_fields: string[] }[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public payload?: unknown,
  ) {
    super(message);
  }
}

function errorMessage(body: unknown): string {
  if (!body || typeof body !== "object")
    return "The request could not be completed. Please try again.";
  const data = body as { detail?: unknown; message?: string; reason?: string };
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail))
    return data.detail.map((item) => item.msg || "Invalid input").join(". ");
  if (data.detail && typeof data.detail === "object")
    return errorMessage(data.detail);
  return (
    data.message ||
    data.reason ||
    "The request could not be completed. Please try again."
  );
}

export async function request(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("X-Portal-Role", "student");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(
      (options.method || "GET").toUpperCase(),
    )
  ) {
    const cookie = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("vd_student_csrf="));
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
    else if (cookie)
      headers.set(
        "X-CSRF-Token",
        decodeURIComponent(cookie.slice("vd_student_csrf=".length)),
      );
  }
  let response: Response;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, options.timeoutMs ?? 30000);
  try {
    response = await fetch(apiUrl(path), {
      ...options,
      signal: controller.signal,
      headers,
      credentials: "include",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (options.signal?.aborted) throw error;
      throw new ApiError(
        "The service is taking longer than expected. Please retry; your saved progress is preserved.",
        0,
      );
    }
    throw new ApiError(
      "Unable to connect to VoiceDots. Check your connection and try again.",
      0,
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401 && !path.includes("/auth/")) {
      window.dispatchEvent(new Event("student-session-expired"));
      throw new ApiError("Your student session has expired. Please sign in again.", response.status, body);
    }
    throw new ApiError(errorMessage(body), response.status, body);
  }
  return response;
}

export async function api<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const response = await request(path, options);
  const body = await response.json();
  if (typeof body?.csrf_token === "string") csrfToken = body.csrf_token;
  if (path === "/api/auth/student-logout") csrfToken = "";
  return body;
}
export const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function openInterview(submissionId?: string, sessionId?: string) {
  if (!submissionId)
    throw new Error("The interview is not ready yet. Refresh and try again.");
  const params = new URLSearchParams({
    id: submissionId,
  });
  if (sessionId) params.set("session_id", sessionId);
  window.location.assign(`/interview.html?${params}`);
}
