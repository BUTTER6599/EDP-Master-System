const fs=require('fs'),vm=require('vm'),path=require('path');
const DIR='/home/user/EDP-Master-System/register-test-shell';
const read=f=>fs.readFileSync(path.join(DIR,f),'utf8');
const S={console};vm.createContext(S);
vm.runInContext(['Config.gs','MockData.gs','Validation.gs','DataSource.gs','InventoryQuery.gs','Code.gs']
  .map(read).join('\n'), S);
const run=e=>vm.runInContext(e,S);
function q(o){ S.__o=o; return run('queryInventory(__o)'); }

let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log(`  ${c?'PASS':'FAIL'}  ${n}${x?'  '+x:''}`);};
const ids=r=>r.items.map(i=>i.itemId);

console.log('CONSTANTS');
console.log('  MAX_INVENTORY_PAGE_SIZE     :', run('MAX_INVENTORY_PAGE_SIZE'));
console.log('  DEFAULT_INVENTORY_PAGE_SIZE :', run('DEFAULT_INVENTORY_PAGE_SIZE'));
console.log('');

console.log('=================================================');
console.log('DETERMINISTIC ORDER (full set, limit 200)');
console.log('=================================================');
const all=q({limit:200});
all.items.forEach((it,i)=>console.log(`  ${String(i).padStart(2)}  ${it.category.padEnd(13)} ${it.brand.padEnd(11)} ${it.model.padEnd(14)} ${it.itemId}`));
console.log('');

console.log('=================================================');
console.log('POSITIVE TESTS');
console.log('=================================================');
ok('total is 12 with no filters', all.total===12, `total=${all.total}`);

const p1=q({limit:5,offset:0});
ok('first page: 5 items, hasMore true', p1.returned===5&&p1.hasMore===true&&p1.total===12, ids(p1).join(','));
const p2=q({limit:5,offset:5});
ok('second page: 5 items, hasMore true', p2.returned===5&&p2.hasMore===true, ids(p2).join(','));
const p3=q({limit:5,offset:10});
ok('last partial page: 2 items, hasMore false', p3.returned===2&&p3.hasMore===false, ids(p3).join(','));
ok('pages are disjoint and cover the full set',
  new Set([...ids(p1),...ids(p2),...ids(p3)]).size===12);
ok('concatenated pages equal the single-page order',
  JSON.stringify([...ids(p1),...ids(p2),...ids(p3)])===JSON.stringify(ids(all)));

const past=q({limit:5,offset:99});
ok('page past the end: empty, not an error, total preserved',
  past.returned===0&&past.hasMore===false&&past.total===12, `total=${past.total}`);

const s1=q({search:'maytag',limit:200});
ok('text search "maytag" -> 2', s1.total===2, ids(s1).join(','));
const s2=q({search:'MAYTAG',limit:200});
ok('search is case-insensitive (MAYTAG == maytag)',
  JSON.stringify(ids(s2))===JSON.stringify(ids(s1)));
const s3=q({search:'  maytag  ',limit:200});
ok('search trims whitespace', JSON.stringify(ids(s3))===JSON.stringify(ids(s1)));
const s4=q({search:'',limit:200});
ok('empty search means no text filter', s4.total===12);

const c1=q({category:'Washer',limit:200});
ok('category filter Washer -> 2', c1.total===2, ids(c1).join(','));
const c2=q({category:'washer',limit:200});
ok('category match is case-insensitive', c2.total===2);
const c3=q({category:'ALL',limit:200});
ok('category "ALL" sentinel means no filter', c3.total===12);
const c4=q({category:null,limit:200});
ok('category null means no filter', c4.total===12);

const a1=q({availability:'AVAILABLE',limit:200});
ok('availability AVAILABLE -> 9', a1.total===9, `total=${a1.total}`);
const a2=q({availability:['SOLD','ON_HOLD'],limit:200});
ok('availability array [SOLD,ON_HOLD] -> 2', a2.total===2, ids(a2).join(','));
const a3=q({availability:['AVAILABLE','AVAILABLE'],limit:200});
ok('duplicate availability codes de-duplicate', a3.total===9);

const k1=q({search:'lg',category:'Refrigerator',limit:200});
ok('combined search + category', k1.total===1&&ids(k1)[0]==='EDP-10430', ids(k1).join(','));
const k2=q({category:'Refrigerator',availability:'AVAILABLE',limit:200});
ok('combined category + availability -> 2', k2.total===2, ids(k2).join(','));
const k3=q({category:'Refrigerator',limit:2,offset:0});
const k4=q({category:'Refrigerator',limit:2,offset:2});
ok('combined filter + pagination page1', k3.returned===2&&k3.total===3&&k3.hasMore===true, ids(k3).join(','));
ok('combined filter + pagination page2', k4.returned===1&&k4.hasMore===false, ids(k4).join(','));

