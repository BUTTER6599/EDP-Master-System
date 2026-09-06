/**
 * EDP Customer Portal V3 — Appliance Browse Gateway (TEST ONLY)
 *
 * Purpose:
 *   Read-only public listing endpoint for the customer portal.
 *   Returns the strict public-safe allowlist for appliances that
 *   are stage=FLOOR_READY AND status=AVAILABLE AND have a real
 *   list_price AND at least one usable photo.
 *
 * Anonymous, no shared secret. Nothing is written. No internal
 * fields (serial, cost_basis, notes, added_by, date_acquired,
 * days_on_hand, sku_id, spec_source, rating) are exposed.
 *
 * Naming convention: this file namespaces its top-level constants
 * and helpers with an APPLIANCE_ / applianceX_ prefix so it can
 * safely coexist with sms-consent-gateway.gs in a single Apps
 * Script project (both files would otherwise declare an identical
 * EDP_MASTER_SPREADSHEET_ID const and Apps Script's V8 loader
 * would throw on duplicate top-level const declarations).
 */

const APPLIANCE_SPREADSHEET_ID = '117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI';
const APPLIANCE_SHEET_NAME = 'APPLIANCES';

// Zero-indexed column positions in the APPLIANCES header row.
// Verified header row: A item_id ... Z spec_verified
const APPLIANCE_COL = {
  item_id: 0,
  sku_id: 1,
  category: 2,
  brand: 3,
  model: 4,
  serial: 5,
  condition: 6,
  list_price: 7,
  cost_basis: 8,
  rating: 9,
  warranty_tier: 10,
  fuel_type: 11,
  notes: 12,
  stage: 13,
  status: 14,
  days_on_hand: 15,
  date_acquired: 16,
  added_by: 17,
  photo_links: 18,
  width_in: 19,
  height_in: 20,
  depth_in: 21,
  capacity_cu_ft: 22,
  dimensions_display: 23,
  spec_source: 24,
  spec_verified: 25
};

// Condition values that may be shown to customers on the card.
// Anything else (Needs Repair, Parts Only, Scrap, Needs Cleaning,
// blank, unknown) is omitted from the response; the appliance is
// still listed as long as the primary filter passes.
const APPLIANCE_SAFE_CONDITIONS = {
  EXCELLENT: true,
  GOOD: true,
  FAIR: true,
  USED: true
};

// Standalone non-production markers. Matched as full tokens after
// uppercasing and splitting on non-alphanumeric characters, so
// "TEST-4321", "demo-01", "SAMPLE 99", "R-DUMMY-A" are excluded
// while legitimate words that merely contain these letter runs
// (GREATEST, PROTEST, DEMONSTRATE, SAMPLING, DEMONIC) are not.
const APPLIANCE_TEST_MARKERS = {
  TEST: true,
  DEMO: true,
  SAMPLE: true,
  DUMMY: true
};

// Customer-facing warranty text must never expose internal review markers.
// These are hygiene markers only; they do not decide the actual warranty.
const APPLIANCE_UNAPPROVED_WARRANTY_MARKERS = [
  'NEEDS VERIFICATION',
  'NOT YET APPROVED',
  'UNAPPROVED'
];

/**
 * Public endpoint. Anonymous callers receive only the allowlisted
 * projection. Errors are converted to a safe "unavailable" code so
 * no stack traces, no spreadsheet IDs, no diagnostic detail can
 * leak to the customer surface.
 */
function doGet() {
  try {
    const ss = SpreadsheetApp.openById(APPLIANCE_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(APPLIANCE_SHEET_NAME);
    if (!sheet) {
      return applianceJsonResponse_({ ok: false, error: 'unavailable' });
    }

    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) {
      return applianceJsonResponse_({ ok: true, count: 0, data: [] });
    }
    rows.shift(); // drop header

    const items = [];
    for (let i = 0; i < rows.length; i += 1) {
      const projected = applianceProjectPublic_(rows[i]);
      if (projected) items.push(projected);
    }

    return applianceJsonResponse_({ ok: true, count: items.length, data: items });
  } catch (err) {
    // Deliberately opaque. Log server-side for staff triage.
    console.error(err && err.stack ? err.stack : err);
    return applianceJsonResponse_({ ok: false, error: 'unavailable' });
  }
}

/**
 * Returns the public-safe object for a row, or null if the row
 * fails any filter rule.
 */
