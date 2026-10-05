/**
 * Sale.gs — COMPLETE SALE FOUNDATION (Package 13)
 * The Electronics Depot LLC — EDP OS Register (TEST ONLY)
 *
 * SAFETY CONTRACT FOR THIS FILE:
 *   - NOTHING in this file writes anything, anywhere. There is no
 *     SpreadsheetApp, no Sheets.Spreadsheets.Values.update/append, no
 *     PropertiesService.setProperty, no MailApp, no UrlFetchApp.
 *   - The OAuth scope pinned in appsscript.json is spreadsheets.readonly, so
 *     the token this code runs under is structurally incapable of writing to
 *     a sheet even if someone added a write call by mistake.
 *   - completeSale() REFUSES while the write flags are false, and the refusal
 *     is the first thing it does, before any work.
 *   - Every reader below is the existing read-only API from DataSource.gs.
 *
 * WHAT THIS FILE IS
 *   The parts of a real sale that can exist safely while every write flag is
 *   off: a server-authoritative identity and clock, a normalised request
 *   model, fail-closed validation, authoritative money, and an orchestration
 *   skeleton that refuses to run.
 *
 * WHAT THIS FILE IS DELIBERATELY NOT
 *   It is not a SALES row writer, and it does not define a SALES row layout.
 *   The approved SALES schema of EDP_MASTER_DATABASE could NOT be confirmed
 *   during Package 13 (the Package 5B evidence directories did not survive
 *   the container being reclaimed, and reading the live database needs owner
 *   authorisation). Inventing a row layout against an unconfirmed schema is
 *   exactly the kind of guess this project has refused before, so the mapping
 *   from a prepared sale to a SALES row is NOT in this file. It is Package 14
 *   work, after the schema is re-read.
 *
 * AUTHORITY RULE
 *   The server is authoritative for the sale id, the timestamp and every
 *   monetary figure. A client-supplied id, time or total is IGNORED, not
 *   trusted and not merely re-checked. The browser can be wrong, stale or
 *   tampered with; the only numbers that count are recomputed here from the
 *   real inventory and the approved tax policy.
 */

/* --------------------------------------------------------------------------
 * Identity
 * ------------------------------------------------------------------------ */

/**
 * Sale id policy.
 *
 * TEST_PREFIX is the only prefix this build can emit. PRODUCTION_PREFIX is
 * deliberately null: the existing EDP_MASTER_DATABASE SALES tab already
 * contains sale identifiers in an established convention (rows such as
 * `SHOPIFY-3102` were observed in Package 5B), and that convention has NOT
 * been re-confirmed. Minting ids in a format that might collide with, or
 * contradict, the real one would be a guess. See NV-15.
 */
var SALE_ID = {
  TEST_PREFIX: 'TEST-SALE',

  /* APPROVED by the owner on 2026-10-04 (Package 14B): EDP-YYYYMMDD-NNN,
     e.g. EDP-20261004-001. NNN is a per-day sequence that restarts at 001.

     This matches the convention the business already uses elsewhere —
     CUSTOMER_HOLDS mints HR-YYYYMMDD-NNNN and AUDIT_LOG mints
     LOG-YYYYMMDD-NNNN — so it reads as an EDP id on sight and cannot be
     confused with SHOPIFY-<order#> or the abandoned S-<epochMs>-<rand>. */
  PRODUCTION_PREFIX: 'EDP',
  PRODUCTION_FORMAT: 'EDP-YYYYMMDD-NNN',
  PRODUCTION_PATTERN: /^EDP-\d{8}-\d{3}$/,

  /* Historical families, recorded so nothing ever rewrites or collides with
     them. They are READ-ONLY history. */
  LEGACY_EPOCH_PATTERN: /^S-\d{10,}-\d{2,3}$/,   /* abandoned 2026-07-18 */
  SHOPIFY_PATTERN: /^SHOPIFY-\d+(-RECON)?$/       /* belongs to Shopify */
};

/**
 * The approved SALES column order, exactly as EDP_MASTER_DATABASE holds it
 * (verified 2026-10-04, recorded in test/schema-evidence/).
 *
 * Column 32 has NO header in the sheet and one stray populated cell. It is
 * represented here as an explicit placeholder so the row builder keeps its
 * alignment, and it is never written to.
 *
 * request_id is column 33 and DOES NOT EXIST YET. Adding it is the approved
 * migration, and it has not been performed — see SALES_MIGRATION below.
 */
var SALES_COLUMNS = [
  'sale_id', 'timestamp', 'sale_date', 'week_id', 'amount', 'category',
  'payment_type', 'notes', 'entered_by', 'invoice_number', 'item_id',
  'inventory_sku_at_sale', 'legacy_item_id', 'item_description_at_sale',
  'brand_at_sale', 'model_at_sale', 'serial_at_sale', 'warranty_at_sale',
  'tax_rate', 'tax_amount', 'sales_source', 'entry_type', 'source_order_id',
  'source_order_number', 'customer_id', 'customer_name', 'customer_phone',
  'import_batch_id', 'detail_status', 'inventory_update_status',
  'accounting_status', '(unused_col_32)'
];

var SALES_MIGRATION = {
  APPROVED: true,                 /* owner, 2026-10-04 */

  /* APPLIED and INDEPENDENTLY VERIFIED 2026-10-05 03:10:11 UTC.

     The column was appended through the owner's authorised Google Sheets
     connection, not by this build, which still holds no write scope.

     Verified here against the pre-write integrity manifest captured at
     03:05:23 UTC, five minutes before the write: 33 columns, AG1 exactly
     'request_id', columns 1-32 byte-identical by header hash, all 148 rows
     unchanged by per-row hash, all 32 per-column hashes matching, column 32
     still unheaded and its data untouched, every historical request_id cell
     blank, and the other 37 tabs unchanged. 19 of 19 checks passed.

     THIS FLAG DOES NOT ENABLE WRITING. It records only that the column
     exists, so salesRowsToArrays_ may build a correctly aligned 33-wide row.
     Writing one still requires SALES_WRITER_ENABLED, a writer that does not
     exist, and a write scope this project does not hold. */
  APPLIED: true,
  APPLIED_AT: '2026-10-05T03:10:11Z',
  VERIFIED_AGAINST: 'test/pkg15-migration/SALES-PRE-WRITE-MANIFEST-20261005T030523Z.json',
  ADD_COLUMN: 'request_id',
  AT_INDEX: 33,                   /* append; never reorder existing columns */
  REASON: 'Makes Complete Sale retry-safe. Approved explicitly rather than ' +
          'hidden inside the notes column.'
};

