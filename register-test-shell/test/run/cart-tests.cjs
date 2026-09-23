// Package 10 — real inventory -> real cart.
// Loads the REAL client logic out of Scripts.html into a sandbox with a minimal
// DOM stub, so the suite exercises shipped code, not a re-implementation.
// Touches no Google service, no spreadsheet, no network.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(DIR, 'Scripts.html'), 'utf8');
const js  = (src.match(/<script>([\s\S]*)<\/script>/) || [])[1] || '';

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

// --- minimal DOM / host stubs ------------------------------------------------
function makeEl() {
  const el = { textContent: '', innerHTML: '', hidden: false, disabled: false,
    dataset: {}, attrs: {}, children: [] };
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  el.getAttribute = k => (k in el.attrs ? el.attrs[k] : null);
  el.querySelector = () => null;
  el.querySelectorAll = () => [];
  el.addEventListener = () => {};
  el.closest = () => null;
  return el;
}
// Unwraps the client IIFE so its internals are reachable, and sets the
// bootstrap the real code reads (window.EDP_BOOT). readyState is 'loading' so
// the shipped auto-init does NOT fire; each test drives the functions itself.
const BODY = (function () {
  let b = js;
  const open = b.indexOf('(function () {');
  const close = b.lastIndexOf('})();');
  if (open < 0 || close < 0) { throw new Error('could not unwrap the client IIFE'); }
  return b.slice(open + '(function () {'.length, close);
})();

function sandbox(bootstrap) {
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
  S.setInterval = () => 0; S.setTimeout = () => 0; S.clearInterval = () => {};
  S.EDP_BOOT = bootstrap;
  vm.createContext(S);
  try { vm.runInContext(BODY, S); } catch (e) { S.__bootError = e; }
  return S;
}
function call(S, expr) { return vm.runInContext(expr, S); }

// --- fixtures ----------------------------------------------------------------
const LH = 'https://lh3.googleusercontent.com/d/';
const REAL = [
  { itemId: 'W-105G', category: 'Washer', brand: 'GE APPLIANCES', model: 'HTW240ASK6WS',
    description: 'GE APPLIANCES HTW240ASK6WS Washer', price: 295, condition: 'WORKING',
    availability: 'AVAILABLE', qty: 1, location: '', serialPlaceholder: '[ SERIAL PLACEHOLDER ]',
    photoKey: 'washer', photoPrimary: LH + 'aaa', photoGallery: [LH + 'aaa'] },
  { itemId: 'W-0540', category: 'Washer', brand: 'MAYTAG', model: 'MVW6230HW0',
    description: 'MAYTAG MVW6230HW0 Washer', price: 235, condition: 'USED',
    availability: 'AVAILABLE', qty: 1, location: '', serialPlaceholder: '[ SERIAL PLACEHOLDER ]',
    photoKey: 'washer', photoPrimary: '', photoGallery: [] }
];
const CFG = { taxRate: 0.0945, taxLabel: 'Sales Tax (MOCK)', currency: 'USD',
  warrantyOptions: [{ id: 'W-ASIS', label: 'As-Is', days: 0, price: 0 },
                    { id: 'W-30', label: '30-Day', days: 30, price: 0 },
                    { id: 'W-90', label: '90-Day', days: 90, price: 49 }],
  paymentMethods: [{ id: 'CASH', label: 'Cash' }] };
const boot = (lines) => ({ config: CFG, inventory: REAL, categories: ['Washer'],
  customers: [], activity: [], serverTime: { iso: new Date().toISOString(), epochMs: Date.now() },
  openTicket: { ticketId: 'TXN-MOCK-4471', register: 'R1', cashier: 'T',
                customerId: null, paymentMethodId: 'CASH', lines: lines } });

console.log('PACKAGE 10 — REAL INVENTORY -> REAL CART');
console.log('========================================');

