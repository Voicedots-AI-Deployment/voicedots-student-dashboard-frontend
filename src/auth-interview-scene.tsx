import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import "./auth-interview-scene.css";

// A lightweight animated preview of the AI interview room for the sign-in
// page. It uses the real panelist portraits instead of the 1-4 MB panel
// animations, so the first screen a student sees stays fast.
const PANEL = [
  { track: "hr", name: "Priya", role: "HR" },
  { track: "domain", name: "Arjun", role: "Domain" },
  { track: "industry", name: "Neha", role: "Industry" },
  { track: "manager", name: "Vikram", role: "Manager" },
];
const QUESTIONS = [
  "Tell me about a project you are proud of.",
  "How did you test that API before release?",
  "What would you change if you built it again?",
  "Walk me through a tough bug you fixed.",
];

export function AuthInterviewScene() {
  const [speaker, setSpeaker] = useState(0);
  const [typed, setTyped] = useState(0);
  const question = QUESTIONS[speaker % QUESTIONS.length];
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduceMotion) { setTyped(question.length); return; }
    setTyped(0);
    const typer = window.setInterval(() => setTyped(count => count >= question.length ? count : count + 1), 38);
    const next = window.setTimeout(() => setSpeaker(value => (value + 1) % PANEL.length), 4200);
    return () => { window.clearInterval(typer); window.clearTimeout(next); };
  }, [speaker, question, reduceMotion]);

  return <div className="ais" aria-hidden="true">
    <div className="ais-window">
      <div className="ais-top">
        <span className="ais-live"><i />Live AI interview</span>
        <span className="ais-round">Round {speaker + 1} of 4</span>
      </div>
      <div className="ais-grid">
        {PANEL.map((member, index) => <figure key={member.track} className={index === speaker ? "speaking" : ""}>
          <img src={`/assets/panel/stills/${member.track}-idle.png`} alt="" loading="eager" />
          <figcaption><strong>{member.name}</strong><span>{member.role}</span></figcaption>
          {index === speaker && <span className="ais-voice">{[0, 1, 2, 3].map(bar => <i key={bar} style={{ animationDelay: `${bar * 0.11}s` }} />)}</span>}
        </figure>)}
      </div>
      <div className="ais-caption">
        <span className="ais-caption-name">{PANEL[speaker].name}</span>
        <p>{question.slice(0, typed)}<span className="ais-cursor" /></p>
      </div>
      <div className="ais-you">
        <span className="ais-you-avatar">You</span>
        <div className="ais-listen">{Array.from({ length: 22 }, (_, bar) => <i key={bar} style={{ animationDelay: `${(bar % 7) * 0.09}s` }} />)}</div>
      </div>
    </div>
    <div className="ais-chip ais-chip-a"><Sparkles size={13} /> Clarity <b>+12%</b></div>
    <div className="ais-chip ais-chip-b">Confidence <b>↑</b></div>
  </div>;
}
