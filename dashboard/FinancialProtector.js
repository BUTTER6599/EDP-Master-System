// ============================================================
// FinancialProtector.gs - EDP Dashboard V1 (config-driven)
// Read-only. No writes, no schema changes, no new tabs.
// Reads existing tabs when data is present; falls back to
// FP_CONFIG estimates otherwise. Every section reports a
// `source`: 'live' (from sheet), 'config' (fixed policy
// number), or 'estimate' (config-derived approximation).
// ============================================================

var FP_CONFIG = {
  cash: {
    // Reserved money is INSIDE total cash. Assigned reduces available.
    locations: [
      { name: 'Cash Drawer',                     amount: 35 },
      { name: 'Office Cash / Buying Cash',       amount: 220 },
      { name: 'Whitney Hancock Payroll Reserve', amount: 700 },
      { name: 'Relay Balance Estimate',          amount: 700 },
      { name: 'Savings Account',                 amount: 0 }
    ],
    assigned: [
      { name: 'IRS Payment Plan Reserve', amount: 461 },
      { name: 'Payroll Tax Reserve',      amount: 244 },
      { name: 'Payroll Reserve',          amount: 700 }
    ]
  },

  rent: {
    priority: 1,
    monthly: 3600,
    idealDueRange: '1st-15th',
    currentPattern: 'paid by 5th of following month',
    fundGoal: 10800,
    stretchGoal: 14400,
    fundBalance: 0
  },

  taxes: {
    priority: 2,
    payrollTaxWeekly: 225,
    salesTaxReserve: 0,
    taxReserveGoal: 20000,
    taxReserveBalance: 0,
    irsPlan: {
      monthly: 236,
      originalBalance: 5500,
      started: 'Dec 15',
      note: 'Separate IRS_PAYMENT_PLAN bucket - never lumped into the Tax Fund'
    }
  },

  payroll: {
    priority: 3,
    payrollTaxWeekly: 225,
    employees: [
      { name: 'Taylor',   slow: 265, normal: 300, strong: 500 },
      { name: 'Joe',      weekly: 400 },
      { name: 'Kenneth',  weekly: 300 },
      { name: 'Clarence', weekly: 100 }
    ]
  },

  sales: {
    priority: 4,
    slow: 2000,
    average: 2500,
    strong: 3000,
    survival: 3500,
    growth: 4500
  },

  inventory: {
    priority: 5,
    applianceUnits: 80,
    applianceUnitCost: 65,
    applianceValue: 5200,
    partsValue: 300,
    purchaseBudgetLow: 600,
    purchaseBudgetHigh: 1200,
    purchaseBudgetNormal: 900
  },

  funds: [
    { name: 'Emergency Fund',        balance: 0, goal: 16000 },
    { name: 'Tax Reserve',           balance: 0, goal: 20000 },
    { name: 'Rent Protection',       balance: 0, goal: 10800, stretch: 14400 },
    { name: 'Payroll Protection',    balance: 0, goal: 600, goalPhase2: 1200 },
    { name: 'Insurance Protection',  balance: 0, goal: 3000 },
    { name: 'Opportunity Fund',      balance: 0, goal: 1000, goalPhase2: 2500, goalPhase3: 5000 },
    { name: 'Expansion',             balance: 0, goal: 5000, goalLongTerm: 200000 },
    { name: 'Equipment Fund',        balance: 0, goal: 5000 },
    { name: 'New Parts Fund',        balance: 0, goal: 500 },
    { name: 'Used Parts Fund',       balance: 0, goal: 200 },
    { name: 'Service / Delivery Fund', balance: 0, goal: 600 }
  ],

  priorities: [
    'Rent', 'Taxes', 'Payroll', 'Sales Growth', 'Inventory Buying',
    'Emergency Fund', 'Insurance', 'Opportunity Fund', 'Equipment Fund', 'Expansion Fund'
  ],

  bills: [
    { name: 'Rent',              amount: 3600 },
    { name: 'BCBS',              amount: 460 },
    { name: 'Workers Comp',      amount: 221 },
    { name: 'RingCentral',       low: 225, high: 250, variable: true },
    { name: 'T-Mobile',          low: 225, high: 245, variable: true },
    { name: 'Bookkeeping / ASU', amount: 195, dueNote: 'around 8th-9th' },
    { name: 'ChatGPT',           amount: 20 },
    { name: 'Claude',            amount: 20 },
    { name: 'Gemini',            amount: 20 },
    { name: 'Google Workspace',  amount: 18.48 },
    { name: 'Shopify',           amount: 42.80, note: 'may cancel soon' },
    { name: 'YouTube/Music',     amount: 20 },
    { name: 'Twilio',            amount: 15, alert: 25, variable: true },
    { name: 'VAPI',              variable: true, note: 'track separately' }
  ]
};

// ---- Read helpers (defensive; return null when data is absent) ----

function fp_openSheet_() {
  var id = (typeof DASH_SHEET_ID !== 'undefined' && DASH_SHEET_ID)
    ? DASH_SHEET_ID
    : '117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI';
  try { return SpreadsheetApp.openById(id); } catch (e) { return null; }
}

function fp_headers_(data) {
  return data[0].map(function (h) { return String(h).toLowerCase().trim(); });
}

