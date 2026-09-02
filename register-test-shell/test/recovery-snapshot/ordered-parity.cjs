const fs=require('fs'),vm=require('vm'),path=require('path');
const DIR='/home/user/EDP-Master-System/register-test-shell';
const read=f=>fs.readFileSync(path.join(DIR,f),'utf8');
const S={console};vm.createContext(S);
vm.runInContext(['Config.gs','MockData.gs','Validation.gs','DataSource.gs','InventoryQuery.gs','Code.gs'].map(read).join('\n'),S);
const run=e=>vm.runInContext(e,S);
function q(o){S.__o=o;return run('queryInventory(__o)');}

const inv=run('getMockInventory()');
// Verbatim re-implementation of Scripts.html filteredInventory() — preserves
// source order exactly as the client renders it.
function clientFilter(searchRaw,category){
  const qq=String(searchRaw||'').trim().toLowerCase();
  return inv.filter(it=>{
    if(category!=='ALL'&&it.category!==category) return false;
    if(!qq) return true;
    return [it.itemId,it.brand,it.model,it.category,it.description,it.condition]
      .join(' ').toLowerCase().indexOf(qq)!==-1;
  }).map(i=>i.itemId);
}

const cats=['ALL',...new Set(inv.map(i=>i.category))];
const terms=['','maytag','LG','samsung','stainless','EDP-104','washer','open box','xyzzy','5','e'];

let setMatch=0,setMismatch=0,ordMatch=0,ordMismatch=0,firstOrd=null;
for(const c of cats) for(const t of terms){
  const client=clientFilter(t,c);
  const server=q({search:t,category:c,limit:200}).items.map(i=>i.itemId);
  // set comparison
  if(JSON.stringify([...client].sort())===JSON.stringify([...server].sort())) setMatch++; else setMismatch++;
  // ORDERED comparison
  if(JSON.stringify(client)===JSON.stringify(server)) ordMatch++;
  else { ordMismatch++; if(!firstOrd) firstOrd={cat:c,term:t,client,server}; }
}

console.log('=================================================');
console.log('A. ORDERED PARITY — client render order vs queryInventory');
console.log('=================================================');
console.log('  combinations tested      :', setMatch+setMismatch);
console.log('  SET parity matches       :', setMatch);
console.log('  SET parity mismatches    :', setMismatch);
console.log('  ORDERED parity matches   :', ordMatch);
console.log('  ORDERED parity mismatches:', ordMismatch);
console.log('');
if(firstOrd){
  console.log('  FIRST ORDERED MISMATCH');
  console.log('    category :', firstOrd.cat);
  console.log('    search   :', JSON.stringify(firstOrd.term));
  console.log('    client order (MockData source order, what cards show today):');
  console.log('      '+firstOrd.client.join(', '));
  console.log('    server order (canonical category/brand/model/itemId sort):');
  console.log('      '+firstOrd.server.join(', '));
  console.log('');
  console.log('  SIDE BY SIDE (first mismatch, position: client -> server)');
  const n=Math.max(firstOrd.client.length,firstOrd.server.length);
  for(let i=0;i<n;i++){
    const a=firstOrd.client[i]||'-', b=firstOrd.server[i]||'-';
    const item=id=>{const x=inv.find(y=>y.itemId===id); return x?`${x.category}/${x.brand}`:'';};
    console.log(`    ${String(i).padStart(2)}  ${a.padEnd(10)} ${item(a).padEnd(22)} -> ${b.padEnd(10)} ${item(b)}${a===b?'':'   <-- DIFFERS'}`);
  }
}else{
  console.log('  No ordered mismatches.');
}
console.log('');
console.log('  MockData source order (what the client renders today):');
console.log('    '+inv.map(i=>i.itemId).join(', '));
console.log('  Canonical query order:');
console.log('    '+q({limit:200}).items.map(i=>i.itemId).join(', '));
