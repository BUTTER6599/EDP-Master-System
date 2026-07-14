// EDP_Appliances_Setup.gs
// Run setupAppliancesSheet() once to create the APPLIANCES tab
// in your existing EDP Google Sheet with headers and starter inventory

var APPLIANCES_SHEET_NAME = 'APPLIANCES';

function setupAppliancesSheet() {
  var props = PropertiesService.getScriptProperties();
  var id    = props.getProperty('SHEET_ID');
  if (!id) {
    id = '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo';
    props.setProperty('SHEET_ID', id);
  }

  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(APPLIANCES_SHEET_NAME);

  // Create tab if it doesn't exist
  if (!sh) {
    sh = ss.insertSheet(APPLIANCES_SHEET_NAME);
    Logger.log('Created APPLIANCES tab.');
  } else {
    Logger.log('APPLIANCES tab already exists — updating headers only.');
  }

  // ── HEADERS ──────────────────────────────────────────────
  var headers = [
    'item_id',
    'sku_id',
    'category',
    'brand',
    'model',
    'serial',
    'condition',
    'list_price',
    'cost_basis',
    'rating',
    'warranty_tier',
    'fuel_type',
    'notes',
    'stage',
    'status',
    'days_on_hand',
    'date_acquired',
    'added_by',
    'photos',
    'manager_approved'
  ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Format header row
  var headerRange = sh.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1E1E1E');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  headerRange.setWrap(true);
  sh.setFrozenRows(1);
  sh.setColumnWidth(1,  120); // item_id
  sh.setColumnWidth(2,  120); // sku_id
  sh.setColumnWidth(3,  110); // category
  sh.setColumnWidth(4,  110); // brand
  sh.setColumnWidth(5,  160); // model
  sh.setColumnWidth(6,  120); // serial
  sh.setColumnWidth(7,  120); // condition
  sh.setColumnWidth(8,   90); // list_price
  sh.setColumnWidth(9,   90); // cost_basis
  sh.setColumnWidth(10,  70); // rating
  sh.setColumnWidth(11, 110); // warranty_tier
  sh.setColumnWidth(12,  90); // fuel_type
  sh.setColumnWidth(13, 200); // notes
  sh.setColumnWidth(14, 130); // stage
  sh.setColumnWidth(15, 110); // status
  sh.setColumnWidth(16,  90); // days_on_hand
  sh.setColumnWidth(17, 120); // date_acquired
  sh.setColumnWidth(18, 110); // added_by
  sh.setColumnWidth(19, 300); // photos
  sh.setColumnWidth(20, 120); // manager_approved

  // ── DATA VALIDATION ──────────────────────────────────────
  var lastRow = 1000;

  // condition
  var condRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['WORKING','BROKEN-REPAIR','BROKEN-PARTS','UNKNOWN'], true)
    .setAllowInvalid(false).build();
  sh.getRange(2, 7, lastRow, 1).setDataValidation(condRule);

  // stage
  var stageRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      'PURCHASED','DIAGNOSTIC','REPAIR','WAITING_PARTS',
      'TROUBLESHOOTING','PAINT','CLEAN','FINAL_TEST',
      'FLOOR_READY','SOLD','SCRAP'
    ], true).setAllowInvalid(false).build();
  sh.getRange(2, 14, lastRow, 1).setDataValidation(stageRule);

  // status
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['AVAILABLE','SOLD','HOLD','SCRAP'], true)
    .setAllowInvalid(false).build();
  sh.getRange(2, 15, lastRow, 1).setDataValidation(statusRule);

  // category
  var catRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['WASHER','DRYER','STOVE','REFRIGERATOR','FREEZER'], true)
    .setAllowInvalid(false).build();
  sh.getRange(2, 3, lastRow, 1).setDataValidation(catRule);

  // fuel_type
  var fuelRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['ELECTRIC','GAS',''], true)
    .setAllowInvalid(true).build();
  sh.getRange(2, 12, lastRow, 1).setDataValidation(fuelRule);

  // ── STARTER INVENTORY ────────────────────────────────────
  // Only add starter rows if sheet is brand new (only header row exists)
  if (sh.getLastRow() <= 1) {
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var starter = [
      ['SGW-001','SGW-001','STOVE',    'GE',        'JGB660',       'GE-001',  'WORKING',395,40,5,'90-DAY','GAS',     'Ray/Angela purchase $40',         'FLOOR_READY','AVAILABLE',0,today,'Taylor','',true],
      ['RTB-001','RTB-001','REFRIGERATOR','Whirlpool','WRS325SDHZ', 'WP-001',  'WORKING',185,40,4,'90-DAY','',        'Ray/Angela purchase $40',         'FLOOR_READY','AVAILABLE',0,today,'Taylor','',false],
      ['RTB-002','RTB-002','REFRIGERATOR','Whirlpool','WRS325SDHZ', 'WP-002',  'WORKING',185,40,4,'90-DAY','',        'Ray/Angela purchase $40',         'FLOOR_READY','AVAILABLE',0,today,'Taylor','',false],
      ['RTB-003','RTB-003','REFRIGERATOR','Whirlpool','WRS325SDHZ', 'WP-003',  'WORKING',185,40,4,'90-DAY','',        'Chris Beckham purchase $40',      'FLOOR_READY','AVAILABLE',0,today,'Taylor','',false],
      ['DEW-001','DEW-001','DRYER',    'GE',        'GTD65EBSJWS',  'GE-D001', 'WORKING',165,30,3,'90-DAY','ELECTRIC','Needs roller wheels - purchase $30','FLOOR_READY','AVAILABLE',0,today,'Taylor','',false]
    ];
    sh.getRange(2, 1, starter.length, headers.length).setValues(starter);
    Logger.log('Added ' + starter.length + ' starter appliances.');
  } else {
    Logger.log('Sheet already has data — skipped starter rows.');
  }

  // Alternate row colors for readability
  for (var r = 2; r <= sh.getLastRow(); r++) {
    var color = (r % 2 === 0) ? '#F9F9F9' : '#FFFFFF';
    sh.getRange(r, 1, 1, headers.length).setBackground(color);
  }

  Logger.log('setupAppliancesSheet() complete.');
  SpreadsheetApp.getUi().alert('APPLIANCES sheet is ready! ' + (sh.getLastRow()-1) + ' appliances loaded.');
}

