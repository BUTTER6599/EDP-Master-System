const vm = require('vm');
const { makeSheet, buildSandbox, loadContext, pushCalls } = require('./harness.cjs');

const KEY = 'k'.repeat(64);
const baseProps = {
  TEST_SHEET_ID: 'sheet-abc',
  TEST_SHEET_TAB: 'TEST_CALLS',
  TEST_WEBHOOK_KEY: KEY,
  PUSHOVER_APP_TOKEN: 'tok',
  PUSHOVER_USER_KEY: 'usr',
};

let failures = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  PASS  ' + name); }
  else { failures++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

function newCtx(sheetRows, props) {
  const sheet = makeSheet(sheetRows);
  const sandbox = buildSandbox({ props: Object.assign({}, baseProps, props), sheet, tabName: 'TEST_CALLS' });
  const ctx = loadContext(sandbox);
  return { ctx, sheet };
}

// ---- 1. empty tab: seeds headers, writes one row, sends one push ---------
console.log('\n1. Empty TEST_CALLS tab');
{
  pushCalls.length = 0;
  const { ctx, sheet } = newCtx([]);
  const out = vm.runInContext('runAllTests()', ctx);
  console.log('  runAllTests ->', out);
  const headers = sheet._data[0];
  check('headers seeded', headers && headers[0] === 'logged_at' && headers.includes('summary'));
  // runAllTests: bad key (no row), ignored event (no row), happy path (1), dupe (1)
  const dataRows = sheet._data.length - 1;
  check('exactly 2 data rows from suite', dataRows === 2, 'got ' + dataRows);
  check('exactly 2 pushes', pushCalls.length === 2, 'got ' + pushCalls.length);
  const push = pushCalls[0];
  check('push title marks TEST', push.title === '[TEST] Call ended', push.title);
  check('push has caller', push.message.includes('+15045551234'));
  check('push has duration 2m 18s', push.message.includes('2m 18s'), push.message);
  check('push has summary', push.message.includes('used washer'));
  check('push links recording', push.url === 'https://example.invalid/recording.mp3');
  console.log('  --- sample push message ---');
  console.log(push.message.split('\n').map(l => '  | ' + l).join('\n'));
}

// ---- 2. pre-existing custom headers, different order & names ------------
console.log('\n2. Tab with pre-existing custom headers');
{
  pushCalls.length = 0;
  const existing = ['Timestamp', 'Caller', 'Call ID', 'Duration', 'Summary', 'Owner Notes'];
  const { ctx, sheet } = newCtx([existing]);
  vm.runInContext('testEndOfCallReport()', ctx);
  check('headers untouched', JSON.stringify(sheet._data[0]) === JSON.stringify(existing));
  const row = sheet._data[1];
  check('one row appended', sheet._data.length === 2);
  check('Caller mapped', row[1] === '+15045551234', String(row[1]));
  check('Call ID mapped', String(row[2]).startsWith('test-'), String(row[2]));
  check('Duration mapped', row[3] === 138, String(row[3]));
  check('Summary mapped', String(row[4]).includes('used washer'));
  check('unknown header blank', row[5] === '', JSON.stringify(row[5]));
  check('row width matches headers', row.length === existing.length, row.length + ' vs ' + existing.length);
}

// ---- 3. fail-closed when unconfigured -----------------------------------
console.log('\n3. Fail-closed behaviour');
{
  const { ctx } = newCtx([], { TEST_WEBHOOK_KEY: '' });
  const res = vm.runInContext(
    'doPost({parameter:{key:"anything"},postData:{contents:JSON.stringify({message:{type:"end-of-call-report"}})}}).getContent()',
    ctx
  );
  check('unconfigured -> not_configured', res.includes('not_configured'), res);
}

// ---- 4. legacy flat payload shape ---------------------------------------
console.log('\n4. Older flat Vapi payload (summary/transcript at top level)');
{
  pushCalls.length = 0;
  const { ctx, sheet } = newCtx([]);
  const legacy = {
    message: {
      type: 'end-of-call-report',
      endedReason: 'assistant-ended-call',
      startedAt: '2026-09-12T10:00:00.000Z',
      endedAt: '2026-09-12T10:00:45.000Z',
      call: { id: 'legacy-1', customer: { number: '+15040001111' } },
      summary: 'Legacy shape summary.',
      transcript: 'AI: hello',
      recordingUrl: 'https://example.invalid/legacy.mp3',
    },
  };
  const res = vm.runInContext(
    `doPost({parameter:{key:${JSON.stringify(KEY)}},postData:{contents:${JSON.stringify(JSON.stringify(legacy))}}}).getContent()`,
    ctx
  );
  check('legacy logged', res.includes('"logged":true'), res);
  const headers = sheet._data[0];
  const row = sheet._data[1];
  const at = n => row[headers.indexOf(n)];
  check('legacy caller parsed', at('customer_number') === '+15040001111', String(at('customer_number')));
  check('legacy summary parsed', at('summary') === 'Legacy shape summary.');
  check('legacy recording parsed', at('recording_url') === 'https://example.invalid/legacy.mp3');
  check('duration derived from timestamps', at('duration_seconds') === 45, String(at('duration_seconds')));
}

// ---- 5. malformed / hostile input ---------------------------------------
console.log('\n5. Malformed input');
{
  const { ctx, sheet } = newCtx([]);
  const bad = vm.runInContext(
    `doPost({parameter:{key:${JSON.stringify(KEY)}},postData:{contents:"{not json"}}).getContent()`, ctx);
  check('unparseable -> bad_request', bad.includes('bad_request'), bad);
  const empty = vm.runInContext(
    `doPost({parameter:{key:${JSON.stringify(KEY)}},postData:{contents:"{}"}}).getContent()`, ctx);
  check('empty body -> ignored', empty.includes('"ignored":true'), empty);
  const noParam = vm.runInContext('doPost({}).getContent()', ctx);
  check('no params -> unauthorized', noParam.includes('unauthorized'), noParam);
  check('nothing written on bad input', sheet._data.length <= 1, 'rows=' + sheet._data.length);
}

// ---- 6. pushover failure must not break logging -------------------------
console.log('\n6. Pushover outage');
{
  const sheet = makeSheet([]);
  const sandbox = buildSandbox({ props: baseProps, sheet, tabName: 'TEST_CALLS', pushoverStatus: 500 });
  const ctx = loadContext(sandbox);
  const res = vm.runInContext('testEndOfCallReport()', ctx);
  check('row still logged', res.includes('"logged":true'), res);
  check('notified reported false', res.includes('"notified":false'), res);
}

// ---- 7. assistant allowlist ---------------------------------------------
console.log('\n7. Assistant allowlist');
{
  const { ctx, sheet } = newCtx([], { TEST_ASSISTANT_ID: 'asst_other' });
  const res = vm.runInContext('testEndOfCallReport()', ctx);
  check('non-allowlisted rejected', res.includes('assistant_not_allowed'), res);
  check('no row written', sheet._data.length <= 1);
  const { ctx: ctx2, sheet: sheet2 } = newCtx([], { TEST_ASSISTANT_ID: 'asst_test_lo' });
  const ok = vm.runInContext('testEndOfCallReport()', ctx2);
  check('allowlisted accepted', ok.includes('"logged":true'), ok);
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
