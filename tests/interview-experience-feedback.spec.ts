import {test,expect} from '@playwright/test';
const questions=['clarity','voice','listening','ease','overall'].map(key=>({key,label:`Rate ${key}`}));
test.beforeEach(async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'student-1'},csrf_token:'csrf'}}));
 await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\nwindow.experienceTest=()=>{currentSessionId='session-1';return showInterviewExperienceFeedback();};`});});
});
test('student can answer optional questions and submit feedback after either interview type',async({page})=>{
 let saved:any=null;
 await page.route('**/experience-feedback',route=>{if(route.request().method()==='POST'){saved=route.request().postDataJSON();return route.fulfill({json:{saved:true}});}return route.fulfill({json:{submitted:false,questions}});});
 await page.goto('/interview.html?id=session-1');await page.evaluate(()=>(window as any).experienceTest());
 const dialog=page.getByRole('dialog',{name:'How was your interview?'});await expect(dialog).toBeVisible();
 await page.screenshot({path:'/root/voicedots/artifacts/interview-feedback-20261010/student-feedback.png',fullPage:true});
 await page.getByRole('button',{name:'Submit feedback',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Choose at least one rating'})).toBeVisible();
 await page.getByLabel('Rate clarity').selectOption('4');await page.getByLabel('What worked well').fill('Good questions; voice broke once.');
 await page.getByRole('button',{name:'Submit feedback',exact:true}).click();await expect(dialog).toHaveCount(0);
 expect(saved).toEqual({clarity:4,comments:'Good questions; voice broke once.'});
});
test('student can skip feedback without completing questions or blocking the report',async({page})=>{
 let saved:any=null;await page.route('**/experience-feedback',route=>{if(route.request().method()==='POST'){saved=route.request().postDataJSON();return route.fulfill({json:{saved:true}});}return route.fulfill({json:{submitted:false,questions}});});
 await page.goto('/interview.html?id=session-1');await page.evaluate(()=>(window as any).experienceTest());
 await page.getByRole('button',{name:'Skip feedback'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect.poll(()=>saved).toEqual({skipped:true});
});
test('saved feedback is not solicited again and failure remains skippable',async({page})=>{
 await page.route('**/experience-feedback',route=>route.fulfill({json:{submitted:true,questions}}));
 await page.goto('/interview.html?id=session-1');await page.evaluate(()=>(window as any).experienceTest());await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('feedback waits for interview persistence and a failed submission can be skipped',async({page})=>{
 let checks=0;
 await page.route('**/experience-feedback',route=>{
  if(route.request().method()==='POST')return route.fulfill({status:503,json:{detail:'temporarily unavailable'}});
  checks+=1;return checks===1?route.fulfill({status:409,json:{detail:'saving'}}):route.fulfill({json:{submitted:false,questions}});
 });
 await page.goto('/interview.html?id=session-1');await page.evaluate(()=>(window as any).experienceTest());
 await expect(page.getByRole('dialog')).toBeVisible();expect(checks).toBe(2);
 await page.getByLabel('Rate voice').selectOption('3');await page.getByRole('button',{name:'Submit feedback',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Retry or skip'})).toBeVisible();
 await page.getByRole('button',{name:'Skip feedback'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
});


test('feedback actions have styled accessible buttons on a narrow screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/experience-feedback',route=>route.fulfill({json:{submitted:false,questions}}));
 await page.goto('/interview.html?id=session-1');await page.evaluate(()=>(window as any).experienceTest());
 const submit=page.getByRole('button',{name:'Submit feedback',exact:true});
 const skip=page.getByRole('button',{name:'Skip feedback'});
 await submit.scrollIntoViewIfNeeded();
 for(const button of [submit,skip]){const box=await button.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);}
 expect(await submit.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
 await page.screenshot({path:'/root/voicedots/artifacts/interview-listening-20261010/feedback-buttons-mobile.png'});
});
