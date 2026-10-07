import { CareerProfile } from "./career-profile";
import {displayName} from "./display";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  ChevronRight,
  Clock3,
  ExternalLink,
  Download,
  FileText,
  MapPin,
  Mic,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  api,
  apiUrl,
  ApiError,
  json,
  openInterview,
  request,
  type Attempt,
  type Dashboard,
  type Drive,
  type DriveContext,
  type Readiness,
  type Report,
} from "./api";
import { useAuth } from "./auth";
import {
  date,
  dateTime,
  Dialog,
  Empty,
  ErrorMessage,
  humanize,
  PageHeading,
  ResourceState,
  score,
  useResource,
} from "./ui";

function safeAttemptNumber(value: unknown, fallback = 1, maximum?: unknown): number {
  const parsed = Number(value);
  const cap = Number(maximum);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  const normalized = Math.floor(parsed);
  return Number.isFinite(cap) && cap >= 1 ? Math.min(normalized, Math.floor(cap)) : normalized;
}

function ReportList({ reports, search = "", filter = "all" }: { reports: Report[]; search?: string; filter?: string }) {
  const visible = reports.filter((report) => {
    const category = report.drive_id ? "placement" : "practice";
    const query = `${report.company_name || ""} ${report.target_role || ""} ${report.report?.executive_summary || ""}`.toLowerCase();
    return (filter === "all" || filter === category) && query.includes(search.trim().toLowerCase());
  });
  return (
    <div className="student-report-list">
      {visible.map((report) => {
        const pending = report.report?.status === "awaiting_release";
        const assessed = report.report?.overall_score != null && !pending;
        return <article className="student-report-card" key={report.evaluation_id}>
          <div className="student-report-card__icon"><FileText size={19} /></div>
          <div className="student-report-card__main">
            <div className="student-report-card__topline">
              <span className={`student-report-kind ${report.drive_id ? "is-placement" : "is-practice"}`}>{report.drive_id ? "Placement interview" : "Practice interview"}</span>
              <span className={`student-report-status ${pending ? "is-pending" : assessed ? "is-ready" : "is-neutral"}`}>{pending ? "Awaiting release" : assessed ? "Feedback ready" : humanize(report.status)}</span>
            </div>
            <h2>{report.company_name ? `${report.company_name} · ` : ""}{report.target_role || "Interview report"}</h2>
            <p className="student-report-meta">{date(report.completed_at || report.created_at)}{report.attempt_number ? ` · Attempt ${report.attempt_number}` : ""}</p>
            {report.report?.executive_summary && <p className="student-report-summary">{report.report.executive_summary}</p>}

          </div>
          <div className="student-report-card__result">
            {pending ? <><strong className="student-report-pending">In review</strong><span>Your placement team will share feedback here.</span></> : <><strong>{report.report?.overall_score == null ? "—" : score(report.report.overall_score)}</strong><span>{report.report?.readiness ? humanize(report.report.readiness) : report.report?.overall_score == null ? "Assessment pending" : "Feedback ready"}</span></>}
            {report.placement_decision && <span className={`report-decision report-decision-${decisionTone(report.placement_decision)}`}>{humanize(report.placement_decision)}</span>}
            {report.status === "released" && !pending && <div className="report-actions"><Link
              aria-label={`Open report for ${report.target_role || "interview"}`}
              to={`/reports/${encodeURIComponent(report.session_id)}`}
            ><ChevronRight size={17} /> View report</Link><a aria-label={`Download PDF report for ${report.target_role || "interview"}`} href={apiUrl(`/api/interview/${encodeURIComponent(report.session_id)}/evaluation/report.pdf`)}><Download size={15}/> PDF</a></div>}
          </div>
        </article>;
      })}
      {!visible.length && <div className="student-report-filter-empty"><strong>No reports match this view.</strong><span>Try another search or choose a different interview type.</span></div>}
    </div>
  );
}

function improvementLabels(report: Report | undefined) {
  const view = report?.report;
  const values = view?.priority_improvement_areas || view?.weaknesses || view?.improvements || [];
  return values.map((item) => typeof item === "string" ? item : item.focus || ('area' in item ? item.area : '') || "").filter(Boolean).slice(0, 4);
}

