import {test,expect} from '@playwright/test';
test('report table actions, interview details, decision date and question sharing',async({page})=>{
 let submitted:any;
 await page.route('**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 if(path==='/api/auth/student-me')return route.fulfill({json:{student:{id:'s1',full_name:'Asha',roll_number:'CS01',email:'a@example.edu'}}});
 if(path==='/api/student/reports')return route.fulfill({json:{reports:[{evaluation_id:'e1',session_id:'i1',drive_id:'d1',company_name:'Example',target_role:'Engineer',status:'released',created_at:'2026-10-06',duration_minutes:30,attempt_number:2,placement_decision:'shortlist',placement_decided_at:'2026-10-07T12:00:00Z',report:{overall_score:46}}]}});
 if(path==='/api/interview/i1/evaluation')return route.fulfill({json:{overall_score:46,question_reviews:[]}});
 if(path.endsWith('/recording'))return route.fulfill({json:{status:'unavailable',playback_url:null}});
 if(path.endsWith('/question-contribution')){submitted=route.request().postDataJSON();return route.fulfill({json:{count:1}})}
 return route.fulfill({json:{}});
 });
 await page.goto('/reports');await page.getByRole('button',{name:'Table',exact:true}).click();
 await expect(page.getByText('Your interview reports',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('columnheader',{name:'Actions'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Download report for Engineer'})).toHaveAttribute('href',/i1\/evaluation\/report.pdf/);
 await page.getByRole('link',{name:'Open report for Engineer'}).click();
 await expect(page.getByText('Shortlisted on 7 Oct 2026')).toBeVisible();
 await expect(page.getByText('30 minutes',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Help future students prepare'}).click();
 await page.getByRole('button',{name:'Add manually'}).click();
 await page.getByRole('textbox',{name:'Question',exact:true}).fill('How do you design an API?');
 await page.getByRole('button',{name:'Add question',exact:true}).click();
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm and submit'}).click();
 await expect(page.getByRole('status').filter({hasText:'1 question added'})).toBeVisible();
 expect(submitted.questions[0].question_text).toBe('How do you design an API?');
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 await page.setViewportSize({width:1440,height:900});await page.getByRole('link',{name:'Open my profile'}).click();await expect(page).toHaveURL(/\/profile$/);
});
test('profile refresh picks up new roster photo permission without another login',async({page})=>{
 let identityReads=0;
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
 if(path==='/api/auth/student-me')return route.fulfill({json:{student:{id:'s1',full_name:'Asha',email:'a@example.edu',allow_student_photo_upload:++identityReads>1}}});
 return route.fulfill({json:path.endsWith('/resume-library')?{resumes:[]}: {}});
 });
 await page.goto('/profile');await expect(page.getByRole('button',{name:'Upload photo',exact:true})).toBeVisible();
 const profile=await page.locator('.profile-panel').boundingBox(),resume=await page.locator('#resume-library').boundingBox();
 expect(Math.abs(profile!.x-resume!.x)).toBeLessThan(2);expect(Math.abs(profile!.width-resume!.width)).toBeLessThan(2);
});
