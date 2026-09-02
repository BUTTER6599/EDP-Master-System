const { chromium } = require('playwright'); const path=require('path');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const p=await b.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
await p.goto('file://'+path.join(__dirname,'iso.html'));
await p.waitForTimeout(400);
console.log('done');await b.close();})();
