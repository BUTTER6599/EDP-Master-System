/**
 * EDP Master Sheet -> Home Assistant bridge.
 *
 * Read-only JSON web app over EDP_MASTER_DATABASE. Home Assistant `rest`
 * sensors poll this; the Sheet stays authoritative. Nothing here writes.
 *
 * Scopes
 *   public  - safe for a kiosk or wall display. No money, no names, no PII.
 *   private - Taylor's devices only. Adds amounts, employee names, vendors.
 * Each field declares the lowest scope allowed to see it; anything not
 * declared never leaves the Sheet, so adding a column to a tab cannot
 * silently publish it.
 *
 * Setup: Project Settings -> Script Properties
 *   BRIDGE_TOKEN          required, grants scope=public
 *   BRIDGE_TOKEN_PRIVATE  required, grants scope=private
 *   SPREADSHEET_ID        optional, defaults to SHEET_ID below
 */

const SHEET_ID = '117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI';

/** Max rows returned per tab. Home Assistant keeps these in entity
 *  attributes; unbounded rows bloat the state machine and the recorder. */
const ROW_LIMIT = 25;

/** Seconds of CacheService reuse. Five HA sensors on a 5-minute poll stay
 *  well inside Apps Script quota with this on. */
const CACHE_TTL = 60;

/**
 * Tab registry.
 *
 * `sheet` names are the ones Taylor listed in the brief and are NOT yet
 * confirmed against the live spreadsheet - the Drive export this was built
 * from carries header rows but no tab names. Call ?list=1 after deploying
 * to get the real names, then correct any mismatch here. Every tab reports
 * `missing` rather than throwing, so a wrong name degrades one card instead
 * of the whole bridge.
 *
 * `status` mirrors the EDP LIVE/TEST/BLOCKED convention and is passed
 * through to the dashboard so a card can label itself honestly.
 */
const TABS = {
  TASKS: {
    sheet: 'TASKS_TEST',
    status: 'TEST',
    fields: {
      task_id: 'public', title: 'public', category: 'public',
      status: 'public', priority: 'public', due_date: 'public',
      list: 'public', next_action: 'public',
      owner: 'private', amount: 'private', location: 'private',
      notes: 'private'
    },
    // TASKS_TEST pads ~900 blank rows below the data; require a task_id.
    where: function (r) {
      return r.task_id && String(r.active).toUpperCase() !== 'FALSE' &&
        String(r.status).toLowerCase() !== 'done' &&
        String(r.status).toLowerCase() !== 'completed';
    },
    sort: function (a, b) { return rank(a.priority) - rank(b.priority); }
  },

  BILLS: {
    sheet: 'BILLS',
    status: 'TEST',
    // bill_name is private on purpose: this tab carries a health-insurance
    // line, and a bill name is enough to disclose it on a shared screen.
    fields: {
      bill_id: 'public', due_date: 'public', status: 'public',
      priority: 'public',
      bill_name: 'private', amount_due: 'private',
      fund_balance: 'private', notes: 'private', updated_by: 'private'
    },
    where: function (r) { return r.bill_id; },
    sort: function (a, b) { return rank(a.priority) - rank(b.priority); }
  },

  SCHEDULE: {
    sheet: 'SCHEDULE',
    status: 'TEST',
    fields: {
      DayOfWeek: 'public', Active: 'public',
      EmployeeID: 'private', Name: 'private',
      ClockInTime: 'private', ClockOutTime: 'private'
    },
    where: function (r) {
      return r.EmployeeID && String(r.Active).toUpperCase() !== 'FALSE';
    }
  },

  KIOSK: {
    sheet: 'KIOSK_MESSAGES',
    status: 'TEST',
    // Message bodies are staff-to-owner and never public.
    fields: {
      Timestamp: 'public', Direction: 'public', Read: 'public',
      EmployeeID: 'private', Name: 'private', Message: 'private'
    },
    where: function (r) {
      return r.Timestamp && String(r.Read).toUpperCase() !== 'TRUE';
    }
  },

  PURCHASES: {
    sheet: 'PURCHASES',
    status: 'TEST',
    fields: {
      purchase_id: 'public', purchase_date: 'public', category: 'public',
      status: 'public',
      vendor: 'private', item: 'private', cost: 'private', notes: 'private'
    },
    where: function (r) { return r.purchase_id; }
  },

  PARTS: {
    sheet: 'PARTS',
    status: 'TEST',
    fields: {
      part_id: 'public', name: 'public', category: 'public',
      quantity: 'public', brand: 'public', condition: 'public',
      cost: 'private', price: 'private', notes: 'private'
    },
    // Restock view: only what is actually low or out.
    where: function (r) {
      return r.part_id && Number(r.quantity || 0) <= 2;
    }
  },

  SALES: {
    sheet: 'SALES',
    status: 'TEST',
    // Individual sale amounts are private; the dashboard shows a count
    // publicly and the money only on Taylor's device.
    fields: {
      sale_id: 'public', sale_date: 'public', category: 'public',
      amount: 'private', payment_type: 'private', entered_by: 'private',
      invoice_number: 'private', notes: 'private'
    },
    where: function (r) { return r.sale_id; }
  },

  INVENTORY: {
    sheet: 'INVENTORY',
    status: 'BLOCKED',
    fields: {
      item_id: 'public', category: 'public', brand: 'public',
      stage: 'public', status: 'public', days_on_hand: 'public',
      model: 'private', serial: 'private', list_price: 'private',
      cost_basis: 'private'
    },
    where: function (r) { return r.item_id; }
  },

  REPAIRS: {
    sheet: 'REPAIR_PARTS',
    status: 'BLOCKED',
    fields: {
      'Repair Part ID': 'public', 'Date': 'public',
      'Appliance Type': 'public', 'Brand': 'public',
      'Part Name': 'public',
      'Unit ID': 'private', 'What Was Wrong': 'private',
      'Vendor Name': 'private', 'Our Cost': 'private',
      'Part Cost': 'private', 'Installed By': 'private'
    },
    where: function (r) { return r['Repair Part ID']; }
  },

  // Payroll is never exposed at public scope, at any field.
  PAYROLL: {
    sheet: 'PAYROLL',
    status: 'BLOCKED',
    fields: {
      payroll_id: 'private', week_id: 'private', employee: 'private',
      hours: 'private', rate: 'private', gross_pay: 'private',
      status: 'private'
    },
    where: function (r) { return r.payroll_id; }
  }
};

