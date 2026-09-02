const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  // Wrap the fragment the way the Artifact host does.
  const frag = fs.readFileSync(path.join(__dirname, 'edp-register-handoff.html'), 'utf8');
  fs.writeFileSync(path.join(__dirname, 'artifact-preview.html'),
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>:root{color-scheme:light dark}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>' +
    '</head><body>' + frag + '</body></html>');

  for (const v of [{n:'phone',w:390,h:844},{n:'phone-dark',w:390,h:844,dark:true},{n:'desktop',w:1100,h:900}]) {
    const ctx = await b.newContext({
      viewport:{width:v.w,height:v.h}, deviceScaleFactor:2,
      colorScheme: v.dark ? 'dark' : 'light',
      permissions:['clipboard-read','clipboard-write']
    });
    const p = await ctx.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto('file://'+path.join(__dirname,'artifact-preview.html'));
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(__dirname, `art-${v.n}.png`), fullPage: false });

    if (v.n === 'phone') {
      const r = await p.evaluate(() => ({
        bodyBg: getComputedStyle(document.body).backgroundColor,
        inkColor: getComputedStyle(document.body).color,
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        btnH: document.getElementById('copyBtn').getBoundingClientRect().height,
        plainChars: document.getElementById('plain').textContent.length,
        fontLoaded: document.fonts ? document.fonts.check('700 19px Archivo') : 'n/a'
      }));
      console.log('--- phone layout ---');
      Object.entries(r).forEach(([k,val])=>console.log(String(k).padEnd(13), JSON.stringify(val)));

      await p.click('#copyBtn');
      await p.waitForTimeout(400);
      const label = await p.locator('#copyLabel').textContent();
      const clip = await p.evaluate(() => navigator.clipboard.readText());
      console.log('--- copy button ---');
      console.log('label after click :', JSON.stringify(label));
      console.log('clipboard chars   :', clip.length);
      console.log('starts with       :', JSON.stringify(clip.slice(0,46)));
      console.log('ends with         :', JSON.stringify(clip.trim().slice(-30)));
      console.log('matches source    :', clip === await p.evaluate(()=>document.getElementById('plain').textContent));
      await p.screenshot({ path: path.join(__dirname,'art-phone-copied.png') });
      await p.waitForTimeout(2200);
      console.log('label reverts to  :', JSON.stringify(await p.locator('#copyLabel').textContent()));
    }
    if (v.n === 'phone-dark') {
      const r = await p.evaluate(() => ({ bodyBg:getComputedStyle(document.body).backgroundColor, color:getComputedStyle(document.body).color }));
      console.log('--- dark theme ---'); console.log('body bg', r.bodyBg, '| text', r.color);
    }
    console.log(`[${v.n}] JS errors:`, errs.length, errs);
    await ctx.close();
  }
  await b.close();
})();
