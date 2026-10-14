import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import "./drive-ats-fit.css";
type Skill = { skill?:string; requirement?:string; priority?:string; match_status?:string };
type Match = { ats_status:string; ats_fit_score:number|null; skills:Skill[]; compatibility_summary?:string; company_name?:string; role_title?:string; job_description?:string };
export function DriveATSFit({driveId,studio=false,onAdd,busy=false,onJob}:{driveId:string;studio?:boolean;onAdd?:(skills:string[])=>Promise<boolean>;busy?:boolean;onJob?:(text:string)=>void}) {
 const panelRef=useRef<HTMLElement>(null),focused=useRef(false);
 const [data,setData]=useState<Match|null>(null),[error,setError]=useState(""),[selected,setSelected]=useState<string[]>([]),[retry,setRetry]=useState(0);
 useEffect(()=>{let alive=true;let timer:ReturnType<typeof setTimeout>;setData(null);setSelected([]);setError("");const load=async()=>{try{const result=await api<Match>(`/api/student/drives/${encodeURIComponent(driveId)}/ats-fit`);if(!alive)return;setData(result);setError("");if(result.ats_status==='processing')timer=setTimeout(load,10000)}catch(e){if(alive)setError((e as Error).message)}};void load();return()=>{alive=false;clearTimeout(timer)}},[driveId,retry]);
 useEffect(()=>{if(data?.job_description)onJob?.(data.job_description)},[data?.job_description,onJob]);
 useEffect(()=>{if(!studio||!onAdd||busy||!data||focused.current||new URLSearchParams(window.location.search).get("action")!=="add-skills")return;const timer=setTimeout(()=>{focused.current=true;panelRef.current?.scrollIntoView({block:"start",behavior:"smooth"});panelRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus({preventScroll:true})},100);return()=>clearTimeout(timer)},[studio,onAdd,busy,data]);
 const matching=(data?.skills||[]).filter(s=>['FULL_MATCH','RELATED_EVIDENCE'].includes(s.match_status||''));
 const missing=(data?.skills||[]).filter(s=>!['FULL_MATCH','RELATED_EVIDENCE'].includes(s.match_status||''));
 const name=(s:Skill)=>s.skill||s.requirement||'';
 return <section ref={panelRef} id={studio?"add-skills":undefined} className="drive-ats-panel" aria-label="ATS fit"><header><div><span className="eyebrow">RESUME MATCH</span><h3>ATS fit</h3></div>{data?.ats_fit_score!=null&&<strong>{Math.round(data.ats_fit_score)}<small>/100</small></strong>}</header>
 {error?<div role="alert">{error} <button className="button secondary small" onClick={()=>setRetry(v=>v+1)}>Retry</button></div>:!data?<p role="status">Loading resume match…</p>:<><p role="status">{data.compatibility_summary}</p>{data.ats_status==='evaluated'&&<div className="drive-ats-columns"><div><h4>Matching skills</h4><div className="drive-ats-chips">{matching.map(s=><span className="matched" key={name(s)}>{name(s)}</span>)}</div>{!matching.length&&<p>No matching evidence found.</p>}</div><div><h4>Missing resume evidence</h4><div className="drive-ats-chips">{missing.map(s=>studio?<label key={name(s)}><input type="checkbox" checked={selected.includes(name(s))} disabled={busy} onChange={e=>setSelected(v=>e.target.checked?[...v,name(s)]:v.filter(x=>x!==name(s)))}/>{name(s)}</label>:<span key={name(s)}>{name(s)}</span>)}</div>{!missing.length&&<p>All listed requirements have matching evidence.</p>}</div></div>}
 {missing.length>0&&(studio?<><p>Select skills you already have to add to this resume.</p><button className="button primary small" disabled={busy||!onAdd||!selected.length} onClick={async()=>{if(await onAdd?.(selected))setSelected([])}}>{busy?'Adding…':'Add selected skills'}</button>{!onAdd&&<p>Open or import your resume below to add skills.</p>}<p>Set as Main Resume to update this drive’s match.</p></>:<Link className="button secondary small" to={`/resume-studio?drive=${encodeURIComponent(driveId)}&action=add-skills#add-skills`}>Add missing skills in Resume Studio</Link>)}</>}
 </section>;
}