function applianceProjectPublic_(row) {
  const stage = String(row[APPLIANCE_COL.stage] || '').trim().toUpperCase();
  const status = String(row[APPLIANCE_COL.status] || '').trim().toUpperCase();
  if (stage !== 'FLOOR_READY' || status !== 'AVAILABLE') return null;

  const priceNum = Number(row[APPLIANCE_COL.list_price]);
  if (!isFinite(priceNum) || priceNum <= 0) return null;

  const photoLinks = appliancePhotoLinks_(row[APPLIANCE_COL.photo_links]);
  if (photoLinks.length === 0) return null;

  const itemId = String(row[APPLIANCE_COL.item_id] || '').trim();
  if (!itemId) return null;

  const brand = String(row[APPLIANCE_COL.brand] || '').trim();
  const model = String(row[APPLIANCE_COL.model] || '').trim();
  const category = String(row[APPLIANCE_COL.category] || '').trim();

  // Exclude obvious non-production inventory. Token-boundary match
  // across the identifying/display fields only -- deliberately does
  // NOT inspect `notes` (that's internal-only). See
  // APPLIANCE_TEST_MARKERS above for the exact standalone tokens
  // this rejects.
  if (applianceHasTestMarker_(itemId)) return null;
  if (applianceHasTestMarker_(brand)) return null;
  if (applianceHasTestMarker_(model)) return null;
  if (applianceHasTestMarker_(category)) return null;

  const warrantyTier = String(row[APPLIANCE_COL.warranty_tier] || '').trim();
  const fuelType = String(row[APPLIANCE_COL.fuel_type] || '').trim();

  const out = {
    item_id: itemId,
    category: category,
    brand: brand,
    model: model,
    list_price: priceNum,
    fuel_type: fuelType,
    photo_links: photoLinks
  };

  // Warranty — include only clean customer-facing values. Internal
  // review/verification markers remain in the authoritative Sheet
  // but are suppressed from the public projection.
  if (applianceWarrantyIsPublicSafe_(warrantyTier)) {
    out.warranty_tier = warrantyTier;
  }

  // Condition — omit unless in the safe set.
  const conditionRaw = String(row[APPLIANCE_COL.condition] || '').trim();
  if (APPLIANCE_SAFE_CONDITIONS[conditionRaw.toUpperCase()]) {
    out.condition = conditionRaw;
  }

  // Dimensions — include only when spec_verified is truthy on the
  // row. Individual empty/zero dimension cells are still dropped.
  if (applianceTruthyFlag_(row[APPLIANCE_COL.spec_verified])) {
    const width = Number(row[APPLIANCE_COL.width_in]);
    const height = Number(row[APPLIANCE_COL.height_in]);
    const depth = Number(row[APPLIANCE_COL.depth_in]);
    const capacity = Number(row[APPLIANCE_COL.capacity_cu_ft]);
    const display = String(row[APPLIANCE_COL.dimensions_display] || '').trim();
    if (isFinite(width) && width > 0) out.width_in = width;
    if (isFinite(height) && height > 0) out.height_in = height;
    if (isFinite(depth) && depth > 0) out.depth_in = depth;
    if (isFinite(capacity) && capacity > 0) out.capacity_cu_ft = capacity;
    if (display) out.dimensions_display = display;
  }

  return out;
}

/**
 * Parses a photo_links cell into an array of https URLs. Any
 * non-http entry is dropped so we don't hand customers relative
 * paths or blank strings.
 */
function appliancePhotoLinks_(value) {
  if (!value) return [];
  const raw = String(value).split(',');
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const link = raw[i].trim();
    if (link && (link.indexOf('http://') === 0 || link.indexOf('https://') === 0)) {
      out.push(link);
    }
  }
  return out;
}

/**
 * Returns true iff any standalone token in `value` (after uppercasing
 * and splitting on non-alphanumeric characters) matches one of the
 * APPLIANCE_TEST_MARKERS entries. Token-boundary matching means
 * "TEST-4321" -> excluded but "GREATEST" -> allowed.
 */
function applianceHasTestMarker_(value) {
  if (!value) return false;
  const upper = String(value).toUpperCase();
  const tokens = upper.split(/[^A-Z0-9]+/);
  for (let i = 0; i < tokens.length; i += 1) {
    if (APPLIANCE_TEST_MARKERS[tokens[i]]) return true;
  }
  return false;
}

/**
 * Returns true only for non-empty warranty text that does not contain
 * an internal review/approval marker. Matching is case-insensitive.
 */
function applianceWarrantyIsPublicSafe_(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return false;
  const upper = s.toUpperCase();
  for (let i = 0; i < APPLIANCE_UNAPPROVED_WARRANTY_MARKERS.length; i += 1) {
    if (upper.indexOf(APPLIANCE_UNAPPROVED_WARRANTY_MARKERS[i]) !== -1) return false;
  }
  return true;
}

/**
 * Sheet cells can carry booleans, numbers, or common truthy strings
 * (TRUE, YES, Y, 1, VERIFIED). Anything else is treated as falsy.
 */
function applianceTruthyFlag_(v) {
  if (v === true) return true;
  if (typeof v === 'number') return v !== 0;
  const s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'TRUE' || s === 'YES' || s === 'Y' || s === '1' || s === 'VERIFIED';
}

function applianceJsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