export function AttemptList({ attempts }: { attempts: Attempt[] }) {
  const navigate = useNavigate();
  return (
    <div className="record-list">
      {attempts.map((attempt) => (
        <div className="record" key={`${attempt.drive_id || attempt.submission_id}:${attempt.session_id || "pending"}`}>
          <span className="record-icon">
            <Mic size={20} />
          </span>
          <div className="record-info">
            <strong>{attempt.target_role || "Practice interview"}</strong>
            <span>
              {attempt.company_name ? `${attempt.company_name} · ` : ""}
              {attempt.duration_minutes ? `${attempt.duration_minutes} minute session · ` : ""}
              {date(attempt.submitted_at)}
            </span>
          </div>
          <button
            className="button secondary small"
            onClick={() => attempt.session_id
              ? openInterview(attempt.submission_id, attempt.session_id)
              : attempt.drive_id && navigate(`/practice?drive=${encodeURIComponent(attempt.drive_id)}`)}
          >
            Resume <ArrowRight size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Overview() {
  const { identity } = useAuth();
  const resource = useResource<Dashboard>("/api/student/dashboard");
  const data = resource.data;
  const resumableAttempts = (data?.attempts || []).filter(attempt => { const drive = data?.drives.find(item => item.id === attempt.drive_id); return !drive || !drive.is_locked && drive.status !== "closed" && drive.interview_action !== "blocked"; });
  const latestDrive = data?.drives?.find((drive) => ["active", "scheduled"].includes(drive.status)) || data?.drives?.[0];
  const latestDriveAvailable = Boolean(latestDrive && !latestDrive.is_locked && ["active", "scheduled"].includes(latestDrive.status) && latestDrive.interview_status !== "closed");
  const canStartLatestDrive = latestDriveAvailable && ["start", "retry_preparation"].includes(latestDrive?.interview_action || "");
  const canResumeLatestDrive = latestDriveAvailable && latestDrive?.interview_action === "resume";
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE BETTER, EVERY DAY"
        title={`Hello, ${displayName(identity!.student.full_name.split(" ")[0])}.`}
      >
        Your next opportunity starts with what you do today.
      </PageHeading>
      <ResourceState resource={resource}>
        {data && (
          <>
            {latestDrive ? (
              <section className="panel latest-drive-card" data-testid="overview-latest-drive">
                <div>
                  <span className="eyebrow">LATEST PLACEMENT DRIVE</span>
                  <h2>{latestDrive.role_title}</h2>
                  <p>{latestDrive.company_name}{latestDrive.location ? ` · ${latestDrive.location}` : ""}</p>
                  <span className="pill">{humanize(latestDrive.status)}</span>
                </div>
                <div className="career-actions">
                  {latestDriveAvailable && <Link className="button secondary" to={`/coach?drive=${encodeURIComponent(latestDrive.id)}`}>AI Coach <ArrowRight size={16}/></Link>}
                  {canResumeLatestDrive && <Link className="button primary" to={`/practice?drive=${encodeURIComponent(latestDrive.id)}`}>Resume interview <ArrowRight size={16}/></Link>}
                  {canStartLatestDrive && <Link className="button primary" to={`/practice?drive=${encodeURIComponent(latestDrive.id)}`}>Start AI Interview <ArrowRight size={16}/></Link>}
                  {!latestDriveAvailable && <Link className="button secondary" to="/placements">View placements <ArrowRight size={16}/></Link>}
                  {latestDriveAvailable && !canResumeLatestDrive && !canStartLatestDrive && <Link className="button secondary" to="/placements">View opportunity <ArrowRight size={16}/></Link>}
                </div>
              </section>
            ) : (
              <section className="panel latest-drive-card latest-drive-empty" data-testid="overview-latest-drive">
                <div><span className="eyebrow">LATEST PLACEMENT DRIVE</span><h2>No placement drive yet</h2><p>Your placement opportunities will appear here when your placement cell assigns them.</p></div>
                <Link className="button secondary" to="/placements">View placements <ArrowRight size={16}/></Link>
              </section>
            )}
            <section className="stats-grid" data-testid="overview-kpis">
              {[
                {
                  icon: Mic,
                  label: "Completed interviews",
                  value: data.reports.length,
                  detail: "Your practice is adding up",
                },
                {
                  icon: BriefcaseBusiness,
                  label: "Eligible opportunities",
                  value: data.drives.length,
                  detail: "From your placement cell",
                },
                {
                  icon: TrendingUp,
                  label: "Placement readiness",
                  value: score(data.readiness.overall_score),
                  detail:
                    data.readiness.overall_score == null
                      ? "Complete a placement assessment"
                      : "Based on your assessed skills",
                },
                {
                  icon: Target,
                  label: "Interviews to resume",
                  value: resumableAttempts.length,
                  detail: "Pick up where you left off",
                },
              ].map(({ icon: Icon, label, value, detail }) => (
                <article className="stat-card" key={label}>
                  <div className="stat-label">
                    <span>{label}</span>
                    <Icon size={18} />
                  </div>
                  <strong>{value}</strong>
                  <p>{detail}</p>
                </article>
                ))}
            </section>
            <Growth />
            <div className="overview-columns">
              <section className="panel" data-testid="overview-feedback">
                <div className="section-heading">
                  <div>
                    <h2>Your latest feedback</h2>
                    <p>A clearer picture of your progress.</p>
                  </div>
                  <Link to="/reports">
                    View all <ArrowRight size={15} />
                  </Link>
                </div>
                {data.reports.length ? (
                  <>
                    <div className="feedback-spotlight">
                      <div className="feedback-score"><strong>{score(data.reports[0].report?.overall_score)}</strong><span>{data.reports[0].report?.overall_score == null ? "Assessment pending" : "Latest score"}</span></div>
                      <div><strong>Focus before your next attempt</strong><div className="focus-chips">{improvementLabels(data.reports[0]).map(item => <span className="pill" key={item}>{item}</span>)}</div>{!improvementLabels(data.reports[0]).length && <p>Your detailed feedback is being prepared.</p>}</div>
                    </div>
                    {data.reports[0].drive_id && data.reports[0].report?.status !== "awaiting_release" && <Link className="button primary" to="/coach">Train weak areas with AI Coach <ArrowRight size={16}/></Link>}
                    <ReportList reports={data.reports.slice(0, 1)} />
                  </>
                ) : (
                  <Empty
                    title="Your first insight is one interview away"
                    action
                  >
                    Complete an interview to discover your strengths and what to
                    work on next.
                  </Empty>
                )}
              </section>
              <section className="panel next-steps" data-testid="overview-next-steps">
                <span className="eyebrow">MAKE YOUR NEXT MOVE</span>
                <h2>A simple way forward</h2>
                {[
                  {
                    n: "01",
                    title: "Update your profile",
                    text: "Keep your experience ready to share.",
                    to: "/profile",
                  },
                  {
                    n: "02",
                    title: "Practice an interview",
                    text: "Practice with your AI panel.",
                    to: "/practice",
                  },
                  {
                    n: "03",
                    title: "Prepare with AI Coach",
                    text: "Build a plan for your next opportunity.",
                    to: "/coach",
                  },
                ].map((step) => (
                  <Link key={step.n} to={step.to}>
                    <span>{step.n}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.text}</p>
                    </div>
                    <ChevronRight size={18} />
                  </Link>
                ))}
              </section>
            </div>
            {resumableAttempts.length > 0 && (
              <section className="panel">
                <div className="section-heading">
                  <div><h2>Ready when you are</h2><p>Continue an interview you already started.</p></div>
                  <span className="pill">Saved progress</span>
                </div>
                <AttemptList attempts={resumableAttempts} />
              </section>
            )}
          </>
        )}
      </ResourceState>
    </>
  );
}

const interviewTrackLabels: Record<string, string> = { hr: "Talent Acquisition Specialist", domain: "Senior Domain Specialist", industry: "Practical Interviewer", manager: "Hiring Manager" };
function configuredRoundLabels(drive: Drive) {
  const rounds = drive.agent_selection?.length ? drive.agent_selection : drive.round_configuration || [];
  return rounds.map((round) => {
    if (!round || typeof round !== "object" || !("track" in round)) return "";
    const track = String((round as { track: unknown }).track);
    return interviewTrackLabels[track] || humanize(track);
  }).filter(Boolean);
}

type StudentAttemptState = {
  maximum: number;
  used: number;
  completed: number;
  current: number | null;
  next: number | null;
  remaining: number;
};

function boundedCount(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(maximum, Math.floor(parsed))) : fallback;
}

function studentAttemptState(value: Drive | DriveContext): StudentAttemptState {
  const isContext = "drive_id" in value;
  const maximum = Math.max(1, Math.floor(Number(
    isContext ? value.max_attempts : value.interview_max_attempts ?? value.max_attempts ?? 1
  ) || 1));
  const rawUsed = isContext ? value.attempts_used : value.interview_attempts_used;
  const used = boundedCount(rawUsed, 0, maximum);
  const action = isContext ? value.action : value.interview_action || "";
  const status = isContext ? value.assignment_status || "" : value.interview_assignment_status || "";
  const rawAttempt = isContext ? value.attempt_number : value.interview_attempt_number;
  const attempt = Math.max(1, Math.min(maximum, Math.floor(Number(rawAttempt) || 1)));
  const rawCurrent = isContext ? value.current_attempt_number : value.interview_current_attempt_number;
  const current = rawCurrent != null
    ? Math.max(1, Math.min(maximum, Math.floor(Number(rawCurrent) || attempt)))
    : action === "resume" || status === "in_progress" ? attempt : null;
  const rawCompleted = isContext ? value.completed_attempts : value.interview_completed_attempts;
  const completed = boundedCount(rawCompleted, Math.max(0, used - (current ? 1 : 0)), maximum);
  const rawNext = isContext ? value.next_attempt_number : value.interview_next_attempt_number;
  let next = rawNext == null ? null : Math.max(1, Math.min(maximum, Math.floor(Number(rawNext) || 1)));
  if (next == null) {
    if (current != null) next = current;
    else if (["start", "retry_preparation"].includes(action))
      next = Math.min(maximum, status === "completed" ? used + 1 : attempt);
    else if (status === "completed" && maximum > used) next = Math.min(maximum, used + 1);
    else if (action === "not_assigned") next = attempt;
  }
  return { maximum, used, completed, current, next, remaining: Math.max(0, maximum - used) };
}

function placementGroup(drive: Drive) {
  const status = drive.interview_status || (drive.status === "active" ? "open" : "upcoming");
  const action = drive.interview_action || "";
  if (drive.is_locked || status === "closed" || status === "completed" || drive.status === "closed") return "closed";
  if (["resume", "start", "retry_preparation"].includes(action) && status !== "upcoming") return "active";
  if (["upcoming", "awaiting_assignment"].includes(status) || drive.status === "scheduled") return "upcoming";
  return "closed";
}

function safeExternalUrl(value?: string) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function attemptSummaryText(state: StudentAttemptState) {
  return `${state.completed} completed${state.current != null ? ` · Attempt ${state.current} in progress` : ""} · ${state.remaining} remaining`;
}

function compensationLabel(drive: Drive) {
  const minimum = drive.salary_min_amount ?? drive.package_min_lpa;
  const maximum = drive.salary_max_amount ?? drive.package_max_lpa;
  if (minimum == null && maximum == null) return "Not specified";
  const currency = drive.salary_currency || drive.package_currency || "INR";
  const format = (value: number) => {
    try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
    catch { return `${currency} ${value.toLocaleString("en-IN")}`; }
  };
  const legacyLpa = drive.salary_min_amount == null && drive.salary_max_amount == null;
  const lower = minimum == null ? null : `${format(minimum)}${legacyLpa ? " LPA" : ""}`;
  const upper = maximum == null ? null : `${format(maximum)}${legacyLpa ? " LPA" : ""}`;
  const amount = drive.salary_type === "fixed" || !upper || lower === upper ? lower || upper : `${lower || upper} – ${upper}`;
  return `${amount} · ${humanize(drive.salary_period || "annual")}`;
}

const decisionTone = (value?: string) => {
  const key = (value || "undecided").toLowerCase().replace(/[-\s]+/g, "_");
  if (key.includes("shortlist")) return "shortlisted";
  if (key.includes("reject")) return "rejected";
  if (key.includes("hold")) return "on-hold";
  return "undecided";
};

export function Placements() {
  const resource = useResource<Drive[]>("/api/student/drives");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const openedDriveId = useRef("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("soonest");
  const [context, setContext] = useState<DriveContext | null>(null);
  const [selected, setSelected] = useState<Drive | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function select(drive: Drive) {
    setSelected(drive);
    setContext(null);
    setError("");
    setBusy(true);
    try {
      setContext(
        await api<DriveContext>(
          `/api/student/drives/${encodeURIComponent(drive.id)}/interview-context`,
        ),
      );
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? "This opportunity is no longer available. Refresh the placements list to see current opportunities."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const driveId = searchParams.get("drive");
    const drive = resource.data?.find((item) => item.id === driveId);
    if (drive && openedDriveId.current !== drive.id) {
      openedDriveId.current = drive.id;
      void select(drive);
    }
  }, [resource.data, searchParams]);
  const items = (resource.data || [])
    .filter((drive) => drive.eligibility_status !== "ineligible")
    .filter((drive) => {
      const matchesSearch = `${drive.company_name} ${drive.role_title}`
        .toLowerCase().includes(search.toLowerCase());
      const status = drive.interview_status || (drive.status === "active" ? "open" : "upcoming");
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((left, right) => {
      const groupOrder = { active: 0, upcoming: 1, closed: 2 };
      const groupDifference = groupOrder[placementGroup(left)] - groupOrder[placementGroup(right)];
      if (groupDifference) return groupDifference;
      const actionRank = (drive: Drive) => drive.interview_action === "resume" ? 0 : ["start", "retry_preparation"].includes(drive.interview_action || "") ? 1 : 2;
      const actionDifference = actionRank(left) - actionRank(right);
      if (actionDifference) return actionDifference;
      if (sortOrder === "company") return left.company_name.localeCompare(right.company_name);
      const leftDate = new Date(left.window_start_at || left.drive_date || "9999-12-31").getTime();
      const rightDate = new Date(right.window_start_at || right.drive_date || "9999-12-31").getTime();
      return leftDate - rightDate;
    });
  const hasFilters = Boolean(search.trim()) || statusFilter !== "all";
  const groups = [
    { key: "active", title: "Active now", description: "Interviews you can resume or start while the window is open." },
    { key: "upcoming", title: "Scheduled & upcoming", description: "Eligible opportunities that are not ready to start yet." },
    { key: "closed", title: "Closed & past", description: "Completed, closed, or otherwise no longer actionable." },
  ].map((group) => ({ ...group, drives: items.filter((drive) => placementGroup(drive) === group.key) }));
  const attemptState = context ? studentAttemptState(context) : null;
  const companyWebsite = safeExternalUrl(context?.company_website || selected?.company_website);
  const companyLinkedIn = safeExternalUrl(context?.company_linkedin || selected?.company_linkedin);
  const eligibilityDetails = selected ? [
    selected.criteria_min_cgpa != null ? `Minimum CGPA ${selected.criteria_min_cgpa}` : null,
    selected.criteria_department_codes?.length ? `Departments: ${selected.criteria_department_codes.join(", ")}` : null,
    selected.criteria_graduation_years?.length ? `Graduation years: ${selected.criteria_graduation_years.join(", ")}` : null,
    selected.criteria_required_skills?.length
      ? `Skills considered: ${selected.criteria_required_skills.join(", ")}${selected.criteria_min_skill_matches ? ` · Match at least ${selected.criteria_min_skill_matches}` : ""}`
      : null,
    "Main Resume required",
  ].filter((item): item is string => Boolean(item)) : [];
  const interviewWindow = context?.interview_window || "";
  const mainResumeAvailable = context?.main_resume_available === true;
  const canResume = Boolean(context && !context.is_locked && !selected?.is_locked && mainResumeAvailable && interviewWindow === "open" && (context.can_resume ?? context.action === "resume"));
  const canStart = Boolean(context && !context.is_locked && !selected?.is_locked && mainResumeAvailable && interviewWindow === "open" && !context.coach_gate_locked && (
    context.can_start ?? (["start", "retry_preparation"].includes(context.action) || Boolean(context.can_start_next_attempt))
  ));
  const startInterview = () => context && navigate(`/practice?drive=${encodeURIComponent(context.drive_id)}`);
  const resumeInterview = () => {
    if (!context) return;
    if (context.session_id) openInterview(context.submission_id, context.session_id);
    else navigate(`/practice?drive=${encodeURIComponent(context.drive_id)}`);
  };
  const statusText = context
    ? context.is_locked || selected?.is_locked ? "Locked" : canResume ? "In progress"
      : context.main_resume_available === false ? "Main Resume required"
      : interviewWindow === "closed" ? "Closed"
      : interviewWindow === "not_open" ? "Scheduled"
      : context.assignment_status === "expired" ? "Expired"
      : context.action === "not_assigned" ? "Awaiting assignment"
      : context.action === "completed" ? "Completed"
      : context.action === "blocked" ? "Action required"
      : canStart ? "Open now" : humanize(context.action)
    : "Checking status";
  let nextStep = "Your placement interview details are being checked.";
  if (context && attemptState) {
    if (context.is_locked || selected?.is_locked)
      nextStep = "This placement is locked. Contact your placement cell to reopen interview access.";
    else if (context.main_resume_available === false)
      nextStep = "Upload or select your Main Resume in My Profile before starting or resuming this placement interview.";
    else if (interviewWindow === "closed" || selected?.status === "closed")
      nextStep = attemptState.remaining === 0 ? "You have completed all available attempts." : "This placement drive is closed. No further interview action is available.";
    else if (context.action === "not_assigned")
      nextStep = interviewWindow === "not_open" && context.interview_window_start_at
        ? `This interview opens on ${dateTime(context.interview_window_start_at)}.`
        : "You’re eligible, but your placement cell hasn’t assigned an interview attempt yet. You can begin once they assign one.";
    else if (interviewWindow === "not_open")
      nextStep = context.interview_window_start_at ? `This interview opens on ${dateTime(context.interview_window_start_at)}.` : "This interview has been scheduled and is not open yet.";
    else if (context.coach_gate_locked)
      nextStep = "Complete the required AI Coach preparation to unlock your next attempt.";
    else if (canResume) nextStep = "Your interview is in progress. Continue from where you left off.";
    else if (attemptState.next != null && attemptState.remaining > 0 && canStart)
      nextStep = attemptState.completed > 0
        ? `You completed Attempt ${attemptState.completed}. Review any released result, then start Attempt ${attemptState.next} while the interview window is open.`
        : `Your interview is open. Start Attempt ${attemptState.next} before the interview window closes.`;
    else if (attemptState.remaining === 0) nextStep = "You have completed all available attempts.";
    else if (context.publication_status === "scheduled") nextStep = "Your interview is complete. The result will be available after the placement team releases it.";
    else if (context.publication_status === "hidden") nextStep = "Your interview is complete. The placement team has not released the result yet.";
    else nextStep = "Your placement team will update this interview assignment. Refresh to check for changes.";
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR NEXT OPPORTUNITY"
        title="Campus placements"
        action={
          <button className="button secondary" onClick={resource.reload}>
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      >
        Explore opportunities that match your placement eligibility criteria.
      </PageHeading>
      <section className="panel placement-filter-panel" aria-label="Filter placement opportunities">
        <div className="placement-filter-grid">
          <label className="search-field">
            <span>Search opportunities</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Company or role" />
          </label>
          <label><span>Interview status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option><option value="awaiting_assignment">Awaiting assignment</option><option value="open">Open now</option><option value="upcoming">Upcoming</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="expired">Expired</option><option value="closed">Closed</option>
            </select>
          </label>
          <label><span>Sort by</span>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="soonest">Soonest interview</option><option value="company">Company name</option>
            </select>
          </label>
        </div>
        <span className="placement-result-count">{items.length} {items.length === 1 ? "opportunity" : "opportunities"}</span>
      </section>
      <ResourceState resource={resource}>
        {items.length ? (
          <div className="placement-groups">
          {groups.filter((group) => group.drives.length > 0).map((group) => <section className="placement-group" key={group.key} aria-labelledby={`placement-group-${group.key}`}>
            <div className="placement-group-heading"><div><h2 id={`placement-group-${group.key}`}>{group.title}</h2><p>{group.description}</p></div><span>{group.drives.length}</span></div>
            <div className="drive-grid">
            {group.drives.map((drive) => (
              <article className="panel drive-card" key={drive.id}>
                {(() => {
                  const interviewStatus = drive.interview_status || (drive.status === "active" ? "open" : "upcoming");
                  const statusLabel = drive.is_locked || drive.interview_action === "blocked" ? "Locked" : interviewStatus === "awaiting_assignment" ? "Awaiting assignment" : interviewStatus === "open" ? "Open now" : interviewStatus === "upcoming" ? "Scheduled" : interviewStatus === "in_progress" ? "In progress" : interviewStatus === "completed" ? "Completed" : interviewStatus === "expired" ? "Expired" : "Closed";
                  const state = studentAttemptState(drive);
                  const attemptProgress = interviewStatus === "closed"
                    ? "Interview closed"
                    : attemptSummaryText(state);
                  return <>
                <div className="drive-card-top">
                  <span className="company-avatar">
                    {(drive.company_name || "C").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="drive-status-badges"><span className={`pill ${drive.main_resume_available === false ? "placement-resume-required" : "placement-eligible-badge"}`}>{drive.main_resume_available === false ? "Main Resume required" : "Eligible"}</span>{drive.is_locked && <span className="pill placement-locked-badge">Locked</span>}</div>
                </div>

                <span className="eyebrow">{drive.company_name}</span>
                <h2>{drive.role_title}</h2>
                <p>
                  <MapPin size={15} />
                  {drive.location || "Location to be announced"}
                </p>
                <p>
                  <CalendarDays size={15} />
                  {drive.window_start_at ? `${date(drive.window_start_at)} – ${drive.window_end_at ? date(drive.window_end_at) : "To be announced"}` : date(drive.drive_date)}
                </p>
                <p className="drive-attempt-summary">{statusLabel} · {attemptProgress}</p>
                <p className="drive-interview-summary">{drive.interview_duration_minutes || "—"} minutes · {humanize(drive.difficulty_tier || "Difficulty not set")} · {drive.agent_selection?.length || drive.round_configuration?.length || "—"} rounds</p>
                <div className="drive-card-meta"><span>{humanize(drive.job_type || "Job type not set")}</span><span>{compensationLabel(drive)}</span></div>
                {drive.main_resume_available === false && <p className="drive-resume-prompt">Upload your Main Resume in <Link to="/profile">My Profile</Link> before starting an interview.</p>}
                <button
                  className="button secondary"
                  onClick={() => void select(drive)}
                >
                  View opportunity <ArrowRight size={16} />
                </button>
                  </>;
                })()}
              </article>
            ))}
            </div>
          </section>)}
          </div>
        ) : (
          <Empty
            title={
              hasFilters
                ? "No matching opportunities"
                : "Your next opportunity is on its way"
            }
          >
            {hasFilters
              ? <>Adjust your filters or <button className="text-button" onClick={() => { setSearch(""); setStatusFilter("all"); }}>clear them</button>.</>
              : "Eligible placement drives will appear here when your placement cell publishes them."}
          </Empty>
        )}
      </ResourceState>
      {selected && <Dialog labelledBy="drive-title" close={() => setSelected(null)} className="opportunity-dialog">
        <div className="opportunity-shell">
          <header className="opportunity-header">
            <div className="opportunity-identity">
              <span className="company-avatar" aria-hidden="true">{(selected.company_name || "C").slice(0, 2).toUpperCase()}</span>
              <div className="opportunity-title"><span className="eyebrow">PLACEMENT OPPORTUNITY</span><h2 id="drive-title">{selected.company_name}</h2><p>{selected.role_title}</p>
                <div className="opportunity-badges"><span className="pill placement-eligible-badge">Eligible</span><span className="pill">{statusText}</span></div>
              </div>
            </div>
            <div className="opportunity-header-actions">
              {canResume && <button className="button primary" onClick={resumeInterview}>Resume interview <ArrowRight size={16}/></button>}
              {canStart && <button className="button primary" onClick={startInterview}>{attemptState?.completed ? `Start Attempt ${attemptState.next}` : "Start interview"} <ArrowRight size={16}/></button>}
              {context && context.main_resume_available === false && <Link className="button primary" to="/profile">Upload Main Resume <ArrowRight size={16}/></Link>}
              <button className="opportunity-close" aria-label="Close opportunity details" onClick={() => setSelected(null)}><X size={19}/></button>
            </div>
            <div className="opportunity-header-metadata">
              <span><MapPin size={15}/>{context?.location || selected.location || "Location not specified"}</span>
              <span><BriefcaseBusiness size={15}/>{humanize(selected.job_type || "Job type not specified")}</span>
              <span><Target size={15}/>{compensationLabel(selected)}</span>
              <span><CalendarDays size={15}/>{context?.interview_window_start_at ? dateTime(context.interview_window_start_at) : selected.window_start_at ? dateTime(selected.window_start_at) : date(selected.drive_date)}</span>
            </div>
          </header>
          {busy && <p className="opportunity-loading" role="status">Checking your interview assignment…</p>}
          {error && <div className="opportunity-error"><ErrorMessage message={error}/></div>}
          {context?.main_resume_available === false && <div className="placement-resume-callout" role="status"><strong>A Main Resume is required for every placement interview.</strong><span>Upload or select your Main Resume in My Profile. You can return here afterward and continue with the same resume.</span><Link className="button secondary" to="/profile">Go to My Profile</Link></div>}
          <div className="opportunity-layout">
            <main className="opportunity-main">
              {(context?.company_description || selected.company_description || companyWebsite || companyLinkedIn) && <section className="opportunity-section" aria-labelledby="company-about-heading">
                <div className="opportunity-section-heading"><span className="company-avatar" aria-hidden="true">{(selected.company_name || "C").slice(0, 2).toUpperCase()}</span><div><span className="eyebrow">COMPANY</span><h3 id="company-about-heading">About {selected.company_name}</h3></div></div>
                {(context?.company_description || selected.company_description) && <p className="opportunity-prose">{context?.company_description || selected.company_description}</p>}
                {(companyWebsite || companyLinkedIn) && <div className="opportunity-links">
                  {companyWebsite && <a href={companyWebsite} target="_blank" rel="noopener noreferrer">Visit company website <ExternalLink size={15}/></a>}
                  {companyLinkedIn && <a href={companyLinkedIn} target="_blank" rel="noopener noreferrer">Company on LinkedIn <ExternalLink size={15}/></a>}
                </div>}
              </section>}
              {(context?.job_description || selected.job_description) && <section className="opportunity-section" aria-labelledby="role-description-heading"><span className="eyebrow">THE ROLE</span><h3 id="role-description-heading">Job description</h3><p className="opportunity-prose opportunity-jd">{context?.job_description || selected.job_description}</p></section>}
              {eligibilityDetails.length > 0 && <section className="opportunity-section" aria-labelledby="eligibility-criteria-heading"><span className="eyebrow">PLACEMENT CRITERIA</span><h3 id="eligibility-criteria-heading">Eligibility criteria</h3><ul className="opportunity-round-list">{eligibilityDetails.map((detail) => <li key={detail}><span aria-hidden="true">✓</span><strong>{detail}</strong></li>)}</ul></section>}
              <section className="opportunity-section" aria-labelledby="interview-process-heading">
                <span className="eyebrow">WHAT TO EXPECT</span><h3 id="interview-process-heading">Interview process</h3>
                <div className="opportunity-process-meta"><span><Clock3 size={16}/>{context?.duration_minutes || selected.interview_duration_minutes || "—"} minutes</span><span><Target size={16}/>{humanize(context?.difficulty_tier || selected.difficulty_tier || "Difficulty not set")}</span><span><BriefcaseBusiness size={16}/>{context?.round_count ?? configuredRoundLabels(selected).length} rounds</span></div>
                {configuredRoundLabels(selected).length > 0 ? <ol className="opportunity-round-list">{configuredRoundLabels(selected).map((round, index) => <li key={`${round}-${index}`}><span>{index + 1}</span><strong>{round}</strong></li>)}</ol> : <p className="opportunity-muted">Round details have not been provided yet.</p>}
              </section>
              {context && <section className="opportunity-section" aria-labelledby="attempts-heading">
                <span className="eyebrow">YOUR INTERVIEW PROGRESS</span><h3 id="attempts-heading">Attempts</h3>
                {attemptState && <p className="attempt-summary-line">{attemptSummaryText(attemptState)}{context.action === "not_assigned" ? " · Awaiting assignment" : ""}</p>}
                {context.action !== "not_assigned" && <ol className="attempt-timeline">
                  {(context.attempt_history || []).filter((attempt, index, rows) => rows.findIndex((item) => Number(item.attempt_number) === Number(attempt.attempt_number)) === index).sort((a, b) => a.attempt_number - b.attempt_number).map((attempt) => {
                    const number = safeAttemptNumber(attempt.attempt_number, 1, attemptState?.maximum);
                    const resultReady = Boolean(attempt.completed_at && attempt.submission_id && attempt.result_available);
                    return <li key={`attempt-${number}`} className="attempt-timeline-item completed"><div className="attempt-timeline-number">{number}</div><div className="attempt-timeline-content"><strong>Attempt {number}</strong><span>{attempt.completed_at ? `Completed${attempt.completed_at ? ` · ${dateTime(attempt.completed_at)}` : ""}` : "Completed"}</span>{attempt.completed_at && !resultReady && <small>{attempt.evaluation_status === "held_for_review" ? "Result under review" : "Result processing"}</small>}</div>{resultReady && <Link className="button secondary" to={`/reports?submission=${encodeURIComponent(attempt.submission_id!)}`}>View result</Link>}</li>;
                  })}
                  {attemptState?.current != null && !(context.attempt_history || []).some((attempt) => Number(attempt.attempt_number) === attemptState.current) && <li className="attempt-timeline-item current"><div className="attempt-timeline-number">{attemptState.current}</div><div className="attempt-timeline-content"><strong>Attempt {attemptState.current}</strong><span>In progress</span></div>{canResume && <button className="button secondary" onClick={resumeInterview}>Resume interview</button>}</li>}
                  {attemptState?.next != null && attemptState.remaining > 0 && <li className="attempt-timeline-item next"><div className="attempt-timeline-number">{attemptState.next}</div><div className="attempt-timeline-content"><strong>Attempt {attemptState.next}</strong><span>{canStart ? "Ready to start" : context.coach_gate_locked ? "Locked · preparation required" : interviewWindow === "not_open" ? "Scheduled" : context.action === "not_assigned" ? "Awaiting assignment" : "Not available yet"}</span></div></li>}
                  {attemptState?.next != null && attemptState.maximum > attemptState.next && <li className="attempt-timeline-item locked"><div className="attempt-timeline-number">···</div><div className="attempt-timeline-content"><strong>{attemptState.maximum - attemptState.next} more attempt{attemptState.maximum - attemptState.next === 1 ? "" : "s"}</strong><span>Unlock one at a time after the preceding attempt.</span></div></li>}
                  {!attemptState?.current && attemptState?.remaining === 0 && (context.attempt_history || []).length === 0 && <li className="attempt-timeline-item completed"><div className="attempt-timeline-number">✓</div><div className="attempt-timeline-content"><strong>No attempts remaining</strong><span>This assignment has reached its attempt limit.</span></div></li>}
                </ol>}
                {context.coach_gate_locked && <div className="opportunity-coach-gate"><strong>Complete the required AI Coach preparation</strong><p>Your next attempt unlocks when the required preparation and validation are complete.</p><Link className="button secondary" to={`/coach?drive=${encodeURIComponent(context.drive_id)}`}>Continue with AI Coach <ArrowRight size={16}/></Link></div>}
                <div className="opportunity-next-step"><span className="eyebrow">YOUR NEXT STEP</span><p>{nextStep}</p></div>
              </section>}
            </main>
            <aside className="opportunity-snapshot" aria-label="Opportunity snapshot"><span className="eyebrow">OPPORTUNITY SNAPSHOT</span><h3>{selected.role_title}</h3><dl>
              <div><dt>Company</dt><dd>{selected.company_name}</dd></div><div><dt>Role</dt><dd>{selected.role_title}</dd></div><div><dt>Location</dt><dd>{context?.location || selected.location || "Not specified"}</dd></div><div><dt>Job type</dt><dd>{humanize(selected.job_type || "Not specified")}</dd></div><div><dt>Compensation</dt><dd>{compensationLabel(selected)}</dd></div><div><dt>Interview window</dt><dd>{selected.window_start_at ? `${dateTime(selected.window_start_at)}${selected.window_end_at ? ` – ${dateTime(selected.window_end_at)}` : ""}` : date(selected.drive_date)}</dd></div><div><dt>Status</dt><dd>{statusText}</dd></div><div><dt>Eligibility</dt><dd>{context?.eligibility?.status === "eligible" || selected.eligibility_status === "eligible" ? "Eligible" : humanize(context?.eligibility?.status || "Eligible")}</dd></div>
            </dl>{selected.application_deadline && <p className="opportunity-deadline"><strong>Application deadline</strong><span>{dateTime(selected.application_deadline)}</span></p>}</aside>
          </div>
          <footer className="opportunity-footer"><span>Your placement information is provided by your placement cell.</span><button className="button secondary" onClick={() => setSelected(null)}>Close details</button></footer>
        </div>
      </Dialog>}
    </>
  );
}

export function Reports() {
  const resource = useResource<{ reports: Report[] }>("/api/student/reports");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const reports = resource.data?.reports || [];
  const ready = reports.filter((report) => report.report?.status !== "awaiting_release" && report.report?.overall_score != null);
  const pending = reports.filter((report) => report.report?.status === "awaiting_release");
  const latestScore = ready.reduce<number | null>((best, report) => best == null || report.report!.overall_score! > best ? report.report!.overall_score! : best, null);
  return (
    <div className="student-reports-page">
      <PageHeading
        eyebrow="YOUR INTERVIEW PROGRESS"
        title="Reports & feedback"
        action={
          <button className="button secondary" onClick={resource.reload}>
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      >
        Review what went well, see what to practice next, and keep track of feedback shared by your placement team.
      </PageHeading>
      <ResourceState resource={resource}>
        {resource.data && <>
          <section className="student-reports-overview" aria-label="Report overview">
            <article><span>INTERVIEWS</span><strong>{reports.length}</strong><small>Practice and placement</small></article>
            <article><span>FEEDBACK READY</span><strong>{ready.length}</strong><small>Reports you can review</small></article>
            <article><span>IN REVIEW</span><strong>{pending.length}</strong><small>Waiting for placement team</small></article>
            <article><span>TOP SCORE</span><strong>{latestScore == null ? "—" : score(latestScore)}</strong><small>Across released reports</small></article>
          </section>
          <section className="student-reports-toolbar" aria-label="Find a report">
            <label className="student-reports-search"><Search size={17}/><input aria-label="Search reports" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, role, or feedback" /></label>
            <label className="student-reports-filter"><select aria-label="Interview type" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All interviews</option><option value="placement">Placement interviews</option><option value="practice">Practice interviews</option></select></label>
          </section>
          {reports.length ? <ReportList reports={reports} search={search} filter={filter}/> : <section className="panel"><Empty title="Your feedback starts here" action>Your interview reports will appear here when an interview has been reviewed and the report is ready.</Empty></section>}
        </>}
      </ResourceState>
    </div>
  );
}

export function Growth() {
  const resource = useResource<Readiness>("/api/student/readiness");
  return <section className="panel overview-growth"><div className="section-heading"><div><h2>My growth</h2><p>Readiness from your latest placement assessment.</p></div><button className="button secondary small" onClick={resource.reload}><RefreshCw size={15}/> Refresh</button></div><ResourceState resource={resource}>{resource.data && <div className="growth-summary">{[{key:'overall',label:'Placement readiness',value:resource.data.overall_score},...['interview_readiness','resume_readiness'].map(key=>({key,label:humanize(key),value:resource.data!.axis_scores?.[key]}))].map(item=><div key={item.key}><span>{item.label}</span><strong>{score(item.value)}</strong><progress max={100} value={item.value??0} aria-label={item.label}/><small>{item.value==null?'Awaiting assessment':'Latest assessment'}</small></div>)}</div>}</ResourceState></section>;
}

export function Profile() {
  const { identity, refresh } = useAuth();
  const student = identity!.student;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const [photoLoadAttempt, setPhotoLoadAttempt] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<File | null>(null);
  const [capturedUrl, setCapturedUrl] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  useEffect(() => {
    let live = true;
    let objectUrl = "";
    setPhotoUrl("");
    setPhotoLoadError(false);
    if (student.photo_url) {
      void request("/api/student/profile/photo").then(response => response.blob()).then(blob => {
        if (!blob.type.startsWith("image/")) throw new Error("Photo could not be loaded.");
        if (live) { objectUrl = URL.createObjectURL(blob); setPhotoUrl(objectUrl); }
      }).catch(() => { if (live) setPhotoLoadError(true); });
    }
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [student.photo_url, photoLoadAttempt]);
  useEffect(() => () => {
    cameraStream.current?.getTracks().forEach(track => track.stop());
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
  }, [capturedUrl]);
  useEffect(() => {
    if (cameraOpen && videoRef.current && cameraStream.current) videoRef.current.srcObject = cameraStream.current;
  }, [cameraOpen]);
  function stopCamera() {
    cameraStream.current?.getTracks().forEach(track => track.stop());
    cameraStream.current = null;
    setCameraOpen(false);
  }
  async function startCamera() {
    setError(""); setMessage("");
    if (!navigator.mediaDevices?.getUserMedia) { setError("Camera is unavailable in this browser. Upload a photo instead."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      cameraStream.current = stream;
      setCameraOpen(true);
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      setError(name === "NotAllowedError" || name === "PermissionDeniedError"
        ? "Camera permission denied. Allow camera access or upload a photo."
        : "Camera is unavailable. Check that it is connected and not being used by another app.");
    }
  }
  function clearCapture() {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(""); setCapturedPhoto(null);
  }
  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) { setError("Camera preview is not ready yet. Try again in a moment."); return; }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) { setError("Could not capture a photo. Please try again."); return; }
    context.translate(canvas.width, 0); context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) { setError("Could not capture a photo. Please try again."); return; }
      const file = new File([blob], "profile-photo.jpg", { type: "image/jpeg" });
      clearCapture(); setCapturedPhoto(file); setCapturedUrl(URL.createObjectURL(file)); stopCamera();
    }, "image/jpeg", 0.92);
  }
  async function uploadPhoto(file: File) {
    if (file.size > 10 * 1024 * 1024) { setError("Choose an image smaller than 10 MB."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData(); form.append("photo", file, file.name || "profile-photo.jpg");
      await request("/api/student/profile/photo", { method: "POST", body: form });
      stopCamera(); clearCapture();
      await refresh();
      setMessage("Profile photo saved and locked.");
    } catch (e) { setError((e as Error).message || "Upload failed, try again."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const changes: { date_of_birth?: string | null } = {};
    if (form.has("date_of_birth")) changes.date_of_birth = String(form.get("date_of_birth") || "") || null;
    try { await api("/api/student/profile", { ...json(changes), method: "PATCH" }); setMessage("Your profile details have been saved."); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading eyebrow="THE PERSON BEHIND THE POTENTIAL" title="My profile">Your student identity and profile details, in one place.</PageHeading>
    <section className="panel profile-panel">
      <div className="profile-heading">
        <div className="profile-avatar-wrap">
          <span className="avatar large">{photoUrl ? <img src={photoUrl} alt="Your verified profile"/> : student.full_name.split(/\s+/).slice(0, 2).map(n => n[0]).join("")}</span>
        </div>
        <div className="profile-heading-identity"><h2>{displayName(student.full_name)}</h2><p>{displayName(student.college_name) || "Student"}</p></div>
        <div className="profile-heading-actions">
          <span className="pill">Student account</span>
          {!student.photo_url && student.allow_student_photo_upload && !cameraOpen && !capturedPhoto && <div className="profile-photo-actions">
            <button type="button" className="button secondary profile-upload-button" disabled={busy} onClick={() => photoInput.current?.click()}><Upload size={15}/>Upload photo</button>
            <button type="button" className="button secondary profile-upload-button" disabled={busy} onClick={() => void startCamera()}><Camera size={15}/>Use webcam</button>
          </div>}
          {!student.photo_url && student.allow_student_photo_upload && cameraOpen && <div className="profile-photo-actions"><button type="button" className="button primary profile-upload-button" onClick={capturePhoto}><Camera size={15}/>Capture</button><button type="button" className="button secondary profile-upload-button" onClick={stopCamera}>Cancel</button></div>}
          {!student.photo_url && student.allow_student_photo_upload && capturedPhoto && <div className="profile-photo-actions"><button type="button" className="button secondary profile-upload-button" disabled={busy} onClick={() => { clearCapture(); void startCamera(); }}>Retake</button><button type="button" className="button primary profile-upload-button" disabled={busy} onClick={() => void uploadPhoto(capturedPhoto)}>{busy ? "Saving…" : "Use this photo"}</button></div>}
          <input ref={photoInput} className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || Boolean(student.photo_url) || !student.allow_student_photo_upload} aria-label="Choose profile photo" onChange={e => { const file = e.currentTarget.files?.[0]; if (file) void uploadPhoto(file); e.currentTarget.value = ""; }}/>
        </div>
      </div>
      {cameraOpen && <div className="profile-camera-preview"><video ref={videoRef} autoPlay playsInline muted aria-label="Webcam preview"/><p>Center your face in the frame, then capture. The photo is checked before it is saved.</p></div>}
      {capturedPhoto && <div className="profile-camera-preview"><img src={capturedUrl} alt="Captured profile photo preview"/><p>Review the photo before saving. You can retake it if needed.</p></div>}
      {!student.photo_url && !student.allow_student_photo_upload && <p className="muted">Your profile photo is managed by the placement team.</p>}
      {photoLoadError && <p className="profile-photo-load-error" role="alert">Photo could not be loaded. It is still locked. <button type="button" onClick={() => setPhotoLoadAttempt(value => value + 1)}>Retry</button></p>}
      {error && <ErrorMessage message={error}/>} {message && <p role="status">{message}</p>}
      <dl className="profile-details">{[["Email", student.email], ["Roll number", student.roll_number], ["Program", student.program], ["Department", student.department_code], ["Graduation year", student.graduation_year], ["CGPA", student.cgpa]].map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value ?? "Not provided"}</dd></div>)}</dl>
      <form className="profile-date-form" onSubmit={save}><label htmlFor="profile-date-of-birth">Date of birth</label><div><input id="profile-date-of-birth" name="date_of_birth" type="date" max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)} defaultValue={student.date_of_birth?.slice(0, 10) || ""}/><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save date of birth"}</button></div></form>
      <p className="muted">Your placement team manages academic details. Contact your placement cell to request corrections.</p>
    </section>
    <CareerProfile />
  </>;
}
