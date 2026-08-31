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
 *   - No SpreadsheetApp, DriveApp, PropertiesService, MailApp, GmailApp,
 *     UrlFetchApp or ScriptApp. Not yet. Not in this pass.
 *   - Every read is shape-checked by Validation.gs before it is returned.
 *     Bad data fails closed at this boundary; it never reaches the UI.
 *   - No spreadsheet IDs of any kind appear in this file. When a real
 *     adapter is built, its file ID must come from Script Properties at
 *     runtime, never from source.
 *   - MOCK is the only implementation that exists and the only one wired up.
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
  MOCK: 'MOCK'
  // TEST_SHEET: 'TEST_SHEET'  <- deliberately not implemented in this pass.
  //   Adding it requires: an approved TEST spreadsheet (never LIVE, never
  //   EDP_MASTER_DATABASE), its id held in Script Properties, and a
  //   shape-conformance check. None of that exists yet.
};

/**
 * The active source. Changing this value is the ONLY switch that should ever
 * be needed to move the Register onto a different read-only source.
 */
var ACTIVE_DATA_SOURCE = DATA_SOURCES.MOCK;

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
    default:
      throw new Error('Unknown ACTIVE_DATA_SOURCE: "' + ACTIVE_DATA_SOURCE +
        '". MOCK is the only implemented source in this build.');
  }
}

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
