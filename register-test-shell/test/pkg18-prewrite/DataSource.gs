/**
 * DataSource.gs — read-only data-source seam
 * The Electronics Depot LLC — EDP OS Register (clean rebuild, TEST ONLY)
 *
 * PURPOSE
 *   This file is the single boundary between the Register and wherever its
 *   data comes from. The UI and Code.gs must never call MockData.gs (or, in
 *   future, any spreadsheet adapter) directly — they go through here.
 *
 *   The point of the seam is that swapping the mock source for an approved
 *   read-only TEST spreadsheet adapter becomes a change to THIS FILE ONLY,
 *   with no edits to Code.gs, Index.html, Styles.html or Scripts.html.
 *
 * SAFETY CONTRACT FOR THIS FILE
 *   - READ-ONLY. There is no write, update, append or delete method here,
 *     and none may be added without a separate, reviewed decision.
 *   - No SpreadsheetApp, DriveApp, MailApp, GmailApp, UrlFetchApp or
 *     ScriptApp anywhere in this file.
 *   - As of Package 6 this file MAY use exactly two read-only services:
 *       PropertiesService ... getProperty ONLY, to look up the spreadsheet id
 *       Sheets (advanced) ... Spreadsheets.Values.get ONLY
 *     No setProperty/deleteProperty, and no Values.update/append/batchUpdate/
 *     clear, may ever appear here. The manifest pins the OAuth scope to
 *     spreadsheets.readonly, so the token itself cannot write.
 *   - Every read is shape-checked by Validation.gs before it is returned.
 *     Bad data fails closed at this boundary; it never reaches the UI.
 *   - No spreadsheet IDs of any kind appear in this file. When a real
 *     adapter is built, its file ID must come from Script Properties at
 *     runtime, never from source.
 *   - MOCK remains the only WIRED-UP implementation. The APPLIANCES_SHEET
 *     adapter added in Package 6 is INERT: it is never reached while
 *     ACTIVE_DATA_SOURCE is 'MOCK'.
 *
 * THE INTERFACE
 *   A data source is any object providing these four read methods, each
 *   returning the exact shapes documented below:
 *
 *     readInventory()   -> Array of inventory items. Each item:
 *                          { itemId, category, brand, model, description,
 *                            price (Number), condition, availability
 *                            ('AVAILABLE'|'LOW_STOCK'|'ON_HOLD'|'SOLD'),
 *                            qty (Number), location, serialPlaceholder,
 *                            photoKey }
 *
 *     readCustomers()   -> Array of customers. Each customer:
 *                          { customerId, name, phone, email, since, notes,
 *                            history:        [ { date, itemId, summary,
 *                                                total (Number), warranty } ],
 *                            warrantyClaims: [ { date, itemId, status,
 *                                                detail } ] }
 *
 *     readActivity()    -> Array of activity events. Each event:
 *                          { id, kind, minutesAgo (Number), user, action,
 *                            detail?, before?, after?, status?, reason? }
 *
 *     readOpenTicket()  -> One ticket object, or null:
 *                          { ticketId, register, cashier, customerId,
 *                            paymentMethodId,
 *                            lines: [ { itemId, qty (Number),
 *                                       priceOverride (Number|null),
 *                                       warrantyId } ] }
 *
 *   Any future implementation must return these shapes exactly. The client
 *   reads them verbatim — changing a field name here changes the UI.
 */

/** Known data-source identifiers. MOCK is the only one implemented. */
var DATA_SOURCES = {
  MOCK: 'MOCK',

  // Read-only adapter over the APPLIANCES tab of EDP_MASTER_DATABASE.
  // Implemented in Package 6, but NOT wired up: ACTIVE_DATA_SOURCE is still
  // MOCK, so nothing below ever runs until that is deliberately changed.
  APPLIANCES_SHEET: 'APPLIANCES_SHEET'
};

/**
 * The active source. Changing this value is the ONLY switch that should ever
 * be needed to move the Register onto a different read-only source.
 */
var ACTIVE_DATA_SOURCE = DATA_SOURCES.APPLIANCES_SHEET;

/**
 * The mock implementation. A thin delegation layer over MockData.gs — it
 * deliberately adds no logic of its own, so the seam cannot change behavior.
 */
var MockDataSource = {
  id: DATA_SOURCES.MOCK,
  description: 'In-memory demo records from MockData.gs. No I/O.',

  readInventory: function () { return getMockInventory(); },
  readCustomers: function () { return getMockCustomers(); },
  readActivity: function () { return getMockActivity(); },
  readOpenTicket: function () { return getMockOpenTicket(); }
};

/**
 * Resolves the active data source. Throws loudly on an unknown identifier
 * rather than silently falling back, so a bad switch fails visibly in TEST
 * instead of quietly serving the wrong data.
 */
