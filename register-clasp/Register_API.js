// ============================================================
//  EDP REGISTER API — v2.1.0
//  The Electronics Depot LLC | Metairie, LA 70003
//  ES5 ONLY — no const/let/arrow/async/await/backticks
// ============================================================

var KEY_SHEET_ID         = 'SHEET_ID';
var KEY_PUSHOVER_TOKEN   = 'PUSHOVER_TOKEN';
var KEY_PUSHOVER_USER    = 'PUSHOVER_USER';
var KEY_TWILIO_SID       = 'TWILIO_SID';
var KEY_TWILIO_TOKEN     = 'TWILIO_TOKEN';
var KEY_TWILIO_FROM      = 'TWILIO_FROM';
var PRINTER_URL          = 'http://192.168.1.168/cgi-bin/epos/service.cgi';

// ── SETUP (run once) ─────────────────────────────────────────
function setupRegister() {
  PropertiesService.getScriptProperties().setProperties({
    'SHEET_ID':       '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo',
    'PUSHOVER_TOKEN': '',  // Pushover App Token
    'PUSHOVER_USER':  '',  // Taylor Pushover User Key
    'OWNER_EMAIL':    '',  // Taylor email
    'TWILIO_SID':     '',  // Twilio Account SID
    'TWILIO_TOKEN':   '',  // Twilio Auth Token
    'TWILIO_FROM':    '',  // Twilio phone e.g. +15045550100
    'GEMINI_KEY':     ''   // Gemini API key
  });
  Logger.log('SUCCESS — Script Properties saved. Fill blanks and run again.');
}

// ── SHEET HELPERS ────────────────────────────────────────────
function getSheet_(name) {
  var id = PropertiesService.getScriptProperties().getProperty(KEY_SHEET_ID);
  if (!id) throw new Error('SHEET_ID not set. Run setupRegister() first.');
  var sh = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}

function sheetToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var h = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < h.length; j++) { obj[String(h[j]).trim()] = data[i][j]; }
    rows.push(obj);
  }
  return rows;
}

// Read appliance photos from any of several possible header names
// (case-insensitive) and normalize a comma-separated string into an array.
function extractPhotos_(r) {
  var lower = {};
  for (var key in r) { if (r.hasOwnProperty(key)) lower[String(key).trim().toLowerCase()] = r[key]; }
  var names = ['photos','photo','photo links','photo_links','photo link','image','images','picture','pictures'];
  var raw = '';
  for (var n = 0; n < names.length; n++) {
    var v = lower[names[n]];
    if (v != null && String(v).trim() !== '') { raw = String(v); break; }
  }
  if (!raw) return [];
  return raw.split(',').map(function(p){ return p.trim(); }).filter(Boolean);
}

// ── ENSURE APPLIANCE INVENTORY COLUMNS ───────────────────────
// Guarantees the APPLIANCES sheet has `stage` and `status` columns.
// Creates either if missing (appended right), never overwrites data,
// and backfills blanks: stage -> PURCHASED, status -> AVAILABLE.
function ensureApplianceInventoryColumns() {
  // Resolve the same spreadsheet api_getRegisterBoot() uses: the SHEET_ID
  // script property (KEY_SHEET_ID), falling back to the project's canonical
  // sheet ID from setupRegister() so this still works if the property is unset.
  var id = PropertiesService.getScriptProperties().getProperty(KEY_SHEET_ID)
           || '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo';
  if (!id) { Logger.log('[ensureApplianceInventoryColumns] SHEET_ID not set — aborting.'); return; }
  var sheet = SpreadsheetApp.openById(id).getSheetByName('APPLIANCES');
  if (!sheet) { Logger.log('[ensureApplianceInventoryColumns] APPLIANCES sheet NOT found — aborting.'); return; }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) { Logger.log('[ensureApplianceInventoryColumns] APPLIANCES sheet empty — nothing to do.'); return; }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  function findCol_(name) {
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim().toLowerCase() === name.toLowerCase()) return i + 1;
    }
    return -1;
  }

  var stageCol = findCol_('stage');
  var statusCol = findCol_('status');

  if (stageCol === -1) {
    lastCol += 1; stageCol = lastCol;
    sheet.getRange(1, stageCol).setValue('stage');
    Logger.log('[ensureApplianceInventoryColumns] stage column NOT found — CREATED at column ' + stageCol + '.');
  } else {
    Logger.log('[ensureApplianceInventoryColumns] stage column FOUND at column ' + stageCol + '.');
  }

  if (statusCol === -1) {
    lastCol += 1; statusCol = lastCol;
    sheet.getRange(1, statusCol).setValue('status');
    Logger.log('[ensureApplianceInventoryColumns] status column NOT found — CREATED at column ' + statusCol + '.');
  } else {
    Logger.log('[ensureApplianceInventoryColumns] status column FOUND at column ' + statusCol + '.');
  }

  var dataRows = lastRow - 1;
  if (dataRows <= 0) { Logger.log('[ensureApplianceInventoryColumns] No data rows to backfill.'); return; }

  var stageRange = sheet.getRange(2, stageCol, dataRows, 1);
  var statusRange = sheet.getRange(2, statusCol, dataRows, 1);
  var stageVals = stageRange.getValues();
  var statusVals = statusRange.getValues();

  var stageFilled = 0, statusFilled = 0;
  for (var r = 0; r < dataRows; r++) {
    if (String(stageVals[r][0]).trim() === '')  { stageVals[r][0]  = 'PURCHASED'; stageFilled++; }
    if (String(statusVals[r][0]).trim() === '') { statusVals[r][0] = 'AVAILABLE'; statusFilled++; }
  }
  if (stageFilled  > 0) stageRange.setValues(stageVals);
  if (statusFilled > 0) statusRange.setValues(statusVals);

  Logger.log('[ensureApplianceInventoryColumns] Backfilled stage  -> PURCHASED on ' + stageFilled  + ' row(s).');
  Logger.log('[ensureApplianceInventoryColumns] Backfilled status -> AVAILABLE on ' + statusFilled + ' row(s).');
}

// ── BOOT ─────────────────────────────────────────────────────
function api_getRegisterBoot(pin) {
  try {
    var pinStr = String(pin || '');
    var ownerPins = ['1199','7864'];
    var isOwner = ownerPins.indexOf(pinStr) > -1;
    var users = {
      '1199':{name:'Taylor',role:'OWNER'},'7864':{name:'Yvonne',role:'OWNER'},
      '4687':{name:'Yvonne',role:'STAFF'},'9544':{name:'Joe',role:'TECH'},
      '1200':{name:'Clarence',role:'LABOR'}
    };
    var result = {
      version:'2.1.0', isOwner:isOwner, currentUser:users[pinStr]||null,
      inventory:[], warChest:0, warChestGoal:2400,
      customers:[],
      pendingMessages:[], frozen:false, freezeMsg:'', error:null
    };
    // Serialization-safety helpers — keep NaN/Infinity/Date/bad cells from
    // nulling the google.script.run return payload.
    function numF_(v, def){ var x = parseFloat(v); return isFinite(x) ? x : def; }
    function numI_(v, def){ var x = parseInt(v, 10); return isFinite(x) ? x : def; }
    function safeVal_(v){
      if (v === null || v === undefined) return '';
      if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (typeof v === 'number') return isFinite(v) ? v : 0;
      if (typeof v === 'boolean') return v;
      return String(v);
    }
    // Inventory from APPLIANCES
    try {
      ensureApplianceInventoryColumns();
      var rows = sheetToObjects_(getSheet_('APPLIANCES'));
      var invTotal = 0, invShown = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        invTotal++;
        var stage  = String(r['stage']  == null ? '' : r['stage']).toUpperCase().trim();
        var status = String(r['status'] == null ? '' : r['status']).toUpperCase().trim();
        if (stage === 'FLOOR_READY' && status === 'AVAILABLE') {
          invShown++;
          var photos = extractPhotos_(r);
          result.inventory.push({
            item_id:String(r['item_id']||''), sku_id:String(r['sku_id']||r['tag_id']||''),
            category:String(r['category']||''), brand:String(r['brand']||''),
            model:String(r['model']||''), serial:String(r['serial']||''),
            condition:String(r['condition']||'UNKNOWN'),
            list_price:numF_(r['list_price']||r['target_price'], 0),
            cost_basis:isOwner?numF_(r['cost_basis'], 0):0,
            days_on_hand:numI_(r['days_on_hand'], 0),
            rating:numI_(r['rating'], 3),
            manager_approved:!!(r['manager_approved']||r['manager_pick']),
            warranty_tier:String(r['warranty_tier']||'90-DAY'),
            notes:String(r['Notes']||r['notes']||''), photos:photos
          });
        }
      }
      Logger.log('[api_getRegisterBoot] Appliances loaded: '+invTotal+' — FLOOR_READY + AVAILABLE shown: '+invShown);
    } catch(e) { Logger.log('Inv load: '+e.message); }
    // War chest from SETTINGS
    try {
      var srows = sheetToObjects_(getSheet_('SETTINGS'));
      for (var s = 0; s < srows.length; s++) {
        var sk = String(srows[s][Object.keys(srows[s])[0]]||'').toUpperCase();
        var sv = srows[s][Object.keys(srows[s])[1]]||0;
        if (sk==='WAR_CHEST_BALANCE') result.warChest=numF_(sv, 0);
        if (sk==='WAR_CHEST_GOAL') result.warChestGoal=numF_(sv, 2400);
      }
    } catch(e) {}
    // Pending messages
    try {
      var mrows = sheetToObjects_(getSheet_('MESSAGES'));
      for (var m = 0; m < mrows.length; m++) {
        var mr = mrows[m];
        if (String(mr['to']||'').toUpperCase()==='REGISTER' &&
            String(mr['status']||'').toUpperCase()==='PENDING') {
          result.pendingMessages.push({text:String(mr['text']||''),from:String(mr['from']||'Manager')});
          if (String(mr['type']||'').toUpperCase()==='FREEZE') {
            result.frozen=true; result.freezeMsg=String(mr['text']||'Wait for manager.');
          }
        }
      }
    } catch(e) {}
    // Customers
    try {
      var ss2 = SpreadsheetApp.openById(
        PropertiesService.getScriptProperties().getProperty(KEY_SHEET_ID));
      var csh = ss2.getSheetByName('CUSTOMERS');
      if (csh) {
        var cdata = csh.getDataRange().getValues();
        if (cdata.length > 1) {
          var ch = cdata[0];
          for (var ci = 1; ci < cdata.length; ci++) {
            if (!cdata[ci][0]) continue;
            var cobj = {};
            ch.forEach(function(col,idx){ cobj[String(col).trim()]=safeVal_(cdata[ci][idx]); });
            cobj.name = (String(cobj.first_name||'')+' '+String(cobj.last_name||'')).trim();
            cobj.phone = String(cobj.phone1||'');
            result.customers.push(cobj);
          }
        }
      }
    } catch(ce) { Logger.log('Customers load: '+ce.message); }
    // Guarantee a clean, serializable payload — the JSON round-trip normalizes
    // any unforeseen Date/NaN/Infinity/undefined so google.script.run never nulls it.
    try { return JSON.parse(JSON.stringify(result)); }
    catch(se){ Logger.log('[api_getRegisterBoot] serialize guard: '+se.message); return result; }
  } catch(e) { return {error:e.message,version:'2.1.0'}; }
}

