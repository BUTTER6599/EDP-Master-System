/**
 * Validation.gs — shape-conformance validator for the data-source seam
 * The Electronics Depot LLC — EDP OS Register (clean rebuild, TEST ONLY)
 *
 * PURPOSE
 *   Every record returned by DataSource.gs passes through here before it
 *   reaches getBootstrap() and the client. A record that does not match the
 *   shape the Register actually reads is rejected loudly, at the seam, with
 *   an error naming the dataset, the record and the field.
 *
 *   This exists so that when a real read-only spreadsheet adapter is built,
 *   a renamed column or a text-formatted price fails immediately and
 *   visibly, instead of rendering a POS screen with a blank price or an
 *   item that is actually SOLD showing as Available.
 *
 * SAFETY CONTRACT FOR THIS FILE
 *   - FAIL CLOSED. Validators throw. They never repair, coerce, default,
 *     substitute or drop a bad record.
 *   - NO MUTATION. Nothing here writes to the objects it inspects. On
 *     success the caller's own array is returned by reference, unchanged.
 *   - No Google service APIs. No I/O. Pure functions over plain objects.
 *
 * WHICH FIELDS ARE REQUIRED
 *   Required means "the current Register shell reads it". The set below was
 *   derived by auditing field access in Scripts.html, not from assumption.
 *   Fields the shell never reads are accepted but not required, so the
 *   validator cannot reject legitimate data over something unused:
 *     - activity `id`            (never read by the client)
 *     - openTicket `register`    (never read by the client)
 *     - openTicket `cashier`     (never read by the client)
 *   Do not add requirements here for fields a future feature might want.
 *   Add them when the feature that reads them ships.
 */

/* --------------------------------------------------------------------------
 * Error reporting
 * ------------------------------------------------------------------------ */

/** Label for the active source, resilient to file load order. */
function activeSourceLabel_() {
  return (typeof ACTIVE_DATA_SOURCE === 'string') ? ACTIVE_DATA_SOURCE : 'UNKNOWN';
}

/** Human-readable description of a value, for error messages. */
function describeValue_(v) {
  if (v === undefined) { return 'undefined (field missing)'; }
  if (v === null) { return 'null'; }
  if (Array.isArray(v)) { return 'array (length ' + v.length + ')'; }
  var t = typeof v;
  if (t === 'string') {
    return 'string ("' + (v.length > 40 ? v.substring(0, 40) + '...' : v) + '")';
  }
  if (t === 'number') { return 'number (' + v + ')'; }
  if (t === 'boolean') { return 'boolean (' + v + ')'; }
  if (t === 'object') { return 'object'; }
  return t;
}

/** Builds the "where" part of an error: dataset[index] "recordId". */
function shapeWhere_(dataset, index, recordId) {
  var where = dataset;
  if (index !== null && index !== undefined) { where += '[' + index + ']'; }
  if (recordId) { where += ' "' + recordId + '"'; }
  return where;
}

/** Throws a descriptive shape error. Never returns. */
function throwShape_(dataset, index, recordId, field, expected, actual) {
  throw new Error('[EDP shape error] ' + activeSourceLabel_() + '/' +
    shapeWhere_(dataset, index, recordId) +
    ': field "' + field + '" expected ' + expected +
    ', got ' + describeValue_(actual));
}

/** Throws a descriptive structural error not tied to a single field. */
function throwStructure_(dataset, index, recordId, expected, actual) {
  throw new Error('[EDP shape error] ' + activeSourceLabel_() + '/' +
    shapeWhere_(dataset, index, recordId) +
    ': expected ' + expected + ', got ' + describeValue_(actual));
}

/* --------------------------------------------------------------------------
 * Field assertions
 * ------------------------------------------------------------------------ */

function requireString_(ds, i, rid, obj, field, opts) {
  opts = opts || {};
  var v = obj[field];
  if (opts.optional && (v === undefined || v === null)) { return; }
  if (typeof v !== 'string') {
    throwShape_(ds, i, rid, field, 'a string', v);
  }
  if (!opts.allowEmpty && v.trim() === '') {
    throwShape_(ds, i, rid, field, 'a non-empty string', v);
  }
}

