import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, SkipForward, Square } from 'lucide-react';
import { apiUrl } from './api';

export type DiagnosticTask = { task_id: string; sub_skill: string; format: string; question: string; difficulty?: string; schema?: string; code?: string; active?: boolean; question_source_type?: string; source_question_id?: string | null };
type Evaluation = Record<string, unknown>;
type Props = { driveId: string; language: string; task: DiagnosticTask; questionNumber: number; total: number; onComplete: (taskId: string, transcript: string, evaluation: Evaluation | null, skipped: boolean) => void; onSkip: (taskId: string) => Promise<void> };
type VoiceState = 'ready' | 'connecting' | 'listening' | 'speech' | 'transcribing' | 'evaluating' | 'error';
const cleanTranscript = (text: string) => text.replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();

export function CoachDiagnosticVoice({ driveId, language, task, questionNumber, total, onComplete, onSkip }: Props) {
  const [state, setState] = useState<VoiceState>('ready'), [caption, setCaption] = useState(''), [finalText, setFinalText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [muted, setMuted] = useState(false);
  const generation = useRef(0), cleanup = useRef<() => void>(() => {}), socketRef = useRef<WebSocket | null>(null), micOpen = useRef(false), muteRef = useRef(false), completed = useRef(false), startedAt = useRef(0), chunksSent = useRef(0), onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => () => { generation.current++; cleanup.current(); }, [task.task_id]);
  function safeMetric(name: string, extra = '') { const elapsed = startedAt.current ? ` elapsed_ms=${Math.round(performance.now() - startedAt.current)}` : ''; console.debug(`[coach-diagnostic] ${name}${elapsed}${extra ? ` ${extra}` : ''}`); }

  async function connect() {
    if (state === 'connecting' || busy) return;
    const token = ++generation.current; startedAt.current = performance.now(); chunksSent.current = 0;
    setError(''); setCaption(''); setFinalText(''); setBusy(true); setMuted(false); muteRef.current = false; completed.current = false; setState('connecting');
    let stream: MediaStream | undefined, ctx: AudioContext | undefined, ws: WebSocket | undefined, connectingTimer: ReturnType<typeof setTimeout> | undefined, sentStart = false;
    const stop = () => { micOpen.current = false; clearTimeout(connectingTimer); if (ws) { ws.onclose = null; ws.onmessage = null; if (ws.readyState < WebSocket.CLOSING) ws.close(); } if (socketRef.current === ws) socketRef.current = null; stream?.getTracks().forEach(track => track.stop()); if (ctx && ctx.state !== 'closed') void ctx.close(); safeMetric('cleanup_completed', `audio_chunks=${chunksSent.current}`); };
    cleanup.current = stop;
    const fail = (message: string) => { stop(); if (token === generation.current) { setBusy(false); setState('error'); setError(message); } };
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is required for this diagnostic.');
      ctx = new AudioContext({ latencyHint: 'interactive' }); await ctx.resume();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      if (token !== generation.current) { stop(); return; }
      safeMetric('mic_permission_granted'); safeMetric('media_stream_created'); safeMetric('mic_started');
      await ctx.audioWorklet.addModule('/pcm-worklet-processor.js');
      if (token !== generation.current) { stop(); return; }
      const node = new AudioWorkletNode(ctx, 'pcm-capture-processor', { processorOptions: { targetSampleRate: 16000 } }), silent = ctx.createGain(); silent.gain.value = 0;
      ctx.createMediaStreamSource(stream).connect(node); node.connect(silent); silent.connect(ctx.destination);
      node.port.onmessage = event => {
        if (!micOpen.current || muteRef.current || ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 256000) return;
        const values = event.data as Float32Array, bytes = new ArrayBuffer(values.length * 2), view = new DataView(bytes);
        values.forEach((value, index) => view.setInt16(index * 2, Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767), true));
        ws?.send(bytes); chunksSent.current++;
        if (chunksSent.current === 1) { setState('listening'); safeMetric('first_audio_chunk', `elapsed_ms=${Math.round(performance.now() - startedAt.current)}`); }
      };
      const url = new URL(apiUrl(`/ws/coach-diagnostic/${encodeURIComponent(driveId)}/${encodeURIComponent(task.task_id)}${language ? `?language=${encodeURIComponent(language)}` : ''}`), window.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(url); socketRef.current = ws; ws.binaryType = 'arraybuffer';
      ws.onopen = () => { safeMetric('websocket_connected'); };
      ws.onmessage = event => {
        if (token !== generation.current || event.data instanceof ArrayBuffer) return;
        let payload: any; try { payload = JSON.parse(event.data); } catch { return; }
        if (payload.type === 'diagnostic_started') { if (ws?.readyState === WebSocket.OPEN && !sentStart) { sentStart = true; ws.send(JSON.stringify({ type: 'start_answer', task_id: task.task_id })); } }
        if (payload.type === 'listening_started') { micOpen.current = true; safeMetric('stt_listening_ready'); }
        if (payload.type === 'speech_started') { setState('speech'); safeMetric('speech_started'); }
        if (payload.type === 'partial_transcript') { const text = cleanTranscript(payload.text || ''); setCaption(text); setFinalText(''); if (text) { setState('listening'); safeMetric('partial_transcript_received'); } }
        if (payload.type === 'final_transcript') { const text = cleanTranscript(payload.text || ''); setCaption(''); setFinalText(text); micOpen.current = false; setState('transcribing'); safeMetric('provider_final_received'); }
        if (payload.type === 'processing') { micOpen.current = false; setState('evaluating'); }
        if (payload.type === 'diagnostic_answer_complete' && !completed.current) {
          const text = cleanTranscript(payload.transcript || ''); if (!text && !payload.skipped) { fail('No speech was detected. Try again or skip this question.'); return; }
          completed.current = true; micOpen.current = false; setFinalText(text); setCaption(''); setState('evaluating'); safeMetric('answer_persisted_once');
          const evaluation = payload.evaluation || null, skipped = Boolean(payload.skipped);
          window.setTimeout(() => { if (token === generation.current) { stop(); setBusy(false); onCompleteRef.current(task.task_id, text, evaluation, skipped); } }, 350);
        }
        if (payload.type === 'error') fail(payload.detail || 'Voice recognition couldn’t start. Retry this question.');
      };
      ws.onerror = () => fail('Voice recognition couldn’t start. Check microphone access and retry.');
      ws.onclose = event => { if (token === generation.current && !completed.current && event.code !== 1000) fail(event.code === 4409 ? 'This answer is already saved. Continue to the next question.' : 'Voice connection ended. Retry this question.'); };
      connectingTimer = setTimeout(() => { if (token === generation.current && ws?.readyState !== WebSocket.OPEN) fail('Voice connection timed out. Check your connection and microphone access, then retry.'); }, 12000);
    } catch (reason) { fail((reason as Error).name === 'NotAllowedError' ? 'Microphone access is required for this diagnostic.' : (reason as Error).message || 'Microphone access is required for a voice diagnostic.'); }
  }
  function control(type: 'stop_answer' | 'skip_answer') { const socket = socketRef.current; if (!socket || socket.readyState !== WebSocket.OPEN) return; micOpen.current = false; setState(type === 'stop_answer' ? 'transcribing' : 'evaluating'); socket.send(JSON.stringify({ type })); }
  async function skip() { if (state === 'listening' || state === 'speech' || state === 'transcribing') { control('skip_answer'); return; } setBusy(true); setError(''); try { await onSkip(task.task_id); onCompleteRef.current(task.task_id, '', null, true); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  const statusText = state === 'speech' ? 'Voice detected' : state === 'listening' ? 'Listening' : state === 'transcribing' ? 'Transcribing…' : state === 'evaluating' ? 'Evaluating…' : state === 'connecting' ? 'Preparing microphone…' : state === 'error' ? 'Voice unavailable' : 'Ready';
  return <section className="coach-voice-diagnostic" aria-label="Voice diagnostic answer">
    <div className="coach-diagnostic-question"><div className="coach-diagnostic-question-count">Question {questionNumber} of {total}<span>{task.sub_skill} · {task.difficulty || 'Intermediate'}</span></div><h3>{task.question}</h3>{task.schema && <pre>{task.schema}</pre>}{task.code && <pre>{task.code}</pre>}<div className="coach-diagnostic-progress" aria-label={`Question ${questionNumber} of ${total}`}>{Array.from({length:total},(_,i)=><span key={i} className={i<questionNumber?'done':''}/>)}</div></div>
    <div className={`coach-diagnostic-live ${state}`} role="status"><span aria-hidden="true" className="coach-diagnostic-live-dot"/><strong>{statusText}</strong><span>{state === 'speech' ? 'Voice input detected.' : state === 'listening' ? 'Speak your answer naturally.' : state === 'connecting' ? 'Allow microphone access to begin.' : state === 'transcribing' ? 'Finishing your answer…' : state === 'evaluating' ? 'Your response is being evaluated.' : 'Your answer is captured from your microphone.'}</span></div>
    <div className="coach-diagnostic-transcript" aria-live="polite"><small>{caption ? 'Live transcript' : finalText ? 'Final transcript' : 'Live transcript'}</small><p>{caption || finalText || 'Your words will appear here while you answer.'}</p></div>
    {error && <p className="coach-diagnostic-voice-error" role="alert">{error}</p>}
    <div className="coach-diagnostic-voice-controls">{state === 'ready' || state === 'error' ? <button type="button" className="coach-primary" disabled={busy} onClick={() => void connect()}><Mic size={16}/>{state === 'error' ? 'Try again' : 'Start answering'}</button> : <><button type="button" className="coach-secondary" disabled={state !== 'listening' && state !== 'speech'} onClick={() => control('stop_answer')}><Square size={14}/>Stop answer</button><button type="button" className="coach-secondary" disabled={state === 'connecting' || state === 'evaluating'} onClick={() => void skip()}><SkipForward size={15}/>Skip</button><button type="button" className="coach-secondary" disabled={state !== 'listening' && state !== 'speech'} onClick={() => { muteRef.current = !muteRef.current; setMuted(muteRef.current); }} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>{muted ? <MicOff size={15}/> : <Mic size={15}/>} {muted ? 'Unmute' : 'Mute'}</button></>}</div>
  </section>;
}