function fp_readSalesWeek_(ss, weekStart, weekEnd) {
  try {
    var sh = ss.getSheetByName('SALES');
    if (!sh) return null;
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return null;
    var h = fp_headers_(data);
    var dCol = h.indexOf('sale_date');
    if (dCol < 0) dCol = h.indexOf('timestamp');
    if (dCol < 0) dCol = 1;
    var aCol = h.indexOf('amount');
    if (aCol < 0) return null;
    var total = 0, count = 0, any = false;
    for (var i = 1; i < data.length; i++) {
      var v = data[i][dCol];
      if (!v) continue;
      any = true;
      var dt = (v instanceof Date) ? v : new Date(v);
      if (isNaN(dt.getTime())) continue;
      if (dt >= weekStart && dt <= weekEnd) {
        total += parseFloat(data[i][aCol]) || 0;
        count++;
      }
    }
    if (!any) return null;
    return { total: total, count: count };
  } catch (e) { return null; }
}

function fp_readLatestCash_(ss) {
  try {
    var sh = ss.getSheetByName('CASH_POSITION');
    if (!sh) return null;
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return null;
    var h = fp_headers_(data);
    var last = data[data.length - 1];
    var emCol = h.indexOf('emergency_fund_balance');
    var wcCol = h.indexOf('war_chest_balance');
    var caCol = h.indexOf('cash_available');
    return {
      cashAvailable: caCol >= 0 ? (parseFloat(last[caCol]) || 0) : null,
      emergency:     emCol >= 0 ? (parseFloat(last[emCol]) || 0) : null,
      warChest:      wcCol >= 0 ? (parseFloat(last[wcCol]) || 0) : null
    };
  } catch (e) { return null; }
}

function fp_readBills_(ss) {
  try {
    var sh = ss.getSheetByName('BILLS');
    if (!sh) return null;
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return null;
    var h = fp_headers_(data);
    var nCol = h.indexOf('bill_name');
    var aCol = h.indexOf('amount_due');
    var dCol = h.indexOf('due_date');
    var sCol = h.indexOf('status');
    var pCol = h.indexOf('priority');
    var out = [];
    for (var i = 1; i < data.length; i++) {
      var nm = nCol >= 0 ? String(data[i][nCol] || '').trim() : '';
      if (!nm) continue;
      out.push({
        name:     nm,
        amount:   aCol >= 0 ? (parseFloat(data[i][aCol]) || 0) : 0,
        dueDate:  dCol >= 0 ? data[i][dCol] : '',
        status:   sCol >= 0 ? String(data[i][sCol] || '') : '',
        priority: pCol >= 0 ? data[i][pCol] : ''
      });
    }
    return out.length ? out : null;
  } catch (e) { return null; }
}

function fp_readInventory_(ss) {
  try {
    var out = { units: null, applianceValue: null, partsValue: null };
    var app = ss.getSheetByName('APPLIANCES');
    if (app) {
      var ad = app.getDataRange().getValues();
      if (ad.length > 1) {
        var ah = fp_headers_(ad);
        var cbCol = ah.indexOf('cost_basis');
        var idCol = ah.indexOf('item_id');
        var units = 0, val = 0;
        for (var i = 1; i < ad.length; i++) {
          var id = idCol >= 0 ? String(ad[i][idCol] || '').trim() : '';
          if (!id) continue;
          units++;
          if (cbCol >= 0) val += parseFloat(ad[i][cbCol]) || 0;
        }
        if (units > 0) { out.units = units; out.applianceValue = val; }
      }
    }
    var parts = ss.getSheetByName('PARTS');
    if (parts) {
      var pd = parts.getDataRange().getValues();
      if (pd.length > 1) {
        var ph = fp_headers_(pd);
        var costCol = ph.indexOf('cost');
        var qtyCol = ph.indexOf('quantity');
        var pidCol = ph.indexOf('part_id');
        var pval = 0, pany = false;
        for (var j = 1; j < pd.length; j++) {
          var pid = pidCol >= 0 ? String(pd[j][pidCol] || '').trim() : '';
          if (!pid) continue;
          pany = true;
          var c = costCol >= 0 ? (parseFloat(pd[j][costCol]) || 0) : 0;
          var q = qtyCol >= 0 ? (parseFloat(pd[j][qtyCol]) || 1) : 1;
          pval += c * (q || 1);
        }
        if (pany) out.partsValue = pval;
      }
    }
    if (out.units === null && out.partsValue === null) return null;
    return out;
  } catch (e) { return null; }
}

// ---- Small computation helpers ----

function fp_salesTier_(amount, s) {
  if (amount >= s.growth)   return 'GROWTH';
  if (amount >= s.survival) return 'SURVIVAL';
  if (amount >= s.strong)   return 'STRONG';
  if (amount >= s.average)  return 'AVERAGE';
  if (amount >= s.slow)     return 'SLOW';
  return 'BELOW_SLOW';
}

function fp_estWeeklyPayroll_(weekSales) {
  var e = FP_CONFIG.payroll.employees;
  var taylor = e[0].normal;
  if (weekSales < FP_CONFIG.sales.average)      taylor = e[0].slow;
  else if (weekSales >= FP_CONFIG.sales.strong) taylor = e[0].strong;
  var total = taylor + e[1].weekly + e[2].weekly + e[3].weekly +
              FP_CONFIG.payroll.payrollTaxWeekly;
  return { taylor: taylor, total: total };
}

// Convert a Date to a string so google.script.run can serialize the payload.
// Raw Date objects in the return break the bridge and deliver null to the
// client success handler.
function fp_dateToStr_(d, fmt) {
  if (!d) return '';
  if (!(d instanceof Date)) return String(d);
  var tz = Session.getScriptTimeZone() || 'America/Chicago';
  return Utilities.formatDate(d, tz, fmt || 'yyyy-MM-dd');
}

