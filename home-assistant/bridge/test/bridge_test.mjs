// Harness: run the real Code.gs against real rows from EDP_MASTER_DATABASE.
import fs from 'node:fs';

const src = fs.readFileSync('home-assistant/bridge/Code.gs', 'utf8');

// Fixtures lifted verbatim from the Drive export of the live spreadsheet.
const FIXTURES = {
  TASKS_TEST: [
    ['task_id','list','title','category','status','priority','owner','due_date','recurrence','source_type','source_id','amount','location','notes','created_at','updated_at','completed_at','completed_by','next_action','active'],
    ['TASK-20260919-001','Business','Buy engine oil for car','shopping','open','normal','Taylor','','','manual','REMINDER-20260916','','','Car oil reminder','','2026-09-19','','','Buy oil','TRUE'],
    ['TASK-20260919-006','Business','Order refrigerator fan motors and relays','restocking','open','high','Taylor','','','manual','REMINDER-20260916','','','Restock parts','','2026-09-19','','','Order parts','TRUE'],
    ['TASK-20260919-007','Business','Already done thing','shopping','done','normal','Taylor','','','manual','','','','','','','','','','TRUE'],
    ['','','','','','','','','','','','','','','','','','','','FALSE'],
  ],
  BILLS: [
    ['bill_id','timestamp','due_date','week_id','bill_name','amount_due','fund_balance','status','priority','notes','updated_by'],
    ['B-20260805-BCBS-001','2026-08-10 20:41 CDT','2026-08-01','2026-08-01','Blue Cross Blue Shield of Louisiana - Health Insurance','919.68','0','PAST DUE - 3 MONTH GRACE PERIOD','1','','Taylor'],
    ['B-1782291218643-8978','6/24/2026 3:53:39','7/5/2026 12:00:00','','Rent','3600','1500','due','1','June rent','Taylor'],
  ],
  SCHEDULE: [
    ['EmployeeID','Name','DayOfWeek','ClockInTime','ClockOutTime','Active'],
    ['JOE','Joe','MON','8:00:00 AM','5:00:00 PM','TRUE'],
    ['OLD','Former','MON','8:00:00 AM','5:00:00 PM','FALSE'],
  ],
  PAYROLL: [
    ['payroll_id','week_id','employee','hours','rate','gross_pay','status','notes'],
    ['P-001','2026-09-01','Joe','40','15','600','paid',''],
  ],
};

// ---- Minimal Apps Script service stubs -------------------------------------
const props = { BRIDGE_TOKEN: 'pub-token', BRIDGE_TOKEN_PRIVATE: 'priv-token' };
const cache = new Map();
globalThis.PropertiesService = {
  getScriptProperties: () => ({ getProperty: k => props[k] ?? null })
};
globalThis.CacheService = {
  getScriptCache: () => ({
    get: k => cache.get(k) ?? null,
    put: (k, v) => cache.set(k, v)
  })
};
globalThis.Session = { getScriptTimeZone: () => 'America/Chicago' };
globalThis.Utilities = { formatDate: () => '2026-09-20T03:30:00-05:00' };
globalThis.ContentService = {
  MimeType: { JSON: 'json' },
  createTextOutput: t => ({ setMimeType: () => ({ _body: t }) })
};
function mkSheet(name, grid) {
  return {
    getName: () => name,
    getLastRow: () => grid.length,
    getLastColumn: () => grid[0].length,
    getRange: (r, c, nr, nc) => ({
      getDisplayValues: () => grid.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc))
    })
  };
}
globalThis.SpreadsheetApp = {
  openById: () => ({
    getName: () => 'EDP_MASTER_DATABASE',
    getSheets: () => Object.entries(FIXTURES).map(([n, g]) => mkSheet(n, g)),
    getSheetByName: n => FIXTURES[n] ? mkSheet(n, FIXTURES[n]) : null
  })
};

const { doGet } = new Function(src + "\nreturn { doGet };")();

const call = (p) => JSON.parse(doGet({ parameter: p })._body);
let fails = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  <-- ' + detail}`);
  if (!cond) fails++;
};

console.log('--- auth ---');
check('no token rejected', call({ tab: 'TASKS' }).error === 'Unauthorized');
check('wrong token rejected', call({ tab: 'TASKS', key: 'nope' }).error === 'Unauthorized');
check('?list=1 refused to public token',
  /private token/.test(call({ list: '1', key: 'pub-token' }).error || ''));

console.log('\n--- TASKS filtering ---');
const tPub = call({ tab: 'TASKS', key: 'pub-token' });
const tPriv = call({ tab: 'TASKS', key: 'priv-token' });
check('blank padding rows dropped', tPriv.count === 2, `count=${tPriv.count}`);
check('completed task dropped',
  !tPriv.rows.some(r => r.title === 'Already done thing'));
check('high priority sorted first',
  tPriv.rows[0].priority === 'high', JSON.stringify(tPriv.rows[0]));
check('public scope withholds owner', !('owner' in tPub.rows[0]),
  JSON.stringify(tPub.rows[0]));
check('public scope withholds notes', !('notes' in tPub.rows[0]));
check('private scope includes owner', tPriv.rows[0].owner === 'Taylor');
check('undeclared column never returned (source_id)',
  !('source_id' in tPriv.rows[0]), JSON.stringify(tPriv.rows[0]));

console.log('\n--- BILLS privacy (health + financial) ---');
const bPub = call({ tab: 'BILLS', key: 'pub-token' });
const bPriv = call({ tab: 'BILLS', key: 'priv-token' });
const pubBlob = JSON.stringify(bPub);
check('public payload hides insurer name', !/Blue Cross/.test(pubBlob), pubBlob);
check('public payload hides all amounts', !/919.68/.test(pubBlob) && !/3600/.test(pubBlob));
check('public bills expose zero detailed rows',
  bPub.count === 0 && bPub.rows.length === 0, JSON.stringify(bPub));
check('public bills hide ids, dates, statuses and priority',
  !/B-20260805|2026-08-01|PAST DUE|priority/.test(pubBlob), pubBlob);
check('private payload shows the bill', /Blue Cross/.test(JSON.stringify(bPriv)));

console.log('\n--- PAYROLL is private-only at every field ---');
const pPub = call({ tab: 'PAYROLL', key: 'pub-token' });
check('public payroll returns zero rows',
  pPub.count === 0 && pPub.rows.length === 0, JSON.stringify(pPub));
check('public payroll leaks no pay', !/600/.test(JSON.stringify(pPub)));

console.log('\n--- SCHEDULE ---');
const sPriv = call({ tab: 'SCHEDULE', key: 'priv-token' });
check('inactive employee dropped', sPriv.count === 1, `count=${sPriv.count}`);
check('clock time is display text, not 1899 date',
  sPriv.rows[0].ClockInTime === '8:00:00 AM', sPriv.rows[0].ClockInTime);

console.log('\n--- missing tab degrades, does not throw ---');
const miss = call({ tab: 'PARTS', key: 'priv-token' });
check('missing tab returns BLOCKED', miss.status === 'BLOCKED' && miss.ok === false);
check('missing tab still returns rows array', Array.isArray(miss.rows));

console.log('\n--- health ---');
const h = call({ health: '1', key: 'priv-token' });
check('health lists missing tabs', h.missing_tabs.includes('PARTS'));
check('health reports degraded', h.ok === false);

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
