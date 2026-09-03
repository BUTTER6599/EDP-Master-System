/**********************************************************************
 * CashAllocation_Tests.gs — EDP Owner Dashboard
 * Manual TEST scaffolding for the Cash Allocation engine.
 * Moved verbatim from CashAllocation.js (Phase A1 file-organization).
 * READ-ONLY tests — no writes. No production logic here.
 * ES5 only.
 **********************************************************************/

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


function runPatchCPhase2bWriteVerify() {
  var out = {};
  try {
    var fp = api_getFinancialProtector();
    out.financialProtectorOk = !!(fp && fp.ok);
    out.rentFundBalance = fp && fp.rentStatus ? fp.rentStatus.fundBalance : null;
    out.rentShortfall = fp && fp.rentProtection ? fp.rentProtection.shortfall : null;
    out.cashMode = fp && fp.cashProtection ? fp.cashProtection.mode : null;
    out.executiveScore = fp && fp.executiveScorecard ? fp.executiveScorecard.executiveScore : null;
    out.bucketTotal = 0;
    var bal = fp_readBucketStatus_();
    for (var k in bal) { if (bal.hasOwnProperty(k)) { out.bucketTotal += bal[k]; } }
    out.bucketTotal = cae_round2_(out.bucketTotal);
  } catch (e) { out.error = String(e); }
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function runPatchCPhase2bWriteDryRunTest() {
  var results = [];
  function check(name, pass, detail) {
    results.push({ test: name, pass: !!pass, detail: detail || '' });
    Logger.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? (' -- ' + detail) : ''));
  }

  var SID = 'S-1782594988779-427';

  // --- Approval guard (pure cae_writeApproved_) ---
  check('guard: no opts -> reject', cae_writeApproved_({}, SID, 'ALLOCATE_ONE_SALE').approved === false, '');
  check('guard: dryRun:false only -> reject', cae_writeApproved_({ dryRun: false }, SID, 'ALLOCATE_ONE_SALE').approved === false, '');
  check('guard: missing confirmAction -> reject', cae_writeApproved_({ dryRun: false, confirmSaleId: SID }, SID, 'ALLOCATE_ONE_SALE').approved === false, '');
  check('guard: wrong confirmSaleId -> reject', cae_writeApproved_({ dryRun: false, confirmSaleId: 'WRONG', confirmAction: 'ALLOCATE_ONE_SALE' }, SID, 'ALLOCATE_ONE_SALE').approved === false, '');
  check('guard: wrong action string -> reject', cae_writeApproved_({ dryRun: false, confirmSaleId: SID, confirmAction: 'NOPE' }, SID, 'ALLOCATE_ONE_SALE').approved === false, '');
  check('guard: all three correct -> APPROVE', cae_writeApproved_({ dryRun: false, confirmSaleId: SID, confirmAction: 'ALLOCATE_ONE_SALE' }, SID, 'ALLOCATE_ONE_SALE').approved === true, '');
  check('guard: dryRun:true even w/ keys -> reject', cae_writeApproved_({ dryRun: true, confirmSaleId: SID, confirmAction: 'ALLOCATE_ONE_SALE' }, SID, 'ALLOCATE_ONE_SALE').approved === false, '');

  // --- Row composition (pure) ---
  var meta = { group_id: 'MG-X', movement_type: 'SALE_ALLOCATION', source_type: 'SALE', source_id: SID,
               owner_name: 'Taylor', owner_pin_verified: false, allocation_status: 'ALLOCATED',
               emergency_fund_phase: '1', is_slow_season: false, reason: 'r', notes: 'n' };
  var arr = cae_composeMovementRow_({ bucket: 'Payroll Tax Reserve', amount_debit: 0, amount_credit: 30, old_balance: 0, new_balance: 30 }, meta, new Date(), 'M-1');
  check('compose: 20 columns', arr.length === 20, 'got ' + arr.length);
  check('compose: bucket at idx6', arr[6] === 'Payroll Tax Reserve', '');
  check('compose: credit at idx8 = 30', arr[8] === 30, 'got ' + arr[8]);
  check('compose: status at idx11 = ALLOCATED', arr[11] === 'ALLOCATED', '');
  check('compose: owner at idx13 = Taylor', arr[13] === 'Taylor', '');

  // --- Correction rows (pure) net buckets to zero ---
  var allocated = [{ movement_id: 'M-A', bucket: 'Payroll Tax Reserve', amount_credit: 30 }];
  var corr = cae_buildCorrectionRows_(allocated, { 'Payroll Tax Reserve': 30 });
  check('correction: 1 row', corr.length === 1, '');
  check('correction: debit 30', corr[0].amount_debit === 30, 'got ' + corr[0].amount_debit);
  check('correction: new_balance 0', corr[0].new_balance === 0, 'got ' + corr[0].new_balance);
  check('correction: reversed_by set', corr[0].reversed_by_movement_id === 'M-A', '');

  // --- Multi-row correction chains on same bucket ---
  var alloc2 = [
    { movement_id: 'M-1', bucket: 'Rent Reserve', amount_credit: 100 },
    { movement_id: 'M-2', bucket: 'Rent Reserve', amount_credit: 50 }
  ];
  var corr2 = cae_buildCorrectionRows_(alloc2, { 'Rent Reserve': 150 });
  check('correction chain: 150 -> 50 -> 0', corr2[0].new_balance === 50 && corr2[1].new_balance === 0, corr2[0].new_balance + '/' + corr2[1].new_balance);

  var passed = 0;
  for (var j = 0; j < results.length; j++) { if (results[j].pass) { passed++; } }
  var summary = passed + '/' + results.length + ' tests passed';
  Logger.log('=== PATCH C PHASE 2B-2 DRY-RUN TEST: ' + summary + ' ===');
  return { ok: passed === results.length, summary: summary, results: results, wroteRows: false };
}