// ── INVENTORY-ONLY ENDPOINT ───────────────────────────────────
// Clean, serializable floor payload using the SAME appliance load/filter as
// api_getRegisterBoot, with NaN/Infinity-safe number conversion. Used as the
// register's inventory fallback. Owner cost_basis gated by pin (default 0).
function api_getRegisterInventoryOnly(pin) {
  try {
    var ownerPins = ['1199','7864'];
    var isOwner = ownerPins.indexOf(String(pin||'')) > -1;
    function numF_(v, def){ var x = parseFloat(v); return isFinite(x) ? x : def; }
    function numI_(v, def){ var x = parseInt(v, 10); return isFinite(x) ? x : def; }

    ensureApplianceInventoryColumns();
    var rows = sheetToObjects_(getSheet_('APPLIANCES'));
    var inv = [];
    var total = 0, shown = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      total++;
      var stage  = String(r['stage']  == null ? '' : r['stage']).toUpperCase().trim();
      var status = String(r['status'] == null ? '' : r['status']).toUpperCase().trim();
      if (stage === 'FLOOR_READY' && status === 'AVAILABLE') {
        shown++;
        var photos = extractPhotos_(r);
        inv.push({
          item_id:String(r['item_id']||''), sku_id:String(r['sku_id']||r['tag_id']||''),
          category:String(r['category']||''), brand:String(r['brand']||''),
          model:String(r['model']||''), serial:String(r['serial']||''),
          condition:String(r['condition']||'UNKNOWN'),
          list_price:numF_(r['list_price']||r['target_price'], 0),
          cost_basis:isOwner?numF_(r['cost_basis'], 0):0,
          days_on_hand:numI_(r['days_on_hand'], 0),
          rating:numI_(r['rating'], 3),
          manager_approved:!!(r['manager_approved']||r['manager_pick']),
          warranty_tier:String(r['warranty_tier']||'90-DAY'),
          notes:String(r['Notes']||r['notes']||''), photos:photos
        });
      }
    }
    Logger.log('[api_getRegisterInventoryOnly] loaded: '+total+' — FLOOR_READY + AVAILABLE shown: '+shown);
    return { ok: true, inventory: inv };
  } catch(e) {
    Logger.log('[api_getRegisterInventoryOnly] error: '+e.message);
    return { ok: false, error: e.message, inventory: [] };
  }
}

// ── CHECK MESSAGES (poll) ─────────────────────────────────────
function api_checkMessages(employeeName) {
  try {
    var result = {messages:[],frozen:false,freezeMsg:''};
    var sh = getSheet_('MESSAGES');
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return result;
    var h = data[0];
    var toC=h.indexOf('to'), stC=h.indexOf('status'), txC=h.indexOf('text'), frC=h.indexOf('from'), tyC=h.indexOf('type');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][toC]||'').toUpperCase()==='REGISTER' &&
          String(data[i][stC]||'').toUpperCase()==='PENDING') {
        var ty = String(data[i][tyC]||'').toUpperCase();
        var tx = String(data[i][txC]||'');
        if (ty==='FREEZE') { result.frozen=true; result.freezeMsg=tx; }
        else { result.messages.push({text:tx,from:String(data[i][frC]||'Manager')}); }
        sh.getRange(i+1,stC+1).setValue('READ');
      }
    }
    return result;
  } catch(e) { return {messages:[],frozen:false,freezeMsg:''}; }
}

// ── EMPLOYEE MESSAGE ──────────────────────────────────────────
function api_sendEmployeeMessage(payload) {
  try {
    getSheet_('MESSAGES').appendRow([
      new Date(),payload.from||'Staff','OWNER',payload.text||'','TEXT','PENDING',''
    ]);
    sendPushover_('Register Msg from '+(payload.from||'Staff'), payload.text||'');
    return {ok:true};
  } catch(e) { return {ok:false,error:e.message}; }
}

// ── ACKNOWLEDGE FREEZE ────────────────────────────────────────
function api_acknowledgeFreeze(employeeName) {
  try {
    var sh = getSheet_('MESSAGES');
    var data = sh.getDataRange().getValues();
    var h = data[0];
    var tyC=h.indexOf('type'), stC=h.indexOf('status');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][tyC]||'').toUpperCase()==='FREEZE' &&
          String(data[i][stC]||'').toUpperCase()==='PENDING') {
        sh.getRange(i+1,stC+1).setValue('ACK');
      }
    }
    sendPushover_('Register Unpaused',(employeeName||'Staff')+' acknowledged.');
    return {ok:true};
  } catch(e) { return {ok:false}; }
}

// ── REGISTER OPEN NOTIFICATION ────────────────────────────────
function api_notifyRegisterOpen(employeeName) {
  try {
    sendPushover_('EDP Register Opened',(employeeName||'Someone')+' opened the register.');
    return {ok:true};
  } catch(e) { return {ok:false}; }
}

// ── 1-YEAR WARRANTY ALERT ─────────────────────────────────────
function api_notify1YearWarranty(payload) {
  try {
    sendPushover_('⚠ 1-Year Warranty',
      (payload.employee||'Staff')+' selected 1-YEAR on '+(payload.item||'item')+
      ' — $'+(payload.price||0).toFixed(2));
    return {ok:true};
  } catch(e) { return {ok:false}; }
}

// ── PUSH TO TALK ──────────────────────────────────────────────
// Joe holds TALK TO TAYLOR button. Device transcribes voice to text.
// Text is sent here, forwarded to Taylor via Pushover (high priority).
// Taylor's typed reply gets written to MESSAGES sheet → register polls
// it → LO reads it aloud on register screen.
function api_sendPTTMessage(payload) {
  try {
    var from = payload.from || 'Staff';
    var text = payload.text || '';
    if (!text) return {ok:false,error:'No message text.'};
    // High-priority Pushover to Taylor
    sendPushoverPriority_('📢 PTT — '+from, text, 1);
    // Log in MESSAGES sheet
    try {
      getSheet_('MESSAGES').appendRow([
        new Date(), from, 'OWNER', text, 'PTT', 'PENDING', ''
      ]);
    } catch(e) {}
    return {ok:true,text:text};
  } catch(e) { return {ok:false,error:e.message}; }
}

// Called by register after PTT to check if Taylor replied
function api_getLOReply(payload) {
  try {
    var sh = getSheet_('MESSAGES');
    var data = sh.getDataRange().getValues();
    var h = data[0];
    var toC=h.indexOf('to'), stC=h.indexOf('status'), txC=h.indexOf('text'), tyC=h.indexOf('type');
    // Search newest first
    for (var i = data.length-1; i >= 1; i--) {
      if (String(data[i][toC]||'').toUpperCase()==='REGISTER' &&
          String(data[i][stC]||'').toUpperCase()==='PENDING' &&
          String(data[i][tyC]||'').toUpperCase()==='REPLY') {
        var txt = String(data[i][txC]||'');
        sh.getRange(i+1,stC+1).setValue('READ');
        return {text:txt};
      }
    }
    return {text:'Message sent to Taylor.'};
  } catch(e) { return {text:'Message sent.'}; }
}

