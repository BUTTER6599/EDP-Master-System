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


// Read-only live check: confirms helpers run against the live (empty) ledger
// and that the live Financial Protector API is unaffected. NO writes.

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

// Pure reconciliation math. Ledger is compared to PHYSICAL TOTAL cash
// (not available): buckets allocate total cash into reserved purposes, so
// over-allocation means ledger exceeds total cash on hand.
function cae_reconMath_(ledgerTotal, physicalCashTotal) {
  var hasTotal = (typeof physicalCashTotal === 'number');
  return {
    unallocatedCash:   hasTotal ? cae_round2_(physicalCashTotal - ledgerTotal) : null,
    ledgerVsTotalDrift: hasTotal ? cae_round2_(ledgerTotal - physicalCashTotal) : null,
    overAllocated:     hasTotal ? (ledgerTotal > physicalCashTotal + 0.01) : false
  };
}

// Read-only reconciliation report. Compares ledger bucket total to physical
// TOTAL cash (cashPosition.totalCash). Writes nothing.
function fp_reconcileBuckets_(ss) {
  try {
    if (!ss) { ss = fp_openSheet_(); }
    var balances = fp_readBucketStatus_(ss);
    var ledgerTotal = 0;
    for (var k in balances) { if (balances.hasOwnProperty(k)) { ledgerTotal += balances[k]; } }
    ledgerTotal = cae_round2_(ledgerTotal);

    // Physical cash total: PREFER the live CASH_POSITION snapshot (total_cash);
    // fall back to the FP_CONFIG-derived total only if no snapshot value exists.
    var physicalCashTotal = null, physicalCashTotalSource = null, physicalCashAvailable = null;
    var snapTotal = cae_readPhysicalTotalCash_(ss);
    if (snapTotal !== null) {
      physicalCashTotal = snapTotal;
      physicalCashTotalSource = 'CASH_POSITION.total_cash';
    }
    var fp;
    try { fp = api_getFinancialProtector(); } catch (eFp) { fp = null; }
    if (fp && fp.ok && fp.cashPosition) {
      if (physicalCashTotal === null && typeof fp.cashPosition.totalCash === 'number') {
        physicalCashTotal = fp.cashPosition.totalCash;
        physicalCashTotalSource = 'FP_CONFIG (fallback)';
      }
      if (typeof fp.cashPosition.availableCash === 'number') { physicalCashAvailable = fp.cashPosition.availableCash; }
    } else {
      // FP unavailable: read available from the CASH_POSITION snapshot.
      var phys = ss ? fp_readLatestCash_(ss) : null;
      if (phys && typeof phys.cashAvailable === 'number') { physicalCashAvailable = phys.cashAvailable; }
    }

    // BILLS rent protected (transition mirror; dashboard still reads BILLS).
    var billsRent = null;
    var liveBills = ss ? fp_readBills_(ss) : null;
    if (liveBills) {
      for (var i = 0; i < liveBills.length; i++) {
        if (String(liveBills[i].name).toLowerCase().indexOf('rent') >= 0) {
          billsRent = liveBills[i].fundBalance; break;
        }
      }
    }

    var m = cae_reconMath_(ledgerTotal, physicalCashTotal);

    return {
      ok: true,
      ledgerBucketTotal: ledgerTotal,
      buckets: balances,
      physicalCashTotal: physicalCashTotal,
      physicalCashTotalSource: physicalCashTotalSource,
      physicalCashAvailable: physicalCashAvailable,
      unallocatedCash: m.unallocatedCash,
      ledgerVsTotalDrift: m.ledgerVsTotalDrift,
      overAllocated: m.overAllocated,
      billsRentProtected: billsRent,
      note: 'Ledger = openings + allocations - payments - reversals. Compared to physical total cash; overAllocated only if ledger exceeds total cash. BILLS remains rent source of truth until Phase 5 cutover.'
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

// ============================================================
// PATCH C PHASE 2B-2 - GUARDED LIVE WRITER
//
// SCOPE (2B-2):
//   - api_recordSaleAllocation: write ONE sale's allocation, guarded.
//   - api_reverseSaleAllocation: append CORRECTION rows to undo a sale.
//   - Pure helpers for approval guard, row composition, correction build.
//   - Dry-run + guard-negative test runner. Read-only verify helper.
//
// THREE-KEY WRITE GUARD (all required to write an allocation):
//   opts.dryRun === false
//   opts.confirmSaleId === sale_id
//   opts.confirmAction === 'ALLOCATE_ONE_SALE'
// Default behavior is dryRun:true -> writes nothing.
//
// EXPLICITLY OUT OF SCOPE (2B-2):
//   - No batch write path. No api_addSale hook. No backfill.
//   - No dashboard integration. No deploy. No Rent Reserve seed.
//   - api_getFinancialProtector() READ only, never modified.
//   - Reversed sales stay BLOCKED from re-allocation (by design).
// ============================================================

function cae_newMovementId_(seq) {
  var base = 'M-' + (new Date().getTime()) + '-' + Math.floor(Math.random() * 1000);
  return (seq === null || typeof seq === 'undefined') ? base : (base + '-' + seq);
}

function cae_newGroupId_() {
  return 'MG-' + (new Date().getTime()) + '-' + Math.floor(Math.random() * 1000);
}

// Pure approval decision. expectedAction lets allocate vs reverse differ.
function cae_writeApproved_(opts, sale_id, expectedAction) {
  opts = opts || {};
  if (opts.dryRun !== false) {
    return { approved: false, reason: 'dryRun is not false (default safe).' };
  }
  if (String(opts.confirmSaleId || '') !== String(sale_id || '')) {
    return { approved: false, reason: 'confirmSaleId does not match sale_id.' };
  }
  if (String(opts.confirmAction || '') !== String(expectedAction || '')) {
    return { approved: false, reason: 'confirmAction must equal ' + expectedAction + '.' };
  }
  return { approved: true, reason: 'approved' };
}

// Pure: compose one CASH_MOVEMENTS row (array in header order).
function cae_composeMovementRow_(row, meta, now, movementId) {
  return [
    now,                                       // timestamp
    movementId,                                // movement_id
    meta.group_id || '',                       // movement_group_id
    meta.movement_type || '',                  // movement_type
    meta.source_type || '',                    // source_type
    meta.source_id || '',                      // source_id
    row.bucket || '',                          // bucket
    cae_round2_(row.amount_debit || 0),        // amount_debit
    cae_round2_(row.amount_credit || 0),       // amount_credit
    cae_round2_(row.old_balance || 0),         // old_balance
    cae_round2_(row.new_balance || 0),         // new_balance
    meta.allocation_status || '',              // allocation_status
    row.reversed_by_movement_id || '',         // reversed_by_movement_id
    meta.owner_name || 'system',               // owner_name
    meta.owner_pin_verified === true,          // owner_pin_verified
    meta.warning_level || '',                  // warning_level
    meta.emergency_fund_phase || '',           // emergency_fund_phase
    meta.is_slow_season === true,              // is_slow_season
    row.reason || meta.reason || '',           // reason
    row.notes || meta.notes || ''              // notes
  ];
}

// The ONLY low-level writer. Composes full rows and appends them in one batch.
// Returns the written rows as objects (with their movement_id).
function cae_appendMovementRows_(ss, rows, meta) {
  if (!ss) { ss = fp_openSheet_(); }
  if (!ss) { return { ok: false, error: 'Could not open spreadsheet.' }; }
  var sh = ss.getSheetByName('CASH_MOVEMENTS');
  if (!sh) { return { ok: false, error: 'CASH_MOVEMENTS tab not found.' }; }
  if (!rows || !rows.length) { return { ok: false, error: 'No rows to write.' }; }

  var now = new Date();
  var arr2d = [];
  var written = [];
  for (var i = 0; i < rows.length; i++) {
    var mid = cae_newMovementId_(i);
    arr2d.push(cae_composeMovementRow_(rows[i], meta, now, mid));
    written.push({
      movement_id: mid, movement_group_id: meta.group_id, bucket: rows[i].bucket,
      amount_debit: cae_round2_(rows[i].amount_debit || 0),
      amount_credit: cae_round2_(rows[i].amount_credit || 0),
      old_balance: cae_round2_(rows[i].old_balance || 0),
      new_balance: cae_round2_(rows[i].new_balance || 0)
    });
  }
  var startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, arr2d.length, CAE_MOVEMENT_HEADERS.length).setValues(arr2d);
  return { ok: true, written: written, count: written.length };
}

// Shared SALES lookup (read-only). Returns sale object or null.
function cae_lookupSale_(ss, sale_id) {
  var sh = ss.getSheetByName('SALES');
  if (!sh) { return null; }
  var data = sh.getDataRange().getValues();
  if (data.length < 2) { return null; }
  var h = fp_headers_(data);
  var idCol = h.indexOf('sale_id');
  var amtCol = h.indexOf('amount');
  var catCol = h.indexOf('category');
  var dCol = h.indexOf('sale_date');
  var ebCol = h.indexOf('entered_by');
  if (idCol < 0 || amtCol < 0) { return null; }
  var want = String(sale_id || '');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === want) {
      return {
        sale_id:   data[i][idCol],
        amount:    data[i][amtCol],
        category:  catCol >= 0 ? data[i][catCol] : '',
        sale_date: dCol >= 0 ? data[i][dCol] : '',
        entered_by: ebCol >= 0 ? String(data[i][ebCol] || '') : ''
      };
    }
  }
  return null;
}

