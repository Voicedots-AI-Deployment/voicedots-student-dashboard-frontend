import { test, expect } from '@playwright/test';

test('released interview report stays in the portal and shows its real placement decision', async ({page}) => {
  await page.route('**/api/**', route => {
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/student-me')return route.fulfill({json:{student:{id:'student-1',full_name:'Asha Kumar',email:'asha@example.edu'}}});
    if(path==='/api/student/reports')return route.fulfill({json:{reports:[{evaluation_id:'evaluation-1',session_id:'session-1',submission_id:'submission-1',status:'released',target_role:'Backend Engineer',drive_id:'drive-1',company_name:'Example',placement_decision:'shortlisted',report:{overall_score:82}}]}});
    if(path.endsWith('/report.html'))return route.fulfill({contentType:'text/html',body:'<h1>Full assessment</h1><p>Question: Explain your API design.</p>'});
    if(path.endsWith('/recording'))return route.fulfill({json:{status:'expired',playback_url:null,message:'The recording retention period has ended.'}});
    return route.fulfill({status:404,json:{detail:'Not found'}});
  });
  await page.goto('/reports');
  await page.getByRole('link',{name:'Open report for Backend Engineer'}).click();
  await expect(page).toHaveURL(/\/reports\/session-1$/);
  await expect(page.frameLocator('iframe[title="Complete interview report and questions"]').getByRole('heading',{name:'Full assessment'})).toBeVisible();
  await expect(page.getByText('The recording retention period has ended.')).toBeVisible();
  await page.getByRole('button',{name:'View placement result'}).click();
  await expect(page.getByRole('heading',{name:'Shortlisted'})).toBeVisible();
});
