import { useState, type FormEvent, type CSSProperties } from 'react';
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, FileText, GraduationCap, Library, Megaphone, RefreshCw, Utensils, Wallet, Building2, type LucideIcon } from 'lucide-react';
import './student-erp.css';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from './auth';
import { Dialog, ErrorMessage, PageHeading, date, dateTime, humanize, useResource } from './ui';

type Row = Record<string, string | number | null>;
type ErpData = { student: { full_name: string; roll_number: string; department_display_name?: string; department_code?: string; batch_label?: string }; items: Row[]; has_more: boolean; summary?: Row; summary_status?: string };
type Service = { id: string; title: string; description: string; columns: [string, string][] };
const SERVICES: Service[] = [
  { id: 'timetable', title: 'Class Timetable', description: 'Your enrolled class schedule.', columns: [['weekday','Day'],['subject','Subject'],['starts_at','Start'],['ends_at','End'],['faculty','Faculty'],['room','Room']] },
  { id: 'attendance', title: 'Attendance', description: 'Your class attendance and eligibility.', columns: [['period','Period'],['starts_on','From'],['ends_on','To'],['days_conducted','Days conducted'],['days_present','Days present'],['hours_present','Hours present'],['percentage','Attendance %'],['eligibility','Eligibility']] },
  { id: 'internal-marks', title: 'Internal Marks', description: 'Your subject assessments.', columns: [['subject','Subject'],['exam','Assessment'],['semester','Semester'],['score','Score'],['maximum','Maximum'],['grade','Grade']] },
  { id: 'semester-marks', title: 'Semester Marks', description: 'Your semester results and grades.', columns: [['subject','Subject'],['exam','Exam'],['semester','Semester'],['score','Score'],['maximum','Maximum'],['grade','Grade']] },
  { id: 'fees', title: 'Fees', description: 'Your fee balance and payments.', columns: [['paid_on','Payment date'],['amount','Amount'],['reference','Reference']] },
  { id: 'homework', title: 'Homework', description: 'Assignments for your class.', columns: [['title','Assignment'],['subject','Subject'],['assigned_on','Assigned'],['due_on','Due'],['faculty','Faculty']] },
  { id: 'circulars', title: 'Circulars', description: 'Notices applicable to you.', columns: [['title','Notice'],['published_on','Published'],['expires_on','Expires']] },
  { id: 'exams', title: 'Exam Schedules', description: 'Exams for your enrolled class.', columns: [['title','Exam'],['subject','Subject'],['exam_date','Date'],['starts_at','Start'],['ends_at','End'],['room','Room']] },
  { id: 'opac', title: 'OPAC Search', description: 'Search your institution’s library.', columns: [['title','Title'],['author','Author'],['accession_number','Accession'],['shelf_location','Shelf'],['status','Availability']] },
  { id: 'hostel-attendance', title: 'Hostel Attendance', description: 'Your hostel check-ins.', columns: [['attendance_date','Date'],['hostel','Hostel'],['room','Room'],['checked_at','Check-in'],['status','Status']] },
  { id: 'mess-attendance', title: 'Mess Attendance', description: 'Your breakfast, lunch and dinner attendance.', columns: [['attendance_date','Date'],['meal','Meal'],['status','Attendance']] },
];
const SERVICE_ICONS: Record<string, LucideIcon> = { timetable:CalendarDays, attendance:ClipboardCheck, 'internal-marks':FileText, 'semester-marks':GraduationCap, fees:Wallet, homework:BookOpen, circulars:Megaphone, exams:CalendarDays, opac:Library, 'hostel-attendance':Building2, 'mess-attendance':Utensils };
const SUMMARY_LABELS: Record<string,string> = { total_fee:'Total fees', amount_paid:'Paid', outstanding_balance:'Balance due', attendance_percentage:'Attendance', hours_conducted:'Hours conducted', hours_present:'Hours present', hours_absent:'Hours absent', days_conducted:'Days conducted', days_present:'Days present', days_absent:'Days absent', semester_gpa:'Semester GPA', overall_cgpa:'CGPA', overall_result:'Result', hours_on_duty:'On duty', eligibility_status:'Eligibility' };

function display(key: string, value: Row[string], currency = 'INR'): string {
  if (value == null || value === '') return '—';
  if (key === 'weekday') return ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][Number(value)] || '—';
  if (key === 'percentage' || key === 'attendance_percentage') return `${value}%`;
  if (['amount','total_fee','amount_paid','outstanding_balance'].includes(key)) return new Intl.NumberFormat('en-IN', { style:'currency', currency }).format(Number(value));
  if (['starts_at','ends_at'].includes(key)) {
    const [hours, minutes] = String(value).split(':');
    return `${Number(hours)%12 || 12}:${minutes} ${Number(hours)<12?'AM':'PM'}`;
  }
  if (key === 'checked_at' || (key === 'as_of_date' && String(value).includes('T'))) return dateTime(String(value));
  if (key.endsWith('_on') || key.endsWith('_date')) return date(String(value));
  if (['status','meal','period','assessment_kind','eligibility','eligibility_status'].includes(key)) return humanize(String(value));
  return String(value);
}

