import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import { api, json } from "./api";
import { useAuth } from "./auth";
import { displayName } from "./display";
import "./product-tour.css";

// Spotlight tour of the student portal. Every step points at a real control
// on the Overview page or in the navigation; steps whose element is not on
// screen (for example a section with no data yet) are skipped. The server
// remembers that the student has seen it, so it appears once on any device
// and can be replayed from the top bar.

type Step = { target?: string; group: string; title: string; text: string; mobile?: boolean; desktop?: boolean };

export const START_TOUR_EVENT = "vd:start-product-tour";

const STEPS: Step[] = [
  { group: "Welcome", title: "", text: "A one-minute look at what you can do here. You can leave at any time and replay the tour from the top bar." },
  { target: '[data-testid="overview-hero"] .button.white', group: "Home", title: "Start an AI interview",
    text: "Practice with an AI interview panel that listens, asks follow-up questions and gives you feedback when you finish." },
  { target: '[data-testid="overview-kpis"]', group: "Home", title: "Your progress at a glance",
    text: "Completed interviews, placement drives you are eligible for, your placement readiness and any interview you can resume." },
  { target: '[data-testid="overview-latest-drive"]', group: "Home", title: "Latest placement drives",
    text: "Drives from your placement cell. Prepare with AI Coach or start the drive’s AI interview from here." },
  { target: '[data-testid="overview-feedback"]', group: "Home", title: "Your latest feedback",
    text: "Your most recent score and what to focus on. Placement results appear once your placement team releases them." },
  { target: '[data-testid="overview-next-steps"]', group: "Home", title: "A simple way forward",
    text: "Quick links to update your profile, practice, prepare with AI Coach, polish your resume and explore careers." },
  { target: '[data-tour="nav:/practice"]', desktop: true, group: "Your workspace", title: "Interview practice",
    text: "Choose a practice conversation or continue a placement interview. Your camera and microphone are checked before you begin." },
  { target: '[data-tour="nav:/placements"]', desktop: true, group: "Your workspace", title: "Placements",
    text: "Campus drives you are eligible for, with their dates and requirements. Start a drive’s AI interview from here." },
  { target: '[data-tour="nav:/coach"]', desktop: true, group: "Your workspace", title: "AI Coach",
    text: "Lessons and practice built around your assigned placement and your Main Resume." },
  { target: '[data-tour="nav:/resume-studio"]', desktop: true, group: "Your workspace", title: "Resume Studio",
    text: "Build and design resumes, review AI suggestions before they are applied, and download PDF or Word." },
  { target: '[data-tour="nav:/career"]', desktop: true, group: "Your workspace", title: "Career coach",
    text: "Explore roles that fit your resume, your studies and the interests you share." },
  { target: '[data-tour="nav:/performance"]', desktop: true, group: "Your workspace", title: "My performance",
    text: "See how your scores, skills and placement readiness change over time." },
  { target: '[data-tour="nav:/reports"]', desktop: true, group: "Your workspace", title: "My reports",
    text: "Every interview report with detailed feedback. Placement reports include the recording, bookmarked at each question." },
  { target: '[data-tour="nav:/calendar"]', desktop: true, group: "Your workspace", title: "Calendar",
    text: "Interviews, AI Coach sessions and your own events in one schedule." },
  { target: '[data-tour="nav:/erp"]', desktop: true, group: "Your workspace", title: "My ERP",
    text: "Your timetable, attendance, marks, fees, homework, circulars and library from your institution." },
  { target: '[data-tour="nav:/profile"]', desktop: true, group: "Your workspace", title: "My profile",
    text: "Your details, verified photo and resume library. Your Main Resume is used by interviews, AI Coach and Career coach." },
  { target: '[data-tour="menu"]', mobile: true, group: "Your workspace", title: "Everything else is in the menu",
    text: "Interview practice, placements, AI Coach, Resume Studio, Career coach, your reports, calendar, ERP and profile." },
  { target: '[data-tour="replay"]', group: "Anytime", title: "Replay this tour",
    text: "Open this tour again whenever you like." },
];

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;
const GAP = 14;
const MARGIN = 12;
const isMobile = () => window.matchMedia("(max-width: 760px)").matches;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function visible(selector: string): HTMLElement | null {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden" ? element : null;
}

