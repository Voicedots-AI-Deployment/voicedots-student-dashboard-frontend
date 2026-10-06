import { useEffect, useState } from 'react';
import { ArrowRight, MessageSquareText } from 'lucide-react';
import { api } from './api';

export type PreviousQuestion = {
  id: string;
  question_text: string;
  round_type: string;
  canonical_skill?: string | null;
  difficulty?: string | null;
  year?: number | null;
  interview_date?: string | null;
  report_count: number;
  last_reported_at?: string | null;
};
type QuestionList = { company_name: string; role_name: string; questions: PreviousQuestion[]; count: number };
const rounds = ['All', 'HR', 'Technical', 'Managerial', 'System Design', 'Coding', 'Behavioral'];

function lastSeen(year?: number | null, value?: string | null) {
  if (year) return String(year);
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short' }).format(date);
}

export function CoachPreviousQuestions({ driveId, company, role, onPractice, compact = false }: {
  driveId: string; company: string; role: string; onPractice: (question: PreviousQuestion) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false), [round, setRound] = useState('All');
  const [result, setResult] = useState<QuestionList | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true); setError('');
    const query = round === 'All' ? '' : `?round_type=${encodeURIComponent(round)}`;
    void api<QuestionList>(`/api/student/coach/drives/${encodeURIComponent(driveId)}/previous-questions${query}`)
      .then(value => { if (alive) setResult(value); })
      .catch(reason => { if (alive) setError((reason as Error).message || 'Could not load previous interview questions.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [driveId, open, round]);

  return <section className={`coach-previous-questions${compact ? ' compact' : ''}`}>
    <button type="button" className="coach-secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <MessageSquareText size={16} /> Previous Interview Questions
    </button>
    {open && <div className="coach-previous-question-panel">
      <div className="coach-previous-question-heading"><div><div className="coach-card-kicker">VERIFIED QUESTION BANK</div><h3>{company} · {role}</h3></div><strong>{result?.count ?? '—'} questions</strong></div>
      <div className="coach-question-rounds" aria-label="Filter questions by round">{rounds.map(item => <button key={item} type="button" aria-pressed={round === item} className={round === item ? 'selected' : ''} onClick={() => setRound(item)}>{item}</button>)}</div>
      {loading && <p role="status">Loading previous questions…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && result?.questions.length === 0 && <p>No traceable previous interview questions are available for this placement yet.</p>}
      {!loading && !error && result?.questions.map(item => <article className="coach-previous-question" key={item.id}>
        <h4>{item.question_text}</h4><div className="coach-question-meta">
          {item.canonical_skill && <span>Skill <strong>{item.canonical_skill}</strong></span>}
          {item.difficulty && <span>Difficulty <strong>{item.difficulty}</strong></span>}
          <span>Round <strong>{item.round_type}</strong></span>
          <span>Reported <strong>{item.report_count} {item.report_count === 1 ? 'interview' : 'interviews'}</strong></span>
          <span>Last seen <strong>{lastSeen(item.year, item.interview_date)}</strong></span>
        </div><button type="button" className="coach-primary" onClick={() => onPractice(item)}>Practice with AI Coach <ArrowRight size={15} /></button>
      </article>)}
    </div>}
  </section>;
}
