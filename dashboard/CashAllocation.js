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

// ============================================================
// PATCH C PHASE 2A - DRY-RUN / READ-ONLY (NO LIVE WRITES)
//
// SCOPE (2A):
//   - Category tax mapping + taxable-portion helper.
//   - Pure sale allocation builder (tax off-the-top, then waterfall).
//   - Duplicate-check helpers (pure core + sheet-reading wrapper).
//   - Reconciliation report (read-only).
//   - Read-only single-sale preview from the live SALES tab.
//   - Dry-run test runner (no writes).
//
// EXPLICITLY OUT OF SCOPE (2A):
//   - NO real CASH_MOVEMENTS rows written.
//   - NO Rent Reserve seeding.
//   - NO historical backfill.
//   - NO api_addSale hook.
//   - api_getFinancialProtector() NOT modified.
//   - No dashboard change. No deploy.
// ============================================================

// Category -> taxable? (approved mapping). Other/blank = taxable + flag.
function cae_categoryTaxInfo_(category) {
  var c = String(category || '').toLowerCase().trim();
  if (c === 'appliance sale') { return { taxable: true,  flagged: false }; }
  if (c === 'parts')          { return { taxable: true,  flagged: false }; }
  if (c === 'repair')         { return { taxable: false, flagged: false }; }
  if (c === 'delivery')       { return { taxable: false, flagged: false }; }
  if (c === 'warranty')       { return { taxable: false, flagged: false }; }
  // 'other', blank, or anything unrecognized -> taxable + flagged for review.
  return { taxable: true, flagged: true };
}

// Taxable portion of a sale (whole-sale, single category in Phase 2A).
function cae_taxablePortion_(category, amount) {
  var amt = parseFloat(amount) || 0;
  var info = cae_categoryTaxInfo_(category);
  return info.taxable ? amt : 0;
}

function cae_round2_(n) { return Math.round((parseFloat(n) || 0) * 100) / 100; }

