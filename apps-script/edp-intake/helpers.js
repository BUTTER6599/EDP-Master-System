// ============================================================
// helpers.gs - EDP Intake
// Version: v1.1.0
// Last Updated: 2026-05-14
// Change: Sticker scanner via Gemini 2.0-flash + Vision OCR fallback.
//   Universal across all ticket types. edpListTicketPhotos now tags
//   each entry with kind ('sticker' | 'photo'). New helpers
//   edpNextPhotoSeq + edpNextStickerSeq enumerate the folder directly
//   so sticker and regular photo numbering stay independent.
// v1.0.9 carries: first_photo_url cache + thumb URL suffix.
// v1.0.8.1 carries: item_id prefix system.
// v1.0.6 carries: edpAppendByHeader for TICKETS writes.
// ES5 only. ASCII only.
// ============================================================

var EDP_SHEET_ID_PROP  = 'SHEET_ID';
var EDP_TAB_TICKETS    = 'TICKETS';
var EDP_TAB_HISTORY    = 'STAGE_HISTORY';
var EDP_TAB_EMPLOYEES  = 'EMPLOYEES';
var EDP_TAB_VENDORS    = 'VENDORS';
var EDP_TAB_ARCHIVE    = 'ARCHIVE';
var EDP_TAB_AUDIT      = 'AUDIT_LOG';
var EDP_TAB_APPLIANCES = 'APPLIANCES';

var EDP_STAGES = [
  'RECEIVED', 'DIAGNOSTIC', 'REPAIR',
  'CLEAN', 'PAINT', 'FINAL_TEST',
  'FLOOR_READY', 'COMPLETE'
];

var EDP_TICKET_COLUMNS = [
  'ticket_id', 'created_at', 'created_by', 'intake_type',
  'category', 'fuel_type',
  'brand', 'model', 'serial', 'notes',
  'current_stage',
  'customer_name', 'customer_phone_1', 'customer_phone_2', 'customer_email',
  'seller',
  'purchase_price',
  'appliance_item_id',
  'last_updated', 'last_updated_by',
  'photo_count', 'photo_folder_id',
  'first_photo_url'
];

// Drive folder layout for ticket photos. The roots are created lazily by
// edpEnsurePhotoRoots() and the resulting IDs are cached as Script Properties.
var EDP_PHOTOS_ROOT_NAME   = 'EDP_PHOTOS';
var EDP_PHOTOS_INTAKE_NAME = 'INTAKE';
var EDP_PHOTOS_ROOT_PROP   = 'EDP_PHOTOS_ROOT_ID';
var EDP_PHOTOS_INTAKE_PROP = 'EDP_PHOTOS_INTAKE_ID';
var EDP_PHOTO_VIEW_PREFIX  = 'https://lh3.googleusercontent.com/d/';
var EDP_PHOTO_VIEW_SUFFIX  = '=w2000';
var EDP_PHOTO_THUMB_SUFFIX = '=w400';
var EDP_PHOTO_MAX_PER_TICKET = 100;
var EDP_LABELS_FILENAME       = '_labels.json';
var EDP_PHOTO_LABEL_MAX_LEN   = 500;

var EDP_HISTORY_COLUMNS = [
  'history_id', 'ticket_id',
  'from_stage', 'to_stage',
  'transitioned_by', 'transitioned_at',
  'duration_minutes'
];

var EDP_VENDOR_COLUMNS = [
  'vendor_id', 'name', 'phone', 'notes', 'created_at', 'created_by'
];

var EDP_EMPLOYEE_COLUMNS = ['pin_id', 'name', 'role', 'active'];

var EDP_ARCHIVE_EXTRA_COLUMNS = ['archived_at', 'archived_by', 'restore_deadline'];
var EDP_ARCHIVE_COLUMNS = EDP_TICKET_COLUMNS.concat(EDP_ARCHIVE_EXTRA_COLUMNS);

var EDP_AUDIT_COLUMNS = [
  'log_id', 'timestamp', 'actor', 'actor_role', 'ticket_id',
  'action', 'field_changed', 'old_value', 'new_value', 'notes'
];

// ============================================================
// v1.2.0: Split intake -- WARRANTY_TICKETS + REPAIR_TICKETS sheets
// (separate from TICKETS, which now holds PURCHASE only). Sheets and
// folder roots are created lazily on first save.
// ============================================================
var EDP_TAB_WARRANTY = 'WARRANTY_TICKETS';
var EDP_TAB_REPAIR   = 'REPAIR_TICKETS';

