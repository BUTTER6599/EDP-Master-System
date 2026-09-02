/**********************************************************************
 * OwnerCheckin.gs — EDP Owner Dashboard
 * Intelligent Owner Check-In — SLICE 1 (READ-ONLY money + sales core)
 *
 * Scope (Slice 1): validate slot, compose trustworthy money{} and
 * sales{} from EXISTING approved readers, report freshness/confidence,
 * use the corrected protected-rent model. ZERO writes.
 *
 * NOT in Slice 1: owner questions, reconciliation engine, Pushover,
 * triggers, PhoneDashboard.html, EXPENSES, delivery/customer logic.
 * Does NOT modify api_getFinancialProtector, Dashboard.html, or Sheets.
 *
 * ES5 only. No const/let/arrow functions/template literals.
 **********************************************************************/


// Supported slots and their nominal times (display only in Slice 1).
var OC_SLOTS = {
  MORNING:   '08:30',
  MIDDAY:    '12:00',
  AFTERNOON: '14:30',
  CLOSING:   '17:00'
};

// A CASH_POSITION snapshot older than this many calendar days is STALE.
var OC_CASH_STALE_DAYS = 2;




/**********************************************************************
 * SMALL READ-ONLY UTILITIES
 * Pure helpers. No sheet access, no writes.
 **********************************************************************/

function oc_round2_(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}


// Parse a numeric cell to a Number, or null when blank/not a number.
function oc_num_(v) {
  if (v === '' || v === null || typeof v === 'undefined') { return null; }
  var n = parseFloat(v);
  return isNaN(n) ? null : n;
}


// Whole calendar-day age between a snapshot date and now. null if no date.
function oc_ageDays_(snapDate, now) {
  if (!(snapDate instanceof Date) || isNaN(snapDate.getTime())) { return null; }
  var a = new Date(snapDate); a.setHours(0, 0, 0, 0);
  var b = new Date(now);      b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}


function oc_slotValid_(slot) {
  return !!(slot && OC_SLOTS.hasOwnProperty(String(slot)));
}




/**********************************************************************
 * CASH_POSITION SNAPSHOT READER (READ-ONLY)
 * Reads the latest CASH_POSITION row's fields. Required because no
 * existing approved reader exposes the snapshot date + drawer/bank/
 * assigned breakdown that the money model needs. getValues() only —
 * never appends, sets, or inserts.
 **********************************************************************/

function oc_readCashSnapshot_(ss) {
  var out = {
    exists: false, date: null, total_cash: null, drawer_cash: null,
    bank_cash: null, assigned_cash: null, cash_available: null
  };
  try {
    if (!ss) { return out; }
    var sh = ss.getSheetByName('CASH_POSITION');
    if (!sh) { return out; }
    var data = sh.getDataRange().getValues();
    if (data.length < 2) { return out; }

    var h = data[0].map(function (x) { return String(x).toLowerCase().trim(); });
    var last = data[data.length - 1];

    function col(name) { var i = h.indexOf(name); return i >= 0 ? last[i] : ''; }

    var ts = col('timestamp');
    var dt = (ts instanceof Date) ? ts : new Date(ts);

    out.exists         = true;
    out.date           = isNaN(dt.getTime()) ? null : dt;
    out.total_cash     = oc_num_(col('total_cash'));
    out.drawer_cash    = oc_num_(col('drawer_cash'));
    out.bank_cash      = oc_num_(col('bank_cash'));
    out.assigned_cash  = oc_num_(col('assigned_cash'));
    out.cash_available = oc_num_(col('cash_available'));
    return out;
  } catch (e) {
    return out;
  }
}




/**********************************************************************
 * MONEY MODEL (READ-ONLY)
 * Derives money numbers ONLY from verified, fresh sources. On stale /
 * missing / conflicting inputs returns null + a confidence flag — never
 * an invented value. freeOperatingCash excludes bank and all committed
 * money, and never uses cashPosition.availableCash.
 **********************************************************************/

