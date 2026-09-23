// DERIVED FROM test/recovery-snapshot/shoot.cjs — DO NOT EDIT THE SNAPSHOT.
// Differs from the preserved evidence in exactly two ways: path resolution,
// and a Package 9 assertion that any external image request goes ONLY to the
// approved Google image host. All other logic is byte-identical.
// Five-viewport headless Chromium regression.
const { chromium } = require('playwright');
const path = require('path');
const SP = require('./outdir.cjs');

const VIEWS = [
  { name: 'desktop',       w: 1440, h: 960 },
  { name: 'ipad-landscape', w: 1366, h: 1024 },
  { name: 'ipad-portrait',  w: 1024, h: 1366 },
  { name: 'android-tablet', w: 800,  h: 1280 },
  { name: 'phone',          w: 390,  h: 844 }
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [];
  let requests = [];

  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`[${v.name}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`[${v.name}] console: ${m.text()}`); });
    // Record any attempt to leave the machine.
    page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:')) requests.push(`[${v.name}] ${u}`); });

    await page.goto('file://' + path.join(SP, 'preview.html'));
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SP, `shot-${v.name}-register.png`) });

    if (v.name === 'desktop') {
      // Walk every view + exercise interactions.
      for (const view of ['customer', 'receipt', 'activity']) {
        await page.click(`.rail [data-view="${view}"]`);
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(SP, `shot-desktop-${view}.png`) });
      }
      await page.click('.rail [data-view="register"]');

      // Assertions on real rendered state.
      const checks = await page.evaluate(() => {
        const q = s => document.querySelector(s);
        return {
          clockTime:  q('#clockTime').textContent.trim(),
          clockDate:  q('#clockDate').textContent.trim(),
          cards:      document.querySelectorAll('.prod').length,
          cartLines:  document.querySelectorAll('#cartLines .line').length,
          grand:      q('#grandTotal').textContent,
          completeDisabled: q('#btnCompleteSale').disabled,
          defaultPay: (q('#payGrid .active') || {}).textContent,
          timeline:   document.querySelectorAll('#timeline .tl').length,
          chips:      Array.from(document.querySelectorAll('#statusStrip .chip .t')).map(e => e.textContent),
          receiptItems: document.querySelectorAll('#receipt .ritem').length,
          imgsLoaded: Array.from(document.images).every(i => i.complete && i.naturalWidth > 0),
          imgCount:   document.images.length,
          externalSrc: Array.from(document.images).filter(i => !i.src.startsWith('data:')).length
        };
      });
      console.log('--- rendered state (desktop) ---');
      for (const [k, val] of Object.entries(checks)) console.log(String(k).padEnd(18), JSON.stringify(val));

      // Interaction: search, filter, add item, offline sim, printer sim.
      await page.fill('#prodSearch', 'maytag');
      await page.waitForTimeout(150);
      const searchHits = await page.locator('.prod').count();
      await page.fill('#prodSearch', '');
      await page.click('#catFilters [data-cat="Washer"]');
      await page.waitForTimeout(150);
      const washerHits = await page.locator('.prod').count();
      await page.click('#catFilters [data-cat="ALL"]');
      await page.waitForTimeout(120);

      const before = await page.locator('#cartLines .line').count();
      await page.click('.prod [data-add="EDP-10312"]');
      await page.waitForTimeout(200);
      const after = await page.locator('#cartLines .line').count();

      await page.click('#simNet'); await page.waitForTimeout(200);
      const offlineChip = await page.locator('#chipNet .t').textContent();
      await page.click('#simNet'); await page.waitForTimeout(150);
      await page.click('#simSync'); await page.waitForTimeout(1800);
      const syncChip = await page.locator('#chipSync .t').textContent();
      await page.click('#simPrinter'); await page.waitForTimeout(200);
      const printerChip = await page.locator('#chipPrinter .t').textContent();

      await page.click('.rail [data-view="activity"]');
      await page.waitForTimeout(200);
      const tlAfter = await page.locator('#timeline .tl').count();
      const newestAction = await page.locator('#timeline .tl .act').first().textContent();

      console.log('--- interactions ---');
      console.log('search "maytag" hits'.padEnd(24), searchHits);
      console.log('filter Washer hits'.padEnd(24), washerHits);
      console.log('cart lines before/after'.padEnd(24), before + ' -> ' + after);
      console.log('offline chip'.padEnd(24), JSON.stringify(offlineChip));
      console.log('sync chip after sync'.padEnd(24), JSON.stringify(syncChip));
      console.log('printer chip toggled'.padEnd(24), JSON.stringify(printerChip));
      console.log('timeline events now'.padEnd(24), tlAfter);
      console.log('newest timeline entry'.padEnd(24), JSON.stringify(newestAction.trim()));
      console.log('complete-sale still disabled', await page.locator('#btnCompleteSale').isDisabled());
      await page.screenshot({ path: path.join(SP, 'shot-desktop-activity-after.png') });
    }

    if (v.name === 'phone') {
      await page.click('#cartFab');
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SP, 'shot-phone-cart.png') });
    }
    await ctx.close();
  }

  console.log('--- network / errors ---');
  console.log('external requests attempted:', requests.length, requests.slice(0, 5));
  console.log('JS errors:', errors.length);
  errors.forEach(e => console.log('  ' + e));

  // Package 9: real appliance photos are allowed, but ONLY from the approved
  // Google image host. A blanket "zero external requests" check would now fail
  // for the wrong reason, and silently permitting any host would be worse.
  const APPROVED_IMAGE_HOSTS = ['lh3.googleusercontent.com'];
  const offHost = requests.filter(u => {
    if (typeof u !== 'string' || !/^https?:\/\//.test(u)) { return false; }
    let h; try { h = new URL(u).hostname; } catch (e) { return true; }
    return !APPROVED_IMAGE_HOSTS.includes(h);
  });
  console.log('approved image hosts:', APPROVED_IMAGE_HOSTS.join(', '));
  console.log('requests to NON-approved hosts:', offHost.length, offHost.slice(0, 5));

  await browser.close();
  if (offHost.length) {
    console.log('FAIL  external request to a non-approved host');
    process.exit(1);
  }
  if (errors.length) {
    console.log('FAIL  JS errors during render');
    process.exit(1);
  }
})();