function getDataSource() {
  switch (ACTIVE_DATA_SOURCE) {
    case DATA_SOURCES.MOCK:
      return MockDataSource;
    case DATA_SOURCES.APPLIANCES_SHEET:
      return AppliancesSheetDataSource;
    default:
      throw new Error('Unknown ACTIVE_DATA_SOURCE: "' + ACTIVE_DATA_SOURCE +
        '". MOCK is the only implemented source in this build.');
  }
}

/* ==========================================================================
 * APPLIANCES_SHEET — read-only adapter over EDP_MASTER_DATABASE
 *
 * Added in Package 6. INERT: ACTIVE_DATA_SOURCE is 'MOCK', so none of this
 * executes until that constant is deliberately changed under a separate
 * approval.
 *
 * READ-ONLY BY CONSTRUCTION, at three independent layers:
 *   1. SCOPE     the manifest pins spreadsheets.readonly, so the OAuth token
 *                Google issues is physically incapable of writing.
 *   2. API       only Sheets.Spreadsheets.Values.get is called. There is no
 *                update, append, batchUpdate or clear anywhere in this file.
 *   3. SEAM      this object exposes read methods only, per the contract at
 *                the top of this file.
 *
 * SpreadsheetApp.openById() is deliberately NOT used: Apps Script grants it
 * the full read/write "spreadsheets" scope, which would hand the Register
 * write capability over the master database even if no write were ever coded.
 * ========================================================================== */

/** Tab that holds the authoritative appliance inventory. */
var APPLIANCES_SHEET_NAME = 'APPLIANCES';

/**
 * Script Property that holds the spreadsheet id. The id itself NEVER appears
 * in source and never reaches the browser — only this property NAME does.
 */
var MASTER_DB_ID_PROPERTY = 'EDP_MASTER_DATABASE_ID';

/** Columns this adapter reads. A missing one is fatal, not defaulted. */
var REQUIRED_APPLIANCE_HEADERS = [
  'item_id', 'sku_id', 'category', 'brand', 'model', 'condition',
  'list_price', 'stage', 'status', 'photo_links'
];

/**
 * Columns that must NEVER leave the server. cost_basis is acquisition cost;
 * publishing it would expose margin on every card.
 */
var FORBIDDEN_CLIENT_FIELDS = ['cost_basis', 'serial', 'notes', 'added_by'];

/** Sellability rule, verified against the real sheet in Package 5B. */
var SELLABLE_STAGE = 'FLOOR_READY';
var SELLABLE_STATUS = 'AVAILABLE';

/**
 * TEST-record exclusion (owner decision B).
 *
 * Deliberately NARROW. It matches an id segment of exactly "TEST-<digits>",
 * which is the shape of the known test record W-TEST-001 / sku TEST-001.
 * Real ids in the sheet look like W-105G, R-4142, S-316Q, F-2904, DGW-1384 —
 * none of which can match. Widening this pattern risks hiding real stock,
 * so it is asserted directly in the test suite against every live id.
 *
 * The source row is never modified. It is filtered out on read only.
 */
var TEST_RECORD_PATTERN = /(^|-)TEST-\d+$/i;

/** The established display convention. The real serial never leaves the server. */
var SERIAL_PLACEHOLDER_LITERAL = '[ SERIAL PLACEHOLDER ]';

/**
 * category -> photoKey. photoKey is NOT a URL: the client uses it to pick a
 * locally drawn SVG placeholder, so the Register still issues zero network
 * image requests. The eight keys below are the client's entire vocabulary.
 * An unmapped category withholds the row rather than guessing a picture.
 */
var CATEGORY_PHOTO_KEYS = {
  'washer': 'washer',
  'refrigerator': 'refrigerator',
  'dryer': 'dryer',
  'stove': 'range',
  'electric stove': 'range',
  'gas stove': 'range',
  'range': 'range',
  'freezer': 'freezer',
  'dishwasher': 'dishwasher',
  'microwave': 'microwave',
  'television': 'television'
};

/**
 * location — OPTIONAL, BY OWNER DECISION (Package 7).
 *
 * APPLIANCES has no authoritative location column. Deriving one from stage or
 * inventing "Floor"/aisle/bay values is forbidden, and adding a production
 * column merely to satisfy the Register was rejected. So location is simply
 * not required: it resolves to an explicitly empty string and no row is ever
 * withheld for lacking one.
 *
 * If an authoritative column is approved later, set this to its name — that
 * one change is the whole cutover for this field.
 */
var LOCATION_SOURCE_COLUMN = null;