var EDP_WARRANTY_COLUMNS = [
  'ticket_id', 'created_at', 'created_by', 'intake_type',
  'category', 'brand', 'model', 'serial',
  'customer_name', 'customer_phone_1', 'customer_phone_2', 'customer_email',
  'original_sale_date', 'warranty_issue',
  'notes',
  'photo_folder_url', 'photo_folder_id', 'photo_count',
  'status',
  'resolution_notes', 'resolved_at', 'resolved_by'
];

var EDP_REPAIR_COLUMNS = [
  'ticket_id', 'created_at', 'created_by', 'intake_type',
  'category', 'brand', 'model', 'serial',
  'customer_name', 'customer_phone_1', 'customer_phone_2', 'customer_email',
  'problem_description', 'diagnostic_notes', 'drop_off_date',
  'notes',
  'photo_folder_url', 'photo_folder_id', 'photo_count',
  'status',
  'diagnostic_quote', 'final_cost',
  'completed_at', 'completed_by'
];

// Drive subfolder names for the v1.2.0 split. WARRANTY_TICKETS photos
// land under EDP_PHOTOS/WARRANTY/<W-id>/; repairs under REPAIRS/<R-id>/.
var EDP_PHOTOS_WARRANTY_NAME = 'WARRANTY';
var EDP_PHOTOS_REPAIRS_NAME  = 'REPAIRS';
var EDP_PHOTOS_WARRANTY_PROP = 'EDP_PHOTOS_WARRANTY_ID';
var EDP_PHOTOS_REPAIRS_PROP  = 'EDP_PHOTOS_REPAIRS_ID';

// Existing APPLIANCES schema on the master sheet. DO NOT modify; this tab
// is shared with Register / Customer App / Owner Dashboard.
var EDP_APPLIANCE_COLUMNS = [
  'item_id', 'sku_id', 'category', 'brand', 'model', 'serial',
  'condition', 'list_price', 'cost_basis', 'rating', 'warranty_tier',
  'fuel_type', 'notes', 'stage', 'status', 'days_on_hand',
  'date_acquired', 'added_by', 'photo_links'
];


function edpGetSheet(tabName) {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty(EDP_SHEET_ID_PROP);
  if (!sheetId) {
    throw new Error('SHEET_ID property is not set in Script Properties.');
  }
  var book = SpreadsheetApp.openById(sheetId);
  var sheet = book.getSheetByName(tabName);
  if (!sheet) {
    throw new Error('Sheet tab not found: ' + tabName +
      '. Run the relevant setup function from the script editor.');
  }
  return sheet;
}

function edpReadRows(tabName, columns) {
  var sheet = edpGetSheet(tabName);
  var values = sheet.getDataRange().getValues();
  var out = [];
  if (values.length < 2) return out;
  var headers = values[0];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row[0]) continue;
    var obj = {};
    for (var c = 0; c < columns.length; c++) {
      var col = columns[c];
      var idx = headers.indexOf(col);
      obj[col] = idx >= 0 ? row[idx] : '';
    }
    obj._rowIndex = r + 1;
    out.push(obj);
  }
  return out;
}

function edpRowToArray(obj, columns) {
  var row = [];
  for (var i = 0; i < columns.length; i++) {
    var v = obj[columns[i]];
    row.push(v === undefined || v === null ? '' : v);
  }
  return row;
}

// Append a row to a sheet by mapping a dict to the ACTUAL header row order
// at write time. Use this for any tab whose schema can change via column
// inserts or reorders. Throws if the sheet has no header row.
function edpAppendByHeader(sheet, dict) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) {
    throw new Error('Sheet has no header row: ' + sheet.getName());
  }
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var newRow = [];
  for (var i = 0; i < headerRow.length; i++) {
    var name = String(headerRow[i] || '').trim();
    if (dict.hasOwnProperty(name) &&
        dict[name] !== undefined &&
        dict[name] !== null) {
      newRow.push(dict[name]);
    } else {
      newRow.push('');
    }
  }
  sheet.appendRow(newRow);
}

