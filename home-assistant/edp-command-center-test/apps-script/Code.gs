/**
 * EDP Home Assistant TEST Bridge
 * Read-only JSON summaries from EDP_MASTER_DATABASE.
 * No writes. No customer phone/email output. No payroll dollar detail.
 * Requires Script Property EDP_BRIDGE_KEY and matching ?key= value.
 */
const EDP = {
  spreadsheetId: '117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI',
  mode: 'TEST',
  schemaVersion: '1.0.0',
  timezone: 'America/Chicago'
};

function doGet(e) {
  try {
    if (!authorized_(e)) {
      return json_({
        status: 'BLOCKED',
        mode: EDP.mode,
        schema_version: EDP.schemaVersion,
        generated_at: new Date().toISOString(),
        error: 'UNAUTHORIZED'
      });
    }

    const view = String((e && e.parameter && e.parameter.view) || 'all').toLowerCase();
    const payload = buildPayload_();
    const body = view === 'all' ? payload : {
      status: payload.status,
      mode: payload.mode,
      schema_version: payload.schema_version,
      generated_at: payload.generated_at,
      source: payload.source,
      data: payload[view] || null
    };
    return json_(body);
  } catch (err) {
    return json_({
      status: 'BLOCKED',
      mode: EDP.mode,
      schema_version: EDP.schemaVersion,
      generated_at: new Date().toISOString(),
      error: String(err && err.message ? err.message : err)
    });
  }
}

function authorized_(e) {
  const expected = PropertiesService.getScriptProperties().getProperty('EDP_BRIDGE_KEY');
  const supplied = String((e && e.parameter && e.parameter.key) || '');
  return !!expected && supplied === expected;
}

function buildPayload_() {
  const ss = SpreadsheetApp.openById(EDP.spreadsheetId);
  const now = new Date();

  const tasks = readObjects_(ss, 'TASKS_TEST');
  const bills = readObjects_(ss, 'BILLS');
  const schedule = readObjects_(ss, 'SCHEDULE');
  const timeLogs = readObjects_(ss, 'TIME_LOGS');
  const kiosk = readObjects_(ss, 'KIOSK_MESSAGES');
  const sales = readObjects_(ss, 'SALES');
  const purchases = readObjects_(ss, 'PURCHASES');
  const appliances = readObjects_(ss, 'APPLIANCES');
  const repairs = readObjects_(ss, 'REPAIR_TICKETS');
  const parts = readObjects_(ss, 'PARTS');

  return {
    status: 'TEST',
    mode: EDP.mode,
    schema_version: EDP.schemaVersion,
    generated_at: now.toISOString(),
    source: {
      system: 'Google Sheets / Apps Script',
      spreadsheet_id: EDP.spreadsheetId,
      spreadsheet_name: ss.getName()
    },
    tasks: summarizeTasks_(tasks),
    bills: summarizeBills_(bills),
    schedule: summarizeSchedule_(schedule, now),
    team: summarizeTeam_(timeLogs),
    kiosk: summarizeKiosk_(kiosk),
    sales: summarizeSales_(sales, now),
    purchases: summarizePurchases_(purchases, now),
    inventory: summarizeInventory_(appliances),
    repairs: summarizeRepairs_(repairs, now),
    parts: summarizeParts_(parts),
    notifications: {
      source_status: 'TEST',
      alerts: buildAlerts_(tasks, bills, repairs, parts)
    },
    security: {
      source_status: 'BLOCKED',
      reason: 'Home Assistant registry/entity IDs unavailable to this build session'
    },
    frigate: {
      source_status: 'BLOCKED',
      reason: 'Camera/Frigate entity or MQTT event IDs not verified'
    },
    locks: {
      source_status: 'BLOCKED',
      reason: 'Lock entity IDs not visible in current Assist-level API'
    },
    alarm: {
      source_status: 'BLOCKED',
      reason: 'alarm_control_panel entity IDs not visible in current Assist-level API'
    }
  };
}

function readObjects_(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return [];
  const values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  return values.slice(1).filter(r => r.some(v => String(v).trim() !== '')).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] !== undefined ? row[i] : '');
    return obj;
  });
}

function summarizeTasks_(rows) {
  const active = rows.filter(r =>
    truthy_(r.active) &&
    ['open','in_progress','waiting'].includes(norm_(r.status))
  );
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  active.sort((a,b) =>
    (rank[norm_(a.priority)] ?? 9) - (rank[norm_(b.priority)] ?? 9) ||
    String(a.due_date || '9999-99-99').localeCompare(String(b.due_date || '9999-99-99'))
  );
  return {
    source_status: 'TEST',
    open_count: active.length,
    urgent_count: active.filter(r => norm_(r.priority) === 'urgent').length,
    items: active.slice(0, 8).map(r => ({
      task_id: r.task_id,
      title: r.title,
      category: r.category,
      status: r.status,
      priority: r.priority,
      owner: r.owner,
      due_date: r.due_date,
      next_action: r.next_action
    }))
  };
}

function summarizeBills_(rows) {
  const attention = rows.filter(r => {
    const s = norm_(r.status);
    return s && !['paid','closed','complete','completed'].some(x => s.includes(x));
  });
  attention.sort((a,b) => {
    const da = dateMs_(a.due_date) || Number.MAX_SAFE_INTEGER;
    const db = dateMs_(b.due_date) || Number.MAX_SAFE_INTEGER;
    return da - db;
  });
  return {
    source_status: 'TEST',
    attention_count: attention.length,
    items: attention.slice(0, 6).map(r => ({
      bill_id: r.bill_id,
      bill_name: r.bill_name,
      due_date: r.due_date,
      status: r.status,
      priority: r.priority
    }))
  };
}