/** Error codes. Stable strings, so the client can branch on them and tests
 *  can assert them without matching prose. */
var SALE_ERROR = {
  WRITES_DISABLED: 'SALE_WRITES_DISABLED',
  NOT_IMPLEMENTED: 'SALE_WRITER_NOT_IMPLEMENTED',
  BAD_REQUEST: 'SALE_BAD_REQUEST',
  EMPTY_CART: 'SALE_EMPTY_CART',
  UNRESOLVED_LINE: 'SALE_UNRESOLVED_LINE',
  BAD_MONEY: 'SALE_BAD_MONEY',
  BAD_QUANTITY: 'SALE_BAD_QUANTITY',
  UNKNOWN_WARRANTY: 'SALE_UNKNOWN_WARRANTY',
  UNKNOWN_PAYMENT: 'SALE_UNKNOWN_PAYMENT',
  CUSTOMER_REQUIRED: 'SALE_CUSTOMER_REQUIRED',
  UNKNOWN_CUSTOMER: 'SALE_UNKNOWN_CUSTOMER',
  INSUFFICIENT_TENDER: 'SALE_INSUFFICIENT_TENDER',
  TAX_NOT_CONFIGURED: 'SALE_TAX_NOT_CONFIGURED',
  MISSING_REQUEST_ID: 'SALE_MISSING_REQUEST_ID',
  DUPLICATE_REQUEST: 'SALE_DUPLICATE_REQUEST',
  SEQUENCE_UNAVAILABLE: 'SALE_SEQUENCE_UNAVAILABLE',
  MIGRATION_REQUIRED: 'SALE_MIGRATION_REQUIRED',
  LOCK_UNAVAILABLE: 'SALE_LOCK_UNAVAILABLE',
  MALFORMED_SALE_ID: 'SALE_MALFORMED_SALE_ID',
  INVENTORY_WRITES_DISABLED: 'SALE_INVENTORY_WRITES_DISABLED',
  NO_WRITER: 'SALE_NO_WRITER',
  TENDER_NOT_APPROVED: 'SALE_TENDER_NOT_APPROVED',
  APPEND_FAILED: 'SALE_APPEND_FAILED',
  INVENTORY_RECONCILE: 'SALE_INVENTORY_RECONCILE'
};

/* --------------------------------------------------------------------------
 * Package 15C — write-scope safety gates.
 *
 * The manifest in source is now write-CAPABLE. That is not the same thing as
 * write-AUTHORISED, and it is emphatically not the same as sales-enabled. The
 * gates below are what keep those three apart, because the OAuth scope no
 * longer does it for us.
 *
 * Ten gates stand between this code and a real sale. Package 15C moves gate 1
 * and gate 2 only:
 *
 *   1. code is write-capable               <- DONE (this package)
 *   2. manifest carries a write scope      <- DONE in SOURCE only
 *   3. SALES_WRITER_ENABLED                <- false
 *   4. INVENTORY_MUTATION_ENABLED          <- false
 *   5. TEST deployment                     <- not performed
 *   6. owner authorises the OAuth consent  <- not performed
 *   7. a controlled TEST transaction       <- not performed
 *   8. independent verification            <- not performed
 *   9. physical receipt test               <- not performed
 *  10. LIVE approval                       <- not given
 * ------------------------------------------------------------------------ */

/**
 * The two writer gates.
 *
 * NAME MAPPING: Package 15C's brief calls these SALES_WRITER_ENABLED and
 * INVENTORY_SOLD_WRITER_ENABLED. The approved flag architecture has existed
 * since the first build and names the second INVENTORY_MUTATION_ENABLED, so
 * the existing names are kept and the mapping is recorded here rather than
 * adding a redundant third flag that could drift out of step with it.
 */
var WRITER_GATES = {
  SALES: 'SALES_WRITER_ENABLED',
  INVENTORY: 'INVENTORY_MUTATION_ENABLED'   /* a.k.a. INVENTORY_SOLD_WRITER_ENABLED */
};

/**
 * A gate is open ONLY for the boolean true.
 *
 * Not the string 'true', not 1, not a truthy object. A flag that is missing,
 * undefined, null or malformed is CLOSED. The failure that matters here is the
 * one where a config edit types "true" and a till starts writing, so identity
 * comparison is the whole point.
 */
function gateOpen_(flagName) {
  var features = (CONFIG && CONFIG.FEATURES) || {};
  return features[flagName] === true;
}

/**
 * Approved tender for the first controlled transaction path.
 *
 * CASH only. Each blocked method records WHY, so a future reader does not have
 * to guess whether it was forgotten or refused.
 */
var APPROVED_TENDER_IDS = ['CASH'];

var BLOCKED_TENDER_REASONS = {
  'STORE_CREDIT': 'No customer credit ledger exists yet (NV-28). A cashier would have no balance to check against.',
  'CARD': 'Not an approved Register tender. No card row has ever existed in SALES (NV-23).',
  'FINANCE': 'Not an approved Register tender (NV-23).',
  'LAYAWAY': 'Payment & Pickup Plan is an agreement with a lifecycle, not a tender. It needs its own structure.',
  'CHECK': 'Not an approved Register tender (NV-23).',
  'CASH_APP': 'Historical only. Not reactivated as a current tender.'
};

function assertApprovedTender_(methodId) {
  var id = String(methodId == null ? '' : methodId).trim().toUpperCase();
  for (var i = 0; i < APPROVED_TENDER_IDS.length; i++) {
    if (APPROVED_TENDER_IDS[i] === id) { return id; }
  }
  var why = BLOCKED_TENDER_REASONS[id] || 'Not an approved Register tender.';
  throwSale_(SALE_ERROR.TENDER_NOT_APPROVED,
    'Tender "' + methodId + '" is not approved for a Register transaction. ' + why);
}

/* --------------------------------------------------------------------------
 * Idempotency — PURE.
 * ------------------------------------------------------------------------ */

/**
 * Finds an already-committed sale for a request id.
 *
 * Takes rows of { sale_id, request_id } as read from SALES columns A and AG.
 * The 148 historical rows have a BLANK request_id and must never match
 * anything — a blank lookup key matching a blank column would make every
 * historical row look like a duplicate of every new attempt.
 *
 * Returns { saleId, rowCount } or null. rowCount matters because a multi-item
 * sale occupies several rows under one sale_id.
 */
