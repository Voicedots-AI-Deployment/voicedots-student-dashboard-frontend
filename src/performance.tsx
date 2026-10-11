import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, ArrowRight, Award, BookOpen, ChartLine, Flame, Gauge, MessageSquareText, Mic, Minus, Target,
  TrendingDown, TrendingUp, Trophy,
} from "lucide-react";
import type { Dashboard, Report } from "./api";
import { Empty, PageHeading, ResourceState, date, useResource } from "./ui";
import "./performance.css";

// Every number on this page comes from the student's own released reports and
// readiness index. Nothing is estimated: a missing value is shown as missing.

const DIMENSION_LABELS: Record<string, string> = {
  communication: "Communication",
  resume_ownership: "Resume ownership",
  confidence_conduct: "Confidence",
  structured_thinking: "Structured thinking",
  domain_knowledge: "Domain knowledge",
  applied_evidence: "Applied examples",
  role_awareness: "Role awareness",
};
const DIMENSIONS = Object.keys(DIMENSION_LABELS);

export type ScoredReport = { id: string; at: number; score: number; placement: boolean; label: string; report: Report };

export function readinessLabel(score: number) {
  return score >= 70 ? "Interview ready" : score >= 55 ? "Approaching ready" : score >= 40 ? "Developing" : "Not ready yet";
}

export function scoredReports(reports: Report[]): ScoredReport[] {
  return reports
    .filter(item => typeof item.report?.overall_score === "number" && item.report?.status !== "awaiting_release")
    .map(item => ({
      id: item.session_id || item.evaluation_id,
      at: Date.parse(item.completed_at || item.created_at) || 0,
      score: item.report!.overall_score as number,
      placement: Boolean(item.drive_id),
      label: item.company_name ? `${item.company_name} · ${item.target_role || "Placement"}` : item.target_role || "Practice interview",
      report: item,
    }))
    .sort((a, b) => a.at - b.at);
}

export function dimensionPercentages(report: Report): Record<string, number> {
  const view = report.report;
  const values: Record<string, number> = {};
  for (const item of [...(view?.core_dimensions || []), ...(view?.domain_dimensions || [])]) {
    const percentage = typeof item.percentage === "number" ? item.percentage : typeof item.band === "number" ? item.band * 25 : null;
    if (percentage != null) values[item.dimension] = percentage;
  }
  return values;
}

export function weeklyActivity(points: ScoredReport[], now = Date.now(), weeks = 8) {
  const week = 7 * 24 * 3600 * 1000;
  return Array.from({ length: weeks }, (_, index) => {
    const end = now - (weeks - 1 - index) * week;
    const start = end - week;
    return { start, count: points.filter(point => point.at > start && point.at <= end).length };
  });
}

function Delta({ value, suffix = " pts" }: { value: number | null; suffix?: string }) {
  if (value == null) return <span className="perf-delta neutral">First result</span>;
  const rounded = Math.round(value * 10) / 10;
  const Icon = rounded > 0 ? TrendingUp : rounded < 0 ? TrendingDown : Minus;
  return <span className={`perf-delta ${rounded > 0 ? "up" : rounded < 0 ? "down" : "neutral"}`}>
    <Icon size={13} aria-hidden="true" />{rounded > 0 ? "+" : ""}{rounded}{suffix}
  </span>;
}

