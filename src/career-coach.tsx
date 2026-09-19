import { useEffect, useState, type FormEvent } from "react";
import { Compass, Target } from "lucide-react";
import { api, json, Resume } from "./api";
import { ErrorMessage, PageHeading, useResource } from "./ui";

type CareerResult = { summary?: string; recommended_roles?: { role?: string; why?: string; missing_skills?: string[] }[]; what_to_learn_next?: string[]; career_gap_analysis?: string; alternative_careers?: string[] };

export function CareerCoach() {
  const resumes = useResource<{ resumes: Resume[] }>("/api/student/resume-library");
  const [resume, setResume] = useState("");
  const [industry, setIndustry] = useState("");
  const [goals, setGoals] = useState("");
  const [result, setResult] = useState<CareerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const primary = resumes.data?.resumes.find(item => item.is_primary && item.submission_id) || resumes.data?.resumes.find(item => item.submission_id); if (primary?.submission_id) setResume(primary.submission_id); }, [resumes.data]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { setResult(await api<CareerResult>("/api/student/career/finder", { ...json({ submission_id: resume, industry, interests: industry, work_style: "Not specified", goals }), timeoutMs: 180000 })); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div className="career-tools"><PageHeading eyebrow="CAREER COACH" title="Find your next direction">Use your saved resume, interests, and goals to explore evidence-based career paths.</PageHeading>
    {error && <ErrorMessage message={error} />}
    <section className="panel"><form onSubmit={submit}><fieldset disabled={busy || resumes.loading || !resume}>
      {!resume && <p className="muted">Save a resume in your profile before using Career Coach.</p>}
      <label>Industry or field<select required value={industry} onChange={e => setIndustry(e.target.value)}><option value="">Choose an industry</option><option>Technology and software</option><option>Data and analytics</option><option>Finance and banking</option><option>Healthcare</option><option>Marketing and communications</option><option>Design and product</option><option>Manufacturing and engineering</option><option>Education</option><option>Other</option></select></label>
      <label>Career goal<textarea required minLength={3} value={goals} onChange={e => setGoals(e.target.value)} placeholder="What role or outcome are you working toward?" /></label><button className="button primary"><Compass size={16} />{busy ? "Analysing your profile…" : "Explore career paths"}</button>
    </fieldset></form></section>
    {result && <section className="panel career-result"><h2>{result.summary || "Career directions grounded in your resume"}</h2>{result.career_gap_analysis && <p>{result.career_gap_analysis}</p>}<div className="coach-topic-grid">{(result.recommended_roles || []).map((role, i) => <article className="coach-topic" key={i}><Target size={18} /><h3>{role.role}</h3><p>{role.why}</p>{role.missing_skills?.length ? <small>Build evidence in {role.missing_skills.join(", ")}</small> : null}</article>)}</div>{result.what_to_learn_next?.length ? <><h3>What to learn next</h3><ul>{result.what_to_learn_next.map((item, i) => <li key={i}>{item}</li>)}</ul></> : null}</section>}
  </div>;
}
