// ============================================================
//  EDP_Service_Setup.gs — v1.0.0
//  The Electronics Depot LLC | Metairie, LA 70003
//  Creates SERVICE, ZONES, DO_NOT_SERVICE sheets
//  ES5 ONLY — no const/let/arrow/async/await/backticks
// ============================================================

var SVC_SHEET    = 'SERVICE';
var ZONE_SHEET   = 'ZONES';
var DNS_SHEET    = 'DO_NOT_SERVICE';
var SHOP_ADDRESS = '7333 Airline Dr, Metairie, LA 70003';

var SVC_HEADERS = [
  'service_id','service_type','service_name','description',
  'base_price','labor_rate_hr','is_adjustable','requires_pin',
  'photos','active','added_by','date_added','notes'
];
var ZONE_HEADERS = ['zone_id','zone_name','min_miles','max_miles','price','notes'];
var DNS_HEADERS  = ['zip_code','area_name','reason','added_by','date_added'];

var DEFAULT_SERVICES = [
  ['SVC-001','DIAGNOSTIC','In-Store Diagnostic','Customer brings appliance to shop. Full diagnostic by tech.',40,0,'YES','NO','','ACTIVE','Setup',new Date(),'Adjust price in Settings'],
  ['SVC-002','DIAGNOSTIC','Home Diagnostic — Zone 1 (0-10 mi)','Tech visits customer home.',40,0,'YES','YES','','ACTIVE','Setup',new Date(),'Owner PIN required to book'],
  ['SVC-003','DIAGNOSTIC','Home Diagnostic — Zone 2 (11-20 mi)','Tech visits customer home.',60,0,'YES','YES','','ACTIVE','Setup',new Date(),'Owner PIN required to book'],
  ['SVC-004','DIAGNOSTIC','Home Diagnostic — Zone 3 (21-30 mi)','Tech visits customer home.',80,0,'YES','YES','','ACTIVE','Setup',new Date(),'Owner PIN required to book'],
  ['SVC-005','DIAGNOSTIC','Home Diagnostic — Zone 4 (31+ mi)','Tech visits customer home. Premium distance.',120,0,'YES','YES','','ACTIVE','Setup',new Date(),'Owner PIN required to book'],
  ['SVC-006','LABOR','Basic Repair','Simple repair — lid switch, belt, drain hose, fuse.',80,80,'YES','NO','','ACTIVE','Setup',new Date(),'Per hour. Adjust in Settings.'],
  ['SVC-007','LABOR','Standard Repair','Moderate repair — pump, motor, thermostat, element.',0,0,'YES','NO','','ACTIVE','Setup',new Date(),'Set your rate in Settings.'],
  ['SVC-008','LABOR','Complex Repair','Advanced repair — control board, transmission.',0,0,'YES','NO','','ACTIVE','Setup',new Date(),'Set your rate in Settings.'],
  ['SVC-009','LABOR','Emergency Repair','Same-day urgent repair. Premium rate.',0,0,'YES','YES','','ACTIVE','Setup',new Date(),'Owner approval required. Set rate in Settings.'],
  ['SVC-010','PRODUCT','Water Hoses — New (Pair)','Standard washer inlet hoses, hot and cold. 4ft.',12,0,'YES','NO','','ACTIVE','Setup',new Date(),'Adjust price in Settings.'],
  ['SVC-011','PRODUCT','Water Hoses — Used (Pair)','Used washer inlet hoses, tested.',5,0,'YES','NO','','ACTIVE','Setup',new Date(),'Adjust price in Settings.'],
  ['SVC-012','PRODUCT','Dryer Vent Hose — New','Standard 4-inch flexible dryer vent hose.',10,0,'YES','NO','','ACTIVE','Setup',new Date(),'Adjust price in Settings.'],
  ['SVC-013','PRODUCT','Dryer Vent Hose — Used','Used dryer vent hose, good condition.',4,0,'YES','NO','','ACTIVE','Setup',new Date(),'Adjust price in Settings.']
];

var DEFAULT_ZONES = [
  ['Z-001','Zone 1 — Local (0-10 mi)',0,10,40,'Metairie and immediate surrounding area'],
  ['Z-002','Zone 2 — Near (11-20 mi)',11,20,60,'New Orleans proper, Kenner, Elmwood'],
  ['Z-003','Zone 3 — Mid (21-30 mi)',21,30,80,'Harvey, Gretna, Marrero, Westwego'],
  ['Z-004','Zone 4 — Far (31+ mi)',31,999,120,'Slidell, LaPlace, Covington and beyond']
];