// ── VALIDATE SALE ITEMS FOR AVAILABILITY ────────────────────
function validateSaleItems_(items) {
  var blocked = [];
  var ap = null, pp = null;
  var pdata = null, adata = null;
  var ph = null, ah = null;

  try { ap = getSheet_('APPLIANCES'); } catch(e) {}
  try { pp = getSheet_('PARTS'); } catch(e) {}

  if (pp) {
    pdata = pp.getDataRange().getValues();
    if (pdata.length > 0) {
      ph = pdata[0].map(function(x) { return String(x||'').trim(); });
    }
  }
  if (ap) {
    adata = ap.getDataRange().getValues();
    if (adata.length > 0) {
      ah = adata[0].map(function(x) { return String(x||'').trim(); });
    }
  }

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var reason = '';
    var itemId = String(item.id||'').trim();

    // Skip services
    if (item.isService || item.category === 'SERVICE' || itemId.indexOf('SVC-') === 0) {
      continue;
    }

    // Skip delivery
    if (item.category === 'DELIVERY' || itemId.indexOf('DELIVERY-') === 0) {
      continue;
    }

    // Validate parts
    if (item.isPart || item.category === 'PARTS') {
      if (!pdata || !ph) {
        blocked.push({id:item.id, item_name:item.model, reason:'PARTS sheet not found'});
        continue;
      }

      var pidC = ph.indexOf('part_id');
      var qtyC = ph.indexOf('qty_in_stock');
      var stgC = ph.indexOf('stage');

      if (pidC === -1 || qtyC === -1 || stgC === -1) {
        blocked.push({id:item.id, item_name:item.model, reason:'PARTS headers missing'});
        continue;
      }

      var lookupId = String(item.id || item.sku || '').trim();
      var found = false;

      for (var pi = 1; pi < pdata.length; pi++) {
        if (String(pdata[pi][pidC]||'').trim() === lookupId) {
          found = true;
          var qty = parseInt(pdata[pi][qtyC]||0);
          var stg = String(pdata[pi][stgC]||'').toUpperCase().trim();

          if (qty <= 0) reason = 'Qty: '+qty;
          else if (stg === 'OUT_OF_STOCK' || stg === 'SOLD' || stg === 'INACTIVE')
            reason = 'Stage: '+stg;
          break;
        }
      }

      if (!found) reason = 'Not in PARTS inventory';
      if (reason) blocked.push({id:item.id, item_name:item.model, reason:reason});

    } else {
      // Validate appliances (all remaining items)
      if (!adata || !ah) {
        blocked.push({id:item.id, item_name:item.brand+' '+item.model, reason:'APPLIANCES sheet not found'});
        continue;
      }

      var aidC = ah.indexOf('item_id');
      var astgC = ah.indexOf('stage');
      var astatC = ah.indexOf('status');

      if (aidC === -1 || astgC === -1 || astatC === -1) {
        blocked.push({id:item.id, item_name:item.brand+' '+item.model, reason:'APPLIANCES headers missing'});
        continue;
      }

      var afound = false;

      for (var ai = 1; ai < adata.length; ai++) {
        if (String(adata[ai][aidC]||'').trim() === itemId) {
          afound = true;
          var astg = String(adata[ai][astgC]||'').toUpperCase().trim();
          var astat = String(adata[ai][astatC]||'').toUpperCase().trim();

          if (astg !== 'FLOOR_READY') reason = 'Stage: '+astg;
          else if (astat !== 'AVAILABLE') reason = 'Status: '+astat;
          break;
        }
      }

      if (!afound) reason = 'Not in APPLIANCES inventory';
      if (reason) blocked.push({id:item.id, item_name:item.brand+' '+item.model, reason:reason});
    }
  }

  return blocked;
}

// ── LOG BLOCKED SALE ATTEMPT ─────────────────────────────────
function logBlockedSaleAttempt_(emp, items, blocked) {
  try {
    var ss = SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty(KEY_SHEET_ID));
    var sh = ss.getSheetByName('OVERRIDE_LOG');
    if (!sh) {
      sh = ss.insertSheet('OVERRIDE_LOG');
      sh.appendRow(['timestamp','employee','action','blocked_count','blocked_items','items_json','status']);
    }
    var blockedStr = blocked.map(function(b) { return b.id; }).join(',');
    sh.appendRow([new Date(), emp, 'BLOCKED_SALE_ATTEMPT', blocked.length, blockedStr, JSON.stringify(items), 'BLOCKED']);
  } catch(e) {
    Logger.log('logBlockedSaleAttempt error: '+e.message);
  }
}

// ── PROCESS SALE ─────────────────────────────────────────────
function api_processRegisterSale(payload) {
  try {
    var items  = payload.items||[];
    var total  = parseFloat(payload.total||0);
    var cash   = parseFloat(payload.cash||0);
    var emp    = payload.employee||'Staff';

    if (!items.length) return {success:false,error:'Cart empty.'};

    // Validate item availability BEFORE processing
    var blocked = validateSaleItems_(items);
    if (blocked.length > 0) {
      logBlockedSaleAttempt_(emp, items, blocked);
      sendPushoverPriority_('SALE BLOCKED - Inventory Issue',
        emp+' attempted '+items.length+' item(s), '+blocked.length+' unavailable.',1);
      return {
        success:false,
        blocked:true,
        error:'Sale blocked: unavailable inventory.',
        blocked_items:blocked
      };
    }
    if (cash<total)    return {success:false,error:'Cash less than total.'};
    var change = parseFloat((cash-total).toFixed(2));
    var saleId = 'SALE-'+new Date().getTime();
    var now    = new Date();
    // Write SALES
    try {
      var ssl;
      try { ssl=getSheet_('SALES'); }
      catch(e) {
        var ss=SpreadsheetApp.openById(
          PropertiesService.getScriptProperties().getProperty(KEY_SHEET_ID));
        ssl=ss.insertSheet('SALES');
        ssl.appendRow(['sale_id','date','employee','item_count','total','cash','change','items_json']);
      }
      ssl.appendRow([saleId,now,emp,items.length,total,cash,change,JSON.stringify(items)]);
    } catch(e) { Logger.log('SALES write: '+e.message); }
    // Mark SOLD in APPLIANCES
    try {
      var ap=getSheet_('APPLIANCES');
      var ad=ap.getDataRange().getValues();
      var ah=ad[0], idC=ah.indexOf('item_id'), stgC=ah.indexOf('stage');
      for (var ai=1;ai<ad.length;ai++) {
        for (var ii=0;ii<items.length;ii++) {
          if (String(ad[ai][idC])===String(items[ii].id) && stgC>-1) {
            ap.getRange(ai+1,stgC+1).setValue('SOLD');
          }
        }
      }
    } catch(e) {}
    // War chest slice
    try { updateWarChest_(total*0.08); } catch(e) {}
    // Pushover
    sendPushover_('Sale — $'+total.toFixed(2),
      emp+' | '+items.length+' item(s) | Change: $'+change.toFixed(2));
    return {success:true,saleId:saleId,totalSale:total,change:change};
  } catch(e) { return {success:false,error:e.message}; }
}

// ── PRINT RECEIPT — Epson TM-m30II at 192.168.1.168 ──────────
function api_printReceipt(payload) {
  try {
    var lines = String(payload.receiptText||'').split('\n');
    var xmlLines = '';
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var align = (i<5||ln.indexOf('Thank')>-1||ln.indexOf('===')>-1) ? 'center' : 'left';
      xmlLines += '<text align="'+align+'" lang="en">'+xmlEsc_(ln)+'\n</text>';
    }
    var xml =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
        '<s:Body>' +
          '<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">' +
            '<text align="center" font="font_b" width="2" height="2" lang="en">EDP\n</text>' +
            '<feed line="1"/>'+
            xmlLines +
            '<feed line="4"/>'+
            '<cut type="feed"/>'+
          '</epos-print>' +
        '</s:Body>' +
      '</s:Envelope>';
    var resp = UrlFetchApp.fetch(PRINTER_URL, {
      method:'post',
      contentType:'text/xml; charset=utf-8',
      headers:{'SOAPAction':'""'},
      payload:xml,
      muteHttpExceptions:true,
      connectTimeout:6000
    });
    var code = resp.getResponseCode();
    Logger.log('Printer response: '+code);
    if (code===200) return {ok:true,method:'printer'};
    return {ok:false,error:'Printer HTTP '+code};
  } catch(e) {
    Logger.log('Print error: '+e.message);
    return {ok:false,error:e.message};
  }
}

// ── SEND RECEIPT SMS (Twilio) ─────────────────────────────────
function api_sendReceiptSMS(payload) {
  try {
    var props = PropertiesService.getScriptProperties();
    var sid   = props.getProperty(KEY_TWILIO_SID);
    var tok   = props.getProperty(KEY_TWILIO_TOKEN);
    var from  = props.getProperty(KEY_TWILIO_FROM);
    if (!sid||!tok||!from) return {ok:false,error:'Twilio keys not set in Script Properties.'};
    var smsBody =
      'THE ELECTRONICS DEPOT\n'+
      'Sale: '+(payload.saleId||'')+'\n'+
      'Total: $'+(payload.total||'0.00')+'\n'+
      'Thank you! Questions? Call 504-XXX-XXXX';
    var resp = UrlFetchApp.fetch(
      'https://api.twilio.com/2010-04-01/Accounts/'+sid+'/Messages.json',{
        method:'post',
        headers:{'Authorization':'Basic '+Utilities.base64Encode(sid+':'+tok)},
        payload:{To:payload.phone,From:from,Body:smsBody},
        muteHttpExceptions:true
      });
    return resp.getResponseCode()===201?{ok:true}:{ok:false,error:'SMS HTTP '+resp.getResponseCode()};
  } catch(e) { return {ok:false,error:e.message}; }
}

