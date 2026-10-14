import { test, expect } from '@playwright/test';
import { full, empty, student } from '../preview/performance-data';
import { detail } from '../preview/vite.config';
test.beforeEach(async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:{}}));
 await page.route('**/api/auth/student-me',route=>route.fulfill({json:{student}}));
 await page.route('**/api/student/performance/overview',route=>route.fulfill({json:full}));
 await page.route('**/api/student/performance',route=>route.fulfill({json:detail}));
 await page.route('**/api/student/scorecard-shares',route=>route.fulfill({json:{items:[]}}));
});
test('reference layout uses released scores, configured targets and question evidence',async({page})=>{
 await page.goto('/performance');
 await expect(page.getByRole('heading',{name:'Student Assessment Intelligence'})).toBeVisible();
 await expect(page.getByText('+35 points',{exact:true})).toBeVisible();
 await expect(page.getByRole('cell',{name:'Explain your project architecture'})).toBeVisible();
 await expect(page.getByRole('meter',{name:'Communication'})).toHaveAttribute('aria-valuenow','66.7');
 await expect(page.getByRole('link',{name:'Download report'})).toHaveAttribute('href','/api/interview/s-3/evaluation/report.pdf');
 await page.getByRole('button',{name:'Share scorecard'}).first().click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByLabel('Link expiry')).toHaveValue('7');
 await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('missing comparable data and targets are not invented; unreleased results stay hidden',async({page})=>{
 await page.route('**/api/student/performance',route=>route.fulfill({json:{...detail,comparable_change:null,comparable_trend:[],competencies:[{key:'technical',name:'Technical',score:0,target:null}]}}));
 await page.goto('/performance');await expect(page.getByText('Needs two comparable assessments')).toBeVisible();
 await expect(page.getByRole('meter',{name:'Technical'})).toHaveAttribute('aria-valuenow','0');
 await page.route('**/api/student/performance/overview',route=>route.fulfill({json:{...empty,pending_release_count:1}}));
 await page.reload();await expect(page.getByText('Your completed interviews are still being reviewed.',{exact:false})).toBeVisible();
 await expect(page.getByRole('cell',{name:'Explain your project architecture'})).toHaveCount(0);
});
test('desktop and mobile spacing stays within the page; chart score stays centered',async({page})=>{
 for(const width of [1600,1366,768,390,320]){
  await page.setViewportSize({width,height:1000});await page.goto('/performance');
  await expect(page.getByRole('heading',{name:'Competency vs role target'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  const ring=await page.locator('.spi-ring').boundingBox(),center=await page.locator('.spi-ring>div').boundingBox();
  expect(Math.abs(ring!.x+ring!.width/2-center!.x-center!.width/2)).toBeLessThan(1);
  if(width===1600||width===390)await page.screenshot({path:`/root/voicedots/artifacts/student-performance-reference-20261013/dashboard-${width}.png`,fullPage:true});
 }
});

test('long recommendations and distinct duplicate labels stay readable at every reference width',async({page})=>{
 const skills=[{key:'communication',name:'Communication',score:25,target:80},{key:'communication_skills',name:'Communication',score:25,target:70},...Array.from({length:11},(_,i)=>({key:`dimension_${i}`,name:`Assessment competency ${i+1}`,score:i*5,target:null}))];
 const actions=[{focus:'Structured thinking',action:'Use a simple Situation → Action → Result shape for behavioural answers. Include your responsibility and the specific evidence of the outcome. '.repeat(3)},{focus:'Structured thinking',action:'Before answering, take one breath and mentally outline two or three points you will cover, in order.'},{focus:'Communication',action:'Explain how you tested the workflow and verified the result.'}];
 await page.route('**/api/student/performance',route=>route.fulfill({json:{...detail,competencies:skills}}));
 await page.route('**/api/student/performance/overview',route=>route.fulfill({json:{...full,actions}}));
 await page.goto('/performance');
 await expect(page.locator('.spi-competencies tbody tr')).toHaveCount(13);
 await expect(page.locator('.spi-dimension')).toHaveText(['Assessment dimension: communication','Assessment dimension: communication skills']);
 await expect(page.locator('.spi-plan>li')).toHaveCount(2);
 await expect(page.locator('.spi-plan>li').first().locator('ul>li')).toHaveCount(2);
 for(const width of [1920,1440,1366,1024,768,390]){
  await page.setViewportSize({width,height:1000});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  const progress=await page.getByRole('heading',{name:'Comparable interview progress'}).locator('..').boundingBox();expect(progress!.height).toBeLessThan(650);
  const sharing=await page.getByRole('heading',{name:'Sharing & employer access'}).locator('..').boundingBox();expect(sharing!.height).toBeLessThan(650);
  await page.screenshot({path:`/root/voicedots/artifacts/dashboard-layout-20261014/student-${width}.png`,fullPage:true});
 }
 await page.getByRole('button',{name:'Share scorecard'}).last().click();
 await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('card grids use consistent spacing and aligned boundaries at each breakpoint',async({page})=>{
 await page.goto('/performance');await expect(page.locator('.spi-kpis')).toBeVisible();

 for(const width of [1920,1440,1366,1024,768,390]){
  await page.setViewportSize({width,height:1050});
  const selector='.spi-kpis,.spi-analysis,.spi-bottom';
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  const grids=await page.locator(selector).evaluateAll(elements=>elements.map(element=>{
   const style=getComputedStyle(element);return {gap:parseFloat(style.gap),cards:Array.from(element.children).map(child=>{const r=child.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}})};
  }));
  for(const grid of grids){expect(grid.gap).toBe(width<=700?12:16);for(const card of grid.cards){const sameRow=grid.cards.filter(other=>Math.abs(other.top-card.top)<1);for(const other of sameRow)expect(Math.abs(other.bottom-card.bottom)).toBeLessThan(2);}}
  await page.screenshot({path:`/root/voicedots/artifacts/dashboard-grid-20261014/student-${width}.png`,fullPage:true});
 }
});
