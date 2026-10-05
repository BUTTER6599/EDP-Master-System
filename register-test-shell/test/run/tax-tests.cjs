// Package 12 — TAX-INCLUSIVE retail pricing (owner policy, 2026-10-03).
//
// EDP advertised prices ARE the customer total. Tax is never added on top; it
// is extracted from the total already shown:
//
//     tax     = total - (total / 1.0975)
//     pre-tax = total - tax
//
// Loads the REAL client logic out of Scripts.html into a sandbox, so the suite
// exercises shipped code rather than a re-implementation. Touches no Google
// service, no spreadsheet, no printer, no network.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(DIR, 'Scripts.html'), 'utf8');
const cfgSrc = fs.readFileSync(path.join(DIR, 'Config.gs'), 'utf8');
const js  = (src.match(/<script>([\s\S]*)<\/script>/) || [])[1] || '';

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const money = n => '$' + Number(n).toFixed(2);

// Source bans are checked against CODE, not against the comments that RECORD
// those bans — Config.gs names MOCK_TAX_RATE precisely to document that it was
// deleted, and Scripts.html quotes the fail-open idiom it replaced. Stripping
// comments aims each ban at the text that can actually execute; the stripper is
// asserted before any ban relies on it.
const stripComments = s => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');
const cfgCode = stripComments(cfgSrc);
const jsCode = stripComments(js);

// --- minimal DOM / host stubs ------------------------------------------------
function makeEl() {
  const el = { textContent: '', innerHTML: '', hidden: false, disabled: false,
    dataset: {}, attrs: {} };
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  el.getAttribute = k => (k in el.attrs ? el.attrs[k] : null);
  el.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
  el.querySelector = () => null;
  el.querySelectorAll = () => [];
  el.addEventListener = (e, f) => { (el.handlers = el.handlers || {})[e] = f; };
  el.closest = () => null;
  return el;
}
const BODY = (function () {
  const open = js.indexOf('(function () {'), close = js.lastIndexOf('})();');
  if (open < 0 || close < 0) { throw new Error('could not unwrap the client IIFE'); }
  return js.slice(open + '(function () {'.length, close);
})();

function sandbox(boot) {
  const S = { console, JSON, Math, Number, String, Array, Object, Date, RegExp,
              isFinite, isNaN, parseInt, parseFloat, Intl, encodeURIComponent, decodeURIComponent };
  S.window = S; S.globalThis = S;
  const els = {};
  S.document = {
    readyState: 'loading',
    querySelector: sel => (els[sel] = els[sel] || makeEl()),
    querySelectorAll: () => [],
    addEventListener: () => {},
    getElementById: id => (els['#' + id] = els['#' + id] || makeEl()),
    images: []
  };
  S.__els = els;
  S.print = () => {};
  S.setInterval = () => 0; S.setTimeout = () => 0; S.clearInterval = () => {};
  S.EDP_BOOT = boot;
  vm.createContext(S);
  try { vm.runInContext(BODY, S); } catch (e) { S.__bootError = e; }
  return S;
}
const call = (S, expr) => vm.runInContext(expr, S);

// --- fixtures ----------------------------------------------------------------
// Prices chosen so the arithmetic is checkable by hand: a $300.00 advertised
// appliance is the owner's own worked example.
const INV = [
  { itemId: 'A-300', brand: 'TEST', model: 'THREEHUNDRED', description: 'd',
    condition: 'WORKING', availability: 'AVAILABLE', qty: 1, price: 300, location: '',
    serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'washer',
    photoPrimary: '', photoGallery: [] },
  { itemId: 'B-100', brand: 'TEST', model: 'ONEHUNDRED', description: 'd',
    condition: 'WORKING', availability: 'AVAILABLE', qty: 1, price: 100, location: '',
    serialPlaceholder: '[ SERIAL PLACEHOLDER ]', photoKey: 'washer',
    photoPrimary: '', photoGallery: [] }
];
const WARR = [{ id: 'W-ASIS', label: 'As-Is', days: 0, price: 0 },
              { id: 'W-90', label: '90-Day', days: 90, price: 49 }];
