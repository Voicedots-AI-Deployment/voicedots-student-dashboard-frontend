import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Compass, FileText, Sparkles, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { api, json, type Resume } from "./api";
import { useAuth } from "./auth";
import { ErrorMessage, PageHeading, useResource } from "./ui";

type CareerRole = { role?: string; why?: string; matched_skills?: string[]; missing_skills?: string[]; learn_next?: string[]; progression?: string; evidence_level?: string; project_evidence?: string[] };
type CareerResult = {
  career_profile?: string; strongest_current_fit?: string; strongest_growth_path?: string;
  best_project_next?: string; recommended_roles?: CareerRole[]; alternative_careers?: string[];
  what_to_learn_next?: string[]; career_gap_analysis?: string; market_data_note?: string; reused?: boolean;
  analysis_status?: "ai" | "evidence_fallback" | "legacy"; analysis_note?: string;
  saved_report_id?: string;
};

const questions = [
  ["interests", "What topics interest you?", "Choose the subjects you enjoy exploring.", "For example, data, AI, design or building useful software."],
  ["preferred_work", "What work do you enjoy doing?", "Describe activities that keep you engaged.", "For example, analysing data, building models or explaining ideas."],
  ["priorities", "What matters most in your career?", "Think about growth, stability, impact and work style.", "For example, learning opportunities and meaningful work."],
  ["learning_openness", "How open are you to learning new skills?", "This helps separate current evidence from paths you could grow into.", "For example, I enjoy learning adjacent tools and methods."],
] as const;

