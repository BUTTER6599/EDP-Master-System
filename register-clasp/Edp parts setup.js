// ============================================================
//  EDP_Parts_Setup.gs — v1.0.0
//  The Electronics Depot LLC | Metairie, LA 70003
//  Creates PARTS sheet with default parts inventory
//  ES5 ONLY — no const/let/arrow/async/await/backticks
// ============================================================

var PARTS_SHEET_NAME = 'PARTS';

var PARTS_HEADERS = [
  'part_id','appliance_type','part_name','brand','compatible_models',
  'condition','price_used','price_new_aft','price_new_oem','sale_price',
  'qty_in_stock','bin','shelf','cabinet','photos','notes',
  'stage','date_added','added_by','custom_appliance_type','custom_part_name'
];

// ── DEFAULT 44 PARTS ─────────────────────────────────────────
var DEFAULT_PARTS = [
  // WASHER PARTS
  ['P-W001','WASHER','Water Pump','Whirlpool','WTW,LSW,LTE,LSR','USED',20,35,70,20,0,'A1','1','1','','','ACTIVE','','','',''],
  ['P-W002','WASHER','Control Board','Whirlpool','WTW5000,WTW4800,WTW4950','USED',45,75,140,45,0,'A2','1','1','','','ACTIVE','','','',''],
  ['P-W003','WASHER','Actuator','Whirlpool','WTW,LSW','USED',20,35,65,20,0,'A3','1','1','','','ACTIVE','','','',''],
  ['P-W004','WASHER','Motor','Whirlpool','WTW,LSW,LTE','USED',55,85,160,55,0,'A4','1','1','','','ACTIVE','','','',''],
  ['P-W005','WASHER','Drain Hose','Whirlpool','WTW,LSW,GE,ALL','USED',8,15,25,8,0,'A5','2','1','','','ACTIVE','','','',''],
  ['P-W006','WASHER','Cabinet / Outer Case','Whirlpool','WTW,LSW','USED',35,0,0,35,0,'A6','2','1','','','ACTIVE','','','',''],
  ['P-W007','WASHER','Lid Assembly','Whirlpool','WTW,LSW','USED',30,0,0,30,0,'A7','2','1','','','ACTIVE','','','',''],
  ['P-W008','WASHER','Temperature Control','Whirlpool','WTW,LSW,GE','USED',15,25,45,15,0,'A8','2','1','','','ACTIVE','','','',''],
  ['P-W009','WASHER','Water Level Sensor','Whirlpool','WTW,LSW,GE,Maytag','USED',12,20,38,12,0,'A9','3','1','','','ACTIVE','','','',''],
  ['P-W010','WASHER','Agitator','Whirlpool','WTW,LSW,GE,Hotpoint','USED',20,35,60,20,0,'A10','3','1','','','ACTIVE','','','',''],
  // DRYER PARTS
  ['P-D001','DRYER','Control Board','Whirlpool','WED,LER,GEW','USED',40,70,130,40,0,'B1','1','2','','','ACTIVE','','','',''],
  ['P-D002','DRYER','Console Top','Whirlpool','WED,LER','USED',25,0,0,25,0,'B2','1','2','','','ACTIVE','','','',''],
  ['P-D003','DRYER','Door Switch','Whirlpool','WED,LER,GEW,ALL','USED',8,12,22,8,0,'B3','1','2','','','ACTIVE','','','',''],
  ['P-D004','DRYER','Drum','Whirlpool','WED,LER','USED',45,0,0,45,0,'B4','2','2','','','ACTIVE','','','',''],
  ['P-D005','DRYER','Motor','Whirlpool','WED,LER,GEW','USED',50,80,150,50,0,'B5','2','2','','','ACTIVE','','','',''],
  ['P-D006','DRYER','Heating Element','Whirlpool','WED,LER,GEW,Kenmore','NEW_AFT',18,28,55,28,0,'B6','2','2','','','ACTIVE','','','',''],
  ['P-D007','DRYER','Thermostat','Whirlpool','WED,LER,GEW,ALL','USED',10,15,28,10,0,'B7','3','2','','','ACTIVE','','','',''],
  ['P-D008','DRYER','Thermal Fuse','Whirlpool','WED,LER,GEW,ALL','NEW_AFT',6,10,18,10,0,'B8','3','2','','','ACTIVE','','','',''],
  ['P-D009','DRYER','Timer','Whirlpool','WED,LER,GEW','USED',20,35,65,20,0,'B9','3','2','','','ACTIVE','','','',''],
  // REFRIGERATOR PARTS
  ['P-R001','REFRIGERATOR','Door (Full)','GE','GTS,GTE,GTH','USED',55,0,0,55,0,'C1','1','3','','','ACTIVE','','','',''],
  ['P-R002','REFRIGERATOR','Door Gasket / Rubber','GE','GTS,GTE,GTH,ALL','USED',18,28,50,18,0,'C2','1','3','','','ACTIVE','','','',''],
  ['P-R003','REFRIGERATOR','Evaporator Fan (Top)','GE','GTS,GTE,ALL','USED',20,30,55,20,0,'C3','1','3','','','ACTIVE','','','',''],
  ['P-R004','REFRIGERATOR','Evaporator Fan (Bottom)','Frigidaire','FFTR,FFSS,ALL','USED',20,30,55,20,0,'C4','2','3','','','ACTIVE','','','',''],
  ['P-R005','REFRIGERATOR','Shroud / Fan Cover','GE','GTS,GTE','USED',15,0,0,15,0,'C5','2','3','','','ACTIVE','','','',''],
  ['P-R006','REFRIGERATOR','Evaporator Coil','GE','GTS,GTE,ALL','USED',45,75,140,45,0,'C6','2','3','','','ACTIVE','','','',''],
  ['P-R007','REFRIGERATOR','Cold Control / Thermostat','GE','GTS,GTE,Frigidaire','USED',18,28,50,18,0,'C7','3','3','','','ACTIVE','','','',''],
  ['P-R008','REFRIGERATOR','Timer','GE','GTS,GTE,Frigidaire,Kenmore','USED',20,32,58,20,0,'C8','3','3','','','ACTIVE','','','',''],
  ['P-R009','REFRIGERATOR','Control Board','Frigidaire','FFTR,FFSS,FFFC','USED',55,90,165,55,0,'C9','3','3','','','ACTIVE','','','',''],
  ['P-R010','REFRIGERATOR','Compressor Relay','GE','GTS,GTE,Frigidaire,ALL','USED',12,18,32,12,0,'C10','4','3','','','ACTIVE','','','',''],
  ['P-R011','REFRIGERATOR','Door Shelves','GE','GTS,GTE','USED',10,0,0,10,0,'A1','4','1','','','ACTIVE','','','',''],
  ['P-R012','REFRIGERATOR','Crisper Drawer','GE','GTS,GTE,Frigidaire','USED',15,25,45,15,0,'A2','4','1','','','ACTIVE','','','',''],
  ['P-R013','REFRIGERATOR','Crisper Drawer Glass','GE','GTS,GTE,Frigidaire','USED',18,28,50,18,0,'A3','4','1','','','ACTIVE','','','',''],
  ['P-R014','REFRIGERATOR','Shelf Glass / Racks','GE','GTS,GTE,Frigidaire,ALL','USED',12,20,38,12,0,'A4','4','1','','','ACTIVE','','','',''],
  // STOVE PARTS
  ['P-S001','STOVE','Control Board','GE','JB,JGB,WFE','USED',50,80,150,50,0,'B1','4','2','','','ACTIVE','','','',''],
  ['P-S002','STOVE','Control Knobs (each)','GE','JB,JGB,WFE,ALL','USED',8,12,22,8,0,'B2','4','2','','','ACTIVE','','','',''],
  ['P-S003','STOVE','Infinity Switch','Whirlpool','WFE,WCI,WCC','USED',15,22,40,15,0,'B3','4','2','','','ACTIVE','','','',''],
  ['P-S004','STOVE','Glass Top','GE','JB,JGB,JD','USED',55,85,160,55,0,'B4','5','2','','','ACTIVE','','','',''],
  ['P-S005','STOVE','Coil Burner (each)','GE','JB,ALL','USED',10,15,28,10,0,'B5','5','2','','','ACTIVE','','','',''],
  ['P-S006','STOVE','Bake Element','GE','JB,JGB,WFE,Kenmore','NEW_AFT',18,28,52,28,0,'B6','5','2','','','ACTIVE','','','',''],
  ['P-S007','STOVE','Broil Element','GE','JB,JGB,WFE,Kenmore','NEW_AFT',18,28,52,28,0,'B7','5','2','','','ACTIVE','','','',''],
  ['P-S008','STOVE','Terminal Block','GE','JB,JGB,ALL','USED',15,22,40,15,0,'B8','5','2','','','ACTIVE','','','',''],
  ['P-S009','STOVE','Power Cord','GE','JB,JGB,ALL','USED',12,18,32,12,0,'B9','5','2','','','ACTIVE','','','',''],
  // FREEZER PARTS
  ['P-FZ001','FREEZER','Door (Full)','Frigidaire','FFFC,FFFH','USED',45,0,0,45,0,'C1','5','3','','','ACTIVE','','','',''],
  ['P-FZ002','FREEZER','Door Gasket / Rubber','Frigidaire','FFFC,FFFH,GE,Kenmore','USED',15,25,45,15,0,'C2','5','3','','','ACTIVE','','','',''],
  ['P-FZ003','FREEZER','Compressor Relay','Frigidaire','FFFC,FFFH,GE,Kenmore','USED',12,18,32,12,0,'C3','5','3','','','ACTIVE','','','',''],
  ['P-FZ004','FREEZER','Evaporator Fan','Frigidaire','FFFC,FFFH,GE,Kenmore','USED',18,28,50,18,0,'C4','5','3','','','ACTIVE','','','','']
];

