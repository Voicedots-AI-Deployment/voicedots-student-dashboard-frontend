import {test,expect} from '@playwright/test';
const base={evaluation_id:'e1',session_id:'s1',status:'released',company_name:'Example',target_role:'Engineer',drive_id:'d1',created_at:'2026-10-07',report:{overall_score:46,status:'released',readiness:'Developing'}};
async function setup(page:any,decision='hold',released=true){
 await page.route('**/api/**',(route:any)=>{const path=new URL(route.request().url()).pathname;
 if(path==='/api/auth/student-me')return route.fulfill({json:{student:{id:'st1',full_name:'Asha',email:'a@example.edu'}}});
 if(path==='/api/student/reports')return route.fulfill({json:{reports:[{...base,placement_decision:decision,report:released?base.report:{status:'awaiting_release'}}]}});
 if(path==='/api/interview/s1/evaluation')return route.fulfill({json:{...base.report,question_reviews:[{answer_id:1,question:'Explain SQL.',answer:'I used a join.',evidence_status:'answered'}]}});
 if(path.endsWith('/question-feedback'))return route.fulfill({json:{feedback:{},complete:true}});
 if(path.endsWith('/recording'))return route.fulfill({json:{status:'ready',playback_url:'https://media.example/recording.webm'}});
 if(path==='/api/student/drives')return route.fulfill({json:[{id:'d1',company_name:'Example',role_title:'Engineer',status:'closed',interview_status:'completed',placement_decision:released?decision:null}]});
 return route.fulfill({status:404,json:{detail:'Not found'}});
 });
}
test('cards and table preserve search and hide placement decisions in report history',async({page})=>{
 await setup(page);await page.goto('/reports');await expect(page.locator('.report-view-cards .student-report-card')).toHaveCount(1);
 expect(await page.locator('.student-report-card h2').evaluate(e=>getComputedStyle(e).fontWeight)).toBe('500');
 await expect(page.getByText('On hold',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Table',exact:true}).click();await expect(page.getByRole('table')).toBeVisible();
 await page.getByLabel('Search reports').fill('missing');await expect(page.getByText('No reports match this view.')).toBeVisible();
 await page.getByLabel('Search reports').fill('Example');await expect(page.getByRole('table')).toBeVisible();
 await page.getByRole('button',{name:'Cards',exact:true}).click();await expect(page.locator('.student-report-card')).toHaveCount(1);
});
for(const [decision,label] of [['shortlist','Shortlisted'],['reject','Rejected'],['hold','On hold'],['undecided','Decision pending']]){
 test(`report detail shows formal ${decision} outcome independently from score`,async({page})=>{
 await setup(page,decision);await page.goto('/reports/s1');await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
 await expect(page.getByText('46%',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Questions & feedback (1)'}).click();await expect(page.getByText(/No separate feedback was saved/)).toBeVisible();
 await page.getByRole('button',{name:'Recording & audio'}).click();await expect(page.getByLabel('Full interview audio')).toHaveAttribute('src',/recording.webm/);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 });
}
test('pending reports never fetch protected details or media',async({page})=>{
 await setup(page,'shortlist',false);const protectedRequests:string[]=[];page.on('request',r=>{if(r.url().includes('/api/interview/')||r.url().endsWith('/recording'))protectedRequests.push(r.url())});
 await page.goto('/reports/s1');await expect(page.getByRole('heading',{name:'Your feedback is being prepared'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Shortlisted'})).toHaveCount(0);expect(protectedRequests).toEqual([]);
});
test('placement cards and table show a released formal result',async({page})=>{
 await setup(page,'shortlist');await page.goto('/placements');await expect(page.locator('.drive-card').getByText('Shortlisted',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Table',exact:true}).click();await expect(page.getByRole('table').getByText('Shortlisted',{exact:true})).toBeVisible();
});
