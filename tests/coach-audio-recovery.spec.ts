import {test, expect} from '@playwright/test';

test('Coach restores capture after permission suspension, worklet failure and a disconnected default microphone', async ({page}) => {
 await page.goto('/');
 await page.evaluate(async () => {
  const w = window as any;
  w.frames = []; w.errors = []; w.resumes = 0; w.replacements = 0; w.released = 0;
  const node = () => ({connect(){}, disconnect(){}});
  const track = {readyState:'live', stop(){w.released++}};
  const replacementTrack = {readyState:'live', stop(){w.released++}};
  const context:any = {state:'suspended', destination:{}, resume:async()=>{w.resumes++;context.state='running'}, createGain:()=>({...node(),gain:{value:0}}), createMediaStreamSource:node};
  w.AudioWorkletNode = class {port={onmessage:null};onprocessorerror:any;constructor(){w.capture=this}connect(){}disconnect(){}};
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{w.replacements++;return {getAudioTracks:()=>[replacementTrack],getTracks:()=>[replacementTrack]}}});
  const helperUrl = '/src/coach-audio-recovery.ts'; const helper = await import(helperUrl);
  w.dispose = helper.keepCoachMicrophone(context,{getAudioTracks:()=>[track],getTracks:()=>[track]} as any,(event:MessageEvent<Float32Array>)=>w.frames.push([...event.data]),(message:string)=>w.errors.push(message));
  w.track=track;w.context=context;
  w.capture.port.onmessage({data:new Float32Array([.25])});
 });
 expect(await page.evaluate(()=>(window as any).resumes)).toBeGreaterThan(0);
 await page.evaluate(()=>{const w=window as any;w.previous=w.capture;w.capture.onprocessorerror();w.capture.port.onmessage({data:new Float32Array([.5])})});
 expect(await page.evaluate(()=>{const w=window as any;return w.previous!==w.capture})).toBe(true);
 await page.evaluate(()=>(window as any).track.readyState='ended');
 await expect.poll(()=>page.evaluate(()=>(window as any).replacements)).toBe(1);
 await page.evaluate(()=>{const w=window as any;w.capture.port.onmessage({data:new Float32Array([.75])});w.dispose()});
 expect(await page.evaluate(()=>(window as any).frames)).toEqual([[.25],[.5],[.75]]);
 expect(await page.evaluate(()=>(window as any).errors)).toEqual([]);
 expect(await page.evaluate(()=>(window as any).released)).toBe(1);
});

test('Coach never acknowledges playback while the audio clock is paused',async({page})=>{
 await page.goto('/');
 await page.clock.install();
 await page.evaluate(async()=>{
  const w=window as any;w.completed=0;w.resumes=0;
  w.context={state:'suspended',currentTime:0,resume:async()=>{w.resumes++}};
  const helperUrl='/src/coach-audio-recovery.ts';const helper=await import(helperUrl);
  w.cancelAck=helper.coachPlaybackAck(w.context,1,()=>true,()=>w.completed++);
 });
 await page.clock.runFor(2000);
 expect(await page.evaluate(()=>(window as any).completed)).toBe(0);
 expect(await page.evaluate(()=>(window as any).resumes)).toBeGreaterThan(0);
 await page.evaluate(()=>{const w=window as any;w.context.state='running';w.context.currentTime=1.1});
 await page.clock.runFor(100);
 expect(await page.evaluate(()=>(window as any).completed)).toBe(1);
 await page.evaluate(()=>(window as any).cancelAck());
});

test('Coach releases a late replacement microphone when the lesson has already ended',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{
  const w=window as any;w.stopped=0;w.pending=null;
  const node=()=>({connect(){},disconnect(){}});
  w.AudioWorkletNode=class {port={onmessage:null};connect(){}disconnect(){}};
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:()=>new Promise(resolve=>{w.pending=resolve})});
  const context:any={state:'running',destination:{},resume:async()=>{},createGain:()=>({...node(),gain:{value:0}}),createMediaStreamSource:node};
  const helperUrl='/src/coach-audio-recovery.ts';const helper=await import(helperUrl);
  w.dispose=helper.keepCoachMicrophone(context,{getAudioTracks:()=>[{readyState:'ended'}],getTracks:()=>[]} as any,()=>{},()=>{});
 });
 await expect.poll(()=>page.evaluate(()=>Boolean((window as any).pending))).toBe(true);
 await page.evaluate(()=>{const w=window as any;w.dispose();w.pending({getTracks:()=>[{stop(){w.stopped++}}]})});
 await expect.poll(()=>page.evaluate(()=>(window as any).stopped)).toBe(1);
});

test('resuming paused Coach audio does not turn an unmuted microphone off',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const url='/src/coach-audio-recovery.ts',helper=await import(url);
  let resumes=0;
  const context:any={state:'suspended',resume:async()=>{resumes++;context.state='running'}};
  const preserve=helper.resumeCoachAudio(context,false);
  context.state='suspended';const unmuteNormally=helper.resumeCoachAudio(context,true);
  const toggleNormally=helper.resumeCoachAudio(context,false);
  return {preserve,unmuteNormally,toggleNormally,resumes};
 });
 expect(result).toEqual({preserve:true,unmuteNormally:false,toggleNormally:false,resumes:3});
});