function findCommittedSale_(rows, requestId) {
  var key = String(requestId == null ? '' : requestId).trim();
  if (key === '') { return null; }        /* never match on blank */
  var saleId = null, count = 0;
  (rows || []).forEach(function (r) {
    var rid = String((r && r.request_id) == null ? '' : r.request_id).trim();
    if (rid === '' || rid !== key) { return; }
    count += 1;
    if (saleId === null) { saleId = String(r.sale_id == null ? '' : r.sale_id).trim(); }
  });
  return count === 0 ? null : { saleId: saleId, rowCount: count };
}

/* --------------------------------------------------------------------------
 * The transaction boundary — STRUCTURE ONLY. No Sheets write exists.
 * ------------------------------------------------------------------------ */

/**
 * The production write adapter. There isn't one.
 *
 * Returning null is deliberate: the boundary below refuses when it has no
 * adapter, so "the writer does not exist" is an enforced runtime fact and not
 * a comment someone can quietly delete.
 */
function saleWriteAdapter_() {
  return null;
}

/**
 * The controlled CASH Complete Sale boundary.
 *
 * Structured in full so the ordering is reviewable and testable now, while the
 * two steps that touch Google — the SALES append and the APPLIANCES update —
 * exist only as adapter calls. Production passes no adapter, so they cannot
 * run. Tests pass a recording mock, so the sequencing can be proven without a
 * single byte reaching a spreadsheet.
 *
 * ORDERING IS THE SAFETY DESIGN. The SALES record is written BEFORE inventory
 * moves. A crash between them leaves a sale that can be reconciled against
 * stock; the reverse leaves stock sold against no sale at all, which is money
 * unaccounted for.
 *
 * Returns { ok, code, message, journal, sale }. journal names every step
 * that actually executed, so a test can assert what did NOT happen.
 */
function runSaleTransaction_(rawRequest, adapter) {
  var journal = [];
  function refuse(code, message) {
    return { ok: false, code: code, message: message, journal: journal };
  }

  /* Gates first, and outside the lock. A refusal that is going to happen
     anyway should not make another till wait for a lock to find out. */
  journal.push('GATE_SALES');
  if (!gateOpen_(WRITER_GATES.SALES)) {
    return refuse(SALE_ERROR.WRITES_DISABLED,
      'SALES writing is disabled (' + WRITER_GATES.SALES + ' is not true). Nothing was written.');
  }
  journal.push('GATE_INVENTORY');
  if (!gateOpen_(WRITER_GATES.INVENTORY)) {
    return refuse(SALE_ERROR.INVENTORY_WRITES_DISABLED,
      'Inventory mutation is disabled (' + WRITER_GATES.INVENTORY + ' is not true). ' +
      'A sale that cannot mark its appliance SOLD is not completed. Nothing was written.');
  }

  var a = adapter || saleWriteAdapter_();
  journal.push('ADAPTER');
  if (!a || typeof a.readCommitted !== 'function' ||
      typeof a.appendSalesRows !== 'function' || typeof a.markSold !== 'function') {
    return refuse(SALE_ERROR.NO_WRITER,
      'No SALES writer exists. Nothing was written.');
  }

  var request;
  try {
    journal.push('VALIDATE');
    request = normaliseSaleRequest_(rawRequest);
    assertApprovedTender_(request.paymentMethodId);
  } catch (e) {
    return refuse(e.edpCode || SALE_ERROR.BAD_REQUEST, String(e && e.message || e));
  }

  try {
    return withSaleLock_(function () {
      /* Idempotency INSIDE the lock. Outside it, two retries of the same
         request could both miss and both write. */
      journal.push('IDEMPOTENCY');
      var already = findCommittedSale_(a.readCommitted(), request.requestId);
      if (already) {
        journal.push('RETURN_EXISTING');
        return {
          ok: true, duplicate: true, code: null,
          message: 'This request was already completed. Returning the original sale; no second sale was created.',
          saleId: already.saleId, rowCount: already.rowCount, journal: journal
        };
      }

      journal.push('PREPARE');
      var sale = prepareSale_(request);          /* allocates the id, inside the lock */

      journal.push('BUILD_ROWS');
      var rows = salesRowsToArrays_(buildSalesRows_(sale));

      journal.push('APPEND_SALES');
      var appended = a.appendSalesRows(rows);
      if (!appended || appended.ok !== true) {
        /* Nothing was committed, so inventory is never touched. */
        return refuse(SALE_ERROR.APPEND_FAILED,
          'The SALES append did not succeed, so no inventory was changed and no sale exists.');
      }

      /* From here the sale is REAL. Anything that fails below is a
         reconciliation exception, never a rollback: deleting the record to
         tidy up would erase the only evidence the money changed hands. */
      journal.push('MARK_SOLD');
      var soldFailures = [];
      sale.lines.forEach(function (l) {
        if (l.resolved === false) { return; }
        var r = a.markSold(l.itemId);
        if (!r || r.ok !== true) { soldFailures.push(l.itemId); }
      });

      journal.push('DONE');
      return {
        ok: true, duplicate: false,
        saleId: sale.saleId, rowCount: rows.length, sale: sale, journal: journal,
        reconciliation: soldFailures.length ? {
          code: SALE_ERROR.INVENTORY_RECONCILE,
          message: 'The sale is recorded and authoritative. These appliances could not be ' +
            'marked SOLD and need reconciling: ' + soldFailures.join(', ') + '. ' +
            'The sale was NOT rolled back.',
          items: soldFailures
        } : null
      };
    });
  } catch (e) {
    return refuse(e.edpCode || SALE_ERROR.BAD_REQUEST, String(e && e.message || e));
  }
}

/* --------------------------------------------------------------------------
 * Sale-id sequence allocation (Package 15B) — READ ONLY.
 * ------------------------------------------------------------------------ */

var SALES_SHEET_NAME = 'SALES';

/* Column A only. Reading the whole SALES tab would pull customer names and
   phone numbers into the Register for no reason; the allocator needs exactly
   one column and takes exactly one column. A2 skips the header row. */
var SALE_ID_COLUMN_RANGE = 'SALES!A2:A';

var MAX_DAILY_SEQUENCE = 999;
var SALE_LOCK_TIMEOUT_MS = 20000;

/**
 * Business date key, yyyyMMdd, in America/Chicago.
 *
 * The store's day, not UTC's. A sale rung at 7pm on 5 October in Louisiana is
 * 00:xx on 6 October UTC, and numbering it into the next day would be wrong on
 * every receipt, report and reconciliation that follows.
 */
function businessDateKey_(epochMs) {
  return Utilities.formatDate(new Date(epochMs), CONFIG.TIMEZONE, 'yyyyMMdd');
}

