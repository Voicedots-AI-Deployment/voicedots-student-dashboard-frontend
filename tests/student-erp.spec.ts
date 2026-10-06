import { test, expect, type Page } from '@playwright/test';
const services = ['timetable','attendance','internal-marks','semester-marks','fees','homework','circulars','exams','opac','hostel-attendance','mess-attendance'];
const student = { id:'student-1', full_name:'Asha Kumar', roll_number:'CSE23001', department_code:'CSE', batch_label:'2023–2027' };
const samples: Record<string,object[]> = {
  timetable: [{weekday:0,starts_at:'09:00:00',ends_at:'09:50:00',subject:'Engineering Chemistry',faculty:'Dr. Priya',room:'CSE 101'},{weekday:2,starts_at:'13:00:00',ends_at:'13:50:00',subject:'Mathematics II',faculty:'Dr. Ravi',room:'CSE 102'}],
  attendance:[{period:'semester',starts_on:'2026-07-01',ends_on:'2026-12-31',days_conducted:60,days_present:54,percentage:90,eligibility:'eligible'}],
  'internal-marks':[{subject:'Mathematics II',exam:'IA-1',semester:2,score:18,maximum:20}],
  'semester-marks':[{subject:'Mathematics II',exam:'Semester exam',semester:2,score:85,maximum:100,grade:'A'}],
  fees:[{paid_on:'2026-09-01',amount:50000,reference:'PAY-2026-001'}],
  homework:[{title:'Chemistry assignment',instructions:'Answer questions 1 to 5.',assigned_on:'2026-10-01',due_on:'2026-10-10'}],
  circulars:[{title:'Library hours',body:'Library is open until 6 PM.',published_on:'2026-10-01'}],
  exams:[{title:'IA-2',subject:'Mathematics II',exam_date:'2026-10-15',starts_at:'13:00:00',ends_at:'14:00:00'}],
  opac:[{title:'Engineering Mathematics',author:'B. S. Grewal',accession_number:'LIB-101',status:'available'}],
  'hostel-attendance':[{attendance_date:'2026-10-05',hostel:'Block A',room:'101',status:'present'}],
  'mess-attendance':[{attendance_date:'2026-10-05',meal:'breakfast',status:'present'}]
};
async function setup(page:Page, mode:'records'|'empty'|'error'='records') {
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/auth/student-me') return route.fulfill({json:{student}});
    const service=url.pathname.split('/').at(-1)!;
    if(url.pathname.startsWith('/api/student/erp/')) {
      if(mode==='error') return route.fulfill({status:503,json:{detail:'Please try again.'}});
      return route.fulfill({json:{student,items:mode==='empty'?[]:samples[service],has_more:false,summary:service==='fees'?{total_fee:75000,amount_paid:50000,outstanding_balance:25000,currency:'INR'}:service==='semester-marks'?{semester_gpa:8.5,overall_cgpa:8.4,overall_result:'PASS'}:{}}});
    }
    return route.fulfill({json:{}});
  });
}
test('My ERP shows all 11 services and no upload actions',async({page})=>{
  await setup(page);await page.goto('/erp');
  await expect(page.getByRole('heading',{name:'My ERP',exact:true})).toBeVisible();
  await expect(page.locator('.career-grid > .panel')).toHaveCount(11);
  for(const service of services) await expect(page.locator(`a[href="/erp/${service}"]`)).toBeVisible();
  await expect(page.getByRole('button',{name:/upload|import|edit|delete/i})).toHaveCount(0);
});
for(const service of services) test(`${service} displays own records and read-only details`,async({page})=>{
  await setup(page);await page.goto(`/erp/${service}`);
  await expect(page.getByText('CSE · 2023–2027')).toBeVisible();
  await expect(page.locator('.academic-table table')).toBeVisible();
  await expect(page.getByRole('button',{name:/upload|import|edit|delete/i})).toHaveCount(0);
  await page.locator('.academic-table button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if(service==='timetable') { await expect(page.getByRole('rowheader').filter({hasText:'9:00 AM'})).toBeVisible();await expect(page.getByRole('rowheader').filter({hasText:'1:00 PM'})).toBeVisible(); }
});
test('marks filter requests semester 8 without supplying a student identity',async({page})=>{
  await setup(page);await page.goto('/erp/internal-marks');
  const request=page.waitForRequest(r=>r.url().includes('/api/student/erp/internal-marks?') && new URL(r.url()).searchParams.get('semester')==='8');
  await page.getByLabel('Semester', {exact:true}).selectOption('8');
  const url=new URL((await request).url());expect(url.searchParams.has('student_id')).toBe(false);expect(url.searchParams.has('college_id')).toBe(false);
  await expect(page.getByLabel('Semester',{exact:true}).locator('option')).toHaveCount(9);
});
test('library search, campus attendance filters and empty states work',async({page})=>{
  await setup(page,'empty');await page.goto('/erp/opac');
  await page.getByLabel('Book title, author, subject or ISBN').fill('Mathematics');
  const search=page.waitForRequest(r=>new URL(r.url()).searchParams.get('q')==='Mathematics');
  await page.getByRole('button',{name:'Search',exact:true}).click();await search;
  await expect(page.getByText('No records are available', {exact:false})).toBeVisible();
  await page.goto('/erp/mess-attendance');
  await page.getByLabel('Date',{exact:true}).fill('2026-10-05');
  const meal=page.waitForRequest(r=>new URL(r.url()).searchParams.get('meal')==='lunch');
  await page.getByLabel('Meal',{exact:true}).selectOption('lunch');await meal;
});
test('service failures show retry; mobile overflow stays inside the table',async({page})=>{
  await setup(page,'error');await page.goto('/erp/attendance');
  await expect(page.getByText('Please try again.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();
});
test('timetable stays usable on mobile and desktop',async({page})=>{
  await setup(page);
  for(const width of [390,1440]) {await page.setViewportSize({width,height:900});await page.goto('/erp/timetable');await expect(page.locator('.academic-table')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/my-erp-${width}.png`,fullPage:true});
  }
});

test('ERP cards align their actions and timetable reuses the client grid structure',async({page})=>{
  await setup(page);await page.setViewportSize({width:1440,height:1000});await page.goto('/erp');
  const cards=page.locator('.student-erp-service');await expect(cards).toHaveCount(11);
  const buttons=await cards.locator('.student-erp-service-action').evaluateAll(nodes=>nodes.slice(0,3).map(node=>Math.round(node.getBoundingClientRect().bottom)));
  expect(new Set(buttons).size).toBe(1);
  await page.screenshot({path:'test-results/my-erp-cards-polished.png',fullPage:true});
  await page.goto('/erp/timetable');await expect(page.locator('.erp-timetable-grid')).toBeVisible();
  expect(await page.locator('.erp-timetable-grid tbody th').first().evaluate(node=>Math.round(node.getBoundingClientRect().width))).toBe(190);
  expect(await page.locator('.erp-timetable-class').first().evaluate(node=>getComputedStyle(node).borderLeftWidth)).toBe('4px');
  expect(await page.locator('.erp-timetable-grid td').first().evaluate(node=>getComputedStyle(node).borderTopWidth)).toBe('1px');
  await page.screenshot({path:'test-results/my-erp-timetable-polished.png',fullPage:true});
  await page.getByRole('button',{name:'Use dark theme'}).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.screenshot({path:'test-results/my-erp-timetable-dark.png',fullPage:true});
});

test('timetable dates, navigation and live class use IST independently of browser timezone',async({page})=>{
  await page.clock.install({time:new Date('2026-10-05T03:30:00Z')});
  await setup(page);await page.goto('/erp/timetable');
  await expect(page.locator('.erp-week-toolbar')).toContainText('5 Oct – 11 Oct 2026');
  await expect(page.locator('thead .erp-week-today')).toContainText('Monday');
  await expect(page.locator('.erp-week-live')).toContainText('Engineering Chemistry');
  await expect(page.getByRole('rowheader').first()).toHaveText('9:00 AM – 9:50 AM');
  await page.getByRole('button',{name:'Next week',exact:true}).click();
  await expect(page.locator('.erp-week-toolbar')).toContainText('12 Oct – 18 Oct 2026');
  await expect(page.locator('.erp-week-live')).toHaveCount(0);
  await expect(page.locator('thead .erp-week-today')).toHaveCount(0);
  await page.getByRole('button',{name:'Previous week',exact:true}).click();
  await page.getByRole('button',{name:'Previous week',exact:true}).click();
  await expect(page.locator('.erp-week-toolbar')).toContainText('28 Sept – 4 Oct 2026');
  await page.getByRole('button',{name:'Today',exact:true}).click();
  await expect(page.locator('.erp-week-live')).toHaveCount(1);
  await page.clock.fastForward(50*60000);
  await expect(page.locator('.erp-week-live')).toHaveCount(0);
});
test('timetable rolls over Monday midnight IST while manual week stays selected',async({page})=>{
  await page.clock.install({time:new Date('2026-10-11T18:29:58Z')});
  await page.clock.pauseAt(new Date('2026-10-11T18:29:58Z'));
  await setup(page);await page.goto('/erp/timetable');
  await expect(page.locator('.erp-week-toolbar')).toContainText('5 Oct – 11 Oct 2026');
  await page.clock.fastForward(3000);
  await expect(page.locator('.erp-week-toolbar')).toContainText('12 Oct – 18 Oct 2026');
  await expect(page.locator('thead .erp-week-today')).toContainText('Monday');
  await page.getByRole('button',{name:'Previous week',exact:true}).click();
  await page.clock.fastForward(7*86400000);
  await expect(page.locator('.erp-week-toolbar')).toContainText('5 Oct – 11 Oct 2026');
  await page.getByRole('button',{name:'Today',exact:true}).click();
  await expect(page.locator('.erp-week-toolbar')).toContainText('19 Oct – 25 Oct 2026');
});
test('timetable week controls fit mobile and dates cross year boundary',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.clock.install({time:new Date('2027-01-01T06:30:00Z')});
  await setup(page);await page.goto('/erp/timetable');
  await expect(page.locator('.erp-week-toolbar')).toContainText('28 Dec – 3 Jan 2027');
  await expect(page.locator('.erp-week-toolbar')).toContainText('12:00 PM');
  for(const name of ['Previous week','Today','Next week']) await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/timetable-week-mobile.png',fullPage:true});
});
test('timetable only shows classes inside their inclusive effective dates',async({page})=>{
 await page.clock.install({time:new Date('2026-10-05T03:30:00Z')});
 await setup(page);
 await page.route('**/api/student/erp/timetable*',route=>route.fulfill({json:{student,items:[{weekday:0,starts_at:'09:00:00',ends_at:'09:50:00',subject:'October schedule',effective_from:'2026-10-05',effective_until:'2026-10-05'}],has_more:false}}));
 await page.goto('/erp/timetable');
 await expect(page.locator('.erp-timetable-class')).toHaveCount(1);
 await page.getByRole('button',{name:'Next week',exact:true}).click();
 await expect(page.locator('.erp-timetable-class')).toHaveCount(0);
 await page.getByRole('button',{name:'Today',exact:true}).click();
 await expect(page.locator('.erp-timetable-class')).toHaveCount(1);
});
