const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERROR:', e.message, '\n', (e.stack||'').split('\n').slice(0,4).join('\n')));
  p.on('console', m => console.log('CONSOLE[' + m.type() + ']:', m.text()));
  await p.goto('file://' + path.join(__dirname, 'preview.html'));
  await p.waitForTimeout(600);
  console.log('EDP_BOOT present:', await p.evaluate(() => typeof window.EDP_BOOT));
  console.log('inventory len   :', await p.evaluate(() => (window.EDP_BOOT||{}).inventory ? window.EDP_BOOT.inventory.length : 'n/a'));
  console.log('script tags     :', await p.evaluate(() => document.querySelectorAll('script').length));
  console.log('style tags      :', await p.evaluate(() => document.querySelectorAll('style').length));
  await b.close();
})();