function List({ items }: { items?: string[] }) {
  return items?.length ? <div className="career-keywords">{items.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div> : <p className="muted">No specific items identified yet.</p>;
}

function answerKey(submissionId: string) { return `voicedots:career-coach:answers:${submissionId}`; }
function readSavedAnswers(submissionId: string): Record<string, string> {
  try { return JSON.parse(sessionStorage.getItem(answerKey(submissionId)) || "{}"); } catch { return {}; }
}

export function CareerCoach() {
  const { identity } = useAuth();
  const resumes = useResource<{ resumes: Resume[] }>("/api/student/resume-library");
  const saved = useResource<{ reports: { id: string; resume_id: string; created_at: string; model_version?: string; answers?: Record<string, string>; report: CareerResult }[] }>("/api/student/career/reports");
  const [resume, setResume] = useState("");
  const [resumeReady, setResumeReady] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [result, setResult] = useState<CareerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const analysisInFlight = useRef(false);
  const lastSubmitted = useRef<{ signature: string; at: number } | null>(null);
  const answersRef = useRef(answers);

  useEffect(() => {
    if (resumes.loading) return;
    const currentId = identity?.student.current_resume_submission_id;
    const item = resumes.data?.resumes.find((row) => row.submission_id === currentId)
      || resumes.data?.resumes.find((row) => row.is_primary && row.submission_id);
    const nextId = item?.submission_id || "";
    if (nextId !== resume) {
      setResume(nextId);
      const nextAnswers = nextId ? readSavedAnswers(nextId) : {};
      answersRef.current = nextAnswers;
      setAnswers(nextAnswers);
      setResult(null);
    }
    setResumeReady(true);
  }, [resumes.data, resumes.loading, identity?.student.current_resume_submission_id, resume]);

  useEffect(() => {
    if (resume) sessionStorage.setItem(answerKey(resume), JSON.stringify(answers));
  }, [resume, answers]);

  async function analyze(submittedAnswers = answers, forceRetry = false) {
    if (analysisInFlight.current) return;
    const signature = JSON.stringify(Object.fromEntries(Object.entries(submittedAnswers).sort(([left], [right]) => left.localeCompare(right))));
    const now = Date.now();
    if (!forceRetry && lastSubmitted.current?.signature === signature && now - lastSubmitted.current.at < 1500) return;
    lastSubmitted.current = { signature, at: now };
    analysisInFlight.current = true;
    setError("");
    setBusy(true);
    try {
      const response = await api<CareerResult>("/api/student/career/finder", { ...json({ ...submittedAnswers }), timeoutMs: 180000 });
      setResult(response);
      saved.reload();
    } catch (cause) {
      setError((cause as Error).message || "We couldn't generate your career analysis right now. Please try again.");
    } finally {
      analysisInFlight.current = false;
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedAnswers = { ...answersRef.current };
    const formData = new FormData(event.currentTarget);
    const currentAnswer = formData.get(key);
    if (typeof currentAnswer === "string") submittedAnswers[key] = currentAnswer;
    void analyze(submittedAnswers, Boolean(error));
  }

  const selectedResume = resumes.data?.resumes.find((row) => row.submission_id === resume);
  const completeSavedReports = (saved.data?.reports || []).filter((report) =>
    report.report.analysis_status !== "evidence_fallback"
      && !(report.report.analysis_status == null && report.model_version === "career-finder-v3"));
  const [key, title, help, placeholder] = questions[questionIndex];
  return <div className="career-tools career-discovery">
    <PageHeading eyebrow="CAREER COACH" title="Explore where your experience can take you">Recommendations use your active profile resume, academic background, and the interests you share.</PageHeading>
    {error && <ErrorMessage message={error} />}
    {resumes.error && <ErrorMessage message={resumes.error} retry={resumes.reload} />}
    <div className="career-discovery-layout">
      <section className="panel career-discovery-input"><div className="section-heading"><div><span className="eyebrow">01 · YOUR STARTING POINT</span><h2>Your evidence and interests</h2></div><FileText size={20} /></div>
        <form onSubmit={submit}><fieldset disabled={busy || resumes.loading || !resumeReady}>
          {selectedResume ? <p className="career-active-resume"><FileText size={16}/> Using active profile resume: <strong>{selectedResume.label || selectedResume.original_filename}</strong> · <Link to="/profile#resume-library">Change in My Profile</Link></p> : <p className="muted">{resumes.loading ? "Loading your active profile resume…" : <>Add an active resume in <Link to="/profile#resume-library">My Profile</Link> before requesting recommendations.</>}</p>}
          <div className="career-question-progress" aria-label={`Question ${questionIndex + 1} of ${questions.length}`}><div><span>QUESTION {questionIndex + 1} OF {questions.length}</span><strong>{Math.round(((questionIndex + 1) / questions.length) * 100)}%</strong></div><span className="career-question-progress-track"><i style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} /></span></div>
          <label className="career-question-field" htmlFor={`career-answer-${key}`}><span>{title}</span><small>{help}</small><textarea id={`career-answer-${key}`} name={key} value={answers[key] || ""} onChange={(event) => { const nextAnswers = { ...answersRef.current, [key]: event.currentTarget.value }; answersRef.current = nextAnswers; setAnswers(nextAnswers); }} placeholder={placeholder} rows={4} /></label>
          <p className="career-answer-save-state" role="status">Answers are saved on this device and can be edited later.</p>
          <div className="career-question-actions"><button className="button secondary" type="button" disabled={questionIndex === 0} onClick={() => setQuestionIndex((current) => Math.max(0, current - 1))}>Previous</button>{questionIndex < questions.length - 1 ? <button className="button primary" type="button" disabled={!resume} onClick={() => setQuestionIndex((current) => Math.min(questions.length - 1, current + 1))}>Next question <ArrowRight size={15} /></button> : <button className="button primary" type="submit" disabled={!resume || busy}><Compass size={16} />{busy ? "Analysing your evidence…" : error ? "Try again" : "Explore career paths"}</button>}</div>
          {questionIndex < questions.length - 1 && <button className="button secondary" type="submit" disabled={!resume || busy}>Explore from my resume</button>}
        </fieldset></form>
      </section>
      <aside className="panel career-discovery-note"><Sparkles size={25} /><h2>Grounded in your work</h2><p>We compare the selected resume with the interests you share. A missing resume detail means evidence was not found there; it does not mean you cannot learn or perform that skill.</p><p>Recommendations are guidance. They are not skill validation or a hiring prediction.</p></aside>
    </div>
    {result && <section className="career-discovery-results" aria-live="polite">
      <div className="panel career-discovery-intro"><span className="eyebrow">02 · WHAT WE UNDERSTOOD</span><h2>{result.reused ? "Your saved career analysis" : "Your career picture"}</h2><p>{result.career_profile || "These paths are based on the selected resume and the interests you shared."}</p><small>Resume: {selectedResume?.label || selectedResume?.original_filename || "Saved resume"}</small>{result.analysis_status === "evidence_fallback" && <div className="career-fallback-notice" role="status"><strong>Evidence-only analysis</strong><span>{result.analysis_note || "The AI service did not complete this analysis. These results are limited to explicit resume evidence."}<br/>You can retry the full AI analysis when the service is available.</span><button className="button secondary small" type="button" disabled={busy} onClick={() => void analyze(answers, true)}>{busy ? "Retrying analysis…" : "Retry AI analysis"}</button></div>}{result.analysis_status === "legacy" && <div className="career-fallback-notice" role="status"><strong>Older saved analysis</strong><span>This report predates the current evidence and ranking logic. Run a new analysis to refresh it; it is shown here as history.</span></div>}{result.analysis_status === "ai" && <small className="career-analysis-label">AI analysis grounded against extracted resume evidence</small>}</div>
      <div className="career-fit-grid"><article className="panel"><span className="eyebrow">CURRENT FIT</span><h3>{result.strongest_current_fit || "Not enough evidence yet"}</h3><p>Best-supported path in this resume.</p></article><article className="panel"><span className="eyebrow">GROWTH FIT</span><h3>{result.strongest_growth_path || "Explore adjacent paths"}</h3><p>A direction to explore as you add relevant evidence.</p></article></div>
      <section className="panel"><div className="section-heading"><div><span className="eyebrow">03 · THE OPTIONS</span><h2>Recommended paths</h2></div><Target size={20} /></div>{result.recommended_roles?.length ? <div className="career-role-grid">{result.recommended_roles.map((role, index) => <article className="career-role-card" key={`${role.role}-${index}`}><span className="career-role-evidence">{role.evidence_level === "project_evidence" ? "Project evidence" : "Resume mentions"}</span><h3>{role.role || "Career path"}</h3><p>{role.why || "Review the evidence and gaps below."}</p><details><summary>Supporting evidence and gaps</summary><div className="career-role-detail"><strong>Resume evidence</strong><List items={role.matched_skills} />{role.project_evidence?.length ? <><strong>Used in projects or work</strong><List items={role.project_evidence} /></> : null}<strong>Evidence to build</strong><List items={role.missing_skills} />{role.progression && <p className="muted">{role.progression}</p>}</div></details></article>)}</div> : <div className="career-empty-results"><h3>Not enough role-specific evidence yet</h3><p>Add a project or work entry with the problem, your contribution, tools used, and outcome. Your saved report remains available as a starting point.</p></div>}</section>
      <div className="panel career-next-step"><span className="eyebrow">04 · NEXT STEPS</span><h2>Your next steps</h2><p>{result.best_project_next || result.what_to_learn_next?.[0] || "Add a project with a clear contribution and outcome."}</p>{!!result.what_to_learn_next?.length&&<div className="career-learning-actions"><strong>Learn next</strong><List items={result.what_to_learn_next}/></div>}{result.career_gap_analysis&&<p className="career-gap-analysis">{result.career_gap_analysis}</p>}<small>Salary and demand guidance here is qualitative, not live market data, and both vary by location, industry, and company stage.</small></div>
    </section>}
    {saved.error && <ErrorMessage message={saved.error} retry={saved.reload} />}
    {!!completeSavedReports.length && <section className="panel career-report-history"><div className="section-heading"><div><span className="eyebrow">SAVED WORK</span><h2>Career reports</h2></div></div><div className="record-list">{completeSavedReports.map((report) => <div className="record" key={report.id}><div className="record-info"><strong>{report.report.strongest_current_fit || "Career analysis"}</strong><span>{new Date(report.created_at).toLocaleDateString()} · {resumes.data?.resumes.find((row) => row.submission_id === report.resume_id)?.label || "Resume used for this report"}</span></div><button className="button secondary small" onClick={() => { answersRef.current = report.answers || {}; setAnswers(answersRef.current); setQuestionIndex(0); setResult({ ...report.report, analysis_status: report.report.analysis_status || "legacy", reused: true, saved_report_id: report.id }); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>View report <ArrowRight size={15} /></button></div>)}</div></section>}
  </div>;
}
