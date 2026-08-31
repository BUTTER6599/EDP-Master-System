/**
 * InventoryQuery.gs — read-only inventory query + pagination contract
 * The Electronics Depot LLC — EDP OS Register (clean rebuild, TEST ONLY)
 *
 * PURPOSE
 *   The Register currently ships its entire inventory to the browser in one
 *   bootstrap payload and filters it client-side. That is fine for 12 demo
 *   records and will not survive real inventory. This file defines the
 *   server-side query contract that replaces it, proven against MockData
 *   before any UI depends on it.
 *
 *   PHASE 3A IS CONTRACT PROOF ONLY. Nothing calls queryInventory() yet.
 *   getBootstrap() and the client are deliberately untouched.
 *
 * SAFETY CONTRACT FOR THIS FILE
 *   - READ-ONLY. Filters, sorts and slices. Never writes, mutates or repairs.
 *   - Sources data through readInventory(), which means every record has
 *     already passed the Phase 2 shape validator. Validation is NOT repeated
 *     here and NOT bypassed here.
 *   - No Google service APIs. No I/O. No spreadsheet IDs.
 *
 * ============================================================================
 * PUBLIC CONTRACT
 * ============================================================================
 *
 *   queryInventory(options) -> result
 *
 *   options (all optional; an omitted object means "defaults"):
 *
 *     search        string   Free text. Case-insensitive substring match
 *                            against the concatenation of, in this order:
 *                              itemId, brand, model, category, description,
 *                              condition
 *                            joined by single spaces. Leading/trailing
 *                            whitespace is trimmed. An empty or
 *                            whitespace-only value means "no text filter".
 *                            NOTE: because the fields are concatenated before
 *                            matching, a query may span a field boundary
 *                            (e.g. "Whirlpool WRS325SDHZ"). This mirrors the
 *                            current client behaviour exactly and is
 *                            deliberate.
 *
 *     category      string   Case-insensitive exact match on the item's
 *                            category. Omitted, null, '' or the sentinel
 *                            'ALL' all mean "no category filter". 'ALL' is
 *                            honoured because the existing client uses it as
 *                            its all-categories chip value; without this a
 *                            future cutover would silently return zero rows.
 *
 *     availability  string   One availability code, or an array of codes.
 *                   |array   Must be drawn from VALID_AVAILABILITY
 *                            (AVAILABLE, LOW_STOCK, ON_HOLD, SOLD). An
 *                            unknown code is an error, never an empty result,
 *                            so a typo cannot look like "nothing in stock".
 *                            Omitted or null means "no availability filter".
 *
 *     limit         number   Page size. Integer, 1..MAX_INVENTORY_PAGE_SIZE.
 *                            Defaults to DEFAULT_INVENTORY_PAGE_SIZE.
 *
 *     offset        number   Rows to skip. Integer >= 0. Defaults to 0.
 *
 *   result:
 *
 *     items      Array   The page. Length is between 0 and limit.
 *     total      number  Count of ALL matching records, before paging.
 *     limit      number  The effective limit actually applied.
 *     offset     number  The effective offset actually applied.
 *     returned   number  items.length. Convenience for callers.
 *     hasMore    boolean True when offset + returned < total.
 *     query      object  The normalised query that was executed:
 *                        { search, category, availability }
 *                        Echoed so a caller can log or display exactly what
 *                        ran, rather than what it thought it asked for.
 *
 *   Offset/limit is the chosen paging mechanism. Page numbers are NOT part of
 *   this contract — one mechanism only, so there is no off-by-one ambiguity
 *   between "page 1" and "page 0". A caller wanting pages computes
 *   offset = page * limit itself.
 *
 *   An offset past the end is NOT an error. It returns an empty items array
 *   with the true total and hasMore false, which is what a paging UI needs.
 *
 * ============================================================================
 * DETERMINISTIC ORDER
 * ============================================================================
 *
 *   Results are sorted by, in order:
 *       1. category    ascending
 *       2. brand       ascending
 *       3. model       ascending
 *       4. itemId      ascending   (final tie-break)
 *
 *   itemId is unique, so this is a TOTAL order: the same query over the same
 *   dataset always yields the same sequence and therefore the same page
 *   boundaries, no matter what order the underlying source returned rows in.
 *   The contract deliberately does NOT depend on incidental array or sheet
 *   row order.
 *
 *   Comparison is plain code-unit ordering (< and >), not locale-aware
 *   collation. localeCompare can vary with the runtime's ICU data, which
 *   would make page boundaries environment-dependent. Practical consequence:
 *   uppercase sorts before lowercase. Current data is consistently
 *   capitalised, so this is not visible today.
 *
 *   Sort options are not part of this contract. Adding one (price, recency)
 *   is a separate, deliberate change.
 */

