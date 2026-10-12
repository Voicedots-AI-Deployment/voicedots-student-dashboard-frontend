import {test,expect} from '@playwright/test';

test('resume uploads persisted media before opening one new recorder, then saves the new segment',async({page})=>{
 const calls:string[]=[];
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.includes('/recording/'))calls.push(url.split('/recording/')[1]);
  await route.fulfill({json:url.endsWith('/authorize')?{url:'https://synthetic-storage.invalid/part'}:url.endsWith('/recording/start')?{status:'recording',started_at:new Date().toISOString()}:url.endsWith('/recording/finalize')?{status:'processing'}:{student:{id:'synthetic-recording'},csrf_token:'test'}});
 });
 await page.route('https://synthetic-storage.invalid/**',r=>r.fulfill({status:200,headers:{ETag:'synthetic-receipt','Access-Control-Expose-Headers':'ETag'}}));
 await page.route('**/interview.js*',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
   window.recordingResumeAudit=async()=>{
    currentSessionId='synthetic-recording';callScreen.style.display='block';interviewHasStarted=true;interviewStopRequested=false;
    recordingConsentEl.checked=true;interviewRecordingEnabled=true;
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;canvas.getContext('2d').fillRect(0,0,640,360);
    const ac=new AudioContext();await ac.resume();const dest=ac.createMediaStreamDestination();const tone=ac.createOscillator();tone.connect(dest);tone.start();
    userMediaStream=new MediaStream([...canvas.captureStream(15).getVideoTracks(),...dest.stream.getAudioTracks()]);recordingAudioDestination=dest;
    await recordingDbRequest('meta','readwrite',s=>s.put({id:currentSessionId+':previous',session:currentSessionId,segment:'previous',startedAt:Date.now()-30000,mimeType:'video/webm',parts:[],nextPart:1}));
    await recordingDbRequest('chunks','readwrite',s=>s.put({id:currentSessionId+':previous:0',session:currentSessionId,segment:'previous',sequence:0,createdAt:Date.now()-30000,blob:new Blob(['synthetic-persisted-media'],{type:'video/webm'})}));
    await Promise.all([startInterviewRecording(),startInterviewRecording()]);
    const recording=interviewRecorder?.state;await new Promise(r=>setTimeout(r,200));await stopInterviewRecording(true);
    const remaining=await recordingDbRequest('chunks','readonly',s=>s.getAll());
    userMediaStream.getTracks().forEach(t=>t.stop());await ac.close();
    return {recording,remaining:remaining.filter(x=>x.session===currentSessionId).length};
   };
  `});
 });
 await page.goto('/interview.html?id=synthetic-recording');await page.waitForFunction(()=>!!(window as any).recordingResumeAudit);
 expect(await page.evaluate(()=>(window as any).recordingResumeAudit())).toEqual({recording:'recording',remaining:0});
 expect(calls.filter(x=>x==='start')).toHaveLength(1);
 expect(calls.findIndex(x=>x.startsWith('parts/previous/'))).toBeLessThan(calls.indexOf('start'));
 expect(calls).toContain('finalize');
});
