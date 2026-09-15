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