function summarizeSchedule_(rows, now) {
  const day = Utilities.formatDate(now, EDP.timezone, 'EEE').toUpperCase();
  const today = rows.filter(r => truthy_(r.Active) && String(r.DayOfWeek || '').toUpperCase().startsWith(day));
  const badTime = today.some(r => String(r.ClockInTime || '').includes('1899') || String(r.ClockOutTime || '').includes('1899'));
  return {
    source_status: 'TEST',
    source_quality: badTime ? 'NEEDS_TIME_NORMALIZATION' : 'OK',
    today_count: today.length,
    items: today.slice(0, 8).map(r => ({
      employee_id: r.EmployeeID,
      name: r.Name,
      clock_in: cleanSheetTime_(r.ClockInTime),
      clock_out: cleanSheetTime_(r.ClockOutTime)
    }))
  };
}

function summarizeTeam_(rows) {
  const latest = {};
  rows.forEach(r => {
    const key = r.EmployeeID || r.Name;
    if (!key) return;
    const t = dateMs_(r.Timestamp);
    if (!latest[key] || t >= latest[key].t) latest[key] = { t, row: r };
  });
  const clocked = Object.values(latest)
    .filter(x => norm_(x.row.Action) === 'clock_in')
    .map(x => x.row.Name || x.row.EmployeeID)
    .filter(Boolean);
  return {
    source_status: 'TEST',
    clocked_in_count: clocked.length,
    names: clocked.slice(0, 8)
  };
}

function summarizeKiosk_(rows) {
  const unread = rows.filter(r => !truthy_(r.Read));
  return {
    source_status: 'TEST',
    unread_count: unread.length,
    items: unread.slice(-5).reverse().map(r => ({
      timestamp: r.Timestamp,
      name: r.Name,
      direction: r.Direction
    }))
  };
}

function summarizeSales_(rows, now) {
  const start = new Date(now.getTime() - 7 * 86400000);
  const recent = rows.filter(r => dateMs_(r.sale_date || r.timestamp) >= start.getTime());
  return {
    source_status: 'TEST',
    count_7d: recent.length,
    amount_7d: round2_(recent.reduce((s,r) => s + num_(r.amount), 0))
  };
}

function summarizePurchases_(rows, now) {
  const start = new Date(now.getTime() - 7 * 86400000);
  const recent = rows.filter(r => dateMs_(r.purchase_date || r.timestamp) >= start.getTime());
  const unpaid = rows.filter(r => {
    const s = norm_(r.status);
    return s && !s.includes('paid') && !s.includes('complete');
  });
  return {
    source_status: 'TEST',
    count_7d: recent.length,
    amount_7d: round2_(recent.reduce((s,r) => s + num_(r.cost), 0)),
    unpaid_count: unpaid.length
  };
}

function summarizeInventory_(rows) {
  const available = rows.filter(r => norm_(r.status) === 'available');
  const floor = rows.filter(r => norm_(r.stage) === 'floor_ready');
  const notReady = rows.filter(r => ['not_ready','received','purchased'].includes(norm_(r.stage)));
  return {
    source_status: 'TEST',
    available_count: available.length,
    floor_ready_count: floor.length,
    not_ready_count: notReady.length
  };
}

function summarizeRepairs_(rows, now) {
  const open = rows.filter(r => {
    const s = norm_(r.status);
    return s && !['completed','delivered','paid','closed','cancelled'].some(x => s.includes(x));
  });
  const diagnosing = open.filter(r => norm_(r.status).includes('diagnos'));
  const overdue = open.filter(r => {
    const due = dateMs_(r.expected_out_date);
    return due > 0 && due < now.getTime();
  });
  return {
    source_status: 'TEST',
    open_count: open.length,
    diagnosing_count: diagnosing.length,
    overdue_count: overdue.length
  };
}

function summarizeParts_(rows) {
  const low = rows.filter(r => {
    const q = num_(r.quantity);
    return String(r.part_id || '').trim() && q <= 1;
  });
  return {
    source_status: 'TEST',
    low_stock_count: low.length,
    items: low.slice(0, 8).map(r => ({
      part_id: r.part_id,
      name: r.name,
      quantity: num_(r.quantity),
      condition: r.condition
    }))
  };
}

function buildAlerts_(tasks, bills, repairs, parts) {
  const alerts = [];
  const urgentTasks = tasks.filter(r => truthy_(r.active) && norm_(r.priority) === 'urgent' && norm_(r.status) !== 'done');
  if (urgentTasks.length) alerts.push({ severity: 'urgent', type: 'tasks', count: urgentTasks.length });
  const billAttention = bills.filter(r => /past due|suspend|overdue/i.test(String(r.status || '')));
  if (billAttention.length) alerts.push({ severity: 'high', type: 'bills', count: billAttention.length });
  const openRepairs = repairs.filter(r => {
    const s = norm_(r.status);
    return s && !['completed','delivered','paid','closed','cancelled'].some(x => s.includes(x));
  });
  if (openRepairs.length) alerts.push({ severity: 'normal', type: 'repairs', count: openRepairs.length });
  const lowParts = parts.filter(r => String(r.part_id || '').trim() && num_(r.quantity) <= 1);
  if (lowParts.length) alerts.push({ severity: 'normal', type: 'parts_low_stock', count: lowParts.length });
  return alerts;
}

function cleanSheetTime_(v) {
  const s = String(v || '');
  if (!s || s.includes('1899')) return '';
  return s;
}
function norm_(v) { return String(v || '').trim().toLowerCase(); }
function truthy_(v) { return ['true','yes','1','y'].includes(norm_(v)); }
function num_(v) {
  const n = Number(String(v || '').replace(/[$,]/g,''));
  return isFinite(n) ? n : 0;
}
function round2_(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function dateMs_(v) {
  if (!v) return 0;
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
