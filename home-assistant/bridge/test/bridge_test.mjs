// Harness: run the real Code.gs against real rows from EDP_MASTER_DATABASE.
import fs from 'node:fs';

const src = fs.readFileSync('home-assistant/bridge/Code.gs', 'utf8');

// Fixtures mirror verified EDP_MASTER_DATABASE schemas. Sensitive/private
// example values are synthetic so staff/customer/business details are not
// committed to the repository.
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
    ['EMP-A','Employee A','MON','8:00:00 AM','5:00:00 PM','TRUE'],
    ['EMP-OLD','Former Employee','MON','8:00:00 AM','5:00:00 PM','FALSE'],
  ],
  KIOSK_MESSAGES: [
    ['Timestamp','EmployeeID','Name','Direction','Message','Read'],
    ['9/20/2026 10:00:00','EMP-A','Employee A','TO_TAYLOR','Synthetic private message','FALSE'],
    ['9/20/2026 09:00:00','EMP-B','Employee B','TO_TAYLOR','Already read synthetic message','TRUE'],
  ],
  PARTS: [
    ['part_id','name','category','brand','model','cost','price','quantity','notes','photo_links','condition'],
    ['PART-LOW-001','Low Stock Test Part','TEST PART','Test Brand','MODEL-PRIVATE','10.00','20.00','1','Synthetic private note','','USED'],
    ['PART-OK-001','Adequate Stock Test Part','TEST PART','Test Brand','MODEL-PRIVATE','11.00','21.00','4','Synthetic private note','','NEW'],
    ['PART-OUT-001','Out of Stock Test Part','TEST PART','','MODEL-PRIVATE','12.00','22.00','0','Synthetic private note','',''],
  ],
  PURCHASES: [
    ['purchase_id','timestamp','purchase_date','week_id','vendor','item','category','cost','status','notes'],
    ['PUR-001','9/20/2026 10:00','9/20/2026','2026-09-15','Private Vendor','Private Item','Appliance','100','PAID','Synthetic private note'],
  ],
  SALES: [
    ['sale_id','timestamp','sale_date','week_id','amount','category','payment_type','notes','entered_by','invoice_number'],
    ['SALE-001','9/20/2026 11:00','9/20/2026','2026-09-15','295','Appliance Sale','Cash','Synthetic private sale note','EMP-A','INV-PRIVATE'],
  ],
  APPLIANCES: [
    ['item_id','category','brand','model','serial','condition','list_price','cost_basis','stage','status','days_on_hand'],
    ['INV-ACTIVE-001','Washer','Test Brand','MODEL-PRIVATE','SERIAL-PRIVATE','Used','295','100','FLOOR_READY','AVAILABLE','10'],
    ['INV-NOTREADY-001','Dryer','Test Brand','MODEL-PRIVATE-2','SERIAL-PRIVATE-2','Used','195','50','RECEIVED','NOT_READY','2'],
    ['INV-SOLD-001','Stove','Test Brand','MODEL-SOLD','SERIAL-SOLD','Used','265','80','FLOOR_READY','SOLD','30'],
  ],
  REPAIR_TICKETS: [
    ['ticket_id','created_at','created_by','intake_type','category','brand','model','serial','customer_name','customer_phone_1','customer_email','problem_description','diagnostic_notes','drop_off_date','notes','status','diagnostic_quote','final_cost','completed_at','completed_by','expected_out_date','expected_repair_hours'],
    ['REP-OPEN-001','2026-09-20','EMP-A','REPAIR','Washer','Test Brand','MODEL-PRIVATE','SERIAL-PRIVATE','Private Customer','555-0100','private@example.com','Private problem','Private diagnostic','2026-09-20','Private note','DIAGNOSING','40','','','','2026-09-22','1.5'],
    ['REP-CLOSED-001','2026-09-19','EMP-A','REPAIR','Dryer','Test Brand','MODEL-CLOSED','SERIAL-CLOSED','Closed Customer','555-0101','','Private problem','Private diagnostic','2026-09-19','Private note','CLOSED','40','120','2026-09-20','EMP-A','','2'],
  ],
  PAYROLL: [
    ['payroll_id','week_id','employee','hours','rate','gross_pay','status','notes'],
    ['P-001','2026-09-01','Employee A','40','15','600','paid',''],
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

console.log('\n--- SCHEDULE privacy + display values ---');
const sPub = call({ tab: 'SCHEDULE', key: 'pub-token' });
const sPriv = call({ tab: 'SCHEDULE', key: 'priv-token' });
check('inactive employee dropped', sPriv.count === 1, `count=${sPriv.count}`);
check('clock time is display text, not 1899 date',
  sPriv.rows[0].ClockInTime === '8:00:00 AM', sPriv.rows[0].ClockInTime);
check('public schedule exposes day + active only',
  Object.keys(sPub.rows[0]).sort().join(',') === 'Active,DayOfWeek',
  JSON.stringify(sPub.rows[0]));
check('public schedule hides employee identity and times',
  !/Employee A|EMP-A|8:00:00 AM|5:00:00 PM/.test(JSON.stringify(sPub)),
  JSON.stringify(sPub));

console.log('\n--- KIOSK unread filtering + privacy ---');
const kPub = call({ tab: 'KIOSK', key: 'pub-token' });
const kPriv = call({ tab: 'KIOSK', key: 'priv-token' });
check('read kiosk messages are dropped', kPriv.count === 1, `count=${kPriv.count}`);
check('private kiosk retains message body',
  kPriv.rows[0].Message === 'Synthetic private message', JSON.stringify(kPriv.rows[0]));
check('public kiosk hides employee identity and message body',
  !/Employee A|EMP-A|Synthetic private message/.test(JSON.stringify(kPub)),
  JSON.stringify(kPub));
check('public kiosk retains operational envelope',
  kPub.rows[0].Direction === 'TO_TAYLOR' && kPub.rows[0].Read === 'FALSE',
  JSON.stringify(kPub.rows[0]));

console.log('\n--- PARTS low-stock filtering + privacy ---');
const partsPub = call({ tab: 'PARTS', key: 'pub-token' });
const partsPriv = call({ tab: 'PARTS', key: 'priv-token' });
check('parts endpoint keeps only quantity <= 2',
  partsPriv.count === 2 && !partsPriv.rows.some(r => r.part_id === 'PART-OK-001'),
  JSON.stringify(partsPriv.rows));
check('public parts hides cost/price/notes',
  !/10.00|20.00|Synthetic private note/.test(JSON.stringify(partsPub)),
  JSON.stringify(partsPub));
check('public parts retains operational stock fields',
  partsPub.rows.some(r => r.part_id === 'PART-LOW-001' && r.quantity === '1'),
  JSON.stringify(partsPub.rows));

console.log('\n--- PURCHASES privacy ---');
const purchasesPub = call({ tab: 'PURCHASES', key: 'pub-token' });
const purchasesPriv = call({ tab: 'PURCHASES', key: 'priv-token' });
check('public purchases expose operational fields only',
  Object.keys(purchasesPub.rows[0]).sort().join(',') === 'category,purchase_date,purchase_id,status',
  JSON.stringify(purchasesPub.rows[0]));
check('public purchases hide vendor/item/cost/notes',
  !/Private Vendor|Private Item|100|Synthetic private note/.test(JSON.stringify(purchasesPub)),
  JSON.stringify(purchasesPub));
check('private purchases retain vendor and cost',
  purchasesPriv.rows[0].vendor === 'Private Vendor' && purchasesPriv.rows[0].cost === '100');

console.log('\n--- SALES privacy ---');
const salesPub = call({ tab: 'SALES', key: 'pub-token' });
const salesPriv = call({ tab: 'SALES', key: 'priv-token' });
check('public sales expose id/date/category only',
  Object.keys(salesPub.rows[0]).sort().join(',') === 'category,sale_date,sale_id',
  JSON.stringify(salesPub.rows[0]));
check('public sales hide money/payment/staff/invoice/notes',
  !/295|Cash|EMP-A|INV-PRIVATE|Synthetic private sale note/.test(JSON.stringify(salesPub)),
  JSON.stringify(salesPub));
check('private sales retain amount', salesPriv.rows[0].amount === '295');

console.log('\n--- INVENTORY active filter + privacy ---');
const inventoryPub = call({ tab: 'INVENTORY', key: 'pub-token' });
const inventoryPriv = call({ tab: 'INVENTORY', key: 'priv-token' });
check('sold inventory is excluded from operational count',
  inventoryPriv.count === 2 && !inventoryPriv.rows.some(r => r.item_id === 'INV-SOLD-001'),
  JSON.stringify(inventoryPriv.rows));
check('public inventory hides model/serial/prices',
  !/MODEL-PRIVATE|SERIAL-PRIVATE|295|100/.test(JSON.stringify(inventoryPub)),
  JSON.stringify(inventoryPub));
check('public inventory retains operational status',
  inventoryPub.rows.some(r => r.item_id === 'INV-ACTIVE-001' && r.status === 'AVAILABLE'));

console.log('\n--- REPAIRS open filter + PII privacy ---');
const repairsPub = call({ tab: 'REPAIRS', key: 'pub-token' });
const repairsPriv = call({ tab: 'REPAIRS', key: 'priv-token' });
check('closed repair tickets are excluded',
  repairsPriv.count === 1 && repairsPriv.rows[0].ticket_id === 'REP-OPEN-001',
  JSON.stringify(repairsPriv.rows));
check('public repairs hide model/serial/diagnosis/money',
  !/MODEL-PRIVATE|SERIAL-PRIVATE|Private problem|Private diagnostic|40/.test(JSON.stringify(repairsPub)),
  JSON.stringify(repairsPub));
check('customer PII is never returned even privately',
  !/Private Customer|555-0100|private@example.com/.test(JSON.stringify(repairsPriv)),
  JSON.stringify(repairsPriv));

console.log('\n--- health ---');
const h = call({ health: '1', key: 'priv-token' });
check('health finds every configured fixture-backed tab',
  h.ok === true && h.missing_tabs.length === 0, JSON.stringify(h.missing_tabs));

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
