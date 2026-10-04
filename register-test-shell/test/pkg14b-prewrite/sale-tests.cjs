// Package 13 — Complete Sale foundation.
//
// Runs the REAL Sale.gs in a sandbox beside the REAL DataSource/Validation/
// Config/MockData, and the REAL client out of Scripts.html. Nothing here is a
// re-implementation. Touches no Google service, no spreadsheet, no network.
//
// The point of this suite is not that the happy path works. It is that a sale
// CANNOT happen while the write flags are off, and that everything which will
// one day move money refuses before it guesses.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

const saleSrc = read('Sale.gs');
const clientHtml = read('Scripts.html');
const js = (clientHtml.match(/<script>([\s\S]*)<\/script>/) || [])[1] || '';

// Source bans below are checked against CODE, not against the safety-contract
// comments that RECORD those bans — Sale.gs names the write verbs precisely in
// order to state that it contains none of them.
const stripComments = s => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

/* ---------------------------------------------------------------------------
 * Server sandbox: the real .gs files, plus the Apps Script globals they use.
 * A write verb reaching any of these stubs is a FAILURE, not a no-op, so an
 * accidental write attempt is loud.
 * ------------------------------------------------------------------------ */
const writeAttempts = [];
function forbidden(name) {
  return new Proxy(function () {}, {
    get: () => forbidden(name),
    apply: () => { writeAttempts.push(name); throw new Error('FORBIDDEN WRITE: ' + name); }
  });
}

function serverSandbox(opts) {
  opts = opts || {};
  const S = { console, JSON, Math, Number, String, Array, Object, Date, RegExp,
              isFinite, isNaN, parseInt, parseFloat, Error, TypeError };
  S.globalThis = S;
  S.Utilities = {
    formatDate(d, tz, fmt) {
      // Deterministic UTC rendering is enough: the suite asserts SHAPE and
      // ordering, never a wall-clock value in a particular zone.
      const p = n => String(n).padStart(2, '0');
      const Y = d.getUTCFullYear(), M = p(d.getUTCMonth() + 1), D = p(d.getUTCDate());
      const h = p(d.getUTCHours()), m = p(d.getUTCMinutes()), s = p(d.getUTCSeconds());
      return fmt === 'yyyyMMdd-HHmmss' ? `${Y}${M}${D}-${h}${m}${s}`
                                       : `${Y}-${M}-${D} ${h}:${m}:${s}`;
    }
  };
  S.SpreadsheetApp = forbidden('SpreadsheetApp');
  S.DriveApp = forbidden('DriveApp');
  S.MailApp = forbidden('MailApp');
  S.GmailApp = forbidden('GmailApp');
  S.UrlFetchApp = forbidden('UrlFetchApp');
  S.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: () => 'TEST-SPREADSHEET-ID-NOT-USED',
      setProperty: () => { writeAttempts.push('PropertiesService.setProperty'); throw new Error('FORBIDDEN WRITE'); }
    })
  };
  // Sheets is never reached: these suites pin the MOCK source, exactly as the
  // adapter suites have since Package 8.
  S.Sheets = forbidden('Sheets');

  vm.createContext(S);
  ['Config.gs', 'MockData.gs', 'Validation.gs', 'DataSource.gs', 'InventoryQuery.gs', 'Sale.gs']
    .forEach(f => vm.runInContext(read(f), S, { filename: f }));
  vm.runInContext("ACTIVE_DATA_SOURCE = DATA_SOURCES.MOCK;", S);
  if (opts.features) {
    vm.runInContext('Object.assign(CONFIG.FEATURES, ' + JSON.stringify(opts.features) + ');', S);
  }
  if (opts.after) { vm.runInContext(opts.after, S); }
  return S;
}
const call = (S, expr) => vm.runInContext(expr, S);

