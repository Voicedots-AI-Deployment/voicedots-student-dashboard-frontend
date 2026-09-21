import { AcademicOverview } from "./academics";
import { CareerProfile } from "./career-profile";
import {displayName} from "./display";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  FileText,
  MapPin,
  Mic,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  apiUrl,
  ApiError,
  json,
  openInterview,
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

function ReportList({ reports }: { reports: Report[] }) {
  return (
    <div className="record-list">
      {reports.map((report) => (
        <div className="record" key={report.evaluation_id}>
          <span className="record-icon">
            <FileText size={20} />
          </span>
          <div className="record-info">
            <strong>{report.target_role || "Interview report"}</strong>
            <span>
              {report.drive_id ? "Placement interview" : "Practice interview"} ·{" "}
              {date(report.completed_at || report.created_at)}
            </span>
          </div>
          <div className="record-result">
            <strong>{score(report.report?.overall_score)}</strong>
            <span>{humanize(report.report?.readiness || "Readiness pending")}</span>
          </div>{report.placement_decision && <span className={`report-decision report-decision-${decisionTone(report.placement_decision)}`}>{humanize(report.placement_decision)}</span>}
          {report.report?.status === "awaiting_release" ? (
            <span className="pill">Awaiting release</span>
          ) : report.status === "released" ? (
            <a
              className="icon-button"
              aria-label={`Open report for ${report.target_role || "interview"}`}
              href={apiUrl(`/api/interview/${encodeURIComponent(report.session_id)}/evaluation/report.html`)}
              target="_blank"
              rel="noreferrer"
            >
              <ChevronRight size={20} />
            </a>
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
  return (
    <div className="record-list">
      {attempts.map((attempt) => (
        <div className="record" key={attempt.session_id}>
          <span className="record-icon">
            <Mic size={20} />
          </span>
          <div className="record-info">
            <strong>{attempt.target_role || "Practice interview"}</strong>
            <span>
              {attempt.duration_minutes} minute session ·{" "}
              {date(attempt.submitted_at)}
            </span>
          </div>
          <button
            className="button secondary small"
            onClick={() =>
              openInterview(attempt.submission_id, attempt.session_id)
            }
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
  const latestDrive = data?.drives?.[0];
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE BETTER, EVERY DAY"
        title={`Hello, ${displayName(identity!.student.full_name.split(" ")[0])}.`}
      >
        Your next opportunity starts with what you do today.
      </PageHeading>
      <div className="career-actions"><Link className="button secondary" to="/profile">{identity!.student.current_resume_submission_id ? "Manage your saved resume" : "Set up your resume"}</Link><Link className="button secondary" to="/coach">Learn with your AI coach</Link></div>
      <AcademicOverview />
      {latestDrive && <section className="panel latest-drive-card"><div><span className="eyebrow">LATEST PLACEMENT DRIVE</span><h2>{latestDrive.role_title}</h2><p>{latestDrive.company_name}{latestDrive.location ? ` · ${latestDrive.location}` : ""}</p><span className="pill">{humanize(latestDrive.status)}</span></div><div className="career-actions"><Link className="button secondary" to={`/coach?drive=${encodeURIComponent(latestDrive.id)}`}>AI Coach <ArrowRight size={16}/></Link><Link className="button primary" to={`/practice?drive=${encodeURIComponent(latestDrive.id)}`}>Start AI Interview <ArrowRight size={16}/></Link></div></section>}
      <section className="welcome-banner">
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
            <section className="stats-grid">
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
            {data.attempts.length > 0 && (
              <section className="panel">
                <div className="section-heading">
                  <h2>Ready when you are</h2>
                  <span className="pill">Saved progress</span>
                </div>
                <AttemptList attempts={data.attempts} />
              </section>
            )}
            <div className="overview-columns">
              <section className="panel">
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
                    {data.reports[0].drive_id && data.reports[0].report?.status !== "awaiting_release" && <Link className="button primary" to={`/coach?drive=${encodeURIComponent(data.reports[0].drive_id)}`}>Train weak areas with AI Coach <ArrowRight size={16}/></Link>}
                    <ReportList reports={data.reports.slice(0, 3)} />
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
              <section className="panel next-steps">
                <span className="eyebrow">MAKE YOUR NEXT MOVE</span>
                <h2>A simple way forward</h2>
                {[
                  {
                    n: "01",
                    title: "Bring your experience",
                    text: "Have your latest resume ready.",
                    to: "/profile",
                  },
                  {
                    n: "02",
                    title: "Find your voice",
                    text: "Practice with your AI panel.",
                    to: "/practice",
                  },
                  {
                    n: "03",
                    title: "Keep getting better",
                    text: "Turn feedback into your next step.",
                    to: "/growth",
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
          </>
        )}
      </ResourceState>
    </>
  );
}

const decisionLabel = (value?: string) => { const key = (value || "undecided").toLowerCase().replace(/[-\s]+/g, "_"); return key.includes("shortlist") ? "Shortlisted" : key.includes("reject") ? "Rejected" : key.includes("hold") ? "On Hold" : "Undecided"; };

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
  const [search, setSearch] = useState("");
  const [contexts, setContexts] = useState<Record<string, DriveContext>>({});
  const [context, setContext] = useState<DriveContext | null>(null);
  const [selected, setSelected] = useState<Drive | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const drives = resource.data || [];
    if (!drives.length) return;
    Promise.all(drives.map(async (drive) => {
      try {
        return [drive.id, await api<DriveContext>(`/api/student/drives/${encodeURIComponent(drive.id)}/interview-context`)] as const;
      } catch { return null; }
    })).then((rows) => {
      if (!cancelled) setContexts(Object.fromEntries(rows.filter(Boolean) as Array<readonly [string, DriveContext]>));
    });
    return () => { cancelled = true; };
  }, [resource.data]);
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
          ? "You are eligible for this opportunity. Your placement cell has not assigned an interview yet."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const items =
    resource.data?.filter((drive) =>
      `${drive.company_name} ${drive.role_title}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
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
      <label className="search-field">
        Search opportunities
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company or role…"
        />
      </label>
      <ResourceState resource={resource}>
        {items.length ? (
          <div className="drive-grid">
            {items.map((drive) => (
              <article className="panel drive-card" key={drive.id}>
                {(() => {
                  const live = contexts[drive.id];
                  const windowLabel = live?.interview_window === "open" ? "Interview open" : humanize(live?.interview_window || drive.status);
                  const attempts = live?.attempts_remaining;
                  const attemptLabel = live?.current_attempt?.status === "in_progress" ? "Interview in progress" :
                    attempts === 0 ? "Attempts completed" :
                    live?.attempts_used ? `Attempt ${live.attempts_used} completed · ${attempts} remaining` : `${attempts ?? live?.max_attempts ?? ""} attempt${(attempts ?? 1) === 1 ? "" : "s"} available`;
                  return <>
                <div className="drive-card-top">
                  <span className="company-avatar">
                    {(drive.company_name || "C").slice(0, 2).toUpperCase()}
                  </span>
                  <span className="pill">{windowLabel}</span>
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
                <p className="drive-attempt-summary">{attemptLabel}</p>
                <p className="drive-interview-summary">{live?.duration_minutes || "—"} minutes · {humanize(live?.difficulty_tier || "")} · {live?.round_count || "—"} rounds</p>
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
              search
                ? "No matching opportunities"
                : "Your next opportunity is on its way"
            }
          >
            {search
              ? "Try a different company or role."
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
          {context && (
            <>
              <div className="detail-chips"><span className="pill">Eligible</span><span className="pill">Interview window {humanize(context.interview_window)}</span></div>
              <div className="opportunity-details">
                <div><span>Interview window</span><strong>{context.interview_window_start_at ? `${dateTime(context.interview_window_start_at)} → ${context.interview_window_end_at ? dateTime(context.interview_window_end_at) : "To be announced"}` : humanize(context.interview_window)}</strong></div>
                <div><span>Location</span><strong>{context.location || selected.location || "To be announced"}</strong></div>
                <div><span>Interview</span><strong>{context.duration_minutes || "—"} min · {humanize(context.difficulty_tier || "")} · {context.round_count || "—"} rounds</strong></div>
              </div>
              <section className="attempt-progress"><h3>Attempt progress</h3>{(context.attempt_history || []).map((attempt) => <div className="attempt-row" key={attempt.attempt_number}><div><strong>Attempt {attempt.attempt_number}</strong><span>Completed{attempt.completed_at ? ` · ${dateTime(attempt.completed_at)}` : ""}</span></div>{attempt.submission_id && <Link className="button secondary" to={`/reports?submission=${encodeURIComponent(attempt.submission_id)}`}>View result</Link>}</div>)}{(context.attempts_remaining || 0) > 0 && context.action !== "resume" && <div className="attempt-row available"><div><strong>Attempt {context.attempt_number} {context.attempts_used ? "next" : "1"}</strong><span>Available to start</span></div></div>}</section>
              {context.job_description && (
                <details className="job-description"><summary>View role description</summary><p>{context.job_description}</p></details>
              )}
              {context.publication_status === "released" && context.decision && decisionTone(context.decision) !== "shortlisted" && (
                <p className="placement-decision-note">Placement decision: <strong>{humanize(context.decision)}</strong></p>
              )}
              {context.action === "resume" && (
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
              {(["start", "retry_preparation"].includes(context.action) || context.can_start_next_attempt || (context.action === "completed" && Number(context.attempt_number) < Number(context.max_attempts))) && (
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
              {!["start", "resume", "retry_preparation"].includes(
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
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/student/profile", {
        ...json({ target_role: String(form.get("target_role")).trim() }),
        method: "PATCH",
      });
      setMessage("Your career preference has been saved.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading eyebrow="THE PERSON BEHIND THE POTENTIAL" title="My profile">
        Your student identity and career preferences, in one place.
      </PageHeading>
      <section className="panel profile-panel">
        <div className="profile-heading">
          <span className="avatar large">
            {student.full_name
              .split(/\s+/)
              .slice(0, 2)
              .map((n) => n[0])
              .join("")}
          </span>
          <div>
            <h2>{displayName(student.full_name)}</h2>
            <p>{displayName(student.college_name) || "Student"}</p>
          </div>
          <span className="pill">Student account</span>
        </div>
        <dl className="profile-details">
          {[
            ["Email", student.email],
            ["Roll number", student.roll_number],
            ["Program", student.program],
            ["Department", student.department_code],
            ["Graduation year", student.graduation_year],
            ["CGPA", student.cgpa],
          ].map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value ?? "Not provided"}</dd>
            </div>
          ))}
        </dl>
        <p className="muted">
          Your placement team manages academic details. Contact your placement cell to
          request corrections.
        </p>
      </section>
      <section className="panel">
        <h2>Where would you like to go?</h2>
        <p className="muted">Set a target role to help guide your practice.</p>
        {error && <ErrorMessage message={error} />}
        {message && <p role="status">{message}</p>}
        <form className="preference-form" onSubmit={save}>
          <label>
            Target role
            <input
              name="target_role"
              defaultValue={student.target_role || ""}
              maxLength={120}
              placeholder="e.g. Software engineer"
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save preference"}
          </button>
        </form>
      </section>
      <CareerProfile />
    </>
  );
}
