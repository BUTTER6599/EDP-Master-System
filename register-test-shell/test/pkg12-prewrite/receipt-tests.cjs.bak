// Package 11 — ONE receipt model + TEST marking + print hand-off.
// Loads the REAL client logic out of Scripts.html into a sandbox with a minimal
// DOM stub, so the suite exercises shipped code, not a re-implementation.
// Touches no Google service, no spreadsheet, no printer, no network.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.resolve(__dirname, '..', '..');
const src   = fs.readFileSync(path.join(DIR, 'Scripts.html'), 'utf8');
const css   = fs.readFileSync(path.join(DIR, 'Styles.html'), 'utf8');
const index = fs.readFileSync(path.join(DIR, 'Index.html'), 'utf8');
const js  = (src.match(/<script>([\s\S]*)<\/script>/) || [])[1] || '';

// Source bans below must be checked against CODE, not against the comments
// that DOCUMENT those bans. Three of this file's first-run failures were
// exactly that: DataSource.gs's own header says "No setProperty", and
// Scripts.html's own header says "No fetch/XHR/WebSocket". Stripping
// comments does not weaken the assertion - it aims it at the thing that can
// actually execute. The stripper is itself asserted in section 8 before any
// ban relies on it.
function stripComments(s) {
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // block comments
    .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');  // line comments, but not a URL scheme
}

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

// --- minimal DOM / host stubs ------------------------------------------------
function makeEl() {
  const el = { textContent: '', innerHTML: '', hidden: false, disabled: false,
    dataset: {}, attrs: {}, children: [], classes: [] };
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  el.getAttribute = k => (k in el.attrs ? el.attrs[k] : null);
  el.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
  el.querySelector = () => null;
  el.querySelectorAll = () => [];
  el.addEventListener = (evt, fn) => { (el.handlers = el.handlers || {})[evt] = fn; };
  el.closest = () => null;
  return el;
}
const BODY = (function () {
  const b = js;
  const open = b.indexOf('(function () {');
  const close = b.lastIndexOf('})();');
  if (open < 0 || close < 0) { throw new Error('could not unwrap the client IIFE'); }
  return b.slice(open + '(function () {'.length, close);
})();

function sandbox(bootstrap, hostOpts) {
  const opts = hostOpts || {};
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
  S.__printCalls = 0;
  if (opts.printThrows) {
    S.print = () => { S.__printCalls += 1; throw new Error('blocked by frame sandbox'); };
  } else if (opts.noPrint) {
    S.print = undefined;
  } else {
    S.print = () => { S.__printCalls += 1; };
  }
  S.setInterval = () => 0; S.setTimeout = () => 0; S.clearInterval = () => {};
  S.EDP_BOOT = bootstrap;
  vm.createContext(S);
  try { vm.runInContext(BODY, S); } catch (e) { S.__bootError = e; }
  return S;
}
function call(S, expr) { return vm.runInContext(expr, S); }

// --- fixtures ----------------------------------------------------------------
const LH = 'https://lh3.googleusercontent.com/d/';
// Non-colliding sentinels: none of these strings can appear as a substring of a
// brand, model, id or price. A private field leaking onto a receipt must be
// detectable without a coincidental match (the Package 6 lesson).
const SENTINEL = {
  cost_basis: 'ZZCOSTSENTINELAA',
  serial: 'ZZSERIALSENTINELAA',
  notes: 'ZZNOTESSENTINELAA',
  added_by: 'ZZADDEDBYSENTINELAA'
};
const REAL = [
  { itemId: 'W-105G', category: 'Washer', brand: 'GE APPLIANCES', model: 'HTW240ASK6WS',
    description: 'GE APPLIANCES HTW240ASK6WS Washer', price: 295, condition: 'WORKING',
    availability: 'AVAILABLE', qty: 1, location: '', serialPlaceholder: '[ SERIAL PLACEHOLDER ]',
    photoKey: 'washer', photoPrimary: LH + 'aaa', photoGallery: [LH + 'aaa'],
    // deliberately contaminated, to prove the receipt allowlist is a real barrier
    cost_basis: SENTINEL.cost_basis, serial: SENTINEL.serial,
    notes: SENTINEL.notes, added_by: SENTINEL.added_by },
  { itemId: 'W-0540', category: 'Washer', brand: 'MAYTAG', model: 'MVW6230HW0',
    description: 'MAYTAG MVW6230HW0 Washer', price: 235, condition: 'USED',
    availability: 'AVAILABLE', qty: 1, location: '', serialPlaceholder: '[ SERIAL PLACEHOLDER ]',
    photoKey: 'washer', photoPrimary: '', photoGallery: [] }
];
const WARR = [{ id: 'W-ASIS', label: 'As-Is', days: 0, price: 0 },
              { id: 'W-30', label: '30-Day', days: 30, price: 0 },
              { id: 'W-90', label: '90-Day', days: 90, price: 49 }];