/**
 * Hard ceiling on page size.
 *
 * 200 is an EDP defensive application-level ceiling selected from the
 * measured current record size. At approximately 58 KB for 200 current
 * records, it prevents accidental whole-dataset reads while remaining far
 * above the number of cards needed for a normal Register page.
 *
 * Measured evidence (current MockData inventory, 12 records):
 *   mean record   ~298 bytes of JSON
 *   largest record ~318 bytes of JSON
 *   50 records    ~15 KB
 *   100 records   ~29 KB
 *   200 records   ~58 KB   <- this ceiling
 *
 * No Google Apps Script payload or execution limit is asserted here. This
 * ceiling is an EDP policy choice, not a platform quota, and no claim is
 * made about where any platform limit sits.
 *
 * A request above the ceiling is REJECTED, not silently clamped: silently
 * returning 200 rows to a caller that asked for 100000 would look like the
 * database is small rather than like the request was refused.
 */
var MAX_INVENTORY_PAGE_SIZE = 200;

/** Page size used when the caller does not specify one. */
var DEFAULT_INVENTORY_PAGE_SIZE = 24;

/**
 * The complete set of option names this contract accepts.
 *
 * Anything else is rejected. A misspelling ("categry") or an unsupported
 * option ("page", "sort", "status") must never be silently ignored: ignoring
 * an intended filter BROADENS the result set, which on a register means
 * showing stock that the caller meant to exclude.
 */
var ALLOWED_QUERY_OPTIONS = ['search', 'category', 'availability', 'limit', 'offset'];

/* --------------------------------------------------------------------------
 * Query-input errors
 *
 * Distinct prefix from the Phase 2 shape errors, so a bad REQUEST is never
 * confused with bad DATA when reading logs.
 * ------------------------------------------------------------------------ */

function throwQuery_(option, expected, actual) {
  throw new Error('[EDP query error] option "' + option + '" expected ' +
    expected + ', got ' + describeValue_(actual));
}

/** Rejects any option key that is not on the approved list. */
function assertKnownOptions_(options) {
  var keys = Object.keys(options);
  for (var i = 0; i < keys.length; i++) {
    if (ALLOWED_QUERY_OPTIONS.indexOf(keys[i]) === -1) {
      throw new Error('[EDP query error] unknown option "' + keys[i] +
        '". Allowed options: ' + ALLOWED_QUERY_OPTIONS.join(', ') +
        '. An unsupported option is rejected rather than ignored, because ' +
        'ignoring an intended filter would broaden the returned inventory.');
    }
  }
}

/**
 * Deterministic-pagination invariant.
 *
 * The canonical sort uses itemId as its final tie-break, which makes the
 * order total ONLY IF itemId is unique across the result set. Two records
 * sharing an itemId would leave their relative order undefined, so page
 * boundaries could shift between identical queries and a record could appear
 * on two pages or none.
 *
 * The Phase 2 shape validator checks records individually and has no
 * collection-level view, so it cannot catch this. Rather than duplicate shape
 * validation, this is a narrow invariant belonging to the paging contract.
 *
 * It is asserted over the MATCHED result set, which is exactly the set whose
 * ordering this query depends on. A duplicate elsewhere in the source cannot
 * affect this query's page boundaries.
 */
function assertUniqueItemIds_(ordered) {
  var seen = {};
  for (var i = 0; i < ordered.length; i++) {
    var id = ordered[i].itemId;
    if (Object.prototype.hasOwnProperty.call(seen, id)) {
      throw new Error('[EDP query invariant] duplicate itemId "' + id +
        '" found at result positions ' + seen[id] + ' and ' + i +
        '. itemId is the final sort tie-break, so duplicates make page ' +
        'boundaries non-deterministic. Refusing to paginate.');
    }
    seen[id] = i;
  }
}

/* --------------------------------------------------------------------------
 * Option normalisation. Each helper validates and returns a clean value, or
 * throws. None of them coerce a wrong-typed value into a usable one.
 * ------------------------------------------------------------------------ */

function normaliseSearch_(v) {
  if (v === undefined || v === null) { return ''; }
  if (typeof v !== 'string') { throwQuery_('search', 'a string', v); }
  return v.trim().toLowerCase();
}

function normaliseCategory_(v) {
  if (v === undefined || v === null) { return null; }
  if (typeof v !== 'string') { throwQuery_('category', 'a string', v); }
  var t = v.trim();
  if (t === '' || t.toUpperCase() === 'ALL') { return null; }
  return t.toLowerCase();
}