// ── SEND RECEIPT EMAIL ────────────────────────────────────────
function api_sendReceiptEmail(payload) {
  try {
    if (!payload.email) return {ok:false,error:'No email provided.'};
    MailApp.sendEmail({
      to:      payload.email,
      subject: 'Your Receipt — The Electronics Depot | '+(payload.saleId||''),
      body:    payload.receiptText||'',
      htmlBody:
        '<div style="font-family:monospace;max-width:400px;margin:0 auto;'+
        'background:#f9f9f9;padding:20px;border-radius:8px;">'+
        '<h2 style="color:#F97316;font-family:sans-serif;text-align:center;">'+
        'The Electronics Depot</h2>'+
        '<pre style="font-size:13px;line-height:1.7;">'+
        xmlEsc_(payload.receiptText||'')+'</pre>'+
        '<p style="font-family:sans-serif;font-size:11px;color:#999;text-align:center;">'+
        '7333 Airline Dr, Metairie, LA 70003</p></div>'
    });
    return {ok:true};
  } catch(e) { return {ok:false,error:e.message}; }
}

// ── HELPERS ──────────────────────────────────────────────────
function sendPushover_(title, message) {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty(KEY_PUSHOVER_TOKEN);
  var user  = p.getProperty(KEY_PUSHOVER_USER);
  if (!token||!user) {
    Logger.log('[sendPushover] Missing token/user');
    return;
  }
  try {
    Logger.log('[sendPushover] Sending | '+title);
    var resp = UrlFetchApp.fetch('https://api.pushover.net/1/messages.json',{
      method:'post', payload:{token:token,user:user,title:title,message:message},
      muteHttpExceptions:true
    });
    var code = resp.getResponseCode();
    Logger.log('[sendPushover] HTTP '+code+' | '+title);
    if (code !== 200) {
      try {
        var body = resp.getContentText();
        Logger.log('[sendPushover] Error body: '+body);
      } catch(be) {}
    }
  } catch(e) { Logger.log('[sendPushover] Exception: '+e.message); }
}

function sendPushoverPriority_(title, message, priority) {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty(KEY_PUSHOVER_TOKEN);
  var user  = p.getProperty(KEY_PUSHOVER_USER);
  if (!token||!user) { Logger.log('[sendPushoverPriority] Missing token/user'); return; }
  var pri = parseInt(priority||0);
  if (isNaN(pri) || pri < -2 || pri > 2) pri = 0;
  var pl = {token:token,user:user,title:title,message:message,priority:String(pri)};
  if (pri >= 2) { pl.retry='60'; pl.expire='3600'; }
  try {
    Logger.log('[sendPushoverPriority] Sending priority='+pri+' | '+title);
    var resp = UrlFetchApp.fetch('https://api.pushover.net/1/messages.json',{
      method:'post',payload:pl,muteHttpExceptions:true
    });
    var code = resp.getResponseCode();
    Logger.log('[sendPushoverPriority] HTTP '+code+' | '+title);
    if (code !== 200) {
      try {
        var body = resp.getContentText();
        Logger.log('[sendPushoverPriority] Error body: '+body);
      } catch(be) {}
    }
  } catch(e) { Logger.log('[sendPushoverPriority] Exception: '+e.message); }
}

function updateWarChest_(amount) {
  try {
    var sh=getSheet_('SETTINGS');
    var data=sh.getDataRange().getValues();
    for (var i=0;i<data.length;i++) {
      if (String(data[i][0]).toUpperCase().trim()==='WAR_CHEST_BALANCE') {
        sh.getRange(i+1,2).setValue(parseFloat((parseFloat(data[i][1]||0)+amount).toFixed(2)));
        return;
      }
    }
    sh.appendRow(['WAR_CHEST_BALANCE',parseFloat(amount.toFixed(2))]);
  } catch(e) { Logger.log('War chest: '+e.message); }
}

function xmlEsc_(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// -- TEXTBELT SMS ------------------------------------------
function api_sendSMSTextbelt(payload) {
  try {
    var phone   = String(payload.phone   || '');
    var message = String(payload.message || '');
    if (!phone || !message) return {ok:false, error:'Missing phone or message.'};
    var key = '7a39c7e96bbfe8446f479111b594a16e43ace712';
    var resp = UrlFetchApp.fetch('https://textbelt.com/text', {
      method:'post',
      payload:{phone:phone,message:message,key:key},
      muteHttpExceptions:true
    });
    var result = JSON.parse(resp.getContentText());
    Logger.log('Textbelt SMS: ' + JSON.stringify(result));
    // Log every text to SMS_LOG sheet
    try {
      var ss = SpreadsheetApp.openById(
        PropertiesService.getScriptProperties().getProperty('SHEET_ID') ||
        '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo'
      );
      var logSh = ss.getSheetByName('SMS_LOG');
      if (!logSh) {
        logSh = ss.insertSheet('SMS_LOG');
        logSh.appendRow(['timestamp','phone','message_preview','success','credits_remaining','error']);
        logSh.getRange(1,1,1,6).setFontWeight('bold').setBackground('#111').setFontColor('#F97316');
        logSh.setFrozenRows(1);
      }
      var credits = result.quotaRemaining !== undefined ? result.quotaRemaining : 'unknown';
      logSh.appendRow([
        new Date().toLocaleString(),
        phone,
        message.substring(0,60)+'...',
        result.success ? 'YES' : 'NO',
        credits,
        result.error || ''
      ]);
      // Notify Taylor on every single text
      notifyEveryText_(phone, message, credits, result.success);
      // Low credit warnings
      if (credits !== 'unknown' && credits <= 20 && credits > 10) {
        sendTextbeltAlert_('WARNING: Textbelt credits low - ' + credits + ' remaining. Buy more at textbelt.com');
      }
      if (credits !== 'unknown' && credits <= 10) {
        sendTextbeltAlert_('URGENT: Only ' + credits + ' Textbelt credits left! Buy now at textbelt.com');
      }
    } catch(logErr) {
      Logger.log('SMS log error: ' + logErr.message);
    }
    return {ok:result.success, quotaRemaining:result.quotaRemaining, error:result.error||''};
  } catch(e) {
    Logger.log('SMS error: ' + e.message);
    return {ok:false, error:e.message};
  }
}

function sendTextbeltAlert_(msg) {
  try {
    var token = PropertiesService.getScriptProperties().getProperty('PUSHOVER_TOKEN') || 'ajxbh3y239uv2edbus5xefkrb7tq5v';
    var user  = PropertiesService.getScriptProperties().getProperty('PUSHOVER_USER')  || 'u8i24dck34a6r4f5p7jdp3gdhyxh4d';
    UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', {
      method:'post',
      payload:{token:token,user:user,message:msg,title:'EDP - Textbelt Alert',priority:'1'}
    });
    MailApp.sendEmail('thedepote@gmail.com','EDP Textbelt Credit Alert',msg);
  } catch(e) { Logger.log('Alert error: '+e.message); }
}

// Notify Taylor on EVERY text sent
function notifyEveryText_(phone, message, credits, success) {
  try {
    var token = PropertiesService.getScriptProperties().getProperty('PUSHOVER_TOKEN') || 'ajxbh3y239uv2edbus5xefkrb7tq5v';
    var user  = PropertiesService.getScriptProperties().getProperty('PUSHOVER_USER')  || 'u8i24dck34a6r4f5p7jdp3gdhyxh4d';
    var status = success ? 'SENT' : 'FAILED';
    var msg = status + ' to ' + phone + '\n' +
              'Credits left: ' + credits + '\n' +
              'Preview: ' + String(message).substring(0,80);
    UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', {
      method:'post',
      payload:{token:token,user:user,message:msg,title:'EDP Text - ' + status,priority:'0'}
    });
  } catch(e) { Logger.log('notifyEveryText error: '+e.message); }
}

// Get SMS stats for dashboard
function api_getSMSStats() {
  try {
    var ss = SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty('SHEET_ID') ||
      '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo'
    );
    var sh = ss.getSheetByName('SMS_LOG');
    if (!sh) return {ok:true,total:0,today:0,week:0,credits:0,lastPhone:''};
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return {ok:true,total:0,today:0,week:0,credits:0,lastPhone:''};
    var now = new Date();
    var todayStr = now.toLocaleDateString();
    var weekAgo = new Date(now.getTime() - 7*24*60*60*1000);
    var total=0,today=0,week=0,credits=0,lastPhone='';
    for (var i=1;i<data.length;i++) {
      var row=data[i];
      if(!row[0])continue;
      if(String(row[3])==='YES') {
        total++;
        var rowDate = new Date(row[0]);
        if(rowDate.toLocaleDateString()===todayStr) today++;
        if(rowDate>=weekAgo) week++;
      }
      if(i===data.length-1){
        credits=row[4]||0;
        lastPhone=String(row[1]||'');
      }
    }
    return {ok:true,total:total,today:today,week:week,credits:credits,lastPhone:lastPhone};
  } catch(e) {
    return {ok:false,total:0,today:0,week:0,credits:0,error:e.message};
  }
}

