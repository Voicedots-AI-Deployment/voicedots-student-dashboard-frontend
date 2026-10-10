import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, SkipForward, Square, AudioLines } from 'lucide-react';
import { apiUrl } from './api';

export type DiagnosticTask = { task_id: string; sub_skill: string; format: string; question: string; question_text?:string; difficulty?: string; schema?: string; code?: string; language?: string; examples?:string[];constraints?:string[];input_format?:string;output_format?:string;active?: boolean; question_source_type?: string; source_question_id?: string | null };
type Evaluation = Record<string, unknown>;
type Props = { driveId: string; language: string; task: DiagnosticTask; questionNumber: number; total: number; onComplete: (taskId: string, transcript: string, evaluation: Evaluation | null, skipped: boolean) => void; onSkip: (taskId: string) => Promise<void>; onText: (taskId: string, answer: string) => Promise<void> };
type VoiceState = 'ready' | 'connecting' | 'listening' | 'speech' | 'transcribing' | 'evaluating' | 'error';
const cleanTranscript = (text: string) => text.replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();
const mergeTranscript = (base: string, next: string) => { const left=cleanTranscript(base),right=cleanTranscript(next);if(!left)return right;if(!right)return left;if(right.toLowerCase().startsWith(left.toLowerCase()))return right;if(left.toLowerCase().endsWith(right.toLowerCase()))return left;const a=left.toLowerCase().split(/\s+/),b=right.toLowerCase().split(/\s+/);let overlap=0;for(let size=Math.min(a.length,b.length);size>0;size--)if(a.slice(-size).join(' ')===b.slice(0,size).join(' ')){overlap=size;break}return cleanTranscript(`${left} ${right.split(/\s+/).slice(overlap).join(' ')}`); };