function runPatchCPhase2cReversalDryRun() {
  var r = api_reverseSaleAllocation('S-1782594988779-427', 'Phase 2C reversal dry-run (proof only)', { dryRun: true });
  Logger.log('=== PATCH C 2C REVERSAL DRY-RUN ===');
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}


function runPatchCPhase2cReconTest() {
  var results = [];
  function check(name, pass, detail) {
    results.push({ test: name, pass: !!pass, detail: detail || '' });
    Logger.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? (' -- ' + detail) : ''));
  }

  // Recon math: ledger 30 vs total 1655 -> unallocated 1625, not over.
  var m1 = cae_reconMath_(30, 1655);
  check('recon: unallocated=1625', m1.unallocatedCash === 1625, 'got ' + m1.unallocatedCash);
  check('recon: drift=-1625', m1.ledgerVsTotalDrift === -1625, 'got ' + m1.ledgerVsTotalDrift);
  check('recon: overAllocated=false', m1.overAllocated === false, '');

  // After a $1,500 Rent seed: ledger 1530 vs 1655 -> unallocated 125, not over.
  var m2 = cae_reconMath_(1530, 1655);
  check('recon(seed): unallocated=125', m2.unallocatedCash === 125, 'got ' + m2.unallocatedCash);
  check('recon(seed): overAllocated=false', m2.overAllocated === false, '');

  // Over-allocation: ledger 1700 vs 1655 -> over true, drift +45.
  var m3 = cae_reconMath_(1700, 1655);
  check('recon(over): overAllocated=true', m3.overAllocated === true, '');
  check('recon(over): drift=45', m3.ledgerVsTotalDrift === 45, 'got ' + m3.ledgerVsTotalDrift);

  // Null total cash -> safe (no false alarm).
  var m4 = cae_reconMath_(30, null);
  check('recon(no total): overAllocated=false', m4.overAllocated === false, '');
  check('recon(no total): unallocated=null', m4.unallocatedCash === null, '');

  // Seed four-key guard (pure).
  var B = 'Rent Reserve', A = 1500;
  check('seed: no opts -> reject', cae_seedApproved_({}, B, A).approved === false, '');
  check('seed: missing action -> reject', cae_seedApproved_({ dryRun: false, confirmBucket: B, confirmAmount: A }, B, A).approved === false, '');
  check('seed: wrong bucket -> reject', cae_seedApproved_({ dryRun: false, confirmBucket: 'Emergency Fund', confirmAmount: A, confirmAction: 'SEED_OPENING_BALANCE' }, B, A).approved === false, '');
  check('seed: wrong amount -> reject', cae_seedApproved_({ dryRun: false, confirmBucket: B, confirmAmount: 1499, confirmAction: 'SEED_OPENING_BALANCE' }, B, A).approved === false, '');
  check('seed: dryRun:true w/ keys -> reject', cae_seedApproved_({ dryRun: true, confirmBucket: B, confirmAmount: A, confirmAction: 'SEED_OPENING_BALANCE' }, B, A).approved === false, '');
  check('seed: all four correct -> APPROVE', cae_seedApproved_({ dryRun: false, confirmBucket: B, confirmAmount: A, confirmAction: 'SEED_OPENING_BALANCE' }, B, A).approved === true, '');

  var passed = 0;
  for (var j = 0; j < results.length; j++) { if (results[j].pass) { passed++; } }
  var summary = passed + '/' + results.length + ' tests passed';
  Logger.log('=== PATCH C PHASE 2C RECON TEST: ' + summary + ' ===');
  return { ok: passed === results.length, summary: summary, results: results, wroteRows: false };
}


