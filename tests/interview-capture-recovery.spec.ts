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
        count(){return window.captureSends.filter(x=>x instanceof ArrayBuffer).length;},
        async suspend(){await audioContext.suspend();},
        state(){return audioContext.state;},
        fail(){micProcessor.onprocessorerror();},
        async recognition(){const previous=micProcessor;handleControlMessage({type:"transcription_recovery",detail:"Restoring speech recognition."});await new Promise(resolve=>setTimeout(resolve,100));return {sameProcessor:previous===micProcessor,stillListening:!aiSpeaking};},
        kind:preflightFailureKind,
        listening(){aiSpeaking=true;activePlaybackSources.clear();handleControlMessage({type:'listening',audio_epoch:currentAudioEpoch});return aiSpeaking;},
        gate(){aiSpeaking=true;activePlaybackSources.add({});handleControlMessage({type:'listening',audio_epoch:currentAudioEpoch});const value=aiSpeaking;activePlaybackSources.clear();aiSpeaking=false;return value;},
        async close(){interviewStopRequested=true;clearInterval(microphoneWatchdog);micProcessor.disconnect();await audioContext.close();await window.sourceContext.close();ws=null;}
      };`});
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
