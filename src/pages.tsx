import { AcademicOverview } from "./academics";
import { CareerProfile } from "./career-profile";
import {displayName} from "./display";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  ChevronRight,
  Download,
  FileText,
  MapPin,
  Mic,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
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

function ReportList({ reports }: { reports: Report[] }) {
  return (
    <div className="record-list">
      {reports.map((report) => (
        <div className="record" key={report.evaluation_id}>
          <span className="record-icon">
            <FileText size={20} />
          </span>
          <div className="record-info">
            <strong>{report.company_name ? `${report.company_name} · ` : ""}{report.target_role || "Interview report"}</strong>
            <span>
              {report.drive_id ? "Placement interview" : "Practice interview"} ·{" "}
              {date(report.completed_at || report.created_at)}{report.attempt_number ? ` · Attempt ${report.attempt_number}` : ""}
            </span>
          </div>
          {report.report?.status !== "awaiting_release" && <div className="record-result">
            <strong>{report.report?.overall_score == null ? "Not assessed" : score(report.report.overall_score)}</strong>
            <span>{humanize(report.report?.readiness || "Readiness pending")}</span>
          </div>}{report.placement_decision && <span className={`report-decision report-decision-${decisionTone(report.placement_decision)}`}>{humanize(report.placement_decision)}</span>}
          {report.report?.status === "awaiting_release" ? (
            <span className="pill">Awaiting release</span>
          ) : report.status === "released" ? (
            <div className="report-actions"><a
              aria-label={`Open report for ${report.target_role || "interview"}`}
              href={apiUrl(`/api/interview/${encodeURIComponent(report.session_id)}/evaluation/report.html`)}
              target="_blank"
              rel="noreferrer"
            >
              <ChevronRight size={17} /> View report
            </a><a aria-label={`Download PDF report for ${report.target_role || "interview"}`} href={apiUrl(`/api/interview/${encodeURIComponent(report.session_id)}/evaluation/report.pdf`)}><Download size={15}/> PDF</a></div>
          ) : (
            <span className="pill">{humanize(report.status)}</span>
          )}
        </div>
      ))}
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
  const latestDrive = data?.drives?.find((drive) => ["active", "scheduled"].includes(drive.status)) || data?.drives?.[0];
  const latestDriveAvailable = Boolean(latestDrive && ["active", "scheduled"].includes(latestDrive.status) && latestDrive.interview_status !== "closed");
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
      <section className="welcome-banner" data-testid="overview-hero">
        <div>
          <span className="pill">
            <Sparkles size={14} /> YOUR SPACE TO GROW
          </span>
          <h2>
            Good interviews
            <br />
            start with <em>great practice.</em>
          </h2>
          <p>
            A personalized AI panel. Meaningful feedback.
            <br />
            Everything you need to show up with confidence.
          </p>
          <Link to="/practice" className="button white">
            Start an interview <ArrowRight size={17} />
          </Link>
          <Link to="/coach" className="overview-coach-link">Prepare with your AI Coach</Link>
        </div>
        <div className="voice-art" aria-hidden="true">
          <div className="voice-orbit orbit-one" />
          <div className="voice-orbit orbit-two" />
          <div className="voice-orbit orbit-three" />
          <div className="voice-core">
            <Mic size={45} />
          </div>
          <div className="floating-label label-one">
            <span />
            Your future is calling
          </div>
          <div className="floating-label label-two">
            <Sparkles size={15} /> Practice. Reflect. Repeat.
          </div>
        </div>
      </section>
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
                  value: data.attempts.length,
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
            <AcademicOverview />
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
                      <div className="feedback-score"><strong>{score(data.reports[0].report?.overall_score)}</strong><span>Latest score</span></div>
                      <div><strong>Focus before your next attempt</strong><div className="focus-chips">{improvementLabels(data.reports[0]).map(item => <span className="pill" key={item}>{item}</span>)}</div>{!improvementLabels(data.reports[0]).length && <p>Your detailed feedback is being prepared.</p>}</div>
                    </div>
                    {data.reports[0].drive_id && data.reports[0].report?.status !== "awaiting_release" && <Link className="button primary" to="/coach">Train weak areas with AI Coach <ArrowRight size={16}/></Link>}
                    <ReportList reports={data.reports.slice(0, 2)} />
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
                  {
                    n: "04",
                    title: "Build your resume",
                    text: "Create and improve it in Resume Studio.",
                    to: "/resume-studio",
                  },
                  {
                    n: "05",
                    title: "Explore Career Coach",
                    text: "Get guidance for your career next steps.",
                    to: "/career",
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
            {data.attempts.length > 0 && (
              <section className="panel">
                <div className="section-heading">
                  <div><h2>Ready when you are</h2><p>Continue an interview you already started.</p></div>
                  <span className="pill">Saved progress</span>
                </div>
                <AttemptList attempts={data.attempts} />
              </section>
            )}
          </>
        )}
      </ResourceState>
    </>
  );
}

