// DERIVED FROM test/recovery-snapshot/build-preview.cjs — DO NOT EDIT THE SNAPSHOT.
// Differs from the preserved evidence in exactly two ways: path resolution,
// and a Package 8 one-line pin of ACTIVE_DATA_SOURCE to 'MOCK'. All other
// logic is byte-identical. Template resolver + server evaluator.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = process.argv[2] || require('path').resolve(__dirname,'..','..'), OUT = process.argv[3] || require('path').join(require('./outdir.cjs'),'preview.html');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

// Evaluate the server files to produce the real bootstrap payload.
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext([read('Config.gs'), read('MockData.gs'), read('Validation.gs'), read('DataSource.gs'), read('InventoryQuery.gs'), read('Code.gs')].join('\n'), sandbox);
  // Package 8: pin the source this suite exercises. These suites test MOCK
  // data behaviour, so they must state that precondition rather than inherit
  // whatever ACTIVE_DATA_SOURCE ships as. Pinning changes no assertion.
vm.runInContext("ACTIVE_DATA_SOURCE = 'MOCK';", sandbox);
const bootJson = vm.runInContext('getBootstrapJson()', sandbox);

// NOTE: use function replacements. A plain string replacement would let
// $$ / $' / $& inside the payload be interpreted as replacement patterns.
let html = read('Index.html')
  .replace(/<\?!=\s*include\('Styles'\);\s*\?>/, () => read('Styles.html'))
  .replace(/<\?!=\s*include\('Scripts'\);\s*\?>/, () => read('Scripts.html'))
  .replace(/<\?!=\s*bootJson\s*\?>/, () => bootJson);

if (/<\?/.test(html)) throw new Error('Unresolved Apps Script scriptlet remains in output');
fs.writeFileSync(OUT, html);
console.log('boot payload bytes :', bootJson.length);
console.log('preview bytes      :', html.length);
console.log('inventory items    :', JSON.parse(bootJson).inventory.length);
console.log('activity events    :', JSON.parse(bootJson).activity.length);
