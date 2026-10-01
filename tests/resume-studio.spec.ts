import { test, expect, type Page } from "@playwright/test";

const student={student:{id:"s-1",full_name:"Asha Kumar",email:"asha@example.edu",roll_number:"CS-01",college_name:"VoiceDots College"}};
const details={full_name:"",headline:"",email:"",phone:"",location:"",website:"",linkedin:"",github:"",links:[],photo:""};
const baseProject={id:"rs-1",title:"Resume 1",revision:1,source:"created",updated_at:"2026-09-23T10:00:00Z",presentation:{template_id:"classic",paper_size:"a4",layout:"single",font_family:"DM Sans",accent_color:"#6b30e8",body_font_size_pt:9,section_spacing_px:12,margin_horizontal_mm:14},document:{title:"Resume 1",personal_details:details,sections:[]}};

async function mockResumeStudio(page:Page, conflict=false, profileResume=false, existingProject=true, additionalProjects:any[]=[], linkedMain=false){
 let project:any={...baseProject,linked_resume_id:linkedMain?"profile-1":null,document:{...baseProject.document,personal_details:{...details}}};
 let profileProject:any=null;
 await page.route("**/api/**",async route=>{
  const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
  if(path==="/api/auth/student-me")return route.fulfill({json:student});
  if(path==="/api/student/resume-library"&&method==="GET")return route.fulfill({json:{resumes:profileResume?[{resume_id:"profile-1",original_filename:"Asha_Profile.pdf",label:"Asha profile resume",is_primary:true,submission_id:"submission-1",uploaded_at:"2026-09-29T00:00:00Z"}]:[]}});
  if(path==="/api/student/resume-library/profile-1/file"&&method==="GET")return route.fulfill({status:200,contentType:"application/pdf",body:"%PDF-1.4 profile"});
  if(path==="/api/student/resume-studio/templates")return route.fulfill({json:[{id:"classic",name:"Classic",description:"ATS-friendly",ats_safe:true,tags:["ATS"],tokens:{layout:"single",font_family:"Amiri",accent_color:"#6b30e8",line_height:1.15,section_spacing_px:12,entry_spacing_px:6,margin_horizontal_mm:14,margin_top_mm:14,margin_bottom_mm:14}},{id:"editorial",name:"Editorial",description:"Clear modern layout",ats_safe:true,tags:["Modern"],tokens:{layout:"sidebar",font_family:"Inter",accent_color:"#238b72"}}]});
  if(path==="/api/student/resume-studio/ai/status")return route.fulfill({json:{provider:"deterministic",model:"offline",live_model_configured:false}});
  if(path==="/api/student/resume-studio/resumes/rs-1/interviews"&&method==="POST")return route.fulfill({json:{id:"chat-1",messages:[{role:"assistant",text:"What experience should we include?"}],state:{},document:project.document,resume_revision:project.revision}});
  if(path==="/api/student/resume-studio/resumes"&&method==="GET"){const rows=existingProject?[project,...additionalProjects]:[];if(profileProject&&!rows.some(row=>row.id===profileProject.id))rows.unshift(profileProject);return route.fulfill({json:rows})}
  if(path==="/api/student/resume-studio/resumes"&&method==="POST"){project={...project,...route.request().postDataJSON(),revision:1};return route.fulfill({status:201,json:project})}
  if(path==="/api/student/resume-studio/resumes/rs-1"&&method==="GET")return route.fulfill({json:project});
  if((path==="/api/student/resume-studio/resumes/rs-profile-1"||path==="/api/student/resume-studio/resumes/rs-import-1")&&method==="GET")return route.fulfill({json:profileProject});
  if(path==="/api/student/resume-studio/resumes/rs-1"&&method==="PUT"){
   if(conflict)return route.fulfill({status:409,json:{detail:"Resume changed in another tab. Reload before saving."}});
   const body=route.request().postDataJSON();project={...project,...body,revision:project.revision+1};return route.fulfill({json:project});
  }
  if(path==="/api/student/resume-studio/resumes/rs-1/duplicate"&&method==="POST")return route.fulfill({status:201,json:{...project,id:"rs-copy",title:"Resume 1 copy",source:"duplicate"}});
  if(path==="/api/student/resume-studio/resumes/import"&&method==="POST"){profileProject={...project,id:profileResume?(existingProject?"rs-profile-1":project.id):(existingProject?"rs-import-1":project.id),title:profileResume?"Asha profile resume":"Imported resume",source:profileResume?"profile":"import",linked_resume_id:profileResume?"profile-1":null,document:{...project.document,title:profileResume?"Asha profile resume":"Imported resume",personal_details:{...details,full_name:profileResume?"Asha Kumar":""}}};if(!existingProject)project=profileProject;return route.fulfill({status:201,json:{...profileProject,import_report:{warnings:[],confidence:.94}}})}
  if(path==="/api/student/resume-studio/proposals"&&method==="GET")return route.fulfill({json:[]});
  if(path==="/api/student/resume-studio/resumes/rs-1/ai/review"&&method==="POST")return route.fulfill({json:{id:"p-1",proposal_id:"p-1",project_id:"rs-1",source_revision:project.revision,operation:"review",status:"pending",changes:[{id:"c-1",target:"headline",field:"headline",before:"",after:"Data Analyst",reason:"Supported by the resume"}],grounding:{grounded:true,unsupported_claims:[]}}});
  if(path==="/api/student/resume-studio/proposals/p-1/accept"&&method==="POST")return route.fulfill({json:{id:"p-1",operation:"review",status:"accepted",source_revision:project.revision,proposal:{changes:[{id:"c-1",target:"headline",field:"headline",before:"",after:"Data Analyst"}],grounding:{grounded:true,unsupported_claims:[]}}}});
  if(path==="/api/student/resume-studio/proposals/p-1/apply"&&method==="POST"){project={...project,revision:project.revision+1};return route.fulfill({json:{resume:project,revision:project.revision,applied_ids:["c-1"]}})}
  if(path.match(/\/api\/student\/resume-studio\/resumes\/[^/]+\/export$/)&&method==="POST")return route.fulfill({status:200,contentType:"application/pdf",body:"%PDF-1.4 test"});
  if(path.match(/\/api\/student\/resume-studio\/resumes\/[^/]+\/preview$/)&&method==="POST"){const draft=route.request().postDataJSON();return route.fulfill({contentType:"text/html",body:`<!doctype html><html><head><style>@page{size:A4;margin:0}html,body{margin:0;padding:0}*{box-sizing:border-box}.pg-wrap{position:relative;background:#f3f1ec}.rd{position:relative;width:210mm;min-height:297mm;margin:0 auto;padding:24mm;background:white;border:1px solid #ddd;font-family:Arial,sans-serif}.rd h1{font-size:28px}</style></head><body><div class="pg-wrap"><main class="rd tpl-classic layout-single"><h1>${draft.document.personal_details.full_name||draft.title}</h1></main></div></body></html>`})}
  if(path.match(/\/api\/student\/resume-studio\/resumes\/[^/]+\/preview$/)&&method==="GET")return route.fulfill({contentType:"text/html",body:`<!doctype html><html><head><style>html,body{margin:0}.rd{box-sizing:border-box;width:210mm;min-height:297mm;padding:20mm;background:white;border:1px solid #ddd}.rd h1{font:700 28px Georgia}</style></head><body><main class="rd"><h1>${project.document.personal_details.full_name||project.title}</h1><h2>Education</h2></main></body></html>`});
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
 await expect(page.locator(".dashboard-topbar")).toBeVisible();
 await expect(page.locator(".dashboard-topbar .breadcrumb")).toContainText("Workspace");
 await expect(page.locator(".dashboard-topbar .breadcrumb")).toContainText("Resume Studio");
 await expect(page.locator(".dashboard-topbar")).toHaveCSS("position","sticky");
 await expect(page.locator(".rs-library-tabs")).toHaveCSS("height","40px");
 const overviewTabs=page.locator(".rs-library-tabs");
 for(const name of ["Overview","Resume editor","Design & templates","AI tools"])await expect(overviewTabs.getByRole("tab",{name})).toHaveCSS("border-radius","10px");
 await expect(overviewTabs.getByRole("tab",{name:"Overview"})).toHaveCSS("background-color","rgb(241, 236, 254)");
 expect(await overviewTabs.getByRole("tab",{name:"Overview"}).evaluate(el=>getComputedStyle(el,"::after").display)).toBe("none");
 await expect(overviewTabs).toHaveCSS("border-bottom-width","0px");
 await expect(page.getByRole("tab",{name:"Overview"})).toHaveAttribute("aria-selected","true");await expect(page.locator(".rs-home-intro")).toHaveCSS("background-image","none");await expect(page.locator(".rs-home-intro")).toHaveCSS("border-top-width","0px");await page.screenshot({path:"test-results/resume-studio-header-tabs.png"});
 await expect(page.frameLocator(".rs-thumbnail-viewport iframe").first().locator(".rd")).toBeVisible();
 await page.getByRole("button",{name:/Open Resume 1/}).click();
 await page.getByRole("tab",{name:"Resume editor"}).click();
 const editorTabs=page.locator(".rs-app-tabs");
 for(const name of ["Overview","Resume editor","Design & templates","AI tools"])await expect(editorTabs.getByRole("tab",{name})).toHaveCSS("border-radius","10px");
 for(const [name,background] of [["Resume editor","rgb(241, 236, 254)"],["Design & templates","rgb(241, 236, 254)"],["AI tools","rgb(241, 236, 254)"]] as const){
  await expect(editorTabs.getByRole("tab",{name})).toHaveCSS("border-radius","10px");
  await editorTabs.getByRole("tab",{name}).click();
  await expect(editorTabs.getByRole("tab",{name})).toHaveCSS("background-color",background);
  expect(await editorTabs.getByRole("tab",{name}).evaluate(el=>getComputedStyle(el,"::after").display)).toBe("none");
 }
 await editorTabs.getByRole("tab",{name:"Resume editor"}).click();
 await page.getByLabel("Full name").fill("Asha Kumar");
 await expect(page.locator(".rs-save-state")).toHaveText("Unsaved changes");
 await expect(page.locator(".rs-save-state")).toHaveText("Saved");
});

test("Main Resume from My Profile appears first as one linked Studio resume",async({page})=>{
 await mockResumeStudio(page,false,true,false);await page.goto("/resume-studio");
 await expect(page.locator(".rs-profile-resume")).toHaveCount(0);
 await expect(page.getByText("1 resume",{exact:true})).toBeVisible();
 const cards=page.locator(".rs-project-card-new");await expect(cards).toHaveCount(1);
 await expect(cards.first().getByText("Main Resume",{exact:true})).toBeVisible();
 await expect(cards.first().getByRole("button",{name:/Open Asha profile resume/})).toBeVisible();
 await expect(page.frameLocator(".rs-thumbnail-viewport iframe").first().locator(".rd")).toBeVisible();
 await expect(page.getByRole("button",{name:"Add to Resume Studio"})).toHaveCount(0);
});

test("Resume Studio places Main Resume first and does not duplicate an already linked profile resume",async({page})=>{
 await mockResumeStudio(page,false,true,true,[],true);await page.goto("/resume-studio");
 await expect(page.getByText("1 resume",{exact:true})).toBeVisible();
 const cards=page.locator(".rs-project-card-new");await expect(cards).toHaveCount(1);
});

test("Main Resume is first while unrelated Studio resumes remain available",async({page})=>{
 const second={...baseProject,id:"rs-2",title:"Resume 2",updated_at:"2026-09-24T10:00:00Z"};
 await mockResumeStudio(page,false,true,true,[second]);await page.goto("/resume-studio");
 await expect(page.getByText("3 resumes",{exact:true})).toBeVisible();
 const cards=page.locator(".rs-project-card-new");await expect(cards).toHaveCount(3);
 await expect(cards.first().getByText("Main Resume",{exact:true})).toBeVisible();
 await expect(cards.nth(1).getByRole("button",{name:/Open Resume 2/})).toBeVisible();
 await expect(cards.nth(2).getByRole("button",{name:/Open Resume 1/})).toBeVisible();
 await expect(page.getByRole("button",{name:"Add to Resume Studio"})).toHaveCount(0);
});

test("Main Resume card prevents deletion and its menu closes on outside click",async({page})=>{
 await mockResumeStudio(page,false,true,false);await page.goto("/resume-studio");
 const mainCard=page.locator(".rs-project-card-new.is-main-resume");
 await mainCard.getByRole("button",{name:/Actions for/}).click();
 const menu=mainCard.getByRole("menu");await expect(menu).toBeVisible();
 await expect(menu.getByRole("menuitem",{name:/Delete · Main Resume/})).toBeDisabled();
 const box=await menu.boundingBox();expect(box?.x).toBeGreaterThanOrEqual(0);expect((box?.x||0)+(box?.width||0)).toBeLessThanOrEqual(1280);
 const mainBadge=await mainCard.locator(".rs-main-label").boundingBox();
 const title=await mainCard.locator(".rs-project-open > strong").boundingBox();
 expect(box&&mainBadge&&title).toBeTruthy();expect((box?.y||0)+(box?.height||0)).toBeLessThanOrEqual((title?.y||0)-8);
 const deleteMain=menu.getByRole("menuitem",{name:/Delete · Main Resume/});
 await expect(deleteMain).toHaveCSS("display","flex");await expect(deleteMain).toHaveCSS("align-items","center");await expect(deleteMain).toHaveCSS("white-space","nowrap");await expect(deleteMain).toHaveCSS("width","198px");await expect(deleteMain).toHaveCSS("height","36px");await expect(deleteMain).toHaveCSS("border-top-width","0px");
 await page.locator(".rs-home-intro h1").click();await expect(menu).toHaveCount(0);
});

test("Resume list failures stay compact and can be retried without hiding the Overview",async({page})=>{
 await mockResumeStudio(page);await page.route("**/api/student/resume-studio/resumes",route=>route.fulfill({status:503,json:{detail:"Unavailable"}}));
 await page.goto("/resume-studio");
 await expect(page.locator(".rs-overview-load-error")).toContainText("Your Resume Studio list could not be loaded.");
 await expect(page.locator(".rs-overview-load-error").getByRole("button",{name:/Retry/})).toBeVisible();
 await expect(page.locator(".rs-home-intro h1")).toBeVisible();
});

test("Resume Studio landing actions have consistent button sizing and alignment",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");
 const actions=page.locator(".rs-home-actions > .button");
 await expect(actions).toHaveCount(3);
 const heights=await actions.evaluateAll(items=>items.map(item=>item.getBoundingClientRect().height));
 expect(Math.max(...heights)-Math.min(...heights)).toBeLessThanOrEqual(1);
 await expect(page.locator(".rs-upload-button")).toHaveCSS("flex-direction","row");
 await expect(page.getByText("Import a resume",{exact:true})).toBeVisible();
});


