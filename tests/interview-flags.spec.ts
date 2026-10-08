import { test, expect } from '@playwright/test';

for (const type of ['candidate_not_visible', 'multiple_people_visible', 'phone_usage_detected', 'poor_lighting', 'gaze_off_camera']) {
 test(`${type} records one incident and requires sustained recovery before another`, async ({page}) => {
  await page.route('**/api/**', route => route.fulfill({json:{student:{id:'student-1'},csrf_token:'test'}}));
  await page.route('**/interview.js*', async route => {
   const response = await route.fetch();
   await route.fulfill({response, body: await response.text() + `
    window.flagEvents = [];
    window.flagHarness = {
      activate: () => { proctoringActive = true; ws = {readyState: WebSocket.OPEN, send: message => window.flagEvents.push(JSON.parse(message))}; },
      warn: warnVisionSignal,
      clear: clearVisionSignal,
    };
   `});
  });
  await page.goto('/interview.html?id=sub-1');
  await expect.poll(() => page.evaluate(() => !!(window as any).flagHarness)).toBe(true);
  await page.clock.install();
  await page.evaluate(type => { const w=window as any;w.flagHarness.warn(type,'Before start',{});w.flagHarness.activate();w.flagHarness.warn(type,'Incident',{duration_ms:5000}); }, type);
  expect(await page.evaluate(() => (window as any).flagEvents.length)).toBe(1);
  for (let i=0; i<3; i++) {
   await page.clock.runFor(11000);
   await page.evaluate(type => (window as any).flagHarness.warn(type,'Still active',{}), type);
  }
  expect(await page.evaluate(() => (window as any).flagEvents.length)).toBe(1);
  await page.evaluate(type => {
   const h=(window as any).flagHarness;
   h.clear(type,true,0);h.clear(type,true,500);h.clear(type,false,600);
   h.clear(type,true,1000);h.clear(type,true,1800);
   h.warn(type,'A brief recovery must not split the event',{});
  },type);
  expect(await page.evaluate(() => (window as any).flagEvents.length)).toBe(1);
  await page.evaluate(type => {
   const h=(window as any).flagHarness;
   h.clear(type,true,3000);
   h.warn(type,'New incident after recovery',{});
  },type);
  expect(await page.evaluate(() => (window as any).flagEvents.length)).toBe(2);
 });
}

test('camera quality reminders never add strikes and phone warnings still do',async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'student-1'},csrf_token:'test'}}));
  await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
    window.qualityHarness={activate:()=>{proctoringActive=true;ws={readyState:WebSocket.OPEN,send:value=>(window.qualityEvents||(window.qualityEvents=[])).push(JSON.parse(value))}},warn:warnVisionSignal,strikes:()=>integrityStrikeCount};
  `});});
  await page.goto('/interview.html?id=sub-1');
  await expect.poll(()=>page.evaluate(()=>!!(window as any).qualityHarness)).toBe(true);
  await page.evaluate(()=>{const h=(window as any).qualityHarness;h.activate();h.warn('poor_lighting','Add light',{});h.warn('camera_blurry','Clean your camera',{});});
  expect(await page.evaluate(()=>(window as any).qualityHarness.strikes())).toBe(0);
  expect(await page.evaluate(()=>(window as any).qualityEvents.map((e:any)=>e.severity))).toEqual(['info','info']);
  await page.evaluate(()=>(window as any).qualityHarness.warn('phone_usage_detected','Put your phone away',{}));
  expect(await page.evaluate(()=>(window as any).qualityHarness.strikes())).toBe(1);
});


test('partial crop detections of the candidate are not counted as a second person', async ({page}) => {
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'student-1'},csrf_token:'test'}}));
 await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`window.personBoxAudit={same:samePersonBox,iou:boxIoU};`});});
 await page.goto('/interview.html?id=sub-1');
 await expect.poll(()=>page.evaluate(()=>!!(window as any).personBoxAudit)).toBe(true);
 const results=await page.evaluate(()=>{
  const h=(window as any).personBoxAudit;
  const candidate={originX:100,originY:20,width:300,height:440};
  const croppedTorso={originX:260,originY:150,width:120,height:200};
  const backgroundPerson={originX:420,originY:30,width:70,height:170};
  return {partialIoU:h.iou(candidate,croppedTorso),same:h.same(candidate,croppedTorso),distinct:h.same(candidate,backgroundPerson)};
 });
 expect(results.partialIoU).toBeLessThan(.3);
 expect(results.same).toBe(true);
 expect(results.distinct).toBe(false);
});

test('one face and ambiguous body detections stay review-only throughout the call',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'student-1'},csrf_token:'test'}}));
 await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
 window.visionAudit={setup:async()=>{
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
  const ctx=canvas.getContext('2d');ctx.fillRect(0,0,640,480);
  userMediaStream=canvas.captureStream(20);lobbyVideoEl.srcObject=userMediaStream;await lobbyVideoEl.play();cameraTrackLive=true;
  faceLandmarker={detectForVideo:()=>({faceLandmarks:[null]})};frameLighting=()=>120;frameSharpness=()=>40;
  objectDetector={detectForVideo:async()=>({detections:[{categories:[{categoryName:'person',score:.9}],boundingBox:{originX:120,originY:20,width:260,height:450}},{categories:[{categoryName:'person',score:.8}],boundingBox:{originX:430,originY:200,width:100,height:200}}]})};
  window.visionEvents=[];ws={readyState:WebSocket.OPEN,send:value=>window.visionEvents.push(JSON.parse(value))};proctoringActive=true;callScreen.style.display='flex';
 },faces:count=>{faceLandmarker={detectForVideo:()=>({faceLandmarks:Array(count).fill(null)})};},tick:analyzeCameraFrame,passing:()=>cameraAnalysisPassing};`});});
 await page.goto('/interview.html?id=sub-1');await expect.poll(()=>page.evaluate(()=>!!(window as any).visionAudit)).toBe(true);
 await page.evaluate(()=>(window as any).visionAudit.setup());
 for(let i=0;i<8;i++){await page.evaluate(()=>(window as any).visionAudit.tick());await page.waitForTimeout(850);}
 const events=await page.evaluate(()=>(window as any).visionEvents);
 expect(events.filter((e:any)=>e.event_type==='multiple_people_visible')).toHaveLength(0);
 expect(events.some((e:any)=>e.event_type==='multiple_people_unconfirmed'&&e.severity==='info')).toBe(true);
 expect(await page.evaluate(()=>(window as any).visionAudit.passing())).toBe(true);
 await page.evaluate(()=>(window as any).visionAudit.faces(2));
 for(let i=0;i<8;i++){await page.evaluate(()=>(window as any).visionAudit.tick());await page.waitForTimeout(850);}
 const confirmed=await page.evaluate(()=>(window as any).visionEvents.filter((e:any)=>e.event_type==='multiple_people_visible'));
 expect(confirmed).toHaveLength(1);expect(confirmed[0].details.face_count).toBe(2);expect(confirmed[0].details.duration_ms).toBeGreaterThanOrEqual(5000);
});
