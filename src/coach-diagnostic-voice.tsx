import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Repeat2, SkipForward, Square } from 'lucide-react';
import { apiUrl } from './api';

export type DiagnosticTask = {
  task_id: string; sub_skill: string; format: string; question: string;
  difficulty?: string; schema?: string; code?: string; active?: boolean;
  question_source_type?: string; source_question_id?: string | null;
};
type Evaluation = Record<string, unknown>;
type Props = {
  driveId: string; language: string; task: DiagnosticTask; questionNumber: number; total: number;
  onComplete: (taskId: string, transcript: string, evaluation: Evaluation | null, skipped: boolean) => void;
  onSkip: (taskId: string) => Promise<void>;
};

type VoiceState = 'ready' | 'connecting' | 'listening' | 'processing' | 'error';
const cleanTranscript = (text: string) => text.replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();

export function CoachDiagnosticVoice({ driveId, language, task, questionNumber, total, onComplete, onSkip }: Props) {
  const [state, setState] = useState<VoiceState>('ready'), [caption, setCaption] = useState(''), [finalText, setFinalText] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [muted, setMuted] = useState(false);
  const generation = useRef(0), cleanup = useRef<() => void>(() => {}), socketRef = useRef<WebSocket | null>(null), micOpen = useRef(false), muteRef = useRef(false), completed = useRef(false);
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete;
  useEffect(() => () => { generation.current++; cleanup.current(); }, [task.task_id]);

  async function connect() {
    if (state === 'connecting' || busy) return;
    const token = ++generation.current;
    setError(''); setCaption(''); setFinalText(''); setBusy(true); setMuted(false); muteRef.current = false; completed.current = false;
    setState('connecting');
    let stream: MediaStream | undefined, ctx: AudioContext | undefined, ws: WebSocket | undefined;
    let connectingTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { micOpen.current = false; clearTimeout(connectingTimer); if (ws) { ws.onclose = null; ws.onmessage = null; if (ws.readyState < WebSocket.CLOSING) ws.close(); } if (socketRef.current === ws) socketRef.current = null; stream?.getTracks().forEach(track => track.stop()); if (ctx && ctx.state !== 'closed') void ctx.close(); };
    cleanup.current = stop;
    const fail = (message: string) => { stop(); if (token === generation.current) { setBusy(false); setState('error'); setError(message); } };
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' }); await ctx.resume();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      if (token !== generation.current) { stop(); return; }
      await ctx.audioWorklet.addModule('/pcm-worklet-processor.js');
      if (token !== generation.current) { stop(); return; }
      const node = new AudioWorkletNode(ctx, 'pcm-capture-processor', { processorOptions: { targetSampleRate: 16000 } });
      const silent = ctx.createGain(); silent.gain.value = 0;
      ctx.createMediaStreamSource(stream).connect(node); node.connect(silent); silent.connect(ctx.destination);
      node.port.onmessage = event => {
        if (!micOpen.current || muteRef.current || ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 256000) return;
        const values = event.data as Float32Array, bytes = new ArrayBuffer(values.length * 2), view = new DataView(bytes);
        values.forEach((value, index) => view.setInt16(index * 2, Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767), true));
        ws?.send(bytes);
      };
      const url = new URL(apiUrl(`/ws/coach-diagnostic/${encodeURIComponent(driveId)}/${encodeURIComponent(task.task_id)}${language ? `?language=${encodeURIComponent(language)}` : ''}`), window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const queuedEvents: (string | ArrayBuffer)[] = [];
      ws = new WebSocket(url); socketRef.current = ws; ws.binaryType = 'arraybuffer';
      ws.onmessage = event => {
        if (token !== generation.current) return;
        if (!ctx) { queuedEvents.push(event.data); return; }
        handleMessage(event.data);
      };
      const handleMessage = (data: string | ArrayBuffer) => {
        if (token !== generation.current || !ctx) return;
        if (data instanceof ArrayBuffer) return;
        let payload: any; try { payload = JSON.parse(data); } catch { return; }
        if (payload.type === 'diagnostic_started') {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'start_answer', task_id: task.task_id }));
        }
        if (payload.type === 'listening_started') { micOpen.current = true; setState('listening'); }
        if (payload.type === 'partial_transcript') { const text = cleanTranscript(payload.text || ''); setCaption(text); setFinalText(''); setState('listening'); }
        if (payload.type === 'final_transcript') { const text = cleanTranscript(payload.text || ''); setCaption(''); setFinalText(text); if (text) setState('processing'); }
        if (payload.type === 'processing') { micOpen.current = false; setState('processing'); }
        if (payload.type === 'diagnostic_answer_complete' && !completed.current) {
          const text = cleanTranscript(payload.transcript || '');
          if (!text && !payload.skipped) { fail('No speech was transcribed. Please retry the question.'); return; }
          completed.current = true; micOpen.current = false; setFinalText(text); setCaption(''); setState('processing');
          const evaluation = payload.evaluation || null, skipped = Boolean(payload.skipped);
          window.setTimeout(() => { if (token === generation.current) { stop(); setBusy(false); onCompleteRef.current(task.task_id, text, evaluation, skipped); } }, 750);
        }
        if (payload.type === 'error') fail(payload.detail || 'The voice diagnostic was interrupted. Please retry.');
      };
      for (const event of queuedEvents.splice(0)) handleMessage(event);
      ws.onerror = () => fail('Could not connect to the voice diagnostic. Check microphone access and retry.');
      ws.onclose = event => { if (token === generation.current && !completed.current && event.code !== 1000) fail(event.code === 4409 ? 'This answer is already saved. Continue to the next question.' : 'Voice connection ended. Retry this question.'); };
      connectingTimer = setTimeout(() => { if (token === generation.current && ws?.readyState !== WebSocket.OPEN) fail('Voice connection timed out. Check your connection and microphone access, then retry.'); }, 12000);
    } catch (reason) { fail((reason as Error).message || 'Microphone access is required for a voice diagnostic.'); }
  }

  function control(type: 'repeat_question' | 'stop_answer' | 'skip_answer') {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (type !== 'repeat_question') { micOpen.current = false; setState('processing'); }
    else { micOpen.current = false; setState('connecting'); }
    socket.send(JSON.stringify({ type }));
  }

  async function skip() {
    if (busy) return;
    if (state !== 'ready' && state !== 'error') { control('skip_answer'); return; }
    setBusy(true); setError('');
    try { await onSkip(task.task_id); onCompleteRef.current(task.task_id, '', null, true); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  const statusText = state === 'listening' ? 'Listening' : state === 'processing' ? 'Saving answer' : state === 'connecting' ? 'Connecting to voice' : state === 'error' ? 'Voice unavailable' : 'Ready';
  return <section className="coach-voice-diagnostic" aria-label="Voice diagnostic answer">
    <div className="coach-diagnostic-persona"><div className={`coach-diagnostic-avatar ${state}`} aria-hidden="true">●</div><div><span className={`coach-diagnostic-state ${state}`} role="status">{statusText}</span><small>Voice diagnostic · {task.question_source_type === 'PREVIOUS_INTERVIEW_QUESTION' ? 'Previous interview question' : 'Diagnostic question'}</small></div></div>
    <div className="coach-diagnostic-question"><span>Question {questionNumber} of {total}</span><strong>Skill: {task.sub_skill}</strong><strong>Difficulty: {task.difficulty || 'Intermediate'}</strong><p>{task.question}</p>{task.schema && <pre>{task.schema}</pre>}{task.code && <pre>{task.code}</pre>}</div>
    <label className="coach-diagnostic-transcript"><small>{state === 'listening' ? 'Live transcript' : finalText ? 'Final transcript' : 'Transcript'}</small><textarea aria-label="Diagnostic transcript" value={caption || finalText} onChange={event => { setFinalText(event.target.value); setCaption(''); }} placeholder="Your words will appear here while you answer." readOnly={state !== 'ready' && state !== 'error'} /></label>
    {error && <p className="coach-diagnostic-voice-error" role="alert">{error}</p>}
    <div className="coach-diagnostic-voice-controls">
      {state === 'ready' || state === 'error' ? <button type="button" className="coach-primary" disabled={busy} onClick={() => void connect()}><Mic size={16}/>{state === 'error' ? 'Retry voice question' : 'Start voice question'}</button> : <>
        <button type="button" className="coach-secondary" disabled={!busy} onClick={() => control('repeat_question')}><Repeat2 size={15}/>Repeat question</button>
        <button type="button" className="coach-secondary" disabled={state !== 'listening'} onClick={() => control('stop_answer')}><Square size={14}/>Stop answer</button>
        <button type="button" className="coach-secondary" disabled={busy && state === 'processing'} onClick={() => void skip()}><SkipForward size={15}/>Skip</button>
        <button type="button" className="coach-secondary" disabled={state !== 'listening'} onClick={() => { muteRef.current = !muteRef.current; setMuted(muteRef.current); }} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>{muted ? <MicOff size={15}/> : <Mic size={15}/>} {muted ? 'Unmute' : 'Mute'}</button>
      </>}
    </div>
  </section>;
}
