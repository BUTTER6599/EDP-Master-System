const {chromium}=require('playwright');const path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const p=await b.newPage();
  await p.goto('file://'+path.join(__dirname,'preview.html'));
  await p.waitForTimeout(500);
  console.log('  typeof google            :', await p.evaluate(()=>typeof google));
  console.log('  google.script.run present:', await p.evaluate(()=>typeof google!=='undefined'&&!!(google.script&&google.script.run)));
  console.log('  EDP_BOOT.inventory length:', await p.evaluate(()=>window.EDP_BOOT.inventory.length));
  console.log('  queryInventory in browser:', await p.evaluate(()=>typeof window.queryInventory));
  console.log('  readInventory in browser :', await p.evaluate(()=>typeof window.readInventory));
  await b.close();
})();
