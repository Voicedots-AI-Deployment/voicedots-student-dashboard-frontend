import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, ArrowRight, Award, BookOpen, ChartLine, Flame, Gauge, MessageSquareText, Mic, Minus, Target,
  TrendingDown, TrendingUp, Trophy,
} from "lucide-react";
import { Empty, PageHeading, ResourceState, date, useResource } from "./ui";
import "./performance.css";

// Display only. Every number is computed by GET /api/student/performance from
// the student's own released reports and readiness index; a missing value is
// shown as missing, never estimated here.

export type PerformancePoint = { session_id: string | null; at: string; score: number; placement: boolean; label: string };
type Skill = { dimension: string; label: string; average: number | null; latest: number | null; change: number | null };
type Communication = {
  speaking_speed_wpm: number | null; pace_label: string | null; filler_word_count: number | null; filler_change: number | null;
  top_filler_words: string[]; scores: Record<string, number | null>;
};
export type PerformanceData = {
  generated_at: string;
  pending_release_count: number;
  has_results: boolean;
  readiness: {
    overall_score: number | null; label: string | null; status: string | null;
    axes: Array<{ axis: string; score: number | null; weight: number | null }>;
    drives: Array<{ drive_id: string; company_name: string | null; role_title: string | null; best_score: number | null }>;
  };
  open_opportunities: Array<{ drive_id: string; company_name: string | null; role_title: string | null }>;
  summary: null | {
    released_count: number; placement_count: number; practice_count: number;
    latest: PerformancePoint & { change: number | null; label_readiness: string | null };
    recent_average: { score: number; count: number; label: string | null };
    best: PerformancePoint;
    first_to_latest_change: number | null;
  };
  trend: PerformancePoint[];
  skills: Skill[];
  strengths: string[];
  focus: string[];
  actions: Array<{ focus: string | null; action: string }>;
  communication: Communication | null;
  activity: { weeks: Array<{ week_start: string; week_end: string; count: number }>; active_weeks: number };
  placement_results: PerformancePoint[];
};

const AXIS_LABELS: Record<string, string> = { interview_readiness: "Placement interviews", resume_readiness: "Resume quality" };
const pointKey = (point: PerformancePoint) => `${point.session_id}-${point.at}`;

function Delta({ value, suffix = " pts" }: { value: number | null; suffix?: string }) {
  if (value == null) return <span className="perf-delta neutral">First result</span>;
  const rounded = Math.round(value * 10) / 10;
  const Icon = rounded > 0 ? TrendingUp : rounded < 0 ? TrendingDown : Minus;
  return <span className={`perf-delta ${rounded > 0 ? "up" : rounded < 0 ? "down" : "neutral"}`}>
    <Icon size={13} aria-hidden="true" />{rounded > 0 ? "+" : ""}{rounded}{suffix}
  </span>;
}

function TrendChart({ points }: { points: PerformancePoint[] }) {
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
      {points.map((point, index) => <g key={pointKey(point)} className={`perf-point ${point.placement ? "placement" : "practice"}`}>
        <circle cx={x(index)} cy={y(point.score)} r={point.placement ? 6 : 5}><title>{`${point.label} · ${date(point.at)} · ${Math.round(point.score)}`}</title></circle>
        {(index % labelEvery === 0 || index === points.length - 1) && <text x={x(index)} y={height - 8} textAnchor={points.length > 1 && index === points.length - 1 ? "end" : points.length > 1 && index === 0 ? "start" : "middle"}>{new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(point.at))}</text>}
      </g>)}
    </svg>
    <figcaption><span className="perf-legend placement">Placement interview</span><span className="perf-legend practice">Practice interview</span></figcaption>
    <table className="visually-hidden"><caption>Interview scores</caption><thead><tr><th>Date</th><th>Interview</th><th>Score</th></tr></thead>
      <tbody>{points.map(point => <tr key={pointKey(point)}><td>{date(point.at)}</td><td>{point.label}</td><td>{Math.round(point.score)}</td></tr>)}</tbody></table>
  </figure>;
}

function Meter({ value, label }: { value: number | null; label: string }) {
  return <div className="perf-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
    <span style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
  </div>;
}

export function Performance() {
  const resource = useResource<PerformanceData>("/api/student/performance");
  const data = resource.data;
  return <>
    <PageHeading eyebrow="TRACK YOUR GROWTH" title="My performance">
      How your interviews, skills and placement readiness are changing over time.
    </PageHeading>
    <ResourceState resource={resource}>{data && <PerformanceBody data={data} />}</ResourceState>
  </>;
}