export function CoachDiagnosticVoice({ driveId, language, task, questionNumber, total, onComplete, onSkip, onText }: Props) {
  const [mode,setMode]=useState<'text'|'voice'>('text'),[answer,setAnswer]=useState(''),[micLevel,setMicLevel]=useState(0);
  const [state, setState] = useState<VoiceState>('ready'), [caption, setCaption] = useState(''), [finalText, setFinalText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [muted, setMuted] = useState(false),[devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState('');
  const generation = useRef(0), cleanup = useRef<() => void>(() => {}), socketRef = useRef<WebSocket | null>(null), micOpen = useRef(false), muteRef = useRef(false), completed = useRef(false), startedAt = useRef(0), chunksSent = useRef(0), onCompleteRef = useRef(onComplete),streamRef=useRef<MediaStream|null>(null),audioContextRef=useRef<AudioContext|null>(null),sourceRef=useRef<MediaStreamAudioSourceNode|null>(null),workletRef=useRef<AudioWorkletNode|null>(null),deviceChangeRef=useRef<(()=>void)|null>(null);
  onCompleteRef.current = onComplete;
  useEffect(() => () => { generation.current++; cleanup.current(); }, [task.task_id]);
  function safeMetric(name: string, extra = '') { const elapsed = startedAt.current ? ` elapsed_ms=${Math.round(performance.now() - startedAt.current)}` : ''; console.debug(`[coach-diagnostic] ${name}${elapsed}${extra ? ` ${extra}` : ''}`); }

  async function switchMicrophone(nextId:string){const ctx=audioContextRef.current,node=workletRef.current,prior=streamRef.current;if(!ctx||!node)return;try{const next=await navigator.mediaDevices.getUserMedia({audio:{...(nextId?{deviceId:{exact:nextId}}:{}),echoCancellation:true,noiseSuppression:true,channelCount:1}});const source=ctx.createMediaStreamSource(next);source.connect(node);sourceRef.current?.disconnect();sourceRef.current=source;streamRef.current=next;prior?.getTracks().forEach(track=>track.stop());setDeviceId(nextId||next.getAudioTracks()[0]?.getSettings().deviceId||'');console.debug('[coach-diagnostic] microphone_replaced')}catch{setError('The selected microphone is unavailable. Choose another input or retry voice.')}}

  async function connect() {
    if (state === 'connecting' || busy) return;
    cleanup.current();const token = ++generation.current; startedAt.current = performance.now(); chunksSent.current = 0;
    const retainedTranscript=caption||finalText;setError(''); setCaption(retainedTranscript); setFinalText(''); setBusy(true); setMuted(false); muteRef.current = false; completed.current = false; setState('connecting');
    let stream: MediaStream | undefined, ctx: AudioContext | undefined, ws: WebSocket | undefined, connectingTimer: ReturnType<typeof setTimeout> | undefined, sentStart = false, sourceNode: MediaStreamAudioSourceNode | undefined, workletNode: AudioWorkletNode | undefined, silent: GainNode | undefined;
    const stop = () => { micOpen.current = false;setMicLevel(0); clearTimeout(connectingTimer);if(deviceChangeRef.current){navigator.mediaDevices.removeEventListener('devicechange',deviceChangeRef.current);deviceChangeRef.current=null;}sourceRef.current?.disconnect();streamRef.current?.getTracks().forEach(track=>track.stop());audioContextRef.current=null;streamRef.current=null;sourceRef.current=null;workletRef.current=null; if (ws) { ws.onclose = null; ws.onmessage = null; if (ws.readyState < WebSocket.CLOSING) ws.close(); } if (socketRef.current === ws) socketRef.current = null; sourceNode?.disconnect(); workletNode?.disconnect(); stream?.getTracks().forEach(track => track.stop()); if (ctx && ctx.state !== 'closed') void ctx.close(); safeMetric('cleanup_completed', `audio_chunks=${chunksSent.current}`); };
    cleanup.current = stop;
    const fail = (message: string) => { stop(); if (token === generation.current) { setBusy(false); setState('error'); setError(message); } };
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is required for this diagnostic.');
      ctx = new AudioContext({ latencyHint: 'interactive' });
      try{stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId?{deviceId:{exact:deviceId}}:{}),echoCancellation: true, noiseSuppression: true, channelCount: 1 } });}catch(reason){if(!deviceId||!['NotFoundError','OverconstrainedError'].includes((reason as Error).name))throw reason;setDeviceId('');stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}})}streamRef.current=stream;audioContextRef.current=ctx;
      const refreshDevices=async()=>{const inputs=(await navigator.mediaDevices.enumerateDevices()).filter(item=>item.kind==='audioinput');setDevices(inputs);if(!deviceId){const actualId=stream?.getAudioTracks()[0]?.getSettings().deviceId;const actualInput=inputs.find(item=>item.deviceId===actualId)||inputs.find(item=>item.deviceId==='default')||inputs[0];if(actualInput)setDeviceId(actualInput.deviceId)}};
      await ctx.resume();
      if(ctx.state!=='running')throw new Error('Your microphone audio is paused. Retry voice to activate it.');
      await refreshDevices();
      if (token !== generation.current) { stop(); return; }
      safeMetric('mic_permission_granted'); safeMetric('media_stream_created'); safeMetric('mic_started');
      await ctx.audioWorklet.addModule('/pcm-worklet-processor.js');
      if (token !== generation.current) { stop(); return; }
      const node = workletNode = new AudioWorkletNode(ctx, 'pcm-capture-processor', { processorOptions: { targetSampleRate: 16000 } }); silent = ctx.createGain(); silent.gain.value = 0;
      sourceNode = ctx.createMediaStreamSource(stream);sourceRef.current=sourceNode;workletRef.current=node;sourceNode.connect(node); node.connect(silent); silent.connect(ctx.destination);
      node.port.onmessage = event => {
        if (!micOpen.current || muteRef.current || ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 256000) return;
        const values = event.data as Float32Array;setMicLevel(Math.min(100,Math.sqrt(values.reduce((sum,value)=>sum+value*value,0)/Math.max(1,values.length))*500));const bytes = new ArrayBuffer(values.length * 2), view = new DataView(bytes);
        values.forEach((value, index) => view.setInt16(index * 2, Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767), true));
        ws?.send(bytes); chunksSent.current++;
        if (chunksSent.current === 1) { setState('listening'); safeMetric('first_audio_chunk', `elapsed_ms=${Math.round(performance.now() - startedAt.current)}`); }
      };
      const url = new URL(apiUrl(`/ws/coach-diagnostic/${encodeURIComponent(driveId)}/${encodeURIComponent(task.task_id)}${language ? `?language=${encodeURIComponent(language)}` : ''}`), window.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(url); socketRef.current = ws; ws.binaryType = 'arraybuffer';
      ws.onopen = () => { safeMetric('websocket_connected'); };
      const onDeviceChange=()=>{void refreshDevices().then(()=>{if(streamRef.current?.getAudioTracks()[0]?.readyState==='ended')void switchMicrophone('')})};deviceChangeRef.current=onDeviceChange;navigator.mediaDevices.addEventListener('devicechange',onDeviceChange);
      ws.onmessage = event => {
        if (token !== generation.current || event.data instanceof ArrayBuffer) return;
        let payload: any; try { payload = JSON.parse(event.data); } catch { return; }
      if (payload.type === 'diagnostic_started') { if (ws?.readyState === WebSocket.OPEN && !sentStart) { sentStart = true; ws.send(JSON.stringify({ type: 'start_answer', task_id: task.task_id, draft_transcript:retainedTranscript })); } }
        if (payload.type === 'listening_started') { clearTimeout(connectingTimer);setState('listening'); micOpen.current = true; safeMetric('stt_listening_ready'); }
        if (payload.type === 'speech_started') { setState('speech'); safeMetric('speech_started'); }
        if (payload.type === 'partial_transcript') { const text = mergeTranscript(retainedTranscript,payload.text || ''); setCaption(text); setAnswer(text);setFinalText(''); if (text) { setState('listening'); safeMetric('partial_transcript_received'); } }
        if (payload.type === 'final_transcript') { const text = mergeTranscript(retainedTranscript,payload.text || ''); setCaption(''); setFinalText(text); micOpen.current = false; setState('transcribing'); safeMetric('provider_final_received'); }
        if (payload.type === 'processing') { micOpen.current = false; setState('evaluating'); }
        if (payload.type === 'diagnostic_answer_complete' && !completed.current) {
          const text = mergeTranscript(retainedTranscript,payload.transcript||''); if (!text && !payload.skipped) { fail('No speech was detected. Try again or skip this question.'); return; }
          completed.current = true; micOpen.current = false; setFinalText(text); setCaption(''); setState('evaluating'); safeMetric('answer_persisted_once');
          const evaluation = payload.evaluation || null, skipped = Boolean(payload.skipped);
          window.setTimeout(() => { if (token === generation.current) { stop(); setBusy(false); onCompleteRef.current(task.task_id, text, evaluation, skipped); } }, 350);
        }
        if (payload.type === 'error') fail(payload.detail || 'Voice recognition couldn’t start. Retry this question.');
      };
      ws.onerror = () => fail('Voice recognition couldn’t start. Check microphone access and retry.');
      ws.onclose = event => { if (token === generation.current && !completed.current) fail(event.code === 4409 ? 'This answer is already saved. Continue to the next question.' : 'Voice connection ended. Retry this question.'); };
      connectingTimer = setTimeout(() => { if (token === generation.current && !micOpen.current&&!completed.current) fail('Voice connection timed out. Check your connection and microphone access, then retry.'); }, 40000);
    } catch (reason) { fail((reason as Error).name === 'NotAllowedError' ? 'Microphone access is required for this diagnostic.' : (reason as Error).message || 'Microphone access is required for a voice diagnostic.'); }
  }
  function control(type: 'stop_answer' | 'skip_answer') { const socket = socketRef.current; if (!socket || socket.readyState !== WebSocket.OPEN) return; micOpen.current = false; setState(type === 'stop_answer' ? 'transcribing' : 'evaluating'); socket.send(JSON.stringify({ type })); }
  async function skip() {
    if (completed.current || state === 'evaluating') return;
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN && micOpen.current && state !== 'error') { control('skip_answer'); return; }
    const token = ++generation.current;
    cleanup.current();
    completed.current = true;
    setBusy(true); setError(''); setState('evaluating');
    try { await onSkip(task.task_id); if (token === generation.current) onCompleteRef.current(task.task_id, '', null, true); }
    catch (reason) { completed.current = false; setError((reason as Error).message); setState('ready'); }
    finally { if (token === generation.current) setBusy(false); }
  }
  async function submitText(){if(busy||!answer.trim())return;const token=++generation.current;cleanup.current();setBusy(true);setError('');try{await onText(task.task_id,answer.trim());if(token===generation.current){completed.current=true;onCompleteRef.current(task.task_id,answer.trim(),null,false)}}catch(reason){setError((reason as Error).message)}finally{if(token===generation.current)setBusy(false)}}
  function changeMode(next:'text'|'voice'){if(busy&&state==='evaluating')return;generation.current++;cleanup.current();setBusy(false);setState('ready');setError('');if(next==='text')setAnswer(previous=>previous||caption||finalText);setMode(next)}
  const statusText = state === 'speech' ? 'Voice detected' : state === 'listening' ? 'Listening' : state === 'transcribing' ? 'Transcribing…' : state === 'evaluating' ? 'Evaluating…' : state === 'connecting' ? 'Preparing microphone…' : state === 'error' ? 'Voice unavailable' : 'Ready';
  return <section className="coach-voice-diagnostic" aria-label="Diagnostic answer">
    <div className="coach-diagnostic-question"><div className="coach-diagnostic-question-count">Question {questionNumber} of {total}<span>{task.sub_skill} · {task.difficulty || 'Intermediate'}</span></div><QuestionContent task={task}/><div className="coach-diagnostic-progress" aria-label={`Question ${questionNumber} of ${total}`}>{Array.from({length:total},(_,i)=><span key={i} className={i<questionNumber?'done':''}/>)}</div></div>
    <div className="coach-answer-mode" role="group" aria-label="Answer input"><button className="coach-secondary" aria-pressed={mode==='text'} disabled={busy&&mode==='text'||state==='evaluating'} onClick={()=>changeMode('text')}>Type answer</button><button className="coach-secondary" aria-pressed={mode==='voice'} disabled={busy&&mode==='text'||state==='evaluating'} onClick={()=>changeMode('voice')}><Mic size={15}/>Voice answer</button></div>
    {mode==='text'?<><label className="coach-text-answer">Your answer<textarea value={answer} maxLength={10000} onChange={event=>setAnswer(event.target.value)} placeholder="Explain your approach in your own words…"/></label>{error&&<p className="coach-diagnostic-voice-error" role="alert">{error}</p>}<div className="coach-diagnostic-voice-controls"><button className="coach-secondary" disabled={busy} onClick={()=>void skip()}><SkipForward size={15}/>Skip question</button><button className="coach-primary" disabled={busy||!answer.trim()} onClick={()=>void submitText()}>{busy?'Saving…':'Save answer'}</button></div></>:<>
    <div className={`coach-diagnostic-live ${state}`} role="status"><span aria-hidden="true" className="coach-diagnostic-live-dot"/><strong>{statusText}</strong>{(state==='listening'||state==='speech')&&<div className="coach-diagnostic-mic-level" aria-label="Audio level"><span style={{width:`${micLevel}%`}}/></div>}<span>{state === 'speech' ? 'Voice input detected.' : state === 'listening' ? 'Speak for up to 5 minutes, then select Finish answer to save.' : state === 'connecting' ? 'Allow microphone access to begin.' : state === 'transcribing' ? 'Finishing your answer…' : state === 'evaluating' ? 'Your response is being evaluated.' : 'Your answer is captured from your microphone.'}</span></div>
    <div className="coach-diagnostic-transcript" aria-live="polite"><small>{caption ? 'Live transcript' : finalText ? 'Final transcript' : 'Live transcript'}</small><p>{caption || finalText || 'Your words will appear here while you answer.'}</p></div>
    {error && <p className="coach-diagnostic-voice-error" role="alert">{error}</p>}
    <div className="coach-diagnostic-voice-controls"><button className="coach-secondary" disabled={state==='evaluating'} onClick={()=>void skip()}><SkipForward size={15}/>Skip question</button>{devices.length>0&&<label className="coach-mic-picker"><AudioLines size={15}/><select aria-label="Microphone input" value={deviceId} disabled={state==='connecting'||state==='evaluating'} onChange={event=>{setDeviceId(event.target.value);if(state==='listening'||state==='speech')void switchMicrophone(event.target.value)}}><option value="">System default microphone</option>{devices.map((item,index)=><option key={item.deviceId} value={item.deviceId}>{item.label||`Microphone ${index+1}`}</option>)}</select></label>}{state === 'ready' || state === 'error' ? <button type="button" className="coach-primary" disabled={busy} onClick={() => void connect()}><Mic size={16}/>{state === 'error' ? 'Retry Voice' : 'Start answering'}</button> : <><button type="button" className="coach-secondary" disabled={state !== 'listening' && state !== 'speech'} onClick={() => control('stop_answer')}><Square size={14}/>Finish answer</button><button type="button" className="coach-secondary" disabled={state !== 'listening' && state !== 'speech'} onClick={() => { muteRef.current = !muteRef.current; setMuted(muteRef.current); }} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>{muted ? <MicOff size={15}/> : <Mic size={15}/>} {muted ? 'Unmute' : 'Mute'}</button></>}</div></>}
  </section>;
}

function QuestionContent({ task }: { task: DiagnosticTask }) {
  const source = (task.question_text || task.question || '').trim();
  const fence = source.match(/```([\w+#.-]*)[ \t]*\n([\s\S]*?)\n```/);
  const content = fence ? source.replace(fence[0], '').trim() : source;
  return <>
    {content && <h3>{content}</h3>}
    {(task.code||fence) && <pre className="coach-code-block"><code className={`language-${task.language||fence?.[1]||'text'}`}>{task.code||fence?.[2]}</code></pre>}
    {task.schema && <><strong>Expected input or output</strong><pre className="coach-code-block"><code>{task.schema}</code></pre></>}
    {task.input_format&&<section><strong>Input</strong><p>{task.input_format}</p></section>}
    {task.output_format&&<section><strong>Output</strong><p>{task.output_format}</p></section>}
    {!!task.constraints?.length&&<section><strong>Constraints</strong><ul>{task.constraints.map((item,index)=><li key={index}>{item}</li>)}</ul></section>}
    {!!task.examples?.length&&<section><strong>Examples</strong>{task.examples.map((item,index)=><pre className="coach-code-block" key={index}><code>{item}</code></pre>)}</section>}
  </>;
}
