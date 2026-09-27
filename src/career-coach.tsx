import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Compass, FileText, Sparkles, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { api, json, type Resume } from "./api";
import { ErrorMessage, PageHeading, useResource } from "./ui";

type CareerRole = { role?: string; why?: string; matched_skills?: string[]; missing_skills?: string[]; learn_next?: string[]; progression?: string };
type CareerResult = {
  career_profile?: string; strongest_current_fit?: string; strongest_growth_path?: string;
  best_project_next?: string; recommended_roles?: CareerRole[]; alternative_careers?: string[];
  what_to_learn_next?: string[]; career_gap_analysis?: string; market_data_note?: string; reused?: boolean;
};

const questions = [
  ["interests", "What topics interest you?", "The work or subjects you enjoy exploring.", "For example, data, design or building useful software."],
  ["preferred_work", "What work do you enjoy doing?", "Tell us which activities keep you engaged.", "For example, analysing information or explaining ideas."],
  ["priorities", "What matters most in your career?", "Growth, stability, impact and work style can all matter.", "For example, learning opportunities and meaningful work."],
  ["learning_openness", "How open are you to learning new skills?", "This helps distinguish current fit from paths you could grow into.", "For example, I enjoy learning adjacent tools and methods."],
] as const;

function List({ items }: { items?: string[] }) {
  return items?.length ? <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="muted">No supporting resume evidence was identified for this section yet.</p>;
}

export function CareerCoach() {
  const resumes = useResource<{ resumes: Resume[] }>("/api/student/resume-library");
  const saved = useResource<{ reports: { id: string; resume_id: string; created_at: string; report: CareerResult }[] }>("/api/student/career/reports");
  const [resume, setResume] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CareerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (resume) return;
    const item = resumes.data?.resumes.find((row) => row.is_primary && row.submission_id) || resumes.data?.resumes.find((row) => row.submission_id);
    if (item?.submission_id) setResume(item.submission_id);
  }, [resumes.data, resume]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      setResult(await api<CareerResult>("/api/student/career/finder", { ...json({ submission_id: resume, ...answers }), timeoutMs: 180000 }));
      saved.reload();
    } catch (cause) {
      setError((cause as Error).message || "We couldn't generate your career analysis right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedResume = resumes.data?.resumes.find((row) => row.submission_id === resume);
  return <div className="career-tools career-discovery">
    <PageHeading eyebrow="CAREER COACH" title="Explore where your experience can take you">Choose a saved resume and tell us what you enjoy. Recommendations use your evidence and interests.</PageHeading>
    {error && <ErrorMessage message={error} />}
    {resumes.error && <ErrorMessage message={resumes.error} retry={resumes.reload} />}
    <div className="career-discovery-layout">
      <section className="panel career-discovery-input"><div className="section-heading"><div><span className="eyebrow">01 · YOUR STARTING POINT</span><h2>Your evidence and interests</h2></div><FileText size={20} /></div>
        <form onSubmit={submit}><fieldset disabled={busy || resumes.loading}>
          <label>Resume to use<select required value={resume} onChange={(event) => setResume(event.target.value)}><option value="">Choose a saved resume</option>{(resumes.data?.resumes || []).filter((row) => row.submission_id).map((row) => <option key={row.submission_id} value={row.submission_id}>{row.label || row.original_filename}{row.is_primary ? " · Main resume" : ""}</option>)}</select></label>
          {!resumes.loading && !resumes.data?.resumes.some((row) => row.submission_id) && <p className="muted">Add a resume to your library before requesting recommendations. <Link to="/profile">Open My Profile</Link></p>}
          {questions.map(([key, title, help, placeholder]) => <label key={key}>{title}<small>{help}</small><textarea value={answers[key] || ""} onChange={(event) => setAnswers({ ...answers, [key]: event.target.value })} placeholder={placeholder} rows={3} /></label>)}
          <button className="button primary" disabled={!resume}><Compass size={16} />{busy ? "Understanding your career profile…" : "Explore career paths"}</button>
        </fieldset></form>
      </section>
      <aside className="panel career-discovery-note"><Sparkles size={25} /><h2>Grounded in your work</h2><p>We compare the selected resume with the interests you share. A missing resume detail means evidence was not found there; it does not mean you cannot learn or perform that skill.</p><p>Recommendations are guidance. They are not skill validation or a hiring prediction.</p></aside>
    </div>
    {result && <section className="career-discovery-results" aria-live="polite">
      <div className="panel career-discovery-intro"><span className="eyebrow">02 · WHAT WE UNDERSTOOD</span><h2>{result.reused ? "Your saved career analysis" : "Your career picture"}</h2><p>{result.career_profile || "These paths are based on the selected resume and the interests you shared."}</p><small>Resume: {selectedResume?.label || selectedResume?.original_filename || "Saved resume"}</small></div>
      <div className="career-fit-grid"><article className="panel"><span className="eyebrow">CURRENT FIT</span><h3>{result.strongest_current_fit || "Not enough evidence yet"}</h3><p>Supported by the skills and work shown in your selected resume and your stated interests.</p></article><article className="panel"><span className="eyebrow">GROWTH FIT</span><h3>{result.strongest_growth_path || "Explore a related direction"}</h3><p>{result.career_gap_analysis || "Build more role-specific evidence to explore this path."}</p></article></div>
      <section className="panel"><div className="section-heading"><div><span className="eyebrow">03 · THE OPTIONS</span><h2>Recommended paths</h2></div><Target size={20} /></div><div className="career-role-grid">{(result.recommended_roles || []).map((role, index) => <article className="career-role-card" key={`${role.role}-${index}`}><h3>{role.role || "Career path"}</h3><p>{role.why || "Review the evidence and gaps below."}</p><strong>Resume evidence</strong><List items={role.matched_skills} /><strong>Skills or evidence to build</strong><List items={role.missing_skills} />{role.learn_next?.length ? <><strong>Next learning step</strong><List items={role.learn_next} /></> : null}{role.progression && <p className="muted">{role.progression}</p>}</article>)}</div></section>
      <div className="career-fit-grid"><section className="panel"><span className="eyebrow">04 · NEXT STEPS</span><h2>What to learn next</h2><List items={result.what_to_learn_next} />{result.best_project_next && <p><strong>Project idea:</strong> {result.best_project_next}</p>}</section><section className="panel"><span className="eyebrow">ALTERNATIVES</span><h2>Other paths to consider</h2><List items={result.alternative_careers} /><p className="muted">{result.market_data_note || "No live salary or hiring-market data is used here."}</p></section></div>
    </section>}
    {saved.error && <ErrorMessage message={saved.error} retry={saved.reload} />}
    {!!saved.data?.reports?.length && <section className="panel"><div className="section-heading"><div><span className="eyebrow">SAVED WORK</span><h2>Career reports</h2></div></div><div className="record-list">{saved.data.reports.map((report) => <div className="record" key={report.id}><div className="record-info"><strong>{report.report.strongest_current_fit || "Career analysis"}</strong><span>{new Date(report.created_at).toLocaleDateString()} · {resumes.data?.resumes.find((row) => row.submission_id === report.resume_id)?.label || "Saved resume"}</span></div><button className="button secondary small" onClick={() => { setResult({ ...report.report, reused: true }); setResume(report.resume_id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>View report <ArrowRight size={15} /></button></div>)}</div></section>}
  </div>;
}
