// EDP_Customers_Setup.gs
// Run setupCustomersSheet() once to create/fix the CUSTOMERS tab
// Also contains all customer API functions used by the register

var CUST_SHEET = 'CUSTOMERS';
var CUST_HEADERS = [
  'cust_id',      // EDP-XXXX
  'first_name',
  'last_name',
  'phone1',       // primary phone
  'phone2',       // secondary contact phone
  'phone2_name',  // name of secondary contact
  'phone3',       // third contact phone
  'phone3_name',  // name of third contact
  'email',
  'address',
  'type',         // REGULAR, TENANT, PICKER, VIP, SUPER_VIP
  'date_added',
  'last_visit',
  'added_by',
  'total_spent',
  'visit_count',
  'notes',
  'portal_active' // TRUE/FALSE
];

function getCustomerSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID') || '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo';
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(CUST_SHEET);
  if (!sh) sh = ss.insertSheet(CUST_SHEET);
  return sh;
}

// ── SETUP (run once) ─────────────────────────────────────────
function setupCustomersSheet() {
  var sh = getCustomerSheet_();

  // Write headers
  sh.getRange(1, 1, 1, CUST_HEADERS.length).setValues([CUST_HEADERS]);

  // Format header row
  var hRange = sh.getRange(1, 1, 1, CUST_HEADERS.length);
  hRange.setFontWeight('bold');
  hRange.setBackground('#1E1E1E');
  hRange.setFontColor('#F97316');
  hRange.setHorizontalAlignment('center');
  hRange.setWrap(true);
  sh.setFrozenRows(1);

  // Column widths
  sh.setColumnWidth(1, 110);  // cust_id
  sh.setColumnWidth(2, 130);  // first_name
  sh.setColumnWidth(3, 130);  // last_name
  sh.setColumnWidth(4, 130);  // phone1
  sh.setColumnWidth(5, 130);  // phone2
  sh.setColumnWidth(6, 130);  // phone2_name
  sh.setColumnWidth(7, 130);  // phone3
  sh.setColumnWidth(8, 130);  // phone3_name
  sh.setColumnWidth(9, 180);  // email
  sh.setColumnWidth(10, 220); // address
  sh.setColumnWidth(11, 110); // type
  sh.setColumnWidth(12, 110); // date_added
  sh.setColumnWidth(13, 110); // last_visit
  sh.setColumnWidth(14, 100); // added_by
  sh.setColumnWidth(15, 100); // total_spent
  sh.setColumnWidth(16, 90);  // visit_count
  sh.setColumnWidth(17, 220); // notes
  sh.setColumnWidth(18, 100); // portal_active

  // Type dropdown validation
  var typeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['REGULAR','TENANT','PICKER','VIP','SUPER_VIP'], true)
    .setAllowInvalid(false).build();
  sh.getRange(2, 11, 1000, 1).setDataValidation(typeRule);

  Logger.log('CUSTOMERS sheet ready.');
  SpreadsheetApp.getUi().alert('CUSTOMERS sheet is set up with ' + CUST_HEADERS.length + ' columns.');
}

// ── GENERATE UNIQUE EDP ID ───────────────────────────────────
function generateCustId_(existingIds) {
  var id = 'EDP-' + Math.floor(3000 + Math.random() * 7000);
  var attempts = 0;
  while (existingIds.indexOf(id) > -1 && attempts < 100) {
    id = 'EDP-' + Math.floor(3000 + Math.random() * 7000);
    attempts++;
  }
  return id;
}

