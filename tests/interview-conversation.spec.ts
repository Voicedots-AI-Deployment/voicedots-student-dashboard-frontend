import { test, expect, type Page } from '@playwright/test';

async function interview(page: Page) {
  await page.route('**/api/**', route => route.fulfill({ json: { student: { id: 'conversation-test' }, csrf_token: 'test' } }));
  await page.route('**/interview.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
      window.conversationAudit = {
        async report(report) {
          currentSessionId = 'session-1';
          document.getElementById('prejoin-screen').style.display = 'none';
          resultsScreen.style.display = 'block';
          renderResults(report);
          await loadAnswerFeedback(report);
        },
        start(placement) {
          photoVerifier.start = () => { window.proctorStarts = (window.proctorStarts || 0) + 1; };
          handleControlMessage({type:'interview_started',recording_enabled:placement,proctoring_enabled:placement});
          return proctoringActive;
        }
      };` });
  });
  await page.goto('/interview.html?id=conversation-test');
  await expect.poll(() => page.evaluate(() => !!(window as any).conversationAudit)).toBe(true);
}

const report = {
  status: 'released', overall_score: 65,
  question_reviews: [
    { answer_id: 7, question: 'How did you test the API?', answer: 'I tested all endpoints with pytest.' },
    { answer_id: 9, question: 'How did you handle failures?', answer: 'I checked the logs and retried requests.' },
    { answer_id: 10, question: 'What would you change?', answer: '' },
  ],
};

test('live review requests coaching and attaches feedback by answer ID', async ({ page }) => {
  await interview(page);
  await page.route('**/evaluation/question-feedback', route => {
    expect(route.request().method()).toBe('POST');
    return route.fulfill({ json: { complete: true, feedback: {
      '9': { what_worked: 'You described checking logs.', improve: 'Explain which error you investigated.' },
      '7': { what_worked: 'You named pytest and endpoint tests.', improve: 'Add one assertion and its result.' },
    } } });
  });
  await page.evaluate(report => (window as any).conversationAudit.report(report), report);
  const cards = page.locator('#results-question-reviews details');
  await cards.nth(0).locator('summary').click();
  await expect(cards.nth(0)).toContainText('Add one assertion and its result.');
  await expect(cards.nth(0)).not.toContainText('checking logs');
  await cards.nth(1).locator('summary').click();
  await expect(cards.nth(1)).toContainText('Explain which error you investigated.');
  await cards.nth(2).locator('summary').click();
  await expect(cards.nth(2)).toContainText('No answer was recorded');
});

test('feedback service failure offers a retry without discarding answers', async ({ page }) => {
  await interview(page);
  let requests = 0;
  await page.route('**/evaluation/question-feedback', route => {
    requests++;
    return route.fulfill(requests === 1 ? { status: 503, json: { detail: 'Temporarily unavailable' } } :
      { json: { complete: true, feedback: { '7': { improve: 'Show a test assertion.' } } } });
  });
  await page.evaluate(report => (window as any).conversationAudit.report(report), report);
  await page.getByRole('button', { name: 'Retry answer feedback' }).click();
  await expect(page.locator('#results-question-reviews')).toContainText('Show a test assertion.');
  await expect(page.locator('#results-question-reviews')).toContainText('I tested all endpoints with pytest.');
});

test('practice does not start AI proctor monitoring; placement does', async ({ page }) => {
  await interview(page);
  expect(await page.evaluate(() => (window as any).conversationAudit.start(false))).toBe(false);
  expect(await page.evaluate(() => (window as any).proctorStarts || 0)).toBe(0);
  expect(await page.evaluate(() => (window as any).conversationAudit.start(true))).toBe(true);
  expect(await page.evaluate(() => (window as any).proctorStarts)).toBe(1);
});

for (const [width, height] of [[1280, 720], [640, 480], [720, 1280]]) {
  test(`camera preview preserves native ${width}x${height} framing`, async ({ page }) => {
    await interview(page);
    const ratio = await page.evaluate(([width, height]) => {
      const video = document.querySelector('#lobby-video') as HTMLVideoElement;
      Object.defineProperty(video, 'videoWidth', { value: width });
      Object.defineProperty(video, 'videoHeight', { value: height });
      video.dispatchEvent(new Event('loadedmetadata'));
      return getComputedStyle(video.parentElement!).aspectRatio;
    }, [width, height]);
    expect(ratio).toBe(`${width} / ${height}`);
    await expect(page.locator('#lobby-video')).toHaveCSS('object-fit', 'contain');
  });
}