const RID = 'REQ-0123456789abcdef-pkg13';
function req(over) {
  return Object.assign({
    requestId: RID,
    customerId: null,
    paymentMethodId: 'CASH',
    amountTenderedCents: null,
    lines: [{ itemId: null, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }]
  }, over || {});
}
function prepare(S, request) {
  return call(S, 'prepareSale(' + JSON.stringify(request) + ')');
}
/** First real sellable item id from the mock source the server itself reads. */
function firstItem(S) {
  const inv = call(S, 'readInventory()');
  return inv[0];
}

console.log('PACKAGE 13 — COMPLETE SALE FOUNDATION');
console.log('=====================================');

/* ---------------------------------------------------------------------- */
console.log('\n1. A SALE CANNOT HAPPEN WHILE THE WRITE FLAGS ARE OFF');
{
  const S = serverSandbox();
  const item = firstItem(S);
  const r = req({ lines: [{ itemId: item.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] });

  const res = call(S, 'completeSale(' + JSON.stringify(r) + ')');
  ok('completeSale refuses', res.ok === false);
  ok('and names WHY, with a stable code', res.code === 'SALE_WRITES_DISABLED', res.code);
  ok('and states plainly that nothing was written', /Nothing was written/.test(res.message));
  ok('it refuses even for a perfectly valid request', res.ok === false);

  // Every single-flag combination must still refuse. Only both-on may proceed.
  [['COMPLETE_SALE_ENABLED'], ['SALES_WRITER_ENABLED']].forEach(function (flags) {
    const f = {}; flags.forEach(k => { f[k] = true; });
    const T = serverSandbox({ features: f });
    const out = call(T, 'completeSale(' + JSON.stringify(r) + ')');
    ok('still refuses with only ' + flags[0] + ' on', out.ok === false, out.code);
  });

  ok('no write verb was reached at any point', writeAttempts.length === 0,
    writeAttempts.join(', '));
}
{
  // Flags both on: it must STILL refuse, because no writer exists. The guard
  // is not the only thing standing between a cart and a sale.
  const S = serverSandbox({ features: { COMPLETE_SALE_ENABLED: true, SALES_WRITER_ENABLED: true } });
  const item = firstItem(S);
  const r = req({ lines: [{ itemId: item.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] });
  const res = call(S, 'completeSale(' + JSON.stringify(r) + ')');
  ok('with BOTH flags on it still refuses — no writer exists', res.ok === false);
  ok('and says so', res.code === 'SALE_WRITER_NOT_IMPLEMENTED', res.code);
  ok('no SALES row was appended (no such code path exists in Sale.gs)',
    !/Values\.append|Values\.update|appendRow|setValues?\(/.test(stripComments(saleSrc)));
  ok('no inventory mutation path exists in Sale.gs',
    !/markInventorySold|INVENTORY_MUTATION_ENABLED\s*=\s*true/.test(stripComments(saleSrc)));
  ok('no write verb was reached', writeAttempts.length === 0, writeAttempts.join(', '));
}

/* ---------------------------------------------------------------------- */
console.log('\n2. A VALID SALE REQUEST PRICES CORRECTLY (DRY RUN, READ ONLY)');
{
  const S = serverSandbox();
  const item = firstItem(S);
  const r = req({ lines: [{ itemId: item.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] });
  const res = prepare(S, r);
  ok('prepareSale accepts it', res.ok === true, res.ok ? '' : res.code + ' ' + res.message);
  const sale = res.sale;
  ok('one line', sale.lines.length === 1);
  ok('the line carries the REAL item', sale.lines[0].itemId === item.itemId);
  ok('priced from the server, not the request',
    sale.lines[0].unitPriceCents === Math.round(item.price * 100),
    sale.lines[0].unitPriceCents + ' vs ' + Math.round(item.price * 100));
  ok('the total is the price shown — nothing added',
    sale.totals.totalCents === Math.round(item.price * 100));
  ok('the request id is echoed back', sale.requestId === RID);
  ok('the sale is flagged as a TEST sale', sale.isTest === true);
  ok('it is NOT marked ok-to-write anywhere', sale.written === undefined);
  ok('reading it twice changes nothing', JSON.stringify(prepare(S, r).sale.totals) ===
    JSON.stringify(sale.totals));
}

/* ---------------------------------------------------------------------- */
console.log('\n3. SERVER IS AUTHORITATIVE FOR ID AND TIME');
{
  const S = serverSandbox();
  const item = firstItem(S);
  const base = { itemId: item.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null };

  // A client that tries to dictate identity, time or money is ignored.
  const hostile = req({
    lines: [base],
    saleId: 'CLIENT-CHOSEN-ID',
    occurredAt: '1999-01-01T00:00:00.000Z',
    totals: { totalCents: 1 },
    total: 1
  });
  const sale = prepare(S, hostile).sale;
  ok('a client-supplied saleId is ignored', sale.saleId !== 'CLIENT-CHOSEN-ID', sale.saleId);
  ok('a client-supplied timestamp is ignored', sale.occurredAt.iso.slice(0, 4) !== '1999');
  ok('a client-supplied total is ignored',
    sale.totals.totalCents === Math.round(item.price * 100));

  ok('the sale id is prefixed TEST-SALE while writes are off',
    sale.saleId.indexOf('TEST-SALE-') === 0, sale.saleId);
  ok('the sale id carries a sortable timestamp segment',
    /^TEST-SALE-\d{8}-\d{6}-[A-Z2-9]{6}$/.test(sale.saleId), sale.saleId);
  ok('the random segment avoids I, O, 0 and 1', !/[IO01]/.test(sale.saleId.split('-').pop()));

  const ids = {};
  for (let i = 0; i < 400; i++) { ids[prepare(S, hostile).sale.saleId] = 1; }
  ok('400 consecutive ids are distinct', Object.keys(ids).length === 400,
    Object.keys(ids).length + ' distinct');

  ok('the timestamp is ISO, epoch and display, from ONE instant',
    typeof sale.occurredAt.iso === 'string' &&
    typeof sale.occurredAt.epochMs === 'number' &&
    typeof sale.occurredAt.display === 'string' &&
    new Date(sale.occurredAt.iso).getTime() === sale.occurredAt.epochMs);
  ok('the timestamp names the store timezone', sale.occurredAt.timezone === 'America/Chicago');
}
{
  // FAIL CLOSED: enabling writes without an approved production id format
  // must refuse rather than mint an id in a format nobody approved.
  const S = serverSandbox({ features: { SALES_WRITER_ENABLED: true } });
  const item = firstItem(S);
  const res = prepare(S, req({ lines: [{ itemId: item.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] }));
  ok('with writes on and no approved id format, it REFUSES to invent one',
    res.ok === false && res.code === 'SALE_WRITER_NOT_IMPLEMENTED', res.code);
  ok('and points at the open question', /NV-15/.test(res.message));
}

/* ---------------------------------------------------------------------- */
console.log('\n4. INVALID CARTS ARE REFUSED, NOT REPAIRED');
{
  const S = serverSandbox();
  const item = firstItem(S);
  const good = { itemId: item.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null };
  const cases = [
    ['an empty cart',               req({ lines: [] }),                                 'SALE_EMPTY_CART'],
    ['lines that are not an array', req({ lines: 'nope' }),                             'SALE_BAD_REQUEST'],
    ['a null request',              null,                                               'SALE_BAD_REQUEST'],
    ['an array request',            [],                                                 'SALE_BAD_REQUEST'],
    ['an unknown item',             req({ lines: [{ itemId: 'GHOST-9', qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] }), 'SALE_UNRESOLVED_LINE'],
    ['a zero quantity',             req({ lines: [Object.assign({}, good, { qty: 0 })] }),    'SALE_BAD_QUANTITY'],
    ['a negative quantity',         req({ lines: [Object.assign({}, good, { qty: -2 })] }),   'SALE_BAD_QUANTITY'],
    ['a fractional quantity',       req({ lines: [Object.assign({}, good, { qty: 1.5 })] }),  'SALE_BAD_QUANTITY'],
    ['a string quantity',           req({ lines: [Object.assign({}, good, { qty: '1' })] }),  'SALE_BAD_QUANTITY'],
    ['a negative price override',   req({ lines: [Object.assign({}, good, { unitPriceCents: -1 })] }), 'SALE_BAD_MONEY'],
    ['a fractional-cent override',  req({ lines: [Object.assign({}, good, { unitPriceCents: 10.5 })] }), 'SALE_BAD_MONEY'],
    ['an unknown warranty',         req({ lines: [Object.assign({}, good, { warrantyId: 'W-NOPE' })] }), 'SALE_UNKNOWN_WARRANTY'],
    ['an unknown payment method',   req({ lines: [good], paymentMethodId: 'CRYPTO' }),  'SALE_UNKNOWN_PAYMENT'],
    ['an unknown customer',         req({ lines: [good], customerId: 'CUST-NOPE' }),    'SALE_UNKNOWN_CUSTOMER'],
    ['a missing requestId',         req({ lines: [good], requestId: undefined }),       'SALE_MISSING_REQUEST_ID'],
    ['a too-short requestId',       req({ lines: [good], requestId: 'short' }),         'SALE_MISSING_REQUEST_ID'],
    ['a non-string requestId',      req({ lines: [good], requestId: 12345678901234567 }), 'SALE_MISSING_REQUEST_ID'],
    ['tender below the total',      req({ lines: [good], amountTenderedCents: 1 }),     'SALE_INSUFFICIENT_TENDER'],
    ['fractional-cent tender',      req({ lines: [good], amountTenderedCents: 10.5 }),  'SALE_BAD_MONEY']
  ];
  cases.forEach(function (c) {
    const res = prepare(S, c[1]);
    ok('refuses ' + c[0], res.ok === false && res.code === c[2],
      res.ok ? 'ACCEPTED' : res.code);
  });
  ok('a refusal never returns a sale', cases.every(c => prepare(S, c[1]).sale === undefined));

  // NaN and Infinity do not survive JSON, so a JSON-built fixture arrives as
  // null and never reaches the guard. google.script.run serialises the same
  // way, so these are driven as source inside the sandbox instead - which is
  // the only way to actually exercise the isFinite checks.
  const line = v => '{itemId:"' + item.itemId + '", qty:1, warrantyId:"W-ASIS", unitPriceCents:' + v + '}';
  const direct = body => call(S, 'prepareSale({requestId:"' + RID + '", customerId:null, ' +
    'paymentMethodId:"CASH", amountTenderedCents:null, lines:[' + body + ']})');
  [['NaN', 'NaN'], ['Infinity', 'Infinity'], ['-Infinity', '-Infinity']].forEach(function (c) {
    const res = direct(line(c[1]));
    ok('refuses a ' + c[0] + ' price override', res.ok === false && res.code === 'SALE_BAD_MONEY',
      res.ok ? 'ACCEPTED' : res.code);
  });
  [['NaN', 'NaN'], ['Infinity', 'Infinity']].forEach(function (c) {
    const res = call(S, 'prepareSale({requestId:"' + RID + '", customerId:null, ' +
      'paymentMethodId:"CASH", amountTenderedCents:' + c[1] + ', lines:[' + line('null') + ']})');
    ok('refuses a ' + c[0] + ' tender', res.ok === false && res.code === 'SALE_BAD_MONEY',
      res.ok ? 'ACCEPTED' : res.code);
  });
  // A list price that is not a whole number of cents must stop the sale rather
  // than be rounded into one. Driven as source for the same JSON reason.
  (function () {
    const T = serverSandbox({ after: 'getMockInventory = function () { var i = ' +
      JSON.stringify([Object.assign({}, item, { price: 10.005 })]) + '; return i; };' });
    const res = call(T, 'prepareSale({requestId:"' + RID + '", customerId:null, ' +
      'paymentMethodId:"CASH", amountTenderedCents:null, lines:[{itemId:"' + item.itemId +
      '", qty:1, warrantyId:"W-ASIS", unitPriceCents:null}]})');
    ok('refuses a list price that is not a whole number of cents',
      res.ok === false && res.code === 'SALE_BAD_MONEY', res.ok ? 'ACCEPTED' : res.code);
  })();
  ok('no write verb was reached by any refusal', writeAttempts.length === 0, writeAttempts.join(', '));
}
{
  // Customer policy is a named constant, and it is testable both ways.
  const S = serverSandbox({ after: 'REQUIRE_CUSTOMER_FOR_SALE = true;' });
  const item = firstItem(S);
  const good = { itemId: item.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null };
  const res = prepare(S, req({ lines: [good] }));
  ok('when a customer is required, a walk-in sale is refused',
    res.ok === false && res.code === 'SALE_CUSTOMER_REQUIRED', res.code);
  const S2 = serverSandbox();
  ok('by default a walk-in sale is allowed (matches the current UI)',
    prepare(S2, req({ lines: [good] })).ok === true);
  ok('the policy is a named constant, not an absence',
    /REQUIRE_CUSTOMER_FOR_SALE/.test(saleSrc));
}

/* ---------------------------------------------------------------------- */
console.log('\n5. TAX STAYS TAX-INCLUSIVE (PACKAGE 12 PRESERVED, SERVER SIDE)');
{
  const S = serverSandbox();
  const item = firstItem(S);
  const cents = Math.round(item.price * 100);
  const sale = prepare(S, req({ lines: [{ itemId: item.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] })).sale;
  ok('the total equals the price shown', sale.totals.totalCents === cents);
  ok('tax is extracted from the total, not added',
    sale.totals.taxCents === Math.round(cents - cents / 1.0975), sale.totals.taxCents);
  ok('pre-tax + tax reconstructs the total exactly',
    sale.totals.preTaxCents + sale.totals.taxCents === sale.totals.totalCents);
  ok('the rate used is the approved 9.75%', sale.totals.taxRate === 0.0975);
  ok('the mode recorded is INCLUSIVE', sale.totals.taxMode === 'INCLUSIVE');

  // The owner's worked example, exactly.
  const split = call(S, 'splitInclusiveTaxCents_(30000, 0.0975)');
  ok('$300.00 -> $26.65 tax', split.taxCents === 2665, split.taxCents);
  ok('$300.00 -> $273.35 pre-tax', split.preTaxCents === 27335, split.preTaxCents);

  // Server and client must not drift: two implementations of one rule.
  const clientCtx = { Math, Number, isFinite };
  vm.createContext(clientCtx);
  const clientSplit = (js.match(/function splitInclusiveTax\(total, rate\) \{[\s\S]*?\n  \}/) || [])[0];
  ok('the client split function was found for the parity check', !!clientSplit);
  vm.runInContext(clientSplit, clientCtx);
  let drift = 0;
  for (let c = 1; c <= 100000; c++) {
    const srv = call(S, `splitInclusiveTaxCents_(${c}, 0.0975)`);
    const cli = vm.runInContext(`splitInclusiveTax(${c / 100}, 0.0975)`, clientCtx);
    if (Math.round(cli.tax * 100) !== srv.taxCents) { drift++; }
  }
  ok('server and client agree on tax for 100,000 totals', drift === 0, drift + ' disagreed');
}
{
  // Tax configuration still fails closed on the server.
  [['no mode', 'CONFIG.SALES_TAX.MODE = "ADD_ON_TOP";'],
   ['no rate', 'CONFIG.SALES_TAX.RATE = undefined;'],
   ['zero rate', 'CONFIG.SALES_TAX.RATE = 0;'],
   ['a nonsense rate', 'CONFIG.SALES_TAX.RATE = 9.75;']].forEach(function (c) {
    const S = serverSandbox({ after: c[1] });
    const item = firstItem(S);
    const res = prepare(S, req({ lines: [{ itemId: item.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] }));
    ok('refuses to price a sale with ' + c[0],
      res.ok === false && res.code === 'SALE_TAX_NOT_CONFIGURED', res.code);
  });
}

/* ---------------------------------------------------------------------- */
console.log('\n6. IDEMPOTENCY FOUNDATION');
{
  const S = serverSandbox();
  const item = firstItem(S);
  const r = req({ lines: [{ itemId: item.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] });
  const a = prepare(S, r).sale, b = prepare(S, r).sale;
  ok('the same requestId survives every call', a.requestId === b.requestId && a.requestId === RID);
  ok('a repeated DRY RUN is harmless — it only reads',
    a.totals.totalCents === b.totals.totalCents);
  // Stated honestly: a dry run mints a fresh id each time. Dedupe needs a
  // store, which this build does not have and must not invent.
  ok('a dry run does NOT yet dedupe — it cannot without a store (NV-17)',
    a.saleId !== b.saleId);
  ok('the limitation is recorded in the source, not hidden', /NV-17/.test(saleSrc));
  ok('a minimum requestId length is enforced',
    prepare(S, req({ lines: r.lines, requestId: 'x'.repeat(15) })).code === 'SALE_MISSING_REQUEST_ID');
  ok('and 16 characters is accepted',
    prepare(S, req({ lines: r.lines, requestId: 'x'.repeat(16) })).ok === true);
}

/* ---------------------------------------------------------------------- */
console.log('\n7. CLIENT: DOUBLE SUBMIT, REQUEST IDENTITY, VISIBLE ERRORS');
function makeEl() {
  const el = { textContent: '', innerHTML: '', disabled: false, attrs: {}, dataset: {} };
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  el.getAttribute = k => (k in el.attrs ? el.attrs[k] : null);
  el.removeAttribute = k => { delete el.attrs[k]; };
  el.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
  el.querySelector = () => null; el.querySelectorAll = () => [];
  el.addEventListener = (e, f) => { (el.handlers = el.handlers || {})[e] = f; };
  el.closest = () => null;
  return el;
}
const BODY = (function () {
  const o = js.indexOf('(function () {'), c = js.lastIndexOf('})();');
  return js.slice(o + '(function () {'.length, c);
})();
function clientSandbox() {
  const S = { console, JSON, Math, Number, String, Array, Object, Date, RegExp,
              isFinite, isNaN, parseInt, parseFloat, Intl, encodeURIComponent, decodeURIComponent, Error };
  S.window = S; S.globalThis = S;
  const els = {};
  S.document = { readyState: 'loading',
    querySelector: s => (els[s] = els[s] || makeEl()),
    querySelectorAll: () => [], addEventListener: () => {},
    getElementById: i => (els['#' + i] = els['#' + i] || makeEl()), images: [] };
  S.__els = els;
  S.setInterval = () => 0; S.setTimeout = () => 0; S.clearInterval = () => {};
  S.EDP_BOOT = { config: { taxMode: 'INCLUSIVE', taxRate: 0.0975, taxLabel: 'Sales Tax (9.75%, included)',
      locale: 'en-US', environment: 'TEST', buildVersion: '0.1.0',
      companyShort: 'E', companyName: 'E', storeAddress: '', storePhone: '', storeFooter: '',
      features: { COMPLETE_SALE_ENABLED: false },
      warrantyOptions: [{ id: 'W-ASIS', label: 'As-Is', price: 0 }, { id: 'W-30', label: '30-Day', price: 0 }],
      paymentMethods: [{ id: 'CASH', label: 'Cash' }] },
    inventory: [{ itemId: 'A-1', brand: 'B', model: 'M', description: 'd', condition: 'WORKING',
      availability: 'AVAILABLE', qty: 1, price: 300, location: '',
      serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'washer', photoPrimary: '', photoGallery: [] }],
    categories: [], customers: [], activity: [],
    serverTime: { iso: new Date().toISOString(), epochMs: Date.now() },
    openTicket: { ticketId: 'TXN-MOCK-4471', customerId: null, paymentMethodId: 'CASH', lines: [] } };
  vm.createContext(S);
  try { vm.runInContext(BODY, S); } catch (e) { S.__err = e; }
  return S;
}
{
  const S = clientSandbox();
  ok('client loaded without error', !S.__err, S.__err && String(S.__err.message));

  const id1 = call(S, 'beginCheckoutAttempt()');
  ok('a checkout attempt mints a request id', typeof id1 === 'string' && id1.length >= 16, id1);
  ok('the same attempt reuses that id — a retry is not a new sale',
    call(S, 'beginCheckoutAttempt()') === id1);
  call(S, 'abandonCheckoutAttempt();');
  ok('abandoning the attempt mints a NEW id', call(S, 'beginCheckoutAttempt()') !== id1);
  ok('changing the cart abandons the attempt',
    (function () {
      const before = call(S, 'beginCheckoutAttempt()');
      call(S, 'addToCart("A-1");');
      return call(S, 'beginCheckoutAttempt()') !== before;
    })());
  ok('request ids are distinct across 500 mints',
    (function () {
      const seen = {};
      for (let i = 0; i < 500; i++) { seen[call(S, 'newRequestId()')] = 1; }
      return Object.keys(seen).length === 500;
    })());
}
{
  const S = clientSandbox();
  const btn = makeEl();
  let runs = 0;
  let release;
  const started = call(S, 'withSubmitLock')(btn, function (done) { runs++; release = done; });
  ok('the first submit runs', started === true && runs === 1);
  ok('the button is disabled while in flight', btn.disabled === true);
  ok('and marked busy for assistive tech', btn.getAttribute('aria-busy') === 'true');

  const second = call(S, 'withSubmitLock')(btn, function () { runs++; });
  ok('a SECOND submit during flight does not run', second === false && runs === 1);
  const third = call(S, 'withSubmitLock')(btn, function () { runs++; });
  ok('nor a third', third === false && runs === 1);

  release();
  ok('releasing re-enables the button', btn.disabled === false);
  ok('and clears the busy flag', btn.getAttribute('aria-busy') === null);
  const fourth = call(S, 'withSubmitLock')(btn, function (done) { runs++; done(); });
  ok('a submit AFTER release runs', fourth === true && runs === 2);

  // A stale release must not unlock an attempt it does not own.
  const S2 = clientSandbox();
  const b2 = makeEl();
  let stale;
  call(S2, 'withSubmitLock')(b2, function (done) { stale = done; });
  stale(); stale();
  let later = 0;
  call(S2, 'withSubmitLock')(b2, function () { later++; });
  stale();
  ok('a repeated release cannot unlock a later attempt',
    call(S2, 'state.checkout.inFlight') === true && later === 1);
}
{
  const S = clientSandbox();
  let threw = false;
  try {
    call(S, 'withSubmitLock')(makeEl(), function () { throw new Error('boom'); });
  } catch (e) { threw = true; }
  ok('a throw inside a submit propagates', threw === true);
  ok('and does NOT strand the lock', call(S, 'state.checkout.inFlight') === false);
}
{
  const S = clientSandbox();
  call(S, 'logServerError("Reload activity failed", "GETBOOTSTRAP_FAILED", "network down");');
  const act = call(S, 'JSON.stringify(state.activity)');
  ok('a server failure reaches the Activity timeline', /SERVER_ERROR/.test(act));
  ok('with the failure code', /GETBOOTSTRAP_FAILED/.test(act));
  ok('and the status FAILED', /FAILED/.test(act));
  ok('the previously SILENT failure handler is gone',
    js.indexOf('/* neutral wording stands */') === -1 ||
    /withFailureHandler\(function \(err\) \{\n\s+logServerError/.test(js));
  ok('the reload handler now reports its failure',
    /logServerError\('Reload activity failed'/.test(js));
}

/* ---------------------------------------------------------------------- */
console.log('\n8. RECEIPT AND SAFETY GUARANTEES UNCHANGED');
{
  const S = clientSandbox();
  call(S, 'state.cart = [{itemId:"A-1", qty:1, unitPrice:300, listPrice:300, warrantyId:"W-ASIS"}];');
  const m = call(S, 'buildReceiptModel()');
  ok('the receipt model still builds', !!m && m.lines.length === 1);
  ok('the receipt total is still $300.00', m.totals.total === 300);
  ok('the receipt tax is still $26.65', m.totals.tax === 26.65);
  ok('the receipt is still marked TEST', m.isTest === true);
  call(S, 'renderCart();');
  ok('Complete Sale is still disabled', S.__els['#btnCompleteSale'].disabled === true);
  ok('and still disabled for assistive tech',
    S.__els['#btnCompleteSale'].getAttribute('aria-disabled') === 'true');
  ok('Complete Sale still has NO click handler',
    !S.__els['#btnCompleteSale'].handlers || !S.__els['#btnCompleteSale'].handlers.click);
}
{
  const cfg = read('Config.gs');
  ['COMPLETE_SALE_ENABLED', 'SALES_WRITER_ENABLED', 'INVENTORY_MUTATION_ENABLED',
   'PRINTER_ENABLED', 'EMAIL_RECEIPT_ENABLED', 'OFFLINE_DB_ENABLED', 'LIVE_DATABASE_ENABLED']
    .forEach(f => ok(f + ' is still false', new RegExp(f + ':\\s*false').test(cfg)));

  const manifest = JSON.parse(read('appsscript.json'));
  ok('the manifest is still pinned to spreadsheets.readonly',
    manifest.oauthScopes.length === 1 &&
    manifest.oauthScopes[0] === 'https://www.googleapis.com/auth/spreadsheets.readonly');

  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');
  ok('Sale.gs contains no spreadsheet write verb',
    !/\.setValue|\.setValues|\.appendRow|Values\.update|Values\.append|setProperty/.test(strip(saleSrc)));
  ok('Sale.gs contains no SpreadsheetApp / DriveApp / MailApp / UrlFetchApp',
    !/SpreadsheetApp|DriveApp|MailApp|GmailApp|UrlFetchApp/.test(strip(saleSrc)));
  ok('Sale.gs invents no SALES column names',
    !/sale_id|tax_amount|item_id|sold_at|customer_id/.test(strip(saleSrc)));
  ok('no production sale-id prefix is invented', /PRODUCTION_PREFIX:\s*null/.test(saleSrc));

  const ds = read('DataSource.gs');
  ok('DataSource.gs still has no write verb',
    !/\.setValue|\.setValues|\.appendRow|Values\.update|Values\.append|setProperty/.test(strip(ds)));
  ok('the data source is still the real APPLIANCES sheet',
    /ACTIVE_DATA_SOURCE\s*=\s*DATA_SOURCES\.APPLIANCES_SHEET/.test(ds));

  const ignore = read('.claspignore');
  ok('the push allowlist is now exactly 11 files (Sale.gs added)',
    (ignore.match(/^!/gm) || []).length === 11, 'entries = ' + (ignore.match(/^!/gm) || []).length);
  ok('Sale.gs is in the allowlist', /^!Sale\.gs$/m.test(ignore));
  ok('no test file is in the allowlist', !/sale-tests|pkg1[0-9]/.test(ignore));

  ok('the Package 10 fail-closed resolver is untouched',
    !/findItem\(l\.itemId\) \|\| \{\}/.test(js));
  ok('no write verb was reached anywhere in this suite', writeAttempts.length === 0,
    writeAttempts.join(', '));
}

console.log('\n-------------------------------------------------------');
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
