import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { apiUrl } from "./api";

type AvatarState = "idle" | "connecting" | "listening" | "speaking" | "muted";

export function CoachAvatar({ state = "idle", compact = false }: { state?: AvatarState; compact?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    let player: { destroy?: () => Promise<void> | void } | undefined;
    const load = async () => {
      try {
        const importer = new Function("url", "return import(url)") as (url: string) => Promise<{ DotLottie: (new (config: Record<string, unknown>) => typeof player) & { setWasmUrl?: (url: string) => void } }>;
        const { DotLottie } = await importer("/vendor/dotlottie/index.js");
        if (disposed || !canvas.current) return;
        DotLottie.setWasmUrl?.("/vendor/dotlottie/dotlottie-player.wasm");
        player = new DotLottie({ canvas: canvas.current, src: "/assets/panel/hr-general.lottie", autoplay: true, loop: true, renderConfig: { autoResize: true, devicePixelRatio: window.devicePixelRatio } });
      } catch {
        return;
      }
    };
    void load();
    return () => { disposed = true; void player?.destroy?.(); };
  }, []);
  return <div className={`coach-lottie coach-lottie-${state}${compact ? " compact" : ""}`} aria-label="VoiceDot AI Coach"><div className="coach-lottie-frame"><canvas ref={canvas}/><span className="coach-avatar-fallback" aria-hidden="true">AI</span></div><i className="coach-orbit coach-orbit-one"/><i className="coach-orbit coach-orbit-two"/><i className="coach-orbit coach-orbit-three"/></div>;
}

