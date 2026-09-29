import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, request, type Resume } from './api';
import { useAuth } from './auth';
import { ErrorMessage, useResource } from './ui';

export async function download(path:string, name:string, options?:RequestInit) {
 const response=await request(path,options); const url=URL.createObjectURL(await response.blob());
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function CareerProfile(){
 const {identity,refresh}=useAuth(); const library=useResource<{resumes:Resume[]}>('/api/student/resume-library');
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const active=library.data?.resumes.find(resume=>resume.submission_id===identity?.student.current_resume_submission_id)
  ||library.data?.resumes.find(resume=>resume.is_primary);
 async function upload(file:File){
  setBusy(true);setError('');setMessage('');
  try{
   const body=new FormData();body.set('resume',file);body.set('label',file.name.replace(/\.[^.]+$/,''));body.set('analyze_for_coaching','true');
   const saved=await api<{analysis_status:string}>('/api/student/resume-library',{method:'POST',body});
   library.reload();await refresh();
   setMessage(saved.analysis_status==='unavailable'?'Your active resume was saved, but AI analysis is temporarily unavailable. Retry the analysis from your profile.':'Your active resume is ready to use across AI Coach, placement interviews, self-practice, and Career Coach.');
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <div className="career-tools">
  {error&&<ErrorMessage message={error}/>} {message&&<p role="status">{message}</p>}
  <section id="resume-library" className="panel saved-resumes-panel">
   <div className="saved-resumes-heading"><div><span className="eyebrow">YOUR ACTIVE RESUME</span><h2>One resume, used across VoiceDots</h2><p className="muted">Upload it here once. AI Coach, placement interviews, self-practice, and Career Coach will all use this active resume. Resume Studio keeps its own resume projects.</p></div></div>
   {library.error&&<ErrorMessage message={library.error} retry={library.reload}/>}
   {library.loading&&!library.data?<p className="muted">Loading your active resume…</p>:active?<div className="record saved-resume-row"><div className="record-main"><strong>{active.label||active.original_filename}</strong><p>Active across coaching and interviews</p></div><div className="career-actions"><button className="button secondary" disabled={busy} onClick={()=>void download(`/api/student/resume-library/${active.resume_id}/file`,active.original_filename)}>Download</button><label className="button primary resume-replace-control">{busy?'Uploading…':'Replace active resume'}<input aria-label="Replace active resume" type="file" accept=".pdf,.docx" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(!/\.(pdf|docx)$/i.test(file.name)||!file.size||file.size>5*1024*1024){setError('Choose a non-empty PDF or DOCX up to 5 MB.');return}void upload(file)}}/></label></div></div>:<p className="muted">No active resume yet. Upload a PDF or DOCX (up to 5 MB) to use these features.</p>}
   {!library.loading&&!active&&<label className="resume-upload">Upload active resume · PDF or DOCX, up to 5 MB<input aria-label="Upload active resume" type="file" accept=".pdf,.docx" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(!/\.(pdf|docx)$/i.test(file.name)||!file.size||file.size>5*1024*1024){setError('Choose a non-empty PDF or DOCX up to 5 MB.');return}void upload(file)}}/></label>}
   <Link to="/resume-studio">Create and manage multiple resumes in Resume Studio →</Link>
  </section>
 </div>
}