function checkTextbeltCredits() {
  try {
    var resp = UrlFetchApp.fetch('https://textbelt.com/text', {
      method:'post',
      payload:{phone:'dummy',message:'credits_check',key:'7a39c7e96bbfe8446f479111b594a16e43ace712_checkonly'},
      muteHttpExceptions:true
    });
    var result = JSON.parse(resp.getContentText());
    Logger.log('Credits remaining: ' + result.quotaRemaining);
    return result.quotaRemaining !== undefined ? result.quotaRemaining : -1;
  } catch(e) { return -1; }
}

function testTextbelt() {
  Logger.log('Credits: ' + checkTextbeltCredits());
  var resp = UrlFetchApp.fetch('https://textbelt.com/text', {
    method:'post',
    payload:{phone:'15042339008',message:'EDP test text - working!',key:'7a39c7e96bbfe8446f479111b594a16e43ace712'},
    muteHttpExceptions:true
  });
  Logger.log('Send result: ' + resp.getContentText());
}


// -- EDIT EXISTING PART ------------------------------------
function api_editPart(payload) {
  try {
    var sh   = getSheet_('PARTS');
    var data = sh.getDataRange().getValues();
    var h    = data[0];
    var idCol = h.indexOf('part_id');
    if (idCol === -1) return {ok:false,error:'part_id column not found.'};

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(payload.part_id)) {
        var row = i + 1;
        var set = function(col, val) {
          var c = h.indexOf(col);
          if (c > -1) sh.getRange(row, c+1).setValue(val);
        };
        set('appliance_type',    payload.appliance_type  || '');
        set('part_name',         payload.part_name        || '');
        set('brand',             payload.brand            || '');
        set('compatible_models', payload.compatible_models|| '');
        set('condition',         payload.condition        || 'USED');
        set('price_used',        parseFloat(payload.price_used   ||0));
        set('price_new_aft',     parseFloat(payload.price_new_aft||0));
        set('price_new_oem',     parseFloat(payload.price_new_oem||0));
        set('sale_price',        parseFloat(payload.price_used   ||0));
        set('qty_in_stock',      parseInt(payload.qty_in_stock   ||0));
        set('bin',               payload.bin   || '');
        set('shelf',             payload.shelf || '');
        set('notes',             payload.notes || '');
        Logger.log('Part updated: ' + payload.part_id);
        return {ok:true};
      }
    }
    return {ok:false, error:'Part ID not found: '+payload.part_id};
  } catch(e) {
    Logger.log('editPart error: '+e.message);
    return {ok:false, error:e.message};
  }
}

// -- ADD APPLIANCE WITH PHOTOS TO DRIVE -------------------
var EDP_PHOTOS_FOLDER = 'EDP_Appliance_Photos';

function getPhotoFolder_() {
  var folders = DriveApp.getFoldersByName(EDP_PHOTOS_FOLDER);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(EDP_PHOTOS_FOLDER);
}

function api_addCustomAppliance(payload) {
  try {
    var sh = getSheet_('APPLIANCES');
    var h  = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];

    // Generate item ID
    var cat    = String(payload.category||'W').charAt(0).toUpperCase();
    var prefix = {W:'W',D:'DEW',S:'SGW',F:'RTB',Z:'FZ'}[cat]||'W';
    var itemId = prefix+'-'+Math.floor(1000+Math.random()*9000);

    // Save photos to Drive
    var photoUrls = [];
    var photos = payload.photos || [];
    if (photos.length) {
      var folder = getPhotoFolder_();
      var itemFolder;
      try { itemFolder = folder.createFolder(itemId); }
      catch(e) { itemFolder = folder; }
      for (var i = 0; i < photos.length && i < 20; i++) {
        try {
          var b64 = String(photos[i]).split(',')[1];
          if (!b64) continue;
          var blob = Utilities.newBlob(
            Utilities.base64Decode(b64),
            'image/jpeg',
            itemId+'_photo'+(i+1)+'.jpg'
          );
          var file = itemFolder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          photoUrls.push('https://drive.google.com/uc?id='+file.getId());
        } catch(pe) {
          Logger.log('Photo '+i+' error: '+pe.message);
        }
      }
    }

    // Build row
    var row = [];
    var set = function(col, val) {
      var c = h.indexOf(col);
      if (c > -1) row[c] = val;
    };
    for (var x = 0; x < h.length; x++) row[x] = '';
    set('item_id',       itemId);
    set('sku_id',        itemId);
    set('category',      payload.category    || 'WASHER');
    set('brand',         payload.brand       || '');
    set('model',         payload.model       || '');
    set('serial',        payload.serial      || '');
    set('condition',     payload.condition   || 'WORKING');
    set('list_price',    parseFloat(payload.list_price  || 0));
    set('cost_basis',    parseFloat(payload.cost_basis  || 0));
    set('rating',        parseInt(payload.rating        || 3));
    set('warranty_tier', payload.warranty_tier          || 'NONE');
    set('fuel_type',     payload.fuel_type              || '');
    set('notes',         payload.notes                  || '');
    set('stage',         'FLOOR_READY');
    set('status',        'AVAILABLE');
    set('days_on_hand',  0);
    set('date_acquired', new Date().toISOString().split('T')[0]);
    set('added_by',      payload.added_by    || 'Staff');
    set('photos',        photoUrls.join(','));
    set('manager_approved', false);

    sh.appendRow(row);
    Logger.log('Appliance added: '+itemId+' with '+photoUrls.length+' photos');
    return {ok: true, item_id: itemId, photo_count: photoUrls.length};
  } catch(e) {
    Logger.log('addAppliance error: '+e.message);
    return {ok: false, error: e.message};
  }
}

// -- UPLOAD ONE PHOTO TO DRIVE (called per photo) ----------
function api_uploadOnePhoto(payload) {
  try {
    var itemId   = String(payload.item_id   || '');
    var itemType = String(payload.item_type || 'PART');
    var b64      = String(payload.photo_b64 || '');
    var index    = parseInt(payload.index   || 0);
    if (!itemId || !b64) return {ok:false,error:'Missing item_id or photo data.'};

    // Get or create folder
    var folders = DriveApp.getFoldersByName('EDP_Appliance_Photos');
    var root = folders.hasNext() ? folders.next() : DriveApp.createFolder('EDP_Appliance_Photos');
    var subFolders = root.getFoldersByName(itemId);
    var folder = subFolders.hasNext() ? subFolders.next() : root.createFolder(itemId);

    // Save photo
    var blob = Utilities.newBlob(
      Utilities.base64Decode(b64),
      'image/jpeg',
      itemId+'_photo'+(index+1)+'.jpg'
    );
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url = 'https://drive.google.com/uc?id='+file.getId();

    // Append URL to photos column in correct sheet
    var sheetName = (itemType==='APPLIANCE') ? 'APPLIANCES' : 'PARTS';
    var idCol     = (itemType==='APPLIANCE') ? 'item_id'    : 'part_id';
    var sh   = getSheet_(sheetName);
    var data = sh.getDataRange().getValues();
    var h    = data[0];
    var idIdx    = h.indexOf(idCol);
    var photoIdx = h.indexOf('photos');
    if (idIdx<0||photoIdx<0) return {ok:false,error:'Column not found in '+sheetName};
    for (var i=1;i<data.length;i++) {
      if (String(data[i][idIdx])===itemId) {
        var existing = String(data[i][photoIdx]||'');
        var updated  = existing ? existing+','+url : url;
        sh.getRange(i+1,photoIdx+1).setValue(updated);
        Logger.log('Photo uploaded for '+itemId+': '+url);
        return {ok:true,url:url};
      }
    }
    return {ok:false,error:'Item not found: '+itemId};
  } catch(e) {
    Logger.log('uploadOnePhoto error: '+e.message);
    return {ok:false,error:e.message};
  }
}

// testTextbelt removed (duplicate)

// -- SEED SMS LOG (run once to populate with current credits) --
function seedSMSLog() {
  try {
    // Send a real test text to get quota back
    var resp = UrlFetchApp.fetch('https://textbelt.com/text', {
      method:'post',
      payload:{
        phone:'15042339008',
        message:'EDP SMS Monitor test - credits seeded.',
        key:'7a39c7e96bbfe8446f479111b594a16e43ace712'
      },
      muteHttpExceptions:true
    });
    var result = JSON.parse(resp.getContentText());
    Logger.log('Result: ' + JSON.stringify(result));

    // Log it to SMS_LOG
    var ss = SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty('SHEET_ID') ||
      '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo'
    );
    var logSh = ss.getSheetByName('SMS_LOG');
    if (!logSh) {
      logSh = ss.insertSheet('SMS_LOG');
      logSh.appendRow(['timestamp','phone','message_preview','success','credits_remaining','error']);
      logSh.getRange(1,1,1,6).setFontWeight('bold').setBackground('#111').setFontColor('#F97316');
      logSh.setFrozenRows(1);
    }
    logSh.appendRow([
      new Date().toLocaleString(),
      '15042339008',
      'EDP SMS Monitor test - credits seeded.',
      result.success ? 'YES' : 'NO',
      result.quotaRemaining || 0,
      result.error || ''
    ]);
    Logger.log('SMS_LOG seeded. Credits: ' + result.quotaRemaining);
  } catch(e) {
    Logger.log('seedSMSLog error: ' + e.message);
  }
}