function PerformanceBody({ data }: { data: PerformanceData }) {
  const pending = data.pending_release_count;
  const summary = data.summary;
  if (!data.has_results || !summary) {
    return <section className="panel"><Empty title="Your performance dashboard is waiting for its first result" action>
      {pending ? "Your completed interviews are still being reviewed. Results appear here once they are released." : "Complete a practice interview to see your scores, skills and progress here."}
    </Empty></section>;
  }

  const readiness = data.readiness.overall_score;
  const points = data.trend;
  const multiple = summary.released_count > 1;
  const recentCount = summary.recent_average.count;
  const skillLabel = (key: string) => data.skills.find(skill => skill.dimension === key)?.label ?? key.replace(/_/g, " ");
  const communication = data.communication;
  const weeks = data.activity.weeks;
  const busiest = Math.max(1, ...weeks.map(week => week.count));
  const opportunities = data.open_opportunities;

  return <div className="perf-page">
    <section className="stats-grid perf-kpis" aria-label="Performance summary">
      <article className="stat-card"><div className="stat-label"><span>Placement readiness</span><Gauge size={18} /></div>
        <strong>{readiness == null ? "—" : Math.round(readiness)}</strong>
        <p>{readiness == null ? "Complete a placement interview to unlock" : data.readiness.label}</p></article>
      <article className="stat-card"><div className="stat-label"><span>Latest score</span><ChartLine size={18} /></div>
        <strong>{Math.round(summary.latest.score)}</strong><p><Delta value={summary.latest.change} /> vs previous</p></article>
      <article className="stat-card"><div className="stat-label"><span>Average (last {recentCount})</span><Activity size={18} /></div>
        <strong>{Math.round(summary.recent_average.score)}</strong><p>{summary.recent_average.label}</p></article>
      <article className="stat-card"><div className="stat-label"><span>Best score</span><Trophy size={18} /></div>
        <strong>{Math.round(summary.best.score)}</strong><p>{summary.best.label}</p></article>
    </section>

    <div className="perf-columns">
      <section className="panel perf-trend">
        <div className="section-heading"><div><span className="eyebrow">SCORE TREND</span><h2>Your interview scores</h2>
          <p>{summary.released_count} released interview{summary.released_count === 1 ? "" : "s"} · {summary.placement_count} placement · {summary.practice_count} practice{pending ? ` · ${pending} awaiting release` : ""}</p></div>
          <Link to="/reports">All reports <ArrowRight size={15} /></Link></div>
        <TrendChart points={points} />
        <p className="perf-summary">{multiple && points.length
          ? <>Your score moved from <strong>{Math.round(points[0].score)}</strong> to <strong>{Math.round(summary.latest.score)}</strong> (<Delta value={summary.first_to_latest_change} />) since your first released interview.</>
          : "Complete another interview to see how your score changes."}</p>
      </section>

      <section className="panel perf-readiness">
        <div className="section-heading"><div><span className="eyebrow">PLACEMENT READINESS</span><h2>What makes up your index</h2></div></div>
        {readiness == null ? <p className="muted">Your readiness index is calculated from released placement interviews. Practice results build your skills but are not counted.</p> : <>
          <div className="perf-ring" style={{ ["--value" as string]: Math.round(readiness) }}>
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" /><circle className="value" cx="60" cy="60" r="50" pathLength={100} /></svg>
            <div><strong>{Math.round(readiness)}</strong><span>/ 100</span></div>
          </div>
          <p className="perf-ring-label">{data.readiness.label}</p>
          <dl className="perf-axes">{data.readiness.axes.map(({ axis, score, weight }) => <div key={axis}>
            <dt>{AXIS_LABELS[axis] ?? axis.replace(/_/g, " ")}{weight != null && <small> · {weight}% weight</small>}</dt>
            <dd><Meter value={score} label={axis.replace(/_/g, " ")} /><span>{score == null ? "—" : Math.round(score)}</span></dd>
          </div>)}</dl>
          {data.readiness.drives.length ? <ul className="perf-drive-scores">{data.readiness.drives.map(drive => <li key={drive.drive_id}><span>{drive.company_name}</span><small>{drive.role_title}</small><strong>{drive.best_score == null ? "—" : Math.round(drive.best_score)}</strong></li>)}</ul> : null}
        </>}
      </section>
    </div>

    <section className="panel perf-skills">
      <div className="section-heading"><div><span className="eyebrow">SKILLS</span><h2>How each skill is developing</h2>
        <p>Average of your last {recentCount} interview{recentCount === 1 ? "" : "s"}, with the change since your first one.</p></div></div>
      <ul className="perf-skill-list">{data.skills.map(skill => <li key={skill.dimension}><span>{skill.label}</span><Meter value={skill.average} label={skill.label} />
        <strong>{skill.average == null ? "Not assessed" : `${Math.round(skill.average)}%`}</strong>{multiple && <Delta value={skill.change} suffix="%" />}</li>)}</ul>
    </section>

    <div className="perf-columns perf-columns-even">
      <section className="panel perf-focus">
        <div className="section-heading"><div><span className="eyebrow">STRENGTHS AND FOCUS</span><h2>Where to put your effort</h2></div></div>
        <div className="perf-chip-group"><h3><Award size={16} /> Consistent strengths</h3>
          {data.strengths.length ? <div className="focus-chips">{data.strengths.map(key => <span className="pill" key={key}>{skillLabel(key)}</span>)}</div> : <p className="muted">No skill is consistently at 70% yet. Keep going.</p>}</div>
        <div className="perf-chip-group"><h3><Target size={16} /> Focus next</h3>
          {data.focus.length ? <div className="focus-chips">{data.focus.map(key => <span className="pill" key={key}>{skillLabel(key)}</span>)}</div> : <p className="muted">Every assessed skill is above 70% on average.</p>}</div>
        {data.actions.length > 0 && <ol className="perf-actions">{data.actions.map(item => <li key={`${item.focus}-${item.action}`}><strong>{item.focus}</strong><span>{item.action}</span></li>)}</ol>}
        <div className="perf-links"><Link className="button primary small" to="/practice"><Mic size={14} /> Practice an interview</Link><Link className="button secondary small" to="/coach"><BookOpen size={14} /> Prepare with AI Coach</Link></div>
      </section>

      <section className="panel perf-communication">
        <div className="section-heading"><div><span className="eyebrow">COMMUNICATION</span><h2>How you speak</h2><p>From your latest interview.</p></div></div>
        <dl className="perf-comm-grid">
          <div><dt><MessageSquareText size={15} /> Speaking pace</dt><dd>{communication?.speaking_speed_wpm ? <>{communication.speaking_speed_wpm} <small>words/min</small></> : "Not measured"}</dd><small>{communication?.pace_label ? `${communication.pace_label} pace` : "Needs timed answers"}</small></div>
          <div><dt><Flame size={15} /> Filler words</dt><dd>{communication?.filler_word_count ?? "—"}</dd><small>{communication?.filler_change != null ? <Delta value={communication.filler_change} suffix="" /> : "In the latest interview"}</small></div>
        </dl>
        {communication && Object.keys(communication.scores).length > 0 && <ul className="perf-skill-list compact">{Object.entries(communication.scores).map(([key, value]) => <li key={key}><span>{key.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())}</span><Meter value={value} label={key} /><strong>{value == null ? "—" : `${Math.round(value)}%`}</strong></li>)}</ul>}
        {communication?.top_filler_words.length ? <p className="muted perf-fillers">Most used: {communication.top_filler_words.map(word => `“${word}”`).join(", ")}</p> : communication && <p className="muted perf-fillers">No filler words detected in your latest interview.</p>}
      </section>
    </div>

    <div className="perf-columns perf-columns-even">
      <section className="panel perf-activity">
        <div className="section-heading"><div><span className="eyebrow">CONSISTENCY</span><h2>Practice activity</h2><p>Interviews per week over the last {weeks.length} weeks · active in {data.activity.active_weeks} of {weeks.length} weeks.</p></div></div>
        <div className="perf-bars" role="img" aria-label={`Interviews per week: ${weeks.map(week => week.count).join(", ")}`}>
          {weeks.map((week, index) => <div key={week.week_start} title={`Week ending ${date(week.week_end)}: ${week.count}`}>
            <div className="perf-bar-track"><span style={{ height: `${week.count ? Math.max(12, week.count / busiest * 100) : 4}%`, animationDelay: `${index * 40}ms` }} className={week.count ? "" : "perf-bar-empty"} /></div>
            <small>{index === weeks.length - 1 ? "Now" : `${weeks.length - 1 - index}w`}</small>
          </div>)}
        </div>
      </section>

      <section className="panel perf-placements">
        <div className="section-heading"><div><span className="eyebrow">PLACEMENTS</span><h2>Your placement journey</h2></div><Link to="/placements">Placements <ArrowRight size={15} /></Link></div>
        <ul className="perf-timeline">{data.placement_results.map(point => <li key={pointKey(point)}>
          <span className="perf-timeline-dot" /><div><strong>{point.label}</strong><small>{date(point.at)}</small></div><b>{Math.round(point.score)}</b>
        </li>)}
          {!data.placement_results.length && <li className="perf-timeline-empty">No placement interview results yet.</li>}
        </ul>
        {opportunities.length > 0 && <div className="perf-upcoming"><strong>{opportunities.length} open opportunit{opportunities.length === 1 ? "y" : "ies"}</strong>
          <span>{opportunities.map(drive => `${drive.company_name} · ${drive.role_title}`).join(", ")}</span>
          <Link className="button secondary small" to="/placements">View <ArrowRight size={14} /></Link></div>}
      </section>
    </div>
  </div>;
}