test("Resume Studio Overview shares one aligned container at desktop widths",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");
 for(const width of [1920,1440,1280]){
  await page.setViewportSize({width,height:900});
  const layout=await page.evaluate(()=>{
   const selectors=[".rs-library-tabs button:first-child",".rs-home-kicker",".rs-home-intro h1",".rs-home-actions",".rs-library-rebuilt"];
   const boxes=selectors.map(selector=>document.querySelector(selector)!.getBoundingClientRect());
   return {lefts:boxes.map(box=>box.left),navWidth:document.querySelector(".rs-library-tabs")!.getBoundingClientRect().width,navPosition:getComputedStyle(document.querySelector(".rs-library-tabs")!).position,navBackground:getComputedStyle(document.querySelector(".rs-library-tabs")!).backgroundColor,card:document.querySelector(".rs-project-card-new")!.getBoundingClientRect().toJSON()};
  });
  expect(Math.max(...layout.lefts)-Math.min(...layout.lefts)).toBeLessThanOrEqual(1);
  // Overview now shares the full shell gutter with every workspace section.
  expect(layout.navWidth).toBe(await page.locator(".resume-studio").evaluate(el=>el.getBoundingClientRect().width));
  expect(layout.navPosition).toBe("relative");
  expect(layout.navBackground).toBe("rgb(248, 248, 250)");
  // Show the entire first paper page, rather than the former cropped 190px thumbnail.
  const thumb=await page.locator(".rs-card-paper").first().boundingBox();
  expect(thumb!.height).toBe(220);expect(thumb!.width).toBeLessThanOrEqual(210);
  const sheet=(await page.locator(".rs-thumbnail-viewport iframe").first().boundingBox())!;expect(sheet.x).toBeGreaterThanOrEqual(thumb!.x-1);expect(sheet.x+sheet.width).toBeLessThanOrEqual(thumb!.x+thumb!.width+1);expect(sheet.height/sheet.width).toBeCloseTo(1123/794,1);
  expect(layout.card.width).toBeGreaterThanOrEqual(190);
  expect(layout.card.width).toBeLessThanOrEqual(210);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.screenshot({path:"test-results/resume-studio-library-desktop.png",fullPage:true});
});

