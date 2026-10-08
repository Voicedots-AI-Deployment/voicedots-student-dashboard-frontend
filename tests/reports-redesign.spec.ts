import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
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
 await expect(page.getByLabel('Interview video')).toHaveAttribute('src',/recording.webm/);await expect(page.locator('audio')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
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

test('scheduled reports show release time and do not label publication as assessment review',async({page})=>{
 await setup(page);
 await page.route('**/api/student/reports',route=>route.fulfill({json:{reports:[{...base,status:'released',report:{status:'awaiting_release',release_scheduled_for:'2026-10-10T10:00:00Z'}}]}}));
 await page.goto('/reports');await expect(page.getByText('Release scheduled',{exact:true})).toBeVisible();
 await expect(page.getByText('In review',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Table',exact:true}).click();await expect(page.getByRole('table')).toContainText('Scheduled');
 await expect(page.getByRole('table').getByRole('link',{name:/Open report/})).toHaveCount(0);
});

test('question bookmarks open the matching feedback and seek the video without separate audio',async({page})=>{
 await setup(page);
 await page.route('**/api/interview/s1/evaluation',route=>route.fulfill({json:{overall_score:65,question_reviews:[{answer_id:1,question:'Tell us about your project.',answer:'I built the service.',answer_started_at:'2026-10-08T10:00:05Z',evidence_status:'answered'},{answer_id:2,question:'How did you test it?',answer:'I tested failed inputs.',answer_started_at:'2026-10-08T10:00:25Z',evidence_status:'answered'}]}}));
 await page.route('**/api/student/interview/s1/recording',route=>route.fulfill({json:{status:'ready',playback_url:'https://media.example/bookmarks.webm',started_at:'2026-10-08T10:00:00Z',duration_seconds:120,segment_count:1}}));
 await page.route('https://media.example/**',route=>route.abort());
 await page.goto('/reports/s1');await page.getByRole('button',{name:'Questions & feedback (2)'}).click();
 const video=page.getByLabel('Interview video');await expect(video).toBeVisible();
 const videoBox=await page.locator('.report-video-review').boundingBox(),answersBox=await page.locator('.report-answer-review').boundingBox();expect(videoBox!.y+videoBox!.height).toBeLessThanOrEqual(answersBox!.y);
 expect(await page.locator('.report-question-content').first().evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(2);
 await video.evaluate((element:any)=>{Object.defineProperty(element,'readyState',{value:4});Object.defineProperty(element,'currentTime',{value:0,writable:true});element.play=()=>{element.dataset.played='true';return Promise.resolve();};});
 await page.getByRole('navigation',{name:'Question bookmarks'}).getByRole('button',{name:'Q2 0:25'}).click();
 await expect(page.locator('#question-1')).toHaveAttribute('open','');
 await expect(page.locator('#question-1')).toContainText('I tested failed inputs.');
 expect(await video.evaluate((element:any)=>element.currentTime)).toBe(25);await expect(video).toHaveAttribute('data-played','true');
 await expect(page.locator('audio')).toHaveCount(0);await expect(page.getByRole('button',{name:'Recording & audio'})).toHaveCount(0);
 await page.setViewportSize({width:1440,height:960});await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll('*').forEach(e=>e.scrollTop=0);});await page.screenshot({path:'/root/voicedots/artifacts/report-review-redesign-20261008/student-questions-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:'/root/voicedots/artifacts/report-review-redesign-20261008/student-questions-mobile.png',fullPage:true});
});


test('the embedded video decodes and a question bookmark seeks real playback',async({page})=>{
 await setup(page);
 await page.route('**/api/interview/s1/evaluation',route=>route.fulfill({json:{overall_score:65,question_reviews:[{answer_id:1,question:'How did you test it?',answer:'I tested failed inputs.',answer_started_at:'2026-10-08T10:00:25Z',evidence_status:'answered'}]}}));
 await page.route('**/api/student/interview/s1/recording',route=>route.fulfill({json:{status:'ready',playback_url:'https://media.example/real-recording.mp4',started_at:'2026-10-08T10:00:00Z',duration_seconds:40,segment_count:1}}));
 await page.route('https://media.example/real-recording.mp4',route=>{
 const bytes=readFileSync(new URL('./fixtures/report-recording.mp4', import.meta.url));
 const range=route.request().headers()['range']?.match(/bytes=(\d+)-(\d*)/);
 if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;return route.fulfill({status:206,contentType:'video/mp4',headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`},body:bytes.subarray(start,end+1)});}
 return route.fulfill({contentType:'video/mp4',headers:{'accept-ranges':'bytes'},body:bytes});
 });
 await page.goto('/reports/s1');await page.getByRole('button',{name:'Questions & feedback (1)'}).click();
 const video=page.getByLabel('Interview video');await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>element.readyState)).toBeGreaterThanOrEqual(1);
 await page.getByRole('navigation',{name:'Question bookmarks'}).getByRole('button',{name:'Q1 0:25'}).click();
 await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>element.currentTime)).toBeGreaterThanOrEqual(25);
 await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>element.paused)).toBe(false);
 await video.evaluate((element:HTMLVideoElement)=>element.pause());
 await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll('*').forEach(e=>e.scrollTop=0);});
 await page.setViewportSize({width:1440,height:960});await page.screenshot({path:'/root/voicedots/artifacts/report-review-redesign-20261008/student-report-video-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:'/root/voicedots/artifacts/report-review-redesign-20261008/student-report-video-mobile.png',fullPage:true});
});
