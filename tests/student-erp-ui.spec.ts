import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/student-me') return route.fulfill({ json: { student: { id:'ui-student', full_name:'Asha Kumar', roll_number:'00123', email:'asha@example.test', college_name:'Example College' } } });
    if (path.startsWith('/api/student/erp/')) return route.fulfill({ json: { student:{full_name:'Asha Kumar',roll_number:'00123'},items:[],has_more:false } });
    return route.fulfill({json:{}});
  });
  await page.goto('/erp');
});

test('shows eleven services in three groups with student identity', async ({ page }) => {
  await expect(page.locator('.student-erp-service')).toHaveCount(11);
  await expect(page.locator('.student-erp-group')).toHaveCount(3);
  await expect(page.locator('.student-erp-identity')).toContainText('Asha Kumar');
  await expect(page.locator('.student-erp-identity')).toContainText('00123');
});

test('card lifts and enlarges on desktop hover', async ({ page }) => {
  await page.setViewportSize({width:1440,height:1000});
  const card=page.locator('.student-erp-service').first();
  await card.hover();
  await expect.poll(()=>card.evaluate(el=>getComputedStyle(el).transform)).not.toBe('none');
  const scale=await card.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a);
  expect(scale).toBeGreaterThan(1);
});

test('respects reduced motion', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const card=page.locator('.student-erp-service').first();
  await card.hover();
  await expect.poll(()=>card.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
});

test('mobile cards fit without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.student-erp-service')).toHaveCount(11);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const card=await page.locator('.student-erp-service').first().boundingBox();
  expect(card!.width).toBeLessThanOrEqual(390);
});

test('whole card opens its ERP service', async ({ page }) => {
  await page.locator('.student-erp-service[href="/erp/timetable"]').click();
  await expect(page).toHaveURL(/\/erp\/timetable$/);
  await expect(page.getByRole('heading',{name:'Class Timetable',exact:true}).first()).toBeVisible();
  await expect(page.getByText('No records available', {exact:true})).toBeVisible();
});