// ── SAVE CUSTOMER ────────────────────────────────────────────
function api_saveCustomer(payload) {
  try {
    var firstName = String(payload.first_name || payload.name || '').trim();
    var lastName  = String(payload.last_name  || '').trim();
    var phone1    = String(payload.phone1 || payload.phone || '').replace(/[^0-9]/g, '');
    var phone2    = String(payload.phone2     || '');
    var phone2n   = String(payload.phone2_name|| '');
    var phone3    = String(payload.phone3     || '');
    var phone3n   = String(payload.phone3_name|| '');
    var email     = String(payload.email      || '');
    var address   = String(payload.address    || '');
    var type      = String(payload.type       || 'REGULAR');
    var addedBy   = String(payload.added_by   || 'Staff');
    var today     = new Date().toISOString().split('T')[0];

    // Skip if completely blank
    if (!firstName && !lastName && !phone1) {
      return {ok: false, error: 'No customer info provided.'};
    }

    var sh   = getCustomerSheet_();
    var data = sh.getDataRange().getValues();
    var h    = data[0];

    var idCol    = h.indexOf('cust_id');
    var p1Col    = h.indexOf('phone1');
    var fnCol    = h.indexOf('first_name');
    var lnCol    = h.indexOf('last_name');

    // Check for existing customer by phone
    for (var i = 1; i < data.length; i++) {
      if (!data[i][idCol]) continue;
      var existPhone = String(data[i][p1Col] || '').replace(/[^0-9]/g, '');
      if (phone1.length >= 7 && phone1 === existPhone) {
        // Update last visit and visit count
        var lvCol  = h.indexOf('last_visit');
        var vcCol  = h.indexOf('visit_count');
        if (lvCol > -1) sh.getRange(i+1, lvCol+1).setValue(today);
        if (vcCol > -1) sh.getRange(i+1, vcCol+1).setValue((parseInt(data[i][vcCol]||0)+1));
        return {ok: true, custId: String(data[i][idCol]), existing: true,
                first_name: String(data[i][fnCol]||''), last_name: String(data[i][lnCol]||'')};
      }
    }

    // New customer
    var existingIds = data.slice(1).map(function(r){return String(r[idCol]);});
    var custId = generateCustId_(existingIds);

    var row = [];
    for (var x = 0; x < CUST_HEADERS.length; x++) row[x] = '';
    var set = function(col, val) {
      var c = CUST_HEADERS.indexOf(col);
      if (c > -1) row[c] = val;
    };
    set('cust_id',      custId);
    set('first_name',   firstName);
    set('last_name',    lastName);
    set('phone1',       phone1.length > 0 ? payload.phone1||payload.phone||'' : '');
    set('phone2',       phone2);
    set('phone2_name',  phone2n);
    set('phone3',       phone3);
    set('phone3_name',  phone3n);
    set('email',        email);
    set('address',      address);
    set('type',         type);
    set('date_added',   today);
    set('last_visit',   today);
    set('added_by',     addedBy);
    set('total_spent',  0);
    set('visit_count',  1);
    set('notes',        '');
    set('portal_active',false);

    sh.appendRow(row);
    Logger.log('Customer saved: ' + custId + ' - ' + firstName + ' ' + lastName);
    return {ok: true, custId: custId, existing: false};
  } catch(e) {
    Logger.log('saveCustomer error: ' + e.message);
    return {ok: false, error: e.message};
  }
}

// ── GET ALL CUSTOMERS (for search) ──────────────────────────
function api_getCustomers() {
  try {
    var sh   = getCustomerSheet_();
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return {ok: true, customers: []};
    var h = data[0];
    var customers = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      var obj = {};
      h.forEach(function(col, idx) { obj[col] = data[i][idx]; });
      // Build combined name and phone for search
      obj.name  = (String(obj.first_name||'')+' '+String(obj.last_name||'')).trim();
      obj.phone = String(obj.phone1||'');
      customers.push(obj);
    }
    return {ok: true, customers: customers};
  } catch(e) {
    Logger.log('getCustomers error: ' + e.message);
    return {ok: false, customers: [], error: e.message};
  }
}

// ── DELETE CUSTOMER (owner PIN required on frontend) ─────────
function api_deleteCustomer(payload) {
  try {
    var sh   = getCustomerSheet_();
    var data = sh.getDataRange().getValues();
    var h    = data[0];
    var idCol = h.indexOf('cust_id');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(payload.cust_id)) {
        sh.deleteRow(i + 1);
        Logger.log('Customer deleted: ' + payload.cust_id);
        return {ok: true};
      }
    }
    return {ok: false, error: 'Customer not found: ' + payload.cust_id};
  } catch(e) {
    Logger.log('deleteCustomer error: ' + e.message);
    return {ok: false, error: e.message};
  }
}

// ── UPDATE CUSTOMER TOTAL SPENT ──────────────────────────────
function api_updateCustomerSpend(custId, amount) {
  try {
    var sh   = getCustomerSheet_();
    var data = sh.getDataRange().getValues();
    var h    = data[0];
    var idCol = h.indexOf('cust_id');
    var tsCol = h.indexOf('total_spent');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(custId)) {
        var current = parseFloat(data[i][tsCol] || 0);
        sh.getRange(i+1, tsCol+1).setValue(current + parseFloat(amount||0));
        return {ok: true};
      }
    }
    return {ok: false};
  } catch(e) {
    return {ok: false, error: e.message};
  }
}

// -- DEBUG: Run this directly in GAS editor to test ──────────
function debugCustomers() {
  var ss = SpreadsheetApp.openById('1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo');
  var sheets = ss.getSheets().map(function(s){return s.getName();});
  Logger.log('All sheets: ' + sheets.join(', '));
  var sh = ss.getSheetByName('CUSTOMERS');
  if (!sh) { Logger.log('CUSTOMERS sheet NOT FOUND'); return; }
  var data = sh.getDataRange().getValues();
  Logger.log('Rows found: ' + data.length);
  Logger.log('Headers: ' + data[0].join(' | '));
  if (data.length > 1) Logger.log('Row 2: ' + data[1].join(' | '));
  if (data.length > 2) Logger.log('Row 3: ' + data[2].join(' | '));
  var result = api_getCustomers();
  Logger.log('api_getCustomers returned: ' + JSON.stringify(result));
}