function cfg(over) {
  const c = { taxMode: 'INCLUSIVE', taxRate: 0.0975,
    taxLabel: 'Sales Tax (9.75%, included)', currency: 'USD', locale: 'en-US',
    environment: 'TEST', buildVersion: '0.1.0',
    companyShort: 'Electronics Depot', companyName: 'The Electronics Depot LLC',
    storeAddress: '[ A ]', storePhone: '[ P ]', storeFooter: '[ F ]',
    features: { COMPLETE_SALE_ENABLED: false, PRINTER_ENABLED: false },
    warrantyOptions: WARR, paymentMethods: [{ id: 'CASH', label: 'Cash' }] };
  return Object.assign(c, over || {});
}
const boot = over => ({ config: cfg(over), inventory: INV, categories: [],
  customers: [], activity: [], serverTime: { iso: new Date().toISOString(), epochMs: Date.now() },
  openTicket: { ticketId: 'TXN-MOCK-4471', customerId: null, paymentMethodId: 'CASH', lines: [] } });
const line = (id, qty, price, warr) =>
  ({ itemId: id, qty: qty, unitPrice: price, listPrice: price, warrantyId: warr || 'W-ASIS' });
function withCart(S, cart) { call(S, 'state.cart = ' + JSON.stringify(cart) + ';'); return S; }

console.log('PACKAGE 12 — TAX-INCLUSIVE RETAIL PRICING (9.75%)');
console.log('=================================================');

// --- 1. the owner's worked example -------------------------------------------
console.log('\n1. A $300.00 ADVERTISED APPLIANCE IS A $300.00 CUSTOMER TOTAL');
{
  const S = sandbox(boot());
  ok('client loaded without error', !S.__bootError, S.__bootError && String(S.__bootError.message));
  withCart(S, [line('A-300', 1, 300)]);
  const t = call(S, 'cartTotals()');
  ok('the customer total is EXACTLY $300.00 — nothing added', t.total === 300.00, money(t.total));
  ok('tax is $26.65, extracted from the $300.00', t.tax === 26.65, money(t.tax));
  ok('pre-tax amount is $273.35', t.preTax === 273.35, money(t.preTax));
  ok('pre-tax + tax reconstructs the total to the cent',
    Math.round((t.preTax + t.tax) * 100) / 100 === 300.00);
  ok('the OLD additive answer ($329.25) is gone', t.total !== 329.25);
  ok('the OLD 9.45% additive answer ($328.35) is gone', t.total !== 328.35);
  ok('no tax configuration error', t.taxError === null);
  // Independent recomputation from the owner's stated formulas.
  ok('matches  tax = total - (total / 1.0975)',
    t.tax === Math.round((300 - 300 / 1.0975) * 100) / 100);
  ok('matches  tax = total / 1.0975 * 0.0975',
    t.tax === Math.round((300 / 1.0975 * 0.0975) * 100) / 100);
  ok('matches  subtotal_before_tax = total / 1.0975',
    t.preTax === Math.round((300 / 1.0975) * 100) / 100);
}

