import {test,expect} from '@playwright/test';
test('real proctor object model runs in a worker while the UI stays responsive',async({page})=>{
 test.setTimeout(120000);
 const initializationErrors:string[]=[];page.on('console',message=>{if(message.type()==='error')initializationErrors.push(message.text())});
 await page.route('**/interview.js*',route=>route.abort());
 await page.goto('/interview.html');
 const result=await page.evaluate(async()=>{
  const worker=new Worker('/proctor-object-worker.js');
  let ticks=0;const heartbeat=setInterval(()=>ticks++,20);
  try{
   const request=(type:string,extra:Record<string,unknown>={},transfer:Transferable[]=[])=>new Promise<any>((resolve,reject)=>{
    const id=Math.random();const timeout=setTimeout(()=>reject(new Error('Worker timeout')),60000);
    const listen=(event:MessageEvent)=>{if(event.data.id===id){clearTimeout(timeout);worker.removeEventListener('message',listen);event.data.error?reject(new Error(event.data.error)):resolve(event.data.result)}};
    worker.addEventListener('message',listen);worker.postMessage({id,type,...extra},transfer);
   });
   await request('init');const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
   canvas.getContext('2d')!.fillRect(0,0,640,480);
   const bitmap=await createImageBitmap(canvas);const before=ticks;
   const detection=await request('detect',{frame:bitmap,timestamp:performance.now()},[bitmap]);
   return {detections:detection.detections.length,uiTicks:ticks-before};
  }finally{clearInterval(heartbeat);worker.terminate()}
 });
 expect(result.detections).toBe(0);expect(result.uiTicks).toBeGreaterThan(0);
 expect(initializationErrors.filter(text=>text.includes("XNNPACK"))).toEqual([]);
});

test('failed proctor worker falls back to a real detector without treating stale data as passing',async({page})=>{
 test.setTimeout(120000);
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'test'},csrf_token:'test'}}));
 await page.addInitScript(()=>{
  (window as any).Worker=class {
   onmessage:any;
   postMessage(data:any){setTimeout(()=>this.onmessage?.({data:{id:data.id,error:'worker unavailable'}}),0)}
   terminate(){}
  };
 });
 await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
  window.objectAudit={load:loadPersonDetector,state:()=>({failed:workerObjectFailed,loaded:!!objectDetector,checked:lastPersonDetectionAt})};
 `})});
 await page.goto('/interview.html?id=test');await expect.poll(()=>page.evaluate(()=>!!(window as any).objectAudit)).toBe(true);
 expect(await page.evaluate(()=>(window as any).objectAudit.load())).toBe(true);
 expect(await page.evaluate(()=>(window as any).objectAudit.state())).toEqual({failed:true,loaded:true,checked:0});
});

test('face inference runs off the audio thread using the real CPU model',async({page})=>{
 test.setTimeout(120000);
 await page.route('**/interview.js*',route=>route.abort());
 await page.goto('/interview.html');
 const result=await page.evaluate(async()=>{
  const worker=new Worker('/proctor-object-worker.js');let ticks=0;
  const heartbeat=setInterval(()=>ticks++,10);
  const request=(type:string,extra:Record<string,unknown>={},transfer:Transferable[]=[])=>new Promise<any>((resolve,reject)=>{
   const id=Math.random();const timeout=setTimeout(()=>reject(new Error('Face worker timeout')),60000);
   const listen=(event:MessageEvent)=>{if(event.data.id===id){clearTimeout(timeout);worker.removeEventListener('message',listen);event.data.error?reject(new Error(event.data.error)):resolve(event.data.result)}};
   worker.addEventListener('message',listen);worker.postMessage({id,type,...extra},transfer);
  });
  try{
   await request('init',{detectorType:'face'});
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
   canvas.getContext('2d')!.fillRect(0,0,640,480);const before=ticks;
   for(let i=0;i<5;i++){
    const frame=await createImageBitmap(canvas);
    const result=await request('detect',{frame,timestamp:performance.now()},[frame]);
    if(result.faceLandmarks.length)throw new Error('Unexpected face in blank frame');
   }
   return ticks-before;
  }finally{clearInterval(heartbeat);worker.terminate()}
 });
 expect(result).toBeGreaterThan(0);
});

test('slow face inference cannot hold browser microphone and playback callbacks',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'test'},csrf_token:'test'}}));
 await page.route('**/vision_bundle.mjs',route=>route.fulfill({contentType:'text/javascript',body:`
 export const FilesetResolver={forVisionTasks:async()=>({wasmLoaderPath:''})};
 export const FaceLandmarker={createFromOptions:async()=>({detectForVideo(){
  const end=performance.now()+600;while(performance.now()<end){};return {faceLandmarks:[]};
 }})};`}));
 await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
 window.faceAudioAudit=async()=>{
  await loadFaceDetector();const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
  const start=performance.now();const inference=faceLandmarker.detectForVideo(canvas,performance.now());
  const callbackDelay=await new Promise(resolve=>setTimeout(()=>resolve(performance.now()-start),20));
  await inference;return {worker:faceLandmarker.workerInference,callbackDelay};
 };
 `})});
 await page.goto('/interview.html?id=test');await page.waitForFunction(()=>!!(window as any).faceAudioAudit);
 const result=await page.evaluate(()=>(window as any).faceAudioAudit());
 expect(result.worker).toBe(true);expect(result.callbackDelay).toBeLessThan(300);
});
