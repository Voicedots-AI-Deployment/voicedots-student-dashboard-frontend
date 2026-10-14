import { test, expect } from '@playwright/test';
test('Coach displays a 15-minute timer and counts down from the server duration', async ({page}) => {
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'audit'},role_title:'Engineer',company_name:'Audit',plan:{goal:'Learn APIs',daily_roadmap:[]},messages:[]}}));
 await page.addInitScript(()=>{
  const w=window as any;const node=()=>({connect(){},disconnect(){}});
  w.AudioContext=class{state='running';currentTime=0;destination={};audioWorklet={addModule:async()=>{}};resume=async()=>{};close=async()=>{};createMediaStreamSource=node;createGain=()=>({...node(),gain:{value:0}})};
  w.AudioWorkletNode=class{port={onmessage:null};connect(){};disconnect(){}};
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>({getAudioTracks:()=>[],getTracks:()=>[{stop(){}}]})});
  w.WebSocket=class{static OPEN=1;readyState=1;onmessage:any;onclose:any;constructor(url:string){w.coachUrl=String(url);w.coachSocket=this}send(){}close(){this.readyState=3}};
 });
 await page.goto('/');
 await page.evaluate(async()=>{const path='/tests/fixtures/coach-audio-harness.tsx';const h=await import(path);h.mount('lesson')});
 await expect(page.getByText('15:00',{exact:true})).toBeVisible();
 await page.clock.install();
 await page.getByRole('button',{name:'Connect with Neha'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).coachUrl||'')).toContain('duration_minutes=15');
 await page.evaluate(()=>{(window as any).coachSocket.onmessage({data:JSON.stringify({type:'coach_session_started',duration_minutes:15})})});
 await page.clock.fastForward(1000);
 await expect(page.getByText('14:59',{exact:true})).toBeVisible();
});