const d1=q({search:'e',limit:7,offset:3});
const d2=q({search:'e',limit:7,offset:3});
ok('deterministic repeat query returns identical result',
  JSON.stringify(d1)===JSON.stringify(d2));

const def=q({});
ok('default limit applied when omitted', def.limit===24&&def.offset===0, `limit=${def.limit}`);
ok('queryInventory() with no argument works', run('queryInventory().limit')===24);

ok('echoed query reflects normalised values',
  JSON.stringify(q({search:' MayTag ',category:'ALL',availability:'SOLD'}).query)===
  JSON.stringify({search:'maytag',category:null,availability:['SOLD']}));

// Source must not be reordered by querying.
const beforeOrder=JSON.stringify(run('getMockInventory()').map(i=>i.itemId));
q({limit:200});
ok('query did not reorder the source array',
  JSON.stringify(run('getMockInventory()').map(i=>i.itemId))===beforeOrder);

console.log('');
console.log('=================================================');
console.log('PARITY WITH CURRENT CLIENT FILTER (Phase 3B safety)');
console.log('=================================================');
// Re-implementation of Scripts.html filteredInventory(), verbatim.
const inv=run('getMockInventory()');
function clientFilter(searchRaw, category){
  const qq=String(searchRaw||'').trim().toLowerCase();
  return inv.filter(it=>{
    if(category!=='ALL'&&it.category!==category) return false;
    if(!qq) return true;
    return [it.itemId,it.brand,it.model,it.category,it.description,it.condition]
      .join(' ').toLowerCase().indexOf(qq)!==-1;
  }).map(i=>i.itemId).sort();
}
const cats=['ALL',...new Set(inv.map(i=>i.category))];
const terms=['','maytag','LG','samsung','stainless','EDP-104','washer','open box','xyzzy','5','e'];
let mismatches=0, combos=0;
for(const c of cats) for(const t of terms){
  combos++;
  const client=clientFilter(t,c);
  const server=q({search:t,category:c,limit:200}).items.map(i=>i.itemId).sort();
  if(JSON.stringify(client)!==JSON.stringify(server)){
    mismatches++;
    console.log(`  MISMATCH cat=${c} term="${t}"`);
    console.log(`    client: ${client.join(',')}`);
    console.log(`    server: ${server.join(',')}`);
  }
}
ok(`identical results across all ${combos} category x term combinations`, mismatches===0,
   `${combos-mismatches}/${combos} matched`);

console.log('');
console.log('=================================================');
console.log('NEGATIVE TESTS — bad input must THROW');
console.log('=================================================');
function neg(name,fn,mustHave){
  let t=false,m='';
  try{fn();}catch(e){t=true;m=e.message;}
  const good=t&&mustHave.every(x=>m.includes(x));
  good?pass++:fail++;
  console.log(`  ${good?'PASS':'FAIL'}  ${name}`);
  console.log(`        ${t?m:'*** DID NOT THROW ***'}`);
}
neg('limit = 0',            ()=>q({limit:0}),           ['query error','limit','>= 1']);
neg('limit = -5',           ()=>q({limit:-5}),          ['limit','>= 1']);
neg('limit above maximum',  ()=>q({limit:201}),         ['limit','<= 200','ceiling']);
neg('limit = 100000',       ()=>q({limit:100000}),      ['limit','<= 200']);
neg('limit non-integer',    ()=>q({limit:5.5}),         ['limit','integer']);
neg('limit as string',      ()=>q({limit:'10'}),        ['limit','finite number','string']);
neg('limit NaN',            ()=>q({limit:NaN}),         ['limit','finite number']);
neg('offset negative',      ()=>q({offset:-1}),         ['offset','>= 0']);
neg('offset non-integer',   ()=>q({offset:2.7}),        ['offset','integer']);
neg('offset as string',     ()=>q({offset:'0'}),        ['offset','finite number']);
neg('availability unknown', ()=>q({availability:'RESERVED'}), ['availability','AVAILABLE','SOLD','RESERVED']);
neg('availability bad in array', ()=>q({availability:['AVAILABLE','NOPE']}), ['availability','NOPE']);
neg('availability wrong type',()=>q({availability:5}),  ['availability','string']);
neg('search wrong type',    ()=>q({search:123}),        ['search','a string','number']);
neg('category wrong type',  ()=>q({category:['a']}),    ['category','a string','array']);
neg('options is an array',  ()=>q([]),                  ['options','an object','array']);
neg('options is a string',  ()=>q('everything'),        ['options','an object','string']);

