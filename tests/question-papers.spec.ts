import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/student-me') return route.fulfill({ json: { student: {
      id: 'demo', full_name: 'Demo Student', photo_url: '/photo', current_resume_submission_id: 'resume',
    } } });
    if (path === '/api/student/study-resources') return route.fulfill({ json: {
      status: 'ready', match_status: 'matched', subjects: [{
        id: 'networks', code: 'DEMO-CS501', name: 'Computer Networks (Demo)', year_number: 3,
        semester_number: 5, lecture_hours: 3, tutorial_hours: 0, practical_hours: 0, credits: 3,
        syllabus_id: 'syllabus', syllabus_version: 1, document_filename: null, resources: [],
        syllabus_content: { units: [{ id: 'unit', code: 'U1', title: 'Network fundamentals' }],
          topics: [{ id: 'topic', unit_id: 'unit', code: 'T1', title: 'OSI reference model' }],
          cos: [{ id: 'co', code: 'CO1', title: 'Explain layered network communication' }] },
      }],
    } });
    if (path === '/api/student/study-resources/questions') return route.fulfill({ json: {
      items: [{ id: 'question', version: 1, question_text: 'Explain packet switching.',
        question_type: 'SHORT_ANSWER', marks: 2, options: [], bloom_level: 'K2', difficulty: 'EASY' }],
      total: 1, limit: 50, offset: 0,
    } });
    return route.fulfill({ json: {} });
  });
});

test('student can read a subject syllabus and its released question bank', async ({ page }) => {
  await page.goto('/question-papers');
  await expect(page.getByText('OSI reference model', { exact: true })).toBeVisible();
  await expect(page.getByText('Explain layered network communication', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Question bank/ }).click();
  await expect(page.getByText('Explain packet switching.', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search practice questions' }).fill('unmatched');
  await expect(page.getByText('No matching questions', { exact: true })).toBeVisible();
});

test('legacy resource links redirect and mobile content fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/study-resources');
  await expect(page).toHaveURL(/\/question-papers$/);
  await expect(page.getByText('OSI reference model', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('unmatched profiles get an explanation without question content', async ({ page }) => {
  await page.route('**/api/student/study-resources', route => route.fulfill({ json: {
    status: 'unavailable', match_status: 'ambiguous', message: 'Ask your institution to select your curriculum.', subjects: [],
  } }));
  await page.goto('/question-papers');
  await expect(page.getByText('Your curriculum needs a selection', { exact: true })).toBeVisible();
  await expect(page.getByText('Explain packet switching.', { exact: true })).toHaveCount(0);
});