test("Resume Studio Overview remains usable at tablet and mobile widths",async({page})=>{
 await mockResumeStudio(page);await page.setViewportSize({width:1024,height:900});await page.goto("/resume-studio");
 await expect(page.locator(".rs-library-tabs")).toBeVisible();
 await expect(page.locator(".rs-project-card-new").first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator(".rs-home-intro h1")).toBeVisible();
 await expect(page.locator(".rs-home-actions > .button")).toHaveCount(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("Resume Studio overview manages multiple resumes and duplicates from the card menu",async({page})=>{
 const second={...baseProject,id:"rs-2",title:"Resume 2",updated_at:"2026-09-24T10:00:00Z"};
 await mockResumeStudio(page,false,false,true,[second]);await page.goto("/resume-studio");
 await expect(page.getByText("2 resumes",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:/Open Resume 1/})).toBeVisible();
 await expect(page.getByRole("button",{name:/Open Resume 2/})).toBeVisible();
 await page.getByRole("button",{name:"Actions for Resume 1"}).click();
 await page.getByRole("menuitem",{name:"Duplicate"}).click();
 await expect(page.getByRole("button",{name:/Open Resume 1 copy/})).toBeVisible();
});

test("Resume Studio Add content gallery adds a selected section",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();
 await page.getByRole("button",{name:"Add content"}).click();
 await expect(page.getByRole("dialog",{name:"Add content"})).toBeVisible();
 await expect(page.locator(".rs-add-content-option")).toHaveCount(15);
 await page.getByRole("button",{name:/Education Degrees, schools/}).click();
 await expect(page.getByRole("dialog",{name:"Add content"})).toHaveCount(0);
 await expect(page.locator(".rs-section-name").last()).toHaveValue("Education");
});

test("Resume Studio autosaves edits and keeps the save state tied to the backend",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Resume editor"}).click();
 await page.getByLabel("Full name").fill("Asha Autosaved");
 await expect(page.locator(".rs-save-state")).toHaveText("Unsaved changes");
 await expect(page.locator(".rs-save-state")).toHaveText("Saved",{timeout:5000});
  await expect(page.getByRole("button",{name:"Choose resume"})).toContainText("Resume 1");
});

test("Resume Studio undo history coalesces edits and supports undo and redo",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Resume editor"}).click();
 await page.getByLabel("Full name").fill("Asha Kumar");await expect(page.locator(".rs-save-state")).toHaveText("Saved");await page.evaluate(()=>{(document.activeElement as HTMLElement|null)?.blur()});
 await page.keyboard.press("Control+z");await expect(page.getByLabel("Full name")).toHaveValue("");
 await page.keyboard.press("Control+Shift+z");await expect(page.getByLabel("Full name")).toHaveValue("Asha Kumar");
});

