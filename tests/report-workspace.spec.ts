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
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByText("Interview recording",{exact:true}).click();
  await expect(page.getByText('The recording retention period has ended.')).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:"/root/voicedots/artifacts/student-ui-20261007/student-report-corrected.png",fullPage:false});
  await page.getByRole('button',{name:'View placement result'}).click();
  await expect(page.getByRole('heading',{name:'Shortlisted'})).toBeVisible();
});

test('a mismatched resume name requires a choice before replacing the Main Resume', async ({page}) => {
  let uploads=0;
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/student-me')return route.fulfill({json:{student:{id:'student-1',full_name:'Asha Kumar',email:'asha@example.edu',allow_student_photo_upload:false}}});
    if(path==='/api/student/resume-library/identity-check')return route.fulfill({json:{matches:false,candidate_name:'PG Sreekanth',student_name:'Asha Kumar'}});
    if(path==='/api/student/resume-library'){
      if(route.request().method()==='POST'){uploads++;return route.fulfill({json:{resume_id:'file-1',submission_id:'submission-1',analysis_status:'ready'}});}
      return route.fulfill({json:{resumes:[]}});
    }
    if(path==='/api/student/resume-studio/resumes')return route.fulfill({json:[]});
    return route.fulfill({status:404,json:{detail:'Not found'}});
  });
  await page.goto('/profile');
  await page.getByLabel('Add resume',{exact:true}).setInputFiles({name:'resume.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 resume')});
  const dialog=page.getByRole('dialog',{name:'Check the resume name'});
  await expect(dialog).toContainText('PG Sreekanth');
  await expect(dialog).toContainText('Asha Kumar');
  expect(uploads).toBe(0);
  await dialog.getByRole('button',{name:'Choose another resume'}).click();
  await expect(dialog).toHaveCount(0);
  expect(uploads).toBe(0);
});
