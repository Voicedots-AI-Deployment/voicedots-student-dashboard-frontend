import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  FileText,
  LoaderCircle,
  Mic,
  ShieldCheck,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  api,
  ApiError,
  json,
  openInterview,
  request,
  type Attempt,
  type ConfiguredInterviewAgent,
  type Drive,
  type DriveContext,
  type Preparation,
  type PracticeJobDescription,
  type Resume,
} from "./api";
import { useAuth } from "./auth";
import { ResumePreview } from "./resume-preview";
import {
  ErrorMessage,
  humanize,
  PageHeading,
  useResource,
} from "./ui";

const stages: Record<string, string> = {
  analyzing_resume: "Getting to know your experience",
  preparing_role_context: "Understanding your target role",
  generating_questions: "Preparing your personalized questions",
  finalizing_session: "Getting your panel ready",
};

export function Practice() {
  const { identity } = useAuth();
  const [params] = useSearchParams();
  const requestedDriveId = params.get("drive");
  const [mode, setMode] = useState<"practice" | "placement">(requestedDriveId ? "placement" : "practice");
  const [selectedDriveId, setSelectedDriveId] = useState(requestedDriveId || "");
  const driveId = mode === "placement" ? selectedDriveId : null;
  const coachCycleId = params.get("coach_cycle");
  const drives = useResource<Drive[]>("/api/student/drives");
  const availableDrives = (drives.data || []).filter((drive) => {
    const actionable = ["start", "resume", "retry_preparation"].includes(drive.interview_action || "");
    const releasedResult = drive.interview_result_available === true;
    return drive.status === "active"
      && drive.eligibility_status === "eligible"
      && drive.main_resume_available === true
      && !["closed", "expired"].includes(drive.interview_status || "")
      && (actionable || releasedResult);
  });
  const selectedDrive = availableDrives.find((drive) => drive.id === driveId) || null;
  const key = `vd_preparation_${identity!.student.id}_${driveId || coachCycleId || "practice"}`;
  const [file, setFile] = useState<File | null>(null);
  const [resumePreview, setResumePreview] = useState<File | null>(null);
  const [role, setRole] = useState("");
  const [duration, setDuration] = useState("30");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">(() => {
    const graduationYear = identity!.student.graduation_year;
    if (!graduationYear) return "intermediate";
    const academicYear = Math.max(1, 4 - (graduationYear - new Date().getFullYear()));
    return academicYear === 1 ? "beginner" : academicYear === 2 ? "intermediate" : "advanced";
  });
  const [jd, setJd] = useState("");
  const [jdBusy, setJdBusy] = useState(false);
  const [jdError, setJdError] = useState("");
  const [context, setContext] = useState<DriveContext | null>(null);
  const [contextLoading, setContextLoading] = useState(!!requestedDriveId||!!coachCycleId);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [preparation, setPreparation] = useState<Preparation | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  });
  const [pollVersion, setPollVersion] = useState(0);
  const [pollError, setPollError] = useState("");
  const [resumeBusy, setResumeBusy] = useState(false);
  const alive = useRef(true);
  const library = useResource<{ resumes: Resume[] }>(
    "/api/student/resume-library",
  );
  const activeResume = library.data?.resumes.find((resume) =>
    resume.submission_id === identity!.student.current_resume_submission_id,
  ) || library.data?.resumes.find((resume) => resume.is_primary) || null;
  useEffect(() => {
    if (activeResume) void useResume(activeResume);
    else setFile(null);
  }, [activeResume?.resume_id]);
  const attempts = useResource<{ attempts: Attempt[] }>(
    "/api/student/practice/resumable",
  );
  async function generateJobDescription() {
    setJdBusy(true);
    setJdError("");
    try {
      const result = await api<PracticeJobDescription>("/api/student/practice/job-description", { ...json({ role_title: role.trim() }), timeoutMs: 50000 });
      setJd(result.job_description);
    } catch (err) {
      setJdError(err instanceof ApiError ? err.message : "Could not generate a current job description. Your text has not changed; please retry.");
    } finally {
      setJdBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (drives.loading || !drives.data) return;
    const preferred = availableDrives.find((drive) => drive.id === requestedDriveId)
      || availableDrives.find((drive) => drive.interview_action === "resume")
      || availableDrives[0];
    if (!availableDrives.some((drive) => drive.id === selectedDriveId))
      setSelectedDriveId(preferred?.id || "");
  }, [drives.data, drives.loading, requestedDriveId, selectedDriveId]);

  useEffect(() => {
    try {
      setPreparation(JSON.parse(sessionStorage.getItem(key) || "null"));
    } catch {
      setPreparation(null);
    }
    setError("");
  }, [key, mode]);

  useEffect(() => {
    if (mode !== "placement" || !driveId) {
      setContext(null);
      if (!coachCycleId) setContextLoading(false);
      return;
    }
    if (drives.loading) {
      setContextLoading(true);
      return;
    }
    if (!selectedDrive) {
      setContext(null);
      setContextLoading(false);
      return;
    }
    const controller = new AbortController();
    setContextLoading(true);
    api<DriveContext>(
      `/api/student/drives/${encodeURIComponent(driveId)}/interview-context`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        const nextAttemptAvailable = Boolean(data.can_start_next_attempt) ||
          (data.action === "completed" && Number(data.attempt_number) < Number(data.max_attempts));
        if (nextAttemptAvailable && preparation) {
          // A drive-scoped preparation is tied to one placement attempt. Do
          // not reopen the previous attempt's ready session for a retake.
          sessionStorage.removeItem(key);
          sessionStorage.removeItem(`${key}_upload`);
          setPreparation(null);
        }
        setContext(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setContextLoading(false);
      });
    return () => controller.abort();
  }, [driveId, mode, selectedDrive, drives.loading, coachCycleId]);

  useEffect(()=>{
    if(!coachCycleId)return;
    const controller=new AbortController();setContextLoading(true);
    api<{role_title:string;job_description:string;duration_minutes:number;difficulty:"beginner"|"intermediate"|"advanced";focus_skills:{focus?:string}[]}>(`/api/student/coach/training-cycles/${encodeURIComponent(coachCycleId)}/practice-context`,{signal:controller.signal})
      .then(data=>{if(controller.signal.aborted)return;setRole(data.role_title);setJd(data.job_description);setDuration(String(data.duration_minutes||30));setDifficulty(data.difficulty||'intermediate');setNotice(`Focused practice: ${data.focus_skills.map(item=>item.focus).filter(Boolean).join(', ')||'your Coach session priorities'}.`)})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message)})
      .finally(()=>{if(!controller.signal.aborted)setContextLoading(false)});
    return()=>controller.abort();
  },[coachCycleId]);

  function remember(result: Preparation) {
    sessionStorage.setItem(key, JSON.stringify(result));
    setPreparation(result);
  }
  function reset() {
    sessionStorage.removeItem(key);
    sessionStorage.removeItem(`${key}_upload`);
    setPreparation(null);
    setPollError("");
    setError("");
  }

  // Resume a durable preparation operation after refresh, without another upload.
  useEffect(() => {
    if (preparation?.status !== "in_progress" || !preparation.operation_id)
      return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    setPollError("");
    async function poll() {
      try {
        const result = await api<Preparation>(
          `/api/student/interview/preparation/${encodeURIComponent(preparation!.operation_id!)}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (result.status === "in_progress") {
          setStage(stages[result.stage || ""] || "Preparing your interview");
          if (Date.now() - started > 180000) {
            setPollError(
              "Preparation is taking longer than usual. Your progress is saved; check again in a moment.",
            );
            return;
          }
          timer = setTimeout(poll, 1500);
        } else {
          remember(result);
        }
      } catch (e) {
        if (!controller.signal.aborted) setPollError((e as Error).message);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // Operation identity drives polling; stage updates must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparation?.operation_id, preparation?.status, pollVersion, key]);

  function chooseFile(next?: File) {
    setError("");
    if (!next) return;
    if (
      !/\.(pdf|docx)$/i.test(next.name) ||
      next.size === 0 ||
      next.size > 5 * 1024 * 1024
    ) {
      setFile(null);
      setError("Choose a non-empty PDF or DOCX resume, no larger than 5 MB.");
      return;
    }
    setFile(next);
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!file || !activeResume) {
      setError("Add your Main Resume in My Profile before starting an interview.");
      return;
    }
    if (driveId && (!context?.can_start || context.main_resume_available !== true || context.interview_window !== "open")) {
      setError("This placement interview is not available to start right now. Refresh the placement details and try again.");
      return;
    }
    if (!driveId && !role.trim()) {
      setError("Enter a target role before starting practice.");
      return;
    }
    setBusy(true);
    const body = new FormData();
    body.set("resume", file);
    body.set("target_role", driveId ? context!.role_title : role.trim());
    body.set("interview_time_minutes", String(driveId ? context!.duration_minutes || 30 : duration));
    if (!driveId) body.set("difficulty_tier", difficulty);
    body.set("job_description", driveId ? context!.job_description : jd);
    if (driveId) body.set("drive_id", driveId);
    if (coachCycleId) body.set("coach_cycle_id", coachCycleId);
    const fingerprint = JSON.stringify([
      file.name,
      file.size,
      file.lastModified,
      driveId ? context!.role_title : role.trim(),
      driveId ? context!.duration_minutes : duration,
      driveId ? "drive-locked" : difficulty,
      driveId ? context!.job_description : jd,
      driveId,
    ]);
    let saved: { fingerprint?: string; key?: string } = {};
    try {
      // A reopened placement drive is a new attempt. Never reuse the
      // previous attempt's idempotency key, even when the resume and JD are
      // unchanged; doing so replays the old preparation operation.
      if (!(driveId && context?.can_start_next_attempt)) {
        saved = JSON.parse(sessionStorage.getItem(`${key}_upload`) || "{}");
      }
    } catch {
      /* Generate a fresh key. */
    }
    const idempotencyKey =
      saved.fingerprint === fingerprint && saved.key
        ? saved.key
        : crypto.randomUUID();
    sessionStorage.setItem(
      `${key}_upload`,
      JSON.stringify({ fingerprint, key: idempotencyKey }),
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const startRequest = () => api<Preparation>("/api/student/interview/start", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": idempotencyKey },
        signal: controller.signal,
      });
      let result: Preparation;
      try {
        result = await startRequest();
      } catch (firstError) {
        if (!(firstError instanceof ApiError) || firstError.status < 500) throw firstError;
        await new Promise((resolve) => setTimeout(resolve, 1200));
        // Reuse the same key after an ambiguous 5xx. The server returns a
        // completed operation or reclaims a failed one for this request hash;
        // generating a new key here could create a second submission if the
        // first request committed before its response was lost.
        result = await startRequest();
      }
      if (alive.current) remember(result);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof DOMException && e.name === "AbortError"
            ? "The upload response timed out. Retry with the same resume and details to recover the same attempt."
            : (e as Error).message,
        );
      if (e instanceof ApiError && [400, 413, 415, 422].includes(e.status))
        sessionStorage.removeItem(`${key}_upload`);
    } finally {
      clearTimeout(timeout);
      if (alive.current) setBusy(false);
    }
  }

  async function clarify(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (event) {
        const form = new FormData(event.currentTarget);
        const answers = (preparation?.prompts || [])
          .flatMap((prompt, i) =>
            prompt.missing_fields.map((field, j) => ({
              entry_id: prompt.entry_id || prompt.name,
              field,
              value: String(form.get(`${i}-${j}`) || "").trim(),
            })),
          )
          .filter((answer) => answer.value);
        await api(
          `/api/resume/${encodeURIComponent(preparation!.submission_id!)}/amendments`,
          json({
            source_extraction_id: preparation!.source_extraction_id,
            answers,
          }),
        );
      }
      remember(
        await api<Preparation>(
          `/api/student/interview/${encodeURIComponent(preparation!.submission_id!)}/prepare`,
          json({ proceed_without_optional: true }),
        ),
      );
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.payload &&
        typeof e.payload === "object" &&
        "status" in e.payload
      )
        remember(e.payload as Preparation);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function useResume(resume: Resume) {
    setError("");
    setResumeBusy(true);
    try {
      const response = await request(
        `/api/student/resume-library/${encodeURIComponent(resume.resume_id)}/file`,
      );
      const blob = await response.blob();
      const saved = new File([blob], resume.original_filename, { type: blob.type });
      if (!alive.current) return;
      chooseFile(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResumeBusy(false);
    }
  }
  function viewActiveResume() {
    if (!file) return;
    setResumePreview(file);
  }
  const pending = preparation?.status === "in_progress";
  const needsClarification = preparation?.status === "needs_clarification";
  const ready =
    preparation?.status === "ready" && preparation.submission_id && !pending;
  const driveCanStart = Boolean(context && context.can_start && context.main_resume_available === true
    && context.interview_window === "open" && !context.coach_gate_locked);
  const driveCanResume = Boolean(context?.can_resume && context.session_id && context.submission_id);
  const releasedAttempt = context?.attempt_history?.slice().reverse().find((attempt) =>
    attempt.result_available && attempt.submission_id,
  ) || (context?.publication_status === "released" && context.submission_id
    ? { submission_id: context.submission_id }
    : null);
  const placementActionLabel = driveCanResume
    ? "Continue interview"
    : driveCanStart
      ? context?.action === "retry_preparation" ? "Retry placement interview" : context?.can_start_next_attempt ? `Start attempt ${context.next_attempt_number || context.attempt_number}` : "Start placement interview"
      : context?.interview_window === "not_open" ? "Interview not available yet"
        : context?.coach_gate_locked ? "Complete your AI Coach requirement"
          : context?.action === "completed" || (context && context.attempts_remaining === 0) ? "Attempts completed"
            : "Interview unavailable";
  const practicePanel = [
    { n: "01", title: "HR interviewer", text: "Your story, motivation and communication." },
    { n: "02", title: "Domain specialist", text: "Your subject knowledge and problem solving." },
    { n: "03", title: "Industry expert", text: "How you apply your skills in the real world." },
    { n: "04", title: "Hiring manager", text: "Your judgment, ownership and teamwork." },
  ];
  const formatDateTime = (value?: string | null) => {
    if (!value) return "Not set";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not set";
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
    }).format(date);
  };
  const panel: ConfiguredInterviewAgent[] = mode === "placement" ? context?.interview_panel || [] : [];
  const attemptMaximum = Math.max(1, Number(context?.max_attempts) || 1);
  const attemptNumber = Math.min(attemptMaximum, Math.max(1, Number(context?.current_attempt_number || context?.next_attempt_number || context?.attempt_number) || 1));
  const attemptsUsed = Math.min(attemptMaximum, Math.max(0, Number(context?.attempts_used) || 0));
  const attemptsRemaining = Math.min(attemptMaximum, Math.max(0, Number(context?.attempts_remaining) || 0));
  const practiceAttempts = attempts.data?.attempts || [];

  return (
    <div className="interview-practice-page">
      <PageHeading eyebrow="A SAFE SPACE TO FIND YOUR VOICE" title="Let’s get you interview-ready">
        Choose a practice conversation or continue an available placement interview.
      </PageHeading>
      <div className="interview-mode-switch" role="tablist" aria-label="Interview mode">
        <button type="button" role="tab" aria-selected={mode === "practice"} className={mode === "practice" ? "selected" : ""} onClick={() => { setMode("practice"); setError(""); }}>
          Practice Interview
        </button>
        <button type="button" role="tab" aria-selected={mode === "placement"} className={mode === "placement" ? "selected" : ""} onClick={() => { setMode("placement"); setError(""); }}>
          Placement Interview
        </button>
      </div>

      {error && <ErrorMessage message={error} />}
      {notice && <p role="status" className="success-message">{notice}</p>}

      {contextLoading && mode === "placement" && <p className="muted" role="status">Loading placement details…</p>}
      {driveId && !contextLoading && !selectedDrive && drives.data && (
        <div className="gentle-note" role="status"><ShieldCheck size={18}/><p>This placement is no longer available to start. Choose an active opportunity below.</p></div>
      )}

      {preparation ? (
        <section className="panel preparation-panel" aria-live="polite">
          {pending && <>
            <LoaderCircle className={pollError ? "" : "spin"} size={32} />
            <h2>{stage || "Preparing your interview"}</h2>
            <p>Your progress is saved. This can take a few minutes.</p>
            {pollError && <ErrorMessage message={pollError} retry={() => setPollVersion((v) => v + 1)} />}
            {pollError && <button className="button secondary" onClick={() => { sessionStorage.removeItem(key); setPreparation(null); setPollError(""); }}>Return to setup</button>}
          </>}
          {ready && <>
            <span className="empty-icon"><Check /></span>
            <h2>Your panel is ready.</h2>
            <p>Next, we’ll check your camera, microphone, and screen sharing before the interview begins.</p>
            <button className="button primary" onClick={() => openInterview(preparation.submission_id!, preparation.session_id)}>
              Continue to device check <ArrowRight size={17} />
            </button>
            <button className="text-button" onClick={reset}>{mode === "placement" ? "Choose another placement" : "Start a different practice"}</button>
          </>}
          {preparation.status === "resume_reupload_required" && <>
            <h2>Update your active resume</h2>
            <p>{preparation.message} Replace the Main Resume in My Profile so every feature continues to use the same version.</p>
            <Link className="button primary" to="/profile#resume-library">Manage resume in My Profile <ArrowRight size={17}/></Link>
          </>}
          {needsClarification && <>
            <h2>A little more about your experience</h2>
            <p>{preparation.message}</p>
            <form onSubmit={clarify}>
              {preparation.prompts?.map((prompt, i) => <fieldset key={prompt.entry_id || i}>
                <legend>{prompt.name}</legend>
                {prompt.missing_fields.map((field, j) => <label key={field}>
                  {field === "how" ? "What tools and methods did you use?" : field === "ownership" ? "What was your personal contribution?" : field === "result" ? "What was the outcome?" : humanize(field)}
                  <textarea name={`${i}-${j}`} required={preparation.clarification_required} maxLength={4000}/>
                </label>)}
              </fieldset>)}
              <button className="button primary" disabled={busy}>Save and continue</button>
            </form>
            {preparation.can_continue_without_answers && <button className="text-button" disabled={busy} onClick={() => void clarify()}>Continue without optional details</button>}
          </>}
          {!pending && !ready && !needsClarification && preparation.status !== "resume_reupload_required" && <>
            <p>{preparation.message || `Interview status: ${humanize(preparation.status)}.`}</p>
            <button className="button secondary" onClick={reset}>Back to interview setup</button>
          </>}
        </section>
      ) : (
        <div className="practice-grid interview-setup-grid">
          <form className="panel practice-form interview-setup-card" onSubmit={start}>
            {mode === "practice" ? <>
              <div className="section-heading interview-section-heading">
                <div><span className="eyebrow">PRACTICE INTERVIEW</span><h2>Set up your practice</h2><p>Shape a self-practice session around the role you want.</p></div>
                <span className="record-icon"><Mic size={20}/></span>
              </div>
              <fieldset disabled={busy || contextLoading} className="interview-fields">
                <label>Target role
                  <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} required placeholder="e.g. Quant Engineer"/>
                </label>
                <div className="interview-field-row">
                  <label>Interview duration
                    <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                      {[30, 45].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
                    </select>
                  </label>
                  <label>Interview difficulty
                    <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                      <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
                    </select>
                  </label>
                </div>
                <div className="practice-jd-label-row">
                  <label htmlFor="practice-job-description">Job description <span className="optional">Optional</span></label>
                  <button type="button" className="button secondary small" disabled={!role.trim() || jdBusy} onClick={() => void generateJobDescription()}>
                    {jdBusy ? <><LoaderCircle className="spin" size={15}/> Searching current listings…</> : "Generate latest JD"}
                  </button>
                </div>
                <textarea id="practice-job-description" aria-label="Job description" value={jd} onChange={(e) => setJd(e.target.value)} maxLength={8000} rows={6} placeholder="Add a job description for more focused practice…"/>
                {jdError && <p role="alert" className="interview-inline-error">{jdError}</p>}
                <button className="button primary" type="submit" disabled={!activeResume || !file || resumeBusy || busy || !role.trim()}>
                  {busy ? <><LoaderCircle className="spin" size={17}/> Preparing your interview…</> : <>Start practice interview <ArrowRight size={17}/></>}
                </button>
                {!activeResume && !library.loading && <p className="interview-inline-note">Add your Main Resume in My Profile before starting.</p>}
              </fieldset>
            </> : <>
              <div className="section-heading interview-section-heading">
                <div><span className="eyebrow">PLACEMENT INTERVIEW</span><h2>Choose an active opportunity</h2><p>Official role, attempt and interview settings come from your placement team.</p></div>
              </div>
              <label className="placement-select-label">Select placement opportunity
                <select aria-label="Select placement opportunity" value={selectedDriveId} onChange={(event) => { setSelectedDriveId(event.target.value); setPreparation(null); setContext(null); setError(""); }} disabled={drives.loading || availableDrives.length === 0}>
                  {availableDrives.length === 0 && <option value="">No active placement interviews</option>}
                  {availableDrives.map((drive) => <option key={drive.id} value={drive.id}>{drive.company_name} · {drive.role_title}</option>)}
                </select>
              </label>
              {drives.loading ? <p role="status" className="muted">Checking assignments and interview availability…</p>
                : availableDrives.length === 0 ? <div className="interview-empty-state"><strong>No active placement interviews</strong><p>When an eligible placement interview becomes available, it will appear here.</p></div>
                  : contextLoading ? <p role="status" className="muted">Loading official interview configuration…</p>
                    : context ? <div className="placement-official-details">
                      <div className="placement-role-heading"><strong>{context.company_name}</strong><span>{context.role_title}</span></div>
                      <dl>
                        <div><dt>Location</dt><dd>{context.location || selectedDrive?.location || "Not specified"}</dd></div>
                        <div><dt>Interview duration</dt><dd>{context.duration_minutes || selectedDrive?.interview_duration_minutes || "Not specified"}{(context.duration_minutes || selectedDrive?.interview_duration_minutes) ? " minutes" : ""}</dd></div>
                        <div><dt>Attempt</dt><dd>Attempt {attemptNumber} of {attemptMaximum} · {attemptsUsed} completed · {attemptsRemaining} remaining</dd></div>
                        <div><dt>Interview window</dt><dd>{formatDateTime(context.interview_window_start_at)} – {formatDateTime(context.interview_window_end_at)}</dd></div>
                      </dl>
                      <details className="placement-jd-details"><summary>View role details</summary><p>{context.job_description || "No job description was provided for this placement."}</p></details>
                      <div className="placement-primary-action">
                        {driveCanResume ? <button type="button" className="button primary" onClick={() => openInterview(context.submission_id!, context.session_id!)}>Continue interview <ArrowRight size={17}/></button>
                          : driveCanStart && activeResume && file ? <button type="submit" className="button primary" disabled={busy || resumeBusy}>{busy ? <><LoaderCircle className="spin" size={17}/> Preparing placement interview…</> : <>{placementActionLabel} <ArrowRight size={17}/></>}</button>
                            : releasedAttempt?.submission_id ? <Link className="button primary" to={`/reports?submission=${encodeURIComponent(releasedAttempt.submission_id)}`}>View result <ArrowRight size={17}/></Link>
                              : <button type="button" className="button primary" disabled>{!activeResume ? "Add Main Resume to start" : placementActionLabel}</button>}
                        {releasedAttempt?.submission_id && driveCanStart && <Link className="button secondary" to={`/reports?submission=${encodeURIComponent(releasedAttempt.submission_id)}`}>View released result</Link>}
                      </div>
                      {context.coach_gate_locked && <p className="interview-inline-note">Complete the required AI Coach practice to unlock the next attempt.</p>}
                    </div>
                    : <p className="muted">Select an active opportunity to see its official details.</p>}
            </>}
          </form>

          <aside className="panel panel-guide interview-panel-card" aria-label={mode === "practice" ? "Practice interview panel" : "Placement interview panel"}>
            <span className="eyebrow">MEET YOUR INTERVIEW PANEL</span>
            <h2>{mode === "practice" ? "Four perspectives. One stronger you." : selectedDrive ? `${selectedDrive.company_name} interview panel` : "Your placement interviewers"}</h2>
            <p>{mode === "practice" ? "The standard four-person panel for every self-practice interview." : "The interviewers are set by this placement and shown in their configured order."}</p>
            {mode === "practice" ? practicePanel.map((person) => <div className="panel-person" key={person.n}><span>{person.n}</span><div><strong>{person.title}</strong><p>{person.text}</p></div></div>)
              : !selectedDrive ? <div className="interview-empty-state"><strong>Choose an active opportunity</strong><p>The placement panel will appear here after you select a drive.</p></div>
                : contextLoading ? <p className="muted" role="status">Loading the configured panel…</p>
                : panel.length ? panel.map((person) => <div className="panel-person placement-panel-person" key={`${person.order}-${person.track}`}><span>{String(person.order).padStart(2, "0")}</span><div><strong>{person.name}</strong><p className="placement-panel-role">{person.role}</p>{person.persona && <p>{person.persona} approach</p>}{person.description && <p className="placement-panel-description">{person.description}</p>}</div></div>)
                  : <div className="interview-empty-state"><strong>Panel details unavailable</strong><p>The placement team has not provided interviewer details for this opportunity.</p></div>}
          </aside>
        </div>
      )}

      <section className="panel interview-resume-card" aria-labelledby="active-resume-heading">
        <div className="interview-card-heading"><div><span className="eyebrow">SHARED ACROSS YOUR WORKSPACE</span><h2 id="active-resume-heading">Your active resume</h2><p>Used across Interview Practice, Placements, AI Coach and Career Coach.</p></div></div>
        {library.loading || resumeBusy ? <p className="muted" role="status">Loading your Main Resume…</p>
          : activeResume && file ? <div className="interview-active-resume"><FileText size={21}/><div><strong>{activeResume.original_filename}</strong><span>Main Resume · shared across your student features</span></div><button type="button" className="button secondary small" onClick={viewActiveResume}>View resume</button><Link className="button secondary small" to="/profile#resume-library">Manage in My Profile</Link></div>
            : <div className="interview-no-resume"><div><strong>No active resume</strong><p>Add your resume in My Profile before starting an interview.</p></div><Link className="button primary small" to="/profile#resume-library">Go to My Profile <ArrowRight size={15}/></Link></div>}
      </section>

      <section className="panel interview-resume-card" aria-labelledby="resume-session-heading">
        <div className="interview-card-heading"><div><span className="eyebrow">YOUR SAVED PROGRESS</span><h2 id="resume-session-heading">Pick up where you left off</h2><p>{mode === "practice" ? "Interrupted self-practice sessions" : selectedDrive ? `${selectedDrive.company_name} · ${selectedDrive.role_title}` : "Choose a placement to see its resumable session"}</p></div>{mode === "practice" && <button className="text-button" onClick={attempts.reload}>Refresh</button>}</div>
        {mode === "practice" ? attempts.loading ? <p className="muted" role="status">Checking saved practice sessions…</p>
          : attempts.error ? <ErrorMessage message={attempts.error}/>
            : practiceAttempts.length ? <div className="interview-session-list">{practiceAttempts.map((attempt) => <div className="interview-session-row" key={attempt.submission_id}><span className="record-icon"><Mic size={18}/></span><div><strong>{attempt.target_role || "Practice interview"}</strong><span>Practice Interview{attempt.submitted_at ? ` · Started ${formatDateTime(attempt.submitted_at)}` : ""}{attempt.duration_minutes ? ` · ${attempt.duration_minutes} minutes` : ""}</span></div><button className="button secondary small" onClick={() => attempt.session_id && openInterview(attempt.submission_id, attempt.session_id)}>Continue <ArrowRight size={15}/></button></div>)}</div>
              : <p className="muted">No interrupted practice interviews. You’re ready for a fresh start.</p>
          : context?.can_resume && context.session_id && context.submission_id ? <div className="interview-session-row"><span className="record-icon"><Mic size={18}/></span><div><strong>{context.company_name} · {context.role_title}</strong><span>Placement Interview · Attempt {attemptNumber} · Interview in progress</span></div><button className="button secondary small" onClick={() => openInterview(context.submission_id!, context.session_id!)}>Continue interview <ArrowRight size={15}/></button></div>
            : <p className="muted">{selectedDrive ? "There is no interrupted interview for this placement." : "When you select a placement with an interview in progress, it will appear here."}</p>}
      </section>
      {resumePreview && <ResumePreview file={resumePreview} onClose={() => setResumePreview(null)}/>}
    </div>
  );
}