test("Resume Studio reports stale revision conflicts and offers a safe reload",async({page})=>{
 await mockResumeStudio(page,true);await page.goto("/resume-studio");
 await page.getByRole("button",{name:/Open Resume 1/}).click();
 await page.getByRole("tab",{name:"Resume editor"}).click();
 await page.getByLabel("Full name").fill("Unsaved draft");
 await expect(page.getByRole("alert").filter({hasText:"changed elsewhere"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Reload latest"})).toBeVisible();
});


test("Resume Studio reviews and applies proposals as a revision",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");
 await page.getByRole("button",{name:/Open Resume 1/}).click();
 await page.getByRole("tab",{name:"AI tools"}).click();
 await expect(page.getByText(/AI assistance is connected|gpt-5\.4-mini/)).toHaveCount(0);
 await page.getByRole("button",{name:"Review my resume"}).click();
 await expect(page.getByRole("heading",{name:"Suggested changes"})).toBeVisible();
 await page.getByRole("button",{name:"Accept proposal"}).click();
 await page.getByRole("button",{name:"Apply as revision"}).click();
 await expect(page.locator(".rs-notice")).toContainText("applied as a new revision");
});

test("Resume Studio imports a file and downloads an export",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");
 await page.locator('input[type="file"]').setInputFiles({name:"resume.txt",mimeType:"text/plain",buffer:Buffer.from("Asha Kumar\nPython and SQL")});
 await page.getByRole("button",{name:"Import resume",exact:true}).click();
 await expect(page.getByRole("button",{name:"Choose resume"})).toContainText("Imported resume");
 await page.getByRole("button",{name:"Download"}).click();const download=page.waitForEvent("download");await page.getByRole("menuitem",{name:/PDF/}).click();expect((await download).suggestedFilename()).toContain("Imported-resume.pdf");
});

test("Resume Studio opens with the guided overview and keeps workspace navigation usable on mobile",async({page})=>{
 await mockResumeStudio(page);await page.setViewportSize({width:390,height:844});await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();
 await expect(page.getByRole("button",{name:"Choose resume"})).toContainText("Resume 1");
 await expect(page.locator(".rs-preview-panel")).toBeHidden();
 await expect(page.getByRole("tab",{name:"Resume editor"})).toHaveAttribute("aria-current","page");
 await expect(page.locator(".dashboard-topbar")).toBeVisible();await expect(page.locator(".dashboard-topbar")).toHaveCSS("position","sticky");
 await page.getByRole("tab",{name:"Design & templates"}).click();await expect(page.getByRole("tab",{name:"Template",exact:true})).toBeVisible();await expect(page.getByRole("heading",{name:"Template",exact:true})).toBeVisible();await expect(page.locator(".dashboard-topbar")).toBeVisible();
 await page.locator(".rs-studio-nav").evaluate(element=>{element.scrollLeft=element.scrollWidth});await page.getByRole("tab",{name:"AI tools"}).click();await expect(page.locator(".dashboard-topbar")).toBeVisible();await expect(page.locator(".dashboard-topbar")).toHaveCSS("position","sticky");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("Resume Studio overview uses the full desktop workspace and spacing has working controls",async({page})=>{
 await mockResumeStudio(page);await page.setViewportSize({width:1440,height:900});await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();
 await page.screenshot({path:"test-results/resume-studio-project-overview-desktop.png",fullPage:true});
 await expect(page.getByLabel("Full name")).toBeVisible();
 await page.evaluate(()=>window.scrollTo(0,220));
 const toolbarClearance=await page.evaluate(()=>({
  toolbar:document.querySelector(".rs-project-toolbar")!.getBoundingClientRect().top,
  shellHeader:document.querySelector(".dashboard-topbar"),
 }));
 expect(toolbarClearance.shellHeader).not.toBeNull();await expect(page.locator(".dashboard-topbar")).toBeVisible();await expect(page.locator(".dashboard-topbar")).toHaveCSS("top","0px");
 await page.screenshot({path:"test-results/resume-studio-toolbar-scrolled-desktop.png"});
 await page.evaluate(()=>window.scrollTo(0,0));
 const workspace=await page.locator(".rs-workspace").boundingBox();const editor=await page.locator(".rs-editor").boundingBox();
 expect(workspace?.width).toBeGreaterThan(1000);expect(editor?.width).toBeGreaterThanOrEqual(400);expect(editor?.width).toBeLessThan(510);expect((await page.locator(".rs-preview-panel").boundingBox())?.width||0).toBeGreaterThan(editor?.width||0);await expect(page.locator(".rs-preview-panel")).toBeVisible();
 await page.getByRole("tab",{name:"Design & templates"}).click();await page.getByRole("tab",{name:"Spacing"}).click();
 await page.screenshot({path:"test-results/resume-studio-spacing-desktop.png",fullPage:true});
 await expect(page.getByText("Add a name or resume content and the live preview will appear here.")).toBeVisible();await expect(page.getByRole("button",{name:"Set as Main Resume",exact:true})).toBeDisabled();
 const spacing=page.getByRole("slider",{name:"Section spacing"});
 await expect(spacing).toBeVisible();await expect(page.getByRole("slider",{name:"Horizontal margin"})).toHaveCount(0);await spacing.focus();await spacing.press("ArrowRight");await expect(spacing).toHaveAttribute("aria-valuenow","13");await page.getByRole("tab",{name:"Template",exact:true}).click();await expect(page.getByRole("slider",{name:"Horizontal margin"})).toBeVisible();
});

test("design card reset restores only its own presentation keys",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Design & templates"}).click();
 const margin=page.getByRole("slider",{name:"Horizontal margin"});await margin.focus();await margin.press("ArrowRight");await expect(margin).toHaveAttribute("aria-valuenow","15");await page.getByRole("tab",{name:"Typeface",exact:true}).click();await page.locator(".rs-font-picker").first().locator("button").click();await page.getByRole("option",{name:"Inter"}).first().click();await expect(page.locator(".rs-font-picker").first().locator("button")).toContainText("Inter");
 await page.getByRole("tab",{name:"Spacing",exact:true}).click();const line=page.getByRole("slider",{name:"Line height"}),section=page.getByRole("slider",{name:"Section spacing"}),entry=page.getByRole("slider",{name:"Entry spacing"});await line.focus();await line.press("ArrowRight");await section.focus();await section.press("ArrowRight");await entry.focus();await entry.press("ArrowRight");
 await expect(line).toHaveAttribute("aria-valuenow","1.2");await expect(section).toHaveAttribute("aria-valuenow","13");await expect(entry).toHaveAttribute("aria-valuenow","7");
 await page.locator(".rs-design-card").filter({has:page.getByRole("heading",{name:"Spacing",exact:true})}).getByRole("button",{name:"Reset"}).click();await expect(line).toHaveAttribute("aria-valuenow","1.15");await expect(section).toHaveAttribute("aria-valuenow","12");await expect(entry).toHaveAttribute("aria-valuenow","6");
 await page.getByRole("tab",{name:"Template",exact:true}).click();await expect(margin).toHaveAttribute("aria-valuenow","15");await page.getByRole("tab",{name:"Typeface",exact:true}).click();await expect(page.locator(".rs-font-picker").first().locator("button")).toContainText("Inter");
});

test("Resume Studio preview renders the unsaved editor draft",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Resume editor"}).click();
 await page.getByLabel("Full name").fill("Asha Draft Preview");
 const preview=page.frameLocator('iframe[title="Resume preview"]');await expect(preview.locator("main.rd.tpl-classic.layout-single")).toBeVisible();await expect(preview.locator("h1")).toHaveText("Asha Draft Preview");
});

test("Resume Studio preview reads renderer page metadata and focuses mapped fields on click",async({page})=>{
 await mockResumeStudio(page);await page.route("**/api/student/resume-studio/resumes/rs-1/preview",async route=>{
  if(route.request().method()==="POST"){
   const draft=route.request().postDataJSON();
   return route.fulfill({contentType:"text/html",body:`<!doctype html><html><head><style>*{box-sizing:border-box}html,body{margin:0}.rd{width:210mm;min-height:297mm;padding:20mm}</style></head><body><main class="rd"><h1 data-edit="p:full_name">${draft.document.personal_details.full_name||draft.title}</h1></main><script>parent.postMessage({type:"resume-preview",pages:2,height:2264},"*");document.querySelector("[data-edit]").addEventListener("click",()=>parent.postMessage({type:"resume-edit",key:"p:full_name"},"*"))</script></body></html>`});
  }
  return route.fallback();
 });
 await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Resume editor"}).click();await page.getByLabel("Full name").fill("Asha Preview");
 await expect(page.locator('iframe[title="Resume preview"]')).toBeVisible();
 await expect(page.locator(".rs-preview-page-size")).toHaveText("2 pages · A4");
 await page.frameLocator('iframe[title="Resume preview"]').locator("[data-edit='p:full_name']").click();
 await expect(page.getByLabel("Full name")).toBeFocused();
});

test("Resume Editor toolbar and fitted preview stay aligned across desktop sizes",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Resume editor"}).click();
 await page.getByLabel("Full name").fill("Asha Preview");await expect(page.frameLocator('iframe[title="Resume preview"]').locator(".rd")).toBeVisible();const tabs=page.locator(".rs-app-tabs");await expect(tabs.getByRole("tab",{name:"Resume editor"})).toHaveCSS("height","40px");await expect(tabs.getByRole("tab",{name:"Resume editor"})).toHaveCSS("background-color","rgb(241, 236, 254)");
 const toolbar=page.locator(".rs-project-toolbar");await expect(toolbar).toHaveCSS("min-height","58px");await expect(toolbar.locator(".rs-project-picker")).toHaveCSS("height","40px");await expect(toolbar.locator("button.button.secondary").first()).toHaveCSS("height","40px");await expect(toolbar.locator("button.button.primary")).toHaveCSS("height","40px");await expect(toolbar.locator(".rs-toolbar-kebab")).toHaveCSS("height","40px");await expect(page.locator(".rs-preview-page-size")).toHaveText("1 page · A4");await expect(page.locator(".rs-preview-edit-hint")).toHaveText("Click text to edit it");
 for(const width of [1920,1600,1440,1280]){
  await page.setViewportSize({width,height:1000});
  const editor=await page.locator(".rs-editor").boundingBox(),preview=await page.locator(".rs-preview-panel").boundingBox();
  expect(editor?.width).toBeGreaterThanOrEqual(width<=1300?350:400);expect(editor?.width).toBeLessThanOrEqual(560);expect(preview?.width).toBeGreaterThan(editor?.width||0);expect((preview?.width||0)/((editor?.width||0)+(preview?.width||0))).toBeGreaterThan(.55);
  const paper=page.frameLocator('iframe[title="Resume preview"]').locator(".rd");await expect(paper).toBeVisible();
  await expect.poll(()=>paper.evaluate(element=>element.ownerDocument.documentElement.scrollWidth<=element.ownerDocument.documentElement.clientWidth+1)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 const zoom=page.locator(".rs-preview-zoom-value");await expect(zoom).toHaveText("100%");await page.getByRole("button",{name:"Zoom in"}).click();await expect(zoom).toHaveText("110%");await page.getByRole("button",{name:"Zoom out"}).click();await expect(zoom).toHaveText("100%");
});

test("Resume Editor section cards and Add Content modal use the shared card treatment",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Resume editor"}).click();
 const addContent=page.getByRole("button",{name:"Add content"});await addContent.click();await page.getByRole("button",{name:/Education Degrees, schools/}).click();await expect(page.locator(".rs-content-section").first()).toHaveCSS("border-radius","14px");await expect(page.getByRole("button",{name:"Add Education"})).toHaveCSS("height","40px");
 const addContentAgain=page.getByRole("button",{name:"Add content"});
 await expect(addContentAgain).toHaveCSS("height","56px");
 const lastSection=await page.locator(".rs-content-section").last().boundingBox(),addBox=await addContent.boundingBox();expect(lastSection&&addBox).toBeTruthy();expect(addBox!.y).toBeGreaterThan(lastSection!.y+lastSection!.height);
 await addContentAgain.click();const dialog=page.getByRole("dialog",{name:"Add content"});await expect(dialog).toBeVisible();await expect(page.locator(".rs-add-content-option").first()).toHaveCSS("border-radius","15px");await expect(page.locator(".rs-add-content-grid")).toHaveCSS("grid-template-columns",/\d+px \d+px \d+px/);
 await dialog.getByRole("button",{name:"Close add content"}).click();await expect(dialog).toHaveCount(0);
});

test("Resume Studio Overview card info aligns title, Main Resume badge, metadata, and actions",async({page})=>{
 await mockResumeStudio(page,false,true,false);await page.goto("/resume-studio");const card=page.locator(".rs-project-card-new.is-main-resume");
 const boxes=await Promise.all([card.locator(".rs-project-open > strong").boundingBox(),card.locator(".rs-main-label").boundingBox(),card.locator(".rs-project-open > span:not(.rs-card-paper):not(.rs-main-label)").boundingBox(),card.locator(".rs-card-menu-trigger").boundingBox()]);
 expect(boxes.every(Boolean)).toBe(true);expect(boxes[0]!.x+16).toBeCloseTo(boxes[2]!.x,0);expect(boxes[1]!.x).toBeGreaterThan(boxes[2]!.x);expect(boxes[3]!.width).toBe(36);expect(boxes[3]!.height).toBe(36);
});

test("Resume Studio preview exposes a retry state after a rendering request fails",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await expect(page.frameLocator(".rs-thumbnail-viewport iframe").first().locator(".rd")).toBeVisible();let failed=false;
 await page.route("**/api/student/resume-studio/resumes/rs-1/preview",async route=>{
  if(route.request().method()==="POST"&&!failed){failed=true;return route.abort("failed")}return route.fallback();
 });
 await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Resume editor"}).click();
 await expect(page.getByText("Preview unavailable")).toBeVisible();
 await page.getByRole("button",{name:"Try again"}).click();
 await expect(page.getByText("Add a name or resume content and the live preview will appear here.")).toBeVisible();
});

