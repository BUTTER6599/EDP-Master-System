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
  PRODUCTION_PREFIX: null
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
  MISSING_REQUEST_ID: 'SALE_MISSING_REQUEST_ID'
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
function newSaleId_(now) {
  var writesOn = CONFIG.FEATURES.SALES_WRITER_ENABLED === true;
  var prefix = writesOn ? SALE_ID.PRODUCTION_PREFIX : SALE_ID.TEST_PREFIX;
  if (!prefix) {
    throwSale_(SALE_ERROR.NOT_IMPLEMENTED,
      'No approved production sale-id format exists yet (NV-15). Refusing to ' +
      'invent one. Re-confirm the SALES schema before enabling writes.');
  }
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

  // Unreachable in this build. Left as the reviewed plan, not as behaviour.
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
