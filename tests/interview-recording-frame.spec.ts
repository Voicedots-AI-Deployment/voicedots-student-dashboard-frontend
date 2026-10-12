import { test, expect } from '@playwright/test';
for (const [width, height] of [[1920,1080],[640,480],[480,640]]) {
  test(`placement recording retains full ${width}x${height} camera frame`, async ({page}) => {
    await page.route('**/api/**', r => r.fulfill({json:{student:{id:'frame-audit'},csrf_token:'test'}}));
    await page.route('**/interview.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({response,body:await response.text()+`\nwindow.frameAudit = drawRecordingFrame;`});
    });
    await page.goto('/interview.html?id=frame-audit');
    await page.waitForFunction(() => typeof (window as any).frameAudit === 'function');
    const drawn = await page.evaluate(({width,height}) => {
      const calls:any[]=[];
      const ctx={fillStyle:'',fillRect:(...args:any[])=>calls.push(['fill',...args]),drawImage:(_video:any,...args:any[])=>calls.push(['draw',...args])};
      (window as any).frameAudit(ctx,{videoWidth:width,videoHeight:height},{width:640,height:360});
      return calls;
    }, {width,height});
    expect(drawn[0]).toEqual(['fill',0,0,640,360]);
    const [,x,y,w,h] = drawn[1];
    expect(w/h).toBeCloseTo(width/height,5);
    expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);
    expect(x+w).toBeLessThanOrEqual(640);expect(y+h).toBeLessThanOrEqual(360);
    expect(x*2+w).toBeCloseTo(640);expect(y*2+h).toBeCloseTo(360);
  });
}