// --- 2. multiple items, quantities, warranties --------------------------------
console.log('\n2. MULTIPLE ITEMS STAY TAX-INCLUSIVE');
{
  const S = sandbox(boot());
  withCart(S, [line('A-300', 2, 300), line('B-100', 1, 100)]);
  const t = call(S, 'cartTotals()');
  ok('subtotal is the sum of the prices shown', t.sub === 700, money(t.sub));
  ok('total equals that subtotal — nothing added', t.total === 700, money(t.total));
  ok('tax is extracted from $700.00', t.tax === Math.round((700 - 700 / 1.0975) * 100) / 100, money(t.tax));
  ok('pre-tax + tax === total', Math.round((t.preTax + t.tax) * 100) / 100 === t.total);
  ok('item count is 3', t.count === 3);
}
{
  const S = sandbox(boot());
  withCart(S, [line('A-300', 1, 300, 'W-90')]);
  const t = call(S, 'cartTotals()');
  ok('a $49 warranty makes the customer total $349.00', t.total === 349.00, money(t.total));
  ok('warranty is carried inclusive, not taxed again', t.warr === 49);
  ok('pre-tax + tax === total with a warranty',
    Math.round((t.preTax + t.tax) * 100) / 100 === 349.00);
}
{
  // Rounding must never drift: every total from $0.01 to $2000.00.
  const S = sandbox(boot());
  let drift = 0, added = 0;
  for (let cents = 1; cents <= 200000; cents++) {
    const v = cents / 100;
    withCart(S, [line('A-300', 1, v)]);
    const t = call(S, 'cartTotals()');
    if (Math.round((t.preTax + t.tax) * 100) !== cents) { drift++; }
    if (t.total !== v) { added++; }
  }
  ok('across 200,000 totals, pre-tax + tax always reconstructs the total', drift === 0,
    drift ? drift + ' drifted' : '');
  ok('across 200,000 totals, nothing is ever added to the customer total', added === 0,
    added ? added + ' inflated' : '');
}

// --- 3. empty cart ------------------------------------------------------------
console.log('\n3. EMPTY CART IS SAFE');
{
  const S = sandbox(boot());
  const t = call(S, 'cartTotals()');
  ok('subtotal $0.00', t.sub === 0);
  ok('warranty $0.00', t.warr === 0);
  ok('tax $0.00 — not NaN, not null', t.tax === 0);
  ok('pre-tax $0.00', t.preTax === 0);
  ok('total $0.00', t.total === 0);
  ok('item count 0', t.count === 0);
  call(S, 'renderCart();');
  ok('the cart panel renders without error', S.__els['#grandTotal'].textContent === '$0.00',
    S.__els['#grandTotal'].textContent);
  call(S, 'renderReceipt();');
  ok('the receipt renders without error',
    S.__els['#receipt'].innerHTML.indexOf('No line items') !== -1);
  ok('an empty receipt is still marked TEST',
    S.__els['#receipt'].innerHTML.indexOf('TEST — NOT A SALE') !== -1);
}

// --- 4. unresolved lines stay fail-closed ------------------------------------
console.log('\n4. UNRESOLVED ITEMS REMAIN FAIL-CLOSED UNDER THE NEW MODEL');
{
  const S = sandbox(boot());
  withCart(S, [line('A-300', 1, 300), line('GHOST-9', 4, 999, 'W-90')]);
  const t = call(S, 'cartTotals()');
  ok('the ghost adds nothing to subtotal', t.sub === 300, money(t.sub));
  ok('the ghost adds nothing to warranty', t.warr === 0, money(t.warr));
  ok('the ghost adds nothing to the customer total', t.total === 300, money(t.total));
  ok('tax is still extracted from $300.00 only', t.tax === 26.65, money(t.tax));
  ok('the ghost is counted as unresolved', t.unresolved === 1);
  ok('the ghost is excluded from the item count', t.count === 1);
  call(S, 'renderReceipt();');
  const html = S.__els['#receipt'].innerHTML;
  ok('the receipt names it rather than hiding it',
    html.indexOf('UNRESOLVED ITEM — not included in totals') !== -1);
  ok('no $999 reaches the receipt', html.indexOf('999.00') === -1);
}