function edpNextTicketId() {
  var tz = Session.getScriptTimeZone() || 'America/Chicago';
  var today = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
  var prefix = 'EDP-' + today + '-';
  var sheet = edpGetSheet(EDP_TAB_TICKETS);
  var rows = sheet.getDataRange().getValues();
  var max = 0;
  for (var i = 1; i < rows.length; i++) {
    var id = rows[i][0];
    if (id && String(id).indexOf(prefix) === 0) {
      var tail = String(id).substring(prefix.length);
      var n = parseInt(tail, 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var seq = String(max + 1);
  while (seq.length < 3) seq = '0' + seq;
  return prefix + seq;
}

function edpNowIso() {
  return new Date().toISOString();
}

// Universal display-time date format. Use everywhere a date is rendered
// to the user. Sheet storage stays in ISO; only display goes through this.
// Example output: "Mon, May 12, 2026 10:45 PM"
function edpFormatDate(date) {
  if (!date) return '';
  var d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var hh = d.getHours();
  var mm = d.getMinutes();
  var ampm = (hh >= 12) ? 'PM' : 'AM';
  hh = hh % 12;
  if (hh === 0) hh = 12;
  if (mm < 10) mm = '0' + mm;
  return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() +
         ', ' + d.getFullYear() + ' ' + hh + ':' + mm + ' ' + ampm;
}

function edpAgeDays(iso) {
  if (!iso) return 0;
  try {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return 0;
    var ms = new Date().getTime() - t;
    var days = Math.floor(ms / (1000 * 60 * 60 * 24));
    return days < 0 ? 0 : days;
  } catch (e) {
    return 0;
  }
}

// Stages visible for a given intake type. Warranty/Repair skip CLEAN and PAINT.
function edpStagesFor(intakeType) {
  if (intakeType === 'WARRANTY' || intakeType === 'REPAIR') {
    var out = [];
    for (var i = 0; i < EDP_STAGES.length; i++) {
      var s = EDP_STAGES[i];
      if (s === 'CLEAN' || s === 'PAINT') continue;
      out.push(s);
    }
    return out;
  }
  return EDP_STAGES.slice();
}

// Strip role-gated fields based on the requesting user's role.
function edpGateTicket(ticket, role) {
  var out = {};
  for (var k in ticket) {
    if (ticket.hasOwnProperty(k)) out[k] = ticket[k];
  }
  var isPurchase = (out.intake_type === 'PURCHASE');
  var isCustomer = (out.intake_type === 'WARRANTY' || out.intake_type === 'REPAIR');
  if (!isCustomer) {
    out.customer_name    = '';
    out.customer_phone_1 = '';
    out.customer_phone_2 = '';
    out.customer_email   = '';
  }
  if (!(isPurchase && role === 'OWNER')) {
    out.purchase_price = '';
  }
  return out;
}

function edpCanEdit(user) {
  if (!user) return false;
  if (user.role === 'OWNER') return true;
  var raw = PropertiesService.getScriptProperties().getProperty('EDP_EDIT_PINS');
  if (!raw) return false;
  try {
    var list = JSON.parse(raw);
    return list.indexOf(String(user.pin)) >= 0;
  } catch (e) {
    return false;
  }
}

function edpNextAuditLogId() {
  var tz = Session.getScriptTimeZone() || 'America/Chicago';
  var today = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
  var prefix = 'LOG-' + today + '-';
  var sheet = edpGetSheet(EDP_TAB_AUDIT);
  var rows = sheet.getDataRange().getValues();
  var max = 0;
  for (var i = 1; i < rows.length; i++) {
    var id = String(rows[i][0] || '');
    if (id.indexOf(prefix) === 0) {
      var tail = id.substring(prefix.length);
      var n = parseInt(tail, 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var seq = String(max + 1);
  while (seq.length < 4) seq = '0' + seq;
  return prefix + seq;
}

function edpWriteAudit(actor, actorRole, ticketId, action,
                      fieldChanged, oldValue, newValue, notes) {
  try {
    var sheet = edpGetSheet(EDP_TAB_AUDIT);
    var logId = edpNextAuditLogId();
    sheet.appendRow([
      logId,
      edpNowIso(),
      actor      || '',
      actorRole  || '',
      ticketId   || '',
      action     || '',
      fieldChanged || '',
      (oldValue == null) ? '' : String(oldValue),
      (newValue == null) ? '' : String(newValue),
      (notes    == null) ? '' : String(notes)
    ]);
  } catch (e) {
    Logger.log('Audit write failed: ' + e.message);
  }
}

// ============================================================
// FLOOR_READY -> APPLIANCES push helpers
// ============================================================

// Pick the item_id prefix for a given category + fuel. "Both" or "N/A" fuel
// defaults to Electric prefix for dryers and stoves.
function edpItemIdPrefix(category, fuelType) {
  var cat  = String(category || '').trim();
  var fuel = String(fuelType || '').trim();
  var isGas = (fuel === 'Gas');
  if (cat === 'Washer')       return 'W';
  if (cat === 'Dryer')        return isGas ? 'DGW' : 'DEW';
  if (cat === 'Refrigerator') return 'R';
  if (cat === 'Freezer')      return 'F';
  if (cat === 'Stove')        return isGas ? 'SGW' : 'SEW';
  if (cat === 'Dishwasher')   return 'DW';
  if (cat === 'Microwave')    return 'MW';
  return 'X';
}

function edpEscapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Find next sequential NNNN for the given prefix on the APPLIANCES tab.
function edpNextItemId(prefix) {
  var sheet = edpGetSheet(EDP_TAB_APPLIANCES);
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 1) return prefix + '-0001';
  var headers = rows[0];
  var idIdx = headers.indexOf('item_id');
  if (idIdx < 0) idIdx = 0;
  var pat = new RegExp('^' + edpEscapeRegExp(prefix) + '-(\\d+)$');
  var max = 0;
  for (var i = 1; i < rows.length; i++) {
    var id = String(rows[i][idIdx] || '');
    var m = id.match(pat);
    if (m) {
      var n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var seq = String(max + 1);
  while (seq.length < 4) seq = '0' + seq;
  return prefix + '-' + seq;
}

// Append a new row to APPLIANCES from a ticket dict. Maps fields by
// header NAME (read from row 1), so the function tolerates any column
// order on the shared APPLIANCES tab. If the ticket already has an
// appliance_item_id (the v1.0.8.1 path - item_id assigned at creation
// time), reuse it; otherwise generate one with the new prefix system.
// Returns the item_id used.
function edpPushToAppliances(ticket, user) {
  var itemId = String(ticket.appliance_item_id || '').trim();
  if (!itemId) {
    var prefix = edpItemIdPrefixV2(ticket.category);
    itemId = edpNextItemIdV2(prefix, ticket.serial, ticket.model);
  }

  var tz = Session.getScriptTimeZone() || 'America/Chicago';
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  var costBasis = '';
  if (String(ticket.intake_type || '').toUpperCase() === 'PURCHASE' &&
      ticket.purchase_price) {
    costBasis = ticket.purchase_price;
  }

  var rowData = {
    item_id:       itemId,
    sku_id:        itemId,
    category:      String(ticket.category || '').toUpperCase(),
    brand:         ticket.brand || '',
    model:         ticket.model || '',
    serial:        ticket.serial || '',
    condition:     'USED',
    list_price:    '',
    cost_basis:    costBasis,
    rating:        '',
    warranty_tier: '',
    fuel_type:     String(ticket.fuel_type || '').toUpperCase(),
    notes:         ticket.notes || '',
    stage:         'FLOOR_READY',
    status:        'AVAILABLE',
    days_on_hand:  0,
    date_acquired: today,
    added_by:      String((user && user.name) || '').toUpperCase(),
    photo_links:   edpGatherPhotoLinks(ticket.photo_folder_id || '')
  };

  var sheet = edpGetSheet(EDP_TAB_APPLIANCES);
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) {
    throw new Error('APPLIANCES tab has no header row.');
  }
  // Read the actual header row at write time so we are immune to column
  // reorders. Map by NAME, not position.
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var newRow = [];
  for (var i = 0; i < headerRow.length; i++) {
    var name = String(headerRow[i] || '').trim();
    if (rowData.hasOwnProperty(name) && rowData[name] !== undefined) {
      newRow.push(rowData[name]);
    } else {
      newRow.push('');
    }
  }
  sheet.appendRow(newRow);
  return itemId;
}

// Update the stage and/or status of an existing APPLIANCES row, located by
// item_id. Returns true on hit, false if the row was not found. Used when a
// ticket re-enters FLOOR_READY so the existing inventory row is restored to
// AVAILABLE rather than a duplicate row being created.
function edpUpdateAppliancesStatus(itemId, newStage, newStatus) {
  if (!itemId) return false;
  var sheet = edpGetSheet(EDP_TAB_APPLIANCES);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return false;
  var headers   = values[0];
  var idIdx     = headers.indexOf('item_id');
  var stageIdx  = headers.indexOf('stage');
  var statusIdx = headers.indexOf('status');
  if (idIdx < 0) return false;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idIdx]) === String(itemId)) {
      if (stageIdx  >= 0 && newStage)  sheet.getRange(i + 1, stageIdx  + 1).setValue(newStage);
      if (statusIdx >= 0 && newStatus) sheet.getRange(i + 1, statusIdx + 1).setValue(newStatus);
      return true;
    }
  }
  return false;
}

// ============================================================
// PUSHOVER NOTIFICATIONS
// ============================================================
// Reads PUSHOVER_APP_TOKEN + PUSHOVER_USER_KEY from Script Properties.
// Swallows all errors so a failed push cannot block the calling op;
// audit-logs failures.
function edpPushover(title, message, priority) {
  try {
    var props = PropertiesService.getScriptProperties();
    var appToken = props.getProperty('PUSHOVER_APP_TOKEN');
    var userKey  = props.getProperty('PUSHOVER_USER_KEY');
    if (!appToken || !userKey) {
      Logger.log('Pushover skipped: PUSHOVER_APP_TOKEN or PUSHOVER_USER_KEY missing.');
      return false;
    }
    // Pushover requires priority to be an integer in {-2, -1, 0, 1, 2}.
    // Coerce to a JS Number; default to 0 on anything we cannot parse.
    var p = parseInt(priority, 10);
    if (isNaN(p) || p < -2 || p > 2) p = 0;

    var resp = UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', {
      method: 'post',
      payload: {
        token:    appToken,
        user:     userKey,
        title:    String(title   || ''),
        message:  String(message || ''),
        priority: p
      },
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code !== 200) {
      try {
        edpWriteAudit('', 'SYSTEM', '', 'PUSHOVER_FAIL',
          '', String(code),
          String(title || '') + ': ' + String(message || ''),
          String(resp.getContentText() || '').substring(0, 200));
      } catch (eAud) {}
      return false;
    }
    return true;
  } catch (e) {
    try {
      edpWriteAudit('', 'SYSTEM', '', 'PUSHOVER_FAIL',
        '', '',
        String(title || '') + ': ' + String(message || ''),
        e.message);
    } catch (eAud) {}
    return false;
  }
}

// ============================================================
// DRIVE FOLDER HELPERS for ticket photos
// ============================================================

// Find a child folder by name under parent, or create it. parentId === null
// means My Drive root. Returns the folder id.
function edpGetOrCreateFolder(name, parentId) {
  var parent = parentId
    ? DriveApp.getFolderById(parentId)
    : DriveApp.getRootFolder();
  var iter = parent.getFoldersByName(name);
  if (iter.hasNext()) return iter.next().getId();
  return parent.createFolder(name).getId();
}

// Ensure EDP_PHOTOS / INTAKE folders exist. Caches both IDs in Script
// Properties. Returns the INTAKE folder id.
function edpEnsurePhotoRoots() {
  var props = PropertiesService.getScriptProperties();
  var rootId   = props.getProperty(EDP_PHOTOS_ROOT_PROP);
  var intakeId = props.getProperty(EDP_PHOTOS_INTAKE_PROP);

  // Validate cached root id. If it points at a missing / trashed folder
  // (rare), recreate.
  if (rootId) {
    try {
      var f = DriveApp.getFolderById(rootId);
      if (f.isTrashed()) rootId = null;
    } catch (e) { rootId = null; }
  }
  if (!rootId) {
    rootId = edpGetOrCreateFolder(EDP_PHOTOS_ROOT_NAME, null);
    props.setProperty(EDP_PHOTOS_ROOT_PROP, rootId);
  }

  if (intakeId) {
    try {
      var fi = DriveApp.getFolderById(intakeId);
      if (fi.isTrashed()) intakeId = null;
    } catch (e) { intakeId = null; }
  }
  if (!intakeId) {
    intakeId = edpGetOrCreateFolder(EDP_PHOTOS_INTAKE_NAME, rootId);
    props.setProperty(EDP_PHOTOS_INTAKE_PROP, intakeId);
  }
  return intakeId;
}

// Get or create the per-ticket folder under INTAKE/. Returns folder id.
function edpEnsureTicketFolder(ticketId) {
  var intakeId = edpEnsurePhotoRoots();
  return edpGetOrCreateFolder(ticketId, intakeId);
}

// Iterate files in a ticket folder and return enriched photo records:
//   [{fileId, filename, url, label, dateStr}, ...]
// Skips the _labels.json sidecar file so it never shows in the gallery.
// Sorted by filename ascending (preserves photo_001, photo_002, ... order).
function edpListTicketPhotos(folderId) {
  if (!folderId) return [];
  var folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (e) {
    return [];
  }
  var labels = edpReadLabels(folderId);
  var iter = folder.getFiles();
  var out = [];
  while (iter.hasNext()) {
    var f = iter.next();
    if (f.isTrashed()) continue;
    var name = f.getName();
    if (name === EDP_LABELS_FILENAME) continue;
    out.push({
      fileId:   f.getId(),
      filename: name,
      kind:     (name.indexOf('sticker_') === 0) ? 'sticker' : 'photo',
      url:      EDP_PHOTO_VIEW_PREFIX + f.getId() + EDP_PHOTO_VIEW_SUFFIX,
      label:    labels[name] || '',
      dateStr:  edpFormatDate(f.getDateCreated())
    });
  }
  out.sort(function(a, b) {
    if (a.filename < b.filename) return -1;
    if (a.filename > b.filename) return 1;
    return 0;
  });
  return out;
}

// Read the _labels.json sidecar from a ticket folder. Returns {} on any error
// or absence so callers can simply do labels[name] || ''.
function edpReadLabels(folderId) {
  if (!folderId) return {};
  try {
    var folder = DriveApp.getFolderById(folderId);
    var iter = folder.getFilesByName(EDP_LABELS_FILENAME);
    if (!iter.hasNext()) return {};
    var f = iter.next();
    var content = f.getBlob().getDataAsString();
    if (!content) return {};
    var parsed = JSON.parse(content);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    Logger.log('edpReadLabels failed: ' + e.message);
    return {};
  }
}

// Write the _labels.json sidecar. Creates the file if it does not exist;
// overwrites with the new JSON content otherwise. Returns true on success.
function edpWriteLabels(folderId, labelsObj) {
  if (!folderId) return false;
  var content = JSON.stringify(labelsObj || {});
  try {
    var folder = DriveApp.getFolderById(folderId);
    var iter = folder.getFilesByName(EDP_LABELS_FILENAME);
    if (iter.hasNext()) {
      var f = iter.next();
      f.setContent(content);
    } else {
      folder.createFile(EDP_LABELS_FILENAME, content, 'application/json');
    }
    return true;
  } catch (e) {
    Logger.log('edpWriteLabels failed: ' + e.message);
    return false;
  }
}

// Comma-separated URL list of all photos in a ticket folder. Used to push
// to the APPLIANCES.photo_links column.
function edpGatherPhotoLinks(folderId) {
  if (!folderId) return '';
  var photos = edpListTicketPhotos(folderId);
  if (!photos.length) return '';
  var urls = [];
  for (var i = 0; i < photos.length; i++) urls.push(photos[i].url);
  return urls.join(',');
}

// Update an existing APPLIANCES row's photo_links cell. Located by item_id.
function edpUpdateAppliancesPhotos(itemId, photoLinks) {
  if (!itemId) return false;
  var sheet = edpGetSheet(EDP_TAB_APPLIANCES);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return false;
  var headers  = values[0];
  var idIdx    = headers.indexOf('item_id');
  var linksIdx = headers.indexOf('photo_links');
  if (idIdx < 0 || linksIdx < 0) return false;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idIdx]) === String(itemId)) {
      sheet.getRange(i + 1, linksIdx + 1).setValue(photoLinks || '');
      return true;
    }
  }
  return false;
}

