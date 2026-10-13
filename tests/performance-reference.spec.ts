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