export function CoachVoice({ planId, onComplete }: { planId: string; onComplete: () => void }) {
  const [status, setStatus] = useState("Ready to connect");
  const [phase, setPhase] = useState<AvatarState>("idle");
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState("");
  const [duration, setDuration] = useState("10");
  const cleanup = useRef<() => void>(() => {});
  const mute = useRef(false);
  const generation = useRef(0);
  const done = useRef(onComplete);
  done.current = onComplete;
  const active = phase !== "idle";

  useEffect(() => () => { generation.current += 1; cleanup.current(); }, [planId]);

  async function start() {
    const token = ++generation.current;
    setPhase("connecting"); setMuted(false); mute.current = false; setCaption(""); setStatus("Connecting securely…");
    let stream: MediaStream | undefined, ctx: AudioContext | undefined, ws: WebSocket | undefined;
    const sources = new Set<AudioBufferSourceNode>();
    let epoch = 0, next = 0, ack: ReturnType<typeof setTimeout> | undefined, finished = false;
    const stopAudio = () => { clearTimeout(ack); sources.forEach(source => { try { source.stop(); } catch { return; } }); sources.clear(); next = ctx?.currentTime || 0; };
    const stop = () => { stopAudio(); if (ws) { ws.onclose = null; ws.onmessage = null; ws.onerror = null; if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "end_interview" })); ws.close(); } stream?.getTracks().forEach(track => track.stop()); if (ctx && ctx.state !== "closed") void ctx.close(); };
    const finish = (text: string) => { if (finished) return; finished = true; stop(); if (token === generation.current) { setPhase("idle"); setMuted(false); setStatus(text); done.current(); } };
    cleanup.current = stop;
    try {
      ctx = new AudioContext(); await ctx.resume();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      if (token !== generation.current) return stop();
      await ctx.audioWorklet.addModule("/pcm-worklet-processor.js");
      if (token !== generation.current) return stop();
      const url = new URL(apiUrl(`/ws/coach/${encodeURIComponent(planId)}?duration_minutes=${duration}`), window.location.href); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(url); ws.binaryType = "arraybuffer";
      const node = new AudioWorkletNode(ctx, "pcm-capture-processor", { processorOptions: { targetSampleRate: 16000 } }), silent = ctx.createGain();
      silent.gain.value = 0; ctx.createMediaStreamSource(stream).connect(node); node.connect(silent); silent.connect(ctx.destination);
      node.port.onmessage = event => { if (ws?.readyState !== WebSocket.OPEN || mute.current || ws.bufferedAmount > 256000) return; const values = event.data as Float32Array, bytes = new ArrayBuffer(values.length * 2), view = new DataView(bytes); values.forEach((value, index) => view.setInt16(index * 2, Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767), true)); ws.send(bytes); };
      ws.onmessage = event => {
        if (!ctx || token !== generation.current) return;
        if (event.data instanceof ArrayBuffer) { const view = new DataView(event.data); if (view.byteLength < 6 || view.getUint32(0, false) !== epoch) return; const count = Math.floor((view.byteLength - 4) / 2), buffer = ctx.createBuffer(1, count, 48000), data = buffer.getChannelData(0); for (let index = 0; index < count; index += 1) data[index] = view.getInt16(4 + index * 2, true) / 32768; const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination); next = Math.max(next, ctx.currentTime + .025); source.start(next); next += buffer.duration; sources.add(source); source.onended = () => sources.delete(source); return; }
        let payload: Record<string, any>; try { payload = JSON.parse(event.data); } catch { return; }
        if (payload.type === "tts_begin") { stopAudio(); epoch = payload.audio_epoch; setCaption(payload.text || ""); setPhase("speaking"); setStatus("Coach is speaking"); }
        if (payload.type === "tts_end" && payload.audio_epoch === epoch) { const ended = epoch; clearTimeout(ack); ack = setTimeout(() => { if (ws?.readyState === WebSocket.OPEN && epoch === ended) { ws.send(JSON.stringify({ type: "playback_complete", audio_epoch: ended })); setPhase(mute.current ? "muted" : "listening"); setStatus(mute.current ? "Microphone muted" : "Listening to you"); } }, Math.max(0, (next - ctx!.currentTime) * 1000) + 70); }
        if (payload.type === "barge_in" || payload.type === "audio_epoch") { stopAudio(); epoch = payload.audio_epoch; setPhase(mute.current ? "muted" : "listening"); setStatus(mute.current ? "Microphone muted" : "Listening to you"); }
        if (payload.type === "partial_transcript" || payload.type === "final_transcript") setCaption(payload.text || "");
        if (payload.type === "processing") { setPhase("connecting"); setStatus("Coach is thinking…"); }
        if (payload.type === "coach_session_started") { setPhase("listening"); setStatus("Listening to you"); }
        if (payload.type === "error") finish(payload.detail || "Voice connection interrupted. Try again.");
        if (payload.type === "coach_session_complete") finish("Session complete. Your conversation is saved.");
      };
      ws.onerror = () => finish("Could not connect to the voice coach. Please retry.");
      ws.onclose = () => finish("Call ended. Completed turns are saved.");
    } catch (error) { finish((error as Error).message || "Microphone access is required for a voice lesson."); }
  }

  function toggleMute() { mute.current = !mute.current; setMuted(mute.current); setPhase(mute.current ? "muted" : "listening"); setStatus(mute.current ? "Microphone muted" : "Listening to you"); }
  function end() { generation.current += 1; cleanup.current(); setPhase("idle"); setMuted(false); setStatus("Call ended. Completed turns are saved."); done.current(); }

  return <section className={`coach-session ${active ? "is-active" : ""}`} aria-label="AI Coach voice session"><div className="coach-session-stage"><CoachAvatar state={phase}/><div className="coach-session-copy"><span className="eyebrow">LIVE AI COACH</span><h2>{active ? "Your coach is here" : "Talk it through with your coach"}</h2><p>Ask for an explanation, practise an answer, or interrupt naturally when you want to go deeper.</p><div className={`coach-call-state state-${phase}`} role="status">{phase === "speaking" ? <Volume2 size={16}/> : muted ? <MicOff size={16}/> : <Mic size={16}/>}<span>{status}</span></div></div></div>{caption && <p className="coach-live-caption" aria-live="polite">{caption}</p>}<div className="coach-session-controls">{!active ? <><label>Session length<select value={duration} onChange={event => setDuration(event.target.value)}><option value="10">10 minutes</option><option value="20">20 minutes</option></select></label><button aria-label={`Connect to AI Coach for ${duration} minutes`} className="button coach-connect" onClick={() => void start()}><Mic size={18}/> Connect · {duration} mins</button></> : <><button className={`coach-call-control ${muted ? "is-muted" : ""}`} aria-label={muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={muted} onClick={toggleMute}>{muted ? <MicOff/> : <Mic/>}<span>{muted ? "Unmute" : "Mute"}</span></button><button className="coach-call-control end" aria-label="End coaching session" onClick={end}><PhoneOff/><span>End</span></button></>}</div></section>;
}