// Permission to delete photos. STAFF cannot delete; OWNER and TECH can.
function edpCanDeletePhoto(user) {
  if (!user) return false;
  return (user.role === 'OWNER' || user.role === 'TECH');
}

// ============================================================
// ITEM ID PREFIX SYSTEM (v1.0.8.1)
// New item_id format: <prefix>-<suffix>, where suffix is the last
// 4/5/6 alphanumeric chars of serial, then 4/5/6 of model, then a
// random 4-char alphanumeric. Uniqueness checked against APPLIANCES
// and TICKETS.appliance_item_id in a single read of each.
// ============================================================

function edpItemIdPrefixV2(category) {
  var c = String(category || '').trim();
  if (c === 'Stove')        return 'S';
  if (c === 'Dryer')        return 'D';
  if (c === 'Washer')       return 'W';
  if (c === 'Refrigerator') return 'R';
  if (c === 'Freezer')      return 'F';
  if (c === 'Dishwasher')   return 'DW';
  if (c === 'Microwave')    return 'MW';
  return 'X';
}

function edpRandomAlphanum(len) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var out = '';
  for (var i = 0; i < len; i++) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

// One-shot collection of every existing item_id across APPLIANCES.item_id
// and TICKETS.appliance_item_id. Returned as a {id: true} map for O(1) lookup.
function edpAllExistingItemIds() {
  var set = {};
  try {
    var s1 = edpGetSheet(EDP_TAB_APPLIANCES);
    var v1 = s1.getDataRange().getValues();
    if (v1.length > 1) {
      var i1 = v1[0].indexOf('item_id');
      if (i1 >= 0) {
        for (var r = 1; r < v1.length; r++) {
          var id1 = String(v1[r][i1] || '');
          if (id1) set[id1] = true;
        }
      }
    }
  } catch (e1) {}
  try {
    var s2 = edpGetSheet(EDP_TAB_TICKETS);
    var v2 = s2.getDataRange().getValues();
    if (v2.length > 1) {
      var i2 = v2[0].indexOf('appliance_item_id');
      if (i2 >= 0) {
        for (var r2 = 1; r2 < v2.length; r2++) {
          var id2 = String(v2[r2][i2] || '');
          if (id2) set[id2] = true;
        }
      }
    }
  } catch (e2) {}
  return set;
}

