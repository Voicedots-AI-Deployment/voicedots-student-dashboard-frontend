import { test, expect, type Page } from '@playwright/test';

async function interview(page: Page) {
  await page.route('**/api/**', route => route.fulfill({ json: { student: { id: 'conversation-test' }, csrf_token: 'test' } }));
  await page.route('**/interview.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
      window.conversationAudit = {
        preview: syncCameraPreview, recoverCamera: () => attachDeviceTrack("video", ""),
        distinct: distinctFaceLandmarks,
        corroborated(faces,bodies,age=0) {
          faceCountDetected=faces;corroboratedPersonCount=bodies;lastPersonDetectionAt=Date.now()-age;
          return multiplePeopleCorroborated();
        },
        async microphone() {
          const context = new AudioContext();
          const destination = context.createMediaStreamDestination();
          const tone = context.createOscillator(); tone.connect(destination); tone.start();
          userMediaStream = destination.stream;
          audioContext = new AudioContext();
          const sent = [];
          ws = {readyState:WebSocket.OPEN, send:data => sent.push(data)};
          interviewHasStarted = true; proctoringActive = false; micMuted = false; aiSpeaking = false;
          await startMediaCapture();
          micProcessor.port.onmessage({data:new Float32Array([.2,.1])});
          const practicing = sent.length;
          aiSpeaking = true; micProcessor.port.onmessage({data:new Float32Array([.2])});
          const duringQuestion = sent.length;
          aiSpeaking = false; micMuted = true; micProcessor.port.onmessage({data:new Float32Array([.2])});
          const muted = sent.length;
          micMuted = false;
          const old = micCaptureSource;
          navigator.mediaDevices.getUserMedia = async () => {
            const d = context.createMediaStreamDestination(); tone.connect(d); return d.stream;
          };
          const switched = await attachDeviceTrack('audio','selected-mic');
          const reconnected = old !== micCaptureSource;
          micProcessor.disconnect(); await audioContext.close(); await context.close(); ws = null;
          return {practicing,duringQuestion,muted,switched,reconnected};
        },
        async devices() {
          navigator.mediaDevices.enumerateDevices = async () => [
            {kind:'audioinput',deviceId:'default',label:'Default microphone'},
            {kind:'audioinput',deviceId:'usb',label:'USB microphone'}];
          await populateDeviceSelects(); const initial = micSelectEl.value;
          micSelectEl.value='usb'; await populateDeviceSelects();
          return {initial,selected:micSelectEl.value,options:Array.from(micSelectEl.options).map(x=>x.text)};
        },
        async report(report) {
          currentSessionId = 'session-1';
          document.getElementById('prejoin-screen').style.display = 'none';
          resultsScreen.style.display = 'block';
          renderResults(report);
          await loadAnswerFeedback(report);
        },
        start(placement) {
          photoVerifier.start = () => { window.proctorStarts = (window.proctorStarts || 0) + 1; };
          handleControlMessage({type:'interview_started',recording_enabled:placement,proctoring_enabled:placement});
          return proctoringActive;
        }
      };` });
  });
  await page.goto('/interview.html?id=conversation-test');
  await expect.poll(() => page.evaluate(() => !!(window as any).conversationAudit)).toBe(true);
}

const report = {
  status: 'released', overall_score: 65,
  question_reviews: [
    { answer_id: 7, question: 'How did you test the API?', answer: 'I tested all endpoints with pytest.' },
    { answer_id: 9, question: 'How did you handle failures?', answer: 'I checked the logs and retried requests.' },
    { answer_id: 10, question: 'What would you change?', answer: '' },
  ],
};

test('live review requests coaching and attaches feedback by answer ID', async ({ page }) => {
  await interview(page);
  await page.route('**/evaluation/question-feedback', route => {
    expect(route.request().method()).toBe('POST');
    return route.fulfill({ json: { complete: true, feedback: {
      '9': { what_worked: 'You described checking logs.', improve: 'Explain which error you investigated.' },
      '7': { what_worked: 'You named pytest and endpoint tests.', improve: 'Add one assertion and its result.' },
    } } });
  });
  await page.evaluate(report => (window as any).conversationAudit.report(report), report);
  const cards = page.locator('#results-question-reviews details');
  await cards.nth(0).locator('summary').click();
  await expect(cards.nth(0)).toContainText('Add one assertion and its result.');
  await expect(cards.nth(0)).not.toContainText('checking logs');
  await cards.nth(1).locator('summary').click();
  await expect(cards.nth(1)).toContainText('Explain which error you investigated.');
  await cards.nth(2).locator('summary').click();
  await expect(cards.nth(2)).toContainText('No answer was recorded');
});

test('feedback service failure offers a retry without discarding answers', async ({ page }) => {
  await interview(page);
  let requests = 0;
  await page.route('**/evaluation/question-feedback', route => {
    requests++;
    return route.fulfill(requests === 1 ? { status: 503, json: { detail: 'Temporarily unavailable' } } :
      { json: { complete: true, feedback: { '7': { improve: 'Show a test assertion.' } } } });
  });
  await page.evaluate(report => (window as any).conversationAudit.report(report), report);
  await page.getByRole('button', { name: 'Retry answer feedback' }).click();
  await expect(page.locator('#results-question-reviews')).toContainText('Show a test assertion.');
  await expect(page.locator('#results-question-reviews')).toContainText('I tested all endpoints with pytest.');
});

test('practice does not start AI proctor monitoring; placement does', async ({ page }) => {
  await interview(page);
  expect(await page.evaluate(() => (window as any).conversationAudit.start(false))).toBe(false);
  expect(await page.evaluate(() => (window as any).proctorStarts || 0)).toBe(0);
  expect(await page.evaluate(() => (window as any).conversationAudit.start(true))).toBe(true);
  expect(await page.evaluate(() => (window as any).proctorStarts)).toBe(1);
});

for (const [width, height] of [[1280, 720], [640, 480], [720, 1280]]) {
  test(`camera preview preserves native ${width}x${height} framing`, async ({ page }) => {
    await interview(page);
    const ratio = await page.evaluate(([width, height]) => {
      const video = document.querySelector('#lobby-video') as HTMLVideoElement;
      Object.defineProperty(video, 'videoWidth', { value: width });
      Object.defineProperty(video, 'videoHeight', { value: height });
      video.dispatchEvent(new Event('loadedmetadata'));
      return getComputedStyle(video.parentElement!).aspectRatio;
    }, [width, height]);
    expect(ratio).toBe(`${width} / ${height}`);
    await expect(page.locator('#lobby-video')).toHaveCSS('object-fit', 'contain');
  });
}


test('practice microphone sends PCM without proctoring and switches its audio source', async ({page}) => {
  await interview(page);
  const result = await page.evaluate(() => (window as any).conversationAudit.microphone());
  expect(result.practicing).toBeGreaterThan(0);
  expect(result.duringQuestion).toBe(result.practicing);
  expect(result.muted).toBe(result.practicing);
  expect(result.switched).toBe(true);
  expect(result.reconnected).toBe(true);
});

test('microphone list defaults to system device and preserves available selection', async ({page}) => {
  await interview(page);
  const result = await page.evaluate(() => (window as any).conversationAudit.devices());
  expect(result.initial).toBe('');
  expect(result.selected).toBe('usb');
  expect(result.options).toContain('USB microphone');
});


test('camera recovery clears the disconnected overlay once frames arrive',async({page})=>{
  await interview(page);
  await page.evaluate(async()=>{
    const video=document.querySelector('#lobby-video') as HTMLVideoElement;
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
    canvas.getContext('2d')!.fillRect(0,0,640,480);
    const stream=canvas.captureStream(10);
    // Exercise the actual recovery path without real hardware permissions.
    navigator.mediaDevices.getUserMedia=async()=>stream;
    video.srcObject=stream;await video.play();
  });
  // Bind the stream through the real attachDeviceTrack function in the page.
  await page.evaluate(()=>(window as any).conversationAudit.recoverCamera());
  await expect(page.locator('#cam-overlay')).toBeHidden();
});

test('duplicate and malformed face landmarks cannot count as additional people',async({page})=>{
  await interview(page);
  const count=await page.evaluate(()=>{
    const face=(offset:number)=>{
      const points=Array.from({length:468},(_,i)=>({x:offset+.2+(i%8)*.015,y:.2+Math.floor(i/8)%8*.025}));
      points[33]={x:offset+.22,y:.25};points[263]={x:offset+.28,y:.25};
      points[1]={x:offset+.25,y:.30};points[13]={x:offset+.25,y:.35};points[152]={x:offset+.25,y:.40};
      return points;
    };
    const bad=face(.5);bad[152].y=.1;
    const f=(window as any).conversationAudit.distinct;
    return {duplicates:f([face(0),face(.005)]).length,distinct:f([face(0),face(.5)]).length,malformed:f([face(0),bad]).length,nearby:f([face(0),face(.04)]).length};
  });
  expect(count).toEqual({duplicates:1,distinct:2,malformed:1,nearby:2});
});

test('large skill reports group unassessed evidence and expand without a long initial list',async({page})=>{
  await interview(page);
  await page.route('**/evaluation/question-feedback',route=>route.fulfill({json:{complete:true,feedback:{}}}));
  await page.evaluate(r=>(window as any).conversationAudit.report(r),{...report,strengths:[],resume_alignment:{credibility_score:null,skills:Array.from({length:24},(_,i)=>({skill:'Skill '+i,evidence_level:'not_assessed'}))}});
  const alignment=page.locator('#results-resume-alignment');
  await expect(alignment).toContainText('0 assessed · 24 claimed skills');
  await expect(alignment.locator('.skill-chip:visible')).toHaveCount(6);
  await expect(alignment).toContainText('Not assessed in this interview');
  await alignment.locator('..').screenshot({path:'/root/voicedots/artifacts/interview-natural-20261009/report-skills.png'});
  await alignment.locator('summary').click();
  await expect(alignment.locator('.skill-chip:visible')).toHaveCount(24);
  await expect(page.locator('#results-strengths .list-item-g')).toHaveCount(0);
});


test('multiple-person accusations require fresh corroboration from both camera models',async({page})=>{
  await interview(page);
  const signals=await page.evaluate(()=>{
    const check=(window as any).conversationAudit.corroborated;
    return [check(2,1),check(1,2),check(2,2,3000),check(2,2)];
  });
  expect(signals).toEqual([false,false,false,true]);
});