// Pure builder: compute the allocation rows for one sale.
//   sale           : { sale_id, amount, category, sale_date }
//   bucketBalances : current ledger balances (object keyed by bucket name)
//   context        : planning inputs (rentProtected, rentMonthly, weeklyPayrollNeed,
//                    billsDue, holidayTarget, isLockdown, isSlowSeason)
// Returns: { ok, sale_id, amount, taxablePortion, taxReserve, flaggedForReview,
//            rows:[{bucket, amount_credit, old_balance, new_balance, priority}],
//            sumCredits, balances, error }
// PURE: reads/writes no sheets, moves no money.
function cae_buildSaleAllocation_(sale, bucketBalances, context) {
  sale = sale || {};
  context = context || {};
  bucketBalances = bucketBalances || {};

  var amount = parseFloat(sale.amount) || 0;
  if (amount <= 0) {
    return { ok: false, error: 'Sale amount must be greater than 0.', sale_id: sale.sale_id || null };
  }

  function bal(name) { return parseFloat(bucketBalances[name]) || 0; }

  var taxInfo = cae_categoryTaxInfo_(sale.category);
  var taxablePortion = taxInfo.taxable ? amount : 0;
  var taxReserve = cae_round2_(taxablePortion * CAE_CONST.salesTaxRate / (1 + CAE_CONST.salesTaxRate));

  var lockdown = !!context.isLockdown;
  var slow     = !!context.isSlowSeason;

  // Current needs for buckets 2..8 (priority order), using current balances/targets.
  var rentMonthly   = (typeof context.rentMonthly === 'number') ? context.rentMonthly : CAE_CONST.rentMonthly;
  var rentProtected = parseFloat(context.rentProtected) || 0;   // BILLS during transition

  var emergencyBalance = bal('Emergency Fund');
  var emergencyPhase   = fp_checkEmergencyFundPhase_(emergencyBalance);
  var emergencyTarget  = (!lockdown && emergencyPhase === '1')
                           ? Math.max(0, CAE_CONST.emergencyPhase1 - emergencyBalance) : 0;

  // Ordered fill list (priority 2..8). need = remaining target for that bucket.
  var fillOrder = [
    { priority: 2, bucket: 'Payroll Tax Reserve', need: Math.max(0, CAE_CONST.payrollTaxWeekly - bal('Payroll Tax Reserve')) },
    { priority: 3, bucket: 'Rent Reserve',        need: Math.max(0, rentMonthly - rentProtected) },
    { priority: 4, bucket: 'Payroll Reserve',     need: Math.max(0, (parseFloat(context.weeklyPayrollNeed) || 0) - bal('Payroll Reserve')) },
    { priority: 5, bucket: 'Critical Bills',      need: Math.max(0, (parseFloat(context.billsDue) || 0) - bal('Critical Bills')) },
    { priority: 6, bucket: 'Emergency Fund',      need: emergencyTarget },
    { priority: 7, bucket: 'Inventory Buying',    need: lockdown ? 0 : Math.max(0, CAE_CONST.inventoryWeeklyCap - bal('Inventory Buying')) },
    { priority: 8, bucket: 'Holiday/Future Savings', need: (lockdown || slow) ? 0 : Math.max(0, parseFloat(context.holidayTarget) || 0) }
  ];

  var rows = [];
  var working = {};   // track running balances for old/new stamping
  var i, name;
  for (i = 0; i < CAE_BUCKETS.length; i++) { working[CAE_BUCKETS[i]] = bal(CAE_BUCKETS[i]); }

  function addRow(priority, bucket, credit) {
    credit = cae_round2_(credit);
    if (credit <= 0) { return; }
    var old = working[bucket];
    var nw  = cae_round2_(old + credit);
    working[bucket] = nw;
    rows.push({ priority: priority, bucket: bucket, amount_credit: credit, old_balance: cae_round2_(old), new_balance: nw });
  }

  // 1) Sales tax off the top.
  if (taxReserve > 0) { addRow(1, 'Sales Tax Reserve', taxReserve); }

  // 2) Waterfall the remainder through priority 2..8.
  var remaining = cae_round2_(amount - taxReserve);
  for (i = 0; i < fillOrder.length && remaining > 0; i++) {
    var give = Math.min(remaining, fillOrder[i].need);
    give = cae_round2_(give);
    if (give > 0) {
      addRow(fillOrder[i].priority, fillOrder[i].bucket, give);
      remaining = cae_round2_(remaining - give);
    }
  }

  // 3) Anything left -> Free Operating Cash.
  if (remaining > 0) { addRow(9, 'Free Operating Cash', remaining); }

  // Assert conservation: sum of credits must equal the sale amount.
  var sumCredits = 0;
  for (i = 0; i < rows.length; i++) { sumCredits = cae_round2_(sumCredits + rows[i].amount_credit); }
  if (Math.abs(sumCredits - amount) > 0.01) {
    return { ok: false, error: 'Allocation does not balance: sum ' + sumCredits + ' != amount ' + amount,
             sale_id: sale.sale_id || null, rows: rows, sumCredits: sumCredits };
  }

  return {
    ok: true,
    sale_id: sale.sale_id || null,
    amount: amount,
    category: sale.category || '',
    taxablePortion: cae_round2_(taxablePortion),
    taxReserve: taxReserve,
    flaggedForReview: taxInfo.flagged,
    rows: rows,
    sumCredits: sumCredits,
    balances: working
  };
}

// Pure core: is this sale_id already allocated within an array of ledger rows?
function cae_saleAllocatedIn_(rows, sale_id) {
  if (!rows || !rows.length) { return false; }
  var want = String(sale_id || '');
  if (!want) { return false; }
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r) { continue; }
    if (String(r.movement_type) === 'SALE_ALLOCATION' &&
        String(r.source_type) === 'SALE' &&
        String(r.source_id) === want &&
        String(r.allocation_status) === 'ALLOCATED') {
      return true;
    }
  }
  return false;
}

