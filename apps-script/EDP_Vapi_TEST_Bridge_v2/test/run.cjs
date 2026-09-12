// Runs the real Code.gs against a stubbed Apps Script runtime, so the
// bridge can be checked before it is pushed to Google.
//   node apps-script/EDP_Vapi_TEST_Bridge_v2/test/run.cjs
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'Code.gs'), 'utf8');

let failures = 0;
function check(name, cond, extra) {
  if (cond) return console.log('  PASS  ' + name);
  failures++;
  console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : ''));
}

// Builds a fresh sandbox. `opts.tabName` is the tab the fake spreadsheet
// actually has, so passing a different one simulates a missing tab.
function load(opts) {
  opts = opts || {};
  const rows = [];
  const pushes = [];
  const logs = [];
  const props = Object.assign(
    {
      TEST_SPREADSHEET_ID: 'sheet-abc',
      PUSHOVER_TOKEN: 'tok',
      PUSHOVER_USER: 'usr',
    },
    opts.props
  );
  const tabName = 'tabName' in opts ? opts.tabName : 'TEST_CALLS';

  const sandbox = {
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null) }),
    },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: name => (name === tabName ? { appendRow: r => rows.push(r) } : null),
      }),
    },
    UrlFetchApp: { fetch: (url, o) => pushes.push(o.payload) },
    ContentService: {
      MimeType: { TEXT: 'text/plain' },
      createTextOutput: text => ({ setMimeType() { return this; }, getContent: () => text }),
    },
    Logger: { log: m => logs.push(String(m)) },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SOURCE, ctx, { filename: 'Code.gs' });
  return { ctx, rows, pushes, logs };
}

const post = body => `doPost({postData:{contents:${JSON.stringify(JSON.stringify(body))}}}).getContent()`;

const REPORT = {
  message: {
    type: 'end-of-call-report',
    durationSeconds: 138,
    assistant: { name: 'LO_TEST' },
    call: { id: 'call-abc', customer: { number: '+15045551234' } },
  },
};

console.log('\n1. end-of-call-report');
{
  const { ctx, rows, pushes } = load();
  const res = vm.runInContext(post(REPORT), ctx);
  check('returns OK', res === 'OK', res);
  check('exactly one row', rows.length === 1, 'got ' + rows.length);
  check('exactly one push', pushes.length === 1, 'got ' + pushes.length);
  const [ts, id, assistant, caller, dur] = rows[0] || [];
  check('row has 5 columns', (rows[0] || []).length === 5);
  // `instanceof Date` fails across vm realms, so check the shape instead.
  check('timestamp is a valid Date', !!ts && typeof ts.getTime === 'function' && !isNaN(ts.getTime()));
  check('call id', id === 'call-abc', String(id));
  check('assistant', assistant === 'LO_TEST', String(assistant));
  check('caller', caller === '+15045551234', String(caller));
  check('duration', dur === 138, String(dur));
  check('push title', pushes[0].title === 'EDP TEST Call Logged');
  console.log('  --- push message ---');
  console.log(pushes[0].message.split('\n').map(l => '  | ' + l).join('\n'));
}

console.log('\n2. Other event types and empty bodies');
{
  const { ctx, rows, pushes } = load();
  const ignored = vm.runInContext(post({ message: { type: 'status-update' } }), ctx);
  check('status-update ignored', ignored === 'Ignored: status-update', ignored);
  const noBody = vm.runInContext('doPost({}).getContent()', ctx);
  check('missing body handled', noBody === 'No body', noBody);
  check('nothing written', rows.length === 0 && pushes.length === 0);
}

console.log('\n3. Fallbacks');
{
  const { ctx, rows } = load();
  vm.runInContext(
    post({
      message: {
        type: 'end-of-call-report',
        customer: { number: '+15040001111' },
        call: {
          id: 'call-xyz',
          assistant: { name: 'LO_TEST' },
          startedAt: '2026-09-12T10:00:00.000Z',
          endedAt: '2026-09-12T10:00:45.000Z',
        },
      },
    }),
    ctx
  );
  check('caller from message.customer', rows[0][3] === '+15040001111', String(rows[0][3]));
  check('assistant from call.assistant', rows[0][2] === 'LO_TEST', String(rows[0][2]));
  check('duration derived from call timestamps', rows[0][4] === 45, String(rows[0][4]));

  const bare = load();
  vm.runInContext(post({ message: { type: 'end-of-call-report' } }), bare.ctx);
  check('bare report still logs a row', bare.rows.length === 1);
  check('unknown assistant', bare.rows[0][2] === 'unknown');
  check('unknown caller', bare.rows[0][3] === 'unknown');
  check('blank duration', bare.rows[0][4] === '');
}

console.log('\n4. Failure modes');
{
  // A wrong tab name is the realistic misconfiguration. Note that the call
  // is silently dropped: Vapi still receives a 200 and will not retry.
  const { ctx, rows, pushes, logs } = load({ tabName: 'SOMETHING_ELSE' });
  const res = vm.runInContext(post(REPORT), ctx);
  check('missing tab -> "Error logged"', res === 'Error logged', res);
  check('no row written', rows.length === 0);
  check('no push sent', pushes.length === 0);
  check('error reached Logger', logs.some(l => l.indexOf('Sheet tab not found') !== -1), logs.join(' | '));

  const noPush = load({ props: { PUSHOVER_TOKEN: null, PUSHOVER_USER: null } });
  const ok = vm.runInContext(post(REPORT), noPush.ctx);
  check('no Pushover creds -> still OK', ok === 'OK', ok);
  check('row still written', noPush.rows.length === 1);
  check('no push attempted', noPush.pushes.length === 0);
}

console.log('\n5. testHarness()');
{
  const { ctx, rows, pushes } = load();
  vm.runInContext('testHarness()', ctx);
  check('writes one row', rows.length === 1);
  check('sends one push', pushes.length === 1);
  check('uses the sample call id', rows[0][1] === 'TEST-CALL-ID-123');
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures ? 1 : 0);
