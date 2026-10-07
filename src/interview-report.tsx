import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, ArrowLeft } from "lucide-react";
import { api, apiUrl, request, type Report } from "./api";
import { ErrorMessage, humanize, useResource, ResourceState } from "./ui";

type Recording = { status: string; playback_url: string | null; message?: string };

export function InterviewReport() {
  const { sessionId = "" } = useParams();
  const reports = useResource<{ reports: Report[] }>("/api/student/reports");
  const report = reports.data?.reports.find(item => item.session_id === sessionId);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [recordingError, setRecordingError] = useState("");
  const [showResult, setShowResult] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setHtml(""); setError(""); setRecording(null); setRecordingError(""); setShowResult(false);
    if (!report || report.status !== "released" || report.report?.status === "awaiting_release") return;
    void request(`/api/interview/${encodeURIComponent(sessionId)}/evaluation/report.html`, { signal: controller.signal })
      .then(response => response.text()).then(value => { if (!controller.signal.aborted) setHtml(value.replace('href="report.pdf"', `href="${apiUrl(`/api/interview/${encodeURIComponent(sessionId)}/evaluation/report.pdf`)}"`)); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    void api<Recording>(`/api/student/interview/${encodeURIComponent(sessionId)}/recording`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setRecording(value); })
      .catch(cause => { if (!controller.signal.aborted) setRecordingError(cause.message); });
    return () => controller.abort();
  }, [sessionId, report]);
  return <section className="interview-report-page">
    <Link className="button secondary" to="/reports"><ArrowLeft size={17}/> All reports</Link>
    <ResourceState resource={reports}>
      {report ? <>
        <header className="panel full-report-header"><div><span className="eyebrow">INTERVIEW REPORT</span><h1>{report.target_role || "Your interview"}</h1><p>{report.company_name || "Practice interview"}{report.attempt_number ? ` · Attempt ${report.attempt_number}` : ""}</p></div>
          {report.status === "released" && report.report?.status !== "awaiting_release" && <a className="button primary" href={apiUrl(`/api/interview/${encodeURIComponent(sessionId)}/evaluation/report.pdf`)}><Download size={17}/> Download PDF</a>}
        </header>
        {report.report?.status === "awaiting_release" || report.status !== "released" ? <p className="panel">Your report is awaiting release.</p> : <>
          {report.drive_id && <section className="panel"><button className="button secondary" aria-expanded={showResult} onClick={() => setShowResult(value => !value)}>View placement result</button>{showResult && <div className="placement-result-reveal" role="status"><h2>{report.placement_decision ? humanize(report.placement_decision) : "Decision pending"}</h2></div>}</section>}
          <section className="panel"><h2>Interview recording</h2>{recording?.playback_url ? <video className="report-video" controls playsInline preload="metadata" src={recording.playback_url} aria-label="Interview recording"/> : <p>{recordingError || recording?.message || (recording ? `Recording ${humanize(recording.status).toLowerCase()}` : "Loading recording…")}</p>}</section>
          <ErrorMessage message={error}/>
          {html ? <iframe className="full-report-document" title="Complete interview report and questions" srcDoc={html} sandbox="allow-same-origin allow-popups"/> : !error && <p role="status">Loading full report…</p>}
        </>}
      </> : reports.data && <p className="panel">This report is unavailable.</p>}
    </ResourceState>
  </section>;
}
