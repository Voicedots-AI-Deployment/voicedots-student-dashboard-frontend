import {test,expect} from '@playwright/test';

// The lobby is display:none for the whole live interview. A <video> in a
// non-rendered subtree stops handing fresh MediaStream frames to
// detectForVideo/drawImage, so every proctoring signal -- face count, gaze,
// lighting, extra people and phone detection -- was being computed from a
// frozen pre-join frame once the call screen opened.
test('proctoring analysis follows the visible video element into the call screen',async({page})=>{
 test.setTimeout(120000);
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'test'},csrf_token:'test'}}));
 await page.route('**/interview.js*',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:await response.text()+`
  window.proctorAudit={source:()=>proctorVideoSource()?.id??null,callActive:()=>_isCallScreenActive()};
 `});
 });
 await page.goto('/interview.html?id=test');
 await expect.poll(()=>page.evaluate(()=>!!(window as any).proctorAudit)).toBe(true);

 // Give both elements a real, decoding stream so readyState/videoWidth are
 // genuine rather than stubbed.
 await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
  const context=canvas.getContext('2d')!;
  setInterval(()=>{context.fillStyle=`hsl(${Date.now()/10%360} 70% 50%)`;context.fillRect(0,0,320,240)},50);
  const stream=(canvas as any).captureStream(20) as MediaStream;
  for(const id of ['lobby-video','candidate-video']){
   const video=document.getElementById(id) as HTMLVideoElement;
   video.srcObject=stream;
   await video.play().catch(()=>{});
  }
 });
 await expect.poll(()=>page.evaluate(()=>{
  const ready=(id:string)=>{const v=document.getElementById(id) as HTMLVideoElement;return v.readyState>=2&&v.videoWidth>0};
  return ready('lobby-video')&&ready('candidate-video');
 })).toBe(true);

 expect(await page.evaluate(()=>(window as any).proctorAudit.callActive())).toBe(false);
 expect(await page.evaluate(()=>(window as any).proctorAudit.source())).toBe('lobby-video');

 await page.evaluate(()=>{
  (document.getElementById('prejoin-screen') as HTMLElement).style.display='none';
  (document.getElementById('call-screen') as HTMLElement).style.display='block';
 });
 expect(await page.evaluate(()=>(window as any).proctorAudit.callActive())).toBe(true);
 expect(await page.evaluate(()=>(window as any).proctorAudit.source())).toBe('candidate-video');
});

test('proctoring falls back to the other element when the visible one has no frames',async({page})=>{
 test.setTimeout(120000);
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'test'},csrf_token:'test'}}));
 await page.route('**/interview.js*',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:await response.text()+`
  window.proctorAudit={source:()=>proctorVideoSource()?.id??null};
 `});
 });
 await page.goto('/interview.html?id=test');
 await expect.poll(()=>page.evaluate(()=>!!(window as any).proctorAudit)).toBe(true);
 // Only the lobby element carries the stream; the call screen is open.
 await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
  canvas.getContext('2d')!.fillRect(0,0,320,240);
  const video=document.getElementById('lobby-video') as HTMLVideoElement;
  video.srcObject=(canvas as any).captureStream(20);
  await video.play().catch(()=>{});
  (document.getElementById('prejoin-screen') as HTMLElement).style.display='none';
  (document.getElementById('call-screen') as HTMLElement).style.display='block';
 });
 await expect.poll(()=>page.evaluate(()=>(window as any).proctorAudit.source())).toBe('lobby-video');
 expect(await page.evaluate(()=>{
  const candidate=document.getElementById('candidate-video') as HTMLVideoElement;
  return candidate.readyState>=2&&candidate.videoWidth>0;
 })).toBe(false);
});
