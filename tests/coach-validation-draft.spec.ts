import {test,expect,type Page} from '@playwright/test';

// Opening independent validation autosaved an empty draft, which the API
// rejected. The raw "List should have at least 1 item after validation,
// not 0" message was then shown above validation tasks nobody had answered.
const identity={student:{id:'student-1',full_name:'Asha Kumar',email:'asha@college.edu',roll_number:'CS2026001',college_name:'Example College of Engineering'}};
const planId='draft-plan',sessionId='draft-session';
const plan={id:planId,drive_id:'drive-1',company_name:'Example Co',role_title:'Analyst',target_date:'2026-10-01',
 plan:{summary:'Prepare SQL',goal:'Explain joins',priority_topics:[],
  daily_roadmap:[{day:1,session_id:sessionId,title:'SQL joins',focus:'SQL joins',activities:[],success_check:'Explain LEFT JOIN'}],
  discussion_starters:[]},messages:[]};
const state={id:sessionId,stage:'validation',skill:'SQL joins',learning_objective:'Explain LEFT JOIN',
 validation_tasks:[
  {task_id:'task-1',sub_skill:'LEFT JOIN',format:'scenario',question:'Explain a LEFT JOIN.'},
  {task_id:'task-2',sub_skill:'LEFT JOIN',format:'scenario',question:'Find the join bug.'},
 ]};

async function openValidation(page:Page,drafts:Array<Record<string,unknown>>){
 // Playwright matches the most recently registered route first, so the
 // catch-all must be registered before the specific handlers.
 await page.route('**/api/**',route=>route.fulfill({json:{}}));
 await page.route('**/api/auth/student-me',route=>route.fulfill({json:identity}));
 await page.route('**/api/student/coach/overview',route=>route.fulfill({json:{upcoming_drives:[],plans:[plan],completed_drive_recommendation:null}}));
 await page.route('**/api/student/coach/plans**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/sessions/'+sessionId+'/validation/answers')){
   drafts.push(route.request().postDataJSON());
   return route.fulfill({json:state});
  }
  if(path.endsWith('/sessions/'+sessionId))return route.fulfill({json:state});
  if(path.endsWith('/plans/'+planId))return route.fulfill({json:plan});
  return route.fulfill({json:{plans:[plan]}});
 });
 await page.goto(`/coach?plan=${planId}&session=${sessionId}`);
 await expect(page.getByText('Explain a LEFT JOIN.')).toBeVisible();
}

test('opening independent validation does not autosave an empty draft',async({page})=>{
 const drafts:Array<Record<string,unknown>>=[];
 await openValidation(page,drafts);
 await page.waitForTimeout(900);
 expect(drafts).toEqual([]);
 await expect(page.getByText('List should have at least 1 item')).toHaveCount(0);
});

test('typing an answer still autosaves that draft',async({page})=>{
 const drafts:Array<Record<string,unknown>>=[];
 await openValidation(page,drafts);
 await page.getByPlaceholder('Answer without hints. Your draft is saved automatically.').first().fill('A LEFT JOIN keeps every row on the left.');
 await expect.poll(()=>drafts.length).toBeGreaterThan(0);
 expect(drafts[drafts.length-1]).toMatchObject({answers:[{task_id:'task-1',response:'A LEFT JOIN keeps every row on the left.'}]});
});
