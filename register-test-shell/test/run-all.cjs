#!/usr/bin/env node
/**
 * EDP Register — local test runner
 *
 * Runs every reproducible local check against the real Apps Script source
 * files in register-test-shell/. Nothing here touches Google, Apps Script,
 * a spreadsheet, or the network.
 *
 * Suites are derived from test/recovery-snapshot/ (the preserved evidence
 * behind the accepted Phase 2 and Phase 3A results). The derived copies in
 * test/run/ differ from that evidence by exactly one line each — path
 * resolution — so the logic under test is the logic that was accepted.
 *
 * The browser suite is skipped, not failed, when Playwright or Chromium is
 * unavailable. A skip is reported as a skip.
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const RUN = path.join(__dirname, 'run');
const results = [];

function run(label, file, args) {
  const r = spawnSync(process.execPath, [path.join(RUN, file), ...(args || [])],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out);
  const m = out.match(/TOTAL:\s*(\d+)\s*passed,\s*(\d+)\s*failed/);
  results.push({
    label,
    status: r.status === 0 ? 'PASS' : 'FAIL',
    passed: m ? Number(m[1]) : null,
    failed: m ? Number(m[2]) : null,
    exit: r.status
  });
  return r.status === 0;
}

function skip(label, why) { results.push({ label, status: 'SKIP', why }); }

console.log('============================================================');
console.log(' EDP REGISTER — LOCAL TEST RUN');
console.log(' No Google, no Apps Script, no spreadsheet, no network.');
console.log('============================================================\n');

console.log('--- [1/5] Phase 2 shape validator ---------------------------');
run('Phase 2 shape validator', 'validator-tests.cjs');

console.log('\n--- [2/5] Phase 3A query contract ---------------------------');
run('Phase 3A query contract', 'query-tests.cjs');

console.log('\n--- [3/5] Ordered-parity analysis ---------------------------');
run('Ordered-parity analysis', 'ordered-parity.cjs');

console.log('\n--- [4/5] Bootstrap / template build ------------------------');
const built = run('Bootstrap + template build', 'build-preview.cjs');

console.log('\n--- [5/5] Five-viewport browser regression ------------------');
let pw = true;
try { require.resolve('playwright'); } catch (e) { pw = false; }
if (!built) {
  skip('Browser regression', 'preview build failed, nothing to render');
  console.log('  SKIPPED — preview build failed.');
} else if (!pw) {
  skip('Browser regression', 'playwright not installed (npm install)');
  console.log('  SKIPPED — playwright not installed. Run: npm install');
} else {
  run('Browser regression', 'browser-regression.cjs');
}

console.log('\n============================================================');
console.log(' SUMMARY');
console.log('============================================================');
let hardFail = 0, totalPass = 0, totalFail = 0;
for (const r of results) {
  const counts = r.passed === null || r.passed === undefined ? '' :
    `  (${r.passed} passed, ${r.failed} failed)`;
  console.log(`  ${r.status.padEnd(5)} ${r.label}${counts}${r.why ? '  — ' + r.why : ''}`);
  if (r.status === 'FAIL') hardFail++;
  if (typeof r.passed === 'number') { totalPass += r.passed; totalFail += r.failed; }
}
console.log(`\n  assertion totals: ${totalPass} passed, ${totalFail} failed`);
console.log(`  suite results   : ${results.filter(r => r.status === 'PASS').length} pass, ` +
            `${hardFail} fail, ${results.filter(r => r.status === 'SKIP').length} skip`);
console.log('============================================================');
process.exit(hardFail ? 1 : 0);