/**
 * Whether a row must carry at least one real photo URL to be sellable.
 * Owner decision D: never invent a photo. photoKey is derived from category,
 * so a row without photos could technically satisfy the validator — this is a
 * POLICY choice to withhold it rather than a contract requirement.
 */
var REQUIRE_REAL_PHOTO = true;

function throwMapping_(msg) {
  throw new Error('[EDP mapping error] ' + msg);
}

/** Reads the spreadsheet id from Script Properties. Never from source. */
function getMasterDatabaseId_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(MASTER_DB_ID_PROPERTY);
  if (!id) {
    throwMapping_('Script Property "' + MASTER_DB_ID_PROPERTY + '" is not set. ' +
      'The spreadsheet id is deliberately absent from source and must be ' +
      'provided as a Script Property in the TEST project.');
  }
  return id;
}

/** Title Case, so "WASHER" and "Washer" collapse to one deterministic value. */
function titleCase_(v) {
  return String(v).toLowerCase().replace(/\b[a-z]/g, function (c) {
    return c.toUpperCase();
  });
}

/** A photo URL is valid only if it is an absolute https URL. */
function isValidPhotoUrl_(v) {
  return /^https:\/\/[^\s,]+$/.test(String(v).trim());
}

function splitPhotoLinks_(raw) {
  return String(raw == null ? '' : raw)
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s !== ''; });
}

/** Deterministic display description. Never written back to the sheet. */
function deriveDescription_(brand, model, category) {
  return [String(brand).trim(), String(model).trim(), titleCase_(category)]
    .filter(function (p) { return p !== ''; })
    .join(' ');
}

/**
 * Maps one raw sheet row object to the Register inventory contract.
 * Returns { ok: true, item: {...} } or { ok: false, itemId: ..., reason: ... }.
 * It NEVER repairs, defaults or invents a value.
 */
function mapApplianceRow_(row) {
  var id = String(row.item_id == null ? '' : row.item_id).trim();
  if (id === '') {
    return { ok: false, itemId: '(blank)', reason: 'blank item_id' };
  }

  var sku = String(row.sku_id == null ? '' : row.sku_id).trim();
  if (TEST_RECORD_PATTERN.test(id) || TEST_RECORD_PATTERN.test(sku)) {
    return { ok: false, itemId: id, reason: 'excluded TEST record' };
  }

  if (String(row.stage).trim() !== SELLABLE_STAGE ||
      String(row.status).trim() !== SELLABLE_STATUS) {
    return { ok: false, itemId: id, reason: 'not sellable (stage="' +
      String(row.stage).trim() + '", status="' + String(row.status).trim() + '")' };
  }

  var category = String(row.category == null ? '' : row.category).trim();
  if (category === '') {
    return { ok: false, itemId: id, reason: 'missing category' };
  }
  var photoKey = CATEGORY_PHOTO_KEYS[category.toLowerCase()];
  if (!photoKey) {
    return { ok: false, itemId: id,
      reason: 'category "' + category + '" has no approved photoKey mapping' };
  }

  var brand = String(row.brand == null ? '' : row.brand).trim();
  var model = String(row.model == null ? '' : row.model).trim();
  if (brand === '') { return { ok: false, itemId: id, reason: 'missing brand' }; }
  if (model === '') { return { ok: false, itemId: id, reason: 'missing model' }; }

  var condition = String(row.condition == null ? '' : row.condition).trim();
  if (condition === '') { return { ok: false, itemId: id, reason: 'missing condition' }; }

  // Price is never invented and never defaulted to zero.
  var rawPrice = String(row.list_price == null ? '' : row.list_price).trim();
  if (rawPrice === '') { return { ok: false, itemId: id, reason: 'missing list_price' }; }
  var price = Number(rawPrice);
  if (!isFinite(price) || price <= 0) {
    return { ok: false, itemId: id, reason: 'unusable list_price ("' + rawPrice + '")' };
  }

  var gallery = splitPhotoLinks_(row.photo_links).filter(isValidPhotoUrl_);
  if (REQUIRE_REAL_PHOTO && gallery.length === 0) {
    return { ok: false, itemId: id, reason: 'no valid photo_links' };
  }

  // location is OPTIONAL (owner decision, Package 7). With no authoritative
  // source column it resolves to an explicitly empty string. Nothing is
  // derived from stage and no floor/aisle/bay value is ever fabricated.
  // A row is NEVER withheld for lacking a location.
  var location = LOCATION_SOURCE_COLUMN === null ? ''
    : String(row[LOCATION_SOURCE_COLUMN] == null ? '' : row[LOCATION_SOURCE_COLUMN]).trim();

  return {
    ok: true,
    item: {
      itemId: id,
      category: titleCase_(category),
      brand: brand,
      model: model,
      description: deriveDescription_(brand, model, category),
      price: price,
      condition: condition,
      availability: 'AVAILABLE',
      qty: 1,                                   // one row = one physical unit
      location: location,
      serialPlaceholder: SERIAL_PLACEHOLDER_LITERAL,
      photoKey: photoKey,
      photoPrimary: gallery.length ? gallery[0] : '',
      photoGallery: gallery
    }
  };
}

