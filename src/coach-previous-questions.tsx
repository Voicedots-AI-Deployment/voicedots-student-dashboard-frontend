import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, MessageSquareText, Search, X } from 'lucide-react';
import { api } from './api';

export type PreviousQuestion = {
  id: string; question_text: string; round_type: string; canonical_skill?: string | null;
  difficulty?: string | null; year?: number | null; interview_date?: string | null;
  report_count: number; last_reported_at?: string | null; source_type?: string; verified?: boolean;
};
type QuestionList = { company_name: string; role_name: string; questions: PreviousQuestion[]; count: number };
const sourceLabel = (source?: string) => ({ PLACEMENT_TEAM: 'Placement team', VERIFIED_PUBLIC_SOURCE: 'Verified public source', STUDENT_REPORTED: 'Candidate reported' } as Record<string, string>)[source || ''] || 'Reported source';
function lastSeen(year?: number | null, value?: string | null) { if (year) return String(year); if (!value) return 'Date unavailable'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short' }).format(date); }

export function CoachPreviousQuestions({ driveId, company, role, onPractice, compact = false }: {
  driveId: string; company: string; role: string; onPractice: (question: PreviousQuestion) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false), [result, setResult] = useState<QuestionList | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [search, setSearch] = useState(''), [round, setRound] = useState('All');
  async function load() { setLoading(true); setError(''); try { const value = await api<QuestionList>(`/api/student/coach/drives/${encodeURIComponent(driveId)}/previous-questions`); setResult(value); } catch (reason) { setError((reason as Error).message || 'Previous interview questions couldn’t be loaded.'); } finally { setLoading(false); } }
  useEffect(() => { if (open && !result && !loading && !error) void load(); }, [open, driveId]);
  useEffect(() => { if (!open) return; const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [open]);
  const questions = result?.questions || [];
  const roundTypes = useMemo(() => ['All', ...new Set(questions.map(item => item.round_type).filter(Boolean))], [questions]);
  const filtered = questions.filter(item => (round === 'All' || item.round_type === round) && (!search || `${item.question_text} ${item.canonical_skill || ''}`.toLowerCase().includes(search.toLowerCase())));
  return <>
    <div className={`coach-previous-questions${compact ? ' compact' : ''}`}><button type="button" className="coach-secondary" aria-expanded={open} onClick={() => setOpen(true)}><MessageSquareText size={16} /> Previous Interview Questions</button></div>
    {open && <div className="coach-question-drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <aside className="coach-question-drawer" role="dialog" aria-modal="true" aria-label="Previous Interview Questions">
        <header className="coach-question-drawer-header"><div><div className="coach-card-kicker">PLACEMENT INTERVIEW HISTORY</div><h2>Previous Interview Questions</h2><p>{result?.company_name || company} · {result?.role_name || role}</p>{!loading && !error && result && <small>{result.count} {result.count === 1 ? 'question' : 'questions'} reported from previous candidate interviews</small>}</div><button type="button" className="coach-question-drawer-close" aria-label="Close previous interview questions" onClick={() => setOpen(false)}><X size={19}/></button></header>
        {loading && <p role="status" className="coach-question-drawer-state">Loading previous interview questions...</p>}
        {error && <div className="coach-question-drawer-state" role="alert"><p>Previous interview questions couldn’t be loaded.</p><button type="button" className="coach-secondary" onClick={() => void load()}>Retry</button></div>}
        {!loading && !error && result?.count === 0 && <div className="coach-question-drawer-state"><h3>No previous interview questions are available for {result.company_name} · {result.role_name} yet.</h3><p>Questions reported from completed candidate interviews will appear here once available.</p></div>}
        {!loading && !error && result && result.count > 0 && <><label className="coach-question-search"><Search size={17}/><input aria-label="Search questions" placeholder="Search questions..." value={search} onChange={event => setSearch(event.target.value)}/></label><div className="coach-question-rounds" aria-label="Filter questions by round">{roundTypes.map(item => <button key={item} type="button" aria-pressed={round === item} className={round === item ? 'selected' : ''} onClick={() => setRound(item)}>{item}</button>)}</div>
          <div className="coach-question-drawer-list">{filtered.map(item => <article className="coach-question-drawer-card" key={item.id}><div className="coach-question-card-top"><span>{item.round_type}</span><span>{sourceLabel(item.source_type)}</span></div><h3>{item.question_text}</h3><div className="coach-question-meta">{item.canonical_skill && <span><strong>{item.canonical_skill}</strong></span>}{item.difficulty && <span>{item.difficulty}</span>}<span>Reported in {item.report_count} {item.report_count === 1 ? 'interview' : 'interviews'}</span><span>Last seen: {lastSeen(item.year, item.interview_date)}</span></div><button type="button" className="coach-primary" onClick={() => { onPractice(item); setOpen(false); }}>Practice with AI Coach <ArrowRight size={15}/></button></article>)}{!filtered.length && <p className="coach-question-drawer-state">No questions match this search.</p>}</div></>}
      </aside>
    </div>}
  </>;
}