// ── SETUP FUNCTION (run once) ─────────────────────────────────
function setupPartsSheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (!id) {
    Logger.log('ERROR: SHEET_ID not set. Run setupRegister() first.');
    return;
  }

  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(PARTS_SHEET_NAME);

  if (sh) {
    Logger.log('PARTS sheet already exists. Checking headers...');
    var existingHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var needsHeaders = existingHeaders[0] !== 'part_id';
    if (!needsHeaders) {
      Logger.log('Headers look good. Sheet has ' + (sh.getLastRow() - 1) + ' parts. No changes made.');
      Logger.log('To force a rebuild, delete the PARTS tab and run this again.');
      return;
    }
  } else {
    Logger.log('PARTS sheet not found. Creating it now...');
    sh = ss.insertSheet(PARTS_SHEET_NAME);
  }

  // Write headers
  sh.getRange(1, 1, 1, PARTS_HEADERS.length).setValues([PARTS_HEADERS]);

  // Format headers
  var headerRange = sh.getRange(1, 1, 1, PARTS_HEADERS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#B8860B');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  headerRange.setWrap(true);
  sh.setFrozenRows(1);

  // Write default parts
  var now = new Date();
  var rows = [];
  for (var i = 0; i < DEFAULT_PARTS.length; i++) {
    var row = DEFAULT_PARTS[i].slice();
    row[17] = now; // date_added
    row[18] = 'Setup';  // added_by
    rows.push(row);
  }
  sh.getRange(2, 1, rows.length, PARTS_HEADERS.length).setValues(rows);

  // Auto-resize columns
  for (var c = 1; c <= PARTS_HEADERS.length; c++) {
    sh.autoResizeColumn(c);
  }

  // Set column widths for key columns
  sh.setColumnWidth(5, 200); // compatible_models
  sh.setColumnWidth(15, 200); // photos
  sh.setColumnWidth(16, 200); // notes

  Logger.log('SUCCESS — PARTS sheet created with ' + DEFAULT_PARTS.length + ' default parts.');
  Logger.log('Next step: Add your actual parts inventory by editing the sheet directly,');
  Logger.log('or use the Purchase Form to add parts when they come in.');
}