// --- the phantom sale --------------------------------------------------------
console.log('\nPHANTOM PRELOAD ELIMINATED');
{
  const S = sandbox(boot([
    { itemId: 'EDP-10241', qty: 1, priceOverride: 699.00, warrantyId: 'W-90' },
    { itemId: 'EDP-10190', qty: 1, priceOverride: null,   warrantyId: 'W-30' }
  ]));
  ok('client loaded without error', !S.__bootError, S.__bootError && String(S.__bootError.message));
  call(S, 'applyOpenTicket();');
  ok('10. unresolvable mock lines never enter the cart', call(S, 'state.cart.length') === 0,
    'cart length = ' + call(S, 'state.cart.length'));
  const t = call(S, 'cartTotals()');
  ok('11. subtotal is zero (no $699.00)', t.sub === 0, '$' + t.sub);
  ok('11. warranty is zero (no $49.00)', t.warr === 0, '$' + t.warr);
  ok('11. tax is zero (no $70.69)', t.tax === 0, '$' + t.tax);
  ok('11. TOTAL is zero — the $818.69 phantom sale is gone', t.total === 0, '$' + t.total);
  ok('11. item count is zero', t.count === 0);
  ok('3. the drop is logged, not silent',
    call(S, 'state.activity.filter(function(e){return e.kind==="TICKET_LINE_DROPPED";}).length') === 1);
  ok('   the log names both dropped ids',
    /EDP-10241/.test(call(S, 'JSON.stringify(state.activity)')) &&
    /EDP-10190/.test(call(S, 'JSON.stringify(state.activity)')));
  ok('   ticket id TXN-MOCK-4471 is left as-is (owner decision)',
    call(S, 'state.ticketId') === 'TXN-MOCK-4471', call(S, 'state.ticketId'));
}
{
  const S = sandbox(boot([
    { itemId: 'EDP-10241', qty: 1, priceOverride: 699.00, warrantyId: 'W-90' },
    { itemId: 'W-105G',    qty: 1, priceOverride: null,   warrantyId: 'W-30' }
  ]));
  call(S, 'applyOpenTicket();');
  ok('a mixed ticket keeps ONLY the resolvable line', call(S, 'state.cart.length') === 1);
  ok('the surviving line is the real one', call(S, 'state.cart[0].itemId') === 'W-105G');
  ok('its price comes from real inventory', call(S, 'state.cart[0].listPrice') === 295);
}

// --- fail-closed resolver ----------------------------------------------------
console.log('\nFAIL-CLOSED RESOLVER');
{
  const S = sandbox(boot([]));
  ok('4. resolver returns the real item', call(S, 'resolveCartLine({itemId:"W-105G"}).brand') === 'GE APPLIANCES');
  ok('4. resolver returns NULL for an unknown id — never {}',
    call(S, 'resolveCartLine({itemId:"EDP-10241"})') === null);
  ok('4. resolver returns NULL for a missing itemId', call(S, 'resolveCartLine({})') === null);
  ok('4. resolver returns NULL for null input', call(S, 'resolveCartLine(null)') === null);
  ok('the old fail-open idiom is gone from cart/receipt/preload',
    !/findItem\(l\.itemId\) \|\| \{\}/.test(js));
}

// --- forced unresolved line --------------------------------------------------
console.log('\nA FORCED UNRESOLVED LINE CANNOT MOVE MONEY');
{
  const S = sandbox(boot([]));
  call(S, 'state.cart = [{itemId:"GHOST-1", qty:3, unitPrice:999, listPrice:999, warrantyId:"W-90"}];');
  const t = call(S, 'cartTotals()');
  ok('5. excluded from subtotal', t.sub === 0, '$' + t.sub);
  ok('5. excluded from warranty', t.warr === 0, '$' + t.warr);
  ok('5. excluded from tax', t.tax === 0, '$' + t.tax);
  ok('5. excluded from item count', t.count === 0);
  ok('5. excluded from total', t.total === 0, '$' + t.total);
  ok('   reported as unresolved rather than ignored', t.unresolved === 1);
  call(S, 'renderCart();');
  const html = S.__els['#cartLines'].innerHTML;
  ok('6. renders "UNRESOLVED ITEM — not included in totals"',
    html.indexOf('UNRESOLVED ITEM — not included in totals') !== -1);
  ok('6. shows the offending id', html.indexOf('GHOST-1') !== -1);
  ok('6. shows NO dollar amount for it', html.indexOf('$999') === -1 && html.indexOf('999.00') === -1);
  ok('6. still offers Remove so it can be cleared', html.indexOf('data-rm=') !== -1);
  call(S, 'renderReceipt();');
  const r = S.__els['#receipt'].innerHTML;
  ok('6. receipt also fails closed', r.indexOf('UNRESOLVED ITEM — not included in totals') !== -1);
}

