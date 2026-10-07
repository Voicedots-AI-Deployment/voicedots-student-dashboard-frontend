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
  date_of_birth?: string | null;
  cgpa?: number;
  target_role?: string;
  current_resume_submission_id?: string;
  photo_url?: string;
  allow_student_photo_upload?: boolean;
  has_readable_resume?: boolean;
};
export type Identity = {
  student: Student;
  logo_url?: string;
  primary_color?: string;
};
export type Attempt = {
  submission_id: string;
  session_id?: string | null;
  target_role?: string;
  duration_minutes?: number;
  submitted_at?: string;
  drive_id?: string | null;
  company_name?: string | null;
  source?: "practice" | "placement";
};
export type Report = {
  evaluation_id: string;
  session_id: string;
  submission_id: string;
  status: string;
  created_at: string;
  completed_at?: string;
  started_at?: string | null;
  duration_minutes?: number | null;
  placement_decided_at?: string | null;
  target_role?: string;
  drive_id?: string;
  company_name?: string | null;
  attempt_number?: number | null;
  placement_decision?: string | null;
  report: InterviewReportView | null;
};
export type Drive = {
  placement_decision?: string | null;
  is_locked?: boolean;
  id: string;
  company_name: string;
  company_description?: string;
  company_website?: string;
  company_linkedin?: string;
  job_description?: string;
  role_title: string;
  job_type?: string;
  location?: string;
  drive_date?: string;
  window_start_at?: string;
  window_end_at?: string;
  application_deadline?: string;
  application_deadline_at?: string;
  status: string;
  eligibility_status?: "eligible" | "ineligible";
  criteria_min_cgpa?: number | null;
  criteria_department_codes?: string[];
  criteria_graduation_years?: number[];
  criteria_required_skills?: string[];
  criteria_min_skill_matches?: number | null;
  criteria_require_resume?: boolean;
  main_resume_available?: boolean;
  interview_action?: string;
  interview_assignment_status?: string | null;
  interview_status?: string;
  interview_attempt_number?: number;
  interview_max_attempts?: number;
  interview_attempts_used?: number;
  interview_attempts_remaining?: number;
  interview_completed_attempts?: number;
  interview_result_available?: boolean;
  interview_current_attempt_number?: number | null;
  interview_next_attempt_number?: number | null;
  max_attempts?: number;
  salary_type?: string;
  salary_min_amount?: number | null;
  salary_max_amount?: number | null;
  salary_currency?: string;
  salary_period?: string;
  package_min_lpa?: number | null;
  package_max_lpa?: number | null;
  package_currency?: string | null;
  interview_duration_minutes?: number;
  difficulty_tier?: string;
  agent_selection?: unknown[];
  round_configuration?: unknown[];
};
export type ConfiguredInterviewAgent = {
  order: number;
  track: string;
  name: string;
  role: string;
  persona: string;
  description: string;
};
export type DriveContext = {
  is_locked?: boolean;
  drive_id: string;
  company_name: string;
  company_description: string;
  company_website?: string;
  company_linkedin?: string;
  role_title: string;
  job_description: string;
  duration_minutes: number | null;
  attempt_number: number;
  max_attempts: number;
  action: string;
  can_start_next_attempt?: boolean;
  coach_gate_required?: boolean;
  coach_gate_complete?: boolean;
  coach_gate_locked?: boolean;
  lock_reason?: string | null;
  publication_status: string;
  decision: string;
  submission_id?: string;
  session_id?: string;
  interview_window: string;
  interview_window_start_at?: string;
  interview_window_end_at?: string;
  location?: string;
  difficulty_tier?: string;
  round_count?: number;
  eligibility?: { status: string; reason?: string | null };
  attempts_used?: number;
  attempts_remaining?: number;
  completed_attempts?: number;
  current_attempt_number?: number | null;
  next_attempt_number?: number | null;
  assignment_status?: string;
  attempt_history?: Array<{
    attempt_number: number;
    submission_id?: string;
    session_id?: string;
    evaluation_status?: string;
    result_available?: boolean;
    overall_score?: number | null;
    started_at?: string;
    completed_at?: string;
    is_current_attempt?: boolean;
  }>;
  current_attempt?: { attempt_number: number; status: string; started_at?: string; completed_at?: string } | null;
  can_start?: boolean;
  can_resume?: boolean;
  main_resume_required?: boolean;
  main_resume_available?: boolean;
  interview_panel?: ConfiguredInterviewAgent[];
};
export type PracticeJobDescription = {
  role_title: string;
  job_description: string;
  cache_status?: "generated" | "reused" | "stale_fallback";
  generated_at?: string;
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

export type AnswerCoaching = {evidence_quote:string;what_worked:string;improve:string};
export type QuestionReview = {
  answer_id?: number; turn_id?: string; has_audio?: boolean; question_ref?: string;
  round?: string; kind?: string; question?: string; answer?: string; word_count?: number;
  evidence_status?: string; strength_feedback?: string[]; improvement_feedback?: string[];
};
export type ReportFeedback = { text?: string; focus?: string; area?: string; cites_answer_id?: number };
export type InterviewReportView = {
  overall_score?: number | null; status?: string; readiness?: string; executive_summary?: string;
  score_breakdown?: Record<string, number | null>;
  core_dimensions?: Array<{dimension: string; percentage?: number | null; band?: number; reason?: string}>;
  domain_dimensions?: Array<{dimension: string; percentage?: number | null; band?: number; reason?: string}>;
  priority_improvement_areas?: Array<{focus?: string; problem?: string; actions?: string[]}>;
  strengths?: ReportFeedback[]; weaknesses?: Array<string | ReportFeedback>; improvements?: Array<string | ReportFeedback>;
  question_feedback?: Record<string,AnswerCoaching>;
  question_reviews?: QuestionReview[]; assessment_coverage_percent?: number | null;
  communication?: { speaking_speed_wpm?: number | null; pace_label?:string; filler_word_count?:number; top_filler_words?:string[]; measurement_note?:string; scores?: Record<string, number | null> };
  interview_profile?: { difficulty_tier?: string; duration_minutes?: number };
};