// ── ADD CUSTOM PART (called from register + owner) ────────────
function api_addCustomPart(payload) {
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('SHEET_ID');
    if (!id) return { ok: false, error: 'SHEET_ID not set.' };

    var ss = SpreadsheetApp.openById(id);
    var sh = ss.getSheetByName(PARTS_SHEET_NAME);
    if (!sh) return { ok: false, error: 'PARTS sheet not found. Run setupPartsSheet() first.' };

    // Generate part ID
    var lastRow = sh.getLastRow();
    var partId = 'P-CUST-' + new Date().getTime();

    var row = [
      partId,
      String(payload.appliance_type || payload.custom_appliance_type || 'OTHER').toUpperCase(),
      String(payload.part_name || payload.custom_part_name || ''),
      String(payload.brand || ''),
      String(payload.compatible_models || ''),
      String(payload.condition || 'USED').toUpperCase(),
      parseFloat(payload.price_used || 0),
      parseFloat(payload.price_new_aft || 0),
      parseFloat(payload.price_new_oem || 0),
      parseFloat(payload.sale_price || payload.price_used || 0),
      parseInt(payload.qty_in_stock || 0),
      String(payload.bin || ''),
      String(payload.shelf || ''),
      String(payload.cabinet || ''),
      String(payload.photos || ''),
      String(payload.notes || ''),
      'ACTIVE',
      new Date(),
      String(payload.added_by || 'Staff'),
      String(payload.custom_appliance_type || ''),
      String(payload.custom_part_name || '')
    ];

    sh.appendRow(row);
    Logger.log('Custom part added: ' + partId + ' — ' + payload.part_name);
    return { ok: true, part_id: partId };
  } catch(e) {
    Logger.log('addCustomPart error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ── GET PARTS FOR REGISTER ────────────────────────────────────
function api_getPartsBoot() {
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('SHEET_ID');
    if (!id) return { parts: [], error: 'SHEET_ID not set.' };

    var ss = SpreadsheetApp.openById(id);
    var sh = ss.getSheetByName(PARTS_SHEET_NAME);
    if (!sh) return { parts: [], error: 'PARTS sheet not found. Run setupPartsSheet().' };

    var data = sh.getDataRange().getValues();
    if (data.length < 2) return { parts: [] };

    var h = data[0];
    var parts = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var obj = {};
      for (var j = 0; j < h.length; j++) {
        obj[String(h[j]).trim()] = row[j];
      }

      var stage = String(obj['stage'] || 'ACTIVE').toUpperCase();
      if (stage === 'SOLD' || stage === 'INACTIVE') continue;

      var photos = [];
      var photoRaw = String(obj['photos'] || '');
      if (photoRaw.indexOf('http') > -1) {
        photos = photoRaw.split(',').map(function(p) { return p.trim(); }).filter(Boolean);
      }

      var appType = String(obj['custom_appliance_type'] || obj['appliance_type'] || '').toUpperCase().trim() || 'OTHER';
      var partName = String(obj['custom_part_name'] || obj['part_name'] || '').trim();

      parts.push({
        part_id:          String(obj['part_id'] || ''),
        appliance_type:   appType,
        part_name:        partName,
        brand:            String(obj['brand'] || ''),
        compatible_models:String(obj['compatible_models'] || ''),
        condition:        String(obj['condition'] || 'USED').toUpperCase(),
        price_used:       parseFloat(obj['price_used'] || 0),
        price_new_aft:    parseFloat(obj['price_new_aft'] || 0),
        price_new_oem:    parseFloat(obj['price_new_oem'] || 0),
        sale_price:       parseFloat(obj['sale_price'] || obj['price_used'] || 0),
        qty:              parseInt(obj['qty_in_stock'] || 0),
        bin:              String(obj['bin'] || ''),
        shelf:            String(obj['shelf'] || ''),
        cabinet:          String(obj['cabinet'] || ''),
        notes:            String(obj['notes'] || ''),
        photos:           photos
      });
    }

    return { parts: parts };
  } catch(e) {
    Logger.log('getPartsBoot error: ' + e.message);
    return { parts: [], error: e.message };
  }
}

// ── UPDATE PARTS QTY AFTER SALE ───────────────────────────────
function updatePartQtyAfterSale_(partId, qtySold) {
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('SHEET_ID');
    if (!id) return;

    var ss = SpreadsheetApp.openById(id);
    var sh = ss.getSheetByName(PARTS_SHEET_NAME);
    if (!sh) return;

    var data = sh.getDataRange().getValues();
    var h = data[0];
    var idCol  = h.indexOf('part_id');
    var qtyCol = h.indexOf('qty_in_stock');
    var stgCol = h.indexOf('stage');

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(partId)) {
        var current = parseInt(data[i][qtyCol] || 0);
        var newQty  = Math.max(0, current - (qtySold || 1));
        if (qtyCol > -1) sh.getRange(i + 1, qtyCol + 1).setValue(newQty);
        if (newQty === 0 && stgCol > -1) sh.getRange(i + 1, stgCol + 1).setValue('OUT_OF_STOCK');
        break;
      }
    }
  } catch(e) {
    Logger.log('updatePartQty error: ' + e.message);
  }
}