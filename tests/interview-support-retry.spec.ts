import { test, expect } from '@playwright/test';

for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
 test(`support retry offers one choice and preserves the question at ${viewport.width}px`, async({page})=>{
  await page.setViewportSize(viewport);
  await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'retry-audit'},csrf_token:'test'}}));
  await page.route('**/interview.js*',async route=>{
   const response=await route.fetch();
   await route.fulfill({response,body:await response.text()+`
    window.retryAudit={handle:handleControlMessage,start(){
      prejoinScreen.style.display='none';callScreen.style.display='flex';
      window.retryMessages=[];
      ws={readyState:WebSocket.OPEN,send:value=>window.retryMessages.push(JSON.parse(value))};
      currentQuestionTextEl.textContent='How did you check the labels?';
    }};
   `});
  });
  await page.goto('/interview.html?id=retry-audit');
  await expect.poll(()=>page.evaluate(()=>!!(window as any).retryAudit)).toBe(true);
  await page.evaluate(()=>{
   const h=(window as any).retryAudit;h.start();
   h.handle({type:'support_retry',state:'offered',question_text:'How did you check the labels?'});
  });
  await expect(page.locator('#support-retry-controls')).toBeVisible();
  await expect(page.getByRole('button',{name:'Yes, try again'})).toBeDisabled();
  await page.evaluate(()=>(window as any).retryAudit.handle({type:'support_retry',state:'awaiting_choice'}));
  await expect(page.locator('#support-retry-status')).toContainText('Say yes');
  await page.getByRole('button',{name:'Yes, try again'}).click();
  expect(await page.evaluate(()=>(window as any).retryMessages)).toEqual([{type:'support_retry_choice',choice:'retry'}]);
  await expect(page.getByRole('button',{name:'Yes, try again'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Continue interview'})).toBeDisabled();
  await page.evaluate(()=>(window as any).retryAudit.handle({type:'support_retry',state:'retrying'}));
  await expect(page.locator('#support-retry-controls')).toBeHidden();
  await expect(page.locator('#current-question-text')).toHaveText('How did you check the labels?');
  await page.evaluate(()=>(window as any).retryAudit.handle({type:'support_retry',state:'awaiting_choice'}));
  await page.getByRole('button',{name:'Continue interview'}).click();
  expect((await page.evaluate(()=>(window as any).retryMessages)).at(-1)).toEqual({type:'support_retry_choice',choice:'continue'});
  await page.evaluate(()=>(window as any).retryAudit.handle({type:'support_retry',state:'complete'}));
  await expect(page.locator('#support-retry-controls')).toBeHidden();
 });
}
