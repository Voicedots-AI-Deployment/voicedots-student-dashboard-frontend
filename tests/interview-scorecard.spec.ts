import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const output='/root/voicedots/releases/interview-report-scorecard-20261012/screenshots';
const dimensions={technical_knowledge:82,analytical_reasoning:80,practical_application:78,problem_solving:76,communication:74};
async function setup(page:any,{empty=false,saveError=false,pending=false}={}) {
  let saved:any=null,saveCount=0;
  await page.route('**/api/**',async (route:any)=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/student-me')return route.fulfill({json:{student:{photo_url:'/api/student/profile/photo',current_resume_submission_id:'resume-main',id:'student-1',full_name:'Asha Kumar',email:'asha@example.edu'}}});
    if(path==='/api/student/reports')return route.fulfill({json:{reports:[{session_id:'scorecard-1',submission_id:'resume-1',status:pending?'awaiting_release':'released',drive_id:'drive-1',company_name:'Example Technologies',target_role:'Graduate Software Engineer',duration_minutes:18,completed_at:'2026-10-11T12:00:00Z'}]}});
    if(path.endsWith('/evaluation/satisfaction')){
      saveCount++;if(saveError)return route.fulfill({status:503,json:{detail:'Feedback could not be saved. Please retry.'}});
      const ratings=route.request().postDataJSON();saved={score:Math.round(Object.values(ratings).reduce((sum:number,n:any)=>sum+n,0)/30*100),label:'Very good',ratings,submitted_at:'2026-10-12T12:00:00Z',method:'Six candidate ratings'};
      return route.fulfill({json:saved});
    }
    if(path.endsWith('/evaluation'))return route.fulfill({json:{overall_score:empty?null:78,readiness:empty?'Not assessed':'Developing',candidate_info:{full_name:'Asha Kumar',program:'B.Tech',department:'Computer Science',year_of_study:'2026'},candidate_satisfaction:saved,executive_summary:'Demonstrated sound technical foundations and structured debugging. Further practice will help with SQL optimisation and concise project communication.',score_breakdown:empty?{communication:null}:dimensions,core_dimensions:Object.entries(dimensions).map(([dimension,percentage])=>({dimension,percentage,reason:dimension==='communication'?'Explained the teamwork example clearly.':'Supported by the saved project and scenario answers.'})),strengths:empty?[]:[{text:'Clear project architecture and structured debugging.'}],priority_improvement_areas:[{focus:'SQL optimisation',problem:'Explore query optimisation and concise project storytelling.',actions:['Practise a short SQL work sample and explain the query plan.']}],question_reviews:[{answer_id:1,question:'Walk through your project architecture.',answer:empty?'':'I separated the API and database layers.',evidence_status:empty?'no_response':'answered',asked_at:'2026-10-11T11:42:01Z',strength_feedback:['Clear project example']}]}});
    if(path.endsWith('/recording'))return route.fulfill({json:{status:'ready',playback_url:'/scorecard-video.mp4',started_at:'2026-10-11T11:42:00Z',duration_seconds:8,segment_count:1}});
    if(path.endsWith('/question-feedback'))return route.fulfill({json:{feedback:{},complete:true}});
    return route.fulfill({status:404,json:{detail:'Not found'}});
  });
  await page.route('**/scorecard-video.mp4',(route:any)=>route.fulfill({contentType:'video/mp4',body:readFileSync(resolve('tests/fixtures/report-recording.mp4'))}));
  await page.goto('/reports/scorecard-1');
  return {count:()=>saveCount};
}

test('real report data, survey submission and report screenshots',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});const state=await setup(page);
  await expect(page.getByRole('heading',{name:'Competency Results'})).toBeVisible();
  await expect(page.locator('.scorecard-heading,.scorecard-profile,.scorecard-practice-tiles,.scorecard-insights')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'What went well',exact:true})).toHaveCount(1);
  await expect(page.getByRole('heading',{name:'Where to focus',exact:true})).toHaveCount(1);
  expect(await page.locator('.assessment-scorecard').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  await expect(page.locator('.scorecard-ring')).toHaveAttribute('aria-label','AI interview score: 78/100');
  await expect(page.locator('.scorecard-competencies tbody tr')).toHaveCount(5);
  await expect(page.locator('.scorecard-satisfaction')).toContainText('Not collected');
  await page.locator('.satisfaction-form summary').click();
  await page.getByRole('button',{name:'Save feedback',exact:true}).click();
  expect(state.count()).toBe(0);
  for(const select of await page.locator('.satisfaction-form select').all())await select.selectOption('4');
  await page.getByRole('button',{name:'Save feedback',exact:true}).click();
  await expect(page.getByLabel('Candidate satisfaction score')).toHaveAttribute('value','80');
  await expect(page.locator('.scorecard-ring')).toHaveAttribute('aria-label','AI interview score: 78/100');
  expect(state.count()).toBe(1);
  await page.locator('.satisfaction-form summary').click();
  await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator('video').evaluate((v:HTMLVideoElement)=>{v.currentTime=1;});
  await page.locator('video').evaluate((v:HTMLVideoElement)=>v.play());
  await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(1);
  await page.locator('video').evaluate((v:HTMLVideoElement)=>v.pause());
  mkdirSync(output,{recursive:true});
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:output+'/full-report-desktop.png',fullPage:true});
  await page.locator('.assessment-scorecard').screenshot({path:output+'/assessment-scorecard.png',style:'.dashboard-topbar{visibility:hidden}'});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:output+'/full-report-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Review every answer',exact:false}).click();
  await expect(page.getByRole('heading',{name:'Questions & feedback',exact:true})).toBeVisible();
});

test('missing assessment is not presented as a real zero score',async({page})=>{
  await setup(page,{empty:true});
  await expect(page.locator('.scorecard-ring')).toContainText('Not assessed');
  await expect(page.locator('.scorecard-competencies')).toContainText('Not assessed');
  await expect(page.locator('.scorecard-satisfaction')).toContainText('Not collected');
});

test('feedback save errors allow retry without displaying an invented score',async({page})=>{
  await setup(page,{saveError:true});await page.locator('.satisfaction-form summary').click();
  for(const select of await page.locator('.satisfaction-form select').all())await select.selectOption('5');
  await page.getByRole('button',{name:'Save feedback',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('could not be saved');
  await expect(page.locator('.satisfaction-value')).toContainText('Not collected');
  await expect(page.getByRole('button',{name:'Save feedback',exact:true})).toBeEnabled();
});

test('unreleased placement assessment and feedback form stay private',async({page})=>{
  await setup(page,{pending:true});
  await expect(page.getByRole('heading',{name:'Your feedback is being prepared'})).toBeVisible();
  await expect(page.locator('.assessment-scorecard')).toHaveCount(0);
});
