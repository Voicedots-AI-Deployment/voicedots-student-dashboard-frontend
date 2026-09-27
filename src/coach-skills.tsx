import { Link, useSearchParams } from 'react-router-dom';
import { ErrorMessage, PageHeading, useResource } from './ui';

type Skill = {
  skill: string;
  importance: number;
  state: string;
  source: string;
  evidence_note: string;
  resume_evidence?: string;
  last_assessed_at?: string;
  next_action?: string;
  objectives?:{task_id:string;format?:string;question?:string;answer?:string;status:string;feedback?:{feedback?:string;strengths?:string[];gaps?:string[]}}[];
  training_stage: string;
  session_id?: string;
};

const stateLabel=(state:string)=>({unassessed:'Needs evaluation',strong_evidence:'Demonstrated in diagnostic',some_evidence:'Partly demonstrated',weak_evidence:'Needs improvement',validated:'Validated',stale_evidence:'Needs review',demonstrated:'Demonstrated',needs_improvement:'Needs improvement'} as Record<string,string>)[state]||state.replaceAll('_',' ');

type SkillsResponse = {
  company_name: string;
  role_title: string;
  score: number;
  skills: Skill[];
};

export function CoachSkills() {
  const [params] = useSearchParams();
  const planId = params.get('plan');
  const resource = useResource<SkillsResponse>(planId ? `/api/student/coach/plans/${encodeURIComponent(planId)}/skills` : null);
  return <div className="coach-skills-page">
    <PageHeading eyebrow="MY PLACEMENT SKILLS" title="What your evidence shows">Review skills for this placement and return to the lesson that can strengthen them.</PageHeading>
    <Link className="button secondary" to={planId ? `/coach?plan=${encodeURIComponent(planId)}` : '/coach'}>Back to AI Coach</Link>
    {!planId && <section className="panel"><p>Choose a placement plan in AI Coach to see its required skills.</p></section>}
    {resource.loading && planId && <section className="panel" role="status">Loading placement skills…</section>}
    {resource.error && <ErrorMessage message={resource.error} retry={resource.reload} />}
    {resource.data && <>
      <section className="panel coach-skills-summary"><span className="eyebrow">{resource.data.company_name} · {resource.data.role_title}</span><h2>{resource.data.score}% readiness from recorded evidence</h2><p>Resume mentions show starting evidence. Independent validation is required before a skill is marked validated.</p></section>
      <div className="coach-skills-grid">{resource.data.skills.map(item => <article className="panel" key={item.skill}>
        <div className="section-heading"><h3>{item.skill}</h3><span className="pill">{stateLabel(item.state)}</span></div>
        <p className="coach-skill-source"><strong>{item.importance===3?'Critical':item.importance===2?'Important':'Supporting'} for this placement</strong><span>Main Resume: {item.resume_evidence==='none'?'No evidence found':'Declared evidence'}</span></p>
        <p>{item.evidence_note}</p><small>Source: {item.source.replaceAll('_', ' ')} · Training: {item.training_stage.replaceAll('_', ' ')}</small>
        {item.last_assessed_at&&<small>Last assessed: {new Date(item.last_assessed_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</small>}
        {!!item.objectives?.length&&<details className="coach-skill-objectives"><summary>Assessment details · {item.objectives.length} tasks</summary>{item.objectives.map(objective=><div key={objective.task_id}><strong>{objective.question||objective.format||'Assessment task'}</strong><span>{stateLabel(objective.status)}</span><p>{objective.answer||'Not answered yet.'}</p>{objective.feedback?.feedback&&<p>{objective.feedback.feedback}</p>}{objective.feedback?.gaps?.map(gap=><small key={gap}>Needs work: {gap}</small>)}</div>)}</details>}
        <p className="coach-skill-next">Next: {item.next_action==='assess'?'Assess this skill':item.next_action==='review'?'Review evidence':item.next_action==='continue_lesson'?'Continue the lesson':'Start a focused lesson'}</p>
        {item.session_id && <Link className="button secondary small" to={`/coach?plan=${encodeURIComponent(planId!)}&session=${encodeURIComponent(item.session_id)}`}>Continue lesson</Link>}
      </article>)}</div>
      {!resource.data.skills.length && <section className="panel"><p>No placement skills have been identified from this plan yet. Review its official job description with your placement team.</p></section>}
    </>}
  </div>;
}
