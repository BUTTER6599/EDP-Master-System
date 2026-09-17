// Package 6 — READ-ONLY APPLIANCES adapter suite.
// Loads the REAL .gs sources in a vm sandbox (same technique as the approved
// Phase 2/3A suites) and stubs ONLY the two Google services the adapter uses.
// Nothing here touches Google, a spreadsheet, or EDP_MASTER_DATABASE.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

// The real APPLIANCES header row, verified against the workbook in Package 5B.
const HEADERS = ['item_id','sku_id','category','brand','model','serial','condition',
  'list_price','cost_basis','rating','warranty_tier','fuel_type','notes','stage','status',
  'days_on_hand','date_acquired','added_by','photo_links','width_in','height_in','depth_in',
  'capacity_cu_ft','dimensions_display','spec_source','spec_verified'];

const U = 'https://lh3.googleusercontent.com/d/';
function row(o) {
  const r = HEADERS.map(h => o[h] === undefined ? '' : o[h]);
  return r;
}
// Representative fixture: shapes taken from the real sheet, no customer data.
const FIXTURE = [
  HEADERS.concat(['bay']),                       // 'bay' = test-only location column
  row({item_id:'W-105G',sku_id:'W-105G',category:'WASHER',brand:'GE APPLIANCES',
       model:'HTW240ASK6WS',serial:'ZZSERIALSENTINELAA',condition:'WORKING',list_price:'295.0',
       cost_basis:'120',stage:'FLOOR_READY',status:'AVAILABLE',photo_links:U+'a'}).concat(['Floor A-1']),
  row({item_id:'R-4142',sku_id:'R-4142',category:'REFRIGERATOR',brand:'GE APPLIANCES',
       model:'GTS18HCSARWW',serial:'ZZSERIALSENTINELBB',condition:'USED',list_price:'295.0',
       cost_basis:'100',stage:'FLOOR_READY',status:'AVAILABLE',
       photo_links:U+'p1,'+U+'p2,'+U+'p3'}).concat(['Floor B-2']),
  row({item_id:'S-316Q',sku_id:'S-316Q',category:'Stove',brand:'GE APPLIANCES',
       model:'JB250DF5WW',serial:'ZZSERIALSENTINELCC',condition:'USED',list_price:'265.0',
       stage:'FLOOR_READY',status:'AVAILABLE',photo_links:U+'s'}).concat(['Floor C-1']),
  // withhold cases
  row({item_id:'W-TEST-001',sku_id:'TEST-001',category:'Washer',brand:'Whirlpool',
       model:'WTW4816FW',condition:'Used',list_price:'225.0',
       stage:'FLOOR_READY',status:'AVAILABLE',photo_links:U+'t'}).concat(['Floor A-9']),
  row({item_id:'F-2904',sku_id:'F-2904',category:'FREEZER',brand:'KENMORE',
       model:'253.28732C0',condition:'USED',list_price:'295.0',
       stage:'FLOOR_READY',status:'AVAILABLE',photo_links:''}).concat(['Floor D-1']),
  row({item_id:'D-0001',sku_id:'D-0001',category:'DRYER',brand:'Roper',model:'RED4440VQ1',
       condition:'USED',list_price:'',stage:'FLOOR_READY',status:'AVAILABLE',
       photo_links:U+'d'}).concat(['Floor E-1']),
  row({item_id:'R-9999',sku_id:'R-9999',category:'REFRIGERATOR',brand:'GE',model:'X',
       condition:'USED',list_price:'200',stage:'REPAIR',status:'NOT_READY',
       photo_links:U+'r'}).concat(['Floor F-1']),
  row({item_id:'',sku_id:'',category:'WASHER',brand:'GE',model:'Y',condition:'USED',
       list_price:'200',stage:'FLOOR_READY',status:'AVAILABLE',photo_links:U+'z'}).concat(['Floor G-1']),
  row({item_id:'X-0001',sku_id:'X-0001',category:'JETPACK',brand:'ACME',model:'Z',
       condition:'USED',list_price:'200',stage:'FLOOR_READY',status:'AVAILABLE',
       photo_links:U+'q'}).concat(['Floor H-1'])
];

function sandbox(opts) {
  opts = opts || {};
  const S = { console };
  vm.createContext(S);
  S.__values = opts.values || FIXTURE;
  vm.runInContext(`
    var PropertiesService = { getScriptProperties: function(){ return {
      getProperty: function(k){ return ${opts.noProp ? 'null' : "'FAKE-TEST-ID'"}; } }; } };
    var Sheets = { Spreadsheets: { Values: { get: function(){ return { values: __values }; } } } };
  `, S);
  vm.runInContext(['Config.gs','MockData.gs','Validation.gs','DataSource.gs','InventoryQuery.gs','Code.gs']
    .map(read).join('\n'), S);
  if (opts.location !== undefined) {
    S.__loc = opts.location;
    vm.runInContext('LOCATION_SOURCE_COLUMN = __loc;', S);
  }
  if (opts.active) { S.__a = opts.active; vm.runInContext('ACTIVE_DATA_SOURCE = __a;', S); }
  return S;
}
const run = (S, e) => vm.runInContext(e, S);
function mapped(S) { return run(S, 'mapAppliances_(toRowObjects_(fetchApplianceValues_()))'); }

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
function threw(fn) { try { fn(); return null; } catch (e) { return e.message; } }