const decisionLabel = (value?: string) => { const key = (value || "undecided").toLowerCase().replace(/[-\s]+/g, "_"); return key.includes("shortlist") ? "Shortlisted" : key.includes("reject") ? "Rejected" : key.includes("hold") ? "On Hold" : "Undecided"; };
const interviewTrackLabels: Record<string, string> = { hr: "Talent Acquisition Specialist", domain: "Senior Domain Specialist", industry: "Practical Interviewer", manager: "Hiring Manager" };
function configuredRoundLabels(drive: Drive) {
  const rounds = drive.agent_selection?.length ? drive.agent_selection : drive.round_configuration || [];
  return rounds.map((round) => {
    if (!round || typeof round !== "object" || !("track" in round)) return "";
    const track = String((round as { track: unknown }).track);
    return interviewTrackLabels[track] || humanize(track);
  }).filter(Boolean);
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
      if (sortOrder === "company") return left.company_name.localeCompare(right.company_name);
      const leftDate = new Date(left.window_start_at || left.drive_date || "9999-12-31").getTime();
      const rightDate = new Date(right.window_start_at || right.drive_date || "9999-12-31").getTime();
      return leftDate - rightDate;
    });
  const hasFilters = Boolean(search.trim()) || statusFilter !== "all";
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
              <option value="all">All statuses</option><option value="awaiting_assignment">Awaiting assignment</option><option value="open">Open now</option><option value="upcoming">Upcoming</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="closed">Closed</option>
            </select>
          </label>
          <label><span>Sort by</span>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="soonest">Soonest interview</option><option value="company">Company name</option>
            </select>
          </label>
        </div>
        <span className="placement-result-count">{items.length} eligible {items.length === 1 ? "opportunity" : "opportunities"}</span>
      </section>
      <ResourceState resource={resource}>
        {items.length ? (
          <div className="drive-grid">
            {items.map((drive) => (
              <article className="panel drive-card" key={drive.id}>
                {(() => {
                  const interviewStatus = drive.interview_status || (drive.status === "active" ? "open" : "upcoming");
                  const statusLabel = interviewStatus === "awaiting_assignment" ? "Awaiting assignment" : interviewStatus === "open" ? "Interview open" : interviewStatus === "upcoming" ? "Upcoming" : interviewStatus === "in_progress" ? "In progress" : interviewStatus === "completed" ? "Completed" : "Closed";
                  const attemptNumber = drive.interview_attempt_number || 1;
                  const maximumAttempts = drive.interview_max_attempts || drive.max_attempts || 1;
                  const attemptProgress = interviewStatus === "closed"
                    ? "Interview closed"
                    : drive.interview_action === "not_assigned"
                    ? `${maximumAttempts} attempt${maximumAttempts === 1 ? "" : "s"} allowed · Not assigned yet`
                    : drive.interview_action === "resume" || drive.interview_assignment_status === "in_progress"
                      ? `Attempt ${attemptNumber} of ${maximumAttempts} · In progress`
                      : drive.interview_action === "start" || drive.interview_action === "retry_preparation"
                        ? `Attempt ${attemptNumber} of ${maximumAttempts} · Ready to start`
                      : drive.interview_assignment_status === "completed"
                        ? `${drive.interview_attempts_used ?? attemptNumber} of ${maximumAttempts} attempts used · ${drive.interview_attempts_remaining ?? 0} remaining`
                        : `Attempt ${attemptNumber} of ${maximumAttempts} · ${drive.interview_attempts_remaining ?? maximumAttempts} remaining`;
                  return <>
                <div className="drive-card-top">
                  <span className="company-avatar">
                    {(drive.company_name || "C").slice(0, 2).toUpperCase()}
                  </span>
                  <span className="pill placement-eligible-badge">Eligible</span>
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
      {selected && (
        <Dialog labelledBy="drive-title" close={() => setSelected(null)}>
          <span className="eyebrow">{selected.company_name}</span>
          <h2 id="drive-title">{selected.role_title}</h2>{context?.decision && <div className={`placement-decision placement-decision-${decisionTone(context.decision)}`}><span>Placement decision</span><strong>{decisionLabel(context.decision)}</strong></div>}
          {(selected.company_description || context?.company_description) && <section className="opportunity-company"><div className="company-avatar">{selected.company_name.slice(0,2).toUpperCase()}</div><div><h3>About {selected.company_name}</h3><p>{context?.company_description || selected.company_description}</p></div></section>}
          {busy && <p role="status">Checking your interview assignment…</p>}
          {error && <ErrorMessage message={error} />}
          <div className="detail-chips"><span className="pill placement-eligible-badge">Eligible</span><span className="pill">{context?.interview_window === "open" ? "Interview window open" : context?.interview_window === "not_open" ? "Interview window upcoming" : context?.interview_window === "closed" ? "Interview window closed" : humanize(selected.status)}</span></div>
          {context && <div className="attempt-count-summary" aria-label="Interview attempt summary">
            <div><span>Attempts allowed</span><strong>{context.max_attempts}</strong></div>
            <div><span>Attempts used</span><strong>{context.attempts_used ?? 0}</strong></div>
            <div><span>Current attempt</span><strong>{context.action === "not_assigned" ? "Not assigned" : `${context.attempt_number} of ${context.max_attempts}`}</strong></div>
            <div><span>Attempts remaining</span><strong>{context.action === "not_assigned" ? `${context.max_attempts} once assigned` : context.attempts_remaining ?? 0}</strong></div>
          </div>}
          <div className="opportunity-details">
            <div><span>Interview window</span><strong>{selected.window_start_at ? `${dateTime(selected.window_start_at)} → ${selected.window_end_at ? dateTime(selected.window_end_at) : "To be announced"}` : date(selected.drive_date)}</strong></div>
            <div><span>Location</span><strong>{context?.location || selected.location || "To be announced"}</strong></div>
            <div><span>Role type</span><strong>{humanize(selected.job_type || "Not specified")}</strong></div>
            <div><span>Compensation</span><strong>{compensationLabel(selected)}</strong></div>
            <div><span>Interview setup</span><strong>{context?.duration_minutes || selected.interview_duration_minutes || "—"} min · {humanize(context?.difficulty_tier || selected.difficulty_tier || "Not set")} · {context?.round_count || selected.agent_selection?.length || selected.round_configuration?.length || "—"} rounds</strong></div>
            {configuredRoundLabels(selected).length > 0 && <div className="opportunity-rounds"><span>Interview rounds</span><ol>{configuredRoundLabels(selected).map((round, index) => <li key={`${round}-${index}`}>{round}</li>)}</ol></div>}
            {selected.application_deadline && <div><span>Apply by</span><strong>{dateTime(selected.application_deadline)}</strong></div>}
          </div>
          {(context?.job_description || selected.job_description) && <details className="job-description"><summary>View role description</summary><p>{context?.job_description || selected.job_description}</p></details>}
          {context && (
            <>
              {context.action === "not_assigned" && <p className="placement-assignment-pending">{context.interview_window === "closed" ? "This placement drive is closed. You can review its details, but no interview attempt can be started." : "You’re eligible. Your placement cell hasn’t assigned an interview attempt yet, so there’s nothing to start or resume."}</p>}
              {context.action !== "not_assigned" && <section className="attempt-progress"><h3>Attempt progress</h3>{(context.attempt_history || []).map((attempt) => <div className="attempt-row" key={safeAttemptNumber(attempt.attempt_number)}><div><strong>Attempt {safeAttemptNumber(attempt.attempt_number, 1, context.max_attempts)}</strong><span>Completed{attempt.completed_at ? ` · ${dateTime(attempt.completed_at)}` : ""}</span></div>{attempt.submission_id && <Link className="button secondary" to={`/reports?submission=${encodeURIComponent(attempt.submission_id)}`}>View result</Link>}</div>)}{context.interview_window !== "closed" && (context.attempts_remaining || 0) > 0 && context.action !== "resume" && <div className="attempt-row available"><div><strong>Attempt {safeAttemptNumber(context.attempt_number, 1, context.max_attempts)}</strong><span>Available to start</span></div></div>}</section>}
              {context.coach_gate_locked && <section className="gentle-note" role="status"><div><strong>Complete AI Coach preparation to unlock your next attempt</strong><p>Your placement score requires AI Coach teaching, the linked focused practice interview, and independent validation. Opening AI Coach alone will not unlock the attempt.</p><Link className="button secondary" to={`/coach?drive=${encodeURIComponent(context.drive_id)}`}>Continue with AI Coach <ArrowRight size={16}/></Link></div></section>}
              {context.publication_status === "released" && context.decision && decisionTone(context.decision) !== "shortlisted" && (
                <p className="placement-decision-note">Placement decision: <strong>{humanize(context.decision)}</strong></p>
              )}
              {context.interview_window !== "closed" && context.action === "resume" && (
                <button
                  className="button primary"
                  onClick={() => {
                    if (context.session_id) {
                      openInterview(context.submission_id, context.session_id);
                    } else {
                      navigate(`/practice?drive=${encodeURIComponent(context.drive_id)}`);
                    }
                  }}
                >
                  {context.session_id ? "Resume interview" : `Resume attempt ${context.attempt_number}`}
                </button>
              )}
              {context.interview_window !== "closed" && (["start", "retry_preparation"].includes(context.action) || context.can_start_next_attempt || (context.action === "completed" && Number(context.attempt_number) < Number(context.max_attempts))) && (
                  <button
                    className="button primary"
                    onClick={() =>
                      navigate(
                        `/practice?drive=${encodeURIComponent(context.drive_id)}`,
                      )
                    }
                  >
                  {context.attempts_used ? `Start attempt ${context.attempt_number}` : "Start interview"} <ArrowRight size={16} />
                  </button>
                )}
              {context.attempt_number > 1 && <Link className="button secondary" to={`/coach?drive=${encodeURIComponent(context.drive_id)}`}>Prepare with your AI Coach</Link>}
              {!context.coach_gate_locked && !["start", "resume", "retry_preparation"].includes(
                context.action,
              ) && !(context.action === "completed" && context.attempt_number < context.max_attempts) && (
                <p>
                  Your assignment is {humanize(context.action).toLowerCase()}.
                  Refresh to check for updates.
                </p>
              )}
            </>
          )}
          <button
            autoFocus
            className="button secondary"
            onClick={() => setSelected(null)}
          >
            Close
          </button>
        </Dialog>
      )}
    </>
  );
}

export function Reports() {
  const resource = useResource<{ reports: Report[] }>("/api/student/reports");
  return (
    <>
      <PageHeading
        eyebrow="REFLECT. LEARN. IMPROVE."
        title="My interview reports"
        action={
          <button className="button secondary" onClick={resource.reload}>
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      >
        Personal feedback from your interviews. Placement results appear when
        your placement team releases them.
      </PageHeading>
      <ResourceState resource={resource}>
        <section className="panel">
          {resource.data?.reports.length ? (
            <ReportList reports={resource.data.reports} />
          ) : (
            <Empty title="A fresh start, full of potential" action>
              Your feedback will appear here after you complete an interview and
              the report is ready.
            </Empty>
          )}
        </section>
      </ResourceState>
    </>
  );
}

export function Growth() {
  const resource = useResource<Readiness>("/api/student/readiness");
  return (
    <>
      <PageHeading
        eyebrow="PROGRESS WITH PURPOSE"
        title="Your growth, in focus"
        action={
          <button className="button secondary" onClick={resource.reload}>
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      >
        Understand your placement readiness and decide where to focus next.
      </PageHeading>
      <ResourceState resource={resource}>
        {resource.data && (
          <div className="growth-grid">
            <section className="panel readiness-card">
              <span className="eyebrow">PLACEMENT READINESS</span>
              <div className="readiness-ring">
                <strong>{score(resource.data.overall_score)}</strong>
              </div>
              <h2>
                {resource.data.overall_score == null
                  ? "Your story is still unfolding"
                  : "Keep building on your progress"}
              </h2>
              <p>
                Based on your official placement interview and the resume used
                in that assessment. Missing evidence is never counted as a zero
                score.
              </p>
              <Link className="button primary" to="/placements">
                Explore placements <ArrowRight size={16} />
              </Link>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Your readiness areas</h2>
              </div>
              {["interview_readiness", "resume_readiness"].map((axis) => {
                const value = resource.data!.axis_scores[axis];
                return (
                  <div className="readiness-axis" key={axis}>
                    <div>
                      <strong>{humanize(axis)}</strong>
                      <span>{score(value)}</span>
                    </div>
                    <progress
                      max={100}
                      value={value ?? 0}
                      aria-label={humanize(axis)}
                    />
                    <p>
                      {value == null
                        ? "Waiting for assessment evidence."
                        : "From your latest qualifying placement assessment."}
                    </p>
                  </div>
                );
              })}
              <div className="gentle-note">
                <Sparkles size={22} />
                <div>
                  <strong>One conversation can make a difference.</strong>
                  <p>
                    Practice is a place to try, learn, and become more
                    comfortable telling your story.
                  </p>
                  <Link to="/practice">
                    Make time for practice <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            </section>
          </div>
        )}
      </ResourceState>
    </>
  );
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