function setupServiceSheets() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (!id) { Logger.log('ERROR: SHEET_ID not set. Run setupRegister() first.'); return; }
  var ss = SpreadsheetApp.openById(id);

  // SERVICE
  var svcSh = ss.getSheetByName(SVC_SHEET);
  if (svcSh) {
    Logger.log('SERVICE sheet exists. Skipping.');
  } else {
    svcSh = ss.insertSheet(SVC_SHEET);
    svcSh.getRange(1,1,1,SVC_HEADERS.length).setValues([SVC_HEADERS]);
    var shR = svcSh.getRange(1,1,1,SVC_HEADERS.length);
    shR.setFontWeight('bold'); shR.setBackground('#228B22'); shR.setFontColor('#FFF'); shR.setHorizontalAlignment('center');
    svcSh.setFrozenRows(1);
    svcSh.getRange(2,1,DEFAULT_SERVICES.length,SVC_HEADERS.length).setValues(DEFAULT_SERVICES);
    for (var c=1;c<=SVC_HEADERS.length;c++) svcSh.autoResizeColumn(c);
    Logger.log('SERVICE sheet created: ' + DEFAULT_SERVICES.length + ' items.');
  }

  // ZONES
  var zoneSh = ss.getSheetByName(ZONE_SHEET);
  if (zoneSh) {
    Logger.log('ZONES sheet exists. Skipping.');
  } else {
    zoneSh = ss.insertSheet(ZONE_SHEET);
    zoneSh.getRange(1,1,1,ZONE_HEADERS.length).setValues([ZONE_HEADERS]);
    var zR = zoneSh.getRange(1,1,1,ZONE_HEADERS.length);
    zR.setFontWeight('bold'); zR.setBackground('#0066FF'); zR.setFontColor('#FFF');
    zoneSh.setFrozenRows(1);
    zoneSh.getRange(2,1,DEFAULT_ZONES.length,ZONE_HEADERS.length).setValues(DEFAULT_ZONES);
    for (var zc=1;zc<=ZONE_HEADERS.length;zc++) zoneSh.autoResizeColumn(zc);
    Logger.log('ZONES sheet created: ' + DEFAULT_ZONES.length + ' zones.');
  }

  // DO NOT SERVICE
  var dnsSh = ss.getSheetByName(DNS_SHEET);
  if (dnsSh) {
    Logger.log('DO_NOT_SERVICE sheet exists. Skipping.');
  } else {
    dnsSh = ss.insertSheet(DNS_SHEET);
    dnsSh.getRange(1,1,1,DNS_HEADERS.length).setValues([DNS_HEADERS]);
    var dR = dnsSh.getRange(1,1,1,DNS_HEADERS.length);
    dR.setFontWeight('bold'); dR.setBackground('#DC2626'); dR.setFontColor('#FFF');
    dnsSh.setFrozenRows(1);
    dnsSh.appendRow(['','Example: 70127','High risk area — do not service','Setup',new Date()]);
    for (var dc=1;dc<=DNS_HEADERS.length;dc++) dnsSh.autoResizeColumn(dc);
    Logger.log('DO_NOT_SERVICE sheet created. Fill in zip codes as needed.');
  }

  Logger.log('=== SETUP COMPLETE === Shop: ' + SHOP_ADDRESS);
}