// -- ELEVENLABS TEXT TO SPEECH ─────────────────────────────
function api_elevenLabsSpeak(payload) {
  try {
    var rawText = String(payload.text || '');
    // Handle language placeholders - real text lives server-side to avoid encoding issues
    var text = rawText;
    if (rawText === 'AR_POLICY') {
      text = 'سياسة العملاء في متجر إليكترونيكس ديبو. البند الأول: لا استرداد. لا نقدم استردادًا من أي نوع. إذا اشتريت منتجًا، سنقوم بإصلاحه. إذا لم نتمكن من الإصلاح خلال 2 إلى 4 أيام، سنستبدله بمنتج مماثل. البند الثاني: نقد فقط. نقبل النقد فقط. لا بطاقات ائتمان أو مدفوعات رقمية. البند الثالث: إذا كان المنتج به مشكلة، أعده إلى المتجر. لا نقوم بزيارات منزلية.';
    } else if (rawText === 'ZH_POLICY') {
      text = '电子仓库客户政策。第一条：不退款。我们不提供任何形式的退款。如果您购买了商品，我们将进行维修。如果我们在 2 到 4 天内无法修复，我们将用同等价值的商品替换。第二条：仅限现金。我们只接受现金。不接受信用卡、借记卡或数字付款。第三条：如果您的商品在保修期内出现问题，请将其带回店内。我们不提供上门服务。第四条：保修不涵盖电路板、触摸屏、橡胶垒圈、门问题、货架、把手、铰链或旋钒。第五条：如果商品检测正常运作，收取50美元技术费。第六条：商品内外必须清洁才能接受服务。第七条：付费不可退还。第八条：请至少4张照片并保留收据。';
    }
    var text = text;
    var voiceId = String(payload.voiceId || 'EOVAuWqgSZN2Oel78Psj');
    var apiKey  = PropertiesService.getScriptProperties().getProperty('ELEVENLABS_API_KEY') ||
                  'sk_ea3183264ed0bd00e823be34449a0c74b0596d141267ff84';
    if (!text) return {ok:false, error:'No text provided.'};

    var url = 'https://api.elevenlabs.io/v1/text-to-speech/' + voiceId;
    var body = JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {stability:0.5, similarity_boost:0.75}
    });

    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      payload: body,
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      Logger.log('ElevenLabs error: ' + resp.getResponseCode() + ' ' + resp.getContentText().substring(0,200));
      return {ok:false, error:'ElevenLabs error: ' + resp.getResponseCode()};
    }

    // Save audio to Drive and return URL
    var blob = resp.getBlob().setName('edp_policy_' + Date.now() + '.mp3');
    var folder = DriveApp.getFolderById(
      PropertiesService.getScriptProperties().getProperty('AUDIO_FOLDER_ID') || 'root'
    );
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var audioUrl = 'https://drive.google.com/uc?export=download&id=' + file.getId();
    Logger.log('ElevenLabs audio created: ' + audioUrl);
    return {ok:true, audioUrl:audioUrl};
  } catch(e) {
    Logger.log('ElevenLabs error: ' + e.message);
    return {ok:false, error:e.message};
  }
}

// -- DEBUG BOOT CUSTOMERS (run this) ──────────────────────────
function debugBootCustomers() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID') ||
           '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo';
  var ss = SpreadsheetApp.openById(id);
  // List all sheets
  var names = ss.getSheets().map(function(s){return s.getName();});
  Logger.log('All sheets: ' + names.join(', '));
  // Try CUSTOMERS sheet
  var csh = ss.getSheetByName('CUSTOMERS');
  if (!csh) { Logger.log('CUSTOMERS sheet NOT FOUND'); return; }
  var data = csh.getDataRange().getValues();
  Logger.log('CUSTOMERS rows: ' + data.length);
  Logger.log('CUSTOMERS headers: ' + data[0].join(' | '));
  if (data.length > 1) Logger.log('Row 2: ' + data[1].join(' | '));
  // Simulate what boot does
  var customers = [];
  var ch = data[0];
  for (var ci = 1; ci < data.length; ci++) {
    if (!data[ci][0]) continue;
    var cobj = {};
    ch.forEach(function(col,idx){ cobj[col]=data[ci][idx]; });
    cobj.name = (String(cobj.first_name||'')+' '+String(cobj.last_name||'')).trim();
    cobj.phone = String(cobj.phone1||'');
    customers.push(cobj);
  }
  Logger.log('Customers built: ' + customers.length);
  Logger.log('Sample: ' + JSON.stringify(customers[0]));
}

// -- DEBUG INVENTORY (run to see what stages your appliances have) --
function debugInventory() {
  var ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SHEET_ID') ||
    '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo'
  );
  var sh = ss.getSheetByName('APPLIANCES');
  if (!sh) { Logger.log('APPLIANCES sheet not found'); return; }
  var data = sh.getDataRange().getValues();
  var h = data[0];
  var stageCol = h.indexOf('stage');
  var statusCol = h.indexOf('status');
  var catCol = h.indexOf('category');
  var brandCol = h.indexOf('brand');
  Logger.log('Total rows: ' + (data.length-1));
  Logger.log('Stage col: ' + stageCol + ' | Status col: ' + statusCol);
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    Logger.log('Row '+ i +': '+
      (brandCol>-1?data[i][brandCol]:'')+' | '+
      (catCol>-1?data[i][catCol]:'')+' | '+
      'stage='+( stageCol>-1?data[i][stageCol]:'N/A')+' | '+
      'status='+(statusCol>-1?data[i][statusCol]:'N/A'));
  }
}

// -- FLOOR PUSH FUNCTIONS ----------------------------------

function api_getFloorInventory() {
  try {
    var ss = SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty('SHEET_ID') ||
      '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo'
    );
    var sh = ss.getSheetByName('APPLIANCES');
    if (!sh) return {ok:true, items:[]};
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return {ok:true, items:[]};
    var h = data[0];
    var items = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      var obj = {};
      h.forEach(function(col, idx){ obj[String(col).trim()] = data[i][idx]; });
      items.push({
        item_id:    String(obj.item_id   || ''),
        sku_id:     String(obj.sku_id    || obj.tag_id || ''),
        category:   String(obj.category  || ''),
        brand:      String(obj.brand     || ''),
        model:      String(obj.model     || ''),
        serial:     String(obj.serial    || ''),
        condition:  String(obj.condition || ''),
        condition_note: String(obj.condition_note || ''),
        description: String(obj.description || ''),
        location:   String(obj.location  || 'FLOOR'),
        list_price: parseFloat(obj.list_price || obj.target_price || 0),
        stage:      String(obj.stage     || ''),
        days_on_hand: parseInt(obj.days_on_hand || 0),
        photos:     String(obj.photos    || ''),
        hero_photo: String(obj.hero_photo|| '')
      });
    }
    return {ok:true, items:items};
  } catch(e) {
    Logger.log('getFloorInventory error: ' + e.message);
    return {ok:false, items:[], error:e.message};
  }
}

function api_addFloorItem(payload) {
  try {
    var sh = getSheet_('APPLIANCES');
    var h  = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    var cat = String(payload.category || 'WASHER');
    var prefix = {WASHER:'W',DRYER_ELECTRIC:'DEW',DRYER_GAS:'DGW',
                  REFRIGERATOR:'RTB',STOVE_ELECTRIC:'SEW',STOVE_GAS:'SGW',
                  FREEZER:'FZ',PART:'P'}[cat] || 'W';
    var itemId = prefix + '-' + Math.floor(1000 + Math.random()*9000);
    var row = [];
    for (var x = 0; x < h.length; x++) row[x] = '';
    var set = function(col, val) {
      var c = h.indexOf(col);
      if (c > -1) row[c] = val;
    };
    set('item_id',       itemId);
    set('sku_id',        itemId);
    set('category',      cat);
    set('brand',         String(payload.brand      || ''));
    set('model',         String(payload.model      || ''));
    set('serial',        String(payload.serial     || ''));
    set('condition',     String(payload.condition  || 'WORKING'));
    set('condition_note',String(payload.condition_note || ''));
    set('description',   String(payload.description|| ''));
    set('location',      String(payload.location   || 'FLOOR'));
    set('list_price',    parseFloat(payload.list_price || 0));
    set('cost_basis',    parseFloat(payload.cost_basis || 0));
    set('stage',         String(payload.stage || 'FLOOR_READY'));
    set('status',        'AVAILABLE');
    set('days_on_hand',  0);
    set('date_acquired', new Date().toISOString().split('T')[0]);
    set('added_by',      String(payload.added_by || 'Staff'));
    set('warranty_tier', String(payload.warranty_tier || '90-DAY'));
    set('photos',        '');
    set('hero_photo',    '');
    sh.appendRow(row);
    Logger.log('Floor item added: ' + itemId);
    return {ok:true, item_id:itemId};
  } catch(e) {
    Logger.log('addFloorItem error: ' + e.message);
    return {ok:false, error:e.message};
  }
}

