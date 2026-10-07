import { Award, Clock3, CirclePause, CircleX } from "lucide-react";
export function placementResult(value?: string | null) {
  const key = (value || "").toLowerCase().replace(/[ -]+/g, "_");
  if (["shortlist", "shortlisted"].includes(key)) return {label:"Shortlisted", tone:"success", Icon:Award, message:"You have been shortlisted for this placement opportunity."};
  if (["reject", "rejected"].includes(key)) return {label:"Rejected", tone:"rejected", Icon:CircleX, message:"You have not been selected for this placement opportunity. Use your feedback to prepare for your next interview."};
  if (["hold", "on_hold"].includes(key)) return {label:"On hold", tone:"hold", Icon:CirclePause, message:"Your placement decision is on hold. Check back here for an update."};
  return {label:"Decision pending", tone:"pending", Icon:Clock3, message:"Your interview feedback is ready. Your placement decision will appear here when it is shared."};
}
export function PlacementResult({value, compact=false}: {value?:string|null; compact?:boolean}) {
  const result=placementResult(value), Icon=result.Icon;
  return compact ? <span className={`placement-outcome outcome-${result.tone}`}><Icon size={14}/>{result.label}</span> : <section className={`report-placement-outcome outcome-${result.tone}`} aria-label="Placement result"><span className="report-outcome-icon"><Icon size={25}/></span><div><span className="eyebrow">YOUR PLACEMENT RESULT</span><h2>{result.label}</h2><p>{result.message}</p></div></section>;
}