test("Resume Studio editor stays within phone, tablet and laptop viewports",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();
 for(const width of [390,768,1024]){
  await page.setViewportSize({width,height:900});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test("Resume Studio keeps controls compact, fields aligned and preview tall on desktop",async({page})=>{
 await mockResumeStudio(page);await page.setViewportSize({width:1440,height:900});await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Resume editor"}).click();
 const toolbar=await page.locator(".rs-project-toolbar").boundingBox();const name=await page.getByLabel("Full name").boundingBox();const preview=await page.locator(".rs-preview-frame").boundingBox();const previewPanel=await page.locator(".rs-preview-panel").boundingBox();
 expect(toolbar?.height).toBeGreaterThanOrEqual(58);expect(toolbar?.height).toBeLessThanOrEqual(64);expect(name?.height).toBeGreaterThanOrEqual(40);expect(name?.height).toBeLessThanOrEqual(44);expect(preview?.height).toBeGreaterThanOrEqual(300);expect(previewPanel!.y+previewPanel!.height).toBeLessThanOrEqual(900-15);expect(previewPanel?.width).toBeGreaterThanOrEqual(420);
});


test("Build with AI chat opens the guided conversation after creating the project",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:"Build with AI chat"}).click();
 await expect(page.getByRole("tab",{name:"AI tools"})).toHaveAttribute("aria-selected","true");
 await expect(page.getByText("What experience should we include?")).toBeVisible();
});

test("AI chat uses backend reply chips and added-to-resume evidence",async({page})=>{
 await mockResumeStudio(page);
 await page.route("**/api/student/resume-studio/resumes/rs-1/interviews",route=>route.fulfill({json:{id:"chat-1",messages:[{role:"assistant",text:"What role are you targeting?",chips:["Software engineer","Data analyst"],kind:"text"},{role:"assistant",text:"✓ Added your experience.",chips:["Add education"],kind:"added"}],state:{stage:"experience"},document:baseProject.document,resume_revision:baseProject.revision}}));
 await page.goto("/resume-studio");await page.getByRole("button",{name:"Build with AI chat"}).click();
 await expect(page.getByRole("status").filter({hasText:"Added to your resume"})).toBeVisible();
 const suggestions=page.getByRole("group",{name:"Suggested replies"});await expect(suggestions).toBeVisible();
 await suggestions.getByRole("button",{name:"Add education"}).click();await expect(page.locator(".rs-chat-form textarea")).toHaveValue("Add education");
});

test("choosing a design template applies its presentation settings and saves them",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Design & templates"}).click();
 await page.getByRole("button",{name:/Editorial Clear modern layout/}).click();
 await expect(page.getByRole("button",{name:"Two columns",exact:true})).toHaveAttribute("aria-pressed","true");await page.getByRole("tab",{name:"Typeface"}).click();await expect(page.locator(".rs-font-picker").first().locator("button")).toContainText("Inter");await page.screenshot({path:"test-results/resume-studio-typeface-meters.png",fullPage:true});
 await page.getByRole("tab",{name:"Template",exact:true}).click();await expect(page.getByLabel("Custom accent colour")).toHaveValue("#238b72");await expect(page.locator(".rs-save-state")).toHaveText("Saved",{timeout:5000});await page.reload();await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Design & templates"}).click();await expect(page.getByRole("button",{name:"Two columns",exact:true})).toHaveAttribute("aria-pressed","true");await page.getByRole("tab",{name:"Typeface"}).click();await expect(page.locator(".rs-font-picker").first().locator("button")).toContainText("Inter");await page.screenshot({path:"test-results/resume-studio-typeface-meters.png",fullPage:true});
});