function oc_buildMoney_(ss, fp, snap, now) {
  var notes = [];

  // ---- Freshness of the physical-cash snapshot ----
  var ageDays = snap.exists ? oc_ageDays_(snap.date, now) : null;
  var stale = (!snap.exists) || (ageDays === null) || (ageDays > OC_CASH_STALE_DAYS);
  if (!snap.exists) { notes.push('No CASH_POSITION snapshot found.'); }
  else if (stale)   { notes.push('CASH_POSITION snapshot is stale (' + ageDays + ' days old).'); }

  // ---- Physical cash figures (snapshot-derived; null when stale) ----
  var totalBusinessCash = null, physicalCash = null, drawerCash = null;
  var bankCash = null, committedAssigned = null, freeOperatingCash = null;

  if (!stale) {
    totalBusinessCash = (snap.total_cash === null) ? null : oc_round2_(snap.total_cash);
    bankCash          = (snap.bank_cash  === null) ? null : oc_round2_(snap.bank_cash);
    drawerCash        = (snap.drawer_cash === null) ? null : oc_round2_(snap.drawer_cash);
    committedAssigned = (snap.assigned_cash === null) ? null : oc_round2_(snap.assigned_cash);

    // physicalCash = total business cash minus money still in the bank.
    if (totalBusinessCash !== null && bankCash !== null) {
      physicalCash = oc_round2_(totalBusinessCash - bankCash);
    } else {
      notes.push('physicalCash unavailable: need both total_cash and bank_cash.');
    }

    // freeOperatingCash = physical cash minus committed/assigned money.
    // Excludes bank (already removed) and all committed reserves.
    if (physicalCash !== null && committedAssigned !== null) {
      freeOperatingCash = oc_round2_(physicalCash - committedAssigned);
    } else {
      notes.push('freeOperatingCash unavailable: need physicalCash and assigned_cash.');
    }
  }

  // ---- Ledger reserves (informational; from Patch C buckets) ----
  // Surfaced separately, NOT folded into freeOperatingCash. The snapshot
  // assigned_cash vs bucket model are not yet reconciled -> NEEDS_VERIFICATION.
  var reservesLedger = { rent: null, payroll: null, salesTax: null, source: 'CASH_MOVEMENTS buckets' };
  try {
    if (typeof fp_readBucketStatus_ === 'function') {
      var b = fp_readBucketStatus_(ss) || {};
      reservesLedger.rent     = oc_num_(b['Rent Reserve']);
      reservesLedger.payroll  = oc_num_(b['Payroll Reserve']);
      reservesLedger.salesTax = oc_num_(b['Sales Tax Reserve']);
    }
  } catch (e) { notes.push('Bucket reserves unavailable: ' + (e && e.message ? e.message : e)); }

  // ---- Rent: CORRECTED protected-rent model (never monthly - available) ----
  var rentMonthly = null, rentProtected = null, rentShortfall = null, rentSource = 'unavailable';
  if (fp && fp.ok) {
    var rs = fp.rentStatus || {};
    var rp = fp.rentProtection || {};
    rentMonthly   = (typeof rs.monthly === 'number') ? rs.monthly : null;
    rentProtected = (typeof rs.fundBalance === 'number') ? rs.fundBalance : null;
    rentShortfall = (typeof rp.shortfall === 'number') ? rp.shortfall : null; // AUTHORITATIVE
    rentSource    = 'BILLS via api_getFinancialProtector().rentProtection.shortfall';
  } else {
    notes.push('Rent unavailable: Financial Protector not ok.');
  }

  // ---- Confidence ----
  var confidence;
  if (!fp || !fp.ok)      { confidence = 'LOW'; }
  else if (stale)         { confidence = 'STALE'; }
  else                    { confidence = 'OK'; }

  return {
    asOf:               snap.exists && snap.date ? snap.date : null,
    cashPositionStale:  stale,
    cashPositionAgeDays: ageDays,

    totalBusinessCash:  totalBusinessCash,
    physicalCash:       physicalCash,
    drawerCash:         drawerCash,
    bankCash:           bankCash,
    taylorHeldCash:     null,             // no column in CASH_POSITION -> NEEDS_VERIFICATION
    committedAssigned:  committedAssigned,
    freeOperatingCash:  freeOperatingCash,

    reservesLedger:     reservesLedger,
    reservesModelReconciled: false,       // snapshot assigned vs buckets not yet reconciled

    rentMonthly:        rentMonthly,
    rentProtected:      rentProtected,
    rentShortfall:      rentShortfall,
    rentSource:         rentSource,

    physicalCashSource: 'CASH_POSITION latest snapshot (never FP_CONFIG.cash.locations)',
    confidence:         confidence,
    notes:              notes
  };
}