// --- 5. the retired 9.45% rate ------------------------------------------------
console.log('\n5. THE 9.45% MOCK RATE IS RETIRED, NOT HIDDEN');
{
  ok('the comment stripper keeps executable code', cfgCode.indexOf('SALES_TAX:') !== -1);
  ok('the comment stripper removes prose', cfgCode.indexOf('APPROVED EDP RETAIL TAX POLICY') === -1);
  ok('MOCK_TAX_RATE no longer exists as a constant', cfgCode.indexOf('MOCK_TAX_RATE') === -1);
  ok('MOCK_TAX_LABEL no longer exists as a constant', cfgCode.indexOf('MOCK_TAX_LABEL') === -1);
  ok('nothing reads MOCK_TAX_RATE any more', cfgCode.indexOf('CONFIG.MOCK_TAX') === -1);
  ok('the deletion is documented, not silent', cfgSrc.indexOf('MOCK_TAX_RATE') !== -1);
  ok('0.0945 appears nowhere in Config.gs — not even commented out',
    cfgSrc.indexOf('0.0945') === -1);
  ok('0.0945 appears nowhere in the client', js.indexOf('0.0945') === -1);
  ok('the approved rate is declared once in Config.gs',
    (cfgSrc.split('0.0975').length - 1) === 1);
  ok('the approved mode is declared', /MODE:\s*'INCLUSIVE'/.test(cfgSrc));
  ok('the rate components are recorded', /Jefferson Parish/.test(cfgSrc) && /Louisiana/.test(cfgSrc));
  ok('the components sum to the combined rate',
    Math.round((0.0500 + 0.0475) * 10000) / 10000 === 0.0975);
  ok('the client hard-codes no rate of its own',
    !/0\.0975|0\.0945|1\.0975/.test(js));
  ok('the client reads the rate from config',
    /CFG\.taxRate/.test(js) && /CFG\.taxMode/.test(js));
}

// --- 6. tax configuration fails CLOSED ----------------------------------------
console.log('\n6. A MISSING OR WRONG TAX CONFIG FAILS CLOSED');
[
  ['no mode at all',        { taxMode: undefined }],
  ['an additive mode',      { taxMode: 'ADD_ON_TOP' }],
  ['no rate at all',        { taxRate: undefined }],
  ['a rate of zero',        { taxRate: 0 }],
  ['a string rate',         { taxRate: '0.0975' }],
  ['a nonsense rate',       { taxRate: 9.75 }],
  ['a negative rate',       { taxRate: -0.0975 }],
  ['a NaN rate',            { taxRate: NaN }]
].forEach(function (c) {
  const S = sandbox(boot(c[1]));
  withCart(S, [line('A-300', 1, 300)]);
  const t = call(S, 'cartTotals()');
  ok('with ' + c[0] + ': no tax figure is invented', t.tax === null);
  ok('with ' + c[0] + ': no total is produced', t.total === null);
  ok('with ' + c[0] + ': the reason is stated', typeof t.taxError === 'string' && t.taxError.length > 0,
    t.taxError);
  call(S, 'renderCart();');
  ok('with ' + c[0] + ': the screen shows an em dash, never $0.00',
    S.__els['#grandTotal'].textContent === '—', S.__els['#grandTotal'].textContent);
});
{
  // The old fail-open idiom must be gone from the source entirely.
  ok('the fail-open CFG.taxRate || 0 idiom is gone from client code',
    jsCode.indexOf('CFG.taxRate || 0') === -1);
  ok('its replacement is documented, not silent', js.indexOf('CFG.taxRate || 0') !== -1);
  ok('money() refuses to render a missing figure as $0.00',
    /if \(typeof n !== 'number' \|\| !isFinite\(n\)\) \{ return '—'; \}/.test(js));
}