test("AI chat starts from the hub and restart confirms whether to preserve or clear student details",async({page})=>{
 await mockResumeStudio(page);const restarts:any[]=[];
 await page.route("**/api/student/resume-studio/resumes/rs-1/interviews",async route=>{if(route.request().method()==="POST")restarts.push(route.request().postDataJSON());return route.fallback()});
 await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"AI tools"}).click();
 await page.getByRole("button",{name:/Build your resume by chatting/}).click();await expect(page.getByText("What experience should we include?")).toBeVisible();await expect.poll(()=>restarts.length).toBe(1);expect(restarts[0]).toEqual({restart:false});
 await page.getByRole("button",{name:"Restart"}).click();const dialog=page.getByRole("dialog",{name:"Restart the AI chat?"});await expect(dialog).toBeVisible();
 await dialog.getByRole("button",{name:"Keep my details"}).click();await expect.poll(()=>restarts.length).toBe(2);expect(restarts[1]).toEqual({restart:true});
 await page.getByRole("button",{name:"Restart"}).click();await page.getByRole("dialog").getByRole("button",{name:"Clear everything"}).click();
 await expect(page.getByText("Saving a clean resume revision before restarting the chat.")).toBeVisible();await expect.poll(()=>restarts.length).toBe(3);expect(restarts[2]).toEqual({restart:true});
});


test("the four section controls are one shared component on every Resume Studio screen",async({page})=>{
 await mockResumeStudio(page);await page.setViewportSize({width:1440,height:900});await page.goto("/resume-studio");
 const names=["Overview","Resume editor","Design & templates","AI tools"];
 const measure=async(scope:string)=>page.locator(scope).evaluate(nav=>Array.from(nav.querySelectorAll("button")).map(button=>{
  const style=getComputedStyle(button);
  return [style.height,style.paddingLeft,style.paddingRight,style.borderRadius,getComputedStyle(button,"::after").display].join("|");
 }).concat([getComputedStyle(nav).gap]));
 const overview=await measure(".rs-library-tabs");
 expect(new Set(overview.slice(0,4).map(row=>row.split("|").slice(0,4).join("|"))).size).toBe(1);
 expect(overview.every(row=>!row.endsWith("block"))).toBe(true);
 expect(overview.at(-1)).toBe("8px");
 await page.getByRole("button",{name:/Open Resume 1/}).click();
 for(const name of names.slice(1)){
  await page.locator(".rs-app-tabs").getByRole("tab",{name}).click();
  const current=await measure(".rs-app-tabs");
  expect(current.slice(0,4).map(row=>row.split("|").slice(0,4).join("|"))).toEqual(overview.slice(0,4).map(row=>row.split("|").slice(0,4).join("|")));
  expect(current.at(-1)).toBe("8px");
  await expect(page.locator(".rs-app-tabs").getByRole("tab",{name})).toHaveCSS("background-color","rgb(241, 236, 254)");
  await expect(page.locator(".rs-app-tabs").getByRole("tab",{name})).toHaveCSS("color","rgb(107, 48, 232)");
 }
 // Only one navigation on the page: the old duplicate workspace rail is gone.
 await expect(page.getByRole("tablist",{name:"Resume Studio sections"})).toHaveCount(1);
});

test("section navigation and design groups scroll away while the toolbar stays accessible",async({page})=>{
 await mockResumeStudio(page);await page.setViewportSize({width:1440,height:900});await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Design & templates"}).click();await page.getByRole("tab",{name:"Details",exact:true}).click();
 const tabs=page.locator(".rs-app-tabs"),toolbar=page.locator(".rs-project-toolbar"),groups=page.locator(".rs-design-tabs");await expect(tabs).not.toHaveCSS("position","sticky");await expect(groups).toHaveCSS("position","static");await expect(toolbar).toHaveCSS("position","sticky");
 await page.evaluate(()=>window.scrollTo(0,800));const nav=(await tabs.boundingBox())!,group=(await groups.boundingBox())!,bar=(await toolbar.boundingBox())!;expect(nav.y+nav.height).toBeLessThan(0);expect(group.y+group.height).toBeLessThan(0);expect(Math.round(bar.y)).toBe(89);
 await page.evaluate(()=>window.scrollTo(0,0));await expect(tabs.getByRole("tab",{name:"Overview"})).toBeInViewport();await expect(groups.getByRole("tab",{name:"Details"})).toBeInViewport();
});