// Phase 2 validator must still fire through the query path.
S.__bad = JSON.parse(JSON.stringify(run('getMockInventory()')));
S.__bad[0].price='749.00';
vm.runInContext("MockDataSource.readInventory = function(){ return __bad; };", S);
neg('malformed data still rejected by Phase 2 validator via query',
    ()=>q({limit:5}), ['EDP shape error','inventory[0]','price','finite number']);
vm.runInContext("MockDataSource.readInventory = function(){ return getMockInventory(); };", S);
ok('source restored after validator test', q({limit:200}).total===12);


console.log('');
console.log('=================================================');
console.log('B. UNKNOWN OPTION KEYS');
console.log('=================================================');
ok('all five approved keys accepted together',
   q({search:'',category:'ALL',availability:'AVAILABLE',limit:10,offset:0}).total===9);
neg('unknown key "categry" (misspelling)', ()=>q({categry:'Washer'}),
    ['query error','unknown option','categry','Allowed options']);
neg('unknown key "page"',   ()=>q({page:2}),            ['unknown option','page']);
neg('unknown key "status"', ()=>q({status:'SOLD'}),     ['unknown option','status']);
neg('unknown key "sort"',   ()=>q({sort:'price'}),      ['unknown option','sort']);
neg('unknown key "foo"',    ()=>q({foo:1}),             ['unknown option','foo']);
neg('unknown key alongside valid keys', ()=>q({category:'Washer',limit:5,bogus:true}),
    ['unknown option','bogus']);

console.log('');
console.log('=================================================');
console.log('C. EMPTY AVAILABILITY ARRAY SEMANTICS');
console.log('=================================================');
ok('availability omitted -> no filter', q({limit:200}).total===12);
ok('availability null -> no filter', q({availability:null,limit:200}).total===12);
ok('availability valid string -> filters', q({availability:'SOLD',limit:200}).total===1);
ok('availability non-empty array -> filters',
   q({availability:['SOLD','ON_HOLD'],limit:200}).total===2);
neg('availability [] explicitly supplied -> THROWS', ()=>q({availability:[]}),
    ['query error','availability','empty array','must not silently mean']);

console.log('');
console.log('=================================================');
console.log('D. DUPLICATE itemId PAGINATION INVARIANT');
console.log('=================================================');
// First: prove the Phase 2 validator does NOT catch collection-level duplicates.
S.__dup = JSON.parse(JSON.stringify(run('getMockInventory()')));
S.__dup[5].itemId = S.__dup[0].itemId;   // two records now share EDP-10241
let v2Threw=false, v2Msg='';
try { run('validateInventory(__dup)'); } catch(e){ v2Threw=true; v2Msg=e.message; }
ok('Phase 2 shape validator does NOT reject duplicate itemIds (per-record only)',
   v2Threw===false, v2Threw?('unexpectedly threw: '+v2Msg):'(accepted, as expected)');

vm.runInContext("MockDataSource.readInventory = function(){ return __dup; };", S);
neg('queryInventory REJECTS duplicate itemId before paging', ()=>q({limit:200}),
    ['query invariant','duplicate itemId','EDP-10241','non-deterministic']);
neg('duplicate also rejected on a filtered query that includes both',
    ()=>q({limit:200,search:''}), ['query invariant','duplicate itemId']);
ok('duplicate OUTSIDE the matched set does not block an unrelated query',
   q({category:'Television',limit:200}).total===1);
vm.runInContext("MockDataSource.readInventory = function(){ return getMockInventory(); };", S);
ok('source restored after duplicate test', q({limit:200}).total===12);


console.log('');
console.log('=================================================');
console.log('E. SOURCE-ROW-ORDER INVARIANCE');
console.log('  Proves the approved canonical order makes pagination');
console.log('  independent of future spreadsheet/source row ordering.');
console.log('=================================================');

const pristine = run('getMockInventory()');
const pristineSnapshot = JSON.stringify(pristine);
const pristineOrder = pristine.map(i=>i.itemId);

