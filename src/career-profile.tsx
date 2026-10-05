import { useEffect, useState } from 'react';
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
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[studioResumeLink,setStudioResumeLink]=useState<{resumeId:string;projectId:string}|null>(null);
 const [optimisticActive,setOptimisticActive]=useState<Resume|null>(null);
 const active=optimisticActive||library.data?.resumes.find(resume=>resume.submission_id===identity?.student.current_resume_submission_id)
  ||library.data?.resumes.find(resume=>resume.is_primary);
 useEffect(()=>{if(optimisticActive&&library.data?.resumes.some(resume=>resume.resume_id===optimisticActive.resume_id))setOptimisticActive(null)},[optimisticActive,library.data?.resumes]);
 useEffect(()=>{const resumeId=active?.resume_id;if(!resumeId)return;let live=true;api<Array<{id:string;linked_resume_id?:string}>>('/api/student/resume-studio/resumes').then(rows=>{if(!live)return;const projectId=rows.find(row=>row.linked_resume_id===resumeId)?.id;if(projectId)setStudioResumeLink(current=>current?.resumeId===resumeId?current:{resumeId,projectId})}).catch(()=>{});return()=>{live=false}},[active?.resume_id]);
 async function upload(file:File){
  setBusy(true);setError('');setMessage('');
  try{
   const body=new FormData();body.set('resume',file);body.set('label',file.name.replace(/\.[^.]+$/,''));body.set('analyze_for_coaching','true');
   const saved=await api<{analysis_status:string;resume_id:string;submission_id?:string}>('/api/student/resume-library',{method:'POST',body});
   setOptimisticActive({resume_id:saved.resume_id,submission_id:saved.submission_id,original_filename:file.name,label:file.name.replace(/\.[^.]+$/,''),is_primary:true,uploaded_at:new Date().toISOString()});
   let importWarning='';
   try{
    const downloadResponse=await request(`/api/student/resume-library/${encodeURIComponent(saved.resume_id)}/file`);
    const importBody=new FormData();importBody.set('file',new File([await downloadResponse.blob()],file.name,{type:file.type}));importBody.set('profile_resume_id',saved.resume_id);
    const imported=await api<{id:string;import_report?:{warnings?:string[]}}>('/api/student/resume-studio/resumes/import',{method:'POST',body:importBody,timeoutMs:180_000});
    setStudioResumeLink({resumeId:saved.resume_id,projectId:imported.id});importWarning=imported.import_report?.warnings?.[0]||'';
   }catch(importError){importWarning='The active resume was saved, but its Resume Studio copy could not be updated. Open Resume Studio and import it there.'}
   library.reload();await refresh();
   setMessage(`${saved.analysis_status==='processing'?'Your active resume was saved. AI analysis is running in the background; it will be ready across your student features shortly.':saved.analysis_status==='unavailable'?'Your active resume was saved, but AI analysis is temporarily unavailable. Retry the analysis from your profile.':'Your active resume is ready to use across AI Coach, placement interviews, self-practice, and Career Coach.'}${importWarning?` ${importWarning}`:''}`);
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function downloadActiveResume(resume:Resume){setError('');try{await download(`/api/student/resume-library/${encodeURIComponent(resume.resume_id)}/file`,resume.original_filename)}catch(e){setError((e as Error).message||'The saved resume could not be downloaded. Please retry.')}}
 return <div className="career-tools">
  {error&&<ErrorMessage message={error}/>} {message&&<p role="status">{message}</p>}
  <section id="resume-library" className="panel saved-resumes-panel">
   <div className="saved-resumes-heading"><div><span className="eyebrow">YOUR ACTIVE RESUME</span><h2>One resume, used across VoiceDots</h2><p className="muted">Upload it here once. AI Coach, placement interviews, self-practice, and Career Coach will all use this active resume. Resume Studio keeps its own resume projects.</p></div></div>
   {library.error&&<ErrorMessage message={library.error} retry={library.reload}/>}
   {library.loading&&!library.data&&!active?<p className="muted">Loading your active resume…</p>:active?<div className="record saved-resume-row"><div className="record-main"><strong>{active.label||active.original_filename}</strong><p>Active across coaching and interviews</p></div><div className="career-actions"><button className="button secondary" disabled={busy} onClick={()=>void downloadActiveResume(active)}>Download</button><label className="button primary resume-replace-control">{busy?'Uploading…':'Replace active resume'}<input aria-label="Replace active resume" type="file" accept=".pdf,.docx" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(!/\.(pdf|docx)$/i.test(file.name)||!file.size||file.size>5*1024*1024){setError('Choose a non-empty PDF or DOCX up to 5 MB.');return}void upload(file)}}/></label></div></div>:<p className="muted">No active resume yet. Upload a PDF or DOCX (up to 5 MB) to use these features.</p>}
   {!library.loading&&!active&&<label className="resume-upload">Upload active resume · PDF or DOCX, up to 5 MB<input aria-label="Upload active resume" type="file" accept=".pdf,.docx" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(!/\.(pdf|docx)$/i.test(file.name)||!file.size||file.size>5*1024*1024){setError('Choose a non-empty PDF or DOCX up to 5 MB.');return}void upload(file)}}/></label>}
   {active&&studioResumeLink?.resumeId===active.resume_id&&<Link to={`/resume-studio?resume=${encodeURIComponent(studioResumeLink.projectId)}`}>Edit this resume in Resume Studio →</Link>}
   <Link to="/resume-studio">Create and manage multiple resumes in Resume Studio →</Link>
  </section>
 </div>
}
