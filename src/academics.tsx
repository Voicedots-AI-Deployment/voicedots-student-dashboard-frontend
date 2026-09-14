import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from './api';
import { ErrorMessage, PageHeading, useResource } from './ui';
import { download } from './career-profile';

type Attendance = {period_start:string;period_end:string;hours_conducted:number|null;hours_present:number|null;hours_absent:number|null;percentage:number|null;source_file:string;subjects:{subject:string;reported_value:unknown}[]};
type AcademicData = {status:string;message?:string;source_name?:string;source_updated_at?:string;notice?:string;attendance?:Attendance[];attendance_needs_review?:boolean;marks_reports?:{report_id:string;title:string;page_number:number}[]};
function date(value:string){return new Date(`${value}T00:00:00`).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}
function percentage(value:number|null|undefined){return value==null?'Not supplied':`${Number(value.toFixed(2))}%`}

export function AcademicOverview(){
 const resource=useResource<AcademicData>('/api/student/academics'),data=resource.data,attendance=data?.attendance?.[0];
 return <section className="panel academic-overview"><div><span className="eyebrow">YOUR ACADEMIC RECORDS</span><h2>Marks and attendance</h2><p className="muted">{resource.loading?'Loading your academic records…':data?.status==='connected'?data.source_name:data?.message||'View the academic records linked to your account.'}</p></div>{resource.error&&<ErrorMessage message={resource.error} retry={resource.reload}/>}{data?.status==='connected'&&<div className="career-grid"><div><strong className="academic-value">{percentage(attendance?.percentage)}</strong><p>Attendance {attendance&&`· ${date(attendance.period_start)} – ${date(attendance.period_end)}`}</p></div><div><strong className="academic-value">{data.marks_reports?.length||0}</strong><p>Marks report sections available</p></div></div>}<Link className="button secondary" to="/academics">View marks and attendance →</Link></section>
}

export function Academics(){
 const resource=useResource<AcademicData>('/api/student/academics'),data=resource.data;
 const [period,setPeriod]=useState(''),[selected,setSelected]=useState('');
 const reports=data?.marks_reports||[],attendance=data?.attendance||[];
 const current=attendance.find(a=>`${a.period_start}:${a.period_end}`===period)||attendance[0];
 const report=reports.find(r=>r.report_id===selected)||reports[0];
 return <><PageHeading eyebrow="YOUR ACADEMIC PROGRESS" title="Marks and attendance">Your own academic records, linked to your registered roll number.</PageHeading>
 {resource.error&&<ErrorMessage message={resource.error} retry={resource.reload}/>}
 {resource.loading&&<p role="status">Loading your records…</p>}
 {data&&data.status!=='connected'&&<section className="panel"><h2>Academic records</h2><p>{data.message}</p></section>}
 {data?.status==='connected'&&<><section className="panel"><h2>{data.source_name}</h2><p className="muted">{data.notice}</p></section>
 <section className="panel"><h2>Attendance</h2>{attendance.length>1&&<label>Attendance period<select value={period||`${current.period_start}:${current.period_end}`} onChange={e=>setPeriod(e.target.value)}>{attendance.map(a=><option key={`${a.period_start}:${a.period_end}`} value={`${a.period_start}:${a.period_end}`}>{date(a.period_start)} – {date(a.period_end)}</option>)}</select></label>}
 {data.attendance_needs_review&&<p role="status">Some attendance records need reconciliation by your academic team and are not shown as confirmed totals.</p>}
 {current?<><p>{date(current.period_start)} – {date(current.period_end)} · Cumulative attendance</p><div className="career-grid academic-stats">{[['Attendance',percentage(current.percentage)],['Hours conducted',current.hours_conducted??'Not supplied'],['Hours present',current.hours_present??'Not supplied'],['Hours absent',current.hours_absent??'Not supplied']].map(([label,value])=><div key={label}><span className="academic-value">{value}</span><p>{label}</p></div>)}</div>
 {current.subjects.length>0&&<><h3>Subject attendance</h3><p className="muted">Values and units are shown as reported in the source export.</p><div className="academic-table"><table><thead><tr><th>Subject / source heading</th><th>Reported value</th></tr></thead><tbody>{current.subjects.map((s,i)=><tr key={i}><td>{s.subject}</td><td>{s.reported_value==null?'Not supplied':String(s.reported_value)}</td></tr>)}</tbody></table></div></>}<p className="muted">Source: {current.source_file}</p></>:<p>No verified attendance export is available for your roll number yet.</p>}</section>
 <section className="panel"><h2>Marks reports</h2><p className="muted">These are your original verified academic report sections. Check the semester printed inside the report; a source filename may differ. Older attendance printed here does not replace the separate cumulative attendance above.</p>
 {report?<><label>Choose a marks report<select value={report.report_id} onChange={e=>setSelected(e.target.value)}>{reports.map(r=><option key={r.report_id} value={r.report_id}>{r.title} · Page {r.page_number}</option>)}</select></label><ReportImage key={report.report_id} id={report.report_id} title={report.title}/></>:<p>No verified marks report is available for your roll number yet.</p>}</section></>}
 </>
}

function ReportImage({id,title}:{id:string;title:string}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{const controller=new AbortController();let objectUrl='';setUrl('');setError('');request(`/api/student/academics/reports/${encodeURIComponent(id)}`,{signal:controller.signal}).then(r=>r.blob()).then(blob=>{if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}},[id,version]);
 return <div>{error&&<ErrorMessage message={error} retry={()=>setVersion(v=>v+1)}/>} {!url&&!error&&<p role="status">Loading your marks report…</p>}{url&&<><div className="career-actions"><button className="button secondary" onClick={()=>void download(`/api/student/academics/reports/${encodeURIComponent(id)}`,'My-marks-report.png').catch(e=>setError(e.message))}>Download report</button></div><div className="academic-report"><img src={url} alt={`Your marks report: ${title}`}/></div></>}</div>
}