// Generate the next item_id for a new ticket. Tries the priority chain:
//   serial last 4, 5, 6 -> model last 4, 5, 6 -> random 4-char alphanumeric.
// Returns the first prefix-suffix that does not collide with an existing id.
function edpNextItemIdV2(prefix, serial, model) {
  var existing = edpAllExistingItemIds();
  var s = String(serial || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  var m = String(model  || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  var attempts = [];
  if (s.length >= 4) attempts.push(s.substring(s.length - 4));
  if (s.length >= 5) attempts.push(s.substring(s.length - 5));
  if (s.length >= 6) attempts.push(s.substring(s.length - 6));
  if (m.length >= 4) attempts.push(m.substring(m.length - 4));
  if (m.length >= 5) attempts.push(m.substring(m.length - 5));
  if (m.length >= 6) attempts.push(m.substring(m.length - 6));
  for (var i = 0; i < attempts.length; i++) {
    var candidate = prefix + '-' + attempts[i];
    if (!existing[candidate]) return candidate;
  }
  // Random 4-char until unique (up to 200 tries; 36^4 = 1.68M codepoints).
  for (var k = 0; k < 200; k++) {
    var rand4 = prefix + '-' + edpRandomAlphanum(4);
    if (!existing[rand4]) return rand4;
  }
  // Extreme fallback: 6-char random.
  for (var k2 = 0; k2 < 200; k2++) {
    var rand6 = prefix + '-' + edpRandomAlphanum(6);
    if (!existing[rand6]) return rand6;
  }
  return prefix + '-' + edpRandomAlphanum(8);
}

// ============================================================
// Sticker / photo filename sequencing (v1.1.0)
// Enumerates the ticket folder for the highest used sequence number,
// returns next. Decoupled from photo_count so sticker and regular photo
// numbering stay independent even when both kinds are mixed.
// ============================================================
function edpNextStickerSeq(folderId) {
  return _edpNextSeqByPrefix(folderId, /^sticker_(\d+)\./);
}
function edpNextPhotoSeq(folderId) {
  return _edpNextSeqByPrefix(folderId, /^photo_(\d+)\./);
}
function _edpNextSeqByPrefix(folderId, pattern) {
  if (!folderId) return 1;
  try {
    var folder = DriveApp.getFolderById(folderId);
    var iter = folder.getFiles();
    var max = 0;
    while (iter.hasNext()) {
      var f = iter.next();
      if (f.isTrashed()) continue;
      var m = f.getName().match(pattern);
      if (m) {
        var n = parseInt(m[1], 10);
        if (!isNaN(n) && n > max) max = n;
      }
    }
    return max + 1;
  } catch (e) {
    return 1;
  }
}

// ============================================================
// v1.2.0: typed sheet + folder helpers (WARRANTY / REPAIR)
// ============================================================

// Lazy-create a sheet by name with the given header columns. Returns the
// Sheet. Idempotent.
function edpEnsureTypedSheet(tabName, columns) {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty(EDP_SHEET_ID_PROP);
  if (!sheetId) {
    throw new Error('SHEET_ID property is not set in Script Properties.');
  }
  var book = SpreadsheetApp.openById(sheetId);
  var sh = book.getSheetByName(tabName);
  if (!sh) {
    sh = book.insertSheet(tabName);
    sh.getRange(1, 1, 1, columns.length).setValues([columns]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, columns.length)
      .setFontWeight('bold').setBackground('#1a2035').setFontColor('#FFFFFF');
  } else {
    // Ensure all expected columns exist (additive only -- never delete).
    var existing = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn()))
      .getValues()[0];
    var lookup = {};
    for (var i = 0; i < existing.length; i++) lookup[String(existing[i])] = 1;
    var missing = [];
    for (var j = 0; j < columns.length; j++) {
      if (!lookup.hasOwnProperty(columns[j])) missing.push(columns[j]);
    }
    if (missing.length) {
      var startCol = Math.max(1, sh.getLastColumn()) + 1;
      sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

// Build a date-stamped sequential ticket_id with the given prefix letter
// ('W' or 'R'). Scans the target sheet for today's existing ids and
// returns the next sequence. Format: <P>-YYYYMMDD-NNN.
function edpNextTypedTicketId(letter, tabName, columns) {
  var sh = edpEnsureTypedSheet(tabName, columns);
  var tz = Session.getScriptTimeZone() || 'America/Chicago';
  var today = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
  var prefix = letter + '-' + today + '-';
  var values = sh.getDataRange().getValues();
  var max = 0;
  for (var i = 1; i < values.length; i++) {
    var id = values[i][0];
    if (id && String(id).indexOf(prefix) === 0) {
      var n = parseInt(String(id).substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  var seq = String(max + 1);
  while (seq.length < 3) seq = '0' + seq;
  return prefix + seq;
}

// Resolve the typed photo subfolder root for a given intake type.
// Creates EDP_PHOTOS/WARRANTY/ or EDP_PHOTOS/REPAIRS/ on demand and
// caches the id in Script Properties.
function edpEnsureTypedPhotoRoot(intakeType) {
  var props = PropertiesService.getScriptProperties();
  var rootId = props.getProperty(EDP_PHOTOS_ROOT_PROP);
  if (rootId) {
    try {
      var rf = DriveApp.getFolderById(rootId);
      if (rf.isTrashed()) rootId = null;
    } catch (eRoot) { rootId = null; }
  }
  if (!rootId) {
    rootId = edpGetOrCreateFolder(EDP_PHOTOS_ROOT_NAME, null);
    props.setProperty(EDP_PHOTOS_ROOT_PROP, rootId);
  }
  var name, prop;
  if (intakeType === 'WARRANTY') {
    name = EDP_PHOTOS_WARRANTY_NAME; prop = EDP_PHOTOS_WARRANTY_PROP;
  } else if (intakeType === 'REPAIR') {
    name = EDP_PHOTOS_REPAIRS_NAME;  prop = EDP_PHOTOS_REPAIRS_PROP;
  } else {
    throw new Error('edpEnsureTypedPhotoRoot: unknown intake type ' + intakeType);
  }
  var cached = props.getProperty(prop);
  if (cached) {
    try {
      var cf = DriveApp.getFolderById(cached);
      if (cf.isTrashed()) cached = null;
    } catch (eC) { cached = null; }
  }
  if (!cached) {
    cached = edpGetOrCreateFolder(name, rootId);
    props.setProperty(prop, cached);
  }
  return cached;
}

// Per-ticket subfolder under the typed photo root. Returns folder id.
function edpEnsureTypedTicketFolder(intakeType, ticketId) {
  var rootId = edpEnsureTypedPhotoRoot(intakeType);
  return edpGetOrCreateFolder(ticketId, rootId);
}

// Cross-sheet ticket lookup for api_uploadPhoto. Detects ticket type by
// id prefix (W- = warranty, R- = repair, anything else = TICKETS).
// Returns {sheet, headers, rowIndex, idIdx, countIdx, folderIdx} on
// success, or null if not found.
function edpLocateTicketRow(ticketId) {
  var tab = EDP_TAB_TICKETS;
  var cols = null;
  if (typeof ticketId === 'string') {
    if (ticketId.indexOf('W-') === 0)      tab = EDP_TAB_WARRANTY;
    else if (ticketId.indexOf('R-') === 0) tab = EDP_TAB_REPAIR;
  }
  var sheet;
  if (tab === EDP_TAB_TICKETS) {
    sheet = edpGetSheet(EDP_TAB_TICKETS);
  } else {
    cols = (tab === EDP_TAB_WARRANTY) ? EDP_WARRANTY_COLUMNS : EDP_REPAIR_COLUMNS;
    sheet = edpEnsureTypedSheet(tab, cols);
  }
  var values  = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  var headers = values[0];
  var idIdx     = headers.indexOf('ticket_id');
  var countIdx  = headers.indexOf('photo_count');
  var folderIdx = headers.indexOf('photo_folder_id');
  if (idIdx < 0 || countIdx < 0 || folderIdx < 0) return null;
  for (var i = 1; i < values.length; i++) {
    if (values[i][idIdx] === ticketId) {
      return {
        tab:       tab,
        sheet:     sheet,
        values:    values,
        headers:   headers,
        rowIndex:  i + 1,
        idIdx:     idIdx,
        countIdx:  countIdx,
        folderIdx: folderIdx
      };
    }
  }
  return null;
}
