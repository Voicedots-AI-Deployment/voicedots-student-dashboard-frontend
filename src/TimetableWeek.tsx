import { useEffect, useState } from 'react';

const DAY = 86400000;
const OFFSET = 330 * 60000;
export function istDay(now: number) { return Math.floor((now + OFFSET) / DAY) * DAY; }
export function monday(now: number) {
  const day = istDay(now);
  return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY;
}
export function dateLabel(day: number) {
  return new Intl.DateTimeFormat('en-IN', { day:'numeric', month:'short', timeZone:'UTC' }).format(day);
}
export function isLive(now: number, day: number, start: string, end: string) {
  const minutes = (value: string) => { const [h,m] = value.split(':').map(Number); return h * 60 + m; };
  const current = ((now + OFFSET) % DAY) / 60000;
  return day === istDay(now) && current >= minutes(start) && current < minutes(end);
}
export function appliesOn(row: Record<string,unknown>, day: number) {
  const value = new Date(day).toISOString().slice(0,10);
  return row.active !== false && (!row.effective_from || value >= String(row.effective_from).slice(0,10)) && (!row.effective_until || value <= String(row.effective_until).slice(0,10));
}
export function useTimetableWeek() {
  const [now, setNow] = useState(Date.now);
  // null follows the current week; explicit navigation stays on the chosen week.
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 1000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  const week = selected ?? monday(now);
  return { now, week, days:Array.from({length:7}, (_,i) => week + i * DAY),
    previous:() => setSelected(week - 7 * DAY), next:() => setSelected(week + 7 * DAY), today:() => setSelected(null) };
}
export function TimetableWeekToolbar({ calendar }: { calendar: ReturnType<typeof useTimetableWeek> }) {
  const clock = new Intl.DateTimeFormat('en-IN', { timeZone:'Asia/Kolkata', day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true }).format(calendar.now);
  return <div className="erp-week-toolbar"><div><strong>{dateLabel(calendar.week)} – {dateLabel(calendar.days[6])} {new Date(calendar.days[6]).getUTCFullYear()}</strong><small>{clock.toUpperCase()} IST</small></div><nav aria-label="Timetable week"><button type="button" onClick={calendar.previous} aria-label="Previous week">← Previous week</button><button type="button" onClick={calendar.today}>Today</button><button type="button" onClick={calendar.next} aria-label="Next week">Next week →</button></nav></div>;
}