// --- add to cart -------------------------------------------------------------
console.log('\nADDING A REAL APPLIANCE (behaviour preserved)');
{
  const S = sandbox(boot([]));
  call(S, 'addToCart("W-105G");');
  ok('7. a real card adds exactly one line', call(S, 'state.cart.length') === 1);
  const l = call(S, 'state.cart[0]');
  ok('   real item ID', l.itemId === 'W-105G');
  ok('   real price copied to unitPrice and listPrice', l.unitPrice === 295 && l.listPrice === 295);
  ok('   quantity 1', l.qty === 1);
  const t = call(S, 'cartTotals()');
  ok('   totals derive from the real item', t.sub === 295 && t.count === 1, '$' + t.sub);
  call(S, 'renderCart();');
  const html = S.__els['#cartLines'].innerHTML;
  ok('   cart shows real brand and model', html.indexOf('GE APPLIANCES HTW240ASK6WS') !== -1);
  ok('   cart shows the real item id', html.indexOf('W-105G') !== -1);
  ok('   cart shows the real price', html.indexOf('$295.00') !== -1);
  ok('9. cart thumbnail uses the real photo', html.indexOf(LH + 'aaa') !== -1);
  ok('9. real thumb wires the onerror fallback', html.indexOf('edpPhotoFallback(this)') !== -1);
  call(S, 'addToCart("W-0540");');
  call(S, 'renderCart();');
  ok('9. a record with no photo falls back to the drawn placeholder',
    S.__els['#cartLines'].innerHTML.indexOf('data:image/svg+xml') !== -1);

  call(S, 'addToCart("W-105G");');
  ok('   adding the same appliance again increments qty, no duplicate line',
    call(S, 'state.cart.length') === 2 && call(S, 'state.cart[0].qty') === 2);
  ok('   totals follow the increment', call(S, 'cartTotals()').sub === 295 * 2 + 235);
}

// --- refusals ----------------------------------------------------------------
console.log('\nREFUSALS');
{
  const S = sandbox(boot([]));
  call(S, 'addToCart("EDP-10241");');
  ok('an unknown id is refused', call(S, 'state.cart.length') === 0);
  call(S, 'addToCart("");');
  ok('an empty id is refused', call(S, 'state.cart.length') === 0);
  call(S, 'state.inventory.push({itemId:"X-1",brand:"B",model:"M",category:"Washer",' +
          'description:"d",price:10,condition:"USED",availability:"SOLD",qty:0,location:"",' +
          'serialPlaceholder:"[ SERIAL PLACEHOLDER ]",photoKey:"washer"});');
  call(S, 'addToCart("X-1");');
  ok('a non-sellable (SOLD) item is refused', call(S, 'state.cart.length') === 0);
}

// --- removal -----------------------------------------------------------------
console.log('\nREMOVAL (behaviour preserved)');
{
  const S = sandbox(boot([]));
  call(S, 'addToCart("W-105G"); addToCart("W-0540");');
  ok('8. two real lines present', call(S, 'state.cart.length') === 2);
  ok('   totals before removal', call(S, 'cartTotals()').sub === 530);
  call(S, 'state.cart.splice(0, 1);');
  ok('8. removing the first line leaves the correct one',
    call(S, 'state.cart.length') === 1 && call(S, 'state.cart[0].itemId') === 'W-0540');
  ok('8. totals recompute after removal', call(S, 'cartTotals()').sub === 235, '$' + call(S, 'cartTotals()').sub);
  call(S, 'state.cart.splice(0, 1);');
  const t = call(S, 'cartTotals()');
  ok('   emptying the cart returns every total to zero',
    t.sub === 0 && t.warr === 0 && t.tax === 0 && t.total === 0 && t.count === 0);
  call(S, 'renderCart();');
  ok('11. empty cart shows its empty state',
    S.__els['#cartLines'].innerHTML.indexOf('No items yet') !== -1);
}

// --- safety ------------------------------------------------------------------
console.log('\nSAFETY INVARIANTS');
{
  const S = sandbox(boot([]));
  call(S, 'addToCart("W-105G"); renderCart();');
  ok('Complete Sale remains disabled with a real item in the cart',
    S.__els['#btnCompleteSale'].disabled === true);
  ok('cost_basis appears nowhere in the client', !/cost_basis|costBasis/.test(js));
  ok('no spreadsheet id in the client', !/117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI/.test(js));
  ok('no write verb in the client',
    !/setValue|appendRow|Values\.update|Values\.append|setProperty/.test(js));
  ok('tax still uses the MOCK placeholder rate, unchanged',
    /CFG\.taxRate/.test(js) && !/0\.0975/.test(js));
}

console.log('\n' + '='.repeat(48));
console.log(`  TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(48));
if (require.main === module && fail) process.exit(1);