// ── API FUNCTION ─────────────────────────────────────────────
// Called by the register to get all floor-ready appliances
function api_getAppliances() {
  try {
    var props = PropertiesService.getScriptProperties();
    var id    = props.getProperty('SHEET_ID') || '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo';
    var ss    = SpreadsheetApp.openById(id);
    var sh    = ss.getSheetByName(APPLIANCES_SHEET_NAME);
    if (!sh) return { ok: false, error: 'APPLIANCES sheet not found. Run setupAppliancesSheet() first.' };

    var data = sh.getDataRange().getValues();
    var h    = data[0];
    var items = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue; // skip empty rows
      var item = {};
      h.forEach(function(col, idx) { item[String(col).trim()] = row[idx]; });

      // Only return floor-ready available items (normalized like api_getRegisterBoot)
      var _stg = String(item.stage  == null ? '' : item.stage ).toUpperCase().trim();
      var _sts = String(item.status == null ? '' : item.status).toUpperCase().trim();
      if (_stg === 'FLOOR_READY' && _sts === 'AVAILABLE') {
        // Update days on hand
        if (item.date_acquired) {
          var acquired = new Date(item.date_acquired);
          var today2   = new Date();
          var diff     = Math.floor((today2 - acquired) / (1000 * 60 * 60 * 24));
          item.days_on_hand = diff;
          // Write back to sheet
          var dohCol = h.indexOf('days_on_hand');
          if (dohCol > -1) sh.getRange(i+1, dohCol+1).setValue(diff);
        }

        // Parse photos
        item.photos = item.photos ? String(item.photos).split(',').filter(function(p){ return p.trim(); }) : [];
        items.push(item);
      }
    }

    return { ok: true, appliances: items };
  } catch(e) {
    Logger.log('api_getAppliances error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// Mark appliance as sold (called after register sale)
function api_markApplianceSold(itemId) {
  try {
    var props = PropertiesService.getScriptProperties();
    var id    = props.getProperty('SHEET_ID') || '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo';
    var ss    = SpreadsheetApp.openById(id);
    var sh    = ss.getSheetByName(APPLIANCES_SHEET_NAME);
    if (!sh) return { ok: false, error: 'APPLIANCES sheet not found.' };

    var data  = sh.getDataRange().getValues();
    var h     = data[0];
    var idCol = h.indexOf('item_id');
    var stCol = h.indexOf('status');
    var sgCol = h.indexOf('stage');

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(itemId)) {
        sh.getRange(i+1, stCol+1).setValue('SOLD');
        sh.getRange(i+1, sgCol+1).setValue('SOLD');
        Logger.log('Marked sold: ' + itemId);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Item not found: ' + itemId };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}
