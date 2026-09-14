import { test, expect } from '@playwright/test';
for (const [width,height] of [[1920,1080],[1366,768],[390,844]]) {
 test(`Interview layout ${width}x${height}`,async ({page})=>{
  await page.setViewportSize({width,height});
  await page.route('**/interview.js*',route=>route.abort());
  await page.goto('/interview.html');
  await page.evaluate(()=>{
   document.querySelectorAll('#prejoin-screen, #report-screen').forEach(el=>(el as HTMLElement).style.display='none');
   (document.querySelector('#call-screen') as HTMLElement).style.display='block';
  });
  const camera=await page.locator('#pip-wrap').boundingBox();
  const question=await page.locator('.question-focus').boundingBox();
  const controls=await page.locator('.call-controls').boundingBox();
  expect(camera!.width/camera!.height).toBeGreaterThan(1.3);
  expect(question!.y+question!.height).toBeLessThan(controls!.y);
  expect(controls!.y+controls!.height).toBeLessThan(height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  expect(await page.locator('.panel-agent--proctor').isVisible()).toBe(false);
  await page.screenshot({path:`test-results/interview-${width}.png`});
 });
}