function rank(priority) {
  const p = String(priority || '').toLowerCase();
  if (p === '1' || p === 'high' || p === 'urgent') return 0;
  if (p === '2' || p === 'normal' || p === 'medium') return 1;
  return 2;
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const props = PropertiesService.getScriptProperties();

  const publicToken = props.getProperty('BRIDGE_TOKEN');
  const privateToken = props.getProperty('BRIDGE_TOKEN_PRIVATE');
  if (!publicToken || !privateToken) {
    return json({
      ok: false,
      error: 'Bridge not configured: set BRIDGE_TOKEN and ' +
        'BRIDGE_TOKEN_PRIVATE in Script Properties.'
    });
  }

  // The token presented decides the scope. A caller holding only the
  // public token cannot request private data by asking for it.
  let scope = null;
  if (params.key && safeEquals(params.key, privateToken)) scope = 'private';
  else if (params.key && safeEquals(params.key, publicToken)) scope = 'public';
  if (!scope) return json({ ok: false, error: 'Unauthorized' });

  if (params.health) return json(health(scope));
  if (params.list) {
    if (scope !== 'private') {
      return json({ ok: false, error: 'list requires the private token' });
    }
    return json(listSheets());
  }

  const name = String(params.tab || '').toUpperCase();
  const cfg = TABS[name];
  if (!cfg) {
    return json({
      ok: false, error: 'Unknown tab: ' + name,
      available: Object.keys(TABS)
    });
  }
  return json(readTab(name, cfg, scope));
}

/** Tab names are the one thing this build could not verify. Deploy, then
 *  hit ?list=1 with the private token to get them straight from the file. */