// Read existing SALE_ALLOCATION rows for a sale (status ALLOCATED), with movement_id.
function cae_readAllocatedRows_(ss, sale_id) {
  var sh = ss.getSheetByName('CASH_MOVEMENTS');
  if (!sh) { return []; }
  var data = sh.getDataRange().getValues();
  if (data.length < 2) { return []; }
  var h = fp_headers_(data);
  var want = String(sale_id || '');
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var c = 0; c < h.length; c++) { row[h[c]] = data[i][c]; }
    if (String(row.movement_type) === 'SALE_ALLOCATION' &&
        String(row.source_type) === 'SALE' &&
        String(row.source_id) === want &&
        String(row.allocation_status) === 'ALLOCATED') {
      out.push({ movement_id: row.movement_id, bucket: row.bucket, amount_credit: parseFloat(row.amount_credit) || 0 });
    }
  }
  return out;
}

// Has this sale already been reversed (a CORRECTION group references it)?
function cae_saleReversed_(ss, sale_id) {
  var sh = ss.getSheetByName('CASH_MOVEMENTS');
  if (!sh) { return false; }
  var data = sh.getDataRange().getValues();
  if (data.length < 2) { return false; }
  var h = fp_headers_(data);
  var mtCol = h.indexOf('movement_type');
  var siCol = h.indexOf('source_id');
  var want = String(sale_id || '');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][mtCol]) === 'CORRECTION' && String(data[i][siCol]) === want) { return true; }
  }
  return false;
}