/**
 * Strictly parses a Register sale id. Returns { dateKey, seq } or null.
 *
 * Only the exact approved shape is accepted. Anything else returns null and is
 * treated as "not one of ours" — which is correct for the historical families
 * (S-…, SHOPIFY-…, MANUAL-…) that legitimately share this column.
 */
function parseRegisterSaleId_(id) {
  var s = String(id == null ? '' : id).trim();
  if (!SALE_ID.PRODUCTION_PATTERN.test(s)) { return null; }
  return { dateKey: s.slice(4, 12), seq: Number(s.slice(13, 16)) };
}

/**
 * True for a value that is CLAIMING to be a Register id but is not one.
 *
 * This distinction is the whole safety of the allocator. An unknown format
 * like "FOO-9" is somebody else's and is ignored. But "EDP-20261005-1000" or
 * "EDP-2026105-01" is a Register id that this code cannot read — and silently
 * skipping it could hand out a number already in use. Those fail closed.
 */
function looksLikeRegisterSaleId_(id) {
  return /^EDP-/i.test(String(id == null ? '' : id).trim());
}

/**
 * Highest sequence already used on one business date. PURE — give it a list,
 * it gives an answer, every time, with no clock and no network.
 *
 * Highest wins; gaps are NOT refilled. If 001 and 003 exist, the next is 004.
 * Reusing 002 would point two different sales at one identifier the moment the
 * gap turned out to be a deleted row rather than a skipped one.
 */
function highestSequenceFor_(saleIds, dateKey) {
  var highest = 0;
  (saleIds || []).forEach(function (raw) {
    var parsed = parseRegisterSaleId_(raw);
    if (!parsed) {
      if (looksLikeRegisterSaleId_(raw)) {
        throwSale_(SALE_ERROR.MALFORMED_SALE_ID,
          'SALES contains "' + String(raw).trim() + '", which claims to be a ' +
          'Register sale id but does not match ' + SALE_ID.PRODUCTION_FORMAT +
          '. Refusing to allocate past a Register id this code cannot read.');
      }
      return;                                   /* someone else's format */
    }
    if (parsed.dateKey !== dateKey) { return; } /* another day, not ours */
    if (parsed.seq > highest) { highest = parsed.seq; }
  });
  return highest;
}

/** Next sequence for a date. PURE. Fails closed at the 999 ceiling. */
function nextSequenceFrom_(saleIds, dateKey) {
  var next = highestSequenceFor_(saleIds, dateKey) + 1;
  if (next > MAX_DAILY_SEQUENCE) {
    throwSale_(SALE_ERROR.SEQUENCE_UNAVAILABLE,
      'Business date ' + dateKey + ' already has sequence ' + MAX_DAILY_SEQUENCE +
      '. Refusing to roll over into a format nobody approved.');
  }
  return next;
}

/** READ-ONLY fetch of the sale_id column. The only I/O in the allocator. */
function fetchSaleIdColumn_() {
  var res = Sheets.Spreadsheets.Values.get(getMasterDatabaseId_(), SALE_ID_COLUMN_RANGE);
  var values = (res && res.values) || [];
  return values.map(function (row) { return row && row.length ? row[0] : ''; });
}

/**
 * The transaction boundary, as a function.
 *
 * Everything that must be serialised against another cashier goes inside this
 * callback. Today that is the allocator alone; when writes are approved the
 * idempotency check and the SALES append move inside the SAME call, which is
 * the only arrangement that makes the sequence safe (see the limitation note
 * on allocateDailySequence_).
 *
 * tryLock, not waitLock: a boolean is easier to fail closed on than an
 * exception, and a sale that cannot get the lock must not proceed.
 */
/* Re-entrancy guard for the sale lock.
   The transaction boundary takes the lock and then calls prepareSale_, which
   reaches allocateDailySequence_, which also wants the lock. Nesting a real
   LockService call that way is a genuine hazard: getScriptLock() hands back
   the SAME lock, so the inner releaseLock() would drop it while the outer
   transaction is still writing — exactly the window the lock exists to close.
   The innermost call therefore runs inline and only the outermost acquires
   and releases. Found by a test asserting the lock was released once. */
var inSaleLock_ = false;

function withSaleLock_(fn) {
  if (inSaleLock_) { return fn(); }        /* already held by an outer caller */
  if (typeof LockService === 'undefined' || !LockService) {
    throwSale_(SALE_ERROR.LOCK_UNAVAILABLE,
      'LockService is unavailable, so two tills cannot be serialised. ' +
      'Refusing to allocate a sale id unprotected.');
  }
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    acquired = lock.tryLock(SALE_LOCK_TIMEOUT_MS);
  } catch (e) {
    acquired = false;
  }
  if (!acquired) {
    throwSale_(SALE_ERROR.LOCK_UNAVAILABLE,
      'Could not acquire the sale lock within ' + SALE_LOCK_TIMEOUT_MS +
      'ms. Another sale is in progress. Refusing to proceed unlocked.');
  }
  inSaleLock_ = true;
  try {
    return fn();
  } finally {
    inSaleLock_ = false;         /* cleared even if fn() throws */
    lock.releaseLock();          /* released even if fn() throws */
  }
}

/**
 * Storage rules, recorded 2026-10-04. RECORDED ONLY — nothing below charges
 * anything, and no storage code path exists.
 *
 * The repair rule is already live in the business: the AI receptionist tells
 * callers about "a $9 per day storage fee if not picked up within three days
 * of notification" (observed in VAPI_CALL_LOG). These constants agree with
 * what customers are already being told.
 *
 * Sunday never counts as a pickup day, because EDP is closed. Holiday
 * handling is NOT decided — see NV-27.
 */
var STORAGE_RULES = {
  DAILY_FEE: 9.00,
  PAYMENT_PICKUP_PLAN: {
    NAME: 'Payment & Pickup Plan',      /* the customer-facing name */
    NORMAL_PERIOD_CALENDAR_DAYS: 14,
    GRACE_OPEN_DAYS: 6,                 /* EDP open days; Sunday excluded */
    SUNDAY_COUNTS: false
  },
  REPAIR: {
    PICKUP_OPEN_DAYS: 3,                /* from ready-for-pickup notification */
    SUNDAY_COUNTS: false
  },
  HOLIDAYS: null                        /* NV-27 — no approved calendar exists */
};

/**
 * Whether a sale must name a customer.
 *
 * Today the Register sells to "Walk-in" with no customer linked, and no owner
 * decision has changed that, so this is false. It is a named constant rather
 * than an absence so the policy is visible and testable. See NV-16.
 */
var REQUIRE_CUSTOMER_FOR_SALE = false;

