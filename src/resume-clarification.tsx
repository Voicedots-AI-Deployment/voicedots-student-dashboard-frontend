import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, FileText } from "lucide-react";

export type ClarificationAnswer = { entry_id: string; field: string; value: string };
type Prompt = { entry_id: string; name: string; missing_fields: string[] };

// Plain-language questions for the details an interviewer needs about a
// resume project or job.
const QUESTIONS: Record<string, { label: string; hint: string }> = {
  how: { label: "What tools and methods did you use?", hint: "For example, the languages, tools or steps you followed." },
  ownership: { label: "What was your personal contribution?", hint: "Say what you did yourself, like “I designed the database and wrote the login API.”" },
  result: { label: "What was the outcome?", hint: "What changed because of your work? A number helps, like “pages loaded twice as fast.”" },
};
const question = (field: string) => QUESTIONS[field] || { label: field.replace(/_/g, " ").replace(/^./, c => c.toUpperCase()), hint: "" };

/** Asks the resume follow-up questions one at a time, then submits them together. */
export function ResumeClarificationSteps({ prompts, required, busy, onSubmit }: {
  prompts: Prompt[];
  required: boolean;
  busy: boolean;
  onSubmit: (answers: ClarificationAnswer[]) => void;
}) {
  const steps = prompts.flatMap(prompt => prompt.missing_fields.map(field => ({ prompt, field })));
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => steps.map(() => ""));
  const [error, setError] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { field.current?.focus({ preventScroll: true }); setError(""); }, [index]);
  if (!steps.length) return null;
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index === steps.length - 1;
  const { label, hint } = question(step.field);
  const value = answers[index] || "";

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (required && !value.trim()) { setError("Please answer this question to continue."); return; }
    if (!last) { setIndex(index + 1); return; }
    onSubmit(steps.map((item, i) => ({ entry_id: item.prompt.entry_id || item.prompt.name, field: item.field, value: answers[i].trim() }))
      .filter(answer => answer.value));
  }

  return <form className="clarify-steps" onSubmit={next} noValidate>
    <div className="clarify-progress" aria-hidden="true">
      {steps.map((_, i) => <i key={i} className={i < index ? "done" : i === index ? "current" : ""} />)}
    </div>
    <div className="clarify-step" key={index}>
      <span className="clarify-count">Question {index + 1} of {steps.length}</span>
      <span className="clarify-about"><FileText size={15} /> {step.prompt.name}</span>
      <label htmlFor="clarify-answer">{label}</label>
      {hint && <p className="clarify-hint" id="clarify-hint">{hint}</p>}
      <textarea id="clarify-answer" ref={field} rows={5} maxLength={4000} value={value}
        aria-describedby={hint ? "clarify-hint" : undefined} aria-invalid={Boolean(error) || undefined}
        onChange={event => { const copy = [...answers]; copy[index] = event.target.value; setAnswers(copy); if (error) setError(""); }} />
      {error && <p className="clarify-error" role="alert">{error}</p>}
    </div>
    <div className="clarify-actions">
      {index > 0 && <button type="button" className="button secondary" disabled={busy} onClick={() => setIndex(index - 1)}><ArrowLeft size={16} /> Back</button>}
      <button className="button primary" disabled={busy}>
        {last ? <>{busy ? "Saving…" : "Save and continue"} <Check size={16} /></> : <>Next question <ArrowRight size={16} /></>}
      </button>
    </div>
  </form>;
}