function listSheets() {
  const ss = SpreadsheetApp.openById(spreadsheetId());
  const sheets = ss.getSheets().map(function (s) {
    return {
      name: s.getName(),
      rows: s.getLastRow(),
      columns: s.getLastColumn(),
      header: s.getLastRow() > 0
        ? s.getRange(1, 1, 1, s.getLastColumn()).getDisplayValues()[0]
        : []
    };
  });
  const configured = {};
  Object.keys(TABS).forEach(function (k) {
    configured[k] = {
      sheet: TABS[k].sheet,
      found: ss.getSheetByName(TABS[k].sheet) !== null
    };
  });
  return {
    ok: true, generated_at: nowIso(), sheets: sheets, configured: configured
  };
}

function health(scope) {
  const ss = SpreadsheetApp.openById(spreadsheetId());
  const tabs = {};
  Object.keys(TABS).forEach(function (k) {
    const sheet = ss.getSheetByName(TABS[k].sheet);
    tabs[k] = {
      status: TABS[k].status,
      missing: sheet === null,
      rows: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0
    };
  });
  const missing = Object.keys(tabs).filter(function (k) {
    return tabs[k].missing;
  });
  return {
    ok: missing.length === 0,
    scope: scope,
    generated_at: nowIso(),
    spreadsheet: ss.getName(),
    missing_tabs: missing,
    tabs: tabs
  };
}

function readTab(name, cfg, scope) {
  const cacheKey = 'edp:' + name + ':' + scope;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  const ss = SpreadsheetApp.openById(spreadsheetId());
  const sheet = ss.getSheetByName(cfg.sheet);

  // A renamed or missing tab degrades this one card. It does not throw,
  // because a 500 here turns every HA sensor unavailable at once.
  if (!sheet) {
    return {
      ok: false, tab: name, sheet: cfg.sheet, status: 'BLOCKED',
      error: 'Tab not found. Run ?list=1 and correct TABS in Code.gs.',
      generated_at: nowIso(), count: 0, rows: []
    };
  }
  if (sheet.getLastRow() < 2) {
    return {
      ok: true, tab: name, sheet: cfg.sheet, status: cfg.status,
      generated_at: nowIso(), count: 0, total: 0, rows: [],
      note: 'Tab is empty.'
    };
  }

  // getDisplayValues, not getValues: the SCHEDULE tab stores clock times as
  // time-only cells that come back as 1899-12-30 date objects over JSON.
  // Display values are what the Sheet actually shows.
  const grid = sheet
    .getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn())
    .getDisplayValues();
  const header = grid[0].map(function (h) { return String(h).trim(); });

  const allowed = Object.keys(cfg.fields).filter(function (f) {
    return cfg.fields[f] === 'public' || scope === 'private';
  });

  // A tab with no public fields at all (PAYROLL) returns nothing at public
  // scope rather than a row of empty objects, so a public caller cannot
  // even count the rows.
  if (allowed.length === 0) {
    return {
      ok: true, tab: name, sheet: cfg.sheet, status: cfg.status,
      scope: scope, generated_at: nowIso(), count: 0, rows: [],
      note: 'No fields are readable at this scope.'
    };
  }

  const rows = [];
  for (let i = 1; i < grid.length; i++) {
    const full = {};
    for (let c = 0; c < header.length; c++) {
      if (header[c]) full[header[c]] = grid[i][c];
    }
    if (cfg.where && !cfg.where(full)) continue;
    // Project down to the allowed fields only after filtering, so a rule
    // can test a private column without that column being returned.
    const row = {};
    allowed.forEach(function (f) {
      if (f in full) row[f] = full[f];
    });
    rows.push(row);
  }

  if (cfg.sort) rows.sort(cfg.sort);
  const total = rows.length;
  const out = {
    ok: true,
    tab: name,
    sheet: cfg.sheet,
    status: cfg.status,
    scope: scope,
    generated_at: nowIso(),
    count: total,
    truncated: total > ROW_LIMIT,
    rows: rows.slice(0, ROW_LIMIT)
  };
  cache.put(cacheKey, JSON.stringify(out), CACHE_TTL);
  return out;
}

function spreadsheetId() {
  return PropertiesService.getScriptProperties()
    .getProperty('SPREADSHEET_ID') || SHEET_ID;
}

function nowIso() {
  return Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Length-independent compare, so a wrong token leaks no timing signal. */
function safeEquals(a, b) {
  const x = String(a), y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= x.charCodeAt(i % x.length || 0) ^ y.charCodeAt(i % y.length || 0);
  }
  return diff === 0;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
