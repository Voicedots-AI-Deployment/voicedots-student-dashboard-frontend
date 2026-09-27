import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Drive } from "./api";
import { dateTime, Empty, ErrorMessage, PageHeading, ResourceState, useResource } from "./ui";

type Event = {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  kind: "placement" | "coach";
  time?: string;
  startsAt?: number;
  endsAt?: number;
  dateOnly?: boolean;
  location?: string;
  plan_id?: string;
  session_id?: string;
  duration_minutes?: number;
  status?: string;
  cycle_id?: string;
  session_type?: string;
};

const indiaTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
const indiaDateTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const indiaDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

function coachStatus(status?: string) {
  if (!status) return "Scheduled";
  return ({ completed: "Completed", cancelled: "Cancelled", canceled: "Cancelled", in_progress: "In progress", validation: "Validation", practice: "Practice", teaching: "Teaching" } as Record<string, string>)[status] || "Scheduled";
}

function indiaDateParts(value?: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value || new Date());
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function eventDay(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return indiaDateParts(new Date(value));
}

function dayEnd(day: string) {
  return Date.parse(`${day}T23:59:59+05:30`);
}

function monthLabel(value: Date) {
  return value.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function Calendar() {
  const drives = useResource<Drive[]>("/api/student/drives");
  const coach = useResource<{
    events: Array<{
      id: string;
      date: string;
      title: string;
      subtitle: string;
      kind: "coach";
      time?: string;
      duration_minutes?: number;
      status?: string;
      plan_id?: string;
      session_id?: string;
      cycle_id?: string;
      session_type?: string;
    }>;
  }>("/api/student/coach/calendar");
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => {
    const [year, monthNumber] = indiaDateParts().split("-").map(Number);
    return new Date(year, monthNumber - 1, 1);
  });
  const [unlinkedEvent, setUnlinkedEvent] = useState("");
  const events = useMemo<Event[]>(() => [
    ...(drives.data || []).flatMap((drive) => drive.window_start_at || drive.drive_date
      ? [{
          id: drive.id,
          date: eventDay(drive.window_start_at || drive.drive_date || ""),
          title: drive.role_title,
          subtitle: drive.company_name,
          kind: "placement" as const,
          time: drive.window_start_at ? dateTime(drive.window_start_at) : undefined,
          startsAt: drive.window_start_at ? Date.parse(drive.window_start_at) : drive.drive_date ? Date.parse(`${drive.drive_date}T00:00:00+05:30`) : undefined,
          endsAt: drive.window_end_at ? Date.parse(drive.window_end_at) : !drive.window_start_at && drive.drive_date ? dayEnd(drive.drive_date) : undefined,
          dateOnly: !drive.window_start_at,
          status: drive.status,
          location: drive.location,
        }]
      : []),
    ...(coach.data?.events || []).map((event) => ({ ...event, date: eventDay(event.date), startsAt: event.time ? Date.parse(event.time) : Date.parse(`${event.date}T00:00:00+05:30`), endsAt: event.time ? undefined : dayEnd(eventDay(event.date)) })),
  ], [drives.data, coach.data]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
  const today = indiaDateParts();
  const now = Date.now();
  const upcoming = events
    .filter((event) => event.kind === "placement"
      ? event.status !== "closed" && (event.endsAt ?? event.startsAt ?? 0) >= now
      : !["completed", "cancelled", "canceled"].includes(event.status || "") && (event.endsAt ?? event.startsAt ?? 0) >= now)
    .sort((left, right) => (left.startsAt ?? Number.MAX_SAFE_INTEGER) - (right.startsAt ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id))
    .slice(0, 5);

  function openEvent(event: Event) {
    setUnlinkedEvent("");
    if (event.kind === "coach" && event.cycle_id && event.session_type === "validation") {
      navigate(`/practice?coach_cycle=${encodeURIComponent(event.cycle_id)}`);
      return;
    }
    if (event.kind === "coach" && event.plan_id && event.cycle_id) {
      navigate(`/coach/session?plan=${encodeURIComponent(event.plan_id)}&cycle=${encodeURIComponent(event.cycle_id)}`);
      return;
    }
    if (event.kind === "coach") {
      if (event.plan_id && event.session_id) {
        navigate(`/coach?plan=${encodeURIComponent(event.plan_id)}&session=${encodeURIComponent(event.session_id)}&stage=coach`);
        return;
      }
      setUnlinkedEvent("This older Coach calendar event is not linked to one specific session. Open AI Coach and select the session you want to continue.");
      return;
    }
    navigate(`/placements?drive=${encodeURIComponent(event.id)}`);
  }

  function activateWithKeyboard(event: KeyboardEvent, item: Event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openEvent(item);
    }
  }

  return (
    <div className="calendar-page">
      <PageHeading eyebrow="YOUR SCHEDULE" title="Calendar">
        See placement interviews and AI Coach sessions in one place.
      </PageHeading>
      {unlinkedEvent && <ErrorMessage message={unlinkedEvent} />}
      {coach.error && <ErrorMessage message={coach.error} retry={coach.reload} />}
      <ResourceState resource={drives}>
        <div className="calendar-layout">
          <section className="panel calendar-month">
            <header className="calendar-toolbar">
              <button className="icon-button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <ChevronLeft size={18} />
              </button>
              <h2>{monthLabel(month)}</h2>
              <button className="icon-button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                <ChevronRight size={18} />
              </button>
            </header>
            <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="calendar-grid">
              {days.map((day) => {
                const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                const items = events.filter((item) => item.date === key);
                const outside = day.getMonth() !== month.getMonth();
                return (
                  <div className={`calendar-day${outside ? " outside" : ""}${key === today ? " today" : ""}`} key={key}>
                    <span className="calendar-day-number">{day.getDate()}</span>
                    {items.map((item) => (
                      <div
                        className={`calendar-chip ${item.kind}`}
                        onClick={() => openEvent(item)}
                        onKeyDown={(event) => activateWithKeyboard(event, item)}
                        role="button"
                        tabIndex={0}
                        title={`${item.title} · ${item.subtitle}`}
                        aria-label={`${item.title}, ${item.subtitle}, ${item.dateOnly && item.startsAt ? `${indiaDate.format(item.startsAt)} IST, time to be confirmed` : item.startsAt ? indiaDateTime.format(item.startsAt) + " IST" : item.date}${item.kind === "coach" ? `, ${coachStatus(item.status)}, ${item.duration_minutes || 30} minutes, open Coach session` : ""}`}
                        key={item.id}
                      >
                        <b>{item.title}</b>
                        <small>{item.dateOnly ? "Time to be confirmed" : item.startsAt && item.time ? indiaTime.format(item.startsAt) : item.subtitle}</small>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
          <aside className="panel calendar-upcoming">
            <div className="section-heading">
              <div><span className="eyebrow">NEXT UP</span><h2>Upcoming</h2></div>
              <CalendarDays size={22} />
            </div>
            {upcoming.length ? upcoming.map((event) => (
              <article
                className="calendar-upcoming-event"
                key={event.id}
                onClick={() => openEvent(event)}
                onKeyDown={(keyEvent) => activateWithKeyboard(keyEvent, event)}
                role="button"
                tabIndex={0}
                aria-label={`${event.title}, ${event.subtitle}, ${event.dateOnly && event.startsAt ? `${indiaDate.format(event.startsAt)} IST, time to be confirmed` : event.startsAt ? indiaDateTime.format(event.startsAt) + " IST" : event.date}${event.kind === "coach" ? `, ${coachStatus(event.status)}, ${event.duration_minutes || 30} minutes, open Coach session` : ""}`}
              >
                <span className={`calendar-kind ${event.kind}`}>{event.kind === "placement" ? "Interview" : "AI Coach"}</span>
                <strong>{event.title}</strong>
                <small>{event.subtitle}</small>
                <span><Clock size={13} />{event.dateOnly && event.startsAt ? `${indiaDate.format(event.startsAt)} · Time to be confirmed (IST)` : event.startsAt && event.time ? `${indiaDateTime.format(event.startsAt)} IST` : event.date}{event.kind === "placement" && !event.dateOnly && event.startsAt && event.startsAt <= now && (!event.endsAt || event.endsAt > now) ? " · Ongoing" : ""}</span>
                {event.kind === "coach" && <span>{coachStatus(event.status)} · {event.duration_minutes || 30} minutes</span>}
                {event.location && <span><MapPin size={13} />{event.location}</span>}
                {event.kind === "coach" && <span className="calendar-open-label">Open session <ChevronRight size={13} /></span>}
              </article>
            )) : <Empty title="Nothing scheduled">Your upcoming events will appear here.</Empty>}
          </aside>
        </div>
      </ResourceState>
    </div>
  );
}