function requireNumber_(ds, i, rid, obj, field, opts) {
  opts = opts || {};
  var v = obj[field];
  if (opts.optional && (v === undefined || v === null)) { return; }
  // Rejects NaN, Infinity, and numeric-looking strings such as "749.00".
  if (typeof v !== 'number' || !isFinite(v)) {
    throwShape_(ds, i, rid, field, 'a finite number', v);
  }
  if (opts.min !== undefined && v < opts.min) {
    throwShape_(ds, i, rid, field, 'a number >= ' + opts.min, v);
  }
}

function requireArray_(ds, i, rid, obj, field) {
  var v = obj[field];
  if (!Array.isArray(v)) {
    throwShape_(ds, i, rid, field, 'an array', v);
  }
}

function requireOneOf_(ds, i, rid, obj, field, allowed) {
  var v = obj[field];
  if (typeof v !== 'string' || allowed.indexOf(v) === -1) {
    throwShape_(ds, i, rid, field, 'one of [' + allowed.join(', ') + ']', v);
  }
}

/** Asserts the dataset itself is an array of plain objects. */
function requireRecordList_(dataset, rows) {
  if (!Array.isArray(rows)) {
    throwStructure_(dataset, null, null, 'an array of records', rows);
  }
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r === null || typeof r !== 'object' || Array.isArray(r)) {
      throwStructure_(dataset, i, null, 'an object', r);
    }
  }
}

/* --------------------------------------------------------------------------
 * Dataset validators
 *
 * Each returns the SAME array it was given, unmodified, or throws.
 * ------------------------------------------------------------------------ */

/** Availability codes the Register knows how to render. */
var VALID_AVAILABILITY = ['AVAILABLE', 'LOW_STOCK', 'ON_HOLD', 'SOLD'];

/**
 * Inventory. An unrecognised availability code is rejected rather than
 * allowed to fall through to the client's default, because on a POS an
 * unknown status silently displaying as "Available" is a real hazard.
 */
function validateInventory(rows) {
  var ds = 'inventory';
  requireRecordList_(ds, rows);

  rows.forEach(function (it, i) {
    var rid = typeof it.itemId === 'string' ? it.itemId : null;

    requireString_(ds, i, rid, it, 'itemId');
    requireString_(ds, i, rid, it, 'category');
    requireString_(ds, i, rid, it, 'brand');
    requireString_(ds, i, rid, it, 'model');
    requireString_(ds, i, rid, it, 'description');
    requireString_(ds, i, rid, it, 'condition');
    requireString_(ds, i, rid, it, 'location');
    requireString_(ds, i, rid, it, 'serialPlaceholder');
    requireString_(ds, i, rid, it, 'photoKey');

    requireNumber_(ds, i, rid, it, 'price', { min: 0 });
    requireNumber_(ds, i, rid, it, 'qty', { min: 0 });

    requireOneOf_(ds, i, rid, it, 'availability', VALID_AVAILABILITY);
  });

  return rows;
}

/**
 * Customers. `history` and `warrantyClaims` must be arrays because the
 * client reads their .length directly. `email`, `since` and `notes` are
 * rendered but the shell tolerates their absence, so they are optional —
 * typed if present.
 */