function api_pushItemToFloor(payload) {
  try {
    var sh   = getSheet_('APPLIANCES');
    var data = sh.getDataRange().getValues();
    var h    = data[0];
    var idCol  = h.indexOf('item_id');
    var target = String(payload.push_to || 'BOTH');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) !== String(payload.item_id)) continue;
      var row = i + 1;
      var setCol = function(col, val) {
        var c = h.indexOf(col);
        if (c > -1) sh.getRange(row, c+1).setValue(val);
      };
      if (target === 'SOLD') {
        setCol('stage', 'SOLD');
        setCol('status', 'SOLD');
      } else {
        setCol('stage', 'FLOOR_READY');
        setCol('status', 'AVAILABLE');
      }
      if (payload.list_price)    setCol('list_price',    parseFloat(payload.list_price));
      if (payload.condition)     setCol('condition',     payload.condition);
      if (payload.condition_note)setCol('condition_note',payload.condition_note);
      if (payload.description)   setCol('description',   payload.description);
      if (payload.location)      setCol('location',      payload.location);
      if (payload.hero_photo)    setCol('hero_photo',    payload.hero_photo);
      if (payload.show_photos)   setCol('photos',        payload.show_photos);
      Logger.log('Item pushed: ' + payload.item_id + ' -> ' + target);
      return {ok:true};
    }
    return {ok:false, error:'Item not found: ' + payload.item_id};
  } catch(e) {
    Logger.log('pushItemToFloor error: ' + e.message);
    return {ok:false, error:e.message};
  }
}

// -- TELNYX SMS ------------------------------------------------
function api_sendSMSTelnyx(payload) {
  try {
    var phone   = String(payload.phone   || '').replace(/[^0-9+]/g,'');
    var message = String(payload.message || '');
    if (!phone || !message) return {ok:false, error:'Missing phone or message.'};
    // Ensure E.164 format
    if (phone.length === 10) phone = '+1' + phone;
    else if (phone.length === 11 && phone.charAt(0) === '1') phone = '+' + phone;

    var props  = PropertiesService.getScriptProperties();
    var apiKey = props.getProperty('TELNYX_API_KEY');
    var from   = props.getProperty('TELNYX_FROM');

    var body = JSON.stringify({
      from: from,
      to:   phone,
      text: message
    });

    var resp = UrlFetchApp.fetch('https://api.telnyx.com/v2/messages', {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type':  'application/json',
        'Accept':        'application/json'
      },
      payload: body,
      muteHttpExceptions: true
    });

    var code   = resp.getResponseCode();
    var result = JSON.parse(resp.getContentText());
    Logger.log('Telnyx SMS: ' + code + ' | ' + JSON.stringify(result).substring(0,200));

    var ok = (code === 200 || code === 201);
    var msgId = ok ? (result.data ? result.data.id : '') : '';

    // Log to SMS_LOG
    try {
      var ss = SpreadsheetApp.openById(
        props.getProperty('SHEET_ID') || '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo'
      );
      var logSh = ss.getSheetByName('SMS_LOG');
      if (!logSh) {
        logSh = ss.insertSheet('SMS_LOG');
        logSh.appendRow(['timestamp','phone','message_preview','success','provider','error']);
        logSh.getRange(1,1,1,6).setFontWeight('bold').setBackground('#111').setFontColor('#F97316');
        logSh.setFrozenRows(1);
      }
      logSh.appendRow([
        new Date().toLocaleString(),
        phone,
        message.substring(0,60),
        ok ? 'YES' : 'NO',
        'TELNYX',
        ok ? '' : (result.errors ? JSON.stringify(result.errors[0]) : 'HTTP '+code)
      ]);
    } catch(le) { Logger.log('SMS log error: '+le.message); }

    // Pushover notify Taylor on every text
    try {
      var status = ok ? 'SENT' : 'FAILED';
      var pMsg = status + ' via Telnyx to ' + phone + '\nPreview: ' + message.substring(0,80);
      sendPushover_('EDP Text - ' + status, pMsg);
    } catch(pe) {}

    if (ok) return {ok:true, msgId:msgId};
    var errMsg = result.errors ? result.errors[0].detail : 'HTTP ' + code;
    return {ok:false, error:errMsg};
  } catch(e) {
    Logger.log('Telnyx SMS error: ' + e.message);
    return {ok:false, error:e.message};
  }
}

// -- TELNYX SMS STATS -----------------------------------------
function api_getTelnyxStats() {
  try {
    var props  = PropertiesService.getScriptProperties();
    var apiKey = props.getProperty('TELNYX_API_KEY');

    // Get account balance
    var resp = UrlFetchApp.fetch('https://api.telnyx.com/v2/balance', {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    });
    var result = JSON.parse(resp.getContentText());
    var balance = 0;
    if (result.data) balance = parseFloat(result.data.balance || 0);

    // Count from SMS_LOG
    var ss = SpreadsheetApp.openById(
      props.getProperty('SHEET_ID') || '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo'
    );
    var logSh = ss.getSheetByName('SMS_LOG');
    var total=0, today=0, week=0, lastPhone='';
    if (logSh) {
      var data = logSh.getDataRange().getValues();
      var now = new Date();
      var todayStr = now.toLocaleDateString();
      var weekAgo = new Date(now.getTime() - 7*24*60*60*1000);
      for (var i=1;i<data.length;i++) {
        if (!data[i][0]) continue;
        if (String(data[i][3])==='YES') {
          total++;
          var rd = new Date(data[i][0]);
          if (rd.toLocaleDateString()===todayStr) today++;
          if (rd>=weekAgo) week++;
        }
        if (i===data.length-1) lastPhone=String(data[i][1]||'');
      }
    }

    // Alert if balance low
    if (balance < 2.00 && balance > 0) {
      sendPushover_('EDP Telnyx Balance Low','Balance: $'+balance.toFixed(2)+' — add funds at telnyx.com');
    }

    return {ok:true, balance:balance, total:total, today:today, week:week, lastPhone:lastPhone};
  } catch(e) {
    Logger.log('getTelnyxStats error: '+e.message);
    return {ok:false, balance:0, total:0, today:0, week:0, error:e.message};
  }
}

// -- TELNYX TEST (run once to verify) -------------------------
function testTelnyx() {
  var result = api_sendSMSTelnyx({
    phone:   '15042339008',
    message: 'EDP Register - Telnyx SMS working! 504-342-4004'
  });
  Logger.log('Test result: ' + JSON.stringify(result));
}

// -- LIVE CUSTOMER SEARCH (Shopify-style) ------------------
// Called on every keystroke - searches sheet directly
function api_searchCustomers(query) {
  try {
    var q = String(query || '').trim().toLowerCase();
    if (!q || q.length < 2) return {ok:true, customers:[]};

    var ss = SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty('SHEET_ID') ||
      '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo'
    );
    var sh = ss.getSheetByName('CUSTOMERS');
    if (!sh) return {ok:true, customers:[]};

    var data = sh.getDataRange().getValues();
    if (data.length < 2) return {ok:true, customers:[]};
    var h = data[0];

    var idCol    = h.indexOf('cust_id');
    var fnCol    = h.indexOf('first_name');
    var lnCol    = h.indexOf('last_name');
    var p1Col    = h.indexOf('phone1');
    var emCol    = h.indexOf('email');
    var tyCol    = h.indexOf('type');
    var tsCol    = h.indexOf('total_spent');
    var adCol    = h.indexOf('address');
    var p2Col    = h.indexOf('phone2');
    var p2nCol   = h.indexOf('phone2_name');
    var p3Col    = h.indexOf('phone3');
    var p3nCol   = h.indexOf('phone3_name');

    var results = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      var fn    = String(data[i][fnCol] || '').toLowerCase();
      var ln    = String(data[i][lnCol] || '').toLowerCase();
      var phone = String(data[i][p1Col] || '').replace(/[^0-9]/g,'');
      var email = String(data[i][emCol] || '').toLowerCase();
      var full  = (fn + ' ' + ln).trim();

      // Match on name, phone, email, or ID
      if (full.indexOf(q) > -1 ||
          phone.indexOf(q.replace(/[^0-9]/g,'')) > -1 ||
          email.indexOf(q) > -1 ||
          String(data[i][idCol]||'').toLowerCase().indexOf(q) > -1) {
        results.push({
          cust_id:    String(data[i][idCol]  || ''),
          first_name: String(data[i][fnCol]  || ''),
          last_name:  String(data[i][lnCol]  || ''),
          phone1:     String(data[i][p1Col]  || ''),
          phone2:     String(data[i][p2Col]  || ''),
          phone2_name:String(data[i][p2nCol] || ''),
          phone3:     String(data[i][p3Col]  || ''),
          phone3_name:String(data[i][p3nCol] || ''),
          email:      String(data[i][emCol]  || ''),
          address:    String(data[i][adCol]  || ''),
          type:       String(data[i][tyCol]  || 'REGULAR'),
          total_spent:parseFloat(data[i][tsCol] || 0),
          name:       (String(data[i][fnCol]||'')+' '+String(data[i][lnCol]||'')).trim()
        });
        if (results.length >= 8) break;
      }
    }
    return {ok:true, customers:results};
  } catch(e) {
    Logger.log('searchCustomers error: ' + e.message);
    return {ok:false, customers:[], error:e.message};
  }
}

