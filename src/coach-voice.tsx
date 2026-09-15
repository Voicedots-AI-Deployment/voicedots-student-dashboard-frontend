import { useEffect, useRef, useState } from 'react';
import { Bot, Mic, MicOff, PhoneOff } from 'lucide-react';
import { apiUrl } from './api';
export function CoachVoice({planId,onComplete}:{planId:string;onComplete:()=>void}){
 const [status,setStatus]=useState('Ready for a lesson'),[active,setActive]=useState(false),[muted,setMuted]=useState(false),[caption,setCaption]=useState(''),[duration,setDuration]=useState('10');
 const cleanup=useRef<()=>void>(()=>{}),mute=useRef(false),generation=useRef(0),done=useRef(onComplete);done.current=onComplete;
 useEffect(()=>()=>{generation.current++;cleanup.current()},[planId]);
 async function start(){
  const token=++generation.current;setActive(true);setMuted(false);mute.current=false;setStatus('Connecting…');
  let stream:MediaStream|undefined,ctx:AudioContext|undefined,ws:WebSocket|undefined;let sources=new Set<AudioBufferSourceNode>(),epoch=0,next=0;let ack:ReturnType<typeof setTimeout>|undefined;
  const stopAudio=()=>{clearTimeout(ack);sources.forEach(s=>{try{s.stop()}catch{}});sources.clear();next=ctx?.currentTime||0};
  const stop=()=>{stopAudio();if(ws){ws.onclose=null;ws.onmessage=null;if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'end_interview'}));ws.close()}stream?.getTracks().forEach(t=>t.stop());if(ctx&&ctx.state!=='closed')void ctx.close()};
  cleanup.current=stop;
  const finish=(text:string)=>{stop();if(token===generation.current){setActive(false);setStatus(text);done.current()}};
  try{
   ctx=new AudioContext();await ctx.resume();stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});
   if(token!==generation.current){stop();return}
   await ctx.audioWorklet.addModule('/pcm-worklet-processor.js');if(token!==generation.current){stop();return}
   const url=new URL(apiUrl(`/ws/coach/${encodeURIComponent(planId)}?duration_minutes=${duration}`),window.location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
   ws=new WebSocket(url);ws.binaryType='arraybuffer';
   const node=new AudioWorkletNode(ctx,'pcm-capture-processor',{processorOptions:{targetSampleRate:16000}}),silent=ctx.createGain();silent.gain.value=0;ctx.createMediaStreamSource(stream).connect(node);node.connect(silent);silent.connect(ctx.destination);
   node.port.onmessage=e=>{if(ws?.readyState!==WebSocket.OPEN||mute.current||ws.bufferedAmount>256000)return;const values=e.data as Float32Array,bytes=new ArrayBuffer(values.length*2),view=new DataView(bytes);values.forEach((v,i)=>view.setInt16(i*2,Math.max(-1,Math.min(1,v))*(v<0?32768:32767),true));ws.send(bytes)};
   ws.onmessage=e=>{if(!ctx||token!==generation.current)return;
    if(e.data instanceof ArrayBuffer){const view=new DataView(e.data);if(view.byteLength<6||view.getUint32(0,false)!==epoch)return;const count=Math.floor((view.byteLength-4)/2),buffer=ctx.createBuffer(1,count,48000),data=buffer.getChannelData(0);for(let i=0;i<count;i++)data[i]=view.getInt16(4+i*2,true)/32768;const source=ctx.createBufferSource();source.buffer=buffer;source.connect(ctx.destination);next=Math.max(next,ctx.currentTime+.025);source.start(next);next+=buffer.duration;sources.add(source);source.onended=()=>sources.delete(source);return}
    let p;try{p=JSON.parse(e.data)}catch{return}
    if(p.type==='tts_begin'){stopAudio();epoch=p.audio_epoch;setCaption(p.text);setStatus('Coach is speaking')}
    if(p.type==='tts_end'&&p.audio_epoch===epoch){const ended=epoch;clearTimeout(ack);ack=setTimeout(()=>{if(ws?.readyState===WebSocket.OPEN&&epoch===ended){ws.send(JSON.stringify({type:'playback_complete',audio_epoch:ended}));setStatus('Listening to you')}},Math.max(0,(next-ctx.currentTime)*1000)+70)}
    if(p.type==='barge_in'||p.type==='audio_epoch'){stopAudio();epoch=p.audio_epoch;setStatus('Listening to you')}
    if(p.type==='partial_transcript'||p.type==='final_transcript')setCaption(p.text||'');
    if(p.type==='processing')setStatus('Preparing your explanation…');
    if(p.type==='coach_session_started')setStatus('Lesson connected');
    if(p.type==='error')finish(p.detail||'Voice connection interrupted. Try again.');
    if(p.type==='coach_session_complete')finish('Lesson complete. Your conversation is saved.');
   };
   ws.onerror=()=>finish('Could not connect to the voice coach. Please retry.');ws.onclose=()=>finish('Call ended. Completed turns are saved.');
  }catch(e){finish((e as Error).message||'Microphone access is required for a voice lesson.')}
 }
 return <section className={`coach-voice ${active?'is-active':''}`}><div className="voice-coach-stage"><div className="coach-avatar voice"><span><Bot size={42}/></span><i/><i/><i/></div><div><span className="eyebrow">LIVE AI COACH</span><h3>Talk through the role</h3><p>Ask questions, interrupt naturally, and work through your focus areas together.</p><p className="voice-status" role="status"><span/>{status}</p></div></div><div className="voice-controls"><label>Lesson length<select disabled={active} value={duration} onChange={e=>setDuration(e.target.value)}><option value="10">10 minutes</option><option value="20">20 minutes</option></select></label>{!active?<button aria-label="Start voice lesson" className="button primary" onClick={()=>void start()}><Mic size={17}/> Connect with coach</button>:<><button className="round-control" aria-label={muted?'Unmute microphone':'Mute microphone'} onClick={()=>{mute.current=!mute.current;setMuted(mute.current)}}>{muted?<MicOff/>:<Mic/>}</button><button className="round-control end" aria-label="End lesson" onClick={()=>{generation.current++;cleanup.current();setActive(false);setStatus('Call ended. Completed turns are saved.');done.current()}}><PhoneOff/></button></>}</div>{caption&&<p className="voice-caption">{caption}</p>}</section>
}
