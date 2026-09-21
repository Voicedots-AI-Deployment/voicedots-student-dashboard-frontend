import { CalendarDays, Clock, MapPin } from "lucide-react";
import { type Drive } from "./api";
import { dateTime, Empty, PageHeading, ResourceState, useResource } from "./ui";

export function Calendar() {
  const drives = useResource<Drive[]>("/api/student/drives");
  const events = (drives.data || []).filter(d => d.window_start_at || d.drive_date).sort((a,b) => String(a.window_start_at || a.drive_date).localeCompare(String(b.window_start_at || b.drive_date)));
  return <div className="calendar-page">
    <PageHeading eyebrow="YOUR SCHEDULE" title="Calendar">Keep track of placement interviews and important interview windows.</PageHeading>
    <ResourceState resource={drives}>
      {events.length ? <section className="panel calendar-events"><div className="calendar-events-header"><div><span className="eyebrow">UPCOMING</span><h2>Placement schedule</h2></div><CalendarDays size={24}/></div>{events.map(drive => <article className="calendar-event" key={drive.id}><div className="calendar-event-date"><CalendarDays size={18}/><span>{drive.window_start_at ? dateTime(drive.window_start_at) : "Date to be confirmed"}</span></div><div className="calendar-event-main"><strong>{drive.role_title}</strong><span>{drive.company_name}</span><div className="calendar-event-meta">{drive.location && <span><MapPin size={14}/>{drive.location}</span>}{drive.window_end_at && <span><Clock size={14}/>Until {dateTime(drive.window_end_at)}</span>}</div></div></article>)}</section> : <Empty title="Your calendar is clear">Placement interview windows will appear here when they are published.</Empty>}
    </ResourceState>
  </div>;
}