function validateCustomers(rows) {
  var ds = 'customers';
  requireRecordList_(ds, rows);

  rows.forEach(function (c, i) {
    var rid = typeof c.customerId === 'string' ? c.customerId : null;

    requireString_(ds, i, rid, c, 'customerId');
    requireString_(ds, i, rid, c, 'name');
    requireString_(ds, i, rid, c, 'phone');

    requireString_(ds, i, rid, c, 'email', { optional: true, allowEmpty: true });
    requireString_(ds, i, rid, c, 'since', { optional: true, allowEmpty: true });
    requireString_(ds, i, rid, c, 'notes', { optional: true, allowEmpty: true });

    requireArray_(ds, i, rid, c, 'history');
    requireArray_(ds, i, rid, c, 'warrantyClaims');

    c.history.forEach(function (h, j) {
      var hid = rid + '.history[' + j + ']';
      if (h === null || typeof h !== 'object' || Array.isArray(h)) {
        throwStructure_(ds, i, hid, 'an object', h);
      }
      requireString_(ds, i, hid, h, 'date');
      requireString_(ds, i, hid, h, 'itemId');
      requireString_(ds, i, hid, h, 'summary');
      requireString_(ds, i, hid, h, 'warranty');
      requireNumber_(ds, i, hid, h, 'total', { min: 0 });
    });

    c.warrantyClaims.forEach(function (w, j) {
      var wid = rid + '.warrantyClaims[' + j + ']';
      if (w === null || typeof w !== 'object' || Array.isArray(w)) {
        throwStructure_(ds, i, wid, 'an object', w);
      }
      requireString_(ds, i, wid, w, 'date');
      requireString_(ds, i, wid, w, 'itemId');
      requireString_(ds, i, wid, w, 'status');
      requireString_(ds, i, wid, w, 'detail');
    });
  });

  return rows;
}

/**
 * Activity events.
 *   `minutesAgo` is this build's timestamp field. It must be a finite
 *   number because the client sorts and does arithmetic on it.
 *   `kind` is this build's event-type field.
 *   `id` is NOT required — the client never reads it.
 */
function validateActivity(rows) {
  var ds = 'activity';
  requireRecordList_(ds, rows);

  rows.forEach(function (ev, i) {
    var rid = typeof ev.id === 'string' ? ev.id : null;

    requireString_(ds, i, rid, ev, 'kind');
    requireString_(ds, i, rid, ev, 'user');
    requireString_(ds, i, rid, ev, 'action');
    requireNumber_(ds, i, rid, ev, 'minutesAgo');

    requireString_(ds, i, rid, ev, 'id', { optional: true });
    requireString_(ds, i, rid, ev, 'detail', { optional: true, allowEmpty: true });
    requireString_(ds, i, rid, ev, 'before', { optional: true, allowEmpty: true });
    requireString_(ds, i, rid, ev, 'after', { optional: true, allowEmpty: true });
    requireString_(ds, i, rid, ev, 'status', { optional: true, allowEmpty: true });
    requireString_(ds, i, rid, ev, 'reason', { optional: true, allowEmpty: true });
  });

  return rows;
}

/**
 * Open ticket. Returning null is valid and means "no ticket open".
 *   `customerId` may be null — that is a legitimate walk-in sale.
 *   `priceOverride` may be null — that means "use the list price".
 *   `register` and `cashier` are optional; the client never reads them.
 */
function validateOpenTicket(ticket) {
  var ds = 'openTicket';

  if (ticket === null || ticket === undefined) { return ticket; }
  if (typeof ticket !== 'object' || Array.isArray(ticket)) {
    throwStructure_(ds, null, null, 'an object or null', ticket);
  }

  var rid = typeof ticket.ticketId === 'string' ? ticket.ticketId : null;

  requireString_(ds, null, rid, ticket, 'ticketId');
  requireString_(ds, null, rid, ticket, 'paymentMethodId');
  requireString_(ds, null, rid, ticket, 'customerId', { optional: true });
  requireString_(ds, null, rid, ticket, 'register', { optional: true });
  requireString_(ds, null, rid, ticket, 'cashier', { optional: true });

  requireArray_(ds, null, rid, ticket, 'lines');

  ticket.lines.forEach(function (l, j) {
    var lid = rid + '.lines[' + j + ']';
    if (l === null || typeof l !== 'object' || Array.isArray(l)) {
      throwStructure_(ds, null, lid, 'an object', l);
    }
    requireString_(ds, null, lid, l, 'itemId');
    requireString_(ds, null, lid, l, 'warrantyId');
    requireNumber_(ds, null, lid, l, 'qty', { min: 1 });
    requireNumber_(ds, null, lid, l, 'priceOverride', { optional: true, min: 0 });
  });

  return ticket;
}