export function StudentErp() {
  const { service } = useParams();
  const student = useAuth().identity?.student;
  const selected = SERVICES.find(item => item.id === service);
  return <div className="student-erp">
    <PageHeading eyebrow="YOUR INSTITUTION RECORDS" title={selected?.title || 'My ERP'}>
      {student?.full_name} · {student?.roll_number} · Records maintained by your institution.
    </PageHeading>
    {!service && <div className="career-grid student-erp-services">{SERVICES.map(item => {
      const Icon = SERVICE_ICONS[item.id];
      return <section className="panel student-erp-service" key={item.id}>
        <span className="student-erp-service-icon"><Icon size={22} aria-hidden="true"/></span>
        <h2>{item.title}</h2><p className="muted">{item.description}</p>
        <Link className="button secondary" to={`/erp/${item.id}`}>View {item.title.toLowerCase()} <ArrowRight size={16} aria-hidden="true"/></Link>
      </section>;
    })}</div>}
    {service && !selected && <section className="panel"><p>This ERP service is unavailable.</p><Link to="/erp">Back to My ERP</Link></section>}
    {selected && <><div className="student-erp-navigation"><Link className="button secondary" to="/erp">← All ERP services</Link><span className="student-erp-readonly">Read-only access</span></div><ServiceView key={selected.id} service={selected}/></>}
  </div>;
}

function ServiceView({service}:{service:Service}) {
  const [semester,setSemester] = useState('');
  const [period,setPeriod] = useState('semester');
  const [attendanceDate,setAttendanceDate] = useState('');
  const [meal,setMeal] = useState('');
  const [search,setSearch] = useState('');
  const [query,setQuery] = useState('');
  const [offset,setOffset] = useState(0);
  const [detail,setDetail] = useState<Row|null>(null);
  const isMarks = service.id.endsWith('-marks');
  const isCampusAttendance = ['hostel-attendance','mess-attendance'].includes(service.id);
  const pageSize = service.id === 'timetable' ? 100 : 25;
  const params = new URLSearchParams({ limit:String(pageSize), offset:String(offset) });
  if (isMarks && semester) params.set('semester',semester);
  if (service.id === 'attendance') params.set('period',period);
  if (isCampusAttendance && attendanceDate) params.set('attendance_date',attendanceDate);
  if (service.id === 'mess-attendance' && meal) params.set('meal',meal);
  if (service.id === 'opac') params.set('q',query);
  const resource = useResource<ErpData>(`/api/student/erp/${service.id}?${params}`);
  const data = resource.data;
  const rawCurrency = String(data?.summary?.currency || 'INR');
  const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : 'INR';
  function submit(event:FormEvent) { event.preventDefault();setQuery(search.trim());setOffset(0); }
  return <>
    {(isMarks || service.id==='attendance' || isCampusAttendance || service.id==='opac') && <section className="panel placement-filter-panel student-erp-toolbar"><div className="placement-filter-grid student-erp-filters">
      {isMarks && <label>Semester<select aria-label="Semester" value={semester} onChange={event=>{setSemester(event.target.value);setOffset(0);}}><option value="">All semesters</option>{Array.from({length:8},(_,index)=><option key={index} value={index+1}>Semester {index+1}</option>)}</select></label>}
      {service.id==='attendance' && <label>Period<select aria-label="Period" value={period} onChange={event=>{setPeriod(event.target.value);setOffset(0);}}>{['today','week','month','semester'].map(value=><option key={value} value={value}>{humanize(value)}</option>)}</select></label>}
      {isCampusAttendance && <label>Date<input type="date" value={attendanceDate} onChange={event=>{setAttendanceDate(event.target.value);setOffset(0);}}/></label>}
      {service.id==='mess-attendance' && <label>Meal<select aria-label="Meal" value={meal} onChange={event=>{setMeal(event.target.value);setOffset(0);}}><option value="">All meals</option>{['breakfast','lunch','dinner','other'].map(value=><option key={value} value={value}>{humanize(value)}</option>)}</select></label>}
    </div>{service.id==='opac' && <form className="career-actions" onSubmit={submit}><label>Book title, author, subject or ISBN<input value={search} maxLength={120} onChange={event=>setSearch(event.target.value)} placeholder="Search your library"/></label><button className="button secondary" type="submit">Search</button></form>}
    </section>}
    {resource.error && <ErrorMessage message={resource.error} retry={resource.reload}/>}
    {resource.loading && <p role="status">Loading your {service.title.toLowerCase()}…</p>}
    {data && <>
      <p className="muted student-erp-context">{[data.student.department_display_name || data.student.department_code, data.student.batch_label].filter(Boolean).join(' · ')}</p>
      {data.summary && <div className="career-grid student-erp-summary">{Object.entries(SUMMARY_LABELS).filter(([key])=>data.summary?.[key]!=null).map(([key,label])=><section className="panel" key={key}><span className="eyebrow">{label}</span><p className="academic-value">{display(key,data.summary![key],currency)}</p></section>)}</div>}
      {data.summary?.as_of_date && <p className="muted">Attendance updated: {display('as_of_date',data.summary.as_of_date)}</p>}
      {data.summary_status==='unavailable' && <p className="muted">Your institution has not provided a summary for this selection.</p>}
      <section className="panel student-erp-records"><div className="student-erp-records-heading"><div><h2>{service.id==='fees'?'Payment history':service.title}</h2><p className="muted">{service.id==='timetable'?'Your weekly schedule · select a class to view details.':'Records for your selection · open a record to view details.'}</p></div><div className="student-erp-record-actions"><button className="button secondary student-erp-view" disabled={resource.loading} onClick={resource.reload}><RefreshCw size={14} aria-hidden="true"/> Refresh</button><span className="student-erp-count">{data.items.length}{data.has_more?'+':''} records</span></div></div>
      {!data.items.length ? <div className="student-erp-empty"><FileText size={28} aria-hidden="true"/><strong>No records available</strong><p>No records are available for this selection. Your institution maintains these records.</p></div> : service.id === 'timetable' ? <WeeklyTimetable rows={data.items} open={setDetail}/> : <div className="academic-table student-erp-table"><table><thead><tr>{service.columns.map(([key,label])=><th key={key} scope="col">{label}</th>)}<th scope="col">Details</th></tr></thead><tbody>{data.items.map((row,index)=><tr key={index}>{service.columns.map(([key])=><td key={key}>{key==='status'?<span className={`pill student-erp-status student-erp-status-${String(row[key]).toLowerCase().replace(/[^a-z]/g,'')}`}>{service.id==='mess-attendance' && ['present','absent'].includes(String(row[key]))?<><span aria-hidden="true">{row[key]==='present'?'✓':'✕'} </span>{display(key,row[key])}</>:display(key,row[key])}</span>:display(key,row[key],currency)}</td>)}<td><button className="button secondary student-erp-view" onClick={()=>setDetail(row)} aria-label={`View ${row.title || row.subject || 'record'} details`}>View</button></td></tr>)}</tbody></table></div>}
      <div className="career-actions student-erp-pagination"><button className="button secondary" disabled={resource.loading || offset===0} onClick={()=>setOffset(value=>Math.max(0,value-pageSize))}>Previous</button><span>Page {offset/pageSize+1}</span><button className="button secondary" disabled={resource.loading || !data.has_more || offset>=10000} onClick={()=>setOffset(value=>value+pageSize)}>Next</button></div>
      </section>
    </>}
    {detail && <Dialog close={()=>setDetail(null)} labelledBy="erp-record-title"><p className="eyebrow">{service.title} · Record details</p><h2 id="erp-record-title">{detail.title || detail.subject || service.title}</h2><dl className="student-erp-details">{Object.entries(detail).filter(([,value])=>value!=null).map(([key,value])=><div key={key}><dt>{service.columns.find(([column])=>column===key)?.[1] || humanize(key)}</dt><dd style={{whiteSpace:'pre-wrap'}}>{display(key,value,currency)}</dd></div>)}</dl><button className="button secondary" onClick={()=>setDetail(null)}>Close</button></Dialog>}
  </>;
}