// Pure: build CORRECTION debit rows that reverse a set of allocated rows.
// currentBalances stamps old/new; multiple debits to one bucket chain correctly.
function cae_buildCorrectionRows_(allocatedRows, currentBalances) {
  var working = {};
  var i;
  for (i = 0; i < CAE_BUCKETS.length; i++) { working[CAE_BUCKETS[i]] = parseFloat((currentBalances || {})[CAE_BUCKETS[i]]) || 0; }
  var rows = [];
  for (i = 0; i < (allocatedRows || []).length; i++) {
    var a = allocatedRows[i];
    var debit = cae_round2_(a.amount_credit || 0);
    if (debit <= 0) { continue; }
    var old = working[a.bucket];
    var nw = cae_round2_(old - debit);
    working[a.bucket] = nw;
    rows.push({
      bucket: a.bucket, amount_debit: debit, amount_credit: 0,
      old_balance: cae_round2_(old), new_balance: nw,
      reversed_by_movement_id: a.movement_id
    });
  }
  return rows;
}

// ---- Orchestrator: write ONE sale allocation (guarded) ----
function api_recordSaleAllocation(sale_id, opts) {
  opts = opts || {};
  var lock = LockService.getScriptLock();
  try {
    try { lock.waitLock(20000); } catch (eLock) { return { ok: false, error: 'Busy; could not acquire lock.' }; }

    var ss = fp_openSheet_();
    if (!ss) { return { ok: false, error: 'Could not open spreadsheet.' }; }

    var sale = cae_lookupSale_(ss, sale_id);
    if (!sale) { return { ok: false, error: 'sale_id not found: ' + sale_id }; }

    // Duplicate guard.
    if (cae_isSaleAllocated_(ss, sale_id)) {
      return { ok: false, error: 'Sale already allocated: ' + sale_id, wroteRows: false };
    }

    // Live context (same single source as dashboard).
    var fp;
    try { fp = api_getFinancialProtector(); } catch (eFp) { fp = { ok: false }; }
    if (!fp || !fp.ok) { return { ok: false, error: 'Financial Protector unavailable; refusing to allocate.', wroteRows: false }; }
    var saleDate = (sale.sale_date instanceof Date) ? sale.sale_date : new Date();
    var live = cae_buildLiveContext_(fp, saleDate);
    var context = live.context;

    // Balances re-read INSIDE the lock; build allocation.
    var balances = fp_readBucketStatus_(ss);
    var result = cae_buildSaleAllocation_(sale, balances, context);
    if (!result.ok) { return { ok: false, error: result.error || 'Allocation build failed.', wroteRows: false }; }

    // Assert engine == dashboard on rent gap.
    var builderRentGap = cae_round2_(Math.max(0, (context.rentMonthly || 0) - (context.rentProtected || 0)));
    if (live.rentGapFromFp !== null && Math.abs(builderRentGap - live.rentGapFromFp) > 0.01) {
      return { ok: false, error: 'Rent gap mismatch (builder ' + builderRentGap + ' vs shortfall ' + live.rentGapFromFp + ').', wroteRows: false };
    }

    var approval = cae_writeApproved_(opts, sale_id, 'ALLOCATE_ONE_SALE');

    // Dry-run (default) or unapproved -> return preview, write nothing.
    if (!approval.approved) {
      return {
        ok: true, dryRun: true, wroteRows: false,
        writeApproved: false, approvalReason: approval.reason,
        financialProtectorOk: live.financialProtectorOk,
        contextUsed: context,
        rentGapCrossCheck: { builderRentGap: builderRentGap, rentProtectionShortfall: live.rentGapFromFp,
          match: (live.rentGapFromFp === null) ? null : (Math.abs(builderRentGap - live.rentGapFromFp) < 0.01) },
        preview: result
      };
    }

    // ---- Approved single write ----
    var emergencyPhase = fp_checkEmergencyFundPhase_(balances['Emergency Fund']);
    var ownerName = sale.entered_by ? sale.entered_by : 'system';
    var meta = {
      group_id: cae_newGroupId_(),
      movement_type: 'SALE_ALLOCATION',
      source_type: 'SALE',
      source_id: sale_id,
      owner_name: ownerName,
      owner_pin_verified: false,
      warning_level: '',
      emergency_fund_phase: emergencyPhase,
      is_slow_season: context.isSlowSeason,
      allocation_status: 'ALLOCATED',
      reason: 'Sale allocation ' + sale_id + ' ($' + result.amount + ' ' + (sale.category || '') + ')',
      notes: 'survival=' + context.survivalScore + '; lockdown=' + context.isLockdown + '; flaggedForReview=' + result.flaggedForReview
    };
    var w = cae_appendMovementRows_(ss, result.rows, meta);
    if (!w.ok) { return { ok: false, error: w.error, wroteRows: false }; }

    return { ok: true, dryRun: false, wroteRows: true, writeApproved: true,
             groupId: meta.group_id, written: w.written, count: w.count };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

// ---- Reverse ONE sale allocation (guarded; append-only CORRECTION) ----
function api_reverseSaleAllocation(sale_id, reason, opts) {
  opts = opts || {};
  var lock = LockService.getScriptLock();
  try {
    try { lock.waitLock(20000); } catch (eLock) { return { ok: false, error: 'Busy; could not acquire lock.' }; }

    var ss = fp_openSheet_();
    if (!ss) { return { ok: false, error: 'Could not open spreadsheet.' }; }

    var allocated = cae_readAllocatedRows_(ss, sale_id);
    if (!allocated.length) { return { ok: false, error: 'No ALLOCATED rows for ' + sale_id, wroteRows: false }; }
    if (cae_saleReversed_(ss, sale_id)) { return { ok: false, error: 'Sale already reversed: ' + sale_id, wroteRows: false }; }

    var balances = fp_readBucketStatus_(ss);
    var corrections = cae_buildCorrectionRows_(allocated, balances);

    var approval = cae_writeApproved_(opts, sale_id, 'REVERSE_ONE_SALE');
    if (!approval.approved) {
      return { ok: true, dryRun: true, wroteRows: false, writeApproved: false,
               approvalReason: approval.reason, preview: { corrections: corrections } };
    }

    var emergencyPhase = fp_checkEmergencyFundPhase_(balances['Emergency Fund']);
    var meta = {
      group_id: cae_newGroupId_(),
      movement_type: 'CORRECTION',
      source_type: 'SALE',
      source_id: sale_id,
      owner_name: opts.owner ? opts.owner : 'system',
      owner_pin_verified: false,
      warning_level: '',
      emergency_fund_phase: emergencyPhase,
      is_slow_season: fp_isSlowSeason_(new Date()),
      allocation_status: 'CANCELLED',
      reason: reason ? reason : ('Reversal of ' + sale_id),
      notes: 'Reverses SALE_ALLOCATION ' + sale_id
    };
    var w = cae_appendMovementRows_(ss, corrections, meta);
    if (!w.ok) { return { ok: false, error: w.error, wroteRows: false }; }

    return { ok: true, dryRun: false, wroteRows: true, writeApproved: true,
             groupId: meta.group_id, written: w.written, count: w.count };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

// Read-only before/after FP snapshot helper (no writes).

// ============================================================
// PHASE 2B-2 DRY-RUN + GUARD-NEGATIVE TESTS - NO LIVE WRITES.
// Run in Apps Script editor: runPatchCPhase2bWriteDryRunTest()
// ============================================================

// ============================================================
// PATCH C PHASE 2C - OPENING BALANCE SEED (GUARDED) + RECON TESTS
//
// SCOPE (2C):
//   - api_seedOpeningBalance: guarded/idempotent OPENING_BALANCE writer.
//   - cae_isOpeningSeeded_: idempotency check.
//   - Reversal dry-run + reconciliation tests.
//
// FOUR-KEY SEED GUARD (all required to write a real opening balance):
//   opts.dryRun === false
//   opts.confirmBucket === bucket
//   Number(opts.confirmAmount) === Number(amount)
//   opts.confirmAction === 'SEED_OPENING_BALANCE'
// Default behavior is dryRun:true -> writes nothing.
//
// EXPLICITLY OUT OF SCOPE (2C):
//   - No real seed run here. No deploy. No dashboard change.
//   - api_getFinancialProtector() READ only, never modified.
// ============================================================

// Has an OPENING_BALANCE already been recorded for this bucket?
function cae_isOpeningSeeded_(ss, bucket) {
  try {
    if (!ss) { ss = fp_openSheet_(); }
    if (!ss) { return false; }
    var sh = ss.getSheetByName('CASH_MOVEMENTS');
    if (!sh) { return false; }
    var data = sh.getDataRange().getValues();
    if (data.length < 2) { return false; }
    var h = fp_headers_(data);
    var mtCol = h.indexOf('movement_type');
    var bCol = h.indexOf('bucket');
    var want = String(bucket || '');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][mtCol]) === 'OPENING_BALANCE' && String(data[i][bCol]) === want) { return true; }
    }
    return false;
  } catch (e) { return false; }
}

