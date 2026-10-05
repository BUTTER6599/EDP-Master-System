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
  // A TIMEZONE-AWARE formatDate, matching what Apps Script actually does.
  //
  // This stub has now been wrong twice, and each time the stub failed correct
  // code. First it knew only two patterns and silently returned the wrong
  // shape for the rest. Then it ignored the timezone argument entirely and
  // formatted in UTC - which was tolerable only while nothing asserted a real
  // wall-clock date. The business-date rules do assert one, and a Register
  // that numbers a 20:30 Louisiana sale into the next day would be wrong on
  // every receipt and report that followed. So it resolves the zone properly.
  S.Utilities = {
    formatDate(d, tz, fmt) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
      }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
      const dows = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
      const map = {
        'yyyy': parts.year,
        'MM': parts.month,
        'dd': parts.day,
        'HH': parts.hour === '24' ? '00' : parts.hour,
        'mm': parts.minute,
        'ss': parts.second,
        'u': String(dows[parts.weekday])
      };
      if (fmt === 'u') { return map.u; }
      return String(fmt).replace(/yyyy|MM|dd|HH|mm|ss/g, k => map[k]);
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
  // Sheets: inventory comes from the MOCK source, exactly as the adapter suites
  // have pinned it since Package 8. The allocator, though, genuinely reads
  // SALES column A, so a controlled READ stub is supplied when a test provides
  // saleIds. Every WRITE method stays forbidden and records an attempt, so an
  // accidental write is loud rather than silent.
  S.__sheetReads = [];
  S.Sheets = {
    Spreadsheets: {
      Values: {
        get(id, range) {
          S.__sheetReads.push(range);
          if (opts.saleIds === undefined) {
            // A read this test did not arrange for. That is a fault, but it is
            // NOT a write - keep the write ledger meaning only writes.
            throw new Error('unexpected Sheets read: ' + range);
          }
          return { values: opts.saleIds.map(v => (v === null ? [] : [v])) };
        },
        update() { writeAttempts.push('Sheets.Values.update'); throw new Error('FORBIDDEN WRITE'); },
        append() { writeAttempts.push('Sheets.Values.append'); throw new Error('FORBIDDEN WRITE'); },
        batchUpdate() { writeAttempts.push('Sheets.Values.batchUpdate'); throw new Error('FORBIDDEN WRITE'); }
      },
      batchUpdate() { writeAttempts.push('Sheets.batchUpdate'); throw new Error('FORBIDDEN WRITE'); }
    }
  };

  // LockService: records acquire/release so the transaction boundary itself is
  // testable. opts.lock controls the outcome.
  S.__lock = { acquired: 0, released: 0, timeouts: [] };
  if (opts.lock !== 'absent') {
    S.LockService = {
      getScriptLock() {
        return {
          tryLock(ms) {
            S.__lock.timeouts.push(ms);
            if (opts.lock === 'busy') { return false; }
            if (opts.lock === 'throws') { throw new Error('lock service error'); }
            S.__lock.acquired += 1;
            return true;
          },
          releaseLock() { S.__lock.released += 1; }
        };
      }
    };
  }

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
  // Package 15C made the gates independent: COMPLETE_SALE + SALES_WRITER do not
  // open inventory. This now refuses one gate EARLIER than it used to, which is
  // the independence working, so the assertion is re-aimed rather than relaxed.
  ok('and refuses at the INVENTORY gate, proving the gates are independent',
    res.code === 'SALE_INVENTORY_WRITES_DISABLED', res.code);
  ok('a sale that cannot mark its appliance SOLD is not completed',
    /not completed/.test(res.message));
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
  // Package 13 asserted there was no approved id format; Package 15 asserted
  // no allocator existed. Both are now built, so this is re-aimed: with writes
  // on AND a readable SALES column, a real EDP id is produced.
  ok('with writes on but no SALES read arranged, it fails rather than guessing',
    res.ok === false, res.code);
  const W = serverSandbox({ features: { SALES_WRITER_ENABLED: true },
    saleIds: ['SHOPIFY-3013', 'S-1780964571246-775'] });
  const wi = firstItem(W);
  const wr = prepare(W, req({ lines: [{ itemId: wi.itemId, qty: 1,
    warrantyId: 'W-ASIS', unitPriceCents: null }] }));
  ok('with writes on and SALES readable, a real EDP id is allocated',
    wr.ok === true && /^EDP-\d{8}-001$/.test(wr.sale.saleId),
    wr.ok ? wr.sale.saleId : wr.code + ' ' + wr.message);
  ok('and the sale is no longer flagged as a TEST sale', wr.ok && wr.sale.isTest === false);
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
  // Package 15C: the SOURCE manifest is now write-CAPABLE, which is NOT the
  // same as write-AUTHORISED or sales-enabled. The guard is re-aimed at what
  // must still hold - exactly ONE Sheets scope and nothing else - because the
  // scope no longer carries the safety on its own; the writer gates do.
  ok('the manifest carries exactly ONE scope, the minimum Sheets scope',
    manifest.oauthScopes.length === 1 &&
    manifest.oauthScopes[0] === 'https://www.googleapis.com/auth/spreadsheets',
    JSON.stringify(manifest.oauthScopes));
  ok('no Drive, Gmail, calendar, contacts or external-request scope was added',
    !manifest.oauthScopes.some(s => /drive|gmail|mail|calendar|contacts|script\.external_request|userinfo/.test(s)));

  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');
  ok('Sale.gs contains no spreadsheet write verb',
    !/\.setValue|\.setValues|\.appendRow|Values\.update|Values\.append|setProperty/.test(strip(saleSrc)));
  ok('Sale.gs contains no SpreadsheetApp / DriveApp / MailApp / UrlFetchApp',
    !/SpreadsheetApp|DriveApp|MailApp|GmailApp|UrlFetchApp/.test(strip(saleSrc)));
  // Package 13 asserted Sale.gs named NO SALES columns, because the schema was
  // unknown then and naming one would have been a guess. Package 14A verified
  // the schema, so recording the real names is now correct. Both guards are
  // re-aimed at what must still hold: the names must MATCH the verified
  // schema, and nothing may be invented beyond it.
  ok('Sale.gs names exactly the 32 verified SALES columns, no more', (function () {
    const m = strip(saleSrc).match(/var SALES_COLUMNS = \[([\s\S]*?)\];/);
    if (!m) { return false; }
    const names = m[1].match(/'[^']+'/g).map(s => s.slice(1, -1));
    const verified = ['sale_id','timestamp','sale_date','week_id','amount','category',
      'payment_type','notes','entered_by','invoice_number','item_id','inventory_sku_at_sale',
      'legacy_item_id','item_description_at_sale','brand_at_sale','model_at_sale',
      'serial_at_sale','warranty_at_sale','tax_rate','tax_amount','sales_source','entry_type',
      'source_order_id','source_order_number','customer_id','customer_name','customer_phone',
      'import_batch_id','detail_status','inventory_update_status','accounting_status',
      '(unused_col_32)'];
    return names.length === 32 && names.every((n, i) => n === verified[i]);
  })());
  ok('the only NEW column is the approved request_id',
    /ADD_COLUMN: 'request_id'/.test(saleSrc) &&
    !/sold_at|sold_date|sold_price|sale_total|line_number/.test(strip(saleSrc)));
  ok('the approved sale-id prefix is recorded, and it is EDP',
    /PRODUCTION_PREFIX: 'EDP'/.test(saleSrc));
  ok('the abandoned and Shopify formats are preserved as READ-ONLY history',
    /LEGACY_EPOCH_PATTERN/.test(saleSrc) && /SHOPIFY_PATTERN/.test(saleSrc));

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

