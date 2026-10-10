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
  if (type === 'poor_lighting') await page.clock.runFor(31000);
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

test('one clear face suppresses ambiguous body reminders while two faces still warn',async({page})=>{
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
 expect(events.filter((e:any)=>e.event_type==='multiple_people_unconfirmed')).toHaveLength(0);
 expect(await page.evaluate(()=>(window as any).visionAudit.passing())).toBe(true);
 await page.evaluate(()=>(window as any).visionAudit.faces(2));
 for(let i=0;i<8;i++){await page.evaluate(()=>(window as any).visionAudit.tick());await page.waitForTimeout(850);}
 const confirmed=await page.evaluate(()=>(window as any).visionEvents.filter((e:any)=>e.event_type==='multiple_people_visible'));
 expect(confirmed).toHaveLength(1);expect(confirmed[0].details.face_count).toBe(2);expect(confirmed[0].details.duration_ms).toBeGreaterThanOrEqual(5000);
});

test('phone evidence rejects single, weak and inconsistent detections and confirms a sustained corroborated phone', async ({page}) => {
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'s1'},csrf_token:'test'}}));
 await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`window.phoneAudit={update:updatePhoneEvidence,reset:()=>{phoneEvidence=null}};`});});
 await page.goto('/interview.html?id=sub-1');await expect.poll(()=>page.evaluate(()=>!!(window as any).phoneAudit)).toBe(true);
 const result=await page.evaluate(()=>{
  const h=(window as any).phoneAudit;const box={originX:200,originY:100,width:50,height:90};
  const detection=(score:number)=>({categories:[{categoryName:'cell phone',score}],boundingBox:box});
  const weak=Array.from({length:10},(_,i)=>h.update([detection(.4)],[box],i*800));h.reset();
  const isolated=[h.update([detection(.95)],[box],100),h.update([],[],900)];h.reset();
  const noCorroboration=Array.from({length:10},(_,i)=>h.update([detection(.95)],[],i*800));h.reset();
  const strong=Array.from({length:7},(_,i)=>h.update([detection(.95)],[box],i*800));
  return {weak,isolated,noCorroboration,strong};
 });
 expect(result.weak.some(Boolean)).toBe(false);expect(result.isolated.some(Boolean)).toBe(false);expect(result.noCorroboration.slice(0,3).some(Boolean)).toBe(false);expect(result.noCorroboration.at(-1)).toBe(true);
 expect(result.strong.slice(0,3).some(Boolean)).toBe(false);expect(result.strong.at(-1)).toBe(true);
});

test('camera reminders hide the misconduct badge and server zero clears optimistic warnings',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'s1'},csrf_token:'test'}}));
 await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`window.noticeAudit={remind:()=>{integrityStrikeCount=3;showIntegrityNotice('Camera check uncertain. This is not misconduct.',true)},reply:handleControlMessage,count:()=>integrityStrikeCount};`});});
 await page.goto('/interview.html?id=sub-1');await expect.poll(()=>page.evaluate(()=>!!(window as any).noticeAudit)).toBe(true);
 const result=await page.evaluate(()=>{const h=(window as any).noticeAudit;h.remind();const badgeHidden=(document.getElementById('integrity-strikes') as HTMLElement)?.hidden;h.reply({type:'integrity_event_recorded',total_flags:0});return {badgeHidden,count:h.count()};});
 expect(result.badgeHidden).toBe(true);expect(result.count).toBe(0);
});

test('hiding the native screen-share banner cannot create a focus warning', async ({page}) => {
 await page.route('**/api/**', route => route.fulfill({json:{student:{id:'s1'},csrf_token:'test'}}));
 await page.route('**/interview.js*', async route => {
  const response = await route.fetch();
  await route.fulfill({response,body:await response.text()+`
   window.focusAuditEvents=[];
   window.focusAudit={activate:()=>{
    proctoringActive=true; callScreen.style.display='flex';
    ws={readyState:WebSocket.OPEN,send:value=>window.focusAuditEvents.push(JSON.parse(value))};
    setupIntegrityMonitoring();
   },count:()=>integrityStrikeCount};
  `});
 });
 await page.goto('/interview.html?id=sub-1');
 await expect.poll(()=>page.evaluate(()=>!!(window as any).focusAudit)).toBe(true);
 await page.clock.install();
 await page.evaluate(()=>{
  (window as any).focusAudit.activate();
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
  document.hasFocus=()=>false;
  window.dispatchEvent(new Event('blur'));
 });
 await page.clock.runFor(200);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.clock.runFor(1800);
 expect(await page.evaluate(()=>(window as any).focusAuditEvents)).toEqual([]);
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 await page.clock.runFor(1800);
 const events=await page.evaluate(()=>(window as any).focusAuditEvents);
 expect(events).toHaveLength(1);
 expect(events[0]).toMatchObject({event_type:'window_blur_observed',severity:'info',details:{review_only:true}});
 expect(await page.evaluate(()=>(window as any).focusAudit.count())).toBe(0);
 await expect(page.locator('#integrity-toast')).not.toHaveClass(/show/);
 // A real hidden-tab event remains a violation.
 await page.evaluate(()=>{
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await page.clock.runFor(2100);
 expect(await page.evaluate(()=>(window as any).focusAuditEvents.some((e:any)=>e.event_type==='tab_hidden'&&e.severity==='violation'))).toBe(true);
});


test('phone evidence still warns in poor lighting with slow object inference',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'student-1'},csrf_token:'test'}}));
 await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
 window.dimPhoneAudit={setup:async()=>{
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
  canvas.getContext('2d').fillRect(0,0,640,480);
  userMediaStream=canvas.captureStream(20);lobbyVideoEl.srcObject=userMediaStream;await lobbyVideoEl.play();cameraTrackLive=true;
  faceLandmarker={detectForVideo:()=>({faceLandmarks:[null]})};frameLighting=()=>20;frameSharpness=()=>40;
  objectDetector={detectForVideo:async frame=>({detections:[{categories:[{categoryName:'cell phone',score:.9}],boundingBox:frame.width===640?{originX:200,originY:100,width:50,height:90}:{originX:84,originY:5,width:58,height:105}}]})};
  window.dimPhoneEvents=[];ws={readyState:WebSocket.OPEN,send:value=>window.dimPhoneEvents.push(JSON.parse(value))};proctoringActive=true;callScreen.style.display='flex';
 },tick:analyzeCameraFrame};`});});
 await page.goto('/interview.html?id=sub-1');await expect.poll(()=>page.evaluate(()=>!!(window as any).dimPhoneAudit)).toBe(true);
 await page.evaluate(()=>(window as any).dimPhoneAudit.setup());
 await page.clock.install();
 for(let i=0;i<4;i++){
  await page.evaluate(()=>(window as any).dimPhoneAudit.tick());
  await page.clock.runFor(4000);
 }
 const events=await page.evaluate(()=>(window as any).dimPhoneEvents);
 expect(events.some((e:any)=>e.event_type==='poor_lighting'&&e.severity==='info')).toBe(true);
 expect(events.filter((e:any)=>e.event_type==='phone_usage_detected')).toHaveLength(1);
 expect(events.filter((e:any)=>e.event_type==='multiple_people_visible')).toHaveLength(0);
});