// Read-only wrapper: duplicate check against the live CASH_MOVEMENTS tab.
function cae_isSaleAllocated_(ss, sale_id) {
  try {
    if (!ss) { ss = fp_openSheet_(); }
    if (!ss) { return false; }
    var sh = ss.getSheetByName('CASH_MOVEMENTS');
    if (!sh) { return false; }
    var data = sh.getDataRange().getValues();
    if (data.length < 2) { return false; }
    var h = fp_headers_(data);
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var row = {};
      for (var c = 0; c < h.length; c++) { row[h[c]] = data[i][c]; }
      rows.push(row);
    }
    return cae_saleAllocatedIn_(rows, sale_id);
  } catch (e) { return false; }
}

// Read-only reconciliation report. Compares ledger bucket totals vs physical
// cash (CASH_POSITION) and flags over-allocation. Writes nothing.
function fp_reconcileBuckets_(ss) {
  try {
    if (!ss) { ss = fp_openSheet_(); }
    var balances = fp_readBucketStatus_(ss);
    var ledgerTotal = 0;
    for (var k in balances) { if (balances.hasOwnProperty(k)) { ledgerTotal += balances[k]; } }
    ledgerTotal = cae_round2_(ledgerTotal);

    var phys = ss ? fp_readLatestCash_(ss) : null;
    var physAvailable = (phys && typeof phys.cashAvailable === 'number') ? phys.cashAvailable : null;

    // BILLS rent protected (transition mirror).
    var billsRent = null;
    var liveBills = ss ? fp_readBills_(ss) : null;
    if (liveBills) {
      for (var i = 0; i < liveBills.length; i++) {
        if (String(liveBills[i].name).toLowerCase().indexOf('rent') >= 0) {
          billsRent = liveBills[i].fundBalance; break;
        }
      }
    }

    var overAllocated = (physAvailable !== null) && (ledgerTotal > physAvailable + 0.01);

    return {
      ok: true,
      ledgerBucketTotal: ledgerTotal,
      buckets: balances,
      physicalCashAvailable: physAvailable,
      billsRentProtected: billsRent,
      overAllocated: overAllocated,
      note: 'Phase 2A: ledger expected to be $0 (nothing seeded). BILLS remains rent source of truth.'
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Read-only preview for one real sale from the SALES tab. Writes nothing.
// contextOverride may supply weeklyPayrollNeed, billsDue, isLockdown, etc.
function api_previewSaleAllocation(sale_id, contextOverride) {
  try {
    var ss = fp_openSheet_();
    if (!ss) { return { ok: false, error: 'Could not open spreadsheet.' }; }
    var sh = ss.getSheetByName('SALES');
    if (!sh) { return { ok: false, error: 'SALES tab not found.' }; }
    var data = sh.getDataRange().getValues();
    if (data.length < 2) { return { ok: false, error: 'SALES is empty.' }; }
    var h = fp_headers_(data);
    var idCol = h.indexOf('sale_id');
    var amtCol = h.indexOf('amount');
    var catCol = h.indexOf('category');
    var dCol = h.indexOf('sale_date');
    if (idCol < 0 || amtCol < 0) { return { ok: false, error: 'SALES missing sale_id/amount columns.' }; }

    var want = String(sale_id || '');
    var sale = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === want) {
        sale = {
          sale_id:  data[i][idCol],
          amount:   data[i][amtCol],
          category: catCol >= 0 ? data[i][catCol] : '',
          sale_date: dCol >= 0 ? data[i][dCol] : ''
        };
        break;
      }
    }
    if (!sale) { return { ok: false, error: 'sale_id not found: ' + want }; }

    var balances = fp_readBucketStatus_(ss);
    var saleDate = (sale.sale_date instanceof Date) ? sale.sale_date : new Date();

    // LIVE context from the SAME single source the dashboard renders from.
    var fp;
    try { fp = api_getFinancialProtector(); } catch (e2) { fp = { ok: false }; }
    var live = cae_buildLiveContext_(fp, saleDate);

    // Fallback only if Financial Protector is unavailable: read rent protected
    // straight from BILLS so rent gap is never silently lost.
    if (!live.financialProtectorOk) {
      var liveBills = fp_readBills_(ss);
      if (liveBills) {
        for (var b = 0; b < liveBills.length; b++) {
          if (String(liveBills[b].name).toLowerCase().indexOf('rent') >= 0) {
            live.context.rentProtected = parseFloat(liveBills[b].fundBalance) || 0; break;
          }
        }
      }
    }

    // contextOverride (optional) overrides individual fields - used by tests only.
    var context = cae_mergeContext_(live.context, contextOverride);

    var preview = cae_buildSaleAllocation_(sale, balances, context);
    var alreadyAllocated = cae_isSaleAllocated_(ss, want);

    // Rent gap cross-check: builder's rent need vs dashboard rentProtection.shortfall.
    var builderRentGap = Math.max(0, (context.rentMonthly || 0) - (context.rentProtected || 0));
    builderRentGap = cae_round2_(builderRentGap);
    var rentGapCrossCheck = {
      builderRentGap: builderRentGap,
      rentProtectionShortfall: live.rentGapFromFp,
      match: (live.rentGapFromFp === null) ? null : (Math.abs(builderRentGap - live.rentGapFromFp) < 0.01)
    };

    return {
      ok: true,
      dryRun: true,
      wroteRows: false,
      financialProtectorOk: live.financialProtectorOk,
      alreadyAllocated: alreadyAllocated,
      contextUsed: context,
      rentGapCrossCheck: rentGapCrossCheck,
      preview: preview
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ============================================================
// PHASE 2A DRY-RUN TEST RUNNER - NO LIVE WRITES.
// Run in Apps Script editor: runPatchCPhase2Test()
// ============================================================
function runPatchCPhase2Test() {
  var results = [];
  function check(name, pass, detail) {
    results.push({ test: name, pass: !!pass, detail: detail || '' });
    Logger.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? (' -- ' + detail) : ''));
  }
  function needOf(arr, name) {
    for (var i = 0; i < arr.length; i++) { if (arr[i].bucket === name) { return arr[i].amount_credit; } }
    return 0;
  }

  // Category tax mapping.
  check('tax: Appliance Sale = taxable', cae_categoryTaxInfo_('Appliance Sale').taxable === true, '');
  check('tax: Parts = taxable', cae_categoryTaxInfo_('Parts').taxable === true, '');
  check('tax: Repair = non-taxable', cae_categoryTaxInfo_('Repair').taxable === false, '');
  check('tax: Delivery = non-taxable', cae_categoryTaxInfo_('Delivery').taxable === false, '');
  check('tax: Warranty = non-taxable', cae_categoryTaxInfo_('Warranty').taxable === false, '');
  check('tax: Other = taxable+flagged', cae_categoryTaxInfo_('Other').taxable === true && cae_categoryTaxInfo_('Other').flagged === true, '');
  check('tax: blank = taxable+flagged', cae_categoryTaxInfo_('').taxable === true && cae_categoryTaxInfo_('').flagged === true, '');

  // Empty ledger + lockdown context (matches current dashboard reality).
  var emptyBal = cae_computeBalances_([]);
  var ctx = { rentProtected: 1500, rentMonthly: 3600, weeklyPayrollNeed: 800, billsDue: 0,
              isLockdown: true, isSlowSeason: false };

  // Example 1: $395 Appliance Sale (taxable).
  var a = cae_buildSaleAllocation_({ sale_id: 'S-TEST-APP', amount: 395, category: 'Appliance Sale' }, emptyBal, ctx);
  check('app: ok', a.ok === true, a.error || '');
  check('app: sum==395', a.sumCredits === 395, 'got ' + a.sumCredits);
  check('app: taxReserve==35.09', a.taxReserve === 35.09, 'got ' + a.taxReserve);
  check('app: not flagged', a.flaggedForReview === false, '');

  // Example 2: $25 Parts (taxable).
  var p = cae_buildSaleAllocation_({ sale_id: 'S-TEST-PARTS', amount: 25, category: 'Parts' }, emptyBal, ctx);
  check('parts: ok', p.ok === true, p.error || '');
  check('parts: sum==25', p.sumCredits === 25, 'got ' + p.sumCredits);
  check('parts: taxReserve==2.22', p.taxReserve === 2.22, 'got ' + p.taxReserve);

  // Example 3: $120 Delivery (non-taxable).
  var d = cae_buildSaleAllocation_({ sale_id: 'S-TEST-DEL', amount: 120, category: 'Delivery' }, emptyBal, ctx);
  check('del: ok', d.ok === true, d.error || '');
  check('del: sum==120', d.sumCredits === 120, 'got ' + d.sumCredits);
  check('del: taxReserve==0', d.taxReserve === 0, 'got ' + d.taxReserve);
  check('del: SalesTax row absent', needOf(d.rows, 'Sales Tax Reserve') === 0, '');

  // Duplicate detection (pure core, in-memory).
  var ledger = [
    { movement_type: 'SALE_ALLOCATION', source_type: 'SALE', source_id: 'S-DUP-1', allocation_status: 'ALLOCATED' }
  ];
  check('dup: existing sale detected', cae_saleAllocatedIn_(ledger, 'S-DUP-1') === true, '');
  check('dup: new sale not detected', cae_saleAllocatedIn_(ledger, 'S-NEW-9') === false, '');
  check('dup: reallocated not counted', cae_saleAllocatedIn_(
    [{ movement_type: 'SALE_ALLOCATION', source_type: 'SALE', source_id: 'S-R', allocation_status: 'REALLOCATED' }], 'S-R') === false, '');

  // Conservation across a spread of amounts/categories.
  var cats = ['Appliance Sale', 'Parts', 'Repair', 'Delivery', 'Warranty', 'Other', ''];
  var amts = [395, 25, 120, 1, 9999.99, 47.53, 250];
  var allBalance = true;
  for (var i = 0; i < cats.length; i++) {
    var r = cae_buildSaleAllocation_({ sale_id: 'S-' + i, amount: amts[i], category: cats[i] }, emptyBal, ctx);
    if (!r.ok || Math.abs(r.sumCredits - amts[i]) > 0.01) { allBalance = false; }
  }
  check('conservation: all sums balance', allBalance, '');

  var passed = 0;
  for (var j = 0; j < results.length; j++) { if (results[j].pass) { passed++; } }
  var summary = passed + '/' + results.length + ' tests passed';
  Logger.log('=== PATCH C PHASE 2A TEST: ' + summary + ' ===');
  return { ok: passed === results.length, summary: summary, results: results, wroteRows: false };
}

// ============================================================
// PATCH C PHASE 2B-1 - LIVE CONTEXT BUILDER (READ-ONLY)
//
// SCOPE (2B-1):
//   - Build the allocation context from api_getFinancialProtector(),
//     the SAME single source the dashboard renders from.
//   - Used by api_previewSaleAllocation (revised above).
//   - Still dry-run only. Writes nothing.
//
// EXPLICITLY OUT OF SCOPE (2B-1):
//   - NO live writer (api_recordSaleAllocation deferred to 2B-2).
//   - NO real CASH_MOVEMENTS rows, NO seeding, NO deploy.
//   - api_getFinancialProtector() is READ, never modified.
//
// Confirmed decisions:
//   - Payroll need = payrollStatus.employeeLaborRemaining (crew only:
//     Joe/Kenneth/Clarence). Taylor owner pay is separate and deferrable.
//   - Critical Bills need EXCLUDES rent (rent has its own Rent Reserve).
// ============================================================

// Map a Financial Protector result -> allocation context.
// Returns { financialProtectorOk, rentGapFromFp, context:{...} }.
// PURE: no sheet reads/writes; operates only on the passed-in fp object.
function cae_buildLiveContext_(fp, saleDate) {
  var okFp = !!(fp && fp.ok);
  var cp = (fp && fp.cashProtection)       ? fp.cashProtection       : {};
  var rs = (fp && fp.rentStatus)           ? fp.rentStatus           : {};
  var rp = (fp && fp.rentProtection)       ? fp.rentProtection       : {};
  var ps = (fp && fp.payrollStatus)        ? fp.payrollStatus        : {};
  var dr = (fp && fp.dailyRecommendations) ? fp.dailyRecommendations : {};

  // Lockdown comes straight from cashProtection.mode (RED/LOCKDOWN).
  var isLockdown    = (String(cp.mode) === 'LOCKDOWN');
  var survivalScore = (typeof cp.survivalScore === 'number') ? cp.survivalScore : null;

  // Rent: protected from BILLS (Patch B), monthly, and shortfall for cross-check.
  var rentProtected = (typeof rs.fundBalance === 'number') ? rs.fundBalance : 0;
  var rentMonthly   = (typeof rs.monthly === 'number')     ? rs.monthly     : CAE_CONST.rentMonthly;
  var rentGapFromFp = (typeof rp.shortfall === 'number')   ? rp.shortfall   : null;

  // Payroll need = crew labor remaining only (excludes deferrable Taylor pay).
  var weeklyPayrollNeed = (typeof ps.employeeLaborRemaining === 'number')
                            ? Math.max(0, ps.employeeLaborRemaining) : 0;
  var laborRisk = ps.laborRisk || '';

  // Bills due in next 7 days EXCLUDING rent (rent handled by Rent Reserve).
  var billsDue = 0;
  var urgency = (dr && dr.billsUrgency) ? dr.billsUrgency : [];
  for (var i = 0; i < urgency.length; i++) {
    var nm = String(urgency[i].name || '').toLowerCase();
    if (nm.indexOf('rent') >= 0) { continue; }
    billsDue += parseFloat(urgency[i].amount) || 0;
  }
  billsDue = cae_round2_(billsDue);

  var sd = (saleDate instanceof Date) ? saleDate : new Date();

  return {
    financialProtectorOk: okFp,
    rentGapFromFp: rentGapFromFp,
    context: {
      rentProtected:     rentProtected,
      rentMonthly:       rentMonthly,
      weeklyPayrollNeed: weeklyPayrollNeed,
      billsDue:          billsDue,
      holidayTarget:     0,
      isLockdown:        isLockdown,
      isSlowSeason:      fp_isSlowSeason_(sd),
      survivalScore:     survivalScore,
      laborRisk:         laborRisk
    }
  };
}

// Shallow merge: override's defined keys win. Used so tests can pin fields.
function cae_mergeContext_(base, override) {
  var out = {};
  var k;
  for (k in base) { if (base.hasOwnProperty(k)) { out[k] = base[k]; } }
  if (override) {
    for (k in override) { if (override.hasOwnProperty(k)) { out[k] = override[k]; } }
  }
  return out;
}

// ============================================================
// PHASE 2B-1 TEST RUNNER - IN-MEMORY ONLY. NO LIVE WRITES.
// Run in Apps Script editor: runPatchCPhase2bTest()
// ============================================================
function runPatchCPhase2bTest() {
  var results = [];
  function check(name, pass, detail) {
    results.push({ test: name, pass: !!pass, detail: detail || '' });
    Logger.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? (' -- ' + detail) : ''));
  }

  // Mock Financial Protector result reflecting current RED/LOCKDOWN reality.
  var mockFp = {
    ok: true,
    cashProtection: { mode: 'LOCKDOWN', survivalScore: 30 },
    rentStatus:     { fundBalance: 1500, monthly: 3600 },
    rentProtection: { shortfall: 2100 },
    payrollStatus:  { employeeLaborRemaining: 600, totalRemaining: 900, laborRisk: 'RED' },
    dailyRecommendations: { billsUrgency: [
      { name: 'Rent',      amount: 3600, daysUntil: 5 },   // must be EXCLUDED
      { name: 'Insurance', amount: 180,  daysUntil: 3 },
      { name: 'Utilities', amount: 120,  daysUntil: 6 }
    ] }
  };

  var live = cae_buildLiveContext_(mockFp, new Date(2026, 5, 26)); // June -> not slow season
  var c = live.context;

  check('fpOk passthrough', live.financialProtectorOk === true, '');
  check('isLockdown=true (mode LOCKDOWN)', c.isLockdown === true, 'got ' + c.isLockdown);
  check('rentProtected=1500 (rentStatus.fundBalance)', c.rentProtected === 1500, 'got ' + c.rentProtected);
  check('rentMonthly=3600', c.rentMonthly === 3600, 'got ' + c.rentMonthly);
  check('payrollNeed=600 (employeeLaborRemaining, not 900 total)', c.weeklyPayrollNeed === 600, 'got ' + c.weeklyPayrollNeed);
  check('billsDue=300 (180+120, rent EXCLUDED)', c.billsDue === 300, 'got ' + c.billsDue);
  check('isSlowSeason=false (June)', c.isSlowSeason === false, 'got ' + c.isSlowSeason);
  check('rentGapFromFp=2100 (shortfall)', live.rentGapFromFp === 2100, 'got ' + live.rentGapFromFp);

  // Builder rent gap must equal dashboard shortfall.
  var builderRentGap = Math.max(0, c.rentMonthly - c.rentProtected);
  check('builderRentGap==shortfall (2100)', builderRentGap === live.rentGapFromFp, 'got ' + builderRentGap);

  // Allocate the tested $200 Appliance Sale under LIVE lockdown context.
  var emptyBal = cae_computeBalances_([]);
  var a = cae_buildSaleAllocation_({ sale_id: 'S-LIVE-200', amount: 200, category: 'Appliance Sale' }, emptyBal, c);
  check('live $200: ok & sum==200', a.ok === true && a.sumCredits === 200, 'sum ' + a.sumCredits);
  check('live $200: taxReserve==17.77', a.taxReserve === 17.77, 'got ' + a.taxReserve);
  // In LOCKDOWN, emergency/inventory/holiday needs are 0 -> remainder lands in
  // payroll tax (225) then crew payroll (600) then rent gap.
  function needOf(arr, name) { for (var i = 0; i < arr.length; i++) { if (arr[i].bucket === name) { return arr[i].amount_credit; } } return 0; }
  check('live $200: Emergency=0 (lockdown)', needOf(a.rows, 'Emergency Fund') === 0, 'got ' + needOf(a.rows, 'Emergency Fund'));
  check('live $200: Inventory=0 (lockdown)', needOf(a.rows, 'Inventory Buying') === 0, 'got ' + needOf(a.rows, 'Inventory Buying'));

  // Degraded path: fp not ok -> safe defaults, no throw.
  var dead = cae_buildLiveContext_({ ok: false }, new Date(2026, 5, 26));
  check('fp not ok -> financialProtectorOk false', dead.financialProtectorOk === false, '');
  check('fp not ok -> context still built', !!dead.context && typeof dead.context.isLockdown === 'boolean', '');

  // Merge override pins a field (tests can force values).
  var merged = cae_mergeContext_(c, { isLockdown: false, weeklyPayrollNeed: 0 });
  check('merge override applied', merged.isLockdown === false && merged.weeklyPayrollNeed === 0, '');
  check('merge keeps base fields', merged.rentProtected === 1500, '');

  var passed = 0;
  for (var j = 0; j < results.length; j++) { if (results[j].pass) { passed++; } }
  var summary = passed + '/' + results.length + ' tests passed';
  Logger.log('=== PATCH C PHASE 2B-1 TEST: ' + summary + ' ===');
  return { ok: passed === results.length, summary: summary, results: results, wroteRows: false };
}
