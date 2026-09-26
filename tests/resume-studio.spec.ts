import { test, expect, type Page } from "@playwright/test";

const student={student:{id:"s-1",full_name:"Asha Kumar",email:"asha@example.edu",roll_number:"CS-01",college_name:"VoiceDots College"}};
const details={full_name:"",headline:"",email:"",phone:"",location:"",website:"",linkedin:"",github:"",links:[],photo:""};
const baseProject={id:"rs-1",title:"Resume 1",revision:1,source:"created",updated_at:"2026-09-23T10:00:00Z",presentation:{template_id:"classic",paper_size:"a4",layout:"single",font_family:"DM Sans",accent_color:"#6d3be8",body_font_size_pt:9,section_spacing_px:12,margin_horizontal_mm:14},document:{title:"Resume 1",personal_details:details,sections:[]}};

async function mockResumeStudio(page:Page, conflict=false){
 let project={...baseProject,document:{...baseProject.document,personal_details:{...details}}};
 await page.route("**/api/**",async route=>{
  const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
  if(path==="/api/auth/student-me")return route.fulfill({json:student});
  if(path==="/api/student/resume-studio/templates")return route.fulfill({json:[{id:"classic",name:"Classic",description:"ATS-friendly",ats_safe:true,tags:["ATS"]}]});
  if(path==="/api/student/resume-studio/resumes"&&method==="GET")return route.fulfill({json:[project]});
  if(path==="/api/student/resume-studio/resumes"&&method==="POST"){project={...project,...route.request().postDataJSON(),revision:1};return route.fulfill({status:201,json:project})}
  if(path==="/api/student/resume-studio/resumes/rs-1"&&method==="GET")return route.fulfill({json:project});
  if(path==="/api/student/resume-studio/resumes/rs-1"&&method==="PUT"){
   if(conflict)return route.fulfill({status:409,json:{detail:"Resume changed in another tab. Reload before saving."}});
   const body=route.request().postDataJSON();project={...project,...body,revision:project.revision+1};return route.fulfill({json:project});
  }
  if(path==="/api/student/resume-studio/resumes/import"&&method==="POST"){project={...project,title:"Imported resume",document:{...project.document,title:"Imported resume"}};return route.fulfill({status:201,json:{...project,import_report:{warnings:[],confidence:.94}}})}
  if(path==="/api/student/resume-studio/proposals"&&method==="GET")return route.fulfill({json:[]});
  if(path==="/api/student/resume-studio/resumes/rs-1/ai/review"&&method==="POST")return route.fulfill({json:{id:"p-1",proposal_id:"p-1",project_id:"rs-1",source_revision:project.revision,operation:"review",status:"pending",changes:[{id:"c-1",target:"headline",field:"headline",before:"",after:"Data Analyst",reason:"Supported by the resume"}],grounding:{grounded:true,unsupported_claims:[]}}});
  if(path==="/api/student/resume-studio/proposals/p-1/accept"&&method==="POST")return route.fulfill({json:{id:"p-1",operation:"review",status:"accepted",source_revision:project.revision,proposal:{changes:[{id:"c-1",target:"headline",field:"headline",before:"",after:"Data Analyst"}],grounding:{grounded:true,unsupported_claims:[]}}}});
  if(path==="/api/student/resume-studio/proposals/p-1/apply"&&method==="POST"){project={...project,revision:project.revision+1};return route.fulfill({json:{resume:project,revision:project.revision,applied_ids:["c-1"]}})}
  if(path==="/api/student/resume-studio/resumes/rs-1/export"&&method==="POST")return route.fulfill({status:200,contentType:"application/pdf",body:"%PDF-1.4 test"});
  if(path==="/api/student/resume-studio/resumes/rs-1/preview")return route.fulfill({contentType:"text/html",body:"<html><body>Resume preview</body></html>"});
  return route.fulfill({status:404,json:{detail:`Not found ${method} ${path}`}});
 });
}

test("Resume Studio appears below AI Coach and saves project content through the student API",async({page})=>{
 await mockResumeStudio(page);await page.goto("/");
 const nav=page.getByRole("navigation",{name:"Student navigation"});
 const coach=await nav.getByRole("link",{name:"AI coach"}).evaluate(el=>Array.from(el.parentElement!.children).indexOf(el));
 const studio=await nav.getByRole("link",{name:"Resume Studio"}).evaluate(el=>Array.from(el.parentElement!.children).indexOf(el));
 expect(studio).toBe(coach+1);
 await page.getByRole("link",{name:"Resume Studio"}).click();
 await page.getByRole("button",{name:/Resume 1 Revision/}).click();
 await page.getByRole("tab",{name:"Resume editor"}).click();
 await page.getByLabel("Full name").fill("Asha Kumar");
 await page.getByRole("button",{name:"Save resume"}).click();
 await expect(page.getByRole("status")).toContainText("Resume saved as a new revision");
});

test("Resume Studio reports stale revision conflicts and offers a safe reload",async({page})=>{
 await mockResumeStudio(page,true);await page.goto("/resume-studio");
 await page.getByRole("button",{name:/Resume 1 Revision/}).click();
 await page.getByRole("tab",{name:"Resume editor"}).click();
 await page.getByLabel("Full name").fill("Unsaved draft");
 await page.getByRole("button",{name:"Save resume"}).click();
 await expect(page.getByRole("alert").filter({hasText:"changed elsewhere"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Reload latest"})).toBeVisible();
});


test("Resume Studio reviews and applies proposals as a revision",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");
 await page.getByRole("button",{name:/Resume 1 Revision/}).click();
 await page.getByRole("tab",{name:"AI tools"}).click();
 await page.getByRole("button",{name:"Review resume"}).click();
 await expect(page.getByRole("heading",{name:"Suggested changes"})).toBeVisible();
 await page.getByRole("button",{name:"Accept proposal"}).click();
 await page.getByRole("button",{name:"Apply as revision"}).click();
 await expect(page.getByRole("status")).toContainText("applied as a new revision");
});

test("Resume Studio imports a file and downloads an export",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");
 await page.locator('input[type="file"]').setInputFiles({name:"resume.txt",mimeType:"text/plain",buffer:Buffer.from("Asha Kumar\nPython and SQL")});
 await page.getByRole("button",{name:"Import",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Imported resume"})).toBeVisible();
 const download=page.waitForEvent("download");await page.getByRole("button",{name:"PDF"}).click();expect((await download).suggestedFilename()).toContain("Imported-resume.pdf");
});

test("Resume Studio opens with the guided overview and keeps workspace navigation usable on mobile",async({page})=>{
 await mockResumeStudio(page);await page.setViewportSize({width:390,height:844});await page.goto("/resume-studio");await page.getByRole("button",{name:/Resume 1 Revision/}).click();
 await expect(page.getByRole("heading",{name:"Build a resume that gets interviews"})).toBeVisible();
 await expect(page.getByRole("tab",{name:"Overview"})).toHaveAttribute("aria-selected","true");
 await page.getByRole("tab",{name:"Design & templates"}).click();await expect(page.getByRole("heading",{name:"Choose a resume style"})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