// -- UPDATE CUSTOMER ----------------------------------------
function api_updateCustomer(payload) {
  try {
    var sh   = getSheet_('CUSTOMERS');
    var data = sh.getDataRange().getValues();
    var h    = data[0];
    var idCol = h.indexOf('cust_id');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) !== String(payload.cust_id)) continue;
      var row = i + 1;
      var set = function(col, val) {
        var c = h.indexOf(col);
        if (c > -1) sh.getRange(row, c+1).setValue(val);
      };
      set('first_name', payload.first_name || '');
      set('last_name',  payload.last_name  || '');
      set('phone1',     payload.phone1     || '');
      set('email',      payload.email      || '');
      set('address',    payload.address    || '');
      set('type',       payload.type       || 'REGULAR');
      set('notes',      payload.notes      || '');
      Logger.log('Customer updated: ' + payload.cust_id);
      return {ok:true};
    }
    // Not found - save as new
    return api_saveCustomer(payload);
  } catch(e) {
    Logger.log('updateCustomer error: ' + e.message);
    return {ok:false, error:e.message};
  }
}

// -- GET ALL CUSTOMERS (for customer portal) ---------------
function api_getCustomers() {
  try {
    var ss = SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty('SHEET_ID') ||
      '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo'
    );
    var sh = ss.getSheetByName('CUSTOMERS');
    if (!sh) return {ok:true, customers:[]};
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return {ok:true, customers:[]};
    var h = data[0];
    var customers = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      var obj = {};
      h.forEach(function(col, idx){ obj[String(col).trim()] = data[i][idx]; });
      obj.name  = (String(obj.first_name||'')+' '+String(obj.last_name||'')).trim();
      obj.phone = String(obj.phone1||'');
      customers.push(obj);
    }
    return {ok:true, customers:customers};
  } catch(e) {
    Logger.log('getCustomers error: ' + e.message);
    return {ok:false, customers:[], error:e.message};
  }
}

// ============================================================
//  DELIVERY POLICY ACCEPTANCE (Step 1 - backend foundation)
//  Additive only. Does not touch sales/inventory/checkout.
// ============================================================
var DELIVERY_SHEET_NAME      = 'DELIVERY_AGREEMENTS';
var DELIVERY_SIG_FOLDER_NAME = 'EDP_Delivery_Signatures';

// Get (or safely auto-create) the DELIVERY_AGREEMENTS sheet with headers.
function getDeliveryAgreementsSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(KEY_SHEET_ID);
  if (!id) throw new Error('SHEET_ID not set. Run setupRegister() first.');
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(DELIVERY_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(DELIVERY_SHEET_NAME);
    sh.appendRow([
      'agreement_id','timestamp','customer_name','phone','zip','address',
      'delivery_fee','miles','zone','policy_version','accepted',
      'signature_url','employee','sale_id','items_summary','notes'
    ]);
  }
  return sh;
}

// Store a signature data-URL to Drive; return a shareable URL ('' if none/invalid).
function saveDeliverySignature_(dataUrl, agreementId) {
  try {
    var s = String(dataUrl || '');
    var comma = s.indexOf(',');
    if (s.indexOf('base64') === -1 || comma === -1) return '';
    var meta = s.substring(0, comma);
    var b64  = s.substring(comma + 1);
    var mime = (meta.match(/data:([^;]+);/) || [null,'image/png'])[1];
    var ext  = (mime.indexOf('jpeg') > -1 || mime.indexOf('jpg') > -1) ? 'jpg' : 'png';
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, 'sig_' + agreementId + '.' + ext);

    var folders = DriveApp.getFoldersByName(DELIVERY_SIG_FOLDER_NAME);
    var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder(DELIVERY_SIG_FOLDER_NAME);
    var file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/uc?id=' + file.getId();
  } catch(e) {
    Logger.log('[saveDeliverySignature_] ' + e.message);
    return '';
  }
}

// Save a delivery policy acceptance. Signature (if provided) goes to Drive;
// only the URL is written to the sheet. Returns a clean serializable object.
function api_saveDeliveryAgreement(payload) {
  try {
    payload = payload || {};
    function numF_(v, def){ var x = parseFloat(v); return isFinite(x) ? x : def; }
    function s_(v){ return (v === null || v === undefined) ? '' : String(v); }

    if (!payload.accepted) {
      return { ok:false, error:'Policy not accepted; agreement not saved.' };
    }

    var agreementId = 'DLV-' + new Date().getTime();
    var now = new Date();
    var signatureUrl = payload.signature ? saveDeliverySignature_(payload.signature, agreementId) : '';

    var sh = getDeliveryAgreementsSheet_();
    sh.appendRow([
      agreementId,
      now,
      s_(payload.customer_name),
      s_(payload.phone),
      s_(payload.zip),
      s_(payload.address),
      numF_(payload.delivery_fee, 0),
      numF_(payload.miles, 0),
      s_(payload.zone),
      s_(payload.policy_version || 'v1'),
      true,
      signatureUrl,
      s_(payload.employee || 'Staff'),
      s_(payload.sale_id),
      s_(payload.items_summary),
      s_(payload.notes)
    ]);

    return {
      ok: true,
      agreement_id: agreementId,
      signature_url: signatureUrl,
      signature_saved: !!signatureUrl
    };
  } catch(e) {
    Logger.log('[api_saveDeliveryAgreement] ' + e.message);
    return { ok:false, error: e.message };
  }
}

// ── PURCHASE INTAKE QUEUE (Phase 1) ──────────────────────────
function ensurePurchasesSheet(){
  var id=PropertiesService.getScriptProperties().getProperty(KEY_SHEET_ID);
  if(!id)throw new Error('SHEET_ID not set. Run setupRegister() first.');
  var ss=SpreadsheetApp.openById(id);
  var sheet=ss.getSheetByName('PURCHASES');
  if(!sheet){
    sheet=ss.insertSheet('PURCHASES',ss.getSheets().length);
    var headers=['purchase_id','date_received','timestamp','employee_name','item_type','item_category','brand','model','serial','part_name','condition','qty','purchase_price','seller_source','seller_phone','location','ready_now','notes','stage','status','promote_when_saved','target_inventory'];
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
  } else {
    var headerRow=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    var requiredHeaders=['purchase_id','date_received','item_type','item_category','brand','seller_source','stage','status'];
    var missingHeaders=[];
    requiredHeaders.forEach(function(h){
      if(headerRow.indexOf(h)<0)missingHeaders.push(h);
    });
    if(missingHeaders.length>0){
      Logger.log('Warning: PURCHASES sheet missing headers: '+missingHeaders.join(', '));
    }
  }
  return sheet;
}

function api_addPurchase(payload){
  try{
    var itemType = String(payload.item_type || '').toUpperCase();
    var itemCategory=payload.item_category;
    var brand=payload.brand;
    var sellerSource=payload.seller_source;
    var partName = String(payload.part_name || '').trim();

    if(!itemType||!itemCategory||!brand||!sellerSource){
      return {ok:false,error:'Missing required fields: item_type, item_category, brand, seller_source'};
    }

    if (itemType === 'PART' && !partName) {
      return {ok:false,error:'Part Name is required for PART purchases'};
    }

    var qty = payload.qty;
    if (qty === undefined || qty === null || qty === '') {
      qty = (itemType === 'APPLIANCE') ? 1 : 0;
    }
    qty = parseInt(qty, 10);

    if (isNaN(qty) || qty < 1) {
      return {ok:false,error:'Quantity must be 1 or more'};
    }

    var price=payload.purchase_price||0;
    if(isNaN(price)||price<0){
      return {ok:false,error:'Purchase price cannot be negative'};
    }

    var purchaseId='PUR-'+new Date().getTime();
    var now=new Date();
    var dateStr=Utilities.formatDate(now,'America/Chicago','yyyy-MM-dd');
    var timeStr=Utilities.formatDate(now,'America/Chicago','HH:mm:ss');
    var employeeName=Session.getEffectiveUser()?Session.getEffectiveUser().getEmail():'Unknown';

    var targetInventory='';
    if(itemType==='APPLIANCE')targetInventory='APPLIANCES';
    else if(itemType==='PART')targetInventory='PARTS';
    else if(itemType==='ELECTRONICS')targetInventory='ELECTRONICS';

    var sheet=ensurePurchasesSheet();
    var row=[
      purchaseId,dateStr,timeStr,employeeName,itemType,itemCategory,brand,
      payload.model||'',payload.serial||'',partName,payload.condition||'',
      qty,price,sellerSource,payload.seller_phone||'',payload.location||'',
      payload.ready_now||'NO',payload.notes||'','RECEIVED','PENDING_VALIDATION','NO',targetInventory
    ];

    sheet.appendRow(row);
    Logger.log('Purchase added: '+purchaseId+' - '+brand+' ('+itemType+')');

    return {ok:true,purchase_id:purchaseId};

  } catch(e){
    Logger.log('Error in api_addPurchase: '+e.toString());
    return {ok:false,error:e.toString()};
  }
}