// --- 7. every surface tells the same story ------------------------------------
console.log('\n7. CART, RECEIPT AND PRINTED SLIP AGREE');
{
  const S = sandbox(boot());
  withCart(S, [line('A-300', 1, 300)]);
  const t = call(S, 'cartTotals()');
  const m = call(S, 'buildReceiptModel()');
  ok('receipt total matches the cart total', m.totals.total === t.total);
  ok('receipt tax matches the cart tax', m.totals.tax === t.tax);
  ok('receipt pre-tax matches the cart pre-tax', m.totals.preTax === t.preTax);
  ok('the model records the mode it used', m.totals.taxMode === 'INCLUSIVE');
  ok('the model records the rate it used', m.totals.taxRate === 0.0975);

  call(S, 'renderCart(); renderReceipt();');
  ok('the cart shows $300.00 as the total', S.__els['#grandTotal'].textContent === '$300.00',
    S.__els['#grandTotal'].textContent);
  ok('the cart tax line says the tax is included',
    /included/i.test(S.__els['#taxLabel'].textContent), S.__els['#taxLabel'].textContent);
  ok('the cart tax line names the rate',
    /9\.75/.test(S.__els['#taxLabel'].textContent));

  const html = S.__els['#receipt'].innerHTML;
  ok('the receipt shows $300.00', html.indexOf('$300.00') !== -1);
  ok('the receipt shows the $26.65 tax', html.indexOf('$26.65') !== -1);
  ok('the receipt shows the $273.35 pre-tax amount', html.indexOf('$273.35') !== -1);
  ok('the receipt captions the breakdown as included, not added',
    html.indexOf('Included in the total above — not added to it') !== -1);

  const body = (call(S, 'buildEposPrintXml()').match(/<text>([\s\S]*?)<\/text>/) || ['', ''])[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  ok('the printed slip shows the same total', /TOTAL\s+\$300\.00/.test(body));
  ok('the printed slip shows the same tax', body.indexOf('$26.65') !== -1);
  ok('the printed slip shows the same pre-tax amount', body.indexOf('$273.35') !== -1);
  ok('the printed slip captions the breakdown',
    body.indexOf('Included in the total above') !== -1);
  ok('no printed line exceeds the 42-column roll',
    body.split('\n').filter(l => l.length > 42).length === 0);
}

// --- 8. the guarantees this package must not weaken ---------------------------
console.log('\n8. GUARANTEES STILL HOLD');
{
  const S = sandbox(boot());
  withCart(S, [line('A-300', 1, 300)]);
  call(S, 'renderCart();');
  ok('Complete Sale is still disabled with a real item in the cart',
    S.__els['#btnCompleteSale'].disabled === true);
  ok('Complete Sale is still disabled for assistive tech',
    S.__els['#btnCompleteSale'].getAttribute('aria-disabled') === 'true');
  ok('COMPLETE_SALE_ENABLED is still false', /COMPLETE_SALE_ENABLED:\s*false/.test(cfgSrc));
  ok('SALES_WRITER_ENABLED is still false', /SALES_WRITER_ENABLED:\s*false/.test(cfgSrc));
  ok('INVENTORY_MUTATION_ENABLED is still false', /INVENTORY_MUTATION_ENABLED:\s*false/.test(cfgSrc));
  ok('the receipt is still marked TEST — NOT A SALE',
    call(S, 'buildReceiptModel()').isTest === true);

  const ds = fs.readFileSync(path.join(DIR, 'DataSource.gs'), 'utf8');
  const strip = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');
  ok('no spreadsheet write verb exists in DataSource.gs code',
    !/\.setValue|\.setValues|\.appendRow|Values\.update|Values\.append|setProperty/.test(strip(ds)));
  ok('the data source is still the real APPLIANCES sheet',
    /ACTIVE_DATA_SOURCE\s*=\s*DATA_SOURCES\.APPLIANCES_SHEET/.test(ds));
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'appsscript.json'), 'utf8'));
  // Package 15C: the SOURCE manifest is now write-CAPABLE, which is NOT the
  // same as write-AUTHORISED or sales-enabled. The guard is re-aimed at what
  // must still hold - exactly ONE Sheets scope and nothing else - because the
  // scope no longer carries the safety on its own; the writer gates do.
  ok('the manifest carries exactly ONE scope, the minimum Sheets scope',
    manifest.oauthScopes.length === 1 &&
    manifest.oauthScopes[0] === 'https://www.googleapis.com/auth/spreadsheets');
  const ignore = fs.readFileSync(path.join(DIR, '.claspignore'), 'utf8');
  ok('the push allowlist is still exactly 11 files (Sale.gs added in Package 13)',
    (ignore.match(/^!/gm) || []).length === 11);
  ok('the Package 10 fail-closed resolver is untouched',
    !/findItem\(l\.itemId\) \|\| \{\}/.test(js));
}

console.log('\n-------------------------------------------------------');
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