// Pure four-key approval decision for opening-balance seeding.
function cae_seedApproved_(opts, bucket, amount) {
  opts = opts || {};
  if (opts.dryRun !== false) {
    return { approved: false, reason: 'dryRun is not false (default safe).' };
  }
  if (String(opts.confirmBucket || '') !== String(bucket || '')) {
    return { approved: false, reason: 'confirmBucket does not match bucket.' };
  }
  if (Number(opts.confirmAmount) !== Number(amount)) {
    return { approved: false, reason: 'confirmAmount does not match amount.' };
  }
  if (String(opts.confirmAction || '') !== 'SEED_OPENING_BALANCE') {
    return { approved: false, reason: 'confirmAction must equal SEED_OPENING_BALANCE.' };
  }
  return { approved: true, reason: 'approved' };
}

// ---- Seed ONE opening balance (guarded, idempotent) ----
function api_seedOpeningBalance(bucket, amount, reason, opts) {
  opts = opts || {};
  var lock = LockService.getScriptLock();
  try {
    try { lock.waitLock(20000); } catch (eLock) { return { ok: false, error: 'Busy; could not acquire lock.' }; }

    // Validate bucket + amount.
    var known = false;
    for (var i = 0; i < CAE_BUCKETS.length; i++) { if (CAE_BUCKETS[i] === bucket) { known = true; break; } }
    if (!known) { return { ok: false, error: 'Unknown bucket: ' + bucket, wroteRows: false }; }
    var amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { return { ok: false, error: 'Amount must be greater than 0.', wroteRows: false }; }

    var ss = fp_openSheet_();
    if (!ss) { return { ok: false, error: 'Could not open spreadsheet.' }; }

    // Idempotency: one opening balance per bucket.
    if (cae_isOpeningSeeded_(ss, bucket)) {
      return { ok: false, error: 'Opening balance already seeded for ' + bucket, wroteRows: false };
    }

    var balances = fp_readBucketStatus_(ss);
    var oldBal = parseFloat(balances[bucket]) || 0;
    var newBal = cae_round2_(oldBal + amt);
    var row = { bucket: bucket, amount_debit: 0, amount_credit: amt, old_balance: cae_round2_(oldBal), new_balance: newBal };

    var approval = cae_seedApproved_(opts, bucket, amt);
    if (!approval.approved) {
      return {
        ok: true, dryRun: true, wroteRows: false, writeApproved: false,
        approvalReason: approval.reason,
        preview: { bucket: bucket, amount: amt, oldBalance: cae_round2_(oldBal), newBalance: newBal,
                   movement_type: 'OPENING_BALANCE' }
      };
    }

    // ---- Approved single seed ----
    var meta = {
      group_id: cae_newGroupId_(),
      movement_type: 'OPENING_BALANCE',
      source_type: 'MANUAL',
      source_id: opts.sourceId ? opts.sourceId : ('opening_' + String(bucket).replace(/\s+/g, '_').toLowerCase()),
      owner_name: opts.owner ? opts.owner : 'system',
      owner_pin_verified: false,
      warning_level: '',
      emergency_fund_phase: fp_checkEmergencyFundPhase_(balances['Emergency Fund']),
      is_slow_season: fp_isSlowSeason_(new Date()),
      allocation_status: 'OPENING',
      reason: reason ? reason : ('Opening balance for ' + bucket),
      notes: 'Phase 2C seed. Labels existing cash; does not add new cash.'
    };
    var w = cae_appendMovementRows_(ss, [row], meta);
    if (!w.ok) { return { ok: false, error: w.error, wroteRows: false }; }

    return { ok: true, dryRun: false, wroteRows: true, writeApproved: true,
             groupId: meta.group_id, written: w.written, count: w.count };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

// ---- Reversal dry-run for the $30 test allocation (proves undo path) ----

// ============================================================
// PHASE 2C RECONCILIATION TESTS - NO LIVE WRITES.
// Run in Apps Script editor: runPatchCPhase2cReconTest()
// ============================================================

// ============================================================
// PATCH C PHASE 2D-A - TRUTH-CORRECTION INSPECTION (READ-ONLY)
//
// Reports the exact live structure of the sources that feed physical
// cash total and rent protected, so we do NOT write reconciliation code
// against assumed columns. Writes nothing.
//
// Run in Apps Script editor: runPatchC2DInspect()
// ============================================================

// ============================================================
// PATCH C PHASE 2D-A - PHYSICAL CASH TOTAL READ (READ-ONLY)
//
// Reads the latest CASH_POSITION snapshot's total_cash so reconciliation
// reflects real cash on hand instead of the stale FP_CONFIG estimate.
// Writes nothing.
// ============================================================

// Latest CASH_POSITION.total_cash as a positive number, else null (so
// callers fall back to the FP_CONFIG-derived total). Read-only.
function cae_readPhysicalTotalCash_(ss) {
  try {
    if (!ss) { ss = fp_openSheet_(); }
    if (!ss) { return null; }
    var sh = ss.getSheetByName('CASH_POSITION');
    if (!sh) { return null; }
    var data = sh.getDataRange().getValues();
    if (data.length < 2) { return null; }
    var h = fp_headers_(data);
    var tcCol = h.indexOf('total_cash');
    if (tcCol < 0) { return null; }
    var last = data[data.length - 1];
    var v = parseFloat(last[tcCol]);
    if (isNaN(v) || v <= 0) { return null; }
    return cae_round2_(v);
  } catch (e) { return null; }
}

// Read-only verify: shows the total_cash reconciliation will use + the full
// reconciliation. Run AFTER entering the corrected CASH_POSITION snapshot.
// Run in Apps Script editor: runPatchC2DCashTotalCheck()
