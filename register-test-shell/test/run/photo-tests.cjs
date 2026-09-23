// Package 9 — real appliance photo resolution.
// Extracts the REAL client functions from Scripts.html and exercises them, so
// the suite tests shipped code rather than a re-implementation.
// Touches no Google service, no spreadsheet, no network.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(DIR, 'Scripts.html'), 'utf8');

// Pull the shipped photo-resolution code out verbatim.
const start = src.indexOf("var PHOTO_HOST =");
const end   = src.indexOf("function photoFallback");
if (start < 0 || end < 0 || end <= start) {
  console.log('  FAIL  could not locate the photo resolver in Scripts.html');
  console.log('  TOTAL: 0 passed, 1 failed');
  process.exit(1);
}
const S = { console };
vm.createContext(S);
vm.runInContext(src.slice(start, end), S);
const directPhotoUrl = (u) => { S.__u = u; return vm.runInContext('directPhotoUrl(__u)', S); };
const realPhotoFor   = (i) => { S.__i = i; return vm.runInContext('realPhotoFor(__i)', S); };

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const LH = 'https://lh3.googleusercontent.com/d/';
const DIRECT  = LH + '1g92OnODlK-qr84VFCA4BcwkjX3Nx695u';
const SIZED   = LH + '1HiPZAYutanioUegPqcoAIALYzQ4pWKMV=w2000';
const VIEWER  = 'https://drive.google.com/file/d/15bKRAF8S4J_fbuMsTVqd99o7f0Wkn6m8/view?usp=drivesdk';
const VIEWER_ID = '15bKRAF8S4J_fbuMsTVqd99o7f0Wkn6m8';

console.log('PACKAGE 9 — REAL APPLIANCE PHOTO RESOLUTION');
console.log('===========================================');

console.log('\nURL NORMALISATION');
ok('direct lh3 URL passes through unchanged', directPhotoUrl(DIRECT) === DIRECT);
ok('sized lh3 URL (=w2000) passes through unchanged', directPhotoUrl(SIZED) === SIZED);
ok('Drive viewer page normalises to a direct image URL',
  directPhotoUrl(VIEWER) === LH + VIEWER_ID, directPhotoUrl(VIEWER));
ok('normalised URL is NOT still a viewer page', !/drive\.google\.com/.test(directPhotoUrl(VIEWER)));
ok('surrounding whitespace is tolerated', directPhotoUrl('  ' + DIRECT + '  ') === DIRECT);

console.log('\nREFUSED INPUTS (never point an <img> at these)');
[['empty string', ''], ['null', null], ['undefined', undefined],
 ['the literal text TAYLOR', 'TAYLOR'],
 ['plain http (not https)', 'http://lh3.googleusercontent.com/d/abc'],
 ['an unapproved host', 'https://evil.example.com/d/abc.png'],
 ['a host that merely contains the approved name', 'https://lh3.googleusercontent.com.evil.com/d/abc'],
 ['a Drive folder link', 'https://drive.google.com/drive/folders/1vEqq9haEBJHiYcqgkekubiwTblYlxFAV'],
 ['a javascript: URI', 'javascript:alert(1)'],
 ['a data: URI', 'data:image/svg+xml,<svg/>']
].forEach(([label, val]) => ok('refuses ' + label, directPhotoUrl(val) === '', JSON.stringify(directPhotoUrl(val))));

console.log('\nPER-RECORD SELECTION');
ok('picks the first direct URL in the gallery',
  realPhotoFor({ photoGallery: [DIRECT, SIZED], photoPrimary: DIRECT }) === DIRECT);
ok('skips a leading unusable entry and takes the next usable one',
  realPhotoFor({ photoGallery: ['TAYLOR', SIZED], photoPrimary: 'TAYLOR' }) === SIZED);
ok('normalises when EVERY gallery entry is a viewer page (S-316Q / W-4554 case)',
  realPhotoFor({ photoGallery: [VIEWER], photoPrimary: VIEWER }) === LH + VIEWER_ID);
ok('falls back to photoPrimary when the gallery is empty',
  realPhotoFor({ photoGallery: [], photoPrimary: SIZED }) === SIZED);
ok('returns empty when the record has no photos at all (F-2904 shape)',
  realPhotoFor({ photoGallery: [], photoPrimary: '' }) === '');
ok('returns empty when every photo is unusable',
  realPhotoFor({ photoGallery: ['TAYLOR', 'nope'], photoPrimary: 'TAYLOR' }) === '');
ok('survives a record with no photo fields at all', realPhotoFor({}) === '');
ok('survives undefined', realPhotoFor(undefined) === '');

console.log('\nRENDERING CONTRACT IN Scripts.html');
ok('card emits the real photo when one exists', /real \? esc\(real\) : photoUri\(it, 400, 300\)/.test(src));
ok('onerror fallback is wired to the drawn placeholder', /onerror="edpPhotoFallback\(this\)"/.test(src));
ok('fallback handler is guarded against an infinite loop', /data-fellback/.test(src));
ok('"Photo placeholder" label is hidden when a real photo is used',
  /'<span class="ph"' \+ \(real \? ' hidden' : ''\)/.test(src));
ok('photoUri() is retained as the fallback, not deleted', /function photoUri\(/.test(src));
ok('no card can emit an empty src (fallback always supplies one)',
  !/src="" /.test(src) && /: photoUri\(it, 400, 300\)/.test(src));

console.log('\nSUMMARY LABEL');
ok('the misleading "mock items shown" string is gone', !/mock items shown/.test(src));
ok('label is driven by the active data source', /dataSourceLabel/.test(src));
ok('label defaults to neutral wording before the source is known',
  /var dataSourceLabel = 'items';/.test(src));
ok('source is read via the existing read-only getDataSourceInfo',
  /\.getDataSourceInfo\(\)/.test(src));
ok('a failed source lookup leaves the neutral wording',
  /withFailureHandler\(function \(\) \{ \/\* neutral wording stands \*\//.test(src));

console.log('\nSECURITY / READ-ONLY PROTECTIONS STILL INTACT');
ok('client never references cost_basis', !/cost_basis|costBasis/.test(src));
ok('client contains no spreadsheet id', !/117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI/.test(src));
ok('Complete Sale still hard-disabled on every cart render',
  /btn\.disabled = true;/.test(src));
ok('no write verb appears in the client',
  !/setValue|appendRow|Values\.update|Values\.append|setProperty/.test(src));

console.log('\n' + '='.repeat(48));
console.log(`  TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(48));
if (require.main === module && fail) process.exit(1);
