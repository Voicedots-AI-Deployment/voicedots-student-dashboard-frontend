import { test, expect } from '@playwright/test';

test('audio interrupted after tts_begin resumes when the first PCM arrives', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { student: { id: 'voice-audit' }, csrf_token: 'test' } }));
  await page.route('**/interview.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
      window.testInterruptedReply = () => {
        window.resumeCalls = 0;
        playbackAudioContext = {state:'running',currentTime:0,destination:{},
          async resume(){window.resumeCalls++;this.state='running';},
          createBuffer(c,n,r){return {duration:n/r,getChannelData:()=>new Float32Array(n)};},
          createBufferSource(){return {connect(){},start(){},stop(){}};}};
        playbackAnalyser=null;
        handleControlMessage({type:'tts_begin',audio_epoch:99,text:'What did you verify?',sample_rate:24000});
        playbackAudioContext.state='interrupted';
        const packet=new ArrayBuffer(484);new DataView(packet).setUint32(0,99,false);
        handleBinaryFrame(packet);
        return window.resumeCalls;
      };
    ` });
  });
  await page.goto('/interview.html?id=voice-audit');
  await expect.poll(() => page.evaluate(() => typeof (window as any).testInterruptedReply)).toBe('function');
  expect(await page.evaluate(() => (window as any).testInterruptedReply())).toBe(1);
});

for (const [provider, rate] of [['Deepgram', 48000], ['Gemini', 24000]] as const) {
for (const round of [1, 2, 3, 4]) {
  test(`${provider} ${rate / 1000} kHz audio drives only avatar ${round} and waits for playback before opening the mic`, async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ json: { student: { id: 'voice-audit' }, csrf_token: 'test' } }));
    await page.route('**/interview.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
        window.voiceAudit = {
          start(round, rate, finished=true) {
            window.voiceRates = []; window.voiceAcks = [];
            resetPlaybackQueue(); activePanelRound = round;
            playbackAudioContext = {currentTime:0, destination:{},
              createBuffer(channels, frames, sampleRate) {
                window.voiceRates.push(sampleRate);
                return {duration:frames/sampleRate, getChannelData:()=>new Float32Array(frames)};
              },
              createBufferSource() {return {connect(){}, start(){}, stop(){}};}
            };
            playbackAnalyser = {fftSize:32,getByteTimeDomainData(data){data.fill(190);}};
            ws = {readyState:WebSocket.OPEN,send(message){window.voiceAcks.push(JSON.parse(message));}};
            handleControlMessage({type:'tts_begin',audio_epoch:round,text:'Tell me about your project.',sample_rate:rate});
            schedulePCMChunk(new Int16Array(rate || 48000).fill(1000).buffer,round);
            if(finished) handleControlMessage({type:'tts_end',audio_epoch:round});
          },
          chunk(round,rate) {const packet=new ArrayBuffer(4+Math.floor(rate*.08)*2);new DataView(packet).setUint32(0,round,false);handleBinaryFrame(packet);},
          end(round) {handleControlMessage({type:"tts_end",audio_epoch:round});},
          state() {return {speaking:aiSpeaking, mouth: [...panelAnimations].map(([round,c])=>({round,talking:c.visibleFrame!==c.idleFrame&&c.visibleFrame!==c.blinkFrame})), rates:window.voiceRates,acks:window.voiceAcks};},
          stale(epoch) {const packet=new ArrayBuffer(48004);new DataView(packet).setUint32(0,epoch,false);handleBinaryFrame(packet);}
        };
      ` });
    });
    await page.goto('/interview.html?id=voice-audit');
    await expect.poll(() => page.evaluate(() => !!(window as any).voiceAudit)).toBe(true);
    await page.clock.install();
    await page.evaluate(({round, rate}) => (window as any).voiceAudit.start(round, rate, false), {round, rate});
    await page.clock.runFor(100);
    let state = await page.evaluate(() => (window as any).voiceAudit.state());
    expect(state.rates).toEqual([rate]);
    expect(state.speaking).toBe(true);
    expect(state.acks).toEqual([{type:'playback_started',audio_epoch:round}]);
    expect(state.mouth.filter((m: any) => m.talking).map((m: any) => m.round)).toEqual([round]);
    // Playback already starts while the provider is still generating audio.
    await page.evaluate(({round,rate}) => {const h=(window as any).voiceAudit;h.chunk(round,rate);h.end(round);}, {round,rate});
    await page.evaluate(round => (window as any).voiceAudit.stale(round + 100), round);
    expect((await page.evaluate(() => (window as any).voiceAudit.state())).rates).toEqual([rate,rate]);
    // The stub clock does not advance AudioContext.currentTime: the queued
    // 1.08 seconds plus the 40 ms completion guard need at least 1120 ms.
    await page.clock.runFor(1200);
    state = await page.evaluate(() => (window as any).voiceAudit.state());
    expect(state.speaking).toBe(false);
    expect(state.mouth.some((m: any) => m.talking)).toBe(false);
    expect(state.acks).toEqual([{type:'playback_started',audio_epoch:round},{type:'playback_complete',audio_epoch:round}]);
    // An unchanged Deepgram server can still omit sample_rate and play at 48 kHz.
    await page.evaluate(round => (window as any).voiceAudit.start(round, undefined), round);
    expect((await page.evaluate(() => (window as any).voiceAudit.state())).rates).toEqual([48000]);
  });
}
}

test('next panel audio does not wait behind a superseded playback queue',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:{student:{id:'test'},csrf_token:'test'}}));
 await page.route('**/interview.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
 window.staleAudioAudit=()=>{
  let stopped=0;let started=null;
  playbackAudioContext={state:'running',currentTime:10,destination:{},
   createBuffer(c,n,r){return {duration:n/r,getChannelData:()=>new Float32Array(n)}},
   createBufferSource(){return {connect(){},stop(){},start(time){started=time}}}};
  playbackAnalyser=null;currentAudioEpoch=1;playbackTime=45;
  activePlaybackSources.add({stop(){stopped++}});
  handleControlMessage({type:'tts_begin',audio_epoch:2,text:'Next panel question',sample_rate:24000});
  const packet=new ArrayBuffer(484);new DataView(packet).setUint32(0,2,false);handleBinaryFrame(packet);
  return {stopped,started,epoch:currentAudioEpoch};
 };
 `})});
 await page.goto('/interview.html?id=test');await page.waitForFunction(()=>!!(window as any).staleAudioAudit);
 const result=await page.evaluate(()=>(window as any).staleAudioAudit());
 expect(result.stopped).toBe(1);expect(result.epoch).toBe(2);expect(result.started).toBeLessThan(10.1);
});