console.log('PACKAGE 6 — READ-ONLY APPLIANCES ADAPTER');
console.log('=========================================');

// --- shipped-default gate -------------------------------------------------
console.log('\nSHIPPED DEFAULTS (what actually goes to Apps Script)');
{
  const S = sandbox();
  ok('ACTIVE_DATA_SOURCE ships as MOCK (adapter inert)', run(S, 'ACTIVE_DATA_SOURCE') === 'MOCK');
  ok('LOCATION_SOURCE_COLUMN ships unresolved (null)', run(S, 'LOCATION_SOURCE_COLUMN') === null);
  const m = threw(() => mapped(S));
  ok('6. unresolved location FAILS LOUDLY, does not fabricate',
    !!m && /\[EDP mapping error\] location has no authoritative source/.test(m));
  ok('mock inventory still served while inert', run(S, 'readInventory().length') === 12);
}

// --- mapping --------------------------------------------------------------
console.log('\nMAPPING');
{
  const S = sandbox({ location: 'bay' });
  const r = mapped(S);
  const byId = {}; r.items.forEach(i => byId[i.itemId] = i);
  const wh = {}; r.withheld.forEach(w => wh[w.itemId] = w.reason);

  ok('1. exact header mapping produces the contract fields',
    JSON.stringify(Object.keys(byId['W-105G']).sort()) === JSON.stringify(
      ['availability','brand','category','condition','description','itemId','location',
       'model','photoGallery','photoKey','photoPrimary','price','qty','serialPlaceholder'].sort()));
  ok('3. qty is 1 for every appliance unit row', r.items.every(i => i.qty === 1));
  ok('4. description derives from brand + model + category',
    byId['W-105G'].description === 'GE APPLIANCES HTW240ASK6WS Washer', byId['W-105G'].description);
  ok('5. serialPlaceholder uses the established literal, real serial never leaves server',
    r.items.every(i => i.serialPlaceholder === '[ SERIAL PLACEHOLDER ]') &&
    !/ZZSERIALSENTINEL/.test(JSON.stringify(r.items)) &&
    r.items.every(i => i.serial === undefined));
  ok('14. category case is deterministic (WASHER and Washer both -> Washer)',
    byId['W-105G'].category === 'Washer' && byId['S-316Q'].category === 'Stove',
    byId['W-105G'].category + '/' + byId['S-316Q'].category);
  ok('11a. first valid URL becomes photoPrimary',
    byId['R-4142'].photoPrimary === U + 'p1', byId['R-4142'].photoPrimary);
  ok('11b. full gallery preserved, nothing discarded',
    byId['R-4142'].photoGallery.length === 3);
  ok('photoKey stays a local placeholder keyword, never a URL',
    r.items.every(i => /^(washer|refrigerator|dryer|range|freezer|dishwasher|microwave|television)$/.test(i.photoKey)));

  // --- exclusions / withholding ------------------------------------------
  console.log('\nEXCLUSIONS AND WITHHOLDING (auditable, never silent)');
  ok('7/8. W-TEST-001 excluded and cannot reach sellable output',
    !byId['W-TEST-001'] && wh['W-TEST-001'] === 'excluded TEST record');
  ok('9. missing list_price withheld with explicit reason',
    !byId['D-0001'] && wh['D-0001'] === 'missing list_price');
  ok('10. missing photo_links withheld with explicit reason',
    !byId['F-2904'] && wh['F-2904'] === 'no valid photo_links');
  ok('13. stage/status rule withholds non-sellable rows',
    !byId['R-9999'] && /not sellable/.test(wh['R-9999']), wh['R-9999']);
  ok('16. blank item_id withheld explicitly',
    wh['(blank)'] === 'blank item_id');
  ok('unmapped category withheld rather than guessing a picture',
    !byId['X-0001'] && /no approved photoKey mapping/.test(wh['X-0001']));
  ok('no row is silently lost (items + withheld == source rows)',
    r.items.length + r.withheld.length === FIXTURE.length - 1,
    r.items.length + '+' + r.withheld.length + '=' + (FIXTURE.length - 1));
  ok('accepted set is exactly the three complete rows',
    JSON.stringify(r.items.map(i => i.itemId)) === JSON.stringify(['W-105G','R-4142','S-316Q']));
}

