const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = process.argv[2], OUT = process.argv[3];
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

// Evaluate the server files to produce the real bootstrap payload.
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext([read('Config.gs'), read('MockData.gs'), read('Validation.gs'), read('DataSource.gs'), read('InventoryQuery.gs'), read('Code.gs')].join('\n'), sandbox);
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