// Earned-so-far this pay week for one person, by first name, reusing the
// existing TIME_LOGS pay computation (no re-implementation of matching).
function fp_earnedForWeek_(firstName, timeLogs, now, weekStart, weekEnd) {
  if (typeof EDP_EMPLOYEES === 'undefined' || typeof buildEmployeeData !== 'function') {
    return 0;
  }
  var target = String(firstName || '').toLowerCase();
  for (var k = 0; k < EDP_EMPLOYEES.length; k++) {
    var nm = String(EDP_EMPLOYEES[k].name || '').split(' ')[0].toLowerCase();
    if (nm === target) {
      try {
        var ed = buildEmployeeData(EDP_EMPLOYEES[k], timeLogs || [], now, weekStart, weekEnd, weekStart);
        return (ed && ed.week && typeof ed.week.totalPay === 'number') ? ed.week.totalPay : 0;
      } catch (e) { return 0; }
    }
  }
  return 0;
}

// ---- Main read-only API ----

function api_getFinancialProtector() {
  try {
    var now = new Date();
    var ss = fp_openSheet_();

    // Pay-week bounds: Tuesday 10AM -> Monday 5PM.
    var weekStart;
    if (typeof getPayWeekStart === 'function') {
      weekStart = getPayWeekStart(now);
    } else {
      weekStart = new Date(now);
      weekStart.setHours(0, 0, 0, 0);
    }
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(17, 0, 0, 0);

    var i;

    // ---- Cash Position ----
    var locTotal = 0;
    for (i = 0; i < FP_CONFIG.cash.locations.length; i++) {
      locTotal += FP_CONFIG.cash.locations[i].amount;
    }
    var assignedTotal = 0;
    for (i = 0; i < FP_CONFIG.cash.assigned.length; i++) {
      assignedTotal += FP_CONFIG.cash.assigned[i].amount;
    }
    var liveCash = ss ? fp_readLatestCash_(ss) : null;
    var cashPosition = {
      totalCash:     locTotal,
      assignedCash:  assignedTotal,
      availableCash: locTotal - assignedTotal,
      locations:     FP_CONFIG.cash.locations,
      assigned:      FP_CONFIG.cash.assigned,
      source: 'estimate'
    };

    // ---- Sales (live week sum if SALES has rows) ----
    var sw = ss ? fp_readSalesWeek_(ss, weekStart, weekEnd) : null;
    var weekSales = sw ? sw.total : FP_CONFIG.sales.average;
    var salesStatus = {
      priority:  FP_CONFIG.sales.priority,
      bands: {
        slow: FP_CONFIG.sales.slow, average: FP_CONFIG.sales.average,
        strong: FP_CONFIG.sales.strong, survival: FP_CONFIG.sales.survival,
        growth: FP_CONFIG.sales.growth
      },
      weekSales: weekSales,
      weekUnits: sw ? sw.count : null,
      tier:      fp_salesTier_(weekSales, FP_CONFIG.sales),
      source:    sw ? 'live' : 'estimate'
    };

    // ---- Payroll Command Center (targets + earned-so-far from TIME_LOGS) ----
    var pay = fp_estWeeklyPayroll_(weekSales);

    // Taylor owner-pay budget = sales-tier band (never driven by her hourly
    // time-log pay). slow < 2000 <= normal < 3000 <= strong.
    var taylorBudget;
    if (weekSales < FP_CONFIG.sales.slow)        taylorBudget = FP_CONFIG.payroll.employees[0].slow;
    else if (weekSales < FP_CONFIG.sales.strong) taylorBudget = FP_CONFIG.payroll.employees[0].normal;
    else                                         taylorBudget = FP_CONFIG.payroll.employees[0].strong;

    var payTimeLogs = (ss && typeof readTimeLogs === 'function') ? readTimeLogs(ss, weekStart) : [];

    var payDefs = [
      { name: 'Taylor',   role: 'Owner Pay',      budget: taylorBudget,
        note: 'Owner pay (sales-tier band); earned shown for reference only.' },
      { name: 'Joe',      role: 'Lead Tech',      budget: FP_CONFIG.payroll.employees[1].weekly, note: '' },
      { name: 'Kenneth',  role: 'General Helper', budget: FP_CONFIG.payroll.employees[2].weekly, note: '' },
      { name: 'Clarence', role: 'General Labor',  budget: FP_CONFIG.payroll.employees[3].weekly, note: '' }
    ];

    var people = [];
    var totalBudget = 0, totalEarned = 0;
    for (i = 0; i < payDefs.length; i++) {
      var pdf = payDefs[i];
      var earned = Math.round(fp_earnedForWeek_(pdf.name, payTimeLogs, now, weekStart, weekEnd) * 100) / 100;
      var pct = pdf.budget > 0 ? Math.round((earned / pdf.budget) * 1000) / 10 : 0;
      var remaining = Math.round((pdf.budget - earned) * 100) / 100;
      people.push({
        name: pdf.name, role: pdf.role,
        weeklyBudget: pdf.budget, earned: earned,
        pctUsed: pct, remaining: remaining, note: pdf.note
      });
      totalBudget += pdf.budget;
      totalEarned += earned;
    }
    totalEarned = Math.round(totalEarned * 100) / 100;
    var totalRemaining = Math.round((totalBudget - totalEarned) * 100) / 100;

    var payrollTaxReserved = 0;
    for (i = 0; i < FP_CONFIG.cash.assigned.length; i++) {
      if (String(FP_CONFIG.cash.assigned[i].name).toLowerCase().indexOf('payroll tax') >= 0) {
        payrollTaxReserved = FP_CONFIG.cash.assigned[i].amount;
      }
    }
    var payrollTaxTarget = FP_CONFIG.payroll.payrollTaxWeekly;
    var payrollTaxNeeded = Math.max(0, payrollTaxTarget - payrollTaxReserved);

    var payrollRec;
    if (weekSales < FP_CONFIG.sales.slow) {
      payrollRec = 'Sales below slow-week floor. Keep Joe only if needed; limit Kenneth and Clarence.';
    } else if (weekSales < FP_CONFIG.sales.strong) {
      payrollRec = 'Keep Joe active. Use Kenneth/Clarence only for priority tasks.';
    } else {
      payrollRec = 'Normal crew allowed, but watch payroll cap.';
    }

    // ---- Payroll Efficiency (employee labor only: Joe + Kenneth + Clarence) ----
    var employeeLaborUsed = 0, employeeLaborBudget = 0, anyEmployeeOverBudget = false;
    for (i = 0; i < people.length; i++) {
      if (people[i].role === 'Owner Pay') continue;   // exclude Taylor owner pay
      employeeLaborUsed += people[i].earned;
      employeeLaborBudget += people[i].weeklyBudget;
      if (people[i].earned > people[i].weeklyBudget) anyEmployeeOverBudget = true;
    }
    employeeLaborUsed = Math.round(employeeLaborUsed * 100) / 100;
    var employeeLaborRemaining = Math.round((employeeLaborBudget - employeeLaborUsed) * 100) / 100;

    var laborPercentOfSales = (weekSales > 0)
      ? Math.round((employeeLaborUsed / weekSales) * 1000) / 10
      : null;

    var laborRisk, laborRiskLabel, laborRiskReason;
    if (anyEmployeeOverBudget) {
      laborRisk = 'RED'; laborRiskLabel = 'High';
      laborRiskReason = 'One or more employees are over their weekly budget.';
    } else if (laborPercentOfSales === null) {
      laborRisk = 'GREEN'; laborRiskLabel = 'Healthy';
      laborRiskReason = 'No sales recorded yet; labor percent unavailable.';
    } else if (laborPercentOfSales > 25) {
      laborRisk = 'RED'; laborRiskLabel = 'High';
      laborRiskReason = 'Employee labor is ' + laborPercentOfSales + '% of sales (over 25%).';
    } else if (laborPercentOfSales >= 15) {
      laborRisk = 'YELLOW'; laborRiskLabel = 'Watch';
      laborRiskReason = 'Employee labor is ' + laborPercentOfSales + '% of sales (15-25%).';
    } else {
      laborRisk = 'GREEN'; laborRiskLabel = 'Healthy';
      laborRiskReason = 'Employee labor is ' + laborPercentOfSales + '% of sales (under 15%).';
    }

    // ---- Next Week Schedule Advisor (Friday 5 PM of this pay week, script TZ) ----
    var friday5 = new Date(weekStart);          // weekStart = Tuesday of this pay week
    friday5.setDate(friday5.getDate() + 3);     // -> Friday
    friday5.setHours(17, 0, 0, 0);              // 5 PM
    var schedMode = (now >= friday5) ? 'FINAL' : 'PRELIMINARY';

    var schedTier, schedHeadline, schedPeople;
    if (weekSales < FP_CONFIG.sales.slow) {
      schedTier = 'TIGHT';
      schedHeadline = 'Tight schedule next week. Protect Joe; minimal helper hours; cut Clarence first.';
      schedPeople = [
        { name: 'Joe',      recommendedHours: '10-15 hours', note: 'Priority worker' },
        { name: 'Kenneth',  recommendedHours: '3-5 hours',   note: 'Small cleaning/loading shifts' },
        { name: 'Clarence', recommendedHours: '0-2 hours',   note: 'Transition labor; limit first' }
      ];
    } else if (weekSales < FP_CONFIG.sales.strong) {
      schedTier = 'NORMAL';
      schedHeadline = 'Keep Joe active next week. Limited helper hours.';
      schedPeople = [
        { name: 'Joe',      recommendedHours: '15-20 hours', note: 'Priority worker' },
        { name: 'Kenneth',  recommendedHours: '5-8 hours',   note: 'Small cleaning/loading shifts' },
        { name: 'Clarence', recommendedHours: '0-4 hours',   note: 'Transition labor; limit first' }
      ];
    } else {
      schedTier = 'STRONG';
      schedHeadline = 'Normal crew allowed next week, but watch the payroll cap.';
      schedPeople = [
        { name: 'Joe',      recommendedHours: '20-25 hours', note: 'Priority worker' },
        { name: 'Kenneth',  recommendedHours: '8-12 hours',  note: 'Cleaning/loading + support' },
        { name: 'Clarence', recommendedHours: '4-8 hours',   note: 'Transition labor' }
      ];
    }
    var scheduleAdvisor = {
      mode: schedMode,
      tier: schedTier,
      headline: schedHeadline,
      people: schedPeople,
      taylorNote: 'Taylor: owner coverage (owner pay is separate from employee payroll).'
    };

    var payrollStatus = {
      priority:           FP_CONFIG.payroll.priority,
      employees:          FP_CONFIG.payroll.employees,
      payrollTaxWeekly:   FP_CONFIG.payroll.payrollTaxWeekly,
      estTaylorThisWeek:  pay.taylor,
      estWeeklyPayroll:   pay.total,
      people:             people,
      totalBudget:        totalBudget,
      totalEarned:        totalEarned,
      totalRemaining:     totalRemaining,
      payrollTaxTarget:   payrollTaxTarget,
      payrollTaxReserved: payrollTaxReserved,
      payrollTaxNeeded:   payrollTaxNeeded,
      employeeLaborUsed:      employeeLaborUsed,
      employeeLaborBudget:    employeeLaborBudget,
      employeeLaborRemaining: employeeLaborRemaining,
      laborPercentOfSales:    laborPercentOfSales,
      laborRisk:              laborRisk,
      laborRiskLabel:         laborRiskLabel,
      laborRiskReason:        laborRiskReason,
      anyEmployeeOverBudget:  anyEmployeeOverBudget,
      scheduleAdvisor:        scheduleAdvisor,
      recommendation:     payrollRec,
      source: (payTimeLogs && payTimeLogs.length) ? 'live' : 'config'
    };

    // ---- Rent ----
    var rentBill = null;
    var liveBills = ss ? fp_readBills_(ss) : null;
    if (liveBills) {
      for (i = 0; i < liveBills.length; i++) {
        if (String(liveBills[i].name).toLowerCase().indexOf('rent') >= 0) {
          rentBill = liveBills[i]; break;
        }
      }
    }
    var rentStatus = {
      priority:       FP_CONFIG.rent.priority,
      monthly:        FP_CONFIG.rent.monthly,
      idealDueRange:  FP_CONFIG.rent.idealDueRange,
      currentPattern: FP_CONFIG.rent.currentPattern,
      fundGoal:       FP_CONFIG.rent.fundGoal,
      stretchGoal:    FP_CONFIG.rent.stretchGoal,
      fundBalance:    FP_CONFIG.rent.fundBalance,
      pctToGoal:      FP_CONFIG.rent.fundGoal ?
                        Math.round((FP_CONFIG.rent.fundBalance / FP_CONFIG.rent.fundGoal) * 1000) / 10 : 0,
      dueDate:        rentBill ? fp_dateToStr_(rentBill.dueDate) : '',
      billStatus:     rentBill ? rentBill.status : '',
      source: rentBill ? 'live' : 'config'
    };

    // ============================================================
    // RENT PROTECTION (Financial Protector V3 - Engine)
    // Read-only analysis of rent coverage, shortfall, and urgency.
    // Recommends buying locks and owner actions.
    // ============================================================
    var rp_available   = cashPosition.availableCash;
    var rp_monthly     = rentStatus.monthly || 0;
    var rp_isCovered   = rp_available >= rp_monthly;
    var rp_shortfall   = Math.max(0, rp_monthly - rp_available);
    var rp_daysUntilDue = null;
    if (rentBill && rentBill.dueDate && rentBill.dueDate instanceof Date) {
      var rp_today = new Date(now);
      rp_today.setHours(0, 0, 0, 0);
      var rp_dueDate = new Date(rentBill.dueDate);
      rp_dueDate.setHours(0, 0, 0, 0);
      rp_daysUntilDue = Math.ceil((rp_dueDate - rp_today) / (1000 * 60 * 60 * 24));
      if (rp_daysUntilDue < 0) rp_daysUntilDue = 0;
    }
    var rp_currentDailySalesRate = (weekSales > 0) ? weekSales / 7 : 0;
    var rp_requiredDailySales = (rp_daysUntilDue > 0) ? rp_shortfall / rp_daysUntilDue : (rp_shortfall > 0 ? rp_shortfall : 0);
    var rp_dailySalesGap = Math.max(0, rp_requiredDailySales - rp_currentDailySalesRate);

    // -- Mode determination (COVERED | SHORT | DANGER | CRITICAL) --
    var rp_mode;
    if (rp_isCovered) {
      rp_mode = 'COVERED';
    } else if (rp_daysUntilDue === null || rp_daysUntilDue <= 3) {
      rp_mode = 'CRITICAL';
    } else if (rp_daysUntilDue <= 7) {
      rp_mode = 'DANGER';
    } else {
      rp_mode = 'SHORT';
    }

    // -- Buying lock decision --
    var rp_buyingLocked = (rp_mode !== 'COVERED');

    // -- Alerts --
    var rp_alerts = [
      { key: 'rentNotCovered', active: rp_shortfall > 0,
        message: rp_shortfall > 0
          ? 'Available cash $' + Math.round(rp_available) + ' is $' + Math.round(rp_shortfall) + ' short of monthly rent.'
          : 'Rent is fully covered by available cash.' },
      { key: 'urgentSales', active: (rp_mode === 'DANGER' || rp_mode === 'CRITICAL'),
        message: rp_daysUntilDue ? ('Need $' + Math.round(rp_requiredDailySales) + '/day to cover rent in ' + rp_daysUntilDue + ' days.')
          : 'Rent due date unknown; sales priority urgent.' },
      { key: 'fundingBehind', active: (rentStatus.pctToGoal < 50),
        message: 'Rent Protection Fund is ' + rentStatus.pctToGoal + '% to goal.' }
    ];

    // -- Formatted due date text --
    var rp_rentDueDateText = rentBill ? fp_dateToStr_(rentBill.dueDate) : 'Unknown';

    var rentProtection = {
      isCovered:    rp_isCovered,
      shortfall:    rp_shortfall,
      daysUntilDue: rp_daysUntilDue,
      dangerDays:   7,
      requiredDailySales: Math.round(rp_requiredDailySales * 100) / 100,
      currentDailySalesRate: Math.round(rp_currentDailySalesRate * 100) / 100,
      dailySalesGap: Math.round(rp_dailySalesGap * 100) / 100,
      inventoryBuyingLocked: rp_buyingLocked,
      mode: rp_mode,
      rentDueDateText: rp_rentDueDateText,
      alerts: rp_alerts,
      source: 'estimate'
    };

    // ---- Taxes (IRS plan kept separate) ----
    var taxStatus = {
      priority:          FP_CONFIG.taxes.priority,
      payrollTaxWeekly:  FP_CONFIG.taxes.payrollTaxWeekly,
      salesTaxReserve:   FP_CONFIG.taxes.salesTaxReserve,
      taxReserveGoal:    FP_CONFIG.taxes.taxReserveGoal,
      taxReserveBalance: FP_CONFIG.taxes.taxReserveBalance,
      irsPlan:           FP_CONFIG.taxes.irsPlan,
      source: 'config'
    };

    // ---- Inventory ----
    var inv = ss ? fp_readInventory_(ss) : null;
    var invLive = !!(inv && (inv.units !== null || inv.partsValue !== null));
    var inventoryStatus = {
      priority:           FP_CONFIG.inventory.priority,
      applianceUnits:     (inv && inv.units !== null) ? inv.units : FP_CONFIG.inventory.applianceUnits,
      applianceUnitCost:  FP_CONFIG.inventory.applianceUnitCost,
      applianceValue:     (inv && inv.applianceValue !== null) ? inv.applianceValue : FP_CONFIG.inventory.applianceValue,
      partsValue:         (inv && inv.partsValue !== null) ? inv.partsValue : FP_CONFIG.inventory.partsValue,
      purchaseBudgetLow:  FP_CONFIG.inventory.purchaseBudgetLow,
      purchaseBudgetHigh: FP_CONFIG.inventory.purchaseBudgetHigh,
      purchaseBudgetNormal: FP_CONFIG.inventory.purchaseBudgetNormal,
      source: invLive ? 'live' : 'estimate'
    };

    // ---- Funds (config; Emergency balance can come live from CASH_POSITION) ----
    var funds = [];
    var totalGoal = 0, totalBalance = 0;
    for (i = 0; i < FP_CONFIG.funds.length; i++) {
      var f = FP_CONFIG.funds[i];
      var bal = f.balance;
      if (f.name === 'Emergency Fund' && liveCash && liveCash.emergency !== null) {
        bal = liveCash.emergency;
      }
      var goal = f.goal || 0;
      funds.push({
        name: f.name, balance: bal, goal: goal,
        stretch: f.stretch || null,
        goalPhase2: f.goalPhase2 || null,
        goalPhase3: f.goalPhase3 || null,
        goalLongTerm: f.goalLongTerm || null,
        pctToGoal: goal ? Math.round((bal / goal) * 1000) / 10 : 0
      });
      totalGoal += goal;
      totalBalance += bal;
    }
    var fundStatus = {
      funds: funds,
      totalBalance: totalBalance,
      totalGoal: totalGoal,
      priorities: FP_CONFIG.priorities,
      source: (liveCash && liveCash.emergency !== null) ? 'live' : 'config'
    };

    // ---- Bills ----
    var billsList, billsSource;
    if (liveBills) {
      billsList = [];
      for (i = 0; i < liveBills.length; i++) {
        var lb = liveBills[i];
        billsList.push({
          name: lb.name, amount: lb.amount,
          dueDate: fp_dateToStr_(lb.dueDate),
          status: lb.status, priority: lb.priority
        });
      }
      billsSource = 'live';
    } else {
      billsList = FP_CONFIG.bills; billsSource = 'config';
    }
    var billsLow = 0, billsHigh = 0;
    for (i = 0; i < billsList.length; i++) {
      var b = billsList[i];
      if (typeof b.amount === 'number') { billsLow += b.amount; billsHigh += b.amount; }
      else {
        if (typeof b.low === 'number')  billsLow  += b.low;
        if (typeof b.high === 'number') billsHigh += b.high;
      }
    }
    var billsStatus = {
      bills: billsList,
      monthlyTotalLow:  Math.round(billsLow * 100) / 100,
      monthlyTotalHigh: Math.round(billsHigh * 100) / 100,
      source: billsSource
    };

    // ---- Owner Briefing (Red / Yellow / Green) ----
    var available = cashPosition.availableCash;
    var rentMonthly = FP_CONFIG.rent.monthly;
    var s = FP_CONFIG.sales;
    var status = 'YELLOW';
    var reasons = [];
    if (available < 0) {
      status = 'RED'; reasons.push('Available cash is negative.');
    } else if (weekSales < s.slow) {
      status = 'RED'; reasons.push('Week sales below the slow-week floor ($' + s.slow + ').');
    } else if (available < rentMonthly && weekSales < s.survival) {
      status = 'RED';
      reasons.push('Rent not yet covered by available cash and sales below survival target.');
    } else if (weekSales >= s.growth && available >= rentMonthly) {
      status = 'GREEN';
      reasons.push('Sales at/above growth target and rent covered by available cash.');
    } else {
      status = 'YELLOW';
      if (weekSales < s.survival) reasons.push('Sales below survival target ($' + s.survival + ').');
      if (totalBalance <= 0) reasons.push('Protection funds are unfunded.');
      if (available < rentMonthly) reasons.push('Available cash below one month of rent.');
      if (reasons.length === 0) reasons.push('Stable but not yet at growth target.');
    }
    var ownerBriefing = { status: status, reasons: reasons, source: 'estimate' };

    // ---- Recommended Action ----
    var gap = rentMonthly - available;
    var actionText;
    if (status === 'RED') {
      actionText = 'Rent is priority #1. Available $' + Math.round(available) +
        ' vs rent $' + rentMonthly + ' (gap $' + Math.round(Math.max(0, gap)) +
        '). Sell floor-ready units and hold all non-essential spending until rent is secured.';
    } else if (status === 'YELLOW') {
      actionText = 'Stabilizing. Hit the survival target $' + s.survival +
        '/week, then begin funding Emergency and Rent Protection per the priority order.';
    } else {
      actionText = 'On track - sales at/above growth target. Allocate surplus to Emergency first, ' +
        'then Rent Protection, following the priority order.';
    }
    var recommendedAction = { text: actionText, source: 'estimate' };

    // ============================================================
    // CASH PROTECTION (Financial Protector V3 - Chunk A)
    // Read-only composite derived ONLY from values already computed
    // above (cashPosition, salesStatus, payrollStatus, rentStatus,
    // taxStatus, fundStatus, billsStatus, inventoryStatus). Produces a
    // 0-100 survival score, sub-scores, alerts, cash runway, and buy/
    // opening/staffing recommendations. No writes, no new reads.
    // ============================================================
    var cp_available   = cashPosition.availableCash;
    var cp_rentMonthly = rentStatus.monthly || 0;

    // -- Weekly burn: payroll (incl. payroll tax) + weekly rent + other bills.
    // The bills list already includes Rent, so subtract it to avoid double count.
    var cp_weeklyRent    = cp_rentMonthly / 4.33;
    var cp_billsMonthly  = (billsStatus && typeof billsStatus.monthlyTotalHigh === 'number')
                             ? billsStatus.monthlyTotalHigh : 0;
    var cp_otherBills    = cp_billsMonthly - cp_rentMonthly;
    if (cp_otherBills < 0) cp_otherBills = 0;
    var cp_weeklyOther   = cp_otherBills / 4.33;
    var cp_weeklyPayroll = (typeof payrollStatus.estWeeklyPayroll === 'number')
                             ? payrollStatus.estWeeklyPayroll : 0;
    var cp_weeklyBurn    = Math.round((cp_weeklyPayroll + cp_weeklyRent + cp_weeklyOther) * 100) / 100;

    // -- Cash runway --
    var cp_runwayWeeks = 0;
    if (cp_available > 0 && cp_weeklyBurn > 0) {
      cp_runwayWeeks = cp_available / cp_weeklyBurn;
    } else if (cp_available > 0 && cp_weeklyBurn <= 0) {
      cp_runwayWeeks = 99;
    }
    var cp_runwayDays = Math.round(cp_runwayWeeks * 7);
    cp_runwayWeeks = Math.round(cp_runwayWeeks * 10) / 10;

    // -- Sub-scores (each 0-100) --
    // Rent: cash coverage of one month rent (70) + rent-fund progress (30).
    var cp_rentCoverage = cp_rentMonthly > 0 ? Math.min(cp_available / cp_rentMonthly, 1) : 1;
    var cp_rentFundProg = (rentStatus.fundGoal > 0)
                            ? Math.min((rentStatus.fundBalance || 0) / rentStatus.fundGoal, 1) : 0;
    var cp_rentScore = Math.round(cp_rentCoverage * 70 + cp_rentFundProg * 30);

    // Payroll: labor-risk band (60) + payroll-tax reserve coverage (40).
    var cp_payBase = 60;
    if (payrollStatus.laborRisk === 'GREEN') cp_payBase = 100;
    else if (payrollStatus.laborRisk === 'YELLOW') cp_payBase = 60;
    else if (payrollStatus.laborRisk === 'RED') cp_payBase = 25;
    var cp_payTaxCov = (payrollStatus.payrollTaxTarget > 0)
                         ? Math.min((payrollStatus.payrollTaxReserved || 0) / payrollStatus.payrollTaxTarget, 1) : 1;
    var cp_payrollScore = Math.round(cp_payBase * 0.6 + cp_payTaxCov * 40);

    // Tax: tax-reserve goal progress (60) + payroll-tax reserve coverage (40).
    var cp_taxReserveProg = (taxStatus.taxReserveGoal > 0)
                              ? Math.min((taxStatus.taxReserveBalance || 0) / taxStatus.taxReserveGoal, 1) : 0;
    var cp_taxScore = Math.round(cp_taxReserveProg * 60 + cp_payTaxCov * 40);

    // Sales: weekly-sales tier band.
    var cp_salesScore;
    switch (salesStatus.tier) {
      case 'GROWTH':   cp_salesScore = 100; break;
      case 'SURVIVAL': cp_salesScore = 80;  break;
      case 'STRONG':   cp_salesScore = 65;  break;
      case 'AVERAGE':  cp_salesScore = 50;  break;
      case 'SLOW':     cp_salesScore = 35;  break;
      default:         cp_salesScore = 15;  break;
    }

    // Cash runway: 8 weeks of runway = full marks.
    var cp_runwayScore;
    if (cp_available <= 0) cp_runwayScore = 0;
    else if (cp_weeklyBurn <= 0) cp_runwayScore = 100;
    else cp_runwayScore = Math.round(Math.min(cp_runwayWeeks / 8, 1) * 100);

    // Clamp every sub-score to 0..100.
    cp_rentScore    = Math.max(0, Math.min(100, cp_rentScore));
    cp_payrollScore = Math.max(0, Math.min(100, cp_payrollScore));
    cp_taxScore     = Math.max(0, Math.min(100, cp_taxScore));
    cp_salesScore   = Math.max(0, Math.min(100, cp_salesScore));
    cp_runwayScore  = Math.max(0, Math.min(100, cp_runwayScore));

    // -- Weighted survival score (rent 30, payroll 20, tax 15, sales 20, runway 15) --
    var cp_survivalScore = Math.round(
      cp_rentScore * 0.30 + cp_payrollScore * 0.20 + cp_taxScore * 0.15 +
      cp_salesScore * 0.20 + cp_runwayScore * 0.15
    );
    cp_survivalScore = Math.max(0, Math.min(100, cp_survivalScore));

    // -- Mode (matches card thresholds: <40 RED, 40-69 YELLOW, >=70 GREEN) --
    var cp_mode;
    if (cp_survivalScore >= 70) cp_mode = 'HEALTHY';
    else if (cp_survivalScore >= 40) cp_mode = 'CAUTION';
    else cp_mode = 'LOCKDOWN';

    // -- Alert flags --
    var cp_rentNotCovered = cp_available < cp_rentMonthly;
    var cp_rentDanger     = cp_rentNotCovered || cp_rentScore < 40;
    var cp_payrollDanger  = payrollStatus.laborRisk === 'RED' || cp_payrollScore < 40;
    var cp_taxDanger      = cp_taxScore < 40;
    var cp_buyingLockdown = cp_mode === 'LOCKDOWN' || cp_rentNotCovered;
    var cp_safeToBuy      = !cp_buyingLockdown && cp_mode === 'HEALTHY' &&
                            payrollStatus.laborRisk !== 'RED';

    var cp_alerts = [
      { key: 'rentDanger',     label: 'Rent Danger',     level: 'danger', active: cp_rentDanger,
        message: cp_rentDanger
          ? 'Available cash $' + Math.round(cp_available) + ' vs monthly rent $' + cp_rentMonthly + '.'
          : 'Rent position healthy.' },
      { key: 'payrollDanger',  label: 'Payroll Danger',  level: 'danger', active: cp_payrollDanger,
        message: cp_payrollDanger
          ? (payrollStatus.laborRiskReason || 'Payroll under strain.')
          : 'Payroll within budget.' },
      { key: 'taxDanger',      label: 'Tax Danger',      level: 'danger', active: cp_taxDanger,
        message: cp_taxDanger
          ? 'Tax reserves low (tax score ' + cp_taxScore + ').'
          : 'Tax reserves on track.' },
      { key: 'buyingLockdown', label: 'Buying Lockdown', level: 'danger', active: cp_buyingLockdown,
        message: cp_buyingLockdown
          ? 'Hold inventory buying until rent is covered and the score recovers.'
          : 'Buying not locked.' },
      { key: 'safeToBuy',      label: 'Safe To Buy',     level: 'safe',   active: cp_safeToBuy,
        message: cp_safeToBuy
          ? 'Cash position healthy - inventory buying is approved.'
          : 'Not yet safe to buy at full budget.' }
    ];

    // -- Purchase budget recommendation (gated by mode) --
    var cp_buyAmount, cp_buyLabel;
    if (cp_buyingLockdown) {
      cp_buyAmount = 0;
      cp_buyLabel = 'Locked - cover rent and lift the survival score first.';
    } else if (cp_mode === 'HEALTHY') {
      cp_buyAmount = inventoryStatus.purchaseBudgetHigh;
      cp_buyLabel = 'Healthy - full weekly buying budget.';
    } else {
      cp_buyAmount = inventoryStatus.purchaseBudgetNormal;
      cp_buyLabel = 'Caution - normal weekly buying budget only.';
    }
    var cp_purchaseBudgetRecommendation = {
      amount:     cp_buyAmount,
      weeklyLow:  inventoryStatus.purchaseBudgetLow,
      weeklyHigh: inventoryStatus.purchaseBudgetHigh,
      label:      cp_buyLabel
    };

    // -- Tuesday opening recommendation (pay week starts Tuesday) --
    var cp_tuesdayText;
    if (cp_mode === 'LOCKDOWN') {
      cp_tuesdayText = 'Open lean Tuesday. Minimal float, essential coverage only, hold non-critical spend.';
    } else if (cp_mode === 'CAUTION') {
      cp_tuesdayText = 'Open normal Tuesday. Standard float; prioritize rent and tax reserves before buying.';
    } else {
      cp_tuesdayText = 'Open strong Tuesday. Standard float; surplus can fund reserves and approved buying.';
    }
    var cp_tuesdayOpening = { recommendation: cp_tuesdayText, mode: cp_mode };

    // -- Friday staffing recommendation (reuse existing Schedule Advisor) --
    var cp_sa = payrollStatus.scheduleAdvisor || {};
    var cp_fridayStaffing = {
      mode:     cp_sa.mode || '',
      tier:     cp_sa.tier || '',
      headline: cp_sa.headline || '',
      people:   cp_sa.people || []
    };

    var cashProtection = {
      survivalScore: cp_survivalScore,
      mode: cp_mode,
      scoreBreakdown: {
        rent:       cp_rentScore,
        payroll:    cp_payrollScore,
        tax:        cp_taxScore,
        sales:      cp_salesScore,
        cashRunway: cp_runwayScore
      },
      alerts: cp_alerts,
      cashRunway: {
        weeks:      cp_runwayWeeks,
        days:       cp_runwayDays,
        weeklyBurn: cp_weeklyBurn
      },
      purchaseBudgetRecommendation: cp_purchaseBudgetRecommendation,
      tuesdayOpening: cp_tuesdayOpening,
      fridayStaffing: cp_fridayStaffing,
      source: 'estimate'
    };

    return {
      ok: true,
      version: 'fp-v1',
      generatedAt: fp_dateToStr_(now, 'yyyy-MM-dd HH:mm'),
      week: {
        weekStart: fp_dateToStr_(weekStart),
        weekEnd: fp_dateToStr_(weekEnd),
        weekId: (typeof computeWeekId === 'function') ? computeWeekId(now) : ''
      },
      cashPosition:      cashPosition,
      rentStatus:        rentStatus,
      taxStatus:         taxStatus,
      payrollStatus:     payrollStatus,
      salesStatus:       salesStatus,
      inventoryStatus:   inventoryStatus,
      fundStatus:        fundStatus,
      billsStatus:       billsStatus,
      ownerBriefing:     ownerBriefing,
      recommendedAction: recommendedAction,
      cashProtection:    cashProtection,
      rentProtection:    rentProtection
    };

  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : String(e) };
  }
}
