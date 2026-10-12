import {test,expect} from '@playwright/test';

test('heartbeat continues during playback and stops with its own socket', async ({page}) => {
  await page.route('**/api/**',r=>r.fulfill({json:{student:{id:'heartbeat-test'},csrf_token:'test'}}));
  await page.route('**/interview.js*',async route=> {
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      window.heartbeatAudit={start(){
        window.heartbeatMessages=[];
        const Native=window.WebSocket;
        class FakeSocket {static OPEN=1;readyState=1;send(data){window.heartbeatMessages.push(JSON.parse(data));}}
        window.WebSocket=FakeSocket;
        currentSessionId='heartbeat-test';preflightId='test';interviewHasStarted=true;
        interviewStopRequested=false;sessionCompletedCleanly=false;integrityEndRequested=false;
        aiSpeaking=true;connectInterviewSocket();window.heartbeatSocket=ws;ws.onopen();
        window.WebSocket=Native;
      },stop(){interviewStopRequested=true;window.heartbeatSocket.onclose({code:1000});}}
    `});
  });
  await page.goto('/interview.html?id=heartbeat-test');
  await expect.poll(()=>page.evaluate(()=>!!(window as any).heartbeatAudit)).toBe(true);
  await page.clock.install();
  await page.evaluate(()=>(window as any).heartbeatAudit.start());
  await page.clock.runFor(6000);
  expect(await page.evaluate(()=>(window as any).heartbeatMessages.filter((x:any)=>x.type==='heartbeat').length)).toBe(4);
  await page.evaluate(()=>(window as any).heartbeatAudit.stop());
  await page.clock.runFor(6000);
  expect(await page.evaluate(()=>(window as any).heartbeatMessages.filter((x:any)=>x.type==='heartbeat').length)).toBe(4);
});