test("resume photo is chosen explicitly, saved with its resume, and profile photo imports only on request",async({page})=>{
 await mockResumeStudio(page);let profilePhotoRequests=0;const savedDocuments:any[]=[];
 await page.route("**/api/student/profile/photo",async route=>{profilePhotoRequests++;return route.fulfill({status:200,contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF8sAAAAASUVORK5CYII=","base64")})});
 await page.route("**/api/student/resume-studio/resumes/rs-1",async route=>{if(route.request().method()==="PUT")savedDocuments.push(route.request().postDataJSON().document);return route.fallback()});
 await page.setViewportSize({width:1440,height:1000});await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Design & templates"}).click();await page.getByRole("tab",{name:"Details",exact:true}).click();
 await expect(page.getByText("No photo selected",{exact:true})).toBeVisible();expect(profilePhotoRequests).toBe(0);
 await page.getByLabel("Upload photo for resume").setInputFiles({name:"resume-photo.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF8sAAAAASUVORK5CYII=","base64")});
 const selectedPhoto=page.locator(".rs-photo-source-preview img");await expect(selectedPhoto).toBeVisible();await expect(selectedPhoto).toHaveAttribute("src",/^data:image\/png;base64,/);await expect(page.getByLabel("Position").getByRole("button",{name:"Right",exact:true})).toBeVisible();
 await expect.poll(()=>savedDocuments.length).toBeGreaterThan(0);expect(savedDocuments.at(-1).personal_details.photo).toMatch(/^data:image\/png;base64,/);expect(profilePhotoRequests).toBe(0);
 await page.getByRole("button",{name:"Remove"}).click();await expect(page.getByText("No photo selected",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Import profile photo"}).click();await expect(selectedPhoto).toBeVisible();expect(profilePhotoRequests).toBe(1);
});

test("AI chat stage controls call the backend to open any selected editing step",async({page})=>{
 await mockResumeStudio(page);const requests:any[]=[];
 await page.route("**/api/student/resume-studio/interviews/chat-1/messages",async route=>{if(route.request().method()==="POST"){const payload=route.request().postDataJSON();requests.push(payload);const stage=payload.message.endsWith("Education")?"education":"experience";return route.fulfill({json:{id:"chat-1",messages:[{role:"assistant",text:`Now let's edit **${stage}**.`,kind:"question"}],state:{stage,audit_done:[]},document:baseProject.document,resume_revision:1}})}return route.fallback()});
 await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"AI tools"}).click();await page.getByRole("button",{name:/Build your resume by chatting/}).click();
 const stages=page.locator(".rs-chat-stages");await expect(stages.getByRole("button",{name:/Experience/})).toBeEnabled();await stages.getByRole("button",{name:/Experience/}).click();await expect(stages.getByRole("button",{name:/Experience/})).toHaveAttribute("aria-current","step");await expect(page.locator(".rs-chat-message strong")).toHaveText("experience");await expect(page.locator(".rs-chat-log")).not.toContainText("**");
 await stages.getByRole("button",{name:/Education/}).click();await expect(stages.getByRole("button",{name:/Education/})).toHaveAttribute("aria-current","step");expect(requests.map(item=>item.message)).toEqual(["Go to Experience","Go to Education"]);expect(requests.every(item=>item.expected_revision===1)).toBe(true);
 await expect(page.locator(".rs-ai-engine")).toHaveCount(0);
});

test("collapsing the Student Portal sidebar widens the Resume Editor preview with no refresh",async({page})=>{
 await mockResumeStudio(page);await page.setViewportSize({width:1600,height:950});await page.goto("/resume-studio");
 await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Resume editor"}).click();
 await page.getByLabel("Full name").fill("Asha Kumar");
 await expect(page.frameLocator('iframe[title="Resume preview"]').locator(".rd")).toBeVisible();
 const expanded=await page.locator(".rs-preview-frame").boundingBox();
 const expandedSheet=await page.locator(".rs-preview-stage").boundingBox();
 await page.getByRole("button",{name:"Close navigation"}).click();
 await expect.poll(async()=>(await page.locator(".rs-preview-frame").boundingBox())!.width).toBeGreaterThan(expanded!.width+100);
 const collapsedSheet=await page.locator(".rs-preview-stage").boundingBox();
 expect(collapsedSheet!.width).toBeGreaterThan(expandedSheet!.width);
 // No fixed sidebar-width margin is left behind and nothing is clipped.
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole("button",{name:"Open navigation"}).click();
 await expect.poll(async()=>Math.round((await page.locator(".rs-preview-frame").boundingBox())!.width)).toBe(Math.round(expanded!.width));
});

test("the preview sheet keeps A4 proportions and stays centred in its panel",async({page})=>{
 await mockResumeStudio(page);await page.setViewportSize({width:1440,height:900});await page.goto("/resume-studio");
 await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Resume editor"}).click();
 await page.getByLabel("Full name").fill("Asha Kumar");
 const sheet=page.locator(".rs-preview-stage");await expect(sheet).toBeVisible();
 const box=await sheet.boundingBox(),frame=await page.locator(".rs-preview-frame").boundingBox();
 expect(box!.height/box!.width).toBeCloseTo(1123/794,1);
 expect(box!.width).toBeLessThanOrEqual(frame!.width);
 const leftGap=box!.x-frame!.x,rightGap=frame!.x+frame!.width-(box!.x+box!.width);
 expect(Math.abs(leftGap-rightGap)).toBeLessThanOrEqual(2);
 await page.getByRole("button",{name:"Zoom in"}).click();
 await expect(page.locator(".rs-preview-zoom-value")).toHaveText("110%");
 const zoomed=await sheet.boundingBox();
 expect(zoomed!.width).toBeGreaterThan(box!.width);
 expect(zoomed!.height/zoomed!.width).toBeCloseTo(1123/794,1);
});

test("a resume card without a Main resume badge keeps the same metadata rhythm",async({page})=>{
 await mockResumeStudio(page,false,true,true);await page.setViewportSize({width:1440,height:900});await page.goto("/resume-studio");
 const cards=page.locator(".rs-project-card-new");
 await expect(cards).toHaveCount(2);
 const main=cards.filter({has:page.locator(".rs-main-label")}).first();
 const plain=cards.filter({hasNot:page.locator(".rs-main-label")}).first();
 for(const card of [main,plain]){
  const title=await card.locator(".rs-project-open > strong").boundingBox();
  const meta=await card.locator(".rs-project-open > span:not(.rs-card-paper):not(.rs-main-label)").boundingBox();
  const cardBox=await card.boundingBox();
  expect(Math.round(meta!.x-title!.x)).toBe(16);
  // The metadata row sits a consistent distance above the bottom of the card.
  expect(Math.round(cardBox!.y+cardBox!.height-(meta!.y+meta!.height))).toBeLessThanOrEqual(16);
  // The rendered page, not the text, owns most of the card.
  const paper=await card.locator(".rs-card-paper").boundingBox();
  expect(paper!.height/cardBox!.height).toBeGreaterThan(.6);
 }
});

test("all sections keep the same workspace columns and navigation gutter",async({page})=>{
 await mockResumeStudio(page);await page.setViewportSize({width:1920,height:950});await page.goto("/resume-studio");const libraryX=(await page.locator(".rs-studio-nav").boundingBox())!.x;await page.getByRole("button",{name:/Open Resume 1/}).click();const layouts=[];
 for(const name of ["Resume editor","Design & templates","AI tools"]){await page.getByRole("tab",{name,exact:true}).click();const editor=(await page.locator(".rs-editor").boundingBox())!,preview=(await page.locator(".rs-preview-panel").boundingBox())!;layouts.push([Math.round(editor.x),Math.round(editor.width),Math.round(preview.x),Math.round(preview.width)]);expect((await page.locator(".rs-studio-nav").boundingBox())!.x).toBe(libraryX)}
 expect(layouts[1]).toEqual(layouts[0]);expect(layouts[2]).toEqual(layouts[0]);
});

test("sticky toolbar and preview stay separated at short desktop and phone sizes",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Design & templates"}).click();await page.getByRole("tab",{name:"Details",exact:true}).click();
 for(const [width,height] of [[1366,768],[1440,900],[1920,900],[390,844]]){await page.setViewportSize({width,height});await page.evaluate(()=>window.scrollTo(0,800));await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const nav=(await page.locator(".rs-studio-nav").boundingBox())!,toolbar=(await page.locator(".rs-project-toolbar").boundingBox())!,groups=(await page.locator(".rs-design-tabs").boundingBox())!;expect(toolbar.y).toBeGreaterThanOrEqual(nav.y+nav.height+7);expect(groups.y+groups.height).toBeLessThan(0);if(width>1100){const preview=(await page.locator(".rs-preview-panel").boundingBox())!;expect(preview.y).toBeGreaterThanOrEqual(toolbar.y+toolbar.height+11);expect(preview.y+preview.height).toBeLessThanOrEqual(height-15)}}
});

test("photo settings are absent before a photo exists and crop preview follows selection",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Design & templates"}).click();await page.getByRole("tab",{name:"Details",exact:true}).click();await expect(page.getByRole("slider",{name:"Photo size",exact:true})).toHaveCount(0);await expect(page.getByLabel("Shape",{exact:true})).toHaveCount(0);
 await page.getByLabel("Upload photo for resume").setInputFiles({name:"photo.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF8sAAAAASUVORK5CYII=","base64")});await expect(page.getByRole("slider",{name:"Photo size",exact:true})).toBeVisible();await page.getByLabel("Shape",{exact:true}).getByRole("button",{name:"Square",exact:true}).click();await expect(page.locator(".rs-photo-crop")).toHaveCSS("border-radius","0px");await page.getByRole("button",{name:"Remove",exact:true}).click();await expect(page.getByRole("slider",{name:"Photo size",exact:true})).toHaveCount(0);
});

test("AI import is a dedicated upload panel with file selection and the existing import API",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"AI tools"}).click();await page.locator(".rs-ai-tool-list").getByRole("button",{name:/Import a resume/}).click();await expect(page.locator(".rs-ai-hub-panel")).toBeHidden();await expect(page.locator(".rs-chat-builder")).toBeHidden();await expect(page.getByRole("button",{name:"Import resume",exact:true})).toBeDisabled();
 await page.getByLabel("Choose resume file to import").setInputFiles({name:"my-resume.txt",mimeType:"text/plain",buffer:Buffer.from("Asha Kumar, software engineer")});await expect(page.locator(".rs-import-dropzone strong")).toHaveText("my-resume.txt");await page.getByRole("button",{name:"Remove file",exact:true}).click();await expect(page.getByRole("button",{name:"Import resume",exact:true})).toBeDisabled();await page.getByLabel("Choose resume file to import").setInputFiles({name:"my-resume.txt",mimeType:"text/plain",buffer:Buffer.from("Asha Kumar, software engineer")});const imported=page.waitForRequest(r=>r.url().endsWith("/resumes/import")&&r.method()==="POST");await page.getByRole("button",{name:"Import resume",exact:true}).click();await imported;await expect(page.locator(".rs-save-state")).toHaveText("Saved");
});

