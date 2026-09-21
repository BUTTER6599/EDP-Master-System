import process from 'node:process';

const base = (process.env.EDP_BRIDGE_BASE_URL || '').replace(/\/$/, '');
const token = process.env.BRIDGE_PUBLIC_TOKEN || '';

if (!base) {
  console.error('Missing EDP_BRIDGE_BASE_URL');
  process.exit(1);
}
if (!token) {
  console.log('SKIP runtime smoke: BRIDGE_PUBLIC_TOKEN is not configured yet.');
  process.exit(0);
}

const forbidden = new Set([
  'EmployeeID','Name','ClockInTime','ClockOutTime','Message',
  'cost','price','notes','amount_due','fund_balance','bill_name',
  'updated_by','employee','hours','rate','gross_pay','vendor','item',
  'amount','payment_type','entered_by','invoice_number','model','serial',
  'list_price','cost_basis','problem_description','diagnostic_notes',
  'diagnostic_quote','final_cost','completed_by','expected_repair_hours'
]);

function assert(cond, msg, detail='') {
  if (!cond) {
    console.error('FAIL', msg, detail);
    process.exitCode = 1;
  } else {
    console.log('PASS', msg);
  }
}

function keysOnly(rows, allowed) {
  return rows.every(row => Object.keys(row).every(k => allowed.has(k)));
}

async function fetchJson(params, attempts=5) {
  const u = new URL(base);
  u.searchParams.set('key', token);
  for (const [k,v] of Object.entries(params)) u.searchParams.set(k, v);

  let lastErr;
  for (let i=1;i<=attempts;i++) {
    try {
      const res = await fetch(u, { redirect: 'follow' });
      const text = await res.text();
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0,300));
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      if (i < attempts) await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw lastErr;
}

function noForbidden(obj) {
  const stack=[obj];
  while (stack.length) {
    const cur=stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    for (const [k,v] of Object.entries(cur)) {
      if (forbidden.has(k)) return {ok:false,key:k};
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return {ok:true};
}

console.log('--- deployed runtime smoke ---');

const health = await fetchJson({health:'1'});
assert(health.ok === true, 'public health ok', JSON.stringify(health));
assert(health.scope === 'public', 'public health scope');
assert(Array.isArray(health.missing_tabs) && health.missing_tabs.length === 0,
  'no configured tabs missing', JSON.stringify(health.missing_tabs));

const tasks = await fetchJson({tab:'TASKS'});
assert(tasks.ok === true && tasks.scope === 'public', 'TASKS public endpoint ok');
assert(keysOnly(tasks.rows || [], new Set([
  'task_id','title','category','status','priority','due_date','list','next_action'
])), 'TASKS exposes only approved public fields', JSON.stringify(tasks.rows));
assert(noForbidden(tasks).ok, 'TASKS contains no forbidden private fields');

const schedule = await fetchJson({tab:'SCHEDULE'});
assert(schedule.ok === true && schedule.scope === 'public', 'SCHEDULE public endpoint ok');
assert(keysOnly(schedule.rows || [], new Set(['DayOfWeek','Active'])),
  'SCHEDULE exposes only DayOfWeek + Active', JSON.stringify(schedule.rows));
assert(noForbidden(schedule).ok, 'SCHEDULE contains no forbidden private fields');

const kiosk = await fetchJson({tab:'KIOSK'});
assert(kiosk.ok === true && kiosk.scope === 'public', 'KIOSK public endpoint ok');
assert(keysOnly(kiosk.rows || [], new Set(['Timestamp','Direction','Read'])),
  'KIOSK exposes only Timestamp + Direction + Read', JSON.stringify(kiosk.rows));
assert(noForbidden(kiosk).ok, 'KIOSK contains no forbidden private fields');

const parts = await fetchJson({tab:'PARTS'});
assert(parts.ok === true && parts.scope === 'public', 'PARTS public endpoint ok');
assert(keysOnly(parts.rows || [], new Set(['part_id','name','category','quantity','brand','condition'])),
  'PARTS exposes only approved public stock fields', JSON.stringify(parts.rows));
assert((parts.rows || []).every(r => Number(r.quantity || 0) <= 2),
  'PARTS runtime filter keeps quantity <= 2', JSON.stringify(parts.rows));
assert(noForbidden(parts).ok, 'PARTS contains no forbidden private fields');

const purchases = await fetchJson({tab:'PURCHASES'});
assert(purchases.ok === true && purchases.scope === 'public', 'PURCHASES public endpoint ok');
assert(keysOnly(purchases.rows || [], new Set(['purchase_id','purchase_date','category','status'])),
  'PURCHASES exposes only approved public fields', JSON.stringify(purchases.rows));
assert(noForbidden(purchases).ok, 'PURCHASES contains no forbidden private fields');

const sales = await fetchJson({tab:'SALES'});
assert(sales.ok === true && sales.scope === 'public', 'SALES public endpoint ok');
assert(keysOnly(sales.rows || [], new Set(['sale_id','sale_date','category'])),
  'SALES exposes only approved public fields', JSON.stringify(sales.rows));
assert(noForbidden(sales).ok, 'SALES contains no forbidden private fields');

const inventory = await fetchJson({tab:'INVENTORY'});
assert(inventory.ok === true && inventory.scope === 'public', 'INVENTORY public endpoint ok');
assert(keysOnly(inventory.rows || [], new Set(['item_id','category','brand','stage','status','days_on_hand'])),
  'INVENTORY exposes only approved public fields', JSON.stringify(inventory.rows));
assert((inventory.rows || []).every(r => !['sold','removed','archived'].includes(String(r.status || '').toLowerCase())),
  'INVENTORY runtime excludes sold/removed/archived rows', JSON.stringify(inventory.rows));
assert(noForbidden(inventory).ok, 'INVENTORY contains no forbidden private fields');

const repairs = await fetchJson({tab:'REPAIRS'});
assert(repairs.ok === true && repairs.scope === 'public', 'REPAIRS public endpoint ok');
assert(keysOnly(repairs.rows || [], new Set([
  'ticket_id','created_at','intake_type','category','brand','drop_off_date','status','expected_out_date'
])), 'REPAIRS exposes only approved public fields', JSON.stringify(repairs.rows));
assert(noForbidden(repairs).ok, 'REPAIRS contains no forbidden private fields');

const bills = await fetchJson({tab:'BILLS'});
assert(bills.ok === true && bills.count === 0 && Array.isArray(bills.rows) && bills.rows.length === 0,
  'BILLS public endpoint returns zero detail', JSON.stringify(bills));

const payroll = await fetchJson({tab:'PAYROLL'});
assert(payroll.ok === true && payroll.count === 0 && Array.isArray(payroll.rows) && payroll.rows.length === 0,
  'PAYROLL public endpoint returns zero detail', JSON.stringify(payroll));

if (process.exitCode) process.exit(process.exitCode);
console.log('ALL DEPLOYED RUNTIME SMOKE CHECKS PASSED');

// Secret-activation verification trigger: 2026-09-20
