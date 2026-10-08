import {test,expect} from '@playwright/test';
for (const count of [1,2,3,4]) for (const width of [1440,390]) {
 test(`dynamic panel ${count} interviewers at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'test'},csrf_token:'test'}}));
  await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`window.panelAudit={set:setRequiredInterviewRounds};`});});
  await page.goto('/interview.html?id=test');
  await expect.poll(()=>page.evaluate(()=>!!(window as any).panelAudit)).toBe(true);
  await page.evaluate(count=>{
   (window as any).panelAudit.set(count);
   document.querySelectorAll('#prejoin-screen,#report-screen').forEach(el=>(el as HTMLElement).style.display='none');
   (document.querySelector('#call-screen') as HTMLElement).style.display='block';
  },count);
  await expect(page.locator('[data-panel-round]:visible')).toHaveCount(count);
  const camera=await page.locator('#pip-wrap').boundingBox();
  expect(camera!.x).toBeGreaterThanOrEqual(0);expect(camera!.x+camera!.width).toBeLessThanOrEqual(width+1);
  for(const agent of await page.locator('[data-panel-round]:visible').all()){
   const box=await agent.boundingBox();expect(box!.width).toBeGreaterThan(120);
   const overlaps=box!.x<camera!.x+camera!.width&&box!.x+box!.width>camera!.x&&box!.y<camera!.y+camera!.height&&box!.y+box!.height>camera!.y;
   expect(overlaps).toBe(false);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  await page.screenshot({path:`/root/voicedots/artifacts/interview-flow-audit-20261008/panel-${count}-${width}.png`});
 });
}