/* ---------------------------------------------------------------------- */
console.log('\n9. PACKAGE 14B — APPROVED SALE-ID FORMAT');
{
  const S = serverSandbox();
  ok('the approved format is recorded', call(S, 'SALE_ID.PRODUCTION_FORMAT') === 'EDP-YYYYMMDD-NNN');
  ok('the approved prefix is EDP', call(S, 'SALE_ID.PRODUCTION_PREFIX') === 'EDP');
  const id = call(S, 'formatSaleId_(Date.UTC(2026,9,4,12,0,0), 1)');
  ok('formats EDP-20261004-001', id === 'EDP-20261004-001', id);
  ok('pads the sequence to three digits',
    call(S, 'formatSaleId_(Date.UTC(2026,9,4,12,0,0), 7)') === 'EDP-20261004-007');
  ok('accepts 999', call(S, 'formatSaleId_(Date.UTC(2026,9,4,12,0,0), 999)') === 'EDP-20261004-999');
  [0, -1, 1000, 1.5, '1', NaN].forEach(function (bad) {
    const r = call(S, 'try { formatSaleId_(Date.UTC(2026,9,4), ' +
      (typeof bad === 'string' ? JSON.stringify(bad) : String(bad)) + '); "ACCEPTED" } ' +
      'catch (e) { e.edpCode }');
    ok('refuses sequence ' + JSON.stringify(bad), r === 'SALE_SEQUENCE_UNAVAILABLE', String(r));
  });
  ok('recognises its own ids', call(S, 'isRegisterSaleId_("EDP-20261004-001")') === true);
  ok('does NOT claim a Shopify id', call(S, 'isRegisterSaleId_("SHOPIFY-3013")') === false);
  ok('does NOT claim a legacy epoch id',
    call(S, 'isRegisterSaleId_("S-1780964571246-775")') === false);
  ok('does NOT claim a hold id', call(S, 'isRegisterSaleId_("HR-20261002-0001")') === false);
  ok('the legacy pattern still matches real legacy ids',
    call(S, 'SALE_ID.LEGACY_EPOCH_PATTERN.test("S-1784399181909-86")') === true);
  ok('the Shopify pattern matches the RECON variant',
    call(S, 'SALE_ID.SHOPIFY_PATTERN.test("SHOPIFY-3123-RECON")') === true);
  ok('the allocator exists and is reachable',
    typeof call(S, 'allocateDailySequence_') === 'function');
}

/* ---------------------------------------------------------------------- */
console.log('\n10. PACKAGE 14B — ONE SALES ROW PER ITEM, SHARED sale_id');
{
  const S = serverSandbox();
  const inv = call(S, 'readInventory()');
  const a = inv[0], b = inv[1];
  const r = req({ lines: [
    { itemId: a.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null },
    { itemId: b.itemId, qty: 2, warrantyId: 'W-90', unitPriceCents: null }
  ] });
  const sale = prepare(S, r).sale;
  const rows = call(S, 'buildSalesRows_(' + JSON.stringify(sale) + ')');

  ok('two items produce TWO rows', rows.length === 2, 'rows = ' + rows.length);
  ok('both rows share one sale_id', rows[0].sale_id === rows[1].sale_id);
  ok('that sale_id is the prepared sale id', rows[0].sale_id === sale.saleId);
  ok('each row keeps its own item_id',
    rows[0].item_id === a.itemId && rows[1].item_id === b.itemId);
  ok('item-level inventory linkage is never collapsed',
    rows.every(x => x.item_id !== ''));
  ok('both rows carry the same request_id', rows[0].request_id === rows[1].request_id &&
    rows[0].request_id === sale.requestId);

  const sumAmt = Math.round(rows.reduce((s, x) => s + x.amount * 100, 0));
  const sumTax = Math.round(rows.reduce((s, x) => s + x.tax_amount * 100, 0));
  ok('row amounts sum EXACTLY to the customer total',
    sumAmt === sale.totals.totalCents, sumAmt + ' vs ' + sale.totals.totalCents);
  ok('row taxes sum EXACTLY to the sale tax',
    sumTax === sale.totals.taxCents, sumTax + ' vs ' + sale.totals.taxCents);
  ok('tax_rate is the approved 9.75% on every row',
    rows.every(x => x.tax_rate === 0.0975));

  ok('sales_source marks these as Register sales', rows.every(x => x.sales_source === 'EDP_REGISTER'));
  ok('entry_type marks these as Register sales', rows.every(x => x.entry_type === 'REGISTER_SALE'));
  ok('human reconciliation columns are left EMPTY (NV-24)',
    rows.every(x => x.notes === '' && x.detail_status === '' &&
      x.inventory_update_status === '' && x.accounting_status === ''));
  ok('Shopify-only columns are left EMPTY',
    rows.every(x => x.source_order_id === '' && x.source_order_number === '' &&
      x.import_batch_id === '' && x.legacy_item_id === ''));
  ok('the unheaded column 32 is never written',
    rows.every(x => x['(unused_col_32)'] === ''));
  ok('sale_date is yyyy-MM-dd', /^\d{4}-\d{2}-\d{2}$/.test(rows[0].sale_date), rows[0].sale_date);
  ok('timestamp is yyyy-MM-dd HH:mm:ss',
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rows[0].timestamp), rows[0].timestamp);
  ok('week_id is a Monday', (function () {
    const d = new Date(rows[0].week_id + 'T12:00:00Z');
    return d.getUTCDay() === 1;
  })(), rows[0].week_id);
  ok('every mapped key is a real SALES column or request_id', (function () {
    const known = call(S, 'SALES_COLUMNS').concat(['request_id']);
    return Object.keys(rows[0]).every(k => known.indexOf(k) !== -1);
  })());
  ok('the recorded column order matches the verified schema', (function () {
    const cols = call(S, 'SALES_COLUMNS');
    return cols.length === 32 && cols[0] === 'sale_id' && cols[4] === 'amount' &&
           cols[18] === 'tax_rate' && cols[30] === 'accounting_status';
  })());
}
{
  // Cent-exact reconciliation must hold across many awkward totals.
  const S = serverSandbox();
  const inv = call(S, 'readInventory()');
  let bad = 0;
  for (let c = 1; c <= 3000; c++) {
    const T = serverSandbox({ after:
      'getMockInventory = function () { return ' + JSON.stringify([
        Object.assign({}, inv[0]), Object.assign({}, inv[1])
      ]) + '; };' });
    // vary one price by a cent each iteration via a declared override
    const rr = req({ lines: [
      { itemId: inv[0].itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: c },
      { itemId: inv[1].itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: c + 7 }
    ] });
    const s = prepare(T, rr);
    if (!s.ok) { bad++; continue; }
    const rws = call(T, 'buildSalesRows_(' + JSON.stringify(s.sale) + ')');
    const sa = Math.round(rws.reduce((x, y) => x + y.amount * 100, 0));
    const st = Math.round(rws.reduce((x, y) => x + y.tax_amount * 100, 0));
    if (sa !== s.sale.totals.totalCents || st !== s.sale.totals.taxCents) { bad++; }
  }
  ok('3,000 two-item transactions all reconcile to the cent', bad === 0, bad + ' failed');
}

