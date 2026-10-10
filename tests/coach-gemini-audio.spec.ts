import {test,expect} from '@playwright/test';
for(const kind of ['lesson','widget'])for(const rate of [24000,48000,undefined,16000]){
 test(`${kind} Coach plays ${rate||'legacy'} sample rate and acknowledges the full audio`,async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'student-audit'},role_title:'Engineer',company_name:'Audit',plan:{goal:'Understand APIs',daily_roadmap:[]},messages:[]}}));
  await page.addInitScript(()=>{
   const w=window as any;w.rates=[];w.voicePackets=[];w.tracksStopped=0;w.voiceGains=[];w.audioStops=0;
   const node=()=>({connect(){},disconnect(){}});
   w.AudioContext=class {currentTime=0;state='running';destination={};audioWorklet={addModule:async()=>{}};resume=async()=>{};close=async()=>{this.state='closed'};createMediaStreamSource=node;createGain=()=>{const gain={...node(),gain:{value:0}};w.voiceGains.push(gain);return gain};createBuffer=(_c:number,n:number,r:number)=>{w.rates.push(r);return {duration:n/r,getChannelData:()=>new Float32Array(n)}};createBufferSource=()=>({...node(),start(){},stop(){w.audioStops++}})};
   w.AudioWorkletNode=class {port={onmessage:null};constructor(){w.coachCapture=this};connect(){}};
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>({getTracks:()=>[{stop(){w.tracksStopped++}}]})});
   w.WebSocket=class {static OPEN=1;readyState=1;bufferedAmount=0;onmessage:any;onclose:any;constructor(){w.coachSocket=this;}send(data:any){w.voicePackets.push(data instanceof ArrayBuffer?{audioBytes:data.byteLength}:JSON.parse(data))}close(){this.readyState=3}};
  });
  await page.goto('/');
  await page.evaluate(async(kind)=>{const url='/tests/fixtures/coach-audio-harness.tsx';const harness=await import(url);harness.mount(kind)},kind);
  await page.getByRole('button',{name:kind==='lesson'?'Connect with Neha':'Start voice lesson'}).click();
  await expect.poll(()=>page.evaluate(()=>Boolean((window as any).coachSocket?.onmessage))).toBe(true);
  await page.clock.install();
  await page.evaluate(rate=>{const socket=(window as any).coachSocket;socket.onmessage({data:JSON.stringify({type:'tts_begin',audio_epoch:1,text:'Let us work through this calmly.',sample_rate:rate})});const packet=new ArrayBuffer(48004);new DataView(packet).setUint32(0,1,false);socket.onmessage({data:packet});socket.onmessage({data:JSON.stringify({type:'tts_end',audio_epoch:1})})},rate);
  expect(await page.evaluate(()=>(window as any).rates)).toEqual([rate===24000?24000:48000]);
  await page.evaluate(()=>(window as any).coachCapture.port.onmessage({data:new Float32Array([.2,.3])}));
  expect(await page.evaluate(()=>(window as any).voicePackets.filter((p:any)=>p.audioBytes))).toEqual([{audioBytes:4}]);
  await page.getByRole('button',{name:'Mute coach voice',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).voiceGains[0].gain.value)).toBe(0);
  await page.getByRole('button',{name:'Unmute coach voice',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).voiceGains[0].gain.value)).toBe(1);

  expect(await page.evaluate(()=>(window as any).voicePackets.filter((p:any)=>p.type==='playback_complete'))).toHaveLength(0);
  await page.clock.runFor(rate===24000?1100:600);
  expect(await page.evaluate(()=>(window as any).voicePackets.filter((p:any)=>p.type==='playback_complete'))).toEqual([{type:'playback_complete',audio_epoch:1}]);

  await page.evaluate(()=>{const w=window as any;w.coachSocket.onmessage({data:JSON.stringify({type:'barge_in',audio_epoch:2})});const stale=new ArrayBuffer(48004);new DataView(stale).setUint32(0,1,false);w.coachSocket.onmessage({data:stale});});
  expect(await page.evaluate(()=>(window as any).audioStops)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>(window as any).rates)).toHaveLength(1);
  await page.getByRole('button',{name:kind==='lesson'?'End voice':'End lesson',exact:true}).first().click();
  expect(await page.evaluate(()=>(window as any).tracksStopped)).toBe(1);
 });
}