function TrendChart({ points }: { points: ScoredReport[] }) {
  // Draw in real pixels at the container's width so labels keep their size on phones.
  const frame = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = width < 480 ? 200 : 220, left = 34, right = 16, top = 14, bottom = 28;
  // Thin out date labels so they never collide.
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor((width - left - right) / 64))));
  const x = (index: number) => points.length === 1 ? (left + width - right) / 2 : left + index * ((width - left - right) / (points.length - 1));
  const y = (value: number) => top + (100 - value) / 100 * (height - top - bottom);
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.score).toFixed(1)}`).join(" ");
  const area = points.length > 1 ? `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : "";
  return <figure className="perf-chart" ref={frame}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Interview score trend across ${points.length} interviews`}>
      <defs>
        <linearGradient id="perf-trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity=".18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 40, 55, 70, 100].map(mark => <g key={mark} className={`perf-grid${mark === 70 ? " ready" : ""}`}>
        <line x1={left} x2={width - right} y1={y(mark)} y2={y(mark)} />
        <text x={left - 8} y={y(mark) + 3} textAnchor="end">{mark}</text>
      </g>)}
      <text className="perf-grid-label" x={left + 6} y={y(70) - 5}>Interview ready</text>
      {area && <path className="perf-area" d={area} fill="url(#perf-trend-fill)" />}
      {points.length > 1 && <path className="perf-line" d={line} pathLength={1} />}
      {points.map((point, index) => <g key={point.id} className={`perf-point ${point.placement ? "placement" : "practice"}`}>
        <circle cx={x(index)} cy={y(point.score)} r={point.placement ? 6 : 5}><title>{`${point.label} · ${date(new Date(point.at).toISOString())} · ${Math.round(point.score)}`}</title></circle>
        {(index % labelEvery === 0 || index === points.length - 1) && <text x={x(index)} y={height - 8} textAnchor={points.length > 1 && index === points.length - 1 ? "end" : points.length > 1 && index === 0 ? "start" : "middle"}>{new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(point.at))}</text>}
      </g>)}
    </svg>
    <figcaption><span className="perf-legend placement">Placement interview</span><span className="perf-legend practice">Practice interview</span></figcaption>
    <table className="visually-hidden"><caption>Interview scores</caption><thead><tr><th>Date</th><th>Interview</th><th>Score</th></tr></thead>
      <tbody>{points.map(point => <tr key={point.id}><td>{date(new Date(point.at).toISOString())}</td><td>{point.label}</td><td>{Math.round(point.score)}</td></tr>)}</tbody></table>
  </figure>;
}

function Meter({ value, label }: { value: number | null; label: string }) {
  return <div className="perf-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
    <span style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
  </div>;
}

export function Performance() {
  const resource = useResource<Dashboard>("/api/student/dashboard");
  const data = resource.data;
  return <>
    <PageHeading eyebrow="TRACK YOUR GROWTH" title="My performance">
      How your interviews, skills and placement readiness are changing over time.
    </PageHeading>
    <ResourceState resource={resource}>{data && <PerformanceBody data={data} />}</ResourceState>
  </>;
}

function PerformanceBody({ data }: { data: Dashboard }) {
  const points = scoredReports(data.reports);
  const pending = data.reports.length - points.length;
  if (!points.length) {
    return <section className="panel"><Empty title="Your performance dashboard is waiting for its first result" action>
      {pending ? "Your completed interviews are still being reviewed. Results appear here once they are released." : "Complete a practice interview to see your scores, skills and progress here."}
    </Empty></section>;
  }

  const latest = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : null;
  const recent = points.slice(-5);
  const average = recent.reduce((sum, point) => sum + point.score, 0) / recent.length;
  const best = points.reduce((top, point) => point.score > top.score ? point : top, points[0]);
  const placements = points.filter(point => point.placement).length;
  const readiness = data.readiness?.overall_score ?? null;

  const firstDimensions = dimensionPercentages(points[0].report);
  const latestDimensions = dimensionPercentages(latest.report);
  const averageDimensions = Object.fromEntries(DIMENSIONS.map(key => {
    const values = recent.map(point => dimensionPercentages(point.report)[key]).filter((value): value is number => typeof value === "number");
    return [key, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null];
  })) as Record<string, number | null>;
  const ranked = DIMENSIONS.filter(key => averageDimensions[key] != null).sort((a, b) => (averageDimensions[b]! - averageDimensions[a]!));
  const strengths = ranked.filter(key => averageDimensions[key]! >= 70).slice(0, 3);
  const focus = [...ranked].reverse().filter(key => averageDimensions[key]! < 70).slice(0, 3);

  const communication = points.map(point => point.report.report?.communication).filter(Boolean);
  const latestCommunication = latest.report.report?.communication;
  const firstFillers = points[0].report.report?.communication?.filler_word_count;
  const activity = weeklyActivity(points);
  const busiest = Math.max(1, ...activity.map(week => week.count));
  const activeWeeks = activity.filter(week => week.count > 0).length;
  const actions = latest.report.report?.priority_improvement_areas?.flatMap(area => (area.actions || []).map(action => ({ focus: area.focus, action }))).slice(0, 4) || [];
  const interviewAxis = (data.readiness as unknown as { interview_readiness?: { drives?: Array<{ drive_id: string; company_name?: string; role_title?: string; best_score: number }> } })?.interview_readiness;
  const upcoming = data.drives.filter(drive => drive.status === "active" && drive.interview_action && !["completed", "blocked", "not_assigned"].includes(drive.interview_action));

  return <div className="perf-page">
    <section className="stats-grid perf-kpis" aria-label="Performance summary">
      <article className="stat-card"><div className="stat-label"><span>Placement readiness</span><Gauge size={18} /></div>
        <strong>{readiness == null ? "—" : Math.round(readiness)}</strong>
        <p>{readiness == null ? "Complete a placement interview to unlock" : readinessLabel(readiness)}</p></article>
      <article className="stat-card"><div className="stat-label"><span>Latest score</span><ChartLine size={18} /></div>
        <strong>{Math.round(latest.score)}</strong><p><Delta value={previous ? latest.score - previous.score : null} /> vs previous</p></article>
      <article className="stat-card"><div className="stat-label"><span>Average (last {recent.length})</span><Activity size={18} /></div>
        <strong>{Math.round(average)}</strong><p>{readinessLabel(average)}</p></article>
      <article className="stat-card"><div className="stat-label"><span>Best score</span><Trophy size={18} /></div>
        <strong>{Math.round(best.score)}</strong><p>{best.label}</p></article>
    </section>

    <div className="perf-columns">
      <section className="panel perf-trend">
        <div className="section-heading"><div><span className="eyebrow">SCORE TREND</span><h2>Your interview scores</h2>
          <p>{points.length} released interview{points.length === 1 ? "" : "s"} · {placements} placement · {points.length - placements} practice{pending ? ` · ${pending} awaiting release` : ""}</p></div>
          <Link to="/reports">All reports <ArrowRight size={15} /></Link></div>
        <TrendChart points={points} />
        <p className="perf-summary">{points.length > 1
          ? <>Your score moved from <strong>{Math.round(points[0].score)}</strong> to <strong>{Math.round(latest.score)}</strong> (<Delta value={latest.score - points[0].score} />) since your first released interview.</>
          : "Complete another interview to see how your score changes."}</p>
      </section>

      <section className="panel perf-readiness">
        <div className="section-heading"><div><span className="eyebrow">PLACEMENT READINESS</span><h2>What makes up your index</h2></div></div>
        {readiness == null ? <p className="muted">Your readiness index is calculated from released placement interviews. Practice results build your skills but are not counted.</p> : <>
          <div className="perf-ring" style={{ ["--value" as string]: Math.round(readiness) }}>
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" /><circle className="value" cx="60" cy="60" r="50" pathLength={100} /></svg>
            <div><strong>{Math.round(readiness)}</strong><span>/ 100</span></div>
          </div>
          <p className="perf-ring-label">{readinessLabel(readiness)}</p>
          <dl className="perf-axes">{Object.entries(data.readiness.axis_scores || {}).map(([axis, value]) => <div key={axis}>
            <dt>{axis === "interview_readiness" ? "Placement interviews" : axis === "resume_readiness" ? "Resume quality" : axis.replace(/_/g, " ")}
              {(data.readiness as unknown as { weights?: Record<string, number> }).weights?.[axis] != null && <small> · {(data.readiness as unknown as { weights: Record<string, number> }).weights[axis]}% weight</small>}</dt>
            <dd><Meter value={value} label={axis.replace(/_/g, " ")} /><span>{Math.round(value)}</span></dd>
          </div>)}</dl>
          {interviewAxis?.drives?.length ? <ul className="perf-drive-scores">{interviewAxis.drives.map(drive => <li key={drive.drive_id}><span>{drive.company_name}</span><small>{drive.role_title}</small><strong>{Math.round(drive.best_score)}</strong></li>)}</ul> : null}
        </>}
      </section>
    </div>

    <section className="panel perf-skills">
      <div className="section-heading"><div><span className="eyebrow">SKILLS</span><h2>How each skill is developing</h2>
        <p>Average of your last {recent.length} interview{recent.length === 1 ? "" : "s"}, with the change since your first one.</p></div></div>
      <ul className="perf-skill-list">{DIMENSIONS.map(key => {
        const value = averageDimensions[key];
        const change = latestDimensions[key] != null && firstDimensions[key] != null && points.length > 1 ? latestDimensions[key] - firstDimensions[key] : null;
        return <li key={key}><span>{DIMENSION_LABELS[key]}</span><Meter value={value} label={DIMENSION_LABELS[key]} />
          <strong>{value == null ? "Not assessed" : `${Math.round(value)}%`}</strong>{points.length > 1 && <Delta value={change} suffix="%" />}</li>;
      })}</ul>
    </section>

    <div className="perf-columns perf-columns-even">
      <section className="panel perf-focus">
        <div className="section-heading"><div><span className="eyebrow">STRENGTHS AND FOCUS</span><h2>Where to put your effort</h2></div></div>
        <div className="perf-chip-group"><h3><Award size={16} /> Consistent strengths</h3>
          {strengths.length ? <div className="focus-chips">{strengths.map(key => <span className="pill" key={key}>{DIMENSION_LABELS[key]}</span>)}</div> : <p className="muted">No skill is consistently at 70% yet. Keep going.</p>}</div>
        <div className="perf-chip-group"><h3><Target size={16} /> Focus next</h3>
          {focus.length ? <div className="focus-chips">{focus.map(key => <span className="pill" key={key}>{DIMENSION_LABELS[key]}</span>)}</div> : <p className="muted">Every assessed skill is above 70% on average.</p>}</div>
        {actions.length > 0 && <ol className="perf-actions">{actions.map(item => <li key={`${item.focus}-${item.action}`}><strong>{item.focus}</strong><span>{item.action}</span></li>)}</ol>}
        <div className="perf-links"><Link className="button primary small" to="/practice"><Mic size={14} /> Practice an interview</Link><Link className="button secondary small" to="/coach"><BookOpen size={14} /> Prepare with AI Coach</Link></div>
      </section>

      <section className="panel perf-communication">
        <div className="section-heading"><div><span className="eyebrow">COMMUNICATION</span><h2>How you speak</h2><p>From your latest interview.</p></div></div>
        <dl className="perf-comm-grid">
          <div><dt><MessageSquareText size={15} /> Speaking pace</dt><dd>{latestCommunication?.speaking_speed_wpm ? <>{latestCommunication.speaking_speed_wpm} <small>words/min</small></> : "Not measured"}</dd><small>{latestCommunication?.pace_label ? `${latestCommunication.pace_label} pace` : "Needs timed answers"}</small></div>
          <div><dt><Flame size={15} /> Filler words</dt><dd>{latestCommunication?.filler_word_count ?? "—"}</dd><small>{typeof firstFillers === "number" && typeof latestCommunication?.filler_word_count === "number" && points.length > 1 ? <Delta value={latestCommunication.filler_word_count - firstFillers} suffix="" /> : "In the latest interview"}</small></div>
        </dl>
        {latestCommunication?.scores && <ul className="perf-skill-list compact">{Object.entries(latestCommunication.scores).map(([key, value]) => <li key={key}><span>{key.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())}</span><Meter value={value ?? null} label={key} /><strong>{value == null ? "—" : `${Math.round(value)}%`}</strong></li>)}</ul>}
        {latestCommunication?.top_filler_words?.length ? <p className="muted perf-fillers">Most used: {latestCommunication.top_filler_words.map(word => `“${word}”`).join(", ")}</p> : communication.length > 0 && <p className="muted perf-fillers">No filler words detected in your latest interview.</p>}
      </section>
    </div>

    <div className="perf-columns perf-columns-even">
      <section className="panel perf-activity">
        <div className="section-heading"><div><span className="eyebrow">CONSISTENCY</span><h2>Practice activity</h2><p>Interviews per week over the last 8 weeks · active in {activeWeeks} of 8 weeks.</p></div></div>
        <div className="perf-bars" role="img" aria-label={`Interviews per week: ${activity.map(week => week.count).join(", ")}`}>
          {activity.map((week, index) => <div key={week.start} title={`Week of ${date(new Date(week.start + 86400000).toISOString())}: ${week.count}`}>
            <div className="perf-bar-track"><span style={{ height: `${week.count ? Math.max(12, week.count / busiest * 100) : 4}%`, animationDelay: `${index * 40}ms` }} className={week.count ? "" : "perf-bar-empty"} /></div>
            <small>{index === activity.length - 1 ? "Now" : `${activity.length - 1 - index}w`}</small>
          </div>)}
        </div>
      </section>

      <section className="panel perf-placements">
        <div className="section-heading"><div><span className="eyebrow">PLACEMENTS</span><h2>Your placement journey</h2></div><Link to="/placements">Placements <ArrowRight size={15} /></Link></div>
        <ul className="perf-timeline">{points.filter(point => point.placement).reverse().map(point => <li key={point.id}>
          <span className="perf-timeline-dot" /><div><strong>{point.label}</strong><small>{date(new Date(point.at).toISOString())}</small></div><b>{Math.round(point.score)}</b>
        </li>)}
          {!placements && <li className="perf-timeline-empty">No placement interview results yet.</li>}
        </ul>
        {upcoming.length > 0 && <div className="perf-upcoming"><strong>{upcoming.length} open opportunit{upcoming.length === 1 ? "y" : "ies"}</strong>
          <span>{upcoming.map(drive => `${drive.company_name} · ${drive.role_title}`).join(", ")}</span>
          <Link className="button secondary small" to="/placements">View <ArrowRight size={14} /></Link></div>}
      </section>
    </div>
  </div>;
}