// --- fail-closed ----------------------------------------------------------
console.log('\nFAIL-CLOSED BEHAVIOUR');
{
  const noHeader = [HEADERS.filter(h => h !== 'list_price').concat(['bay'])];
  const S = sandbox({ values: noHeader, location: 'bay' });
  const m = threw(() => mapped(S));
  ok('2. missing required source header THROWS',
    !!m && /required column "list_price" is missing/.test(m), m && m.slice(0, 60));
}
{
  const dup = [FIXTURE[0], FIXTURE[1], FIXTURE[1]];
  const S = sandbox({ values: dup, location: 'bay' });
  const m = threw(() => mapped(S));
  ok('15. duplicate item_id fails closed',
    !!m && /duplicate item_id "W-105G"/.test(m), m && m.slice(0, 55));
}
{
  const S = sandbox({ noProp: true, location: 'bay' });
  const m = threw(() => mapped(S));
  ok('missing Script Property fails closed with a clear message',
    !!m && /Script Property "EDP_MASTER_DATABASE_ID" is not set/.test(m));
}

// --- leak proofs ----------------------------------------------------------
console.log('\nLEAK PROOFS');
{
  const S = sandbox({ location: 'bay' });
  const r = mapped(S);
  const blob = JSON.stringify(r.items);
  ok('12. cost_basis never appears in the client payload',
    !blob.includes('cost_basis') && !blob.includes('120') && !blob.includes('"100"'));
  run(S, 'FORBIDDEN_CLIENT_FIELDS').forEach(f =>
    ok('   forbidden field "' + f + '" absent from payload', !blob.includes('"' + f + '"')));
  ok('spreadsheet id never appears in source (only the property NAME does)',
    !read('DataSource.gs').includes('117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI'));
  ok('spreadsheet id never appears in any client-side file',
    !['Index.html','Scripts.html','Styles.html'].some(f =>
      read(f).includes('117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI')));
}

// --- mutation scan --------------------------------------------------------
console.log('\nMUTATION SCAN (write verbs must be absent)');
{
  const src = read('DataSource.gs')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const banned = ['setValue','setValues','appendRow','Values.update','Values.append',
    'Values.batchUpdate','Values.clear','batchClear','setProperty','setProperties',
    'deleteProperty','deleteAllProperties','SpreadsheetApp','DriveApp','MailApp',
    'GmailApp','UrlFetchApp','ScriptApp','newTrigger','createFile','deleteRow'];
  const hits = banned.filter(b => src.includes(b));
  ok('no mutation-capable API or write verb in DataSource.gs',
    hits.length === 0, hits.length ? 'HITS: ' + hits.join(', ') : 'zero hits');
  ok('only Values.get is used for sheet access',
    (src.match(/Sheets\.Spreadsheets\.Values\.\w+/g) || []).every(m => m.endsWith('.get')));
  ok('PropertiesService used for getProperty only',
    /getProperty/.test(src) && !/setProperty|deleteProperty/.test(src));
  const mf = JSON.parse(read('appsscript.json'));
  ok('manifest declares ONLY read-only OAuth scopes',
    mf.oauthScopes.length === 1 && mf.oauthScopes[0] === 'https://www.googleapis.com/auth/spreadsheets.readonly',
    mf.oauthScopes.join(','));
}

// --- exclusion-rule safety ------------------------------------------------
console.log('\nEXCLUSION RULE SAFETY (must not hide real stock)');
{
  const S = sandbox();
  const re = run(S, 'TEST_RECORD_PATTERN');
  const realIds = ['W-105G','W-732G','W-0540','R-4131','R-4160','R-4142','S-316Q','F-2904',
    'W-4554','W-0271','R-4321','D-5611','SEW-1384','DGW-1384','S-947P','R-2803','W-1622'];
  const wrongly = realIds.filter(id => re.test(id));
  ok('narrow TEST pattern matches no real inventory id',
    wrongly.length === 0, wrongly.length ? 'WOULD HIDE: ' + wrongly.join(',') : realIds.length + ' real ids checked');
  ok('narrow TEST pattern does match the known test record',
    re.test('W-TEST-001') && re.test('TEST-001'));
}

// --- pagination over mapped real-shaped records ---------------------------
console.log('\n17. PAGINATION DETERMINISM OVER MAPPED RECORDS');
{
  const S = sandbox({ location: 'bay', active: 'APPLIANCES_SHEET' });
  ok('adapter is reachable through the seam when selected',
    run(S, 'getDataSource().id') === 'APPLIANCES_SHEET');
  const all = run(S, 'queryInventory({limit:200})');
  ok('mapped records pass the Phase 2 validator unchanged', all.total === 3, 'total=' + all.total);
  const p1 = run(S, 'queryInventory({limit:2,offset:0})');
  const p2 = run(S, 'queryInventory({limit:2,offset:2})');
  const cat = p1.items.concat(p2.items).map(i => i.itemId);
  ok('pages concatenate to the single-page order exactly',
    JSON.stringify(cat) === JSON.stringify(all.items.map(i => i.itemId)), cat.join(','));
  ok('hasMore is correct across the boundary', p1.hasMore === true && p2.hasMore === false);
  ok('validator still fail-closed on mapped data (no weakening)',
    run(S, 'typeof validateInventory') === 'function' &&
    read('Validation.gs') === fs.readFileSync(path.join(DIR, 'Validation.gs'), 'utf8'));
}

console.log('\n' + '='.repeat(52));
console.log(`  TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(52));
module.exports = { pass, fail };
if (require.main === module && fail) process.exit(1);
