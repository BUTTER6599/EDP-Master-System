// ============================================================
// CashAllocation.js - Patch C Phase 1 (FOUNDATION ONLY)
// EDP Owner Dashboard - Cash Allocation Engine
//
// SCOPE (Phase 1):
//   - Read-only helper functions.
//   - Tab setup functions (CASH_MOVEMENTS header-only, BUCKET_CONFIG seed).
//   - In-memory test runner (no live writes).
//
// EXPLICITLY OUT OF SCOPE (Phase 1):
//   - No sale allocation writes.
//   - No owner override.
//   - No real opening balances / no money moved.
//   - api_getFinancialProtector() is NOT modified or called here.
//   - No dashboard UI change.
//
// CASH_MOVEMENTS is a foundation/sandbox ledger in Phase 1, NOT the
// live source of truth. BILLS remains the source for rent protected.
//
// ES5 ONLY. No const/let/arrow functions/template literals.
// ============================================================

// Bucket names in protection priority order (1 -> 9).
var CAE_BUCKETS = [
  'Sales Tax Reserve',
  'Payroll Tax Reserve',
  'Rent Reserve',
  'Payroll Reserve',
  'Critical Bills',
  'Emergency Fund',
  'Inventory Buying',
  'Holiday/Future Savings',
  'Free Operating Cash'
];

// EDP financial constants (mirrors FP_CONFIG; kept local for Phase 1 isolation).
var CAE_CONST = {
  salesTaxRate:        0.0975,   // 9.75% (tax-included sale prices)
  payrollTaxWeekly:    225,      // weekly payroll tax target
  rentMonthly:         3600,
  emergencyPhase1:     3600,
  emergencyPhase2:     12000,
  emergencyPhase3:     16000,
  inventoryWeeklyCap:  900,
  normalFloat:         250,
  lockdownFloat:       100,
  slowSeasonMonths:    [8, 9, 10, 11, 12, 1]   // Aug, Sep, Oct, Nov, Dec, Jan
};

var CAE_MOVEMENT_HEADERS = [
  'timestamp', 'movement_id', 'movement_group_id', 'movement_type', 'source_type',
  'source_id', 'bucket', 'amount_debit', 'amount_credit', 'old_balance',
  'new_balance', 'allocation_status', 'reversed_by_movement_id', 'owner_name',
  'owner_pin_verified', 'warning_level', 'emergency_fund_phase', 'is_slow_season',
  'reason', 'notes'
];

var CAE_CONFIG_HEADERS = [
  'priority_order', 'bucket_name', 'fill_rule', 'target_basis', 'weekly_cap',
  'normal_float', 'lockdown_float', 'can_borrow_from', 'slow_season_months',
  'phase_targets', 'description'
];

// ============================================================
// TAB SETUP FUNCTIONS
// CASH_MOVEMENTS: headers only (NO money seeded).
// BUCKET_CONFIG : headers + 9 reference rows (config data, not money).
// ============================================================

function cae_setupCashMovements() {
  var ss = fp_openSheet_();
  if (!ss) { return { ok: false, error: 'Could not open spreadsheet.' }; }

  var sheet = ss.getSheetByName('CASH_MOVEMENTS');
  if (!sheet) {
    sheet = ss.insertSheet('CASH_MOVEMENTS');
  }
  // Header-only repair. Never writes data rows in Phase 1.
  sheet.getRange(1, 1, 1, CAE_MOVEMENT_HEADERS.length).setValues([CAE_MOVEMENT_HEADERS]);

  return {
    ok: true,
    message: 'CASH_MOVEMENTS ready (header-only, no money seeded).',
    headers: CAE_MOVEMENT_HEADERS,
    rowCount: Math.max(0, sheet.getLastRow() - 1)
  };
}