function stepsForScreen(): Step[] {
  const mobile = isMobile();
  return STEPS.filter(step => (mobile ? !step.desktop : !step.mobile) && (!step.target || visible(step.target)));
}

function sameRect(a: Rect | null, b: Rect | null) {
  return !!a && !!b && Math.abs(a.top - b.top) < .5 && Math.abs(a.left - b.left) < .5 && Math.abs(a.width - b.width) < .5 && Math.abs(a.height - b.height) < .5;
}

export function ProductTour() {
  const { identity } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const [replayRequested, setReplayRequested] = useState(false);

  // Ask once per sign-in whether this student still needs the tour.
  useEffect(() => {
    if (!identity) return;
    let active = true;
    void api<{ pending?: boolean }>("/api/student/product-tour")
      .then(result => { if (active) setPending(result?.pending === true); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [identity]);

  useEffect(() => {
    const replay = () => { setReplayRequested(true); if (location.pathname !== "/") navigate("/"); };
    window.addEventListener(START_TOUR_EVENT, replay);
    return () => window.removeEventListener(START_TOUR_EVENT, replay);
  }, [location.pathname, navigate]);

  // Start on the Overview once its sections are on screen and no other
  // dialog (such as the profile setup prompt or the mobile menu) is open.
  useEffect(() => {
    if (steps || !(pending || replayRequested) || location.pathname !== "/") return;
    let frame = 0;
    const tryStart = () => {
      const ready = visible('[data-testid="overview-kpis"]') && !document.querySelector("dialog[open], [role=dialog][aria-modal=true]");
      if (!ready) return false;
      setIndex(0);
      setSteps(stepsForScreen());
      setReplayRequested(false);
      return true;
    };
    const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (tryStart()) observer.disconnect(); }); });
    if (!tryStart()) observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "class"] });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [pending, replayRequested, steps, location.pathname]);

  const finish = useCallback((outcome: "completed" | "skipped") => {
    setSteps(null);
    setPending(false);
    void api("/api/student/product-tour", json({ outcome })).catch(() => undefined);
  }, []);

  // Leaving the Overview ends the tour quietly; it does not count as seen.
  useEffect(() => { if (location.pathname !== "/") setSteps(null); }, [location.pathname]);

  if (!steps || !steps.length || !identity) return null;
  const firstName = displayName(identity.student.full_name).split(/\s+/)[0] || "there";
  return createPortal(
    <Spotlight steps={steps} index={index} firstName={firstName} onIndex={setIndex} onFinish={finish} />,
    document.body,
  );
}