/**********************************************************************
 * SALES (READ-ONLY)
 * Reuses api_getOwnerDashboard() — does NOT build a second SALES reader.
 **********************************************************************/

function oc_buildSales_(dash) {
  var out = {
    todayAmount: null, todayCount: null, weekSales: null, weekUnits: null,
    byCategory: null, source: 'SALES via api_getOwnerDashboard()'
  };
  if (dash && dash.ok && dash.financial) {
    var f = dash.financial;
    out.todayAmount = (typeof f.todaySalesAmt === 'number') ? f.todaySalesAmt : null;
    out.todayCount  = (typeof f.todaySalesCount === 'number') ? f.todaySalesCount : null;
    out.weekSales   = (typeof f.weekSales === 'number') ? f.weekSales : null;
    out.weekUnits   = (typeof f.weekUnits === 'number') ? f.weekUnits : null;
    out.byCategory  = f.todayCategories || null;
  }
  return out;
}




/**********************************************************************
 * PUBLIC API — api_getOwnerCheckin(slot)
 * READ-ONLY. Slice 1 returns money + sales + freshness/confidence only.
 * No questions, no Pushover, no writes.
 **********************************************************************/

function api_getOwnerCheckin(slot) {
  try {
    if (!oc_slotValid_(slot)) {
      return { ok: false, error: 'Unknown slot: ' + slot + ' (expected MORNING|MIDDAY|AFTERNOON|CLOSING)' };
    }

    var now = new Date();
    var tz  = (typeof Session !== 'undefined' && Session.getScriptTimeZone)
      ? Session.getScriptTimeZone() : 'America/Chicago';
    var generatedAt = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm');
    var scriptTime  = Utilities.formatDate(now, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");

    // ---- Existing approved readers (all read-only) ----
    var fp = null, dash = null, ss = null;
    try { fp = (typeof api_getFinancialProtector === 'function') ? api_getFinancialProtector() : null; } catch (e1) { fp = null; }
    try { dash = (typeof api_getOwnerDashboard === 'function') ? api_getOwnerDashboard() : null; } catch (e2) { dash = null; }
    try { ss = (typeof fp_openSheet_ === 'function') ? fp_openSheet_() : null; } catch (e3) { ss = null; }

    var snap  = oc_readCashSnapshot_(ss);
    var money = oc_buildMoney_(ss, fp, snap, now);
    var sales = oc_buildSales_(dash);

    var dataFreshness = {
      cashPositionSnapshotDate: (snap.exists && snap.date)
        ? Utilities.formatDate(snap.date, tz, 'yyyy-MM-dd') : null,
      cashPositionStale:   money.cashPositionStale,
      cashPositionAgeDays: money.cashPositionAgeDays,
      financialProtectorOk: !!(fp && fp.ok),
      ownerDashboardOk:     !!(dash && dash.ok)
    };

    return {
      ok:            true,
      slot:          String(slot),
      slotTime:      OC_SLOTS[String(slot)],
      generatedAt:   generatedAt,
      scriptTime:    scriptTime,
      money:         money,
      sales:         sales,
      dataFreshness: dataFreshness,
      confidence:    money.confidence,
      writeBoundary: 'READ_ONLY'
    };
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : String(e), writeBoundary: 'READ_ONLY' };
  }
}




/**********************************************************************
 * TEST WRAPPERS (READ-ONLY) — run manually in the Apps Script editor.
 * These only READ and Logger.log; they never write.
 **********************************************************************/

function runOwnerCheckinMorning() {
  var r = api_getOwnerCheckin('MORNING');
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}


function runOwnerCheckinAllSlots() {
  var slots = ['MORNING', 'MIDDAY', 'AFTERNOON', 'CLOSING'];
  var out = {};
  for (var i = 0; i < slots.length; i++) {
    var r = api_getOwnerCheckin(slots[i]);
    out[slots[i]] = { ok: r.ok, confidence: r.confidence, writeBoundary: r.writeBoundary,
                      rentShortfall: r.money ? r.money.rentShortfall : null,
                      freeOperatingCash: r.money ? r.money.freeOperatingCash : null,
                      cashPositionStale: r.dataFreshness ? r.dataFreshness.cashPositionStale : null };
  }
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