test("dialogs contain keyboard focus and restore it when Escape closes them",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();const add=page.getByRole("button",{name:"Add content",exact:true});await add.click();const dialog=page.getByRole("dialog",{name:"Add content"});await expect(dialog).toBeVisible();await page.keyboard.press("Shift+Tab");expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);await expect(add).toBeFocused();await expect(page.locator("body")).not.toHaveCSS("overflow","hidden");
 await page.getByRole("tab",{name:"Design & templates"}).click();const browse=page.getByRole("button",{name:"Browse templates",exact:true});await browse.click();await expect(page.getByRole("dialog",{name:"Browse templates"})).toBeVisible();await page.keyboard.press("Escape");await expect(browse).toBeFocused();
});

test("Letter preview uses Letter dimensions without horizontal clipping",async({page})=>{
 await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByLabel("Full name").fill("Asha Kumar");await page.getByRole("tab",{name:"Design & templates"}).click();await page.getByRole("tab",{name:"Details",exact:true}).click();await page.getByLabel("Paper size",{exact:true}).getByRole("button",{name:"Letter",exact:true}).click();await expect(page.locator(".rs-preview-page-size")).toContainText("Letter");await expect.poll(async()=>{const box=await page.locator(".rs-preview-stage").boundingBox();return box?box.height/box.width:0}).toBeCloseTo(1056/816,1);await expect(page.locator('iframe[title="Resume preview"]')).toHaveCSS("width","816px");
});

test("changing from scrolled design settings to a short AI tool brings its heading below sticky controls",async({page})=>{
 await mockResumeStudio(page);await page.setViewportSize({width:1440,height:900});await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Design & templates"}).click();await page.getByRole("tab",{name:"Details",exact:true}).click();await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.getByRole("tab",{name:"AI tools",exact:true}).click();await page.locator(".rs-ai-tool-list").getByRole("button",{name:/Version history/}).click();await expect.poll(()=>page.evaluate(()=>{const toolbar=document.querySelector(".rs-project-toolbar")!.getBoundingClientRect(),preview=document.querySelector(".rs-preview-panel")!.getBoundingClientRect(),nav=document.querySelector(".rs-studio-nav")!.getBoundingClientRect(),shell=document.querySelector(".dashboard-topbar")!.getBoundingClientRect();return preview.top>=toolbar.bottom+11&&nav.top>=shell.bottom})).toBe(true);
});

 test("design colour controls align as label and swatch rows",async({page})=>{await mockResumeStudio(page);await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Design & templates"}).click();await expect(page.locator(".rs-colour-value").first()).toHaveCSS("flex-direction","row");await expect(page.locator(".rs-custom-colour")).toHaveCSS("flex-direction","row");await expect(page.locator(".rs-design-tabs")).toHaveCSS("position","static");});

test("Main Resume badge overlays the preview without changing card size or adding a border",async({page})=>{
 await mockResumeStudio(page,false,true,true);await page.goto("/resume-studio");const cards=page.locator(".rs-project-card-new");await expect(cards).toHaveCount(2);const main=cards.filter({has:page.locator(".rs-main-label")}),plain=cards.filter({hasNot:page.locator(".rs-main-label")});const a=(await main.boundingBox())!,b=(await plain.boundingBox())!;expect(a.width).toBe(b.width);expect(a.height).toBe(b.height);const badge=main.locator(".rs-card-paper .rs-card-status .rs-main-label");await expect(badge).toHaveText("Main Resume");const label=(await badge.boundingBox())!,preview=(await main.locator(".rs-thumbnail-viewport").boundingBox())!,paper=(await main.locator(".rs-card-paper").boundingBox())!;expect(label.y).toBeGreaterThanOrEqual(preview.y);expect(label.y+label.height).toBeLessThanOrEqual(preview.y+44);expect(preview.height).toBeGreaterThan(paper.height-2);await expect(main).toHaveCSS("border-top-color",await plain.evaluate(node=>getComputedStyle(node).borderTopColor));await expect(main).toHaveCSS("outline-style","none");await expect(main).toHaveCSS("box-shadow",/107, 48, 232/);const ta=(await main.locator(".rs-project-open > strong").boundingBox())!,tb=(await plain.locator(".rs-project-open > strong").boundingBox())!;expect(ta.y).toBe(tb.y);
});

test("chat saves returned content, refreshes the real preview request, and reloads the saved document",async({page})=>{
 await mockResumeStudio(page);let saved:any={...baseProject,document:{...baseProject.document,personal_details:{...details,full_name:"Asha Kumar"}}};let payload:any;
 await page.route("**/api/student/resume-studio/resumes/rs-1",route=>route.fulfill({json:saved}));
 await page.route("**/api/student/resume-studio/interviews/chat-1/messages",route=>{payload=route.request().postDataJSON();saved={...saved,revision:2,document:{...saved.document,personal_details:{...saved.document.personal_details,headline:"Python developer"}}};return route.fulfill({json:{id:"chat-1",project_id:"rs-1",messages:[{role:"user",text:payload.message},{role:"assistant",text:"Updated your headline.",chips:["Improve my summary"]}],state:{stage:"target"},document:saved.document,resume_revision:2,changed_fields:["headline"]}})});
 await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"AI tools"}).click();await page.getByRole("button",{name:/Build your resume by chatting/}).click();
 await page.locator(".rs-chat-form textarea").fill("Set my headline to Python developer");await page.locator(".rs-chat-form button").click();await expect(page.getByText("Updated your headline.",{exact:true})).toBeVisible();expect(payload.expected_revision).toBe(1);
 await page.getByRole("tab",{name:"Resume editor"}).click();await expect(page.getByLabel("Headline")).toHaveValue("Python developer");await page.reload();await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"Resume editor"}).click();await expect(page.getByLabel("Headline")).toHaveValue("Python developer");
});

test("chat shows provider errors without fabricated success or content changes",async({page})=>{
 await mockResumeStudio(page);await page.route("**/api/student/resume-studio/interviews/chat-1/messages",route=>route.fulfill({status:502,json:{detail:"Resume AI could not complete this request. Your resume has not changed; please try again."}}));
 await page.goto("/resume-studio");await page.getByRole("button",{name:/Open Resume 1/}).click();await page.getByRole("tab",{name:"AI tools"}).click();await page.getByRole("button",{name:/Build your resume by chatting/}).click();await page.locator(".rs-chat-form textarea").fill("Improve my summary");await page.locator(".rs-chat-form button").click();await expect(page.getByText(/Resume AI could not complete this request/)).toBeVisible();await expect(page.locator(".rs-chat-form textarea")).toHaveValue("Improve my summary");await expect(page.locator(".rs-chat-log")).not.toContainText("Updated");
});

test("a pending resume deep link keeps its selected resume when a section is clicked",async({page})=>{
 await mockResumeStudio(page);const other={...baseProject,id:"rs-2",title:"Requested resume",document:{...baseProject.document,personal_details:{...details,headline:"Requested headline"}}};
 await page.route("**/api/student/resume-studio/resumes/rs-2",async route=>{await new Promise(resolve=>setTimeout(resolve,300));return route.fulfill({json:other})});
 await page.goto("/resume-studio?resume=rs-2");await page.getByRole("tab",{name:"Resume editor",exact:true}).click();await expect(page.getByLabel("Professional headline",{exact:true})).toHaveValue("Requested headline");await expect(page.getByRole("button",{name:"Choose resume",exact:true})).toContainText("Requested resume");
});