function runPatchC2DInspect() {
  var out = { ok: true };
  try {
    var ss = fp_openSheet_();
    if (!ss) { return { ok: false, error: 'Could not open spreadsheet.' }; }

    // --- CASH_POSITION: exact headers + last row + row count ---
    var cp = ss.getSheetByName('CASH_POSITION');
    if (!cp) {
      out.cashPosition = { exists: false };
    } else {
      var cpData = cp.getDataRange().getValues();
      out.cashPosition = {
        exists: true,
        headers: cpData.length ? cpData[0] : [],
        hasTotalCashColumn: cpData.length ? (fp_headers_(cpData).indexOf('total_cash') >= 0) : false,
        dataRowCount: Math.max(0, cpData.length - 1),
        lastRow: cpData.length > 1 ? cpData[cpData.length - 1] : null
      };
    }

    // --- BILLS: the Rent row exactly as stored (first name-match) ---
    var billsRent = null;
    var liveBills = fp_readBills_(ss);
    if (liveBills) {
      for (var i = 0; i < liveBills.length; i++) {
        if (String(liveBills[i].name).toLowerCase().indexOf('rent') >= 0) {
          billsRent = { name: liveBills[i].name, amount: liveBills[i].amount,
                        fundBalance: liveBills[i].fundBalance, status: liveBills[i].status };
          break;
        }
      }
    }
    out.billsRent = billsRent;
    out.billsRentNote = 'fp_readBills_ returns FIRST name-matched rent row. To correct, EDIT that row fund_balance in place (append would be ignored).';

    // --- FP_CONFIG.cash.locations (the stale $1,655 source) ---
    var locs = [], locTotal = 0;
    for (var j = 0; j < FP_CONFIG.cash.locations.length; j++) {
      locs.push({ name: FP_CONFIG.cash.locations[j].name, amount: FP_CONFIG.cash.locations[j].amount });
      locTotal += FP_CONFIG.cash.locations[j].amount;
    }
    out.fpConfigLocations = locs;
    out.fpConfigLocationsTotal = locTotal;

    // --- What reconciliation currently uses as physicalCashTotal ---
    var fp;
    try { fp = api_getFinancialProtector(); } catch (eFp) { fp = null; }
    out.currentPhysicalCashTotalSource = (fp && fp.ok && fp.cashPosition)
      ? { source: 'api_getFinancialProtector().cashPosition.totalCash', value: fp.cashPosition.totalCash,
          availableCash: fp.cashPosition.availableCash, assignedCash: fp.cashPosition.assignedCash }
      : { source: 'FP unavailable', value: null };

    // --- Current rent protection source ---
    out.currentRentProtectionSource = (fp && fp.ok && fp.rentStatus)
      ? { rentStatusSource: fp.rentStatus.source, monthly: fp.rentStatus.monthly,
          fundBalance: fp.rentStatus.fundBalance,
          shortfall: (fp.rentProtection ? fp.rentProtection.shortfall : null) }
      : { source: 'FP unavailable' };

    // --- Current ledger snapshot ---
    out.ledger = fp_readBucketStatus_(ss);

    Logger.log(JSON.stringify(out, null, 2));
    return out;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}


function runPatchC2DCashTotalCheck() {
  var out = {};
  out.cashPositionTotalCash = cae_readPhysicalTotalCash_();
  out.reconcile = fp_reconcileBuckets_();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