function cfg(features) {
  return { taxRate: 0.0945, taxLabel: 'Sales Tax (MOCK)', currency: 'USD', locale: 'en-US',
    environment: 'TEST', buildVersion: '0.1.0',
    companyShort: 'Electronics Depot', companyName: 'The Electronics Depot LLC',
    storeAddress: '[ STORE ADDRESS PLACEHOLDER ]', storePhone: '[ STORE PHONE PLACEHOLDER ]',
    storeFooter: '[ RETURN / WARRANTY POLICY TEXT PLACEHOLDER ]',
    features: features || { COMPLETE_SALE_ENABLED: false, PRINTER_ENABLED: false },
    warrantyOptions: WARR, paymentMethods: [{ id: 'CASH', label: 'Cash' }] };
}
const boot = (features) => ({ config: cfg(features), inventory: REAL, categories: ['Washer'],
  customers: [], activity: [], serverTime: { iso: new Date().toISOString(), epochMs: Date.now() },
  openTicket: { ticketId: 'TXN-MOCK-4471', register: 'R1', cashier: 'T',
                customerId: null, paymentMethodId: 'CASH', lines: [] } });

function withCart(S, cart) { call(S, 'state.cart = ' + JSON.stringify(cart) + ';'); return S; }
const ONE_REAL = [{ itemId: 'W-105G', qty: 1, unitPrice: 295, listPrice: 295, warrantyId: 'W-90' }];

console.log('PACKAGE 11 — RECEIPT MODEL, TEST MARKING, PRINT HAND-OFF');
console.log('=======================================================');

// --- 1. the model exists and is the single source --------------------------
console.log('\n1. ONE RECEIPT MODEL');
{
  const S = sandbox(boot());
  ok('client loaded without error', !S.__bootError, S.__bootError && String(S.__bootError.message));
  ok('buildReceiptModel is defined', typeof call(S, 'buildReceiptModel') === 'function');
  ok('buildEposPrintXml is defined', typeof call(S, 'buildEposPrintXml') === 'function');
  ok('the ticket id starts at the inert default', call(S, 'state.ticketId') === 'TXN-MOCK-0000');
  call(S, 'applyOpenTicket();');
  withCart(S, ONE_REAL);
  const m = call(S, 'buildReceiptModel()');
  ok('model carries the ticket id the page is actually on',
    m.ticketId === 'TXN-MOCK-4471', m.ticketId);
  ok('and it is still the clearly-labelled MOCK id (Package 10 owner decision)',
    /MOCK/.test(m.ticketId));
  ok('model carries a payment label', m.payment && m.payment.label === 'Cash');
  ok('model carries store identity', m.store.company === 'The Electronics Depot LLC');
  ok('model carries build identity', m.build.environment === 'TEST' && m.build.version === '0.1.0');
  ok('model carries one line', m.lines.length === 1, 'lines = ' + m.lines.length);
  ok('line is marked resolved', m.lines[0].resolved === true);
  ok('line total is qty x unit price', m.lines[0].lineTotal === 295, '$' + m.lines[0].lineTotal);
  ok('warranty is resolved onto the line', m.lines[0].warrantyLabel === '90-Day' && m.lines[0].warrantyPrice === 49);
}