function normaliseAvailability_(v) {
  if (v === undefined || v === null) { return null; }

  var list = Array.isArray(v) ? v : [v];
  if (list.length === 0) {
    // An explicitly supplied empty filter must not silently mean "everything".
    throw new Error('[EDP query error] option "availability" was supplied as ' +
      'an empty array. An explicit empty filter is rejected because it must ' +
      'not silently mean "return all". Omit the option entirely for no ' +
      'availability filter.');
  }

  var out = [];
  for (var i = 0; i < list.length; i++) {
    var code = list[i];
    if (typeof code !== 'string') {
      throwQuery_('availability', 'a string or array of strings', code);
    }
    if (VALID_AVAILABILITY.indexOf(code) === -1) {
      throwQuery_('availability',
        'one of [' + VALID_AVAILABILITY.join(', ') + ']', code);
    }
    if (out.indexOf(code) === -1) { out.push(code); }
  }
  return out;
}

function normaliseLimit_(v) {
  if (v === undefined || v === null) { return DEFAULT_INVENTORY_PAGE_SIZE; }
  if (typeof v !== 'number' || !isFinite(v)) {
    throwQuery_('limit', 'a finite number', v);
  }
  if (Math.floor(v) !== v) { throwQuery_('limit', 'an integer', v); }
  if (v < 1) { throwQuery_('limit', 'an integer >= 1', v); }
  if (v > MAX_INVENTORY_PAGE_SIZE) {
    throwQuery_('limit',
      'an integer <= ' + MAX_INVENTORY_PAGE_SIZE + ' (the hard page ceiling)', v);
  }
  return v;
}

function normaliseOffset_(v) {
  if (v === undefined || v === null) { return 0; }
  if (typeof v !== 'number' || !isFinite(v)) {
    throwQuery_('offset', 'a finite number', v);
  }
  if (Math.floor(v) !== v) { throwQuery_('offset', 'an integer', v); }
  if (v < 0) { throwQuery_('offset', 'an integer >= 0', v); }
  return v;
}

/* --------------------------------------------------------------------------
 * Matching and ordering
 * ------------------------------------------------------------------------ */

/**
 * The searchable text for one item.
 * Field order and the space join mirror the current client exactly, so a
 * later cutover cannot change which records match a given query.
 */
function searchableText_(it) {
  return [it.itemId, it.brand, it.model, it.category, it.description, it.condition]
    .join(' ').toLowerCase();
}

/** Total, environment-independent ordering. See the header for rationale. */
function compareInventory_(a, b) {
  var keys = ['category', 'brand', 'model', 'itemId'];
  for (var i = 0; i < keys.length; i++) {
    var av = a[keys[i]];
    var bv = b[keys[i]];
    if (av < bv) { return -1; }
    if (av > bv) { return 1; }
  }
  return 0;
}

/* --------------------------------------------------------------------------
 * The query
 * ------------------------------------------------------------------------ */

/**
 * Read-only inventory query. See the contract in this file's header.
 * Throws on any invalid option. Never returns a partial or repaired result.
 */
function queryInventory(options) {
  if (options === undefined || options === null) { options = {}; }
  if (typeof options !== 'object' || Array.isArray(options)) {
    throwQuery_('options', 'an object', options);
  }
  assertKnownOptions_(options);

  var search = normaliseSearch_(options.search);
  var category = normaliseCategory_(options.category);
  var availability = normaliseAvailability_(options.availability);
  var limit = normaliseLimit_(options.limit);
  var offset = normaliseOffset_(options.offset);

  // Sourced through the validated seam. Every record here has already passed
  // the Phase 2 shape validator; validation is neither repeated nor skipped.
  var rows = readInventory();

  var matched = rows.filter(function (it) {
    if (category !== null && String(it.category).toLowerCase() !== category) {
      return false;
    }
    if (availability !== null && availability.indexOf(it.availability) === -1) {
      return false;
    }
    if (search !== '' && searchableText_(it).indexOf(search) === -1) {
      return false;
    }
    return true;
  });

  // slice() first so the source array is never reordered in place.
  var ordered = matched.slice().sort(compareInventory_);

  // Guarantees the canonical sort is a TOTAL order for this result set before
  // any page boundary is computed. See assertUniqueItemIds_.
  assertUniqueItemIds_(ordered);

  var page = ordered.slice(offset, offset + limit);

  return {
    items: page,
    total: ordered.length,
    limit: limit,
    offset: offset,
    returned: page.length,
    hasMore: (offset + page.length) < ordered.length,
    query: {
      search: search,
      category: category,
      availability: availability
    }
  };
}