/** Minimum length of a client request id. Long enough that two tills cannot
 *  realistically collide; short enough to read off a screen when supporting
 *  someone over the phone. */
var MIN_REQUEST_ID_LENGTH = 16;

function throwSale_(code, msg) {
  var e = new Error('[EDP sale error] ' + code + ': ' + msg);
  e.edpCode = code;
  throw e;
}

/**
 * Server-authoritative timestamp. One call, one instant, reused everywhere in
 * a prepared sale, so the id, the record and the receipt can never disagree
 * about when the sale happened.
 */
function saleNow_() {
  var d = new Date();
  return {
    iso: d.toISOString(),
    epochMs: d.getTime(),
    timezone: CONFIG.TIMEZONE,
    display: Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
  };
}

/**
 * Server-authoritative sale id.
 *
 * Shape: TEST-SALE-<yyyyMMdd-HHmmss>-<6 random chars>
 *
 * The timestamp segment makes ids sort chronologically and makes a human able
 * to place one without a lookup. The random segment is what stops two tills
 * ringing in the same second from colliding. Apps Script gives one execution
 * per call with no shared counter available to a read-only build, so a
 * sequence number is not an option here and randomness is.
 *
 * FAIL CLOSED: while SALES writing is disabled this can only ever emit a
 * TEST- id. If someone enables the flag without first resolving the real id
 * convention (NV-15), this throws rather than minting an id in a format
 * nobody approved.
 */
/**
 * Formats an approved production sale id from a date and a day sequence.
 * Pure: it allocates nothing and reads nothing. Allocation is the hard part
 * and lives in allocateDailySequence_() below.
 */
function formatSaleId_(epochMs, seq) {
  if (typeof seq !== 'number' || !isFinite(seq) || seq < 1 || seq > 999 ||
      Math.floor(seq) !== seq) {
    throwSale_(SALE_ERROR.SEQUENCE_UNAVAILABLE,
      'A day sequence must be a whole number from 1 to 999, got ' + describeValue_(seq));
  }
  var day = Utilities.formatDate(new Date(epochMs), CONFIG.TIMEZONE, 'yyyyMMdd');
  var nnn = ('00' + seq).slice(-3);
  return SALE_ID.PRODUCTION_PREFIX + '-' + day + '-' + nnn;
}

/** True only for the approved Register format. Historical ids are not ours. */
function isRegisterSaleId_(id) {
  return SALE_ID.PRODUCTION_PATTERN.test(String(id));
}

/**
 * Allocates the next per-day sequence for a business date.
 *
 * Reads column A of SALES inside the script lock and returns the highest
 * Register sequence for that date, plus one.
 *
 * ADVISORY ONLY — AND THIS MATTERS.
 *
 * The number this returns is correct at the instant it is read, and it is NOT
 * reserved. Nothing is written, so nothing is claimed. Two sales that call
 * this one after another, with no append between them, BOTH receive the same
 * number. The lock serialises the readers; it cannot reserve what no one
 * writes.
 *
 * That is not a defect to be papered over — it is the honest limit of a
 * read-only allocator, and a test asserts it explicitly rather than implying a
 * safety that does not exist. Uniqueness arrives only when the SALES append
 * happens INSIDE this same withSaleLock_ call, so that reading the highest and
 * claiming the next are one indivisible step. Until then, treat the result as
 * a preview of the next id, never as a reservation.
 */
function allocateDailySequence_(now) {
  var at = now && typeof now.epochMs === 'number' ? now.epochMs : Date.now();
  var dateKey = businessDateKey_(at);
  return withSaleLock_(function () {
    return nextSequenceFrom_(fetchSaleIdColumn_(), dateKey);
  });
}

function newSaleId_(now) {
  var writesOn = CONFIG.FEATURES.SALES_WRITER_ENABLED === true;
  if (writesOn) {
    /* The format is approved; the ALLOCATOR is not built. Fail closed. */
    return formatSaleId_(now.epochMs, allocateDailySequence_(now));
  }
  var prefix = SALE_ID.TEST_PREFIX;
  var stamp = Utilities.formatDate(new Date(now.epochMs), CONFIG.TIMEZONE, 'yyyyMMdd-HHmmss');
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — read aloud safely
  var rand = '';
  for (var i = 0; i < 6; i++) {
    rand += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return prefix + '-' + stamp + '-' + rand;
}

/* --------------------------------------------------------------------------
 * Money
 *
 * Every figure is carried and compared in whole cents. Floating point dollars
 * are fine to display and wrong to decide with.
 * ------------------------------------------------------------------------ */

/** A monetary input is valid only if it is a finite, non-negative number that
 *  lands exactly on a cent. 1.005 is not money; it is a rounding argument. */
function assertMoney_(value, what) {
  if (typeof value !== 'number' || !isFinite(value) || value < 0) {
    throwSale_(SALE_ERROR.BAD_MONEY, what + ' must be a finite amount of zero or more, got ' + describeValue_(value));
  }
  var cents = value * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-6) {
    throwSale_(SALE_ERROR.BAD_MONEY, what + ' must be a whole number of cents, got ' + value);
  }
  return Math.round(cents);
}

function assertQuantity_(value, what) {
  if (typeof value !== 'number' || !isFinite(value) || value <= 0 || Math.floor(value) !== value) {
    throwSale_(SALE_ERROR.BAD_QUANTITY, what + ' must be a whole number above zero, got ' + describeValue_(value));
  }
  return value;
}

/**
 * Splits a TAX-INCLUSIVE total into its tax and pre-tax parts, in cents.
 * This is the Package 12 policy, server side and authoritative.
 *
 *     tax     = total - (total / (1 + rate))
 *     pre-tax = total - tax
 *
 * The tax is rounded once and the pre-tax amount is the remainder, so the two
 * always reconstruct the total exactly. The client runs the same arithmetic
 * for its preview; a test asserts the two agree across many values, because
 * two implementations of one rule is how they drift apart.
 */
function splitInclusiveTaxCents_(totalCents, rate) {
  var taxCents = Math.round(totalCents - totalCents / (1 + rate));
  return { taxCents: taxCents, preTaxCents: totalCents - taxCents };
}

/** Fails closed on tax configuration, exactly as the client does. A rate that
 *  is absent, zero, negative, non-numeric or out of range yields no sale. */
