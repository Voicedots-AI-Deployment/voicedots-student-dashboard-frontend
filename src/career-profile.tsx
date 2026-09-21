import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, json, request, Resume } from './api';
import { useAuth } from './auth';
import { ErrorMessage, useResource } from './ui';
export async function download(path:string, name:string, options?:RequestInit) {
  const response=await request(path,options); const url=URL.createObjectURL(await response.blob());
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function CareerProfile(){
 const {refresh}=useAuth(); const library=useResource<{resumes:Resume[]}>('/api/student/resume-library');
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function run(action:()=>Promise<unknown>,success:string){setBusy(true);setError('');setMessage('');try{await action();setMessage(success)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="career-tools">
 {error&&<ErrorMessage message={error}/>} {message&&<p role="status">{message}</p>}
 <section className="panel saved-resumes-panel"><div className="saved-resumes-heading"><div><span className="eyebrow">RESUME LIBRARY</span><h2>Your saved resumes</h2><p className="muted">Keep your verified resumes in one place and choose which one powers interviews and coaching.</p></div><span className="saved-resumes-count">{library.data?.resumes.length || 0} saved</span></div>
 {library.error&&<ErrorMessage message={library.error} retry={library.reload}/>}
 <label className="resume-upload">Save a PDF or DOCX (up to 5 MB)<input type="file" accept=".pdf,.docx" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!/\.(pdf|docx)$/i.test(file.name)||!file.size||file.size>5*1024*1024){setError('Choose a non-empty PDF or DOCX up to 5 MB.');return}void run(async()=>{const body=new FormData();body.set('resume',file);await api('/api/student/resume-library',{method:'POST',body});library.reload()},'Resume saved.')}}/></label>
 {library.data?.resumes.map(resume=><div className="record saved-resume-row" key={resume.resume_id}><div className="record-main"><strong>{resume.label||resume.original_filename}</strong><p>{resume.is_primary?'Main resume · Used for interviews':'Saved resume'}</p></div><div className="career-actions">
 <button className="button secondary" disabled={busy} onClick={()=>void run(()=>download(`/api/student/resume-library/${resume.resume_id}/file`,resume.original_filename),'Download ready.')}>Download</button>
 {!resume.is_primary&&<button className="button secondary" disabled={busy} onClick={()=>void run(async()=>{await api(`/api/student/resume-library/${resume.resume_id}/primary`,json({}));library.reload();await refresh()},'Main resume updated.')}>Set as main</button>}
 <button className="text-button" disabled={busy} onClick={()=>{if(confirm('Delete this saved resume? Previous interview reports will remain available.'))void run(async()=>{await api(`/api/student/resume-library/${resume.resume_id}`,{method:'DELETE'});library.reload();await refresh()},'Resume deleted.')}}>Delete</button></div></div>)}
 {!library.loading&&!library.data?.resumes.length&&<p>No saved resumes yet.</p>}<Link to="/practice">Use your resume in interview practice →</Link></section>
</div>
}
