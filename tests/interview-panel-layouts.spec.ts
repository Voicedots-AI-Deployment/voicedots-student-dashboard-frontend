import {test,expect} from '@playwright/test';
for(const count of [1,2,3]){
 test(`${count} interviewers fill the stage with visible controls`,async({page})=>{
  await page.setViewportSize({width:1706,height:960});
  await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'panel-demo',full_name:'Candidate'},csrf_token:'test'}}));
  await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`window.layoutAudit=count=>{setRequiredInterviewRounds(count);document.getElementById('prejoin-screen').style.display='none';document.getElementById('call-screen').style.display='block';document.getElementById('live-chip').style.display='flex';document.getElementById('rnd-badge').textContent='Round 1/'+count;document.querySelector('.panel-agent').classList.add('active');document.getElementById('rnd-status').textContent='Connected (Live)';document.getElementById('rnd-name').textContent='Introduction';document.getElementById('current-question-text').textContent='Tell me about a project you worked on and the contribution you are most proud of.';document.querySelector('#pip-wrap video').style.display='none';document.getElementById('pip-cam-off').style.display='flex';};`});});
  await page.goto('/interview.html?id=panel-demo');
  await expect.poll(()=>page.evaluate(()=>!!(window as any).layoutAudit)).toBe(true);
  await page.evaluate(count=>(window as any).layoutAudit(count),count);
  await expect(page.locator('.panel-agent[data-panel-round]:not([hidden])')).toHaveCount(count);
  const stage=await page.locator('.interview-grid').boundingBox();
  const card=await page.locator('.panel-agent[data-panel-round]:not([hidden])').first().boundingBox();
  expect(card!.height).toBeGreaterThan(count===3?250:450);
  expect(card!.width).toBeGreaterThan(400);
  expect(card!.y+card!.height).toBeLessThan(stage!.y+stage!.height+2);
  await expect(page.locator('#end-interview-btn')).toBeVisible();
  await page.screenshot({path:`/root/voicedots/artifacts/interview-support-recording-panels-20261010/panel-${count}.png`});
  await page.setViewportSize({width:390,height:844});
  const bounds=await page.locator('.interview-grid').boundingBox();
  expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({path:`/root/voicedots/artifacts/interview-support-recording-panels-20261010/panel-${count}-mobile.png`});
 });
}
