import { Link } from 'react-router-dom';
import { Award, CalendarDays, ChartLine, CheckCircle2, Download, FileText, LockKeyhole, Plus, Share2, Target, TrendingUp, TriangleAlert } from 'lucide-react';
import { apiUrl } from './api';
import { Empty, ResourceState, date, useResource } from './ui';
import { TrendChart, type PerformanceData } from './performance-overview';
import { PerformanceSharing } from './performance-sharing';
import './performance-reference.css';

type Assessment = {
  session_id: string; target_role?: string; completed_at?: string; created_at: string;
  report: { overall_score?: number; rubric_version?: string; duration_minutes?: number;
    question_reviews?: Array<{ turn_id?: string; question?: string; competency?: string; score?: number; answer?: string }> };
};
type Intelligence = {
  profile?: { full_name?: string; program?: string; department_code?: string };
  latest?: Assessment | null; competencies?: Array<{ key: string; name: string; score: number; target: number | null }>;
  comparable_trend?: Array<{session_id: string; at: string; score: number}>; comparable_change?: number | null;
};
const number = (value: number | null | undefined) => value == null ? '—' : Math.round(value);

export function Performance() {
  const overview = useResource<PerformanceData>('/api/student/performance/overview');
  const intelligence = useResource<Intelligence>('/api/student/performance');
  const data = overview.data, detail = intelligence.data;
  const latest = detail?.latest;
  const summary = data?.summary;
  const session = data?.has_results && summary ? latest?.session_id ?? summary.latest.session_id ?? null : null;
  const score = latest?.report.overall_score ?? summary?.latest.score;
  const comparable = detail?.comparable_trend ?? [];
  const questions = latest?.report.question_reviews ?? [];
  const label = (key: string) => data?.skills.find(skill => skill.dimension === key)?.label ?? key.replaceAll('_', ' ');
  return <div className="spi-page">
    <header className="spi-header"><div><span className="eyebrow">MY PERFORMANCE</span><h1>Student Assessment Intelligence</h1><p><strong>{detail?.profile?.full_name ?? 'Your assessment journey'}</strong>{detail?.profile?.program && ` · ${detail.profile.program}`}</p></div><div className="spi-buttons">{session && <a className="button secondary" href={apiUrl(`/api/interview/${encodeURIComponent(session)}/evaluation/report.pdf`)}><Download size={16}/> Download report</a>}<Link className="button primary" to="/practice"><Plus size={16}/> New interview</Link></div></header>
    <ResourceState resource={overview}>{data && (!data.has_results || !summary ? <section className="panel"><Empty title="Your performance dashboard is waiting for its first result" action>{data.pending_release_count ? 'Your completed interviews are still being reviewed. Results appear here once they are released.' : 'Complete a practice interview to see your scores, skills and progress here.'}</Empty></section> : <>
      <div className="spi-context"><span><Award size={16}/>{latest?.target_role ?? summary.latest.label}</span><span><CalendarDays size={16}/>Latest assessment: {date(latest?.completed_at ?? latest?.created_at ?? summary.latest.at)}</span><span><FileText size={16}/>{latest?.report.rubric_version ? `Rubric ${latest.report.rubric_version}` : 'Rubric not recorded'}</span>{data.pending_release_count > 0 && <small>{data.pending_release_count} awaiting release</small>}</div>
      <section className="spi-kpis" aria-label="Performance summary">
        <article className="spi-card spi-score"><div className="spi-ring" style={{background: `conic-gradient(#2185ef ${(score ?? 0)*3.6}deg, #e8edf5 0deg)`}}><div><strong>{number(score)}</strong><small>/100</small></div></div><div><h2>Interview score</h2><p>Latest released assessment</p><small>{summary.latest.label_readiness}</small></div></article>
        <article className="spi-card"><span className="spi-icon amber"><ChartLine/></span><div><h2>Placement readiness</h2><strong className="spi-value">{number(data.readiness.overall_score)}<small>/100</small></strong><p>{data.readiness.label ?? 'Complete a placement interview to unlock'}</p></div></article>
        <article className="spi-card"><span className="spi-icon green"><TrendingUp/></span><div><h2>Comparable progress</h2><strong className="spi-value">{detail?.comparable_change == null ? '—' : `${detail.comparable_change > 0 ? '+' : ''}${number(detail.comparable_change)} points`}</strong><p>Same role and recorded rubric</p><small>{comparable.length < 2 ? 'Needs two comparable assessments' : `${comparable.length} comparable interviews`}</small></div></article>
        <article className="spi-card"><span className="spi-icon purple"><FileText/></span><div><h2>Scorecard</h2><strong className="spi-id" title={session ?? undefined}>{session ? session.slice(0, 12) : 'Unavailable'}</strong><p>Released · {date(summary.latest.at)}</p><PerformanceSharing sessionId={session}/></div></article>
      </section>
      <div className="spi-analysis">
        <section className="spi-card spi-panel"><h2><ChartLine size={17}/> Competency vs role target</h2><ResourceState resource={intelligence}>{detail && <><div className="spi-table-wrap"><table className="spi-competencies"><thead><tr><th>Competency</th><th>Score</th><th>Target</th></tr></thead><tbody>{(detail.competencies ?? []).map(skill => <tr key={skill.key}><td>{skill.name}<div className="spi-track" role="meter" aria-label={skill.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={skill.score}><span style={{width:`${Math.min(100,Math.max(0,skill.score))}%`,background:skill.target != null && skill.score < skill.target ? '#efb528' : '#1ab294'}}/></div></td><td>{number(skill.score)}</td><td>{number(skill.target)}</td></tr>)}</tbody></table></div>{!detail.competencies?.length && <p>No competencies assessed yet.</p>}<p className="spi-note">Targets are institution-configured. — means no target is set.</p></>}</ResourceState></section>
        <section className="spi-card spi-panel"><h2><TrendingUp size={17}/> Comparable interview progress</h2><p className="spi-note">Same role and rubric only</p>{comparable.length ? <TrendChart points={comparable.map(point=>({...point,placement:false,label:latest?.target_role ?? 'Interview'}))}/> : <p className="spi-empty">No comparable assessments recorded yet.</p>}<Link to="/reports">Explore interview history →</Link></section>
        <section className="spi-card spi-panel"><h2><Award size={17}/> Evidence-based insights</h2><div className="spi-insight green"><h3><CheckCircle2 size={16}/> Key strengths</h3>{data.strengths.length ? data.strengths.map(key=><p key={key}>✓ {label(key)}</p>) : <p>More answered questions are needed to establish consistent strengths.</p>}</div><div className="spi-insight amber"><h3><TriangleAlert size={16}/> Development focus</h3>{data.focus.length ? data.focus.map(key=><p key={key}>• {label(key)}</p>) : <p>No development priorities identified.</p>}</div><p className="spi-note">Based on released answers and assessment evidence.</p></section>
      </div>
      <section className="spi-card spi-panel"><div className="spi-section-title"><h2><FileText size={17}/> Question-level assessment & evidence</h2>{session && <Link to={`/reports/${encodeURIComponent(session)}`}>Full report →</Link>}</div><div className="spi-table-wrap"><table className="spi-evidence"><thead><tr><th>#</th><th>Question / topic</th><th>Competency</th><th>Score</th><th>Review</th></tr></thead><tbody>{questions.map((question,index)=><tr key={question.turn_id ?? index}><td>{index+1}</td><td>{question.question ?? 'Interview question'}</td><td>{question.competency ?? 'Not recorded'}</td><td>{question.score == null ? 'Not scored' : question.score}</td><td><Link to={`/reports/${encodeURIComponent(session!)}`}>Review answer</Link></td></tr>)}</tbody></table></div>{!questions.length && <p className="spi-empty">Question-level evidence is available in your released full report.</p>}</section>
      <div className="spi-bottom">
        <section className="spi-card spi-panel"><h2><Target size={17}/> Priority development plan</h2><ol className="spi-plan">{data.actions.map((action,index)=><li key={index}><span>{index+1}</span><div><strong>{action.focus ?? 'Practice priority'}</strong><p>{action.action}</p></div></li>)}</ol>{!data.actions.length && <p>Complete more interviews for personalized recommendations.</p>}<Link className="button primary" to="/coach">Open AI Coach →</Link></section>
        <section className="spi-card spi-panel"><h2><FileText size={17}/> Assessment context</h2><dl className="spi-facts"><div><dt>Released interviews</dt><dd>{summary.released_count}</dd></div><div><dt>Placement / practice</dt><dd>{summary.placement_count} / {summary.practice_count}</dd></div><div><dt>Competencies assessed</dt><dd>{detail?.competencies?.length ?? '—'}</dd></div><div><dt>Recent average</dt><dd>{number(summary.recent_average.score)}/100</dd></div><div><dt>Speaking pace</dt><dd>{data.communication?.speaking_speed_wpm ? `${data.communication.speaking_speed_wpm} words/min` : 'Not measured'}</dd></div></dl><p className="spi-note">Placement readiness combines placement interviews and resume quality. Practice results are excluded from that index.</p></section>
        <section className="spi-card spi-panel"><h2><Share2 size={17}/> Sharing & employer access</h2><p className="spi-privacy"><LockKeyhole size={20}/> Private until you share</p><p>Choose an expiry when creating a link. Manage and revoke existing links in the sharing dialog.</p><p className="spi-note">Your recording and answers stay private.</p><PerformanceSharing sessionId={session}/></section>
      </div><footer className="spi-note">AI assessments support human review. Scores describe this assessment and do not guarantee placement or selection.</footer>
    </>)}</ResourceState>
  </div>;
}