function cae_setupBucketConfig() {
  var ss = fp_openSheet_();
  if (!ss) { return { ok: false, error: 'Could not open spreadsheet.' }; }

  var sheet = ss.getSheetByName('BUCKET_CONFIG');
  if (!sheet) {
    sheet = ss.insertSheet('BUCKET_CONFIG');
  }
  sheet.getRange(1, 1, 1, CAE_CONFIG_HEADERS.length).setValues([CAE_CONFIG_HEADERS]);

  // 9 reference rows (priority order). This is configuration, not money.
  // Columns: priority_order, bucket_name, fill_rule, target_basis, weekly_cap,
  //          normal_float, lockdown_float, can_borrow_from, slow_season_months,
  //          phase_targets, description
  var rows = [
    [1, 'Sales Tax Reserve',      'TAX_INCLUDED', '9.75% on taxable gross', '',  '',  '',  'N', '',              '',                 'Reserve sales tax owed; tax = gross*0.0975/1.0975'],
    [2, 'Payroll Tax Reserve',    'FIXED_WEEKLY', '225/week',                '',  '',  '',  'N', '',              '',                 'Federal/state payroll tax weekly target'],
    [3, 'Rent Reserve',           'GAP_FILL',     'rent gap from BILLS',     '',  '',  '',  'Y', '',              '',                 'Fill to $3,600 monthly; BILLS is source in transition'],
    [4, 'Payroll Reserve',        'WEEKLY_NEED',  'weekly payroll',          '',  '',  '',  'Y', '',              '',                 'Joe priority; Kenneth/Clarence reduced first in RED/LOCKDOWN'],
    [5, 'Critical Bills',         'BILLS_DUE',    'insurance + bills due',   '',  '',  '',  'Y', '',              '',                 'Insurance, utilities, essential services'],
    [6, 'Emergency Fund',         'PHASE_FILL',   '3600 phase 1',            '',  '',  '',  'Y', '',              '3600,12000,16000', 'Survival cushion; phase 1 target $3,600'],
    [7, 'Inventory Buying',       'WEEKLY_CAP',   '900/week',                900, '',  '',  'Y', '8,9,10,11,12,1', '',                 '$0 in LOCKDOWN unless owner override'],
    [8, 'Holiday/Future Savings', 'TARGET_FILL',  'config target',           '',  '',  '',  'Y', '8,9,10,11,12,1', '',                 'Paused in slow season; year-end set-aside'],
    [9, 'Free Operating Cash',    'FLOAT',        'remainder',               '',  250, 100, 'N', '',              '',                 'Float $250 normal / $100 lockdown']
  ];
  sheet.getRange(2, 1, rows.length, CAE_CONFIG_HEADERS.length).setValues(rows);

  return {
    ok: true,
    message: 'BUCKET_CONFIG ready (9 reference rows seeded).',
    headers: CAE_CONFIG_HEADERS,
    rowCount: rows.length
  };
}

// ============================================================
// READ-ONLY HELPERS (Phase 1)
// ============================================================

// Pure core: compute bucket balances from an array of movement rows.
// Each row is an object with at least: bucket, amount_debit, amount_credit.
// Used by fp_readBucketStatus_() (live) and the in-memory test runner.
function cae_computeBalances_(rows) {
  var bal = {};
  var i;
  for (i = 0; i < CAE_BUCKETS.length; i++) {
    bal[CAE_BUCKETS[i]] = 0;
  }
  if (!rows || !rows.length) { return bal; }
  for (i = 0; i < rows.length; i++) {
    var r = rows[i];
    var name = r ? String(r.bucket || '') : '';
    if (!name || typeof bal[name] === 'undefined') { continue; }
    var debit  = parseFloat(r.amount_debit)  || 0;
    var credit = parseFloat(r.amount_credit) || 0;
    bal[name] += (credit - debit);
  }
  return bal;
}

// Read live CASH_MOVEMENTS and return current balance per bucket.
// Returns all-zero balances if the sheet is empty/missing (Phase 1 default).
function fp_readBucketStatus_(ss) {
  try {
    if (!ss) { ss = fp_openSheet_(); }
    if (!ss) { return cae_computeBalances_([]); }
    var sh = ss.getSheetByName('CASH_MOVEMENTS');
    if (!sh) { return cae_computeBalances_([]); }
    var data = sh.getDataRange().getValues();
    if (data.length < 2) { return cae_computeBalances_([]); }
    var h = fp_headers_(data);
    var bCol = h.indexOf('bucket');
    var dCol = h.indexOf('amount_debit');
    var cCol = h.indexOf('amount_credit');
    if (bCol < 0 || dCol < 0 || cCol < 0) { return cae_computeBalances_([]); }
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      rows.push({
        bucket:        data[i][bCol],
        amount_debit:  data[i][dCol],
        amount_credit: data[i][cCol]
      });
    }
    return cae_computeBalances_(rows);
  } catch (e) {
    return cae_computeBalances_([]);
  }
}

