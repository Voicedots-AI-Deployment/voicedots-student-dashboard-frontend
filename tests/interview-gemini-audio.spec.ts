import { test, expect } from '@playwright/test';

for (const round of [1, 2, 3, 4]) {
  test(`Gemini 24 kHz audio drives only avatar ${round} and waits for playback before opening the mic`, async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ json: { student: { id: 'voice-audit' }, csrf_token: 'test' } }));
    await page.route('**/interview.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
        window.voiceAudit = {
          start(round, rate) {
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
            handleControlMessage({type:'tts_end',audio_epoch:round});
          },
          state() {return {speaking:aiSpeaking, mouth: [...panelAnimations].map(([round,c])=>({round,talking:c.visibleFrame!==c.idleFrame&&c.visibleFrame!==c.blinkFrame})), rates:window.voiceRates,acks:window.voiceAcks};},
          stale(epoch) {const packet=new ArrayBuffer(48004);new DataView(packet).setUint32(0,epoch,false);handleBinaryFrame(packet);}
        };
      ` });
    });
    await page.goto('/interview.html?id=voice-audit');
    await expect.poll(() => page.evaluate(() => !!(window as any).voiceAudit)).toBe(true);
    await page.clock.install();
    await page.evaluate(round => (window as any).voiceAudit.start(round, 24000), round);
    await page.clock.runFor(100);
    let state = await page.evaluate(() => (window as any).voiceAudit.state());
    expect(state.rates).toEqual([24000]);
    expect(state.speaking).toBe(true);
    expect(state.acks).toEqual([]);
    expect(state.mouth.filter((m: any) => m.talking).map((m: any) => m.round)).toEqual([round]);
    await page.evaluate(round => (window as any).voiceAudit.stale(round + 100), round);
    expect((await page.evaluate(() => (window as any).voiceAudit.state())).rates).toEqual([24000]);
    await page.clock.runFor(1100);
    state = await page.evaluate(() => (window as any).voiceAudit.state());
    expect(state.speaking).toBe(false);
    expect(state.mouth.some((m: any) => m.talking)).toBe(false);
    expect(state.acks).toEqual([{type:'playback_complete',audio_epoch:round}]);
    // An unchanged Deepgram server can still omit sample_rate and play at 48 kHz.
    await page.evaluate(round => (window as any).voiceAudit.start(round, undefined), round);
    expect((await page.evaluate(() => (window as any).voiceAudit.state())).rates).toEqual([48000]);
  });
}