/* ---------------------------------------------------------------------- */
console.log('\n11. PACKAGE 15 — MIGRATION APPLIED AND VERIFIED (STILL NO WRITES)');
{
  // These three assertions previously pinned APPLIED === false and the refusal
  // that went with it. That was correct while column 33 did not exist. It was
  // appended and independently verified on 2026-10-05, so they are re-aimed at
  // the new truth - and joined by assertions that the flip grants nothing.
  const S = serverSandbox();
  ok('the migration is recorded as APPROVED', call(S, 'SALES_MIGRATION.APPROVED') === true);
  ok('and now recorded as APPLIED', call(S, 'SALES_MIGRATION.APPLIED') === true);
  ok('with the verified timestamp of the write',
    call(S, 'SALES_MIGRATION.APPLIED_AT') === '2026-10-05T03:10:11Z');
  ok('naming the manifest it was verified against',
    /SALES-PRE-WRITE-MANIFEST-20261005T030523Z\.json/.test(
      String(call(S, 'SALES_MIGRATION.VERIFIED_AGAINST'))));
  ok('it added exactly one column', call(S, 'SALES_MIGRATION.ADD_COLUMN') === 'request_id');
  ok('appended at index 33, never reordering existing columns',
    call(S, 'SALES_MIGRATION.AT_INDEX') === 33);

  const inv = call(S, 'readInventory()');
  const sale = prepare(S, req({ lines: [{ itemId: inv[0].itemId, qty: 1,
    warrantyId: 'W-ASIS', unitPriceCents: null }] })).sale;
  const arrays = call(S, 'salesRowsToArrays_(buildSalesRows_(' + JSON.stringify(sale) + '))');
  ok('a positional row now builds', Array.isArray(arrays) && arrays.length === 1);
  ok('and is exactly 33 wide, matching the migrated sheet',
    arrays[0].length === 33, 'width = ' + arrays[0].length);
  ok('with request_id LAST, in column 33',
    arrays[0][32] === sale.requestId, JSON.stringify(arrays[0][32]));
  ok('column 1 is still the sale id', arrays[0][0] === sale.saleId);
  ok('column 32 - the unheaded one - is written as empty, never populated',
    arrays[0][31] === '', JSON.stringify(arrays[0][31]));
  ok('the human reconciliation columns 29-31 stay empty',
    arrays[0][28] === '' && arrays[0][29] === '' && arrays[0][30] === '');

  // The whole point: building a row is not writing one.
  ok('APPLIED does NOT enable Complete Sale',
    call(S, 'CONFIG.FEATURES.COMPLETE_SALE_ENABLED') === false);
  ok('APPLIED does NOT enable the SALES writer',
    call(S, 'CONFIG.FEATURES.SALES_WRITER_ENABLED') === false);
  ok('APPLIED does NOT enable inventory mutation',
    call(S, 'CONFIG.FEATURES.INVENTORY_MUTATION_ENABLED') === false);
  const done = call(S, 'completeSale(' + JSON.stringify(req({ lines: [{ itemId: inv[0].itemId,
    qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] })) + ')');
  ok('completeSale STILL refuses after the migration',
    done.ok === false && done.code === 'SALE_WRITES_DISABLED', done.code);
  ok('and still says nothing was written', /Nothing was written/.test(done.message));
  ok('no write verb was reached by building a positional row',
    writeAttempts.length === 0, writeAttempts.join(', '));
}

/* ---------------------------------------------------------------------- */
console.log('\n12. PACKAGE 14B — STORAGE RULES RECORDED, NOT CHARGED');
{
  const S = serverSandbox();
  const R = call(S, 'STORAGE_RULES');
  ok('the daily storage fee is $9.00', R.DAILY_FEE === 9.00);
  ok('Payment & Pickup Plan keeps its customer-facing name',
    R.PAYMENT_PICKUP_PLAN.NAME === 'Payment & Pickup Plan');
  ok('normal pickup period is 14 calendar days',
    R.PAYMENT_PICKUP_PLAN.NORMAL_PERIOD_CALENDAR_DAYS === 14);
  ok('then 6 EDP open days of grace', R.PAYMENT_PICKUP_PLAN.GRACE_OPEN_DAYS === 6);
  ok('Sunday never counts for the plan', R.PAYMENT_PICKUP_PLAN.SUNDAY_COUNTS === false);
  ok('repair pickup allowance is 3 open days', R.REPAIR.PICKUP_OPEN_DAYS === 3);
  ok('Sunday never counts for repairs', R.REPAIR.SUNDAY_COUNTS === false);
  ok('repair and plan rules are kept SEPARATE',
    R.REPAIR.PICKUP_OPEN_DAYS !== R.PAYMENT_PICKUP_PLAN.GRACE_OPEN_DAYS);
  ok('holidays are explicitly unresolved, not silently assumed',
    R.HOLIDAYS === null);
  ok('no storage charge is ever computed in this build',
    !/chargeStorage|applyStorageFee|storageDue/.test(saleSrc));
}

/* ---------------------------------------------------------------------- */
console.log('\n12. PACKAGE 15B — LOCKED SALE-ID SEQUENCE ALLOCATOR (READ ONLY)');

// The pure core takes a list and returns an answer, with no clock and no
// network, so every rule below is checked deterministically.
const DAY = '20261005';
function nextSeq(S, ids, dateKey) {
  return call(S, 'nextSequenceFrom_(' + JSON.stringify(ids) + ', ' + JSON.stringify(dateKey || DAY) + ')');
}
function nextSeqCode(S, ids, dateKey) {
  return call(S, 'try { nextSequenceFrom_(' + JSON.stringify(ids) + ', ' +
    JSON.stringify(dateKey || DAY) + '); "ALLOCATED" } catch (e) { e.edpCode }');
}

console.log('\n  -- sequence rules --');
{
  const S = serverSandbox();
  ok('an empty SALES column gives 001', nextSeq(S, []) === 1);
  ok('no EDP ids for the date gives 001',
    nextSeq(S, ['SHOPIFY-3013', 'S-1780964571246-775']) === 1);
  ok('001 exists -> 002', nextSeq(S, ['EDP-20261005-001']) === 2);
  ok('001,002 -> 003', nextSeq(S, ['EDP-20261005-001', 'EDP-20261005-002']) === 3);
  ok('many ids -> highest + 1',
    nextSeq(S, ['EDP-20261005-004','EDP-20261005-001','EDP-20261005-007','EDP-20261005-003']) === 8);
  ok('HIGHEST wins when gaps exist: 001,003 -> 004',
    nextSeq(S, ['EDP-20261005-001', 'EDP-20261005-003']) === 4, 'got ' + nextSeq(S, ['EDP-20261005-001','EDP-20261005-003']));
  ok('a gap is never refilled', nextSeq(S, ['EDP-20261005-002']) === 3);
  ok('order in the column does not matter',
    nextSeq(S, ['EDP-20261005-009','EDP-20261005-002']) ===
    nextSeq(S, ['EDP-20261005-002','EDP-20261005-009']));
  ok('duplicate ids do not inflate the sequence',
    nextSeq(S, ['EDP-20261005-005','EDP-20261005-005']) === 6);
  ok('blank cells are ignored', nextSeq(S, ['', '   ', 'EDP-20261005-001']) === 2);
  ok('the pure core is deterministic across 50 identical calls', (function () {
    const ids = ['EDP-20261005-001','EDP-20261005-003'];
    for (let k = 0; k < 50; k++) { if (nextSeq(S, ids) !== 4) { return false; } }
    return true;
  })());
}

console.log('\n  -- historical formats are ignored --');
{
  const S = serverSandbox();
  ok('S-<epoch>-<rand> ignored', nextSeq(S, ['S-1780964571246-775','S-1784399181909-86']) === 1);
  ok('SHOPIFY-<order#> ignored', nextSeq(S, ['SHOPIFY-3013','SHOPIFY-3102']) === 1);
  ok('SHOPIFY-<order#>-RECON ignored', nextSeq(S, ['SHOPIFY-3123-RECON']) === 1);
  ok('MANUAL-… ignored', nextSeq(S, ['MANUAL-20260823-DELAUNE-001']) === 1);
  ok('an unrelated unknown format is ignored, not fatal', nextSeq(S, ['FOO-9','ZZ1']) === 1);
  ok('a real mixed column still finds the Register ids',
    nextSeq(S, ['SHOPIFY-3013','EDP-20261005-002','S-1780964571246-775',
                'MANUAL-20260823-DELAUNE-001','EDP-20261005-005']) === 6);
}

console.log('\n  -- a malformed EDP id FAILS CLOSED, it is not skipped --');
{
  const S = serverSandbox();
  ['EDP-20261005-1000','EDP-20261005-01','EDP-2026105-001','EDP-20261005-abc',
   'EDP-20261005','EDP-','EDP-20261005-001-X','edp-20261005-001'].forEach(function (bad) {
    ok('refuses to allocate past ' + JSON.stringify(bad),
      nextSeqCode(S, [bad]) === 'SALE_MALFORMED_SALE_ID', String(nextSeqCode(S, [bad])));
  });
  ok('the refusal names the offending value',
    /EDP-20261005-1000/.test(call(S,
      'try { nextSequenceFrom_(["EDP-20261005-1000"], "' + DAY + '"); "" } catch (e) { e.message }')));
  ok('a malformed id on ANOTHER date still fails closed',
    nextSeqCode(S, ['EDP-20260101-9999']) === 'SALE_MALFORMED_SALE_ID');
  ok('one malformed id poisons the whole allocation, by design',
    nextSeqCode(S, ['EDP-20261005-001','EDP-20261005-7']) === 'SALE_MALFORMED_SALE_ID');
}

console.log('\n  -- other business dates do not interfere --');
{
  const S = serverSandbox();
  ok('yesterday ignored', nextSeq(S, ['EDP-20261004-099']) === 1);
  ok('tomorrow ignored', nextSeq(S, ['EDP-20261006-099']) === 1);
  ok('a far-future date ignored', nextSeq(S, ['EDP-20991231-500']) === 1);
  ok('only the requested date counts',
    nextSeq(S, ['EDP-20261004-050','EDP-20261005-002','EDP-20261006-090']) === 3);
  ok('asking for yesterday gets yesterday\'s answer',
    nextSeq(S, ['EDP-20261004-050','EDP-20261005-002'], '20261004') === 51);
}

console.log('\n  -- the 999 ceiling --');
{
  const S = serverSandbox();
  ok('998 -> 999 is allowed', nextSeq(S, ['EDP-20261005-998']) === 999);
  ok('999 used -> FAILS CLOSED', nextSeqCode(S, ['EDP-20261005-999']) === 'SALE_SEQUENCE_UNAVAILABLE');
  ok('and refuses to roll over into an unapproved format',
    /nobody approved/.test(call(S,
      'try { nextSequenceFrom_(["EDP-20261005-999"], "' + DAY + '"); "" } catch (e) { e.message }')));
  ok('999 on another date does not block today', nextSeq(S, ['EDP-20261004-999']) === 1);
  ok('the ceiling is a named constant', call(S, 'MAX_DAILY_SEQUENCE') === 999);
  ok('formatSaleId_ accepts the 999 boundary',
    call(S, 'formatSaleId_(Date.UTC(2026,9,5,12,0,0), 999)') === 'EDP-20261005-999');
}

console.log('\n  -- America/Chicago business date --');
{
  const S = serverSandbox();
  ok('the store timezone is what is used', call(S, 'CONFIG.TIMEZONE') === 'America/Chicago');
  // 2026-10-06 01:30 UTC is still 2026-10-05 20:30 in Chicago (CDT, UTC-5).
  const lateEvening = Date.UTC(2026, 9, 6, 1, 30, 0);
  ok('a 20:30 Chicago sale stays on the Chicago day, not the UTC next day',
    call(S, 'businessDateKey_(' + lateEvening + ')') === '20261005',
    call(S, 'businessDateKey_(' + lateEvening + ')'));
  // 2026-10-05 04:30 UTC is 2026-10-04 23:30 in Chicago.
  const justBeforeMidnight = Date.UTC(2026, 9, 5, 4, 30, 0);
  ok('a 23:30 Chicago sale stays on the previous Chicago day',
    call(S, 'businessDateKey_(' + justBeforeMidnight + ')') === '20261004',
    call(S, 'businessDateKey_(' + justBeforeMidnight + ')'));
  // 2026-10-05 13:00 UTC is 08:00 Chicago - same day either way.
  ok('a midday sale is unambiguous',
    call(S, 'businessDateKey_(' + Date.UTC(2026, 9, 5, 13, 0, 0) + ')') === '20261005');
  ok('the date key is yyyyMMdd',
    /^\d{8}$/.test(call(S, 'businessDateKey_(' + Date.now() + ')')));
}

console.log('\n  -- LockService architecture --');
{
  const S = serverSandbox({ saleIds: ['EDP-20261005-001'] });
  const seq = call(S, 'allocateDailySequence_({epochMs: ' + Date.UTC(2026,9,5,18,0,0) + '})');
  ok('the allocator returns the next sequence', seq === 2, 'got ' + seq);
  ok('it acquired the lock', call(S, '__lock.acquired') === 1);
  ok('and released it', call(S, '__lock.released') === 1);
  ok('with the declared 20s timeout', call(S, '__lock.timeouts')[0] === 20000);
  ok('it read SALES column A only, never the whole tab',
    call(S, '__sheetReads')[0] === 'SALES!A2:A', String(call(S, '__sheetReads')[0]));
  ok('exactly one read per allocation', call(S, '__sheetReads').length === 1);
  ok('no write verb was reached', writeAttempts.length === 0, writeAttempts.join(', '));
}
{
  const S = serverSandbox({ saleIds: [], lock: 'busy' });
  const r = call(S, 'try { allocateDailySequence_({epochMs: ' + Date.now() + '}); "ALLOCATED" } catch (e) { e.edpCode }');
  ok('a BUSY lock fails closed — the sale does not proceed', r === 'SALE_LOCK_UNAVAILABLE', String(r));
  ok('and says another sale is in progress',
    /Another sale is in progress/.test(call(S,
      'try { allocateDailySequence_({epochMs: ' + Date.now() + '}); "" } catch (e) { e.message }')));
  ok('it never read SALES when it could not get the lock',
    call(S, '__sheetReads').length === 0);
}
{
  const S = serverSandbox({ saleIds: [], lock: 'throws' });
  ok('a lock service that THROWS also fails closed',
    call(S, 'try { allocateDailySequence_({epochMs: ' + Date.now() + '}); "ALLOCATED" } catch (e) { e.edpCode }')
      === 'SALE_LOCK_UNAVAILABLE');
}
{
  const S = serverSandbox({ saleIds: [], lock: 'absent' });
  ok('no LockService at all fails closed — never allocate unprotected',
    call(S, 'try { allocateDailySequence_({epochMs: ' + Date.now() + '}); "ALLOCATED" } catch (e) { e.edpCode }')
      === 'SALE_LOCK_UNAVAILABLE');
}
{
  // The lock must be released even when the work inside it throws, or one bad
  // sale would wedge every till behind it.
  const S = serverSandbox({ saleIds: ['EDP-20261005-999'] });
  call(S, 'try { allocateDailySequence_({epochMs: ' + Date.UTC(2026,9,5,18,0,0) + '}); } catch (e) {}');
  ok('the lock is released even when allocation throws inside it',
    call(S, '__lock.acquired') === 1 && call(S, '__lock.released') === 1);
}

console.log('\n  -- the honest limitation of a READ-ONLY allocator --');
{
  const S = serverSandbox({ saleIds: ['EDP-20261005-004'] });
  const at = Date.UTC(2026, 9, 5, 18, 0, 0);
  const a = call(S, 'allocateDailySequence_({epochMs: ' + at + '})');
  const b = call(S, 'allocateDailySequence_({epochMs: ' + at + '})');
  ok('two consecutive allocations return the SAME number — nothing is reserved',
    a === 5 && b === 5, a + ' then ' + b);
  ok('the lock still serialised both readers',
    call(S, '__lock.acquired') === 2 && call(S, '__lock.released') === 2);
  ok('the limitation is documented in the source, not hidden',
    /ADVISORY ONLY/.test(saleSrc) && /nothing is claimed/.test(saleSrc));
  ok('uniqueness is stated to require the append inside the same lock',
    /INSIDE this same withSaleLock_/.test(saleSrc));
}

console.log('\n  -- end to end, still refusing to write --');
{
  // prepareSale uses the real clock, so the fixture must use TODAY's Chicago
  // business date - a hard-coded one silently tests a day with no ids on it.
  const today = serverSandbox().Utilities
    ? call(serverSandbox(), 'businessDateKey_(' + Date.now() + ')')
    : null;
  const S = serverSandbox({ features: { SALES_WRITER_ENABLED: true },
    saleIds: ['EDP-' + today + '-007', 'SHOPIFY-3013', 'EDP-20261001-900'] });
  const it = firstItem(S);
  const r = prepare(S, req({ lines: [{ itemId: it.itemId, qty: 1,
    warrantyId: 'W-ASIS', unitPriceCents: null }] }));
  ok('a prepared sale now carries a real EDP sale id', r.ok === true, r.ok ? '' : r.code);
  ok('and it is the next sequence after the highest found TODAY',
    r.sale.saleId === 'EDP-' + today + '-008', r.sale.saleId);
  ok('an id from another date did not inflate it',
    r.sale.saleId.indexOf('-900') === -1 && r.sale.saleId.indexOf('901') === -1);
  const rows = call(S, 'salesRowsToArrays_(buildSalesRows_(' + JSON.stringify(r.sale) + '))');
  ok('the generated SALES row is 33 columns wide', rows[0].length === 33, 'width ' + rows[0].length);
  ok('column 32 is intentionally empty in the generated row',
    rows[0][31] === '', JSON.stringify(rows[0][31]));
  ok('column 33 carries the request_id', rows[0][32] === r.sale.requestId);
  ok('column 1 carries the EDP sale id', rows[0][0] === r.sale.saleId);
  ok('NOTHING was written — no write verb reached', writeAttempts.length === 0, writeAttempts.join(', '));
  const done = call(S, 'completeSale(' + JSON.stringify(req({ lines: [{ itemId: it.itemId,
    qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] })) + ')');
  ok('completeSale STILL refuses, even with a working allocator',
    done.ok === false, done.code);
  ok('because COMPLETE_SALE_ENABLED is still false',
    done.code === 'SALE_WRITES_DISABLED', done.code);
}
{
  const S = serverSandbox();
  ok('SALES_WRITER_ENABLED is still false by default',
    call(S, 'CONFIG.FEATURES.SALES_WRITER_ENABLED') === false);
  ok('INVENTORY_MUTATION_ENABLED is still false',
    call(S, 'CONFIG.FEATURES.INVENTORY_MUTATION_ENABLED') === false);
  ok('the request_id migration is still recorded as applied',
    call(S, 'SALES_MIGRATION.APPLIED') === true);
  const strip = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');
  const code = strip(saleSrc);
  ok('the allocator added NO write API',
    !/Values\.update|Values\.append|Values\.batchUpdate|\.setValue|\.appendRow|setProperty/.test(code));
  ok('the only Sheets call in Sale.gs is a Values.get',
    (code.match(/Sheets\.Spreadsheets\.[A-Za-z.]+/g) || []).join(',') === 'Sheets.Spreadsheets.Values.get');
  ok('no APPLIANCES mutation was introduced',
    !/APPLIANCES|markInventorySold/.test(code));
  ok('no messaging or network side effect was introduced',
    !/MailApp|GmailApp|UrlFetchApp|fetch\(/.test(code));
}

/* ---------------------------------------------------------------------- */
console.log('\n13. PACKAGE 15C — WRITE-SCOPE GATE / PRE-WRITER BOUNDARY');

// A RECORDING adapter. It never writes anything; it remembers what it was
// asked to do, so the boundary's sequencing can be proven with zero bytes
// reaching a spreadsheet.
function mockAdapter(opts) {
  opts = opts || {};
  const rec = { appended: [], sold: [], reads: 0 };
  rec.adapter = {
    readCommitted() { rec.reads += 1; return opts.committed || []; },
    appendSalesRows(rows) {
      rec.appended.push(rows);
      return opts.appendFails ? { ok: false } : { ok: true };
    },
    markSold(itemId) {
      rec.sold.push(itemId);
      return (opts.soldFailsFor || []).indexOf(itemId) !== -1 ? { ok: false } : { ok: true };
    }
  };
  return rec;
}
const BOTH = { COMPLETE_SALE_ENABLED: true, SALES_WRITER_ENABLED: true, INVENTORY_MUTATION_ENABLED: true };
function runTx(S, request, rec) {
  return call(S, 'runSaleTransaction_')(request, rec ? rec.adapter : null);
}
function todayKey(S) { return call(S, 'businessDateKey_(' + Date.now() + ')'); }

console.log('\n  -- manifest scope --');
{
  const mf = JSON.parse(read('appsscript.json'));
  ok('exactly ONE OAuth scope', mf.oauthScopes.length === 1, JSON.stringify(mf.oauthScopes));
  ok('it is the minimum Sheets write scope',
    mf.oauthScopes[0] === 'https://www.googleapis.com/auth/spreadsheets');
  ok('the readonly scope is gone (superseded, not duplicated)',
    mf.oauthScopes.indexOf('https://www.googleapis.com/auth/spreadsheets.readonly') === -1);
  ok('no Drive scope', !mf.oauthScopes.some(s => /drive/.test(s)));
  ok('no Gmail or mail scope', !mf.oauthScopes.some(s => /gmail|mail/.test(s)));
  ok('no calendar or contacts scope', !mf.oauthScopes.some(s => /calendar|contacts/.test(s)));
  ok('no external-request scope', !mf.oauthScopes.some(s => /external_request/.test(s)));
  ok('the advanced Sheets service is unchanged',
    mf.dependencies.enabledAdvancedServices.length === 1 &&
    mf.dependencies.enabledAdvancedServices[0].serviceId === 'sheets');
}

console.log('\n  -- the gates are strict and independent --');
{
  const S = serverSandbox();
  ok('SALES gate closed by default', call(S, 'gateOpen_("SALES_WRITER_ENABLED")') === false);
  ok('INVENTORY gate closed by default', call(S, 'gateOpen_("INVENTORY_MUTATION_ENABLED")') === false);
  ['undefined', 'null', '"true"', '1', '"TRUE"', '{}', '[]', '"yes"'].forEach(function (v) {
    const T = serverSandbox({ after: 'CONFIG.FEATURES.SALES_WRITER_ENABLED = ' + v + ';' });
    ok('a gate set to ' + v + ' is CLOSED — only boolean true opens it',
      call(T, 'gateOpen_("SALES_WRITER_ENABLED")') === false);
  });
  ok('a MISSING features object leaves the gate closed',
    call(serverSandbox({ after: 'CONFIG.FEATURES = undefined;' }), 'gateOpen_("SALES_WRITER_ENABLED")') === false);
  ok('boolean true is the ONLY thing that opens a gate',
    call(serverSandbox({ after: 'CONFIG.FEATURES.SALES_WRITER_ENABLED = true;' }),
      'gateOpen_("SALES_WRITER_ENABLED")') === true);
  ok('the flag-name mapping is documented, not duplicated',
    /INVENTORY_SOLD_WRITER_ENABLED/.test(saleSrc) &&
    /INVENTORY: 'INVENTORY_MUTATION_ENABLED'/.test(saleSrc));
  ok('no redundant third flag was added to Config.gs',
    read('Config.gs').indexOf('INVENTORY_SOLD_WRITER_ENABLED') === -1);
}
{
  const inv0 = firstItem(serverSandbox());
  const line = { itemId: inv0.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null };
  // SALES on, INVENTORY off -> refuses at the inventory gate, nothing recorded.
  const A = serverSandbox({ features: { SALES_WRITER_ENABLED: true } });
  const ra = mockAdapter();
  const outA = runTx(A, req({ lines: [line] }), ra);
  ok('SALES gate alone does NOT enable inventory mutation',
    outA.ok === false && outA.code === 'SALE_INVENTORY_WRITES_DISABLED', outA.code);
  ok('and nothing was appended', ra.appended.length === 0 && ra.sold.length === 0);
  // INVENTORY on, SALES off -> refuses at the sales gate.
  const B = serverSandbox({ features: { INVENTORY_MUTATION_ENABLED: true } });
  const rb = mockAdapter();
  const outB = runTx(B, req({ lines: [line] }), rb);
  ok('INVENTORY gate alone does NOT enable the SALES writer',
    outB.ok === false && outB.code === 'SALE_WRITES_DISABLED', outB.code);
  ok('and nothing was appended', rb.appended.length === 0 && rb.sold.length === 0);
  ok('the refusal happened BEFORE the lock and before any read',
    outB.journal.indexOf('IDEMPOTENCY') === -1 && rb.reads === 0);
}
{
  // Scope presence and the allocator must never enable a writer.
  const S = serverSandbox({ saleIds: [] });
  ok('a write-capable manifest does NOT open either gate',
    call(S, 'gateOpen_("SALES_WRITER_ENABLED")') === false &&
    call(S, 'gateOpen_("INVENTORY_MUTATION_ENABLED")') === false);
  ok('the allocator existing does NOT open either gate',
    typeof call(S, 'allocateDailySequence_') === 'function' &&
    call(S, 'gateOpen_("SALES_WRITER_ENABLED")') === false);
  ok('TEST environment does not bypass the gates',
    call(S, 'CONFIG.ENVIRONMENT') === 'TEST' &&
    call(S, 'gateOpen_("SALES_WRITER_ENABLED")') === false);
  ok('there is no deployment-derived override anywhere in the source',
    !/isDeployed|deployment.*enable|ScriptApp\.getService/.test(saleSrc));
}

console.log('\n  -- no writer exists, even with both gates open --');
{
  const S = serverSandbox({ features: BOTH, saleIds: [] });
  const it = firstItem(S);
  const out = runTx(S, req({ lines: [{ itemId: it.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] }), null);
  ok('both gates open, but production has NO adapter', out.ok === false);
  ok('it refuses with NO_WRITER', out.code === 'SALE_NO_WRITER', out.code);
  ok('and says nothing was written', /Nothing was written/.test(out.message));
  ok('saleWriteAdapter_() returns null in production', call(S, 'saleWriteAdapter_()') === null);
  const done = call(S, 'completeSale(' + JSON.stringify(req({ lines: [{ itemId: it.itemId,
    qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] })) + ')');
  ok('completeSale() STILL refuses at the end of Package 15C', done.ok === false, done.code);
}

console.log('\n  -- CASH only --');
{
  const S = serverSandbox({ features: BOTH, saleIds: [] });
  const it = firstItem(S);
  const line = { itemId: it.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null };
  ok('CASH is accepted by the transaction model',
    runTx(S, req({ lines: [line] }), mockAdapter()).ok === true);
  [['CARD','NV-23'],['FINANCE','NV-23'],['LAYAWAY','lifecycle'],['CHECK','NV-23'],
   ['STORE_CREDIT','ledger'],['CASH_APP','Historical']].forEach(function (c) {
    const r = runTx(S, req({ lines: [line], paymentMethodId: c[0] }), mockAdapter());
    ok('refuses tender ' + c[0], r.ok === false && r.code === 'SALE_TENDER_NOT_APPROVED', r.code);
  });
  ok('Store Credit refusal names the missing ledger',
    /NV-28|credit ledger/.test(runTx(S, req({ lines: [line], paymentMethodId: 'STORE_CREDIT' }), mockAdapter()).message));
  ok('Payment & Pickup Plan is refused as a tender, not treated as one',
    /not a tender|lifecycle/i.test(runTx(S, req({ lines: [line], paymentMethodId: 'LAYAWAY' }), mockAdapter()).message));
  ok('an unapproved tender records ZERO modelled writes',
    (function () { const r = mockAdapter();
      runTx(S, req({ lines: [line], paymentMethodId: 'CARD' }), r);
      return r.appended.length === 0 && r.sold.length === 0; })());
  ok('the approved tender list is CASH only', call(S, 'APPROVED_TENDER_IDS').join(',') === 'CASH');
}

console.log('\n  -- idempotency --');
{
  const S = serverSandbox();
  // The 148 historical rows have a BLANK request_id and must never match.
  const historical = [];
  for (let k = 0; k < 148; k++) { historical.push({ sale_id: 'SHOPIFY-' + (3000 + k), request_id: '' }); }
  ok('blank historical request_ids never match a real request',
    call(S, 'findCommittedSale_')(historical, RID) === null);
  ok('a blank lookup key never matches anything',
    call(S, 'findCommittedSale_')(historical.concat([{ sale_id: 'X', request_id: '' }]), '') === null);
  ok('an undefined lookup key never matches',
    call(S, 'findCommittedSale_')(historical, undefined) === null);
  const committed = historical.concat([
    { sale_id: 'EDP-20261005-001', request_id: RID },
    { sale_id: 'EDP-20261005-001', request_id: RID }
  ]);
  const hit = call(S, 'findCommittedSale_')(committed, RID);
  ok('a committed request is recognised', hit !== null && hit.saleId === 'EDP-20261005-001');
  ok('and reports how many rows the sale occupies', hit.rowCount === 2, 'rowCount ' + hit.rowCount);
  ok('a different request id does not match', call(S, 'findCommittedSale_')(committed, 'REQ-other-0123456789') === null);
  ok('whitespace around a stored id is tolerated',
    call(S, 'findCommittedSale_')([{ sale_id: 'EDP-1', request_id: '  ' + RID + ' ' }], RID) !== null);
}
{
  const S = serverSandbox({ features: BOTH, saleIds: [] });
  const it = firstItem(S);
  const line = { itemId: it.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null };
  const rec = mockAdapter({ committed: [
    { sale_id: 'EDP-20261005-042', request_id: RID },
    { sale_id: 'EDP-20261005-042', request_id: RID }
  ] });
  const out = runTx(S, req({ lines: [line] }), rec);
  ok('a retry of a committed request returns the ORIGINAL sale', out.ok === true && out.duplicate === true);
  ok('with the original sale id', out.saleId === 'EDP-20261005-042', out.saleId);
  ok('and creates NO second sale', rec.appended.length === 0, rec.appended.length + ' appends');
  ok('and performs NO inventory mutation', rec.sold.length === 0);
  ok('the journal shows it returned early', out.journal.indexOf('RETURN_EXISTING') !== -1 &&
    out.journal.indexOf('APPEND_SALES') === -1);
  ok('the idempotency check happened INSIDE the lock',
    call(S, '__lock.acquired') === 1 && out.journal.indexOf('IDEMPOTENCY') !== -1);
  ok('a request without a requestId is refused',
    runTx(S, req({ lines: [line], requestId: undefined }), mockAdapter()).code === 'SALE_MISSING_REQUEST_ID');
  ok('request_id is never written into notes',
    !/notes:\s*(sale\.)?requestId|notes.*request_id/.test(saleSrc));
}

console.log('\n  -- the SALES row contract through the boundary --');
{
  const S = serverSandbox({ features: BOTH, saleIds: [] });
  const inv = call(S, 'readInventory()');
  const rec = mockAdapter();
  const out = runTx(S, req({ lines: [
    { itemId: inv[0].itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null },
    { itemId: inv[1].itemId, qty: 1, warrantyId: 'W-90', unitPriceCents: null }
  ] }), rec);
  ok('two items model TWO rows', out.ok === true && out.rowCount === 2, 'rows ' + out.rowCount);
  const rows = rec.appended[0];
  ok('each row is 33 columns wide', rows.every(r => r.length === 33));
  ok('both rows share ONE sale_id', rows[0][0] === rows[1][0]);
  ok('that sale id is a Register id', call(S, 'isRegisterSaleId_')(rows[0][0]) === true, rows[0][0]);
  ok('column 32 is empty on every row', rows.every(r => r[31] === ''));
  ok('request_id is in column 33 on every row', rows.every(r => r[32] === RID));
  ok('sales_source is EDP_REGISTER', rows.every(r => r[20] === 'EDP_REGISTER'));
  ok('entry_type is REGISTER_SALE', rows.every(r => r[21] === 'REGISTER_SALE'));
  ok('one append call, not a loop of appends', rec.appended.length === 1);
  ok('inventory was marked SOLD for both items', rec.sold.length === 2);
  ok('a one-item sale models ONE row', (function () {
    const r2 = mockAdapter();
    const o = runTx(S, req({ lines: [{ itemId: inv[0].itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] }), r2);
    return o.rowCount === 1 && r2.appended[0].length === 1 && r2.appended[0][0].length === 33;
  })());
  ok('the SALES schema was NOT changed again',
    call(S, 'SALES_COLUMNS').length === 32 && call(S, 'SALES_MIGRATION.ADD_COLUMN') === 'request_id');
}

console.log('\n  -- inventory contract --');
{
  const S = serverSandbox({ features: BOTH, saleIds: [] });
  const it = firstItem(S);
  const rec = mockAdapter();
  runTx(S, req({ lines: [{ itemId: it.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] }), rec);
  ok('markSold is called with the item id only', rec.sold.length === 1 && rec.sold[0] === it.itemId);
  const strip = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');
  const code = strip(saleSrc);
  ok('stage is never written', !/stage\s*[:=]/.test(code));
  ok('no PAID field is invented', !/['"]PAID['"]/.test(code));
  ok('no sold_date is invented', !/sold_date/.test(code));
  ok('no sold_price is invented', !/sold_price/.test(code));
  ok('no sale_id backlink column is invented', !/sale_id_backlink|appliance_sale_id/.test(code));
}

console.log('\n  -- failure and partial-failure model --');
{
  const S = serverSandbox({ features: BOTH, saleIds: [] });
  const it = firstItem(S);
  const good = { itemId: it.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null };

  // A. validation fails -> zero modelled writes
  const rA = mockAdapter();
  const oA = runTx(S, req({ lines: [] }), rA);
  ok('A. validation failure -> refused', oA.ok === false && oA.code === 'SALE_EMPTY_CART');
  ok('A. and ZERO modelled writes', rA.appended.length === 0 && rA.sold.length === 0);

  // C. allocation fails -> zero writes
  const rC = mockAdapter();
  const SC = serverSandbox({ features: BOTH, saleIds: ['EDP-' + todayKey(serverSandbox()) + '-999'] });
  const oC = runTx(SC, req({ lines: [good] }), rC);
  ok('C. sale-id allocation failure -> refused', oC.ok === false, oC.code);
  ok('C. and ZERO modelled writes', rC.appended.length === 0 && rC.sold.length === 0);

  // D. append fails -> no inventory mutation
  const rD = mockAdapter({ appendFails: true });
  const oD = runTx(S, req({ lines: [good] }), rD);
  ok('D. SALES append failure -> refused', oD.ok === false && oD.code === 'SALE_APPEND_FAILED', oD.code);
  ok('D. and NO inventory mutation was attempted', rD.sold.length === 0);
  ok('D. the journal stops at the append', oD.journal.indexOf('MARK_SOLD') === -1);

  // E. append succeeds, inventory fails -> reconciliation exception, no rollback
  const rE = mockAdapter({ soldFailsFor: [it.itemId] });
  const oE = runTx(S, req({ lines: [good] }), rE);
  ok('E. the sale still SUCCEEDS — the record is authoritative', oE.ok === true);
  ok('E. and a reconciliation exception is raised', oE.reconciliation !== null &&
    oE.reconciliation.code === 'SALE_INVENTORY_RECONCILE');
  ok('E. naming the item that needs reconciling', oE.reconciliation.items[0] === it.itemId);
  ok('E. it explicitly was NOT rolled back', /NOT rolled back/.test(oE.reconciliation.message));
  ok('E. no blind delete was attempted', rE.appended.length === 1);
  ok('the ordering rule is in the source: record before inventory',
    /SALES record is written BEFORE inventory/.test(saleSrc));
}
{
  // Lock must release even when the work inside throws.
  const S = serverSandbox({ features: BOTH, saleIds: [] });
  const it = firstItem(S);
  const rec = mockAdapter();
  rec.adapter.appendSalesRows = function () { throw new Error('boom'); };
  const out = runTx(S, req({ lines: [{ itemId: it.itemId, qty: 1, warrantyId: 'W-ASIS', unitPriceCents: null }] }), rec);
  ok('a throw inside the boundary is caught and refused', out.ok === false);
  ok('and the lock was released exactly once', call(S, '__lock.acquired') === 1 && call(S, '__lock.released') === 1,
     'acquired ' + call(S, '__lock.acquired') + ', released ' + call(S, '__lock.released'));
  ok('the nested allocator did NOT take a second lock — re-entrancy is guarded',
     call(S, '__lock.acquired') === 1);
  ok('the guard is cleared after the boundary, not left latched',
     call(S, 'inSaleLock_') === false);
  ok('and no inventory mutation happened', rec.sold.length === 0);
}

console.log('\n  -- zero-write proof --');
{
  const strip = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');
  const code = strip(saleSrc);
  ok('Sale.gs contains NO Sheets write call',
    !/Values\.update|Values\.append|Values\.batchUpdate|Spreadsheets\.batchUpdate/.test(code));
  ok('the only Sheets call is still Values.get',
    (code.match(/Sheets\.Spreadsheets\.[A-Za-z.]+/g) || []).join(',') === 'Sheets.Spreadsheets.Values.get');
  ok('no SpreadsheetApp / DriveApp / MailApp / UrlFetchApp',
    !/SpreadsheetApp|DriveApp|MailApp|GmailApp|UrlFetchApp/.test(code));
  ok('no setProperty', !/setProperty/.test(code));
  ok('no write verb anywhere else in the .gs sources', (function () {
    for (const f of ['Code.gs','Config.gs','DataSource.gs','InventoryQuery.gs','MockData.gs','Validation.gs']) {
      if (/Values\.update|Values\.append|\.setValue|\.appendRow|setProperty/.test(strip(read(f)))) { return false; }
    }
    return true;
  })());
  ok('no write verb was reached by ANY test in this suite', writeAttempts.length === 0, writeAttempts.join(', '));
}

console.log('\n-------------------------------------------------------');
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
