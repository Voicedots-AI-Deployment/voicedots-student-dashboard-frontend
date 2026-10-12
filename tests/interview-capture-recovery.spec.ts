import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('**/api/**',r=>r.fulfill({json:{student:{id:'audio-recovery'},csrf_token:'test'}}));
  await page.route('**/interview.js*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      window.captureRecovery={
        async start(){
          const sourceContext=new AudioContext();await sourceContext.resume();
          const destination=sourceContext.createMediaStreamDestination();const tone=sourceContext.createOscillator();tone.connect(destination);tone.start();
          userMediaStream=destination.stream;audioContext=new AudioContext();await audioContext.resume();
          window.captureSends=[];ws={readyState:WebSocket.OPEN,bufferedAmount:0,send:data=>window.captureSends.push(data)};
          interviewHasStarted=true;interviewStopRequested=false;aiSpeaking=false;micMuted=false;
          await startMediaCapture();window.sourceContext=sourceContext;
        },
        async playback(suspend=false){
          playbackAudioContext=new AudioContext();await playbackAudioContext.resume();
          playbackAnalyser=null;currentAudioEpoch=41;
          if(suspend)await playbackAudioContext.suspend();
          handleControlMessage({type:"tts_begin",audio_epoch:41,text:"Explain your project.",sample_rate:24000});
          schedulePCMChunk(new Int16Array(9600).buffer,41);
          handleControlMessage({type:"tts_end",audio_epoch:41});
        },
        speaking(){return aiSpeaking;},
        acks(){return window.captureSends.filter(x=>typeof x==="string").map(x=>JSON.parse(x));},
        async resumePlayback(){await playbackAudioContext.resume();},
        count(){return window.captureSends.filter(x=>x instanceof ArrayBuffer).length;},
        async suspend(){await audioContext.suspend();},
        state(){return audioContext.state;},
        fail(){micProcessor.onprocessorerror();},
        async recognition(){const previous=micProcessor;handleControlMessage({type:"transcription_recovery",detail:"Restoring speech recognition."});await new Promise(resolve=>setTimeout(resolve,100));return {sameProcessor:previous===micProcessor,stillListening:!aiSpeaking};},
        async mutedTrack(){
          callScreen.style.display="block";
          const track=userMediaStream.getAudioTracks()[0];
          Object.defineProperty(track,"muted",{configurable:true,get:()=>true});
          window.microphoneRecoveryCalls=0;window.microphoneIntegrityCalls=0;
          const originalRecover=recoverMicrophoneCapture;
          const originalViolation=recordIntegrityViolation;
          recoverMicrophoneCapture=()=>{window.microphoneRecoveryCalls++;return Promise.resolve();};
          recordIntegrityViolation=()=>{window.microphoneIntegrityCalls++;};
          bindMediaTrackEnded(track);track.dispatchEvent(new Event("mute"));
          await new Promise(resolve=>setTimeout(resolve,800));
          recoverMicrophoneCapture=originalRecover;recordIntegrityViolation=originalViolation;
          return {recoveries:window.microphoneRecoveryCalls,integrityEvents:window.microphoneIntegrityCalls};
        },
        kind:preflightFailureKind,
        listening(){aiSpeaking=true;activePlaybackSources.clear();handleControlMessage({type:'listening',audio_epoch:currentAudioEpoch});return aiSpeaking;},
        gate(){aiSpeaking=true;activePlaybackSources.add({});handleControlMessage({type:'listening',audio_epoch:currentAudioEpoch});const value=aiSpeaking;activePlaybackSources.clear();aiSpeaking=false;return value;},
        async close(){interviewStopRequested=true;clearInterval(microphoneWatchdog);micProcessor.disconnect();await audioContext.close();await playbackAudioContext?.close();playbackAudioContext=null;await window.sourceContext.close();ws=null;}
      };
      window.__testCameraLighting = assessCameraLighting;
      window.__testCameraEntryChecks = cameraEntryChecksPass;
      window.__testQualityTransition = cameraQualityTransition;
    `});
  });
  await page.goto('/interview.html?id=audio-recovery');
  await expect.poll(()=>page.evaluate(()=>!!(window as any).captureRecovery)).toBe(true);
});

test('actual worklet capture resumes after context suspension',async({page})=>{
  await page.evaluate(()=>(window as any).captureRecovery.start());
  await expect.poll(()=>page.evaluate(()=>(window as any).captureRecovery.count())).toBeGreaterThan(2);
  const before=await page.evaluate(()=>(window as any).captureRecovery.count());
  await page.evaluate(()=>(window as any).captureRecovery.suspend());
  await expect.poll(()=>page.evaluate(()=>(window as any).captureRecovery.state())).toBe('running');
  await expect.poll(()=>page.evaluate(()=>(window as any).captureRecovery.count())).toBeGreaterThan(before+2);
  await page.evaluate(()=>(window as any).captureRecovery.close());
});
test('worklet error rebuilds capture and listening cannot cut audible playback',async({page})=>{
  await page.evaluate(()=>(window as any).captureRecovery.start());
  await expect.poll(()=>page.evaluate(()=>(window as any).captureRecovery.count())).toBeGreaterThan(1);
  const before=await page.evaluate(()=>(window as any).captureRecovery.count());
  await page.evaluate(()=>(window as any).captureRecovery.fail());
  await expect.poll(()=>page.evaluate(()=>(window as any).captureRecovery.count())).toBeGreaterThan(before+2);
  expect(await page.evaluate(()=>(window as any).captureRecovery.gate())).toBe(true);
  expect(await page.evaluate(()=>(window as any).captureRecovery.listening())).toBe(false);
  expect(await page.evaluate(()=>(window as any).captureRecovery.kind('AudioWorklet microphone failed'))).toBe('microphone');
  await page.evaluate(()=>(window as any).captureRecovery.close());
});

test('recognition reconnect leaves the working PCM microphone capture running',async({page})=>{
  await page.evaluate(()=>(window as any).captureRecovery.start());
  await expect.poll(()=>page.evaluate(()=>(window as any).captureRecovery.count())).toBeGreaterThan(2);
  const before=await page.evaluate(()=>(window as any).captureRecovery.count());
  expect(await page.evaluate(()=>(window as any).captureRecovery.recognition())).toEqual({sameProcessor:true,stillListening:true});
  await expect.poll(()=>page.evaluate(()=>(window as any).captureRecovery.count())).toBeGreaterThan(before+2);
  await page.evaluate(()=>(window as any).captureRecovery.close());
});

test('a muted microphone track is recovered without being reported as misconduct',async({page})=>{
  await page.evaluate(()=>(window as any).captureRecovery.start());
  expect(await page.evaluate(()=>(window as any).captureRecovery.mutedTrack())).toEqual({recoveries:1,integrityEvents:0});
  await page.evaluate(()=>(window as any).captureRecovery.close());
});

test('low face brightness is advisory when the camera and identity checks pass',async({page})=>{
  const lighting=await page.evaluate(()=>(window as any).__testCameraLighting(24));
  expect(lighting.state).toBe('warn');
  expect(lighting.message).toContain('You can continue');
  expect(await page.evaluate(()=>(window as any).__testCameraEntryChecks({
    sharpness:18,exactlyOneFace:true,exactlyOnePerson:true,framingPassing:true,
    visionCheckUnavailable:false,objectDetectorUnavailable:false,fullPersonCheckReady:true,phoneDetected:false,
  }))).toBe(true);
  expect(await page.evaluate(()=>(window as any).__testCameraEntryChecks({
    sharpness:18,exactlyOneFace:false,exactlyOnePerson:true,framingPassing:true,
    visionCheckUnavailable:false,objectDetectorUnavailable:false,fullPersonCheckReady:true,phoneDetected:false,
  }))).toBe(false);
});


test('real streamed playback releases the microphone once and without a server timeout',async({page})=>{
  await page.evaluate(()=>(window as any).captureRecovery.start());
  await expect.poll(()=>page.evaluate(()=>(window as any).captureRecovery.count())).toBeGreaterThan(2);
  await page.evaluate(()=>(window as any).captureRecovery.playback());
  expect(await page.evaluate(()=>(window as any).captureRecovery.speaking())).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).captureRecovery.speaking()),{timeout:2500}).toBe(false);
  const before=await page.evaluate(()=>(window as any).captureRecovery.count());
  await expect.poll(()=>page.evaluate(()=>(window as any).captureRecovery.count())).toBeGreaterThan(before+2);
  expect((await page.evaluate(()=>(window as any).captureRecovery.acks())).filter((x:any)=>x.type==='playback_complete')).toEqual([{type:'playback_complete',audio_epoch:41}]);
  await page.evaluate(()=>(window as any).captureRecovery.close());
});

test('suspended playback resumes and does not leave microphone permanently gated',async({page})=>{
  await page.evaluate(()=>(window as any).captureRecovery.start());
  await page.evaluate(()=>(window as any).captureRecovery.playback(true));
  await expect.poll(()=>page.evaluate(()=>(window as any).captureRecovery.speaking()),{timeout:2500}).toBe(false);
  await expect.poll(()=>page.evaluate(()=>(window as any).captureRecovery.count())).toBeGreaterThan(2);
  await page.evaluate(()=>(window as any).captureRecovery.close());
});

test('quality flicker does not spam reminders and sustained failures share a cooldown',async({page})=>{
  const result=await page.evaluate(()=>{
    const check=(window as any).__testQualityTransition;
    const events=[];
    for(let now=0;now<20000;now+=800)events.push(check(now%1600?'poor_lighting':null,now));
    events.push(check('poor_lighting',21000),check('poor_lighting',25000));
    events.push(check(null,26000),check(null,29000));
    events.push(check('camera_blurry',30000),check('camera_blurry',34000));
    events.push(check('camera_blurry',86000));
    return events.filter(Boolean);
  });
  expect(result).toEqual(['poor_lighting','camera_quality_restored','camera_blurry']);
});