// --- 2. screen and receipt totals cannot disagree ---------------------------
console.log('\n2. SCREEN AND RECEIPT AGREE — ALWAYS');
{
  const S = sandbox(boot());
  withCart(S, [
    { itemId: 'W-105G', qty: 2, unitPrice: 295, listPrice: 295, warrantyId: 'W-90' },
    { itemId: 'W-0540', qty: 1, unitPrice: 200, listPrice: 235, warrantyId: 'W-ASIS' }
  ]);
  const t = call(S, 'cartTotals()');
  const m = call(S, 'buildReceiptModel()');
  ok('subtotal matches the cart', m.totals.sub === t.sub, '$' + m.totals.sub + ' vs $' + t.sub);
  ok('warranty matches the cart', m.totals.warranty === t.warr);
  ok('tax matches the cart', m.totals.tax === t.tax);
  ok('total matches the cart', m.totals.total === t.total);
  ok('item count matches the cart', m.totals.itemCount === t.count);
  ok('the receipt computes no tax of its own',
    m.totals.tax === Math.round((m.totals.sub + m.totals.warranty) * 0.0945 * 100) / 100);
  ok('an overridden unit price is what prints, not list price',
    m.lines[1].unitPrice === 200 && m.lines[1].listPrice === 235);
}

// --- 3. unresolved lines: shown, never priced -------------------------------
console.log('\n3. UNRESOLVED LINES ARE SHOWN BUT CANNOT MOVE MONEY');
{
  const S = sandbox(boot());
  withCart(S, [
    { itemId: 'W-105G', qty: 1, unitPrice: 295, listPrice: 295, warrantyId: 'W-ASIS' },
    { itemId: 'GHOST-1', qty: 3, unitPrice: 999, listPrice: 999, warrantyId: 'W-90' }
  ]);
  const m = call(S, 'buildReceiptModel()');
  ok('both lines appear on the receipt', m.lines.length === 2);
  ok('cart order is preserved', m.lines[0].itemId === 'W-105G' && m.lines[1].itemId === 'GHOST-1');
  ok('the ghost line is marked unresolved', m.lines[1].resolved === false);
  ok('the ghost line carries NO price field', m.lines[1].lineTotal === undefined);
  ok('subtotal excludes the ghost ($295, not $3292)', m.totals.sub === 295, '$' + m.totals.sub);
  ok('warranty excludes the ghost (no $147)', m.totals.warranty === 0, '$' + m.totals.warranty);
  ok('the unresolved count is reported', m.totals.unresolvedCount === 1);
  call(S, 'renderReceipt();');
  const html = S.__els['#receipt'].innerHTML;
  ok('the receipt says so in words',
    html.indexOf('UNRESOLVED ITEM — not included in totals') !== -1);
  ok('the ghost id is named, not hidden', html.indexOf('GHOST-1') !== -1);
  ok('no $999 anywhere on the receipt', html.indexOf('999.00') === -1);
}

// --- 4. TEST / NOT A SALE marking -------------------------------------------
console.log('\n4. TEST / NOT A SALE MARKING');
{
  const S = sandbox(boot());
  withCart(S, ONE_REAL);
  const m = call(S, 'buildReceiptModel()');
  ok('model is flagged as a TEST receipt', m.isTest === true);
  ok('the mark reads TEST — NOT A SALE', m.testMark === 'TEST — NOT A SALE', m.testMark);
  call(S, 'renderReceipt();');
  const html = S.__els['#receipt'].innerHTML;
  const marks = html.split('TEST — NOT A SALE').length - 1;
  ok('the mark is rendered TWICE — top and bottom', marks === 2, 'found ' + marks);
  ok('one of them is the bottom mark', html.indexOf('rtestmark bottom') !== -1);
  ok('the mark explains itself', html.indexOf('No sale was recorded') !== -1);
  ok('an EMPTY receipt is still marked',
    (function () {
      const E = sandbox(boot());
      call(E, 'renderReceipt();');
      return E.__els['#receipt'].innerHTML.split('TEST — NOT A SALE').length - 1 === 2;
    })());
  ok('the ePOS text form is marked too, twice, in its ASCII code page form',
    (call(S, 'buildEposPrintXml()').split('TEST - NOT A SALE').length - 1) === 2);
  ok('and the em dash never reaches the thermal code page',
    call(S, 'buildEposPrintXml()').indexOf('\u2014') === -1);
}
{
  // The mark is driven by the flag, not by a separate switch.
  const S = sandbox(boot({ COMPLETE_SALE_ENABLED: true, PRINTER_ENABLED: false }));
  withCart(S, ONE_REAL);
  ok('the mark is tied to COMPLETE_SALE_ENABLED, nothing else',
    call(S, 'buildReceiptModel()').isTest === false);
  call(S, 'renderReceipt();');
  ok('and it disappears only when sales are genuinely enabled',
    S.__els['#receipt'].innerHTML.indexOf('TEST — NOT A SALE') === -1);
}
{
  // Missing/!== true must fail CLOSED, i.e. still print the mark.
  ['{}', '{COMPLETE_SALE_ENABLED:false}', '{COMPLETE_SALE_ENABLED:"true"}',
   '{COMPLETE_SALE_ENABLED:1}', '{COMPLETE_SALE_ENABLED:null}'].forEach(function (f) {
    const S = sandbox(boot());
    call(S, 'CFG.features = ' + f + ';');
    ok('fails CLOSED (still marked TEST) for features = ' + f,
      call(S, 'buildReceiptModel()').isTest === true);
  });
}

