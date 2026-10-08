import {
  ArrowRight, ChevronLeft, ChevronRight, Clock,
  ExternalLink, MapPin, MoreHorizontal, Pencil, Plus, Search, Trash2, X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Drive, type Report } from "./api";
import { Dialog, Empty, ErrorMessage, PageHeading, ResourceState, useResource } from "./ui";

type Kind = "placement" | "coach" | "personal";
type CategoryFilter = "all" | "interviews" | "coach" | "personal";
type CalendarView = "month" | "week" | "day" | "agenda";
type PersonalEvent = {
  id: string; title: string; category: "personal" | "study" | "reminder";
  start_at: string; end_at: string; all_day: boolean; location?: string | null;
  meeting_url?: string | null; description?: string | null; reminder_minutes?: number | null;
};
type CalendarEvent = {
  id: string; kind: Kind; date: string; title: string; subtitle: string;
  startsAt?: number; endsAt?: number; dateOnly?: boolean; location?: string;
  status?: string; durationMinutes?: number; plan_id?: string; session_id?: string;
  cycle_id?: string; session_type?: string; interviewAction?: string;
  interviewResumeAvailable?: boolean; resultAvailable?: boolean; personal?: PersonalEvent;
};

const IST = "Asia/Kolkata";
const indiaTime = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
const indiaLongDate = new Intl.DateTimeFormat("en-GB", { timeZone: IST, weekday: "short", day: "numeric", month: "short", year: "numeric" });
const categoryNames: Record<string, string> = { personal: "Personal", study: "Study", reminder: "Reminder", placement: "Interview", coach: "AI Coach" };

function indiaDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}
function dayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function dateFromKey(key: string) { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); }
function dayEnd(key: string) { return Date.parse(`${key}T23:59:59+05:30`); }
function monthLabel(value: Date) { return value.toLocaleDateString(undefined, { month: "long", year: "numeric" }); }
function shortDate(key: string) { return indiaLongDate.format(new Date(`${key}T12:00:00+05:30`)); }
function timeRange(event: CalendarEvent) {
  if (event.personal?.all_day) return "All day";
  if (event.dateOnly) return "Time to be confirmed (IST)";
  if (!event.startsAt) return event.dateOnly ? "Time to be confirmed" : shortDate(event.date);
  const start = indiaTime.format(event.startsAt);
  return event.endsAt ? `${start} – ${indiaTime.format(event.endsAt)} IST` : `${start} IST`;
}
function eventDescription(event: CalendarEvent) {
  return event.personal?.description || (event.kind === "coach" ? "Open this saved AI Coach activity to continue your preparation." : event.kind === "placement" ? "View the placement opportunity for current interview status and available actions." : "");
}
function coachStatus(status?: string) {
  if (!status) return "Scheduled";
  return ({ completed: "Completed", cancelled: "Cancelled", canceled: "Cancelled", in_progress: "In progress", validation: "Validation", practice: "Practice", teaching: "Teaching" } as Record<string, string>)[status] || "Scheduled";
}
function placementStatus(status?: string) {
  return ({ open: "Open now", upcoming: "Scheduled", in_progress: "In progress", completed: "Completed", expired: "Expired", closed: "Closed", awaiting_assignment: "Awaiting assignment", blocked: "Not available" } as Record<string, string>)[status || ""] || "Placement interview";
}
function initialFormDate() { return indiaDateParts(); }
function plusOneDay(key: string) { const value = dateFromKey(key); value.setDate(value.getDate() + 1); return dayKey(value); }
function localIso(date: string, time: string) { return new Date(`${date}T${time}:00+05:30`).toISOString(); }