function api_getServiceItems() {
  try {
    var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) return {items:[],zones:[],error:'SHEET_ID not set.'};
    var ss = SpreadsheetApp.openById(id);
    var items=[], zones=[], dnsZips=[];

    var svcSh = ss.getSheetByName(SVC_SHEET);
    if (svcSh) {
      var data=svcSh.getDataRange().getValues(), h=data[0];
      for (var i=1;i<data.length;i++) {
        var obj={};
        for (var j=0;j<h.length;j++) obj[String(h[j]).trim()]=data[i][j];
        if (String(obj['active']||'').toUpperCase()==='ACTIVE') {
          var photos=[];
          var pr=String(obj['photos']||'');
          if(pr.indexOf('http')>-1) photos=pr.split(',').map(function(p){return p.trim();}).filter(Boolean);
          items.push({
            service_id:   String(obj['service_id']||''),
            service_type: String(obj['service_type']||''),
            service_name: String(obj['service_name']||''),
            description:  String(obj['description']||''),
            base_price:   parseFloat(obj['base_price']||0),
            labor_rate:   parseFloat(obj['labor_rate_hr']||0),
            requires_pin: String(obj['requires_pin']||'NO').toUpperCase()==='YES',
            photos:       photos,
            notes:        String(obj['notes']||'')
          });
        }
      }
    }

    var zoneSh = ss.getSheetByName(ZONE_SHEET);
    if (zoneSh) {
      var zdata=zoneSh.getDataRange().getValues(), zh=zdata[0];
      for (var zi=1;zi<zdata.length;zi++) {
        var zobj={};
        for (var zj=0;zj<zh.length;zj++) zobj[String(zh[zj]).trim()]=zdata[zi][zj];
        zones.push({zone_id:String(zobj['zone_id']||''),zone_name:String(zobj['zone_name']||''),min_miles:parseFloat(zobj['min_miles']||0),max_miles:parseFloat(zobj['max_miles']||999),price:parseFloat(zobj['price']||0)});
      }
    }

    var dnsSh = ss.getSheetByName(DNS_SHEET);
    if (dnsSh) {
      var ddata=dnsSh.getDataRange().getValues();
      for (var di=1;di<ddata.length;di++) { var z=String(ddata[di][0]||'').trim(); if(z&&z.length===5) dnsZips.push(z); }
    }

    return {items:items,zones:zones,dnsZips:dnsZips,shopAddress:SHOP_ADDRESS};
  } catch(e) { return {items:[],zones:[],error:e.message}; }
}

function api_updateServicePrice(payload) {
  try {
    var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) return {ok:false,error:'SHEET_ID not set.'};
    var sh = SpreadsheetApp.openById(id).getSheetByName(SVC_SHEET);
    if (!sh) return {ok:false,error:'SERVICE sheet not found.'};
    var data=sh.getDataRange().getValues(), h=data[0];
    var idC=h.indexOf('service_id'), prC=h.indexOf('base_price'), lrC=h.indexOf('labor_rate_hr');
    for (var i=1;i<data.length;i++) {
      if (String(data[i][idC])===String(payload.service_id)) {
        if (payload.base_price!==undefined&&prC>-1) sh.getRange(i+1,prC+1).setValue(parseFloat(payload.base_price)||0);
        if (payload.labor_rate!==undefined&&lrC>-1) sh.getRange(i+1,lrC+1).setValue(parseFloat(payload.labor_rate)||0);
        return {ok:true};
      }
    }
    return {ok:false,error:'Service not found.'};
  } catch(e) { return {ok:false,error:e.message}; }
}

function api_addCustomService(payload) {
  try {
    var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) return {ok:false,error:'SHEET_ID not set.'};
    var sh = SpreadsheetApp.openById(id).getSheetByName(SVC_SHEET);
    if (!sh) return {ok:false,error:'SERVICE sheet not found.'};
    var svcId='SVC-CUST-'+new Date().getTime();
    sh.appendRow([svcId,'CUSTOM',String(payload.service_name||'Custom Service'),String(payload.description||''),parseFloat(payload.base_price||0),0,'YES','NO','','ACTIVE',String(payload.added_by||'Staff'),new Date(),String(payload.notes||'')]);
    return {ok:true,service_id:svcId};
  } catch(e) { return {ok:false,error:e.message}; }
}

function api_getDistanceFromShop(customerAddress) {
  try {
    if (!customerAddress||!customerAddress.trim()) return {ok:false,error:'No address provided.'};
    var directions = Maps.newDirectionFinder()
      .setOrigin(SHOP_ADDRESS)
      .setDestination(customerAddress.trim())
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .getDirections();
    if (!directions||!directions.routes||!directions.routes.length) return {ok:false,error:'Could not calculate distance. Check address.'};
    var leg=directions.routes[0].legs[0];
    var miles=parseFloat((leg.distance.value*0.000621371).toFixed(1));
    return {ok:true,miles:miles,duration:leg.duration.text,address:leg.end_address};
  } catch(e) { return {ok:false,error:e.message}; }
}

function api_checkDoNotService(zipCode) {
  try {
    var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) return {blocked:false};
    var sh = SpreadsheetApp.openById(id).getSheetByName(DNS_SHEET);
    if (!sh) return {blocked:false};
    var data=sh.getDataRange().getValues(), zip=String(zipCode||'').trim();
    for (var i=1;i<data.length;i++) {
      if (String(data[i][0]||'').trim()===zip) return {blocked:true,area:String(data[i][1]||''),reason:String(data[i][2]||'This area is not currently serviced.')};
    }
    return {blocked:false};
  } catch(e) { return {blocked:false}; }
}
