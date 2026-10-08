import { useState } from "react";
import { api, json } from "./api";

type Result = { stdout: string; stderr: string; exit_code: number | null; timed_out: boolean; status: string };
export function CoachCodeTerminal({planId,sessionId,taskId,language,code}:{planId:string;sessionId:string;taskId:string;language:string;code:string}) {
  const [stdin,setStdin]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function run(){setBusy(true);setError("");setResult(null);try{setResult(await api<Result>(`/api/student/coach/plans/${encodeURIComponent(planId)}/sessions/${encodeURIComponent(sessionId)}/code-run`,{...json({task_id:taskId,code,stdin}),timeoutMs:30000}))}catch(cause){setError((cause as Error).message)}finally{setBusy(false)}}
  return <section className="coach-code-terminal" aria-label={`Code terminal for ${language}`}>
    <label>Standard input<textarea value={stdin} onChange={event=>setStdin(event.target.value)} placeholder="Optional input for your program" maxLength={10000}/></label>
    <button type="button" className="button secondary" disabled={busy||!code.trim()} onClick={()=>void run()}>{busy?"Running…":`Run ${language} code`}</button>
    {error&&<p role="alert">{error}</p>}
    {result&&<><p role="status">{result.timed_out?"Execution timed out":result.exit_code===0?"Completed successfully":`Program exited with code ${result.exit_code}`}</p><pre aria-label="Terminal output">{result.stdout||"No standard output."}{result.stderr?`\n${result.stderr}`:""}</pre><small>Execution output is separate from your skill assessment. Submit your answer for validation.</small></>}
  </section>;
}
