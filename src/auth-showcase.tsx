import { useEffect, useState } from "react";
import { Bot, BriefcaseBusiness, CalendarDays, ChartLine, Compass, FileText, LayoutGrid, Mic, ShieldCheck, type LucideIcon } from "lucide-react";

// The sign-in showcase lists the portal's real features, in the order they
// appear in the student navigation. It advances on its own until the student
// picks one, and pauses while hovered or focused.
const FEATURES: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: Mic, title: "AI interviews", text: "Practice with an AI panel that listens, follows up and gives feedback." },
  { icon: Bot, title: "AI Coach", text: "Prepare for your placement with lessons built around your resume." },
  { icon: FileText, title: "Resume Studio", text: "Build, design and polish your resume, then download it as PDF or Word." },
  { icon: Compass, title: "Career coach", text: "Explore roles that fit your experience, studies and interests." },
  { icon: BriefcaseBusiness, title: "Placements", text: "See the campus drives you are eligible for and start their interviews." },
  { icon: ChartLine, title: "My performance", text: "Track your scores, skills and placement readiness over time." },
  { icon: CalendarDays, title: "Calendar", text: "Interviews, AI Coach sessions and your own events in one schedule." },
  { icon: LayoutGrid, title: "My ERP", text: "Timetable, attendance, marks, fees and campus notices." },
];
const STEP_MS = 2800;

export function FeatureShowcase() {
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState(false);
  const [paused, setPaused] = useState(false);
  // Students who prefer reduced motion choose features themselves.
  const [still] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    if (chosen || paused || still) return;
    const timer = window.setTimeout(() => setActive(index => (index + 1) % FEATURES.length), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [active, chosen, paused, still]);
  const feature = FEATURES[active];
  const Icon = feature.icon;
  return (
    <section className="auth-showcase" aria-label="What you can do in VoiceDots"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="auth-showcase-top" key={active}>
        <span className="auth-showcase-icon"><Icon size={22} /></span>
        <div>
          <strong>{feature.title}</strong>
          <span>{feature.text}</span>
        </div>
      </div>
      <div className="auth-showcase-picker" role="group" aria-label="Features">
        {FEATURES.map(({ icon: ItemIcon, title }, index) => (
          <button key={title} type="button" aria-label={title} aria-pressed={index === active} title={title}
            className={index === active ? "active" : ""}
            style={{ ["--i" as string]: index }}
            onClick={() => { setActive(index); setChosen(true); }}>
            <ItemIcon size={17} />
            {index === active && !chosen && !paused && !still && <i className="auth-showcase-timer" style={{ animationDuration: `${STEP_MS}ms` }} />}
          </button>
        ))}
      </div>
      <div className="auth-showcase-bottom">
        <span>Practice at your pace</span>
        <span><ShieldCheck size={13} /> Built for your growth</span>
      </div>
    </section>
  );
}
