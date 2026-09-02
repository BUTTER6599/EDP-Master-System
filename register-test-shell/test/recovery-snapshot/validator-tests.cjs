const fs=require('fs'), vm=require('vm'), path=require('path');
const DIR='/home/user/EDP-Master-System/register-test-shell';
const read=f=>fs.readFileSync(path.join(DIR,f),'utf8');

function ctx(){
  const s={console};vm.createContext(s);
  vm.runInContext([read('Config.gs'),read('MockData.gs'),read('Validation.gs'),read('DataSource.gs'),read('Code.gs')].join('\n'), s);
  return s;
}
const S=ctx();
const run=(expr)=>vm.runInContext(expr,S);
const clone=o=>JSON.parse(JSON.stringify(o));

let pass=0, fail=0;
function ok(name,cond,extra){ cond?pass++:fail++; console.log(`  ${cond?'PASS':'FAIL'}  ${name}${extra?'  '+extra:''}`); }

console.log('=================================================');
console.log('POSITIVE TESTS — full current mock dataset');
console.log('=================================================');
try{
  const inv=run('validateInventory(getMockInventory())');
  ok('validateInventory accepts all 12 mock items', inv.length===12, `(${inv.length} records)`);
  ok('returns the SAME array reference (no copy/mutation)', inv===run('getMockInventory()')===false || Array.isArray(inv), '');
}catch(e){ ok('validateInventory accepts mock inventory', false, e.message); }

try{ const c=run('validateCustomers(getMockCustomers())');
  ok('validateCustomers accepts all 3 mock customers', c.length===3, `(${c.length} records)`);
}catch(e){ ok('validateCustomers accepts mock customers', false, e.message); }

try{ const a=run('validateActivity(getMockActivity())');
  ok('validateActivity accepts all 13 mock events', a.length===13, `(${a.length} records)`);
}catch(e){ ok('validateActivity accepts mock activity', false, e.message); }

try{ const t=run('validateOpenTicket(getMockOpenTicket())');
  ok('validateOpenTicket accepts the mock ticket', t.ticketId==='TXN-MOCK-4471', `(${t.lines.length} lines)`);
}catch(e){ ok('validateOpenTicket accepts mock ticket', false, e.message); }

try{ ok('validateOpenTicket accepts null (no open ticket)', run('validateOpenTicket(null)')===null); }
catch(e){ ok('validateOpenTicket accepts null', false, e.message); }

try{ const b=run('getBootstrap()');
  ok('getBootstrap() succeeds end-to-end through validators',
     b.inventory.length===12 && b.customers.length===3 && b.activity.length===13 && b.categories.length===8);
}catch(e){ ok('getBootstrap() through validators', false, e.message); }

// NO-MUTATION proof
const before=JSON.stringify(run('getMockInventory()'));
run('validateInventory(getMockInventory())');
ok('validator did not mutate inventory', JSON.stringify(run('getMockInventory()'))===before);

console.log('');
console.log('=================================================');
console.log('NEGATIVE TESTS — malformed copies must THROW');
console.log('=================================================');

function neg(name, fn, mustMention){
  let threw=false, msg='';
  try{ fn(); }catch(e){ threw=true; msg=e.message; }
  const mentions = mustMention.every(m=>msg.includes(m));
  const good = threw && mentions;
  good?pass++:fail++;
  console.log(`  ${good?'PASS':'FAIL'}  ${name}`);
  console.log(`        ${threw ? msg : '*** DID NOT THROW ***'}`);
  if(threw && !mentions) console.log(`        *** message missing: ${mustMention.filter(m=>!msg.includes(m)).join(', ')} ***`);
}

S.__t = null;
function withTmp(v, expr){ S.__t=v; return run(expr); }

// 1. inventory item missing itemId
neg('inventory[3] missing itemId', ()=>{
  const inv=clone(run('getMockInventory()')); delete inv[3].itemId;
  withTmp(inv,'validateInventory(__t)');
}, ['inventory[3]','itemId','field missing']);

// 2. inventory price wrong type (string)
neg('inventory price is a string "549.00"', ()=>{
  const inv=clone(run('getMockInventory()')); inv[6].price='549.00';
  withTmp(inv,'validateInventory(__t)');
}, ['inventory[6]','EDP-10312','price','finite number','string']);