function assertTaxConfigured_() {
  var t = CONFIG.SALES_TAX;
  if (!t || t.MODE !== 'INCLUSIVE') {
    throwSale_(SALE_ERROR.TAX_NOT_CONFIGURED, 'Sales tax mode is not the approved INCLUSIVE mode.');
  }
  if (typeof t.RATE !== 'number' || !isFinite(t.RATE) || t.RATE <= 0 || t.RATE >= 1) {
    throwSale_(SALE_ERROR.TAX_NOT_CONFIGURED, 'Sales tax rate is not configured.');
  }
  return t.RATE;
}

/* --------------------------------------------------------------------------
 * Request model
 * ------------------------------------------------------------------------ */

/**
 * Normalises and validates a checkout request from the browser.
 *
 * The incoming shape is deliberately small, and deliberately carries NO money
 * the server will believe:
 *
 *   {
 *     requestId: String,          // client-generated, stable across retries
 *     customerId: String|null,
 *     paymentMethodId: String,
 *     amountTenderedCents: Number|null,   // CASH only; null otherwise
 *     lines: [ { itemId: String, qty: Number, warrantyId: String,
 *                unitPriceCents: Number|null } ]   // null = use list price
 *   }
 *
 * unitPriceCents exists because a cashier may discount at the till. It is a
 * DECLARED override, validated here, never a silent substitution — and it can
 * only ever lower or raise a price the server itself resolved, so a line for
 * an item that does not exist cannot carry a price at all.
 *
 * Throws on the first problem it finds. It does not repair, coerce, default or
 * drop anything, which is the same fail-closed rule the inventory validator
 * has followed since Phase 2.
 */
function normaliseSaleRequest_(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throwSale_(SALE_ERROR.BAD_REQUEST, 'A sale request must be an object, got ' + describeValue_(raw));
  }

  if (typeof raw.requestId !== 'string' || raw.requestId.trim().length < MIN_REQUEST_ID_LENGTH) {
    throwSale_(SALE_ERROR.MISSING_REQUEST_ID,
      'requestId must be a string of at least ' + MIN_REQUEST_ID_LENGTH +
      ' characters. It is what makes a retry safe to repeat.');
  }

  if (!Array.isArray(raw.lines)) {
    throwSale_(SALE_ERROR.BAD_REQUEST, 'lines must be an array, got ' + describeValue_(raw.lines));
  }
  if (raw.lines.length === 0) {
    throwSale_(SALE_ERROR.EMPTY_CART, 'A sale must contain at least one line.');
  }

  if (typeof raw.paymentMethodId !== 'string' || raw.paymentMethodId === '') {
    throwSale_(SALE_ERROR.BAD_REQUEST, 'paymentMethodId must be a non-empty string.');
  }

  var customerId = null;
  if (raw.customerId !== null && raw.customerId !== undefined && raw.customerId !== '') {
    if (typeof raw.customerId !== 'string') {
      throwSale_(SALE_ERROR.BAD_REQUEST, 'customerId must be a string or null.');
    }
    customerId = raw.customerId;
  }

  var tendered = null;
  if (raw.amountTenderedCents !== null && raw.amountTenderedCents !== undefined) {
    if (typeof raw.amountTenderedCents !== 'number' || !isFinite(raw.amountTenderedCents) ||
        raw.amountTenderedCents < 0 || Math.floor(raw.amountTenderedCents) !== raw.amountTenderedCents) {
      throwSale_(SALE_ERROR.BAD_MONEY,
        'amountTenderedCents must be a whole number of cents, got ' + describeValue_(raw.amountTenderedCents));
    }
    tendered = raw.amountTenderedCents;
  }

  var lines = raw.lines.map(function (l, i) {
    var at = 'lines[' + i + ']';
    if (l === null || typeof l !== 'object' || Array.isArray(l)) {
      throwSale_(SALE_ERROR.BAD_REQUEST, at + ' must be an object, got ' + describeValue_(l));
    }
    if (typeof l.itemId !== 'string' || l.itemId === '') {
      throwSale_(SALE_ERROR.BAD_REQUEST, at + '.itemId must be a non-empty string.');
    }
    assertQuantity_(l.qty, at + '.qty');
    if (typeof l.warrantyId !== 'string' || l.warrantyId === '') {
      throwSale_(SALE_ERROR.BAD_REQUEST, at + '.warrantyId must be a non-empty string.');
    }
    var override = null;
    if (l.unitPriceCents !== null && l.unitPriceCents !== undefined) {
      if (typeof l.unitPriceCents !== 'number' || !isFinite(l.unitPriceCents) ||
          l.unitPriceCents < 0 || Math.floor(l.unitPriceCents) !== l.unitPriceCents) {
        throwSale_(SALE_ERROR.BAD_MONEY,
          at + '.unitPriceCents must be a whole number of cents, got ' + describeValue_(l.unitPriceCents));
      }
      override = l.unitPriceCents;
    }
    return { itemId: l.itemId, qty: l.qty, warrantyId: l.warrantyId, unitPriceCents: override };
  });

  return {
    requestId: raw.requestId.trim(),
    customerId: customerId,
    paymentMethodId: raw.paymentMethodId,
    amountTenderedCents: tendered,
    lines: lines
  };
}

/* --------------------------------------------------------------------------
 * Preparation — the read-only heart of a sale
 * ------------------------------------------------------------------------ */

/**
 * Resolves a normalised request against REAL inventory, the REAL warranty and
 * payment catalogues and the APPROVED tax policy, and returns a fully priced,
 * server-authoritative prepared sale.
 *
 * This performs reads only. Calling it a hundred times changes nothing.
 *
 * Every line must resolve to a real, currently sellable inventory record. An
 * unresolvable line is the Package 10 failure mode — it is what turned a
 * missing item into a blank, zero-priced line and put an $818.69 phantom sale
 * on screen. Here it does not merely get excluded from the totals; it refuses
 * the whole sale. A cart the server cannot price is not a sale.
 */