// A representative query/pagination sequence: plain paging, filtered paging,
// text search, availability filter, and a page past the end.
const SEQ = [
  {label:'page 1 of all (limit 5, offset 0)',  o:{limit:5, offset:0}},
  {label:'page 2 of all (limit 5, offset 5)',  o:{limit:5, offset:5}},
  {label:'page 3 partial (limit 5, offset 10)',o:{limit:5, offset:10}},
  {label:'page past end (limit 5, offset 99)', o:{limit:5, offset:99}},
  {label:'full set (limit 200)',               o:{limit:200}},
  {label:'search "e" limit 4 offset 4',        o:{search:'e', limit:4, offset:4}},
  {label:'category Refrigerator limit 2 off 0',o:{category:'Refrigerator', limit:2, offset:0}},
  {label:'category Refrigerator limit 2 off 2',o:{category:'Refrigerator', limit:2, offset:2}},
  {label:'availability AVAILABLE limit 3 off 3',o:{availability:'AVAILABLE', limit:3, offset:3}},
  {label:'search+cat+avail combined',          o:{search:'5', category:'ALL', availability:['AVAILABLE','SOLD'], limit:4, offset:2}}
];

function runSeq(){ return SEQ.map(t=>{ const r=q(t.o); return {
  label:t.label, ids:r.items.map(i=>i.itemId), total:r.total,
  limit:r.limit, offset:r.offset, returned:r.returned, hasMore:r.hasMore }; }); }

const baseline = runSeq();

// Deterministic permutations of SOURCE ROW ORDER. No record is altered.
function reversed(a){ return a.slice().reverse(); }
function rotated(a,n){ return a.slice(n).concat(a.slice(0,n)); }
function seededShuffle(a,seed){            // Fisher-Yates, LCG seed => repeatable
  const out=a.slice(); let s=seed;
  const rnd=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; };
  for(let i=out.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; }
  return out;
}
const PERMS = [
  {name:'reversed',        rows:reversed(pristine)},
  {name:'rotated by 5',    rows:rotated(pristine,5)},
  {name:'seeded shuffle A',rows:seededShuffle(pristine,12345)},
  {name:'seeded shuffle B',rows:seededShuffle(pristine,98765)},
  {name:'seeded shuffle C',rows:seededShuffle(pristine,555)}
];

PERMS.forEach(perm=>{
  const permOrder = perm.rows.map(i=>i.itemId);
  const actuallyDifferent = JSON.stringify(permOrder)!==JSON.stringify(pristineOrder);
  console.log('');
  console.log(`  --- source permutation: ${perm.name} ---`);
  console.log(`      source order: ${permOrder.join(', ')}`);
  ok(`${perm.name}: permutation genuinely differs from source order`, actuallyDifferent);

  S.__perm = perm.rows;
  const permSnapshot = JSON.stringify(perm.rows);
  vm.runInContext("MockDataSource.readInventory = function(){ return __perm; };", S);

  const got = runSeq();

  let allIds=true, allTotal=true, allBounds=true, allMore=true;
  got.forEach((g,i)=>{
    const b=baseline[i];
    if(JSON.stringify(g.ids)!==JSON.stringify(b.ids)) { allIds=false;
      console.log(`      ORDER MISMATCH on "${g.label}"`);
      console.log(`        baseline : ${b.ids.join(', ')}`);
      console.log(`        permuted : ${g.ids.join(', ')}`); }
    if(g.total!==b.total) allTotal=false;
    if(g.limit!==b.limit||g.offset!==b.offset||g.returned!==b.returned) allBounds=false;
    if(g.hasMore!==b.hasMore) allMore=false;
  });

  ok(`${perm.name}: returned item ORDER identical across all ${SEQ.length} queries`, allIds);
  ok(`${perm.name}: total identical`, allTotal);
  ok(`${perm.name}: page boundaries identical (limit/offset/returned)`, allBounds);
  ok(`${perm.name}: hasMore identical`, allMore);
  ok(`${perm.name}: permuted source array NOT mutated`, JSON.stringify(perm.rows)===permSnapshot);
});

// Restore and verify.
vm.runInContext("MockDataSource.readInventory = function(){ return getMockInventory(); };", S);
ok('original source restored (12 records)', q({limit:200}).total===12);
ok('original source array never mutated by any of this',
   JSON.stringify(run('getMockInventory()'))===pristineSnapshot);
ok('restored source still yields the baseline sequence',
   JSON.stringify(runSeq())===JSON.stringify(baseline));
console.log('');
console.log('  Canonical order held across 5 independent source permutations.');

console.log('');
console.log('=================================================');
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
console.log('=================================================');
process.exit(fail?1:0);
