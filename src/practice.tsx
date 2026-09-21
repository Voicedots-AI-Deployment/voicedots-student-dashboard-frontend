import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  FileText,
  LoaderCircle,
  Mic,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  api,
  ApiError,
  json,
  openInterview,
  request,
  type Attempt,
  type DriveContext,
  type Preparation,
  type Resume,
} from "./api";
import { useAuth } from "./auth";
import { AttemptList } from "./pages";
import {
  date,
  Empty,
  ErrorMessage,
  humanize,
  PageHeading,
  ResourceState,
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
  const driveId = params.get("drive");
  const coachCycleId = params.get("coach_cycle");
  const key = `vd_preparation_${identity!.student.id}_${driveId || coachCycleId || "practice"}`;
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState(identity!.student.target_role || "");
  const [duration, setDuration] = useState("30");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">(() => {
    const graduationYear = identity!.student.graduation_year;
    if (!graduationYear) return "intermediate";
    const academicYear = Math.max(1, 4 - (graduationYear - new Date().getFullYear()));
    return academicYear === 1 ? "beginner" : academicYear === 2 ? "intermediate" : "advanced";
  });
  const [jd, setJd] = useState("");
  const [context, setContext] = useState<DriveContext | null>(null);
  const [contextLoading, setContextLoading] = useState(!!driveId||!!coachCycleId);
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
  const savedFile = useRef<File | null>(null);
  const autoSelected = useRef(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const alive = useRef(true);
  const library = useResource<{ resumes: Resume[] }>(
    "/api/student/resume-library",
  );
  useEffect(() => {
    if (autoSelected.current || file || preparation || !library.data) return;
    autoSelected.current = true;
    const primary = library.data.resumes.find(r => r.is_primary);
    if (primary) void useResume(primary);
  }, [library.data]);
  const attempts = useResource<{ attempts: Attempt[] }>(
    "/api/student/practice/resumable",
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!driveId) {
      setContext(null);
      if(!coachCycleId)setContextLoading(false);
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
        setRole(data.role_title);
        setJd(data.job_description);
        setDuration(String(data.duration_minutes || 30));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setContextLoading(false);
      });
    return () => controller.abort();
  }, [driveId,coachCycleId]);

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
    if (!file) {
      setError("Choose a resume before preparing your interview.");
      return;
    }
    setBusy(true);
    const body = new FormData();
    body.set("resume", file);
    body.set("target_role", role.trim());
    body.set("interview_time_minutes", duration);
    if (!driveId) body.set("difficulty_tier", difficulty);
    body.set("job_description", jd);
    if (driveId) body.set("drive_id", driveId);
    if (coachCycleId) body.set("coach_cycle_id", coachCycleId);
    const fingerprint = JSON.stringify([
      file.name,
      file.size,
      file.lastModified,
      role.trim(),
      duration,
      driveId ? "drive-locked" : difficulty,
      jd,
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
      if (savedFile.current !== file) {
        const savedBody = new FormData(); savedBody.set("resume", file);
        await api("/api/student/resume-library", { method: "POST", body: savedBody });
        savedFile.current = file; library.reload();
      }
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
        // A failed preparation can leave a transient operation record behind;
        // retry with a fresh idempotency key so the next attempt can claim a
        // clean preparation operation instead of replaying the failed one.
        const retryKey = crypto.randomUUID();
        sessionStorage.setItem(`${key}_upload`, JSON.stringify({ fingerprint, key: retryKey }));
        result = await api<Preparation>("/api/student/interview/start", {
          method: "POST", body, headers: { "Idempotency-Key": retryKey }, signal: controller.signal,
        });
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
      const saved = new File([await response.blob()], resume.original_filename);
      if (!alive.current) return;
      savedFile.current = saved;
      chooseFile(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResumeBusy(false);
    }
  }
  async function saveResume() {
    if (!file) return;
    setError("");
    setResumeBusy(true);
    setNotice("");
    const body = new FormData();
    body.set("resume", file);
    try {
      await api("/api/student/resume-library", { method: "POST", body });
      savedFile.current = file;
      library.reload();
      setNotice("Resume saved to your library.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResumeBusy(false);
    }
  }
  async function makePrimary(id: string) {
    setError("");
    setResumeBusy(true);
    try {
      await api(
        `/api/student/resume-library/${encodeURIComponent(id)}/primary`,
        json({}),
      );
      library.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResumeBusy(false);
    }
  }
  async function deleteResume(id: string) {
    if (!window.confirm("Delete this saved resume? Completed interview records will remain available.")) return;
    setError(""); setResumeBusy(true);
    try { await api(`/api/student/resume-library/${encodeURIComponent(id)}`, { method: "DELETE" }); library.reload(); setNotice("Resume deleted."); }
    catch (e) { setError((e as Error).message); } finally { setResumeBusy(false); }
  }
  const pending = preparation?.status === "in_progress";
  const needsClarification = preparation?.status === "needs_clarification";
  const ready =
    preparation?.status === "ready" && preparation.submission_id && !pending;
  const driveBlocked =
    !!driveId &&
    (!context ||
      (!["start", "retry_preparation"].includes(context.action) &&
        !(context.can_start_next_attempt || (context.action === "completed" && Number(context.attempt_number) < Number(context.max_attempts)))) ||
      (context.interview_window !== "open" && !context.can_start_next_attempt));
  return (
    <>
      <PageHeading
        eyebrow="A SAFE SPACE TO FIND YOUR VOICE"
        title={
          driveId
            ? "Prepare for your placement interview"
            : "Let’s get you interview-ready"
        }
      >
        Bring your resume. Choose your role. We’ll bring the questions.
      </PageHeading>
      {error && <ErrorMessage message={error} />}
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      {contextLoading && <p role="status">Checking placement requirements…</p>}
      {driveBlocked && !contextLoading && (
        <div className="gentle-note">
          <ShieldCheck />
          <div>
            <strong>
              {context
                ? `Interview status: ${humanize(context.action)}`
                : "Placement assignment unavailable"}
            </strong>
            <p>
              {context
                ? `Interview window: ${humanize(context.interview_window)}. Your placement team controls access to this attempt.`
                : "Return to Placements to check your assignment."}
            </p>
          </div>
        </div>
      )}
      {preparation && (
        <section className="panel preparation-panel" aria-live="polite">
          {pending && (
            <>
              <LoaderCircle className={pollError ? "" : "spin"} size={32} />
              <h2>{stage || "Preparing your interview"}</h2>
              <p>Your progress is saved. This can take a few minutes.</p>
              {pollError && (
                <ErrorMessage
                  message={pollError}
                  retry={() => setPollVersion((v) => v + 1)}
                />
              )}
              {pollError && (
                <button
                  className="button secondary"
                  onClick={() => {
                    sessionStorage.removeItem(key);
                    setPreparation(null);
                    setPollError("");
                  }}
                >
                  Return to preparation form
                </button>
              )}
            </>
          )}
          {ready && (
            <>
              <span className="empty-icon">
                <Check />
              </span>
              <h2>Your panel is ready.</h2>
              <p>
                Next, we’ll check your camera, microphone, and screen sharing
                before the interview begins.
              </p>
              <button
                className="button primary"
                onClick={() =>
                  openInterview(
                    preparation.submission_id,
                    preparation.session_id,
                  )
                }
              >
                Continue to device check <ArrowRight size={17} />
              </button>
              <button className="text-button" onClick={reset}>
                Start a different practice
              </button>
            </>
          )}
          {preparation.status === "resume_reupload_required" && (
            <>
              <h2>Let’s try a clearer resume</h2>
              <p>{preparation.message}</p>
              <button
                className="button primary"
                onClick={() => {
                  reset();
                  setFile(null);
                }}
              >
                Choose another resume
              </button>
            </>
          )}
          {needsClarification && (
            <>
              <h2>A little more about your experience</h2>
              <p>{preparation.message}</p>
              <form onSubmit={clarify}>
                {preparation.prompts?.map((prompt, i) => (
                  <fieldset key={prompt.entry_id || i}>
                    <legend>{prompt.name}</legend>
                    {prompt.missing_fields.map((field, j) => (
                      <label key={field}>
                        {field === "how"
                          ? "What tools and methods did you use?"
                          : field === "ownership"
                            ? "What was your personal contribution?"
                            : field === "result"
                              ? "What was the outcome?"
                              : humanize(field)}
                        <textarea
                          name={`${i}-${j}`}
                          required={preparation.clarification_required}
                          maxLength={4000}
                        />
                      </label>
                    ))}
                  </fieldset>
                ))}
                <button className="button primary" disabled={busy}>
                  Save and continue
                </button>
              </form>
              {preparation.can_continue_without_answers && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void clarify()}
                >
                  Continue without optional details
                </button>
              )}
              <button className="text-button" disabled={busy} onClick={reset}>
                Use a different resume
              </button>
            </>
          )}
          {!pending &&
            !ready &&
            !needsClarification &&
            preparation.status !== "resume_reupload_required" && (
              <>
                <p>
                  {preparation.message ||
                    `Interview status: ${humanize(preparation.status)}. Check your saved attempts below.`}
                </p>
                <button className="button secondary" onClick={reset}>
                  Back to preparation
                </button>
              </>
            )}
        </section>
      )}
      {!preparation && (
        <div className="practice-grid">
          <form className="panel practice-form" onSubmit={start}>
            <div className="section-heading">
              <div>
                <h2>Your next conversation</h2>
                <p>Personalized around you and your ambitions.</p>
              </div>
              <span className="record-icon">
                <Mic size={20} />
              </span>
            </div>
            <fieldset disabled={busy || contextLoading || driveBlocked}>
              <label
                className="upload-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  chooseFile(e.dataTransfer.files[0]);
                }}
              >
                <UploadCloud size={30} />
                <strong>{file ? file.name : "Drop your resume here"}</strong>
                <span>
                  or choose a file · PDF or DOCX · up to 5 MB, 3 pages
                </span>
                <input
                  aria-label="Upload resume"
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(e) => chooseFile(e.target.files?.[0])}
                />
              </label>
              <label>
                Target role
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  maxLength={120}
                  required
                  readOnly={!!driveId||!!coachCycleId}
                  placeholder="e.g. Software engineer"
                />
              </label>
              <label>
                Interview duration
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  disabled={!!driveId||!!coachCycleId}
                >
                  {[
                    ...new Set([
                      ...(driveId ? [Number(duration)] : []),
                      30,
                      45,
                    ]),
                  ].map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
              {!driveId && <label>
                Interview difficulty
                <select disabled={!!coachCycleId} value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
                <span className="optional">Recommended from your academic year. This level is fixed for this attempt.</span>
              </label>}
              <label>
                Job description{" "}
                <span className="optional">
                  {driveId ? "Set by your placement cell" : coachCycleId ? "Set by your coaching plan" : "Optional"}
                </span>
                <textarea
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  maxLength={8000}
                  readOnly={!!driveId||!!coachCycleId}
                  rows={5}
                  placeholder="Paste a job description for more focused practice…"
                />
              </label>
              <button className="button primary" type="submit">
                {busy ? (
                  <>
                    <LoaderCircle className="spin" size={17} />
                    Uploading your resume…
                  </>
                ) : (
                  <>
                    Prepare my interview <ArrowRight size={17} />
                  </>
                )}
              </button>
            </fieldset>
          </form>
          <aside className="panel panel-guide">
            <span className="eyebrow">MEET YOUR INTERVIEW PANEL</span>
            <h2>
              Four perspectives.
              <br />
              One stronger you.
            </h2>
            <p>A conversation that goes beyond your resume.</p>
            {[
              {
                n: "01",
                title: "HR interviewer",
                text: "Your story, motivation, and communication.",
              },
              {
                n: "02",
                title: "Domain specialist",
                text: "Your subject knowledge and problem solving.",
              },
              {
                n: "03",
                title: "Industry expert",
                text: "How you apply your skills in the real world.",
              },
              {
                n: "04",
                title: "Hiring manager",
                text: "Your judgment, ownership, and teamwork.",
              },
            ].map((person) => (
              <div className="panel-person" key={person.n}>
                <span>{person.n}</span>
                <div>
                  <strong>{person.title}</strong>
                  <p>{person.text}</p>
                </div>
              </div>
            ))}
            <div className="gentle-note">
              <ShieldCheck size={21} />
              <p>
                Use a desktop browser in a quiet space. The interview requires
                your camera, microphone, and screen sharing; you’ll review these
                before joining.
              </p>
            </div>
          </aside>
        </div>
      )}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Your resume library</h2>
            <p>Keep your experience ready for your next opportunity.</p>
          </div>
          {file && (
            <button
              className="button secondary small"
              disabled={resumeBusy}
              onClick={() => void saveResume()}
            >
              {resumeBusy ? "Please wait…" : "Save selected resume"}
            </button>
          )}
        </div>
        <ResourceState resource={library}>
          {library.data?.resumes.length ? (
            <div className="record-list">
              {library.data.resumes.map((resume) => (
                <div className="record" key={resume.resume_id}>
                  <span className="record-icon">
                    <FileText size={20} />
                  </span>
                  <div className="record-info">
                    <strong>{resume.label || resume.original_filename}</strong>
                    <span>
                      {date(resume.uploaded_at)}{" "}
                      {resume.is_primary && "· Main Resume"}
                    </span>
                  </div>
                  {!resume.is_primary && (
                    <button
                      className="text-button"
                      disabled={resumeBusy}
                      onClick={() => void makePrimary(resume.resume_id)}
                    >
                      Make main
                    </button>
                  )}
                  <button
                    className="button secondary small"
                    disabled={resumeBusy || !!preparation || busy}
                    onClick={() => void useResume(resume)}
                  >
                    Use resume
                  </button>
                  <button className="text-button" disabled={resumeBusy || !!preparation || busy} onClick={() => void deleteResume(resume.resume_id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Your experience belongs here">
              Your resume is saved automatically when you prepare an interview. You can also save it here to reuse
              it later.
            </Empty>
          )}
        </ResourceState>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Pick up where you left off</h2>
          <button className="text-button" onClick={attempts.reload}>
            Refresh
          </button>
        </div>
        <ResourceState resource={attempts}>
          {attempts.data?.attempts.length ? (
            <AttemptList attempts={attempts.data.attempts} />
          ) : (
            <p className="muted">
              No interrupted practice interviews. You’re ready for a fresh
              start.
            </p>
          )}
        </ResourceState>
      </section>
    </>
  );
}