// Emergency Fund phase from current balance.
//   < 3600           -> '1'
//   3600 .. < 12000  -> '2'
//   >= 12000         -> '3'
function fp_checkEmergencyFundPhase_(balance) {
  var b = parseFloat(balance) || 0;
  if (b < CAE_CONST.emergencyPhase1) { return '1'; }
  if (b < CAE_CONST.emergencyPhase2) { return '2'; }
  return '3';
}

// Slow season check (Aug, Sep, Oct, Nov, Dec, Jan).
function fp_isSlowSeason_(date) {
  var d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) { return false; }
  var m = d.getMonth() + 1; // 1-12
  for (var i = 0; i < CAE_CONST.slowSeasonMonths.length; i++) {
    if (CAE_CONST.slowSeasonMonths[i] === m) { return true; }
  }
  return false;
}

// Compute each bucket's CURRENT NEED in priority order (waterfall model).
// Pure/read-only: derives needs from a passed-in context object. Does NOT
// read or write sheets, and does NOT move money. Returns an ordered array.
//
// context fields (all optional; safe defaults applied):
//   taxableGross        weekly taxable gross sales (tax-included)
//   payrollTaxReserved  current payroll tax already set aside
//   rentProtected       current rent protected (BILLS) -> default 0
//   rentMonthly         monthly rent (default 3600)
//   weeklyPayrollNeed   weekly payroll still owed
//   billsDue            critical bills/insurance due
//   emergencyBalance    current emergency fund balance
//   holidayTarget       holiday/future weekly target
//   isLockdown          boolean
//   isSlowSeason        boolean
function fp_calculateBucketNeeds_(context) {
  context = context || {};
  var lockdown   = !!context.isLockdown;
  var slow       = !!context.isSlowSeason;

  var taxableGross = parseFloat(context.taxableGross) || 0;
  var salesTaxNeed = taxableGross * CAE_CONST.salesTaxRate / (1 + CAE_CONST.salesTaxRate);

  var payrollTaxReserved = parseFloat(context.payrollTaxReserved) || 0;
  var payrollTaxNeed = Math.max(0, CAE_CONST.payrollTaxWeekly - payrollTaxReserved);

  var rentMonthly   = (typeof context.rentMonthly === 'number') ? context.rentMonthly : CAE_CONST.rentMonthly;
  var rentProtected = parseFloat(context.rentProtected) || 0;
  var rentNeed = Math.max(0, rentMonthly - rentProtected);

  var payrollNeed = Math.max(0, parseFloat(context.weeklyPayrollNeed) || 0);
  var billsNeed   = Math.max(0, parseFloat(context.billsDue) || 0);

  var emergencyBalance = parseFloat(context.emergencyBalance) || 0;
  var emergencyPhase   = fp_checkEmergencyFundPhase_(emergencyBalance);
  // Phase 1 builds toward $3,600; paused in lockdown.
  var emergencyNeed = 0;
  if (!lockdown && emergencyPhase === '1') {
    emergencyNeed = Math.max(0, CAE_CONST.emergencyPhase1 - emergencyBalance);
  }

  // Inventory: weekly cap normally; $0 in lockdown (override handled later, not here).
  var inventoryNeed = lockdown ? 0 : CAE_CONST.inventoryWeeklyCap;

  // Holiday/Future: paused in slow season or lockdown.
  var holidayNeed = (lockdown || slow) ? 0 : Math.max(0, parseFloat(context.holidayTarget) || 0);

  // Free operating cash float.
  var floatNeed = lockdown ? CAE_CONST.lockdownFloat : CAE_CONST.normalFloat;

  var needs = [
    { priority: 1, bucket: 'Sales Tax Reserve',      need: salesTaxNeed,    rule: 'TAX_INCLUDED' },
    { priority: 2, bucket: 'Payroll Tax Reserve',    need: payrollTaxNeed,  rule: 'FIXED_WEEKLY' },
    { priority: 3, bucket: 'Rent Reserve',           need: rentNeed,        rule: 'GAP_FILL' },
    { priority: 4, bucket: 'Payroll Reserve',        need: payrollNeed,     rule: 'WEEKLY_NEED' },
    { priority: 5, bucket: 'Critical Bills',         need: billsNeed,       rule: 'BILLS_DUE' },
    { priority: 6, bucket: 'Emergency Fund',         need: emergencyNeed,   rule: 'PHASE_FILL', phase: emergencyPhase },
    { priority: 7, bucket: 'Inventory Buying',       need: inventoryNeed,   rule: 'WEEKLY_CAP' },
    { priority: 8, bucket: 'Holiday/Future Savings', need: holidayNeed,     rule: 'TARGET_FILL' },
    { priority: 9, bucket: 'Free Operating Cash',    need: floatNeed,       rule: 'FLOAT' }
  ];

  // Round to cents for display stability.
  for (var i = 0; i < needs.length; i++) {
    needs[i].need = Math.round(needs[i].need * 100) / 100;
  }
  return needs;
}