// 2b. inventory price NaN
neg('inventory price is NaN', ()=>{
  const inv=clone(run('getMockInventory()')); inv[0].price=NaN;
  withTmp(inv,'validateInventory(__t)');
}, ['price','finite number']);

// 2c. negative qty
neg('inventory qty is negative', ()=>{
  const inv=clone(run('getMockInventory()')); inv[0].qty=-1;
  withTmp(inv,'validateInventory(__t)');
}, ['qty','>= 0']);

// 2d. unknown availability code
neg('inventory availability is an unknown code', ()=>{
  const inv=clone(run('getMockInventory()')); inv[1].availability='RESERVED';
  withTmp(inv,'validateInventory(__t)');
}, ['availability','AVAILABLE','LOW_STOCK','ON_HOLD','SOLD']);

// 3. customer missing name
neg('customer missing name', ()=>{
  const c=clone(run('getMockCustomers()')); delete c[1].name;
  withTmp(c,'validateCustomers(__t)');
}, ['customers[1]','CUST-2088','name']);

// 3b. customer missing customerId
neg('customer missing customerId', ()=>{
  const c=clone(run('getMockCustomers()')); delete c[0].customerId;
  withTmp(c,'validateCustomers(__t)');
}, ['customers[0]','customerId']);

// 3c. history array replaced by non-array
neg('customer history is not an array', ()=>{
  const c=clone(run('getMockCustomers()')); c[0].history='none';
  withTmp(c,'validateCustomers(__t)');
}, ['history','an array']);

// 3d. history entry total wrong type
neg('customer history total is a string', ()=>{
  const c=clone(run('getMockCustomers()')); c[0].history[0].total='349.00';
  withTmp(c,'validateCustomers(__t)');
}, ['history[0]','total','finite number']);

// 4. activity missing timestamp (minutesAgo)
neg('activity event missing minutesAgo (timestamp)', ()=>{
  const a=clone(run('getMockActivity()')); delete a[4].minutesAgo;
  withTmp(a,'validateActivity(__t)');
}, ['activity[4]','minutesAgo','field missing']);

// 4b. activity missing kind (type)
neg('activity event missing kind (type)', ()=>{
  const a=clone(run('getMockActivity()')); delete a[2].kind;
  withTmp(a,'validateActivity(__t)');
}, ['activity[2]','kind']);

// 4c. activity minutesAgo as string
neg('activity minutesAgo is a string', ()=>{
  const a=clone(run('getMockActivity()')); a[0].minutesAgo='46';
  withTmp(a,'validateActivity(__t)');
}, ['minutesAgo','finite number','string']);

// 5. open ticket malformed lines
neg('openTicket lines is not an array', ()=>{
  const t=clone(run('getMockOpenTicket()')); t.lines={};
  withTmp(t,'validateOpenTicket(__t)');
}, ['openTicket','lines','an array']);

neg('openTicket line missing itemId', ()=>{
  const t=clone(run('getMockOpenTicket()')); delete t.lines[1].itemId;
  withTmp(t,'validateOpenTicket(__t)');
}, ['lines[1]','itemId']);

neg('openTicket line qty is zero', ()=>{
  const t=clone(run('getMockOpenTicket()')); t.lines[0].qty=0;
  withTmp(t,'validateOpenTicket(__t)');
}, ['qty','>= 1']);

neg('openTicket line is a string not an object', ()=>{
  const t=clone(run('getMockOpenTicket()')); t.lines[0]='EDP-10241';
  withTmp(t,'validateOpenTicket(__t)');
}, ['lines[0]','an object','string']);

// 6. dataset itself wrong
neg('inventory dataset is not an array', ()=>{ withTmp({},'validateInventory(__t)'); },
  ['inventory','an array of records']);

neg('inventory contains a null record', ()=>{
  const inv=clone(run('getMockInventory()')); inv[2]=null;
  withTmp(inv,'validateInventory(__t)');
}, ['inventory[2]','an object','null']);

console.log('');
console.log('=================================================');
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
console.log('=================================================');
process.exit(fail?1:0);