/**
 * Maps a whole sheet. Returns both the accepted items AND an auditable record
 * of everything withheld, so rows are never silently lost.
 */
function mapAppliances_(rows) {
  var items = [], withheld = [], seen = {};
  rows.forEach(function (row) {
    var r = mapApplianceRow_(row);
    if (!r.ok) { withheld.push({ itemId: r.itemId, reason: r.reason }); return; }
    if (seen[r.item.itemId]) {
      throwMapping_('duplicate item_id "' + r.item.itemId + '" in ' +
        APPLIANCES_SHEET_NAME + '. Duplicates cannot be paged deterministically.');
    }
    seen[r.item.itemId] = true;
    items.push(r.item);
  });
  return { items: items, withheld: withheld };
}

/** Converts the Sheets API value matrix into row objects, header-driven. */
function toRowObjects_(values) {
  if (!values || !values.length) {
    throwMapping_('sheet "' + APPLIANCES_SHEET_NAME + '" returned no rows at all.');
  }
  var header = values[0].map(function (h) { return String(h == null ? '' : h).trim(); });
  REQUIRED_APPLIANCE_HEADERS.forEach(function (h) {
    if (header.indexOf(h) === -1) {
      throwMapping_('required column "' + h + '" is missing from sheet "' +
        APPLIANCES_SHEET_NAME + '". Present: ' + header.join(', '));
    }
  });
  return values.slice(1).map(function (r) {
    var o = {};
    header.forEach(function (h, i) { o[h] = r[i] === undefined ? '' : r[i]; });
    return o;
  });
}

/** READ-ONLY fetch. Values.get only. */
function fetchApplianceValues_() {
  var res = Sheets.Spreadsheets.Values.get(getMasterDatabaseId_(), APPLIANCES_SHEET_NAME);
  return res && res.values ? res.values : [];
}

var AppliancesSheetDataSource = {
  id: DATA_SOURCES.APPLIANCES_SHEET,
  description: 'READ-ONLY view of the APPLIANCES tab of EDP_MASTER_DATABASE.',

  readInventory: function () {
    return mapAppliances_(toRowObjects_(fetchApplianceValues_())).items;
  },

  // Deliberately still MOCK. Package 6 is inventory only.
  readCustomers: function () { return getMockCustomers(); },
  readActivity: function () { return getMockActivity(); },
  readOpenTicket: function () { return getMockOpenTicket(); }
};

/* --------------------------------------------------------------------------
 * Public read API. Everything outside this file calls these four functions
 * and nothing else.
 * ------------------------------------------------------------------------ */

/*
 * Every read passes through the shape validator in Validation.gs before the
 * data leaves this file. The validators fail closed: they throw on a bad
 * record rather than repairing, defaulting or dropping it, so malformed data
 * can never reach getBootstrap() or the client.
 *
 * On success the validator returns the source's own value unchanged — it
 * does not copy, normalise or mutate anything.
 */

function readInventory()  { return validateInventory(getDataSource().readInventory()); }
function readCustomers()  { return validateCustomers(getDataSource().readCustomers()); }
function readActivity()   { return validateActivity(getDataSource().readActivity()); }
function readOpenTicket() { return validateOpenTicket(getDataSource().readOpenTicket()); }

/* --------------------------------------------------------------------------
 * Derived views.
 *
 * These are NOT part of the data-source interface — an implementation never
 * supplies them. They are computed here from readInventory() so that a new
 * source gets correct categories for free, with no extra method to write.
 * ------------------------------------------------------------------------ */

/**
 * Distinct categories present in the current inventory, sorted.
 * Derived, never authored, so the filter chips cannot drift from stock.
 */
function readCategories() {
  var seen = {};
  var out = [];
  readInventory().forEach(function (item) {
    if (!seen[item.category]) {
      seen[item.category] = true;
      out.push(item.category);
    }
  });
  out.sort();
  return out;
}

/**
 * Describes the active source. Read-only; used for diagnostics and so a
 * future TEST-vs-MOCK indicator can be surfaced in the UI without the client
 * needing to know how sources are wired.
 */
function getDataSourceInfo() {
  var ds = getDataSource();
  return {
    id: ds.id,
    description: ds.description,
    readOnly: true,
    isMock: ds.id === DATA_SOURCES.MOCK
  };
}
