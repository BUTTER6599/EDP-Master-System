/**
 * SheetLog.gs — appends exactly one row to the existing TEST_CALLS tab.
 *
 * The tab is treated as pre-existing and authoritative: whatever headers
 * are in row 1 decide the column order, and the record is mapped onto them
 * by name. A header this bridge has no value for is left blank rather than
 * shifting every other column. Headers are only written by this script
 * when the tab is completely empty.
 */

var DEFAULT_HEADERS = [
  'logged_at',
  'call_id',
  'event_type',
  'assistant_id',
  'assistant_name',
  'customer_number',
  'phone_number',
  'started_at',
  'ended_at',
  'duration_seconds',
  'ended_reason',
  'cost',
  'success_evaluation',
  'summary',
  'transcript',
  'recording_url',
  'structured_data'
];

/** Header text -> record key. Tolerates spacing, case, and common wording. */
var HEADER_ALIASES = {
  timestamp: 'logged_at',
  logged: 'logged_at',
  date: 'logged_at',
  call: 'call_id',
  callid: 'call_id',
  id: 'call_id',
  type: 'event_type',
  event: 'event_type',
  assistant: 'assistant_name',
  caller: 'customer_number',
  caller_number: 'customer_number',
  customer: 'customer_number',
  from: 'customer_number',
  to: 'phone_number',
  start: 'started_at',
  end: 'ended_at',
  duration: 'duration_seconds',
  duration_sec: 'duration_seconds',
  reason: 'ended_reason',
  end_reason: 'ended_reason',
  evaluation: 'success_evaluation',
  success: 'success_evaluation',
  notes: 'summary',
  recording: 'recording_url',
  audio: 'recording_url',
  data: 'structured_data'
};

/** Normalizes a header cell to a lookup key: "Call ID" -> "call_id". */
function normalizeHeader_(header) {
  return String(header === null || header === undefined ? '' : header)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Opens the configured tab, failing loudly if it is missing. */
function openTestCallsTab_() {
  var sheetId = cfgSheetId();
  var tabName = cfgSheetTab();
  var sheet = SpreadsheetApp.openById(sheetId).getSheetByName(tabName);
  if (!sheet) {
    throw new Error('Tab "' + tabName + '" not found in the configured TEST spreadsheet.');
  }
  return sheet;
}

/** Returns the header row, creating it only when the tab is untouched. */
function readOrSeedHeaders_(sheet) {
  if (sheet.getLastRow() > 0) {
    var width = Math.max(sheet.getLastColumn(), 1);
    var existing = sheet.getRange(1, 1, 1, width).getValues()[0];
    var hasHeader = existing.some(function (cell) {
      return String(cell).trim() !== '';
    });
    if (hasHeader) return existing;
  }
  sheet.getRange(1, 1, 1, DEFAULT_HEADERS.length).setValues([DEFAULT_HEADERS]);
  sheet.setFrozenRows(1);
  return DEFAULT_HEADERS.slice();
}

/** Builds the row array in the order the sheet's own headers dictate. */
function rowForHeaders_(headers, record) {
  return headers.map(function (header) {
    var key = normalizeHeader_(header);
    if (!(key in record) && key in HEADER_ALIASES) key = HEADER_ALIASES[key];
    var value = record[key];
    return value === undefined || value === null ? '' : value;
  });
}

/**
 * Durable duplicate check: scans the sheet's own call_id column. Vapi
 * retries end-of-call-report on a non-2xx, and the cache used upstream
 * expires, so the sheet itself is the only source of truth for "already
 * logged this call".
 */
function callAlreadyLogged_(sheet, headers, callId) {
  if (!callId) return false;
  var index = -1;
  for (var i = 0; i < headers.length; i++) {
    if (normalizeHeader_(headers[i]) === 'call_id') {
      index = i;
      break;
    }
  }
  if (index === -1) return false;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var column = sheet.getRange(2, index + 1, lastRow - 1, 1).getValues();
  for (var r = 0; r < column.length; r++) {
    if (String(column[r][0]).trim() === callId) return true;
  }
  return false;
}

/**
 * Appends the record. Returns true when a row was written, false when the
 * call was already present and the append was skipped.
 */
function logCallRow(record) {
  var sheet = openTestCallsTab_();
  var headers = readOrSeedHeaders_(sheet);

  if (callAlreadyLogged_(sheet, headers, record.call_id)) return false;

  sheet.appendRow(rowForHeaders_(headers, record));
  return true;
}
