import {test,expect} from '@playwright/test';

test('practice media recovery never displays an AI proctor warning; placement still does',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({json:{student:{id:'test'},csrf_token:'test'}}));
 await page.route('**/interview.js*',async r=>{const response=await r.fetch();await r.fulfill({response,body:await response.text()+`
 window.recoveryAudit=(placement)=>{callScreen.style.display="block";proctoringActive=placement;handleControlMessage({type:'interview_resumed'});};
 `})});
 await page.goto('/interview.html?id=test');await page.waitForFunction(()=>!!(window as any).recoveryAudit);
 await page.evaluate(()=>(window as any).recoveryAudit(false));
 await expect(page.locator('#integrity-toast')).toBeHidden();
 await page.evaluate(()=>(window as any).recoveryAudit(true));
 await expect(page.locator('#integrity-toast')).toBeVisible();
});

test('second panel recovers a missed completion acknowledgment without cutting queued audio',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({json:{student:{id:'test'},csrf_token:'test'}}));
 await page.route('**/interview.js*',async r=>{const response=await r.fetch();await r.fulfill({response,body:await response.text()+`
 window.playbackAudit={
 start(){window.acks=[];resetPlaybackQueue();ws={readyState:WebSocket.OPEN,send(s){window.acks.push(JSON.parse(s))}};
 playbackAudioContext={state:'running',currentTime:0,destination:{},createBuffer(c,n,r){return {duration:n/r,getChannelData:()=>new Float32Array(n)}},createBufferSource(){return {connect(){},start(){},stop(){}}}};playbackAnalyser=null;
 handleControlMessage({type:'tts_begin',audio_epoch:2,text:'Tell me about your project',sample_rate:24000});schedulePCMChunk(new Int16Array(24000).buffer,2);},
 probe(epoch=2){handleControlMessage({type:'playback_status',audio_epoch:epoch,generation_complete:true})},
 advance(){playbackAudioContext.currentTime=2},state(){return {speaking:aiSpeaking,acks:window.acks}}};
 `})});
 await page.goto('/interview.html?id=test');await page.waitForFunction(()=>!!(window as any).playbackAudit);
 await page.clock.install();await page.evaluate(()=>(window as any).playbackAudit.start());
 await page.evaluate(()=>(window as any).playbackAudit.probe());await page.clock.runFor(100);
 expect((await page.evaluate(()=>(window as any).playbackAudit.state())).speaking).toBe(true);
 await page.evaluate(()=>(window as any).playbackAudit.advance());await page.clock.runFor(100);
 expect((await page.evaluate(()=>(window as any).playbackAudit.state())).speaking).toBe(false);
 await page.evaluate(()=>(window as any).playbackAudit.probe());
 let acks=(await page.evaluate(()=>(window as any).playbackAudit.state())).acks.filter((a:any)=>a.type==='playback_complete');expect(acks).toHaveLength(2);
 await page.evaluate(()=>(window as any).playbackAudit.probe(1));
 acks=(await page.evaluate(()=>(window as any).playbackAudit.state())).acks.filter((a:any)=>a.type==='playback_complete');expect(acks).toHaveLength(2);
});