export function Calendar() {
  const drives = useResource<Drive[]>("/api/student/drives");
  const coach = useResource<{ events: Array<Record<string, unknown> & { id: string; date: string; title: string; subtitle: string; time?: string; duration_minutes?: number; kind: "coach" }> }>("/api/student/coach/calendar");
  const personalResource = useResource<{ events: PersonalEvent[] }>("/api/student/calendar/personal-events");
  const reports = useResource<{ reports: Report[] }>("/api/student/reports");
  const navigate = useNavigate();
  const today = indiaDateParts();
  const [month, setMonth] = useState(() => { const [year, monthNumber] = today.split("-").map(Number); return new Date(year, monthNumber - 1, 1); });
  const [view, setView] = useState<CalendarView>("month");
  const [selectedDay, setSelectedDay] = useState("");
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([]);
  const [formEvent, setFormEvent] = useState<PersonalEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PersonalEvent | null>(null);
  const [menuId, setMenuId] = useState("");
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [allDay, setAllDay] = useState(false);

  useEffect(() => {
    if (personalResource.data) setPersonalEvents(personalResource.data.events || []);
  }, [personalResource.data]);

  const events = useMemo<CalendarEvent[]>(() => [
    ...(drives.data || []).flatMap((drive) => {
      const key = drive.window_start_at || drive.drive_date;
      if (!key) return [];
      const date = /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : indiaDateParts(new Date(key));
      const startsAt = drive.window_start_at ? Date.parse(drive.window_start_at) : drive.drive_date ? Date.parse(`${drive.drive_date}T00:00:00+05:30`) : undefined;
      const endsAt = drive.window_end_at ? Date.parse(drive.window_end_at) : !drive.window_start_at && drive.drive_date ? dayEnd(drive.drive_date) : undefined;
      return [{ id: drive.id, kind: "placement" as const, date, title: drive.role_title, subtitle: drive.company_name, startsAt, endsAt, dateOnly: !drive.window_start_at, location: drive.location, status: drive.interview_status || drive.status, interviewAction: drive.interview_action, interviewResumeAvailable: drive.main_resume_available !== false, resultAvailable: drive.interview_result_available }];
    }),
    ...(coach.data?.events || []).map((item) => {
      const event = item as { id: string; date: string; title: string; subtitle: string; time?: string; duration_minutes?: number; status?: string; plan_id?: string; session_id?: string; cycle_id?: string; session_type?: string };
      const date = /^\d{4}-\d{2}-\d{2}$/.test(event.date) ? event.date : indiaDateParts(new Date(event.date));
      const startsAt = event.time ? Date.parse(event.time) : Date.parse(`${date}T00:00:00+05:30`);
      return { ...event, kind: "coach" as const, date, startsAt, endsAt: event.time ? startsAt + (event.duration_minutes || 30) * 60000 : dayEnd(date), durationMinutes: event.duration_minutes || 30 };
    }),
    ...personalEvents.map((item) => ({ id: item.id, kind: "personal" as const, date: indiaDateParts(new Date(item.start_at)), title: item.title, subtitle: item.category, startsAt: Date.parse(item.start_at), endsAt: Date.parse(item.end_at), location: item.location || undefined, status: "Personal event", personal: item })),
  ].sort((left, right) => (left.startsAt ?? Number.MAX_SAFE_INTEGER) - (right.startsAt ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id)), [drives.data, coach.data, personalEvents]);

  const filteredEvents = useMemo(() => events.filter((event) => {
    const categoryMatches = filter === "all" || (filter === "interviews" && event.kind === "placement") || (filter === "coach" && event.kind === "coach") || (filter === "personal" && event.kind === "personal");
    const searchable = [event.title, event.subtitle, categoryNames[event.kind], event.personal?.category, event.location].filter(Boolean).join(" ").toLowerCase();
    return categoryMatches && searchable.includes(search.trim().toLowerCase());
  }), [events, filter, search]);

  const days = useMemo(() => {
    if (view === "day") return [dateFromKey(selectedDay || today)];
    if (view === "week") {
      const base = dateFromKey(selectedDay || today); base.setDate(base.getDate() - base.getDay());
      return Array.from({ length: 7 }, (_, index) => { const date = new Date(base); date.setDate(base.getDate() + index); return date; });
    }
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  }, [view, selectedDay, today, month]);

  const agendaGroups = useMemo(() => {
    if (selectedDay) return [{ key: selectedDay, title: shortDate(selectedDay), events: filteredEvents.filter((event) => event.date === selectedDay) }];
    const todayDate = dateFromKey(today); const tomorrowDate = new Date(todayDate); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const weekEnd = new Date(todayDate); weekEnd.setDate(todayDate.getDate() + 7);
    const future = filteredEvents.filter((event) => event.date >= today);
    const todayEvents = future.filter((event) => event.date === today);
    const tomorrow = future.filter((event) => event.date === dayKey(tomorrowDate));
    const thisWeek = future.filter((event) => event.date > dayKey(tomorrowDate) && dateFromKey(event.date) < weekEnd);
    const upcoming = future.filter((event) => dateFromKey(event.date) >= weekEnd);
    return [
      { key: "today", title: `Today · ${shortDate(today)}`, events: todayEvents },
      { key: "tomorrow", title: `Tomorrow · ${shortDate(dayKey(tomorrowDate))}`, events: tomorrow },
      { key: "week", title: "This week", events: thisWeek },
      { key: "upcoming", title: "Upcoming", events: upcoming },
    ].filter((group) => group.events.length > 0);
  }, [filteredEvents, selectedDay, today]);

  function openCalendarEvent(event: CalendarEvent) { setMenuId(""); setDetail(event); }
  function openSystemEvent(event: CalendarEvent) {
    setDetail(null);
    if (event.kind === "placement") { navigate(`/placements?drive=${encodeURIComponent(event.id)}`); return; }
    if (event.kind === "coach" && event.cycle_id && event.session_type === "validation") { navigate(`/practice?coach_cycle=${encodeURIComponent(event.cycle_id)}`); return; }
    if (event.kind === "coach" && event.plan_id && event.cycle_id) { navigate(`/coach/session?plan=${encodeURIComponent(event.plan_id)}&cycle=${encodeURIComponent(event.cycle_id)}`); return; }
    if (event.kind === "coach" && event.plan_id && event.session_id) { navigate(`/coach?plan=${encodeURIComponent(event.plan_id)}&session=${encodeURIComponent(event.session_id)}&stage=coach`); return; }
    setMutationError("This older Coach event is not linked to a specific session. Open AI Coach to choose a session.");
  }
  function shiftPeriod(direction: number) {
    if (view === "day") { const date = dateFromKey(selectedDay || today); date.setDate(date.getDate() + direction); setSelectedDay(dayKey(date)); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); return; }
    if (view === "week") { const date = dateFromKey(selectedDay || today); date.setDate(date.getDate() + direction * 7); setSelectedDay(dayKey(date)); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); return; }
    setMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1));
  }
  function goToday() { setSelectedDay(today); setMonth(dateFromKey(today)); }
  function selectDay(key: string) { setSelectedDay(key); setMonth(new Date(dateFromKey(key).getFullYear(), dateFromKey(key).getMonth(), 1)); }
  function periodTitle() {
    if (view === "month" || view === "agenda") return monthLabel(month);
    if (view === "day") return shortDate(selectedDay || today);
    const start = days[0]; const end = days[days.length - 1];
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  function beginCreate() { setMutationError(""); setFormEvent(null); setAllDay(false); setCreating(true); }
  function beginEdit(event: PersonalEvent) { setMutationError(""); setMenuId(""); setCreating(false); setAllDay(event.all_day); setFormEvent(event); setDetail(null); }
  async function savePersonalEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMutationError("");
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date") || ""); const allDayValue = allDay;
    const startTime = allDayValue ? "00:00" : String(form.get("start_time") || "");
    const endTime = allDayValue ? "00:00" : String(form.get("end_time") || "");
    const endDate = allDayValue ? plusOneDay(date) : date;
    const payload = {
      title: String(form.get("title") || "").trim(), category: String(form.get("category") || "personal"),
      start_at: localIso(date, startTime), end_at: localIso(endDate, endTime), all_day: allDayValue,
      location: String(form.get("location") || "").trim() || null,
      meeting_url: String(form.get("meeting_url") || "").trim() || null,
      description: String(form.get("description") || "").trim() || null,
      reminder_minutes: form.get("reminder_minutes") ? Number(form.get("reminder_minutes")) : null,
    };
    try {
      const result = creating
        ? await api<{ event: PersonalEvent }>("/api/student/calendar/personal-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await api<{ event: PersonalEvent }>(`/api/student/calendar/personal-events/${encodeURIComponent(formEvent!.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setPersonalEvents((current) => creating ? [...current, result.event] : current.map((item) => item.id === result.event.id ? result.event : item));
      setCreating(false); setFormEvent(null);
    } catch (error) { setMutationError(error instanceof Error ? error.message : "Could not save this event."); }
    finally { setSaving(false); }
  }
  async function deletePersonalEvent() {
    if (!deleteTarget) return;
    setSaving(true); setMutationError("");
    try {
      await api(`/api/student/calendar/personal-events/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      setPersonalEvents((current) => current.filter((item) => item.id !== deleteTarget.id)); setDeleteTarget(null); setDetail(null);
    } catch (error) { setMutationError(error instanceof Error ? error.message : "Could not delete this event."); }
    finally { setSaving(false); }
  }
  function resultFor(event: CalendarEvent) { return event.resultAvailable ? (reports.data?.reports || []).find((report) => report.drive_id === event.id && report.submission_id && !["held_for_review", "processing", "failed"].includes(report.status)) : undefined; }
  function eventPrimaryAction(event: CalendarEvent) {
    if (event.kind === "personal") {
      if (event.personal?.meeting_url) window.open(event.personal.meeting_url, "_blank", "noopener,noreferrer");
      setDetail(null); return;
    }
    openSystemEvent(event);
  }
  function eventActionLabel(event: CalendarEvent) {
    if (event.kind === "placement") return event.interviewResumeAvailable && event.interviewAction === "resume" ? "Continue interview" : event.interviewResumeAvailable && ["start", "retry_preparation"].includes(event.interviewAction || "") ? "Join / Continue" : "View opportunity";
    if (event.kind === "coach") return "Open session";
    return event.personal?.meeting_url ? "Open meeting" : "View event";
  }
  function eventCard(event: CalendarEvent) {
    const result = event.kind === "placement" ? resultFor(event) : undefined;
    return <article className={`calendar-event-card ${event.kind}`} key={`${event.kind}-${event.id}`}>
      <button type="button" className="calendar-card-main" onClick={() => openCalendarEvent(event)} aria-label={`View ${event.title}`}>
        <span className={`calendar-kind ${event.kind}`}>{categoryNames[event.personal?.category || event.kind]}</span>
        <strong>{event.title}</strong>
        <span className="calendar-event-subtitle">{event.kind === "placement" ? event.subtitle : event.kind === "coach" ? event.subtitle : event.personal?.category === "study" ? "Study" : event.personal?.category === "reminder" ? "Reminder" : "Personal event"}</span>
        <span className="calendar-card-meta"><Clock size={14}/>{timeRange(event)}</span>
        {event.location && <span className="calendar-card-meta"><MapPin size={14}/>{event.location}</span>}
        {event.kind === "coach" && !event.location && <span className="calendar-card-meta">Online session</span>}
        {event.personal?.description && <span className="calendar-event-note">{event.personal.description}</span>}
        {event.kind === "coach" && <span className="calendar-event-state">{coachStatus(event.status)}{event.durationMinutes ? ` · ${event.durationMinutes} min` : ""}</span>}
        {event.kind === "placement" && <span className="calendar-event-state">{placementStatus(event.status)}</span>}
      </button>
      <div className="calendar-card-actions">
        <button type="button" className="calendar-card-action" onClick={() => eventPrimaryAction(event)}>{eventPrimaryActionLabel(event)}<ArrowRight size={14}/></button>
        {result && <Link className="calendar-result-link" to={`/reports?submission=${encodeURIComponent(result.submission_id)}`}>View result</Link>}
        {event.kind === "personal" && <div className="calendar-menu-wrap">
          <button type="button" className="calendar-more-button" aria-label={`More actions for ${event.title}`} aria-expanded={menuId === event.id} onClick={() => setMenuId(menuId === event.id ? "" : event.id)}><MoreHorizontal size={18}/></button>
          {menuId === event.id && <div className="calendar-event-menu" role="menu"><button role="menuitem" onClick={() => beginEdit(event.personal!)}><Pencil size={14}/>Edit</button><button role="menuitem" className="delete" onClick={() => { setDeleteTarget(event.personal!); setMenuId(""); }}><Trash2 size={14}/>Delete</button></div>}
        </div>}
      </div>
    </article>;
  }
  function eventPrimaryActionLabel(event: CalendarEvent) { return eventActionLabel(event); }

  const resourceError = drives.error || coach.error || personalResource.error || reports.error;
  const retryResources = () => { drives.reload(); coach.reload(); personalResource.reload(); reports.reload(); };
  const eventsForDay = (key: string) => filteredEvents.filter((event) => event.date === key);

  return <div className="calendar-page">
    <PageHeading eyebrow="YOUR SCHEDULE" title="Calendar" action={<button className="button primary calendar-create-button" onClick={beginCreate} disabled={personalResource.loading}><Plus size={17}/>Create Event</button>}>
      Interviews, AI Coach and personal events in one place.
    </PageHeading>
    {resourceError && <ErrorMessage message={resourceError} retry={retryResources}/>}
    {mutationError && <ErrorMessage message={mutationError} retry={undefined}/>}
    <ResourceState resource={drives}>
      <div className="calendar-layout">
        <section className="panel calendar-agenda" aria-label="Calendar events">
          <div className="calendar-agenda-heading"><div><span className="eyebrow">YOUR SCHEDULE</span><h2>Events</h2></div><span className="calendar-count">{filteredEvents.length} {filteredEvents.length === 1 ? "event" : "events"}</span></div>
          <div className="calendar-filter-row" role="group" aria-label="Filter events">
            {([ ["all", "All"], ["interviews", "Interviews"], ["coach", "AI Coach"], ["personal", "Personal"] ] as const).map(([key, label]) => <button key={key} className={filter === key ? "selected" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          <label className="calendar-search"><Search size={16}/><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events…" aria-label="Search events"/>{search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><X size={14}/></button>}</label>
          {selectedDay && <div className="calendar-date-filter"><span>Showing {shortDate(selectedDay)}</span><button onClick={() => setSelectedDay("")}>Show upcoming</button></div>}
          {personalResource.loading ? <div className="calendar-agenda-loading" role="status">Loading your personal events…</div> : agendaGroups.length ? <div className="calendar-agenda-list">
            {agendaGroups.map((group) => <section className="calendar-agenda-group" key={group.key}><h3>{group.title}</h3>{group.events.map(eventCard)}</section>)}
          </div> : <Empty title={search || selectedDay ? "No matching events" : "Nothing on your schedule yet"}>{search ? "Try another title, role, company, or category." : selectedDay ? "There are no events on this date." : "Placement interviews, Coach sessions and your personal events will appear here."}</Empty>}
        </section>
        <section className="panel calendar-month" aria-label="Calendar view">
          <header className="calendar-toolbar">
            <div className="calendar-period-controls"><button className="calendar-today-button" onClick={goToday}>Today</button><button className="icon-button" aria-label="Previous period" onClick={() => shiftPeriod(-1)}><ChevronLeft size={17}/></button><button className="icon-button" aria-label="Next period" onClick={() => shiftPeriod(1)}><ChevronRight size={17}/></button><h2>{periodTitle()}</h2></div>
            <div className="calendar-view-switcher" role="group" aria-label="Calendar view">{(["month", "week", "day", "agenda"] as CalendarView[]).map((item) => <button key={item} className={view === item ? "selected" : ""} aria-pressed={view === item} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
          </header>
          {view === "agenda" ? <div className="calendar-agenda-view">{days.map((day) => { const key = dayKey(day); const items = eventsForDay(key); return <button className={`calendar-agenda-date ${key === today ? "today" : ""}`} key={key} onClick={() => { selectDay(key); setView("day"); }}>{<><span>{shortDate(key)}</span><b>{items.length ? items.map((event) => event.title).join(" · ") : "No events"}</b></>}</button>; })}</div> : <>
            <div className="calendar-weekdays">{days.length === 1 ? <span>{shortDate(dayKey(days[0]))}</span> : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className={`calendar-grid ${view === "week" ? "week" : ""} ${view === "day" ? "day" : ""}`}>
              {days.map((day) => {
                const key = dayKey(day); const dayEvents = eventsForDay(key); const outside = view === "month" && day.getMonth() !== month.getMonth();
                return <div role="button" tabIndex={0} className={`calendar-day${outside ? " outside" : ""}${key === today ? " today" : ""}${key === selectedDay ? " selected" : ""}`} key={key} aria-label={`${shortDate(key)}${dayEvents.length ? `, ${dayEvents.length} events` : ""}`} onClick={() => selectDay(key)} onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" || keyEvent.key === " ") { keyEvent.preventDefault(); selectDay(key); } }}>
                  <span className="calendar-day-number">{day.getDate()}</span>
                  <span className="calendar-day-events">{dayEvents.slice(0, view === "day" ? 12 : 2).map((event) => <button type="button" className={`calendar-chip ${event.kind}`} title={`${event.title} · ${timeRange(event)}`} key={event.id} onClick={(click) => { click.stopPropagation(); openCalendarEvent(event); }} onKeyDown={(keyEvent) => keyEvent.stopPropagation()} aria-label={`View ${event.title}`}><small>{event.personal?.all_day ? "All day" : event.dateOnly ? "Time TBC" : event.startsAt ? indiaTime.format(event.startsAt) : "Time TBC"}</small><b>{event.title}</b></button>)}{dayEvents.length > (view === "day" ? 12 : 2) && <span className="calendar-more-events">+{dayEvents.length - (view === "day" ? 12 : 2)} more</span>}</span>
                </div>;
              })}
            </div>
          </>}
          <div className="calendar-legend"><span><i className="placement"/>Interview</span><span><i className="coach"/>AI Coach</span><span><i className="personal"/>Personal</span></div>
        </section>
      </div>
    </ResourceState>

    {(creating || formEvent) && <Dialog labelledBy="calendar-event-form-title" close={() => { setCreating(false); setFormEvent(null); setMutationError(""); }} className="calendar-dialog">
      <form onSubmit={savePersonalEvent}>
        <header className="calendar-dialog-header"><div><span className="eyebrow">PERSONAL SCHEDULE</span><h2 id="calendar-event-form-title">{creating ? "Create event" : "Edit event"}</h2></div><button type="button" className="icon-button" aria-label="Close event form" onClick={() => { setCreating(false); setFormEvent(null); }}><X size={18}/></button></header>
        {mutationError && <p className="calendar-form-error" role="alert">{mutationError}</p>}
        <label className="calendar-form-field full">Event title *<input name="title" required maxLength={160} defaultValue={formEvent?.title || ""} placeholder="What do you want to do?"/></label>
        <label className="calendar-form-field">Date *<input name="date" type="date" required defaultValue={formEvent ? indiaDateParts(new Date(formEvent.start_at)) : selectedDay || initialFormDate()}/></label>
        <label className="calendar-form-field calendar-all-day"><span><strong>All day</strong><small>Hide times for an event that lasts the whole day</small></span><input name="all_day" type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)}/></label>
        {!allDay && <label className="calendar-form-field">Start time *<input name="start_time" type="time" required defaultValue={formEvent && !formEvent.all_day ? indiaTime.format(new Date(formEvent.start_at)).replace(/\s/g, "").replace(/(\d+):(\d+)(am|pm)/i, (_m, h, m, half) => `${String((Number(h) % 12) + (half.toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${m}`) : "18:30"}/></label>}
        {!allDay && <label className="calendar-form-field">End time *<input name="end_time" type="time" required defaultValue={formEvent && !formEvent.all_day ? indiaTime.format(new Date(formEvent.end_at)).replace(/\s/g, "").replace(/(\d+):(\d+)(am|pm)/i, (_m, h, m, half) => `${String((Number(h) % 12) + (half.toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${m}`) : "19:30"}/></label>}
        <label className="calendar-form-field">Category<select name="category" defaultValue={formEvent?.category || "personal"}><option value="personal">Personal</option><option value="study">Study</option><option value="reminder">Reminder</option></select></label>
        <label className="calendar-form-field">Reminder<select name="reminder_minutes" defaultValue={formEvent?.reminder_minutes ?? ""}><option value="">None</option><option value="10">10 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></label>
        <label className="calendar-form-field full">Location<input name="location" maxLength={240} defaultValue={formEvent?.location || ""} placeholder="Location or room"/></label>
        <label className="calendar-form-field full">Meeting link<input name="meeting_url" type="url" maxLength={500} defaultValue={formEvent?.meeting_url || ""} placeholder="https://…"/></label>
        <label className="calendar-form-field full">Description / notes<textarea name="description" rows={3} maxLength={4000} defaultValue={formEvent?.description || ""} placeholder="Add a note for yourself"/></label>
        <footer className="calendar-dialog-actions"><button className="button secondary" type="button" onClick={() => { setCreating(false); setFormEvent(null); }}>Cancel</button><button className="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : creating ? "Create event" : "Save changes"}</button></footer>
      </form>
    </Dialog>}

    {detail && <Dialog labelledBy="calendar-event-detail-title" close={() => setDetail(null)} className="calendar-dialog calendar-detail-dialog">
      <header className="calendar-dialog-header"><div><span className={`calendar-kind ${detail.kind}`}>{categoryNames[detail.personal?.category || detail.kind]}</span><h2 id="calendar-event-detail-title">{detail.title}</h2><p>{detail.kind === "placement" ? detail.subtitle : detail.kind === "coach" ? detail.subtitle : "Personal event"}</p></div><button type="button" className="icon-button" aria-label="Close event details" onClick={() => setDetail(null)}><X size={18}/></button></header>
      <dl className="calendar-detail-list"><div><dt>Date</dt><dd>{shortDate(detail.date)}</dd></div><div><dt>Time</dt><dd>{timeRange(detail)}</dd></div>{detail.kind === "coach" && <div><dt>Status</dt><dd>{coachStatus(detail.status)}{detail.durationMinutes ? ` · ${detail.durationMinutes} minutes` : ""}</dd></div>}{detail.kind === "placement" && <div><dt>Interview status</dt><dd>{placementStatus(detail.status)}</dd></div>}{detail.location && <div><dt>Location</dt><dd>{detail.location}</dd></div>}{detail.kind === "coach" && !detail.location && <div><dt>Location</dt><dd>Online session</dd></div>}{detail.personal && <div><dt>Reminder</dt><dd>{detail.personal.reminder_minutes == null ? "None" : detail.personal.reminder_minutes === 1440 ? "1 day before" : detail.personal.reminder_minutes >= 60 ? `${detail.personal.reminder_minutes / 60} hour${detail.personal.reminder_minutes > 60 ? "s" : ""} before` : `${detail.personal.reminder_minutes} minutes before`}</dd></div>}{detail.personal?.meeting_url && <div><dt>Meeting link</dt><dd><a href={detail.personal.meeting_url} target="_blank" rel="noopener noreferrer">Open meeting link <ExternalLink size={14}/></a></dd></div>}<div className="description"><dt>Description</dt><dd>{eventDescription(detail) || "No notes added."}</dd></div></dl>
      <footer className="calendar-dialog-actions">{detail.kind === "personal" ? <><button className="button secondary calendar-danger" onClick={() => { setDeleteTarget(detail.personal!); setDetail(null); }}>Delete</button><button className="button secondary" onClick={() => beginEdit(detail.personal!)}><Pencil size={15}/>Edit</button>{detail.personal?.meeting_url && <button className="button primary" onClick={() => eventPrimaryAction(detail)}>Open meeting<ArrowRight size={15}/></button>}</> : <><button className="button secondary" onClick={() => setDetail(null)}>Close details</button><button className="button primary" onClick={() => eventPrimaryAction(detail)}>{eventActionLabel(detail)}<ArrowRight size={15}/></button></>}</footer>
    </Dialog>}

    {deleteTarget && <Dialog labelledBy="calendar-delete-title" close={() => setDeleteTarget(null)} className="calendar-dialog calendar-delete-dialog">
      <header className="calendar-dialog-header"><div><span className="eyebrow">DELETE PERSONAL EVENT</span><h2 id="calendar-delete-title">Delete this event?</h2><p>{deleteTarget.title}</p></div><button type="button" className="icon-button" aria-label="Close delete confirmation" onClick={() => setDeleteTarget(null)}><X size={18}/></button></header>
      {mutationError && <p className="calendar-form-error" role="alert">{mutationError}</p>}
      <p className="calendar-delete-copy">This removes the event from your calendar. This cannot be undone.</p>
      <footer className="calendar-dialog-actions"><button className="button secondary" onClick={() => setDeleteTarget(null)}>Cancel</button><button className="button primary calendar-delete-confirm" disabled={saving} onClick={() => void deletePersonalEvent()}>{saving ? "Deleting…" : "Delete event"}</button></footer>
    </Dialog>}
  </div>;
}