function Spotlight({ steps, index, firstName, onIndex, onFinish }: {
  steps: Step[]; index: number; firstName: string;
  onIndex: (index: number) => void; onFinish: (outcome: "completed" | "skipped") => void;
}) {
  const step = steps[index];
  const last = index === steps.length - 1;
  const [rect, setRect] = useState<Rect | null>(null);
  const [card, setCard] = useState<{ top: number; left: number; side: string; arrow: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);

  // While the tour is open the page behind it is inert, so Tab, clicks and
  // screen readers stay with the tour.
  useEffect(() => {
    const app = document.getElementById("root");
    app?.setAttribute("inert", "");
    return () => { app?.removeAttribute("inert"); restoreFocus.current?.focus?.({ preventScroll: true }); };
  }, []);

  // Bring the element into view, then follow it while the page settles,
  // scrolls or resizes.
  useEffect(() => {
    let element = step.target ? visible(step.target) : null;
    if (!element) { setRect(null); return; }
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    let frame = 0;
    let previous: Rect | null = null;
    const track = () => {
      // The page may re-render the section; follow the new element.
      if (!element!.isConnected) element = step.target ? visible(step.target) : null;
      if (!element) { previous = null; setRect(null); return; }
      const box = element.getBoundingClientRect();
      const next = { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 };
      if (!sameRect(previous, next)) { previous = next; setRect(next); }
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  // Place the card beside the spotlight where it fits, else above or below.
  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const width = element.offsetWidth, height = element.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!rect) { setCard({ top: (vh - height) / 2, left: (vw - width) / 2, side: "center", arrow: 0 }); return; }
    if (isMobile()) {
      const below = rect.top + rect.height / 2 < vh / 2;
      setCard({ top: below ? vh - height - MARGIN : MARGIN, left: (vw - width) / 2, side: "sheet", arrow: 0 });
      return;
    }
    const clampTop = (top: number) => Math.min(Math.max(MARGIN, top), vh - height - MARGIN);
    const clampLeft = (left: number) => Math.min(Math.max(MARGIN, left), vw - width - MARGIN);
    const centerY = rect.top + rect.height / 2, centerX = rect.left + rect.width / 2;
    let placed: { top: number; left: number; side: string };
    if (rect.left + rect.width + GAP + width <= vw - MARGIN) placed = { top: clampTop(centerY - height / 2), left: rect.left + rect.width + GAP, side: "right" };
    else if (rect.top + rect.height + GAP + height <= vh - MARGIN) placed = { top: rect.top + rect.height + GAP, left: clampLeft(centerX - width / 2), side: "bottom" };
    else if (rect.top - GAP - height >= MARGIN) placed = { top: rect.top - GAP - height, left: clampLeft(centerX - width / 2), side: "top" };
    else if (rect.left - GAP - width >= MARGIN) placed = { top: clampTop(centerY - height / 2), left: rect.left - GAP - width, side: "left" };
    else placed = { top: clampTop(rect.top + rect.height - height - MARGIN), left: clampLeft(centerX - width / 2), side: "inside" };
    const arrow = placed.side === "right" || placed.side === "left"
      ? Math.min(Math.max(18, centerY - placed.top), height - 18)
      : Math.min(Math.max(18, centerX - placed.left), width - 18);
    setCard({ ...placed, arrow });
  }, [rect, index]);

  useEffect(() => { nextRef.current?.focus({ preventScroll: true }); }, [index]);

  const go = (target: number) => { if (target >= 0 && target < steps.length) onIndex(target); };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); onFinish("skipped"); }
    else if (event.key === "ArrowRight") { event.preventDefault(); if (last) onFinish("completed"); else go(index + 1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); go(index - 1); }
    else if (event.key === "Tab") {
      const controls = Array.from(cardRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") || []);
      const first = controls[0], end = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); end?.focus(); }
      else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first?.focus(); }
    }
  };

  // Keys work wherever focus is, even after a click on the dimmed page.
  const keyHandler = useRef(onKeyDown);
  keyHandler.current = onKeyDown;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
  const title = step.title || `Welcome to VoiceDots, ${firstName}!`;
  const progress = ((index + 1) / steps.length) * 100;
  return (
    <div className="vt-root" onMouseDown={event => {
      if (!cardRef.current?.contains(event.target as Node)) { event.preventDefault(); nextRef.current?.focus({ preventScroll: true }); }
    }}>
      <div className={`vt-hole${rect ? "" : " vt-hole-none"}`} aria-hidden="true"
        style={rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : undefined} />
      <div ref={cardRef} className={`vt-card vt-${card?.side || "center"}`} role="dialog" aria-modal="true"
        aria-labelledby="vt-title" aria-describedby="vt-text"
        style={{ top: card?.top ?? -9999, left: card?.left ?? -9999, ["--vt-arrow" as string]: `${card?.arrow ?? 0}px` }}>
        <div className="vt-card-inner" key={index}>
          <div className="vt-head">
            <span className="vt-group">{step.target ? step.group : <><Sparkles size={13} /> {step.group}</>}</span>
            <button type="button" className="vt-close" aria-label="Close tour" onClick={() => onFinish("skipped")}><X size={16} /></button>
          </div>
          <h2 id="vt-title">{title}</h2>
          <p id="vt-text">{step.text}</p>
          <div className="vt-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
          <div className="vt-foot">
            <span className="vt-count" aria-live="polite">{index + 1} of {steps.length}</span>
            <div className="vt-actions">
              {index === 0
                ? <button type="button" className="vt-skip" onClick={() => onFinish("skipped")}>Skip tour</button>
                : <button type="button" className="vt-back" onClick={() => go(index - 1)}><ArrowLeft size={15} /> Back</button>}
              <button ref={nextRef} type="button" className="vt-next" onClick={() => last ? onFinish("completed") : go(index + 1)}>
                {last ? <>Finish <Check size={15} /></> : index === 0 ? <>Show me around <ArrowRight size={15} /></> : <>Next <ArrowRight size={15} /></>}
              </button>
            </div>
          </div>
          {index > 0 && !last && <button type="button" className="vt-skip vt-skip-inline" onClick={() => onFinish("skipped")}>Skip tour</button>}
        </div>
      </div>
    </div>
  );
}