// --- 5. no private field can reach a receipt --------------------------------
console.log('\n5. NO PRIVATE FIELD REACHES A PRINTED RECEIPT');
{
  const S = sandbox(boot());
  withCart(S, ONE_REAL);
  const m = call(S, 'buildReceiptModel()');
  const asJson = JSON.stringify(m);
  ['cost_basis', 'serial', 'notes', 'added_by'].forEach(function (k) {
    ok('model drops the ' + k + ' sentinel', asJson.indexOf(SENTINEL[k]) === -1);
    ok('model has no ' + k + ' key on the line', m.lines[0][k] === undefined);
  });
  ok('the placeholder serial IS kept (it is not a real serial)',
    m.lines[0].serialPlaceholder === '[ SERIAL PLACEHOLDER ]');
  call(S, 'renderReceipt();');
  const html = S.__els['#receipt'].innerHTML;
  ['cost_basis', 'serial', 'notes', 'added_by'].forEach(function (k) {
    ok('rendered receipt drops the ' + k + ' sentinel', html.indexOf(SENTINEL[k]) === -1);
  });
  const xml = call(S, 'buildEposPrintXml()');
  ['cost_basis', 'serial', 'notes', 'added_by'].forEach(function (k) {
    ok('ePOS XML drops the ' + k + ' sentinel', xml.indexOf(SENTINEL[k]) === -1);
  });
  ok('the builder never spreads the inventory record',
    !/Object\.assign\(\s*\{\s*\}\s*,\s*it\b/.test(js) && js.indexOf('...it') === -1);
}

// --- 6. ePOS-Print XML is well formed ---------------------------------------
console.log('\n6. ePOS-PRINT XML (BUILT, DELIBERATELY NOT WIRED)');
{
  const S = sandbox(boot());
  withCart(S, ONE_REAL);
  const xml = call(S, 'buildEposPrintXml()');
  ok('declares the ePOS-Print namespace',
    xml.indexOf('xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"') !== -1);
  ok('opens and closes epos-print',
    xml.indexOf('<epos-print') === 0 && /<\/epos-print>$/.test(xml));
  ok('ends the job with a cut', xml.indexOf('<cut type="feed"/>') !== -1);
  ok('carries the item', xml.indexOf('GE APPLIANCES') !== -1);
  ok('carries the total', xml.indexOf('TOTAL') !== -1);
  // tag balance
  const opens = (xml.match(/<(?!\/)[a-z-]+/g) || []).length;
  const closes = (xml.match(/<\/[a-z-]+>/g) || []).length + (xml.match(/\/>/g) || []).length;
  ok('every tag is closed', opens === closes, opens + ' open vs ' + closes + ' closed');
}
{
  // Escaping: a hostile-looking brand must not break the document.
  const S = sandbox(boot());
  call(S, 'state.inventory = state.inventory.concat([{itemId:"X-1",brand:"A & B <\\u002ftext>",model:"\\u0022q\\u0022",' +
          'description:"d",condition:"WORKING",availability:"AVAILABLE",qty:1,price:10,location:"",' +
          'serialPlaceholder:"[ SERIAL PLACEHOLDER ]",photoKey:"washer",photoPrimary:"",photoGallery:[]}]);');
  withCart(S, [{ itemId: 'X-1', qty: 1, unitPrice: 10, listPrice: 10, warrantyId: 'W-ASIS' }]);
  const xml = call(S, 'buildEposPrintXml()');
  ok('& is escaped', xml.indexOf('&amp;') !== -1);
  ok('< is escaped', xml.indexOf('&lt;') !== -1);
  ok('a closing tag injected through data does NOT appear raw',
    xml.split('</text>').length - 1 === 1, 'found ' + (xml.split('</text>').length - 1) + ' closing text tags');
}
{
  // Column discipline: no printed row may exceed the roll width.
  const S = sandbox(boot());
  withCart(S, [
    { itemId: 'W-105G', qty: 2, unitPrice: 295, listPrice: 295, warrantyId: 'W-90' },
    { itemId: 'GHOST-1', qty: 1, unitPrice: 999, listPrice: 999, warrantyId: 'W-90' }
  ]);
  ok('eposRow right-aligns and never exceeds 42 columns',
    call(S, 'eposRow("Subtotal","$1,234.56").length') === 43);
  ok('eposRow truncates the LABEL, never the amount',
    call(S, 'eposRow(new Array(99).join("x"),"$9.99")').indexOf('$9.99') !== -1);
  const xml = call(S, 'buildEposPrintXml()');
  // Capture the payload WITHOUT its tags, and un-escape it, so the measured
  // string is what the printer actually receives.
  const body = (xml.match(/<text>([\s\S]*?)<\/text>/) || ['', ''])[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const long = body.split('\n').filter(l => l.length > 42);
  ok('no line in the job exceeds 42 columns', long.length === 0,
    long.length ? 'longest = ' + Math.max.apply(null, long.map(l => l.length)) : '');
  ok('the unresolved line is in the printed job too', body.indexOf('GHOST-1') !== -1);
  ok('every character is inside the font-A ASCII range',
    !/[^\x0A\x20-\x7E]/.test(body));
  ok('long text wraps on a word boundary, never mid-word',
    body.indexOf('PLACEHOLDE\n') === -1 && body.indexOf('PLACEHOLDER') !== -1);
  ok('eposWrap keeps an unbreakable token inside the roll width',
    call(S, 'eposWrap(new Array(120).join("z"), false)')
      .split('\n').every(function (l) { return l.length <= 42; }));
  ok('eposAscii is length-preserving, so the column maths stays exact',
    call(S, 'eposAscii("a\u2014b\u00B7c\u2019d").length') === 7);
  ok('but the ghost price is not', body.indexOf('999.00') === -1);
}

// --- 7. print hand-off ------------------------------------------------------
console.log('\n7. PRINT IS A HAND-OFF — THE PAGE NEVER TOUCHES THE PRINTER');
{
  const S = sandbox(boot());
  withCart(S, ONE_REAL);
  call(S, 'wire();');
  const btn = S.__els['#btnPrint'];
  ok('#btnPrint has its own handler', btn && btn.handlers && typeof btn.handlers.click === 'function');
  ok('#btnEmail still has a handler', S.__els['#btnEmail'].handlers.click !== undefined);
  ok('#btnReprint still has a handler', S.__els['#btnReprint'].handlers.click !== undefined);
  btn.handlers.click.call(btn);
  ok('pressing Print calls window.print() exactly once', S.__printCalls === 1, 'calls = ' + S.__printCalls);
  ok('the view is switched to the receipt first', call(S, 'state.view') === 'receipt');
  ok('the receipt was re-rendered before printing',
    S.__els['#receipt'].innerHTML.indexOf('GE APPLIANCES') !== -1);
  const act = call(S, 'JSON.stringify(state.activity)');
  ok('the hand-off is logged', act.indexOf('handed to the system print dialog') !== -1);
  ok('logged with status HANDED_OFF', act.indexOf('HANDED_OFF') !== -1);
  ok('the log names the TEST marking', act.indexOf('TEST — NOT A SALE') !== -1);
}
{
  // A blocked print must fail LOUDLY and must not claim success.
  const S = sandbox(boot(), { printThrows: true });
  withCart(S, ONE_REAL);
  call(S, 'wire();');
  S.__els['#btnPrint'].handlers.click.call(S.__els['#btnPrint']);
  const act = call(S, 'JSON.stringify(state.activity)');
  ok('a blocked print is logged as BLOCKED, not as success', act.indexOf('BLOCKED') !== -1);
  ok('and never claims it was handed off', act.indexOf('HANDED_OFF') === -1);
  ok('and tells the operator what to do instead', act.indexOf('Share') !== -1);
}
{
  const S = sandbox(boot(), { noPrint: true });
  withCart(S, ONE_REAL);
  call(S, 'wire();');
  S.__els['#btnPrint'].handlers.click.call(S.__els['#btnPrint']);
  ok('a frame with no window.print is handled, not crashed',
    call(S, 'JSON.stringify(state.activity)').indexOf('BLOCKED') !== -1);
}
{
  ok('Email Receipt is still inert (no mail sender in this build)',
    (function () {
      const S = sandbox(boot());
      call(S, 'wire();');
      S.__els['#btnEmail'].handlers.click.call(S.__els['#btnEmail']);
      return S.__printCalls === 0 &&
             call(S, 'JSON.stringify(state.activity)').indexOf('PENDING') !== -1;
    })());
  ok('Reprint is still inert', (function () {
      const S = sandbox(boot());
      call(S, 'wire();');
      S.__els['#btnReprint'].handlers.click.call(S.__els['#btnReprint']);
      return S.__printCalls === 0;
    })());
}

// --- 8. transport safety: the source itself ---------------------------------
console.log('\n8. SOURCE-LEVEL TRANSPORT SAFETY');
{
  const code = stripComments(js);
  // Validate the stripper before trusting it: real code survives, prose does not.
  ok('stripComments keeps executable code', code.indexOf('function buildReceiptModel()') !== -1);
  ok('stripComments keeps string literals containing ://',
    code.indexOf('http://www.epson-pos.com/schemas/2011/03/epos-print') !== -1);
  ok('stripComments removes the file header prose',
    code.indexOf('SAFETY CONTRACT FOR THIS FILE') === -1);

  ok('no fetch( in client code', !/\bfetch\s*\(/.test(code));
  ok('no XMLHttpRequest in client code', code.indexOf('XMLHttpRequest') === -1);
  ok('no WebSocket in client code', code.indexOf('WebSocket') === -1);
  ok('no printer IP anywhere in the client (code OR comments)', js.indexOf('192.168.') === -1);
  ok('no ePOS endpoint path anywhere in the client (code OR comments)',
    js.indexOf('/cgi-bin/epos') === -1);
  ok('no numeric-host URL anywhere in the client (code OR comments)',
    !/https?:\/\/\d{1,3}\.\d{1,3}\./.test(js));
  ['password', 'passwd', 'credential', 'apikey', 'api_key', 'admin'].forEach(function (w) {
    ok('no "' + w + '" in client code', code.toLowerCase().indexOf(w) === -1);
  });
  // "epson" appears in client code exactly once, as the ePOS-Print XML
  // namespace. A namespace URI is an identifier, not an address: nothing
  // fetches it, and it is not the printer.
  ok('the only "epson" in client code is the ePOS-Print XML namespace',
    (code.toLowerCase().split('epson').length - 1) === 1 &&
    code.indexOf('"http://www.epson-pos.com/schemas/2011/03/epos-print"') !== -1,
    'occurrences = ' + (code.toLowerCase().split('epson').length - 1));
  ok('buildEposPrintXml is DEFINED but never CALLED by the client',
    (code.split('buildEposPrintXml').length - 1) === 1,
    'code occurrences = ' + (code.split('buildEposPrintXml').length - 1));
  ok('the only google.script.run targets are the two read-only reads',
    (code.match(/\.\s*(get[A-Za-z]*)\(\);/g) || []).join(',').indexOf('set') === -1);
}

// --- 9. print stylesheet ----------------------------------------------------
console.log('\n9. THERMAL PRINT STYLESHEET');
{
  const block = (css.match(/@media print \{[\s\S]*?\n\}\n/) || [])[0] || '';
  ok('a print block exists', block.length > 0);
  ok('page chrome is hidden', block.indexOf('.bottomnav') !== -1 && block.indexOf('.actions-col') !== -1);
  ok('the receipt is sized for a 72mm printable roll', /width:\s*72mm/.test(block));
  ok('product photos are suppressed for the thermal head',
    /\.receipt \.ritem \.thumb \{ display: none !important; \}/.test(block));
  ok('the TEST mark is restyled for a monochrome head',
    /\.rtestmark \{[\s\S]*?border: 3px solid #000/.test(block));
  ok('page margins are set for a roll', /@page \{ margin: 3mm; \}/.test(block));
  ok('the TEST mark has a screen style too', /^\.rtestmark \{/m.test(css));
  ok('the receipt panel is not left inside its two-column grid',
    /\.receiptwrap \{ display: block; \}/.test(block));
}

// --- 10. the UI no longer lies ----------------------------------------------
console.log('\n10. THE UI DESCRIBES WHAT ACTUALLY HAPPENS');
{
  ok('the old "Nothing prints" subtitle is gone',
    index.indexOf('Nothing prints, emails, or saves') === -1);
  ok('the old "All three are placeholders" hint is gone',
    index.indexOf('All three are placeholders in this pass') === -1);
  ok('Print is no longer styled as a stub',
    index.indexOf('class="btn stub block" id="btnPrint"') === -1);
  ok('Email is still styled as a stub', index.indexOf('class="btn stub block" id="btnEmail"') !== -1);
  ok('Reprint is still styled as a stub', index.indexOf('class="btn stub block" id="btnReprint"') !== -1);
  ok('the hint tells the operator every receipt is marked',
    index.indexOf('TEST — NOT A SALE') !== -1);
}

// --- 11. the guarantees this package must not weaken ------------------------
console.log('\n11. PACKAGE GUARANTEES STILL HOLD');
{
  const cfgSrc = fs.readFileSync(path.join(DIR, 'Config.gs'), 'utf8');
  ok('COMPLETE_SALE_ENABLED is still false', /COMPLETE_SALE_ENABLED:\s*false/.test(cfgSrc));
  ok('SALES_WRITER_ENABLED is still false', /SALES_WRITER_ENABLED:\s*false/.test(cfgSrc));
  ok('INVENTORY_MUTATION_ENABLED is still false', /INVENTORY_MUTATION_ENABLED:\s*false/.test(cfgSrc));
  ok('PRINTER_ENABLED is still false (no printer call path exists)',
    /PRINTER_ENABLED:\s*false/.test(cfgSrc));
  ok('EMAIL_RECEIPT_ENABLED is still false', /EMAIL_RECEIPT_ENABLED:\s*false/.test(cfgSrc));
  const ds = fs.readFileSync(path.join(DIR, 'DataSource.gs'), 'utf8');
  ok('the data source is still the real APPLIANCES sheet',
    /ACTIVE_DATA_SOURCE\s*=\s*DATA_SOURCES\.APPLIANCES_SHEET/.test(ds));
  ok('no spreadsheet write verb was introduced (checked against CODE)',
    !/\.setValue|\.setValues|\.appendRow|Values\.update|Values\.append|setProperty/
      .test(stripComments(ds)));
  ok('DataSource.gs still documents the write-verb ban in its header',
    /No setProperty\/deleteProperty/.test(ds));
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'appsscript.json'), 'utf8'));
  ok('the manifest is still pinned to spreadsheets.readonly',
    manifest.oauthScopes.length === 1 &&
    manifest.oauthScopes[0] === 'https://www.googleapis.com/auth/spreadsheets.readonly');
  const ignore = fs.readFileSync(path.join(DIR, '.claspignore'), 'utf8');
  ok('the push allowlist is still exactly 10 files',
    (ignore.match(/^!/gm) || []).length === 10, 'entries = ' + (ignore.match(/^!/gm) || []).length);
  ok('the new test suite is NOT in the push allowlist', ignore.indexOf('receipt-tests') === -1);
  ok('Complete Sale is still hard-disabled in the client',
    /btn\.disabled = true;/.test(js) && js.indexOf('#btnCompleteSale') !== -1);
  ok('the Package 10 fail-closed resolver is untouched',
    !/findItem\(l\.itemId\) \|\| \{\}/.test(js));
}

console.log('\n-------------------------------------------------------');
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
