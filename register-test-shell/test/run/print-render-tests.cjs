// Package 11 — what the THERMAL ROLL actually receives.
//
// The other suites prove the receipt model and the print hand-off. This one
// renders the real page under `media: print` in a real browser and measures the
// result, because the parts that decide whether a thermal receipt is legible —
// roll width, colour, suppressed photos, nothing overflowing — are computed
// style, not source text.
//
// Touches no Google service, no spreadsheet, no printer, no network: it loads
// the locally built preview over file://.
const fs = require('fs'), path = require('path');
const OUT = require('./outdir.cjs');
const PREVIEW = path.join(OUT, 'preview.html');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

console.log('PACKAGE 11 — THERMAL PRINT RENDER');
console.log('=================================');

function bail(why) {
  console.log('  SKIPPED — ' + why);
  console.log('\n-------------------------------------------------------');
  console.log('TOTAL: 0 passed, 0 failed');
  process.exit(0);
}

let chromium;
try { chromium = require('playwright').chromium; } catch (e) { bail('playwright not installed'); }
if (!fs.existsSync(CHROME)) { bail('chromium not found at ' + CHROME); }
if (!fs.existsSync(PREVIEW)) { bail('preview.html not built'); }

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // A print job must never reach for the network mid-print.
  const external = [];
  page.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) external.push(r.url()); });

  await page.goto('file://' + PREVIEW);
  await page.evaluate(() => {
    document.querySelectorAll('[data-add]').forEach((b, i) => { if (i < 2) b.click(); });
    document.querySelector('[data-view=receipt]').click();
  });
  await page.waitForTimeout(300);

  const screen = await page.evaluate(() => {
    const r = document.querySelector('#receipt');
    return { marks: (r.innerHTML.match(/TEST — NOT A SALE/g) || []).length,
             items: r.querySelectorAll('.ritem').length };
  });
  console.log('\nON SCREEN');
  ok('the receipt renders line items', screen.items === 2, 'items = ' + screen.items);
  ok('the TEST mark is present twice', screen.marks === 2, 'marks = ' + screen.marks);

  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(150);

  const p = await page.evaluate(() => {
    const r = document.querySelector('#receipt');
    const box = r.getBoundingClientRect();
    const coloured = Array.from(r.querySelectorAll('*'))
      .filter(e => e.textContent.trim() && getComputedStyle(e).color !== 'rgb(0, 0, 0)')
      .map(e => e.className + ' -> ' + getComputedStyle(e).color);
    const overflow = Array.from(r.querySelectorAll('*'))
      .filter(e => e.getBoundingClientRect().right > box.right + 1)
      .map(e => e.className);
    const thumbs = Array.from(r.querySelectorAll('.ritem .thumb'));
    return {
      width: Math.round(box.width),
      coloured: coloured,
      overflow: overflow,
      thumbsTotal: thumbs.length,
      thumbsVisible: thumbs.filter(t => t.getBoundingClientRect().width > 0).length,
      chrome: ['.topbar', '.bottomnav', '.actions-col', '.rail', '.testbar', '.statusstrip', '.cartfab']
        .filter(s => { const e = document.querySelector(s); return e && e.getBoundingClientRect().width > 0; }),
      marks: r.querySelectorAll('.rtestmark').length,
      bottomMark: !!r.querySelector('.rtestmark.bottom')
    };
  });

  console.log('\nUNDER media: print');
  // 72mm at the CSS reference 96dpi is 272.1px. Allow one pixel of rounding.
  ok('the receipt is 72mm wide (272px at 96dpi)', Math.abs(p.width - 272) <= 1, p.width + 'px');
  ok('every character is pure black', p.coloured.length === 0, p.coloured.join(' | '));
  ok('nothing overflows the roll width', p.overflow.length === 0, p.overflow.join(' | '));
  ok('product photos are suppressed', p.thumbsVisible === 0,
    p.thumbsVisible + ' of ' + p.thumbsTotal + ' visible');
  ok('no page chrome survives into the job', p.chrome.length === 0, p.chrome.join(' | '));
  ok('the TEST mark prints twice', p.marks === 2, 'marks = ' + p.marks);
  ok('one of them is at the bottom of the slip', p.bottomMark === true);

  console.log('\nSAFETY');
  ok('no JavaScript error while rendering the job', errors.length === 0, errors.join(' | '));
  ok('the page makes no external request to print', external.length === 0, external.join(' | '));

  await browser.close();
  console.log('\n-------------------------------------------------------');
  console.log(`TOTAL: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  suite crashed: ' + e.message); process.exit(1); });
