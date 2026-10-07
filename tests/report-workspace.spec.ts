import { test, expect } from '@playwright/test';

test('released report uses native sections with question feedback and a private placement result', async ({page}) => {
  await page.route('**/api/**', route => {
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/student-me')return route.fulfill({json:{student:{id:'student-1',full_name:'Asha Kumar',email:'asha@example.edu'}}});
    if(path==='/api/student/reports')return route.fulfill({json:{reports:[{evaluation_id:'evaluation-1',session_id:'session-1',submission_id:'submission-1',status:'released',target_role:'Backend Engineer',drive_id:'drive-1',company_name:'Example',placement_decision:'shortlist',report:{overall_score:82,executive_summary:'Remove this repeated summary.'}}]}});
    if(path==='/api/interview/session-1/evaluation')return route.fulfill({json:{overall_score:82,readiness:'Interview Ready',score_breakdown:{Communication:75,Technical:90},strengths:[{text:'Clear API example',cites_answer_id:1}],priority_improvement_areas:[{focus:'Testing',problem:'Explain the edge cases.',actions:['Practise an invalid input example.']}],question_reviews:[{answer_id:1,turn_id:'turn-1',has_audio:true,question:'Explain your API design.',answer:'I validated incoming data.',evidence_status:'answered',strength_feedback:['Clear API example'],improvement_feedback:['Include an error response example.']}]}});
    if(path.endsWith('/question-feedback'))return route.fulfill({json:{feedback:{'1':{evidence_quote:'validated incoming data',what_worked:'You explained validation.',improve:'Include an error response example.'}},complete:true}});
    if(path.endsWith('/recording'))return route.fulfill({json:{status:'expired',playback_url:null,message:'The recording retention period has ended.'}});
    if(path.endsWith('/audio'))return route.fulfill({contentType:'audio/wav',body:Buffer.from('RIFFwave')});
    return route.fulfill({status:404,json:{detail:'Not found'}});
  });
  await page.goto('/reports');
  await expect(page.getByText('Remove this repeated summary.')).toHaveCount(0);
  await expect(page.getByText('Shortlisted',{exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'Open report for Backend Engineer'}).click();
  await expect(page).toHaveURL(/\/reports\/session-1$/);
  await expect(page.getByRole('heading',{name:'Shortlisted'})).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'What went well'})).toBeVisible();
  await page.getByRole('button',{name:'Questions & feedback (1)'}).click();
  await expect(page.getByText('I validated incoming data.')).toBeVisible();
  await expect(page.getByText('Include an error response example.')).toBeVisible();
  await expect(page.getByText('From your answer:',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Listen to your answer'}).click();
  await expect(page.getByLabel('Your recorded answer')).toHaveAttribute('src',/^blob:/);
  await page.getByRole('button',{name:'Recording & audio'}).click();
  await expect(page.getByText('The recording retention period has ended.')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
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