function WeeklyTimetable({ rows, open }: { rows: Row[]; open: (row: Row) => void }) {
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const slots = [...new Map(rows.map(row => {
    const start = String(row.starts_at || '').slice(0,5);
    const end = String(row.ends_at || '').slice(0,5);
    return [`${start}|${end}`, { key:`${start}|${end}`, start, end }];
  })).values()].sort((a,b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const byCell = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `${row.weekday}|${String(row.starts_at || '').slice(0,5)}|${String(row.ends_at || '').slice(0,5)}`;
    byCell.set(key, [...(byCell.get(key) || []), row]);
  }
  const colors = ['#7c3aed','#0284c7','#059669','#d97706','#db2777','#4f46e5'];
  const subjects = [...new Set(rows.map(row => String(row.subject || 'Class')))];
  return <div className="academic-table erp-timetable-grid-wrap"><table className="erp-timetable-grid" aria-label="Weekly class timetable">
    <thead><tr><th scope="col">Time</th>{days.map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
    <tbody>{slots.map(slot => <tr key={slot.key}>
      <th scope="row"><span className="erp-timetable-time-range">{display('starts_at',slot.start)}<br/><span>– {display('ends_at',slot.end)}</span></span></th>
      {days.map((day,index) => <td key={day}>{(byCell.get(`${index}|${slot.key}`) || []).map((row,rowIndex) => {
        const color = colors[subjects.indexOf(String(row.subject || 'Class')) % colors.length];
        return <button key={rowIndex} className="erp-timetable-class" style={{'--class-color':color} as CSSProperties} onClick={()=>open(row)} aria-label={`Open ${row.subject || 'class'}, ${day}, ${display('starts_at',slot.start)} to ${display('ends_at',slot.end)}`}>
          <strong>{row.subject || 'Class'}</strong>
          {row.faculty && <small>{row.faculty}</small>}
          {row.room && <small>Room {row.room}</small>}
          <span className="erp-timetable-class-detail">View details <ArrowRight size={12} aria-hidden="true"/></span>
        </button>;
      })}</td>)}
    </tr>)}</tbody>
  </table></div>;
}