// Read movement history for one bucket (most recent first).
function fp_readBucketHistory_(bucket, limit, ss) {
  try {
    if (!ss) { ss = fp_openSheet_(); }
    if (!ss) { return []; }
    var sh = ss.getSheetByName('CASH_MOVEMENTS');
    if (!sh) { return []; }
    var data = sh.getDataRange().getValues();
    if (data.length < 2) { return []; }
    var h = fp_headers_(data);
    var bCol = h.indexOf('bucket');
    if (bCol < 0) { return []; }
    var want = String(bucket || '').toLowerCase().trim();
    var out = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][bCol] || '').toLowerCase().trim() !== want) { continue; }
      var row = {};
      for (var c = 0; c < h.length; c++) { row[h[c]] = data[i][c]; }
      out.push(row);
    }
    out.reverse(); // most recent last in sheet -> first here
    var n = (typeof limit === 'number' && limit > 0) ? limit : out.length;
    return out.slice(0, n);
  } catch (e) {
    return [];
  }
}

// ============================================================
// TEST RUNNER (Phase 1) - IN-MEMORY ONLY. NO LIVE WRITES.
// Run in Apps Script editor: runPatchCPhase1Test()
// ============================================================

function runPatchCPhase1Test() {
  var results = [];
  function check(name, pass, detail) {
    results.push({ test: name, pass: !!pass, detail: detail || '' });
    Logger.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? (' -- ' + detail) : ''));
  }

  // 1. Bucket balance math (in-memory sample, NOT written to sheet).
  var sample = [
    { bucket: 'Rent Reserve',      amount_debit: 0,   amount_credit: 1500 },
    { bucket: 'Sales Tax Reserve', amount_debit: 0,   amount_credit: 5000 },
    { bucket: 'Inventory Buying',  amount_debit: 0,   amount_credit: 2000 },
    { bucket: 'Inventory Buying',  amount_debit: 500, amount_credit: 0    },
    { bucket: 'Free Operating Cash', amount_debit: 0, amount_credit: 1000 }
  ];
  var bal = cae_computeBalances_(sample);
  check('bucketStatus.RentReserve=1500', bal['Rent Reserve'] === 1500, 'got ' + bal['Rent Reserve']);
  check('bucketStatus.SalesTax=5000', bal['Sales Tax Reserve'] === 5000, 'got ' + bal['Sales Tax Reserve']);
  check('bucketStatus.Inventory=1500 (2000-500)', bal['Inventory Buying'] === 1500, 'got ' + bal['Inventory Buying']);
  check('bucketStatus.Payroll=0 (untouched)', bal['Payroll Reserve'] === 0, 'got ' + bal['Payroll Reserve']);
  var total = 0;
  for (var k in bal) { if (bal.hasOwnProperty(k)) { total += bal[k]; } }
  check('bucketStatus.total=9000', total === 9000, 'got ' + total);

  // 2. Emergency fund phase detection.
  check('phase(2000)="1"', fp_checkEmergencyFundPhase_(2000) === '1', fp_checkEmergencyFundPhase_(2000));
  check('phase(3600)="2"', fp_checkEmergencyFundPhase_(3600) === '2', fp_checkEmergencyFundPhase_(3600));
  check('phase(8000)="2"', fp_checkEmergencyFundPhase_(8000) === '2', fp_checkEmergencyFundPhase_(8000));
  check('phase(12000)="3"', fp_checkEmergencyFundPhase_(12000) === '3', fp_checkEmergencyFundPhase_(12000));
  check('phase(15000)="3"', fp_checkEmergencyFundPhase_(15000) === '3', fp_checkEmergencyFundPhase_(15000));

  // 3. Slow season detection.
  check('slowSeason(Sep 15)=true', fp_isSlowSeason_(new Date(2026, 8, 15)) === true, '');
  check('slowSeason(Jun 15)=false', fp_isSlowSeason_(new Date(2026, 5, 15)) === false, '');
  check('slowSeason(Jan 31)=true', fp_isSlowSeason_(new Date(2026, 0, 31)) === true, '');
  check('slowSeason(Feb 1)=false', fp_isSlowSeason_(new Date(2026, 1, 1)) === false, '');

  // 4. Sales tax included-math (8.88% of fully taxable gross).
  var taxNeed = fp_calculateBucketNeeds_({ taxableGross: 500 })[0].need;
  check('salesTax($500 taxable)~44.42', Math.abs(taxNeed - 44.42) < 0.01, 'got ' + taxNeed);

  // 5. Waterfall needs in LOCKDOWN: emergency/inventory/holiday should be 0,
  //    rent gap should reflect $2,100, float should be $100.
  var lockNeeds = fp_calculateBucketNeeds_({
    taxableGross: 1864,
    payrollTaxReserved: 244,
    rentProtected: 1500,
    rentMonthly: 3600,
    weeklyPayrollNeed: 800,
    billsDue: 0,
    emergencyBalance: 0,
    isLockdown: true,
    isSlowSeason: false
  });
  function needOf(arr, name) {
    for (var i = 0; i < arr.length; i++) { if (arr[i].bucket === name) { return arr[i].need; } }
    return null;
  }
  check('lockdown.RentReserve need=2100', needOf(lockNeeds, 'Rent Reserve') === 2100, 'got ' + needOf(lockNeeds, 'Rent Reserve'));
  check('lockdown.PayrollTax need=0 (244>=225)', needOf(lockNeeds, 'Payroll Tax Reserve') === 0, 'got ' + needOf(lockNeeds, 'Payroll Tax Reserve'));
  check('lockdown.Emergency need=0 (paused)', needOf(lockNeeds, 'Emergency Fund') === 0, 'got ' + needOf(lockNeeds, 'Emergency Fund'));
  check('lockdown.Inventory need=0 (paused)', needOf(lockNeeds, 'Inventory Buying') === 0, 'got ' + needOf(lockNeeds, 'Inventory Buying'));
  check('lockdown.Holiday need=0 (paused)', needOf(lockNeeds, 'Holiday/Future Savings') === 0, 'got ' + needOf(lockNeeds, 'Holiday/Future Savings'));
  check('lockdown.FreeCash float=100', needOf(lockNeeds, 'Free Operating Cash') === 100, 'got ' + needOf(lockNeeds, 'Free Operating Cash'));
  check('lockdown.order is 9 buckets', lockNeeds.length === 9, 'got ' + lockNeeds.length);

  // 6. Normal-season needs: emergency phase 1 fills toward 3600, float 250.
  var normNeeds = fp_calculateBucketNeeds_({
    taxableGross: 2500,
    emergencyBalance: 1000,
    isLockdown: false,
    isSlowSeason: false
  });
  check('normal.Emergency need=2600 (3600-1000)', needOf(normNeeds, 'Emergency Fund') === 2600, 'got ' + needOf(normNeeds, 'Emergency Fund'));
  check('normal.Inventory cap=900', needOf(normNeeds, 'Inventory Buying') === 900, 'got ' + needOf(normNeeds, 'Inventory Buying'));
  check('normal.FreeCash float=250', needOf(normNeeds, 'Free Operating Cash') === 250, 'got ' + needOf(normNeeds, 'Free Operating Cash'));

  var passed = 0;
  for (var i = 0; i < results.length; i++) { if (results[i].pass) { passed++; } }
  var summary = passed + '/' + results.length + ' tests passed';
  Logger.log('=== PATCH C PHASE 1 TEST: ' + summary + ' ===');

  return { ok: passed === results.length, summary: summary, results: results };
}

// Read-only live check: confirms helpers run against the live (empty) ledger
// and that the live Financial Protector API is unaffected. NO writes.
function runPatchCPhase1LiveCheck() {
  var out = {};
  try {
    out.bucketStatus = fp_readBucketStatus_();          // expect all zeros in Phase 1
  } catch (e) { out.bucketStatusError = String(e); }
  try {
    var fp = api_getFinancialProtector();
    out.financialProtectorOk = !!(fp && fp.ok);          // expect true (unchanged)
    out.rentStatusSource = fp && fp.rentStatus ? fp.rentStatus.source : null;
    out.rentFundBalance  = fp && fp.rentStatus ? fp.rentStatus.fundBalance : null;
  } catch (e) { out.financialProtectorError = String(e); }
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
