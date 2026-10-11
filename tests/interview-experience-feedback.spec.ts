import {test,expect,type Page} from '@playwright/test';

// Stands in for GET experience-feedback; the form is built from this response.
const questions=[
 {key:'overall',label:'How would you rate your overall AI interview experience?'},
 {key:'question_relevance',label:'How relevant were the AI interview questions to your education, skills, experience and career goals?'},
 {key:'conversation_quality',label:'How natural, interactive and comfortable was your conversation with the AI interviewer?'},
 {key:'assessment_fairness',label:'How fairly and accurately did the AI interviewer assess your knowledge, skills, communication and experience?'},
 {key:'feedback_usefulness',label:'How useful was the AI interview feedback in identifying your strengths, areas for improvement and career readiness?'},
];
const form={form_version:2,submitted:false,skipped:false,text_limit:500,questions,
 rating_labels:['Very poor','Poor','Average','Good','Excellent'],
 improvement_options:[{key:'question_quality',label:'More relevant questions'},{key:'response_speed',label:'Faster responses'},{key:'other',label:'Other'}],
 context:{interview_type:'Placement interview',role:'Software Developer',drive:'Zoho placement drive',completed_at:'2026-10-08T05:00:00Z'}};

test.beforeEach(async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'student-1'},csrf_token:'csrf'}}));
 await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\nwindow.experienceTest=()=>{currentSessionId='session-1';return showInterviewExperienceFeedback();};`});});
});

async function open(page:Page,overrides:Record<string,unknown>={},failPost=false){
 const posts:any[]=[];
 await page.route('**/experience-feedback',route=>{
  if(route.request().method()==='POST'){posts.push(route.request().postDataJSON());return failPost?route.fulfill({status:503,json:{detail:'down'}}):route.fulfill({json:{saved:true}});}
  return route.fulfill({json:{...form,...overrides}});
 });
 await page.goto('/interview.html?id=session-1');await page.evaluate(()=>(window as any).experienceTest());
 return posts;
}
const rate=(page:Page,label:string,stars:number)=>page.getByRole('radiogroup',{name:label}).getByRole('radio',{name:new RegExp(`^${stars} stars?,`)}).check();

test('the form shows the interview details and five quick star questions plus a recommendation',async({page})=>{
 await open(page);
 const dialog=page.getByRole('dialog',{name:/Interview Completed!/});await expect(dialog).toBeVisible();
 const details=dialog.locator('.xf-context');
 for(const text of ['Placement interview','Software Developer','Zoho placement drive','8 Oct 2026'])await expect(details).toContainText(text);
 for(const question of questions)await expect(page.getByRole('radiogroup',{name:question.label}).getByRole('radio')).toHaveCount(5);
 await expect(dialog.locator('.xf-scale').first()).toContainText('1 - Very poor');
 await expect(page.locator('.xf-range-value')).toHaveText('Not selected');
 await expect(page.locator('.xf-progress-text')).toHaveText('0 of 6 answered · about 30 seconds');
});

test('one star rating is enough to submit, and the choice is named in words',async({page})=>{
 const posts=await open(page);
 await rate(page,questions[0].label,4);
 await expect(page.locator('[data-q="overall"] .xf-word')).toHaveText('Good');
 await expect(page.locator('.xf-progress-text')).toHaveText('1 of 6 answered · about 30 seconds');
 await page.getByRole('button',{name:'Submit Feedback'}).click();
 await expect(page.getByRole('status').filter({hasText:'Thank you!'})).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(posts).toEqual([{recommend:null,improvements:[],improvement_other:'',comments:'',overall:4,question_relevance:null,conversation_quality:null,assessment_fairness:null,feedback_usefulness:null}]);
});

test('the overall rating is required before anything is sent',async({page})=>{
 const posts=await open(page);
 await rate(page,questions[2].label,5);
 await page.getByRole('button',{name:'Submit Feedback'}).click();
 await expect(page.locator('[data-q="overall"] .xf-error')).toHaveText('Please choose a rating to submit, or skip for now.');
 expect(posts).toEqual([]);
});

test('a full answer sends every rating, the score, chosen tags and comments',async({page})=>{
 const posts=await open(page);
 for(const [index,stars] of [5,4,3,4,5].entries())await rate(page,questions[index].label,stars);
 await page.locator('.xf-range-ticks button[data-score="8"]').click();
 await expect(page.locator('.xf-range-value')).toHaveText('8 / 10');
 await expect(page.locator('.xf-progress-text')).toHaveText('All answered — thank you!');
 await page.getByLabel('Faster responses').check();
 await page.getByLabel('Other',{exact:true}).check();
 await page.getByRole('button',{name:'Submit Feedback'}).click();
 await expect(page.locator('[data-q="improvements"] .xf-error')).toHaveText('Please tell us what else to improve.');
 await page.getByLabel('Please specify the other improvement').fill('Dark mode');
 await page.getByLabel('Additional comments').fill('Great panel.');
 await expect(page.locator('.xf-count')).toHaveText('12/500');
 await page.getByRole('button',{name:'Submit Feedback'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(posts).toEqual([{recommend:8,improvements:['response_speed','other'],improvement_other:'Dark mode',comments:'Great panel.',
  overall:5,question_relevance:4,conversation_quality:3,assessment_fairness:4,feedback_usefulness:5}]);
});

test('student can skip feedback without blocking the report',async({page})=>{
 const posts=await open(page);
 await page.getByRole('button',{name:'Skip for now'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect.poll(()=>posts).toEqual([{skipped:true}]);
});

test('saved feedback is not solicited again',async({page})=>{
 await open(page,{submitted:true});await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('feedback waits for interview persistence and a failed submission can be retried or skipped',async({page})=>{
 let checks=0;
 await page.route('**/experience-feedback',route=>{
  if(route.request().method()==='POST')return route.fulfill({status:503,json:{detail:'down'}});
  checks+=1;return checks===1?route.fulfill({status:409,json:{detail:'saving'}}):route.fulfill({json:form});
 });
 await page.goto('/interview.html?id=session-1');await page.evaluate(()=>(window as any).experienceTest());
 await expect(page.getByRole('dialog')).toBeVisible();expect(checks).toBe(2);
 await rate(page,questions[0].label,3);await page.getByRole('button',{name:'Submit Feedback'}).click();
 await expect(page.locator('.xf-status')).toHaveText('Your feedback could not be saved. Retry or skip.');
 await expect(page.getByRole('button',{name:'Submit Feedback'})).toBeEnabled();
 await page.getByRole('button',{name:'Skip for now'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the form is usable on a phone without horizontal scrolling',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await open(page);
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>{const o=document.getElementById('interview-experience-feedback')!;return o.scrollWidth<=o.clientWidth;})).toBe(true);
 const submit=page.getByRole('button',{name:'Submit Feedback'});await submit.scrollIntoViewIfNeeded();
 const box=await submit.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.x+box!.width).toBeLessThanOrEqual(390);
});
