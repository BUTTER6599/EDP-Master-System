/**
 * EDP Customer Portal V3 — Hold Request Gateway (TEST ONLY)
 *
 * Purpose:
 *   Write a customer Hold Request draft row into the existing
 *   CUSTOMER_HOLDS tab in EDP_MASTER_DATABASE. Only the 7 columns the
 *   CUSTOMER_HOLDS schema already defines are written. Extended data
 *   from the frontend draft (fulfillment, delivery address + questions,
 *   photo placeholders, accessory questions, warranty text, policy
 *   revision) is NOT persisted here — the schema does not accommodate
 *   it. The frontend keeps that extra data in sessionStorage until a
 *   verified schema extension is approved.
 *
 * Not a top-level doPost: this file exports handleHoldRequest_() which
 * is called by the dispatcher in sms-consent-gateway.gs after the
 * shared secret and TEST environment have been validated. There is
 * only one doPost per Apps Script project and sms-consent-gateway.gs
 * owns it.
 *
 * CUSTOMER_HOLDS schema (verified 2026-10-02 via Drive export):
 *   A hold_id       e.g. "HR-20261002-0001"
 *   B item_id       e.g. "A-12345"
 *   C customer_name
 *   D phone         10 digits
 *   E hold_time     "yyyy-MM-dd HH:mm:ss z" in America/Chicago
 *   F expires_at    blank at request time; EDP fills on confirmation
 *   G status        "PENDING_REVIEW"
 */

const HOLD_SHEET_NAME = 'CUSTOMER_HOLDS';
const HOLD_STATUS_PENDING = 'PENDING_REVIEW';
const HOLD_ID_PREFIX = 'HR-';
const HOLD_EXPECTED_HEADERS = [
  'hold_id', 'item_id', 'customer_name', 'phone',
  'hold_time', 'expires_at', 'status'
];

function handleHoldRequest_(payload) {
  const itemId = holdCleanText_(payload.item_id, 60);
  const customerName = holdCleanText_(payload.customer_name, 120);
  const phone = holdPhoneDigits_(payload.phone);

  if (!itemId) return holdJsonResponse_({ ok: false, error: 'invalid_item_id' });
  if (!customerName) return holdJsonResponse_({ ok: false, error: 'invalid_customer_name' });
  if (phone.length !== 10) return holdJsonResponse_({ ok: false, error: 'invalid_phone' });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return holdJsonResponse_({ ok: false, error: 'busy_retry' });
  }

  try {
    const ss = SpreadsheetApp.openById(EDP_MASTER_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(HOLD_SHEET_NAME);
    if (!sheet) {
      return holdJsonResponse_({ ok: false, error: 'hold_sheet_missing' });
    }

    const lastColumn = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
    const missing = HOLD_EXPECTED_HEADERS.filter(function (h) { return headers.indexOf(h) === -1; });
    if (missing.length) {
      return holdJsonResponse_({ ok: false, error: 'hold_schema_mismatch', missing: missing });
    }

    const now = new Date();
    const dateStamp = Utilities.formatDate(now, 'America/Chicago', 'yyyyMMdd');
    const holdTime = Utilities.formatDate(now, 'America/Chicago', 'yyyy-MM-dd HH:mm:ss z');
    const holdId = holdGenerateId_(sheet, dateStamp);

    const record = {
      hold_id: holdId,
      item_id: itemId,
      customer_name: customerName,
      phone: phone,
      hold_time: holdTime,
      expires_at: '',
      status: HOLD_STATUS_PENDING
    };

    const row = headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
    });
    sheet.appendRow(row);

    return holdJsonResponse_({
      ok: true,
      hold_id: holdId,
      hold_time: holdTime,
      status: HOLD_STATUS_PENDING,
      persisted_fields: HOLD_EXPECTED_HEADERS.slice()
    });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return holdJsonResponse_({ ok: false, error: 'hold_gateway_error' });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Scans column A (hold_id) for existing IDs that match HR-<dateStamp>-NNNN
 * and returns the next ID. The scan runs under the caller's lock so no
 * two concurrent writes allocate the same NNNN. Linear-scan is fine at
 * this volume; CUSTOMER_HOLDS starts empty and the sheet is small.
 */
function holdGenerateId_(sheet, dateStamp) {
  const lastRow = sheet.getLastRow();
  let max = 0;
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const prefix = HOLD_ID_PREFIX + dateStamp + '-';
    for (let i = 0; i < values.length; i += 1) {
      const cell = String(values[i][0] || '');
      if (cell.indexOf(prefix) === 0) {
        const n = parseInt(cell.slice(prefix.length), 10);
        if (isFinite(n) && n > max) max = n;
      }
    }
  }
  const seq = max + 1;
  const padded = ('0000' + seq).slice(-4);
  return HOLD_ID_PREFIX + dateStamp + '-' + padded;
}

function holdCleanText_(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength || 500);
}

function holdPhoneDigits_(value) {
  let digits = String(value == null ? '' : value).replace(/\D/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
  return digits;
}

function holdJsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
