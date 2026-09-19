import { useState, type FormEvent } from "react";
import { Compass, Target } from "lucide-react";
import { api, json, Resume } from "./api";
import { ErrorMessage, PageHeading, useResource } from "./ui";

type CareerResult = { summary?: string; recommended_roles?: { role?: string; why?: string; missing_skills?: string[] }[]; what_to_learn_next?: string[]; career_gap_analysis?: string; alternative_careers?: string[] };

export function CareerCoach() {
  const resumes = useResource<{ resumes: Resume[] }>("/api/student/resume-library");
  const [resume, setResume] = useState("");
  const [interests, setInterests] = useState("");
  const [style, setStyle] = useState("");
  const [goals, setGoals] = useState("");
  const [result, setResult] = useState<CareerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { setResult(await api<CareerResult>("/api/student/career/finder", { ...json({ submission_id: resume, interests, work_style: style, goals }), timeoutMs: 180000 })); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div className="career-tools"><PageHeading eyebrow="CAREER COACH" title="Find your next direction">Use your saved resume, interests, and goals to explore evidence-based career paths.</PageHeading>
    {error && <ErrorMessage message={error} />}
    <section className="panel"><form onSubmit={submit}><fieldset disabled={busy || resumes.loading}>
      <label>Resume<select required value={resume} onChange={e => setResume(e.target.value)}><option value="">Choose a saved resume</option>{resumes.data?.resumes.filter(r => r.submission_id).map(r => <option key={r.resume_id} value={r.submission_id}>{r.label || r.original_filename}</option>)}</select></label>
      <div className="career-grid"><label>Interests<textarea required minLength={3} value={interests} onChange={e => setInterests(e.target.value)} placeholder="What kind of work do you enjoy?" /></label><label>Work style<textarea required minLength={3} value={style} onChange={e => setStyle(e.target.value)} placeholder="How do you work best?" /></label></div>
      <label>Goals<textarea value={goals} onChange={e => setGoals(e.target.value)} placeholder="What do you want to achieve next?" /></label><button className="button primary"><Compass size={16} />{busy ? "Analysing your profile…" : "Explore career paths"}</button>
    </fieldset></form></section>
    {result && <section className="panel career-result"><h2>{result.summary || "Career directions grounded in your resume"}</h2>{result.career_gap_analysis && <p>{result.career_gap_analysis}</p>}<div className="coach-topic-grid">{(result.recommended_roles || []).map((role, i) => <article className="coach-topic" key={i}><Target size={18} /><h3>{role.role}</h3><p>{role.why}</p>{role.missing_skills?.length ? <small>Build evidence in {role.missing_skills.join(", ")}</small> : null}</article>)}</div>{result.what_to_learn_next?.length ? <><h3>What to learn next</h3><ul>{result.what_to_learn_next.map((item, i) => <li key={i}>{item}</li>)}</ul></> : null}</section>}
  </div>;
}
