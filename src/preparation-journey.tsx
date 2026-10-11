import { useEffect, useState } from "react";
import { Check, FileSearch, ListChecks, Target, Users } from "lucide-react";
import "./preparation-journey.css";

// Shown while the backend prepares a personalized interview. Progress follows
// the real preparation stage reported by the API; nothing here is timed to
// pretend work is done.
export const PREPARATION_STEPS = [
  { key: "analyzing_resume", label: "Getting to know your experience", icon: FileSearch },
  { key: "preparing_role_context", label: "Understanding your target role", icon: Target },
  { key: "generating_questions", label: "Preparing your personalized questions", icon: ListChecks },
  { key: "finalizing_session", label: "Getting your panel ready", icon: Users },
] as const;

const TIPS = [
  "Lead with the answer, then explain how you got there.",
  "Use one real example from your projects for each answer.",
  "It is fine to pause and think before you answer.",
  "If you miss a question, just say “Can you repeat that?”",
  "Mention the result: what changed because of your work.",
  "Keep answers to about one or two minutes.",
];

const STILLS: Record<string, string> = {
  hr: "/assets/panel/stills/hr-idle.png",
  domain: "/assets/panel/stills/domain-idle.png",
  industry: "/assets/panel/stills/industry-idle.png",
  manager: "/assets/panel/stills/manager-idle.png",
};

export type JourneyPanelMember = { track: string; role: string };

export function stepIndex(stage?: string) {
  const index = PREPARATION_STEPS.findIndex(step => step.key === stage);
  return index < 0 ? 0 : index;
}

export function PreparationJourney({ stage, panel, placement }: { stage?: string; panel: JourneyPanelMember[]; placement: boolean }) {
  const current = stepIndex(stage);
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTip(value => (value + 1) % TIPS.length), 6000);
    return () => window.clearInterval(timer);
  }, []);
  const StageIcon = PREPARATION_STEPS[current].icon;
  return <div className="prep-journey" data-stage={PREPARATION_STEPS[current].key}>
    <div className="prep-header">
      <div className="prep-stage-mark" aria-hidden="true"><StageIcon size={28} /></div>
      <div><span className="eyebrow">{placement ? "PREPARING YOUR PLACEMENT INTERVIEW" : "PREPARING YOUR PRACTICE INTERVIEW"}</span>
        <h2 aria-live="polite">{PREPARATION_STEPS[current].label}</h2>
        <p className="prep-note">Step {current + 1} of {PREPARATION_STEPS.length} · Progress follows your saved preparation.</p>
      </div>
    </div>
    <div className="prep-progress" role="progressbar" aria-label="Interview preparation" aria-valuemin={1} aria-valuemax={PREPARATION_STEPS.length} aria-valuenow={current + 1} aria-valuetext={`Step ${current + 1} of ${PREPARATION_STEPS.length}`}>
      <span style={{ width: `${((current + 0.5) / PREPARATION_STEPS.length) * 100}%` }} />
    </div>
    <ol className="prep-steps">{PREPARATION_STEPS.map((step, index) => {
      const Icon = step.icon;
      const state = index < current ? "done" : index === current ? "active" : "upcoming";
      return <li key={step.key} className={state} aria-current={state === "active" ? "step" : undefined}>
        <span className="prep-step-icon">{state === "done" ? <Check size={15} /> : <Icon size={15} />}</span>
        <span>{step.label}</span>
        {state === "active" && <span className="prep-dots" aria-hidden="true"><i /><i /><i /></span>}
      </li>;
    })}</ol>
    {panel.length > 0 && <div className="prep-panel" aria-label="Your interview panel">
      {panel.map((member, index) => <figure key={`${member.track}-${index}`} className="arrived">
        <span className="prep-avatar">{STILLS[member.track] ? <img src={STILLS[member.track]} alt="" /> : member.role.slice(0, 1)}</span>
        <figcaption>{member.role}</figcaption>
      </figure>)}
    </div>}
    <p className="prep-tip" key={tip}><strong>Tip</strong>{TIPS[tip]}</p>
    <p className="prep-note">Your progress is saved. You can leave this page and come back.</p>
  </div>;
}