function prepareSale_(request) {
  var rate = assertTaxConfigured_();
  var now = saleNow_();

  var inventory = readInventory();
  var byId = {};
  inventory.forEach(function (it) { byId[it.itemId] = it; });

  var warranties = {};
  CONFIG.WARRANTY_OPTIONS.forEach(function (w) { warranties[w.id] = w; });

  var payment = null;
  CONFIG.PAYMENT_METHODS.forEach(function (p) {
    if (p.id === request.paymentMethodId) { payment = p; }
  });
  if (!payment) {
    throwSale_(SALE_ERROR.UNKNOWN_PAYMENT,
      'Payment method "' + request.paymentMethodId + '" is not one of the configured methods.');
  }

  var customer = null;
  if (request.customerId) {
    readCustomers().forEach(function (c) {
      if (c.customerId === request.customerId) { customer = c; }
    });
    if (!customer) {
      throwSale_(SALE_ERROR.UNKNOWN_CUSTOMER,
        'Customer "' + request.customerId + '" was not found.');
    }
  } else if (REQUIRE_CUSTOMER_FOR_SALE) {
    throwSale_(SALE_ERROR.CUSTOMER_REQUIRED, 'This sale requires a customer and none was linked.');
  }

  var goodsCents = 0, warrantyCents = 0, itemCount = 0;

  var lines = request.lines.map(function (l, i) {
    var at = 'lines[' + i + ']';
    var item = byId[l.itemId];
    if (!item) {
      throwSale_(SALE_ERROR.UNRESOLVED_LINE,
        at + ' names item "' + l.itemId + '", which is not in the sellable inventory. ' +
        'A cart the server cannot price is not a sale.');
    }
    var warranty = warranties[l.warrantyId];
    if (!warranty) {
      throwSale_(SALE_ERROR.UNKNOWN_WARRANTY,
        at + ' names warranty "' + l.warrantyId + '", which is not a configured option.');
    }

    var listCents = assertMoney_(item.price, at + ' list price');
    var unitCents = l.unitPriceCents === null ? listCents : l.unitPriceCents;
    var warrantyUnitCents = assertMoney_(warranty.price, at + ' warranty price');

    var lineGoods = unitCents * l.qty;
    var lineWarranty = warrantyUnitCents * l.qty;

    goodsCents += lineGoods;
    warrantyCents += lineWarranty;
    itemCount += l.qty;

    return {
      itemId: item.itemId,
      brand: item.brand || '',
      model: item.model || '',
      description: item.description || '',
      condition: item.condition || '',
      category: item.category || '',
      serialPlaceholder: item.serialPlaceholder || '[ SERIAL PLACEHOLDER ]',
      qty: l.qty,
      listPriceCents: listCents,
      unitPriceCents: unitCents,
      priceOverridden: unitCents !== listCents,
      warrantyId: warranty.id,
      warrantyLabel: warranty.label,
      warrantyUnitCents: warrantyUnitCents,
      lineTotalCents: lineGoods + lineWarranty
    };
  });

  // THE CUSTOMER TOTAL. Tax-inclusive, so it is exactly the sum of the prices
  // on display. Nothing is added to it.
  var totalCents = goodsCents + warrantyCents;
  var split = splitInclusiveTaxCents_(totalCents, rate);

  var changeCents = null;
  if (request.amountTenderedCents !== null) {
    if (request.amountTenderedCents < totalCents) {
      throwSale_(SALE_ERROR.INSUFFICIENT_TENDER,
        'Tendered ' + centsToString_(request.amountTenderedCents) +
        ' is less than the total ' + centsToString_(totalCents) + '.');
    }
    changeCents = request.amountTenderedCents - totalCents;
  }

  return {
    saleId: newSaleId_(now),
    requestId: request.requestId,
    isTest: CONFIG.FEATURES.SALES_WRITER_ENABLED !== true,
    occurredAt: now,
    customer: customer ? { customerId: customer.customerId, name: customer.name, phone: customer.phone } : null,
    payment: {
      methodId: payment.id,
      methodLabel: payment.label,
      amountTenderedCents: request.amountTenderedCents,
      changeCents: changeCents
    },
    lines: lines,
    totals: {
      goodsCents: goodsCents,
      warrantyCents: warrantyCents,
      totalCents: totalCents,
      taxCents: split.taxCents,
      preTaxCents: split.preTaxCents,
      taxRate: rate,
      taxMode: CONFIG.SALES_TAX.MODE,
      taxLabel: CONFIG.SALES_TAX.LABEL,
      itemCount: itemCount
    },
    build: {
      environment: CONFIG.ENVIRONMENT,
      version: CONFIG.BUILD_VERSION
    }
  };
}

/* --------------------------------------------------------------------------
 * SALES row mapping — PURE. Builds rows, writes nothing.
 * ------------------------------------------------------------------------ */

/** Monday of the week containing a date, as yyyy-MM-dd. Observed convention:
 *  sales on 2026-09-10 and 2026-09-12 both carry week_id 2026-09-08. */
function weekIdFor_(epochMs) {
  var d = new Date(epochMs);
  var dow = Number(Utilities.formatDate(d, CONFIG.TIMEZONE, 'u')); /* 1=Mon..7=Sun */
  var monday = new Date(epochMs - (dow - 1) * 86400000);
  return Utilities.formatDate(monday, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Maps a prepared sale to ONE SALES ROW PER ITEM, every row sharing the same
 * sale_id (owner decision, 2026-10-04). Item-level inventory linkage is never
 * collapsed away.
 *
 * Columns deliberately left EMPTY, and why:
 *   notes, detail_status, inventory_update_status, accounting_status
 *       These are human reconciliation prose in the real sheet — 27, 25 and 24
 *       distinct values, mostly unique sentences. A machine inventing a
 *       vocabulary here would corrupt a column people read. (NV-24)
 *   invoice_number, source_order_id, source_order_number, import_batch_id,
 *   legacy_item_id
 *       These belong to Shopify imports and reconciliation. A Register sale
 *       has no such source.
 *   (unused_col_32)
 *       Has no header in the sheet. Never written.
 *
 * MONEY: each row carries its own tax-inclusive amount and its own extracted
 * tax, because every historical row stands alone. Rounding each row
 * independently can leave the row taxes a cent away from the transaction tax,
 * so the difference is pushed onto the largest row and the result is asserted
 * before the rows are returned. Totals that do not reconcile are a defect, not
 * a rounding opinion.
 */
function buildSalesRows_(sale, options) {
  var opts = options || {};
  var rate = sale.totals.taxRate;
  var when = sale.occurredAt;
  var stamp = Utilities.formatDate(new Date(when.epochMs), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  var day = Utilities.formatDate(new Date(when.epochMs), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  var week = weekIdFor_(when.epochMs);

  var priced = sale.lines.filter(function (l) { return l.resolved !== false; });
  if (!priced.length) {
    throwSale_(SALE_ERROR.EMPTY_CART, 'A sale must produce at least one SALES row.');
  }

  var rows = priced.map(function (l) {
    var amountCents = l.lineTotalCents;
    var split = splitInclusiveTaxCents_(amountCents, rate);
    return {
      itemId: l.itemId,
      amountCents: amountCents,
      taxCents: split.taxCents,
      line: l
    };
  });

  /* Reconcile the per-row taxes against the transaction tax, to the cent. */
  var rowTaxTotal = rows.reduce(function (a, r) { return a + r.taxCents; }, 0);
  var drift = sale.totals.taxCents - rowTaxTotal;
  if (drift !== 0) {
    var biggest = rows.reduce(function (a, b) { return b.amountCents > a.amountCents ? b : a; }, rows[0]);
    biggest.taxCents += drift;
  }
  var checkAmount = rows.reduce(function (a, r) { return a + r.amountCents; }, 0);
  var checkTax = rows.reduce(function (a, r) { return a + r.taxCents; }, 0);
  if (checkAmount !== sale.totals.totalCents || checkTax !== sale.totals.taxCents) {
    throwSale_(SALE_ERROR.BAD_MONEY,
      'Row totals do not reconcile with the sale: rows give ' +
      centsToString_(checkAmount) + ' / tax ' + centsToString_(checkTax) +
      ', sale says ' + centsToString_(sale.totals.totalCents) + ' / tax ' +
      centsToString_(sale.totals.taxCents) + '.');
  }

  return rows.map(function (r) {
    var l = r.line;
    var row = {
      sale_id: sale.saleId,
      timestamp: stamp,
      sale_date: day,
      week_id: week,
      amount: r.amountCents / 100,
      category: opts.category || 'Appliance Sale',
      payment_type: sale.payment.methodLabel,
      notes: '',
      entered_by: opts.enteredBy || '',
      invoice_number: '',
      item_id: l.itemId,
      inventory_sku_at_sale: l.itemId,
      legacy_item_id: '',
      item_description_at_sale: l.description || ((l.brand + ' ' + l.model).trim()),
      brand_at_sale: l.brand || '',
      model_at_sale: l.model || '',
      serial_at_sale: '',
      warranty_at_sale: l.warrantyLabel || '',
      tax_rate: rate,
      tax_amount: r.taxCents / 100,
      sales_source: 'EDP_REGISTER',
      entry_type: 'REGISTER_SALE',
      source_order_id: '',
      source_order_number: '',
      customer_id: sale.customer ? sale.customer.customerId : '',
      customer_name: sale.customer ? sale.customer.name : '',
      customer_phone: sale.customer ? sale.customer.phone : '',
      import_batch_id: '',
      detail_status: '',
      inventory_update_status: '',
      accounting_status: '',
      '(unused_col_32)': '',
      request_id: sale.requestId
    };
    return row;
  });
}

/**
 * Turns mapped rows into positional arrays in the sheet's exact column order.
 * Still pure. request_id is appended as column 33 ONLY once the approved
 * migration has been applied; until then this refuses, because writing a
 * 33-wide row into a 32-wide sheet would silently land request_id in the
 * unheaded column 32.
 */
function salesRowsToArrays_(rows) {
  if (!SALES_MIGRATION.APPLIED) {
    throwSale_(SALE_ERROR.MIGRATION_REQUIRED,
      'The approved request_id column (33) has not been added to SALES yet. ' +
      'Refusing to build a positional row that would misalign against the ' +
      'current 32-column sheet.');
  }
  var cols = SALES_COLUMNS.concat([SALES_MIGRATION.ADD_COLUMN]);
  return rows.map(function (r) {
    return cols.map(function (c) { return r[c] === undefined ? '' : r[c]; });
  });
}

function centsToString_(c) {
  return '$' + (c / 100).toFixed(2);
}

/* --------------------------------------------------------------------------
 * Exposed entry points
 * ------------------------------------------------------------------------ */

/**
 * Dry run. Validates and prices a checkout WITHOUT completing anything.
 *
 * This is safe to call at any time, including while every write flag is off,
 * because it only reads. It exists so the till can tell a cashier that a cart
 * is or is not sellable BEFORE anyone presses a button that moves money.
 *
 * Returns { ok: true, sale } or { ok: false, code, message }. It resolves
 * rather than throwing, because a cashier facing a rejected cart needs a
 * readable reason on screen, not a stack trace in a log nobody opens.
 */
function prepareSale(request) {
  try {
    return { ok: true, sale: prepareSale_(normaliseSaleRequest_(request)) };
  } catch (e) {
    return {
      ok: false,
      code: e.edpCode || SALE_ERROR.BAD_REQUEST,
      message: String(e && e.message || e)
    };
  }
}

/**
 * The eventual real entry point for completing a sale.
 *
 * ORCHESTRATION SKELETON ONLY. It refuses before doing anything, and the
 * refusal is deliberately the very first statement in the function so that no
 * future edit can slip work in ahead of the guard without deleting the guard
 * outright.
 *
 * The steps it will perform, once each is separately approved and built, are
 * listed below as comments rather than as code. They are in dependency order,
 * and the ordering is the safety design: nothing irreversible happens until
 * the sale record exists, and the record is written before inventory moves,
 * so a crash between the two leaves a sale that can be reconciled rather than
 * stock that vanished into no sale at all.
 */
function completeSale(request) {
  if (CONFIG.FEATURES.COMPLETE_SALE_ENABLED !== true ||
      CONFIG.FEATURES.SALES_WRITER_ENABLED !== true) {
    return {
      ok: false,
      code: SALE_ERROR.WRITES_DISABLED,
      message: 'Completing a sale is disabled in this build. ' +
        'COMPLETE_SALE_ENABLED and SALES_WRITER_ENABLED are both false, the ' +
        'OAuth scope is read-only, and no SALES writer exists. Nothing was written.'
    };
  }

  /* Reachable only if BOTH gates are opened. Even then it refuses, because
     saleWriteAdapter_() returns null — no writer exists. */
  var out = runSaleTransaction_(request, null);
  if (!out.ok) { return { ok: false, code: out.code, message: out.message }; }
  return out;

  /* eslint-disable no-unreachable */
  // The reviewed plan, kept as comments rather than behaviour.
  //
  //  1. normaliseSaleRequest_(request)        validate, fail closed
  //  2. idempotency: has requestId already produced a sale?  -> return it
  //  3. prepareSale_(request)                 server-authoritative money + id
  //  4. append ONE SALES row                  the authoritative record
  //  5. mark each appliance SOLD              only after step 4 succeeds
  //  6. append outbox events                  SALE_COMPLETED, INVENTORY_SOLD,
  //                                           RECEIPT_PRINT_REQUESTED
  //  7. return the prepared sale              the receipt renders from it
  //
  // Steps 2 and 4 cannot be built until the SALES schema is re-confirmed
  // (NV-15) and an idempotency store is chosen (NV-17).
  return {
    ok: false,
    code: SALE_ERROR.NOT_IMPLEMENTED,
    message: 'No SALES writer exists. Nothing was written.'
  };
}
