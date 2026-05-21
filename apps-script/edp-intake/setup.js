// ============================================================
// setup.gs - EDP Intake
// Version: v1.0.9
// Last Updated: 2026-05-13
// Change: setupEDPIntakeV109 (migrate first_photo_url column) +
//   backfillFirstPhotoUrls (one-shot admin: populate cache for
//   pre-existing tickets that already have photos).
// One-time setup helpers (idempotent):
//   setupEDPIntakePins()         - seed PIN script properties
//   setupEDPIntakeSheets()       - create TICKETS / STAGE_HISTORY / EMPLOYEES
//                                  on the sheet pointed to by SHEET_ID.
//   setupEDPIntakeVendors()      - create VENDORS tab + pre-seed pickers +
//                                  add "seller" column to TICKETS if missing.
//   setupEDPIntakeEditAudit()    - create AUDIT_LOG + ARCHIVE tabs, migrate
//                                  TICKETS to add "category" / "fuel_type"
//                                  columns, seed EDP_EDIT_PINS property.
//   setupEDPIntakeFloorPush()    - migrate TICKETS to add appliance_item_id,
//                                  seed Pushover credentials, verify the
//                                  shared APPLIANCES tab exists.
//   setupEDPIntakePhotos()       - migrate TICKETS to add photo_count and
//                                  photo_folder_id columns, create the
//                                  EDP_PHOTOS / INTAKE Drive folders, cache
//                                  their ids in Script Properties.
//   setupEDPIntakeV109()         - append first_photo_url column to TICKETS.
//   backfillFirstPhotoUrls()     - one-shot admin: backfill first_photo_url
//                                  for tickets that already have photos.
//   setSheetIdToMasterDatabase() - flips SHEET_ID to the EDP_MASTER_DATABASE.
//   cleanupWrongSheet()          - one-shot: undoes the v1.0.0 mistake on
//                                  the wrong sheet (1laPGf...).
//
// To seed PINs:
//   1. Project Settings -> Script Properties -> Add property
//        EDP_PIN_BOOTSTRAP = JSON shape:
//          {"ownerPins":["<pin>","<pin>"],
//           "adminPins":["<pin>"],
//           "techPins":["<pin>","<pin>"],
//           "nameMap":{"<pin>":"<name>", ...}}
//   2. Save, then run setupEDPIntakePins() from Run menu.
//
// To set the bound sheet:
//   Either set SHEET_ID Script Property by hand, or run
//   setSheetIdToMasterDatabase(). Then run setupEDPIntakeSheets().
//
// ES5 only. ASCII only.
// ============================================================

// IDs used by the one-shot cleanup. Sheet IDs are not secrets in
// Google's permission model.
var EDP_WRONG_SHEET_ID  = '1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo';
var EDP_MASTER_DATABASE = '117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI';

function setupEDPIntakePins() {
  var props = PropertiesService.getScriptProperties();

  if (props.getProperty('EDP_OWNER_PINS') ||
      props.getProperty('EDP_ADMIN_PINS') ||
      props.getProperty('EDP_PIN_NAME_MAP')) {
    Logger.log('EDP PIN configuration already present. ' +
      'Refusing to overwrite. Delete the EDP_* PIN properties manually ' +
      'if you want to re-seed.');
    return {ok: false, reason: 'already_configured'};
  }

  var bootstrapRaw = props.getProperty('EDP_PIN_BOOTSTRAP');
  if (!bootstrapRaw) {
    Logger.log('No bootstrap data found. ' +
      'Set EDP_PIN_BOOTSTRAP in Script Properties first, then re-run.');
    return {ok: false, reason: 'no_bootstrap'};
  }

  var cfg;
  try {
    cfg = JSON.parse(bootstrapRaw);
  } catch (e) {
    Logger.log('EDP_PIN_BOOTSTRAP is not valid JSON: ' + e.message);
    return {ok: false, reason: 'bad_json'};
  }

  props.setProperties({
    'EDP_OWNER_PINS':   JSON.stringify(cfg.ownerPins || []),
    'EDP_ADMIN_PINS':   JSON.stringify(cfg.adminPins || []),
    'EDP_TECH_PINS':    JSON.stringify(cfg.techPins  || []),
    'EDP_PIN_NAME_MAP': JSON.stringify(cfg.nameMap   || {})
  });
  props.deleteProperty('EDP_PIN_BOOTSTRAP');
  Logger.log('EDP PIN configuration seeded. Bootstrap property deleted.');
  return {ok: true};
}

// Set SHEET_ID to the EDP_MASTER_DATABASE. Safe to re-run.
function setSheetIdToMasterDatabase() {
  var props = PropertiesService.getScriptProperties();
  var prev = props.getProperty(EDP_SHEET_ID_PROP) || '(unset)';
  props.setProperty(EDP_SHEET_ID_PROP, EDP_MASTER_DATABASE);
  Logger.log('SHEET_ID changed: ' + prev + ' -> ' + EDP_MASTER_DATABASE);
  return {ok: true, previous: prev, current: EDP_MASTER_DATABASE};
}

// Create TICKETS / STAGE_HISTORY / EMPLOYEES on the bound sheet ONLY if
// they are missing. Never renames any pre-existing tab. Logs every tab
// as either "created" or "skipped (already exists)".
function setupEDPIntakeSheets() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty(EDP_SHEET_ID_PROP);
  if (!sheetId) {
    Logger.log('SHEET_ID Script Property is not set.');
    return {ok: false, reason: 'no_sheet_id'};
  }
  var book = SpreadsheetApp.openById(sheetId);

  var created = [];
  var skipped = [];
  var tabSpecs = [
    {name: EDP_TAB_TICKETS,   columns: EDP_TICKET_COLUMNS,   freezeColor: '#1a2035'},
    {name: EDP_TAB_HISTORY,   columns: EDP_HISTORY_COLUMNS,  freezeColor: '#1a2035'},
    {name: EDP_TAB_EMPLOYEES, columns: EDP_EMPLOYEE_COLUMNS, freezeColor: '#7f1d1d'}
  ];
  for (var j = 0; j < tabSpecs.length; j++) {
    var spec = tabSpecs[j];
    if (book.getSheetByName(spec.name)) {
      skipped.push(spec.name);
      continue;
    }
    var sh = book.insertSheet(spec.name);
    sh.appendRow(spec.columns);
    sh.getRange(1, 1, 1, spec.columns.length)
      .setFontWeight('bold')
      .setBackground(spec.freezeColor)
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
    created.push(spec.name);
  }

  // Populate EMPLOYEES from the PIN name map if it exists and the tab is empty.
  try {
    var emp = book.getSheetByName(EDP_TAB_EMPLOYEES);
    if (emp && emp.getLastRow() < 2) {
      var nameRaw  = props.getProperty('EDP_PIN_NAME_MAP');
      var ownerRaw = props.getProperty('EDP_OWNER_PINS');
      var adminRaw = props.getProperty('EDP_ADMIN_PINS');
      var techRaw  = props.getProperty('EDP_TECH_PINS');
      if (nameRaw && ownerRaw && adminRaw) {
        var nameMap   = JSON.parse(nameRaw);
        var ownerPins = JSON.parse(ownerRaw);
        var adminPins = JSON.parse(adminRaw);
        var techPins  = techRaw ? JSON.parse(techRaw) : [];
        var rows = [];
        for (var pin in nameMap) {
          if (!nameMap.hasOwnProperty(pin)) continue;
          var role = '';
          if (ownerPins.indexOf(pin) >= 0) role = 'OWNER';
          else if (techPins.indexOf(pin) >= 0) role = 'TECH';
          else if (adminPins.indexOf(pin) >= 0) role = 'STAFF';
          rows.push(['***', nameMap[pin], role, true]);
        }
        if (rows.length) {
          emp.getRange(2, 1, rows.length, EDP_EMPLOYEE_COLUMNS.length)
             .setValues(rows);
        }
      }
    }
  } catch (e) {
    Logger.log('EMPLOYEES seed skipped: ' + e.message);
  }

  SpreadsheetApp.flush();
  Logger.log('Sheet target: ' + sheetId);
  Logger.log('Created: ' + (created.length ? created.join(', ') : 'none'));
  Logger.log('Skipped (already existed): ' + (skipped.length ? skipped.join(', ') : 'none'));
  return {ok: true, sheet_id: sheetId, created: created, skipped: skipped};
}

// One-shot: undo the v1.0.0 mistake on the WRONG sheet (1laPGf...).
// Renames MAKE_READY_OLD -> MAKE_READY and APPLIANCES_OLD -> APPLIANCES,
// and deletes the TICKETS / STAGE_HISTORY / EMPLOYEES tabs that were
// created there by mistake. Operates on EDP_WRONG_SHEET_ID and ignores
// the SHEET_ID Script Property entirely, so it is safe to run regardless
// of whether SHEET_ID has been switched yet.
function cleanupWrongSheet() {
  var book = SpreadsheetApp.openById(EDP_WRONG_SHEET_ID);

  var renamedBack = [];
  var skippedRenames = [];
  var renamePairs = [
    ['MAKE_READY_OLD', 'MAKE_READY'],
    ['APPLIANCES_OLD', 'APPLIANCES']
  ];
  for (var i = 0; i < renamePairs.length; i++) {
    var fromName = renamePairs[i][0];
    var toName   = renamePairs[i][1];
    var src = book.getSheetByName(fromName);
    var dst = book.getSheetByName(toName);
    if (src && !dst) {
      src.setName(toName);
      renamedBack.push(fromName + ' -> ' + toName);
    } else {
      skippedRenames.push(fromName + ' (src missing or destination exists)');
    }
  }

  var deleted = [];
  var notFound = [];
  var toDelete = [EDP_TAB_TICKETS, EDP_TAB_HISTORY, EDP_TAB_EMPLOYEES];
  for (var j = 0; j < toDelete.length; j++) {
    var sheet = book.getSheetByName(toDelete[j]);
    if (sheet) {
      book.deleteSheet(sheet);
      deleted.push(toDelete[j]);
    } else {
      notFound.push(toDelete[j]);
    }
  }

  SpreadsheetApp.flush();
  Logger.log('Sheet target: ' + EDP_WRONG_SHEET_ID);
  Logger.log('Renamed back: ' + (renamedBack.length ? renamedBack.join(', ') : 'none'));
  Logger.log('Skipped renames: ' + (skippedRenames.length ? skippedRenames.join(', ') : 'none'));
  Logger.log('Deleted tabs: ' + (deleted.length ? deleted.join(', ') : 'none'));
  Logger.log('Tabs not found (already clean): ' + (notFound.length ? notFound.join(', ') : 'none'));
  return {
    ok: true,
    renamedBack: renamedBack,
    deleted: deleted,
    skippedRenames: skippedRenames,
    notFound: notFound
  };
}

// ============================================================
// VENDORS tab setup. Idempotent.
// - Creates VENDORS tab if missing.
// - Pre-seeds 5 known pickers ONLY when the tab is freshly created.
// - Adds "seller" column to TICKETS after "customer_email" if missing.
// ============================================================
function setupEDPIntakeVendors() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty(EDP_SHEET_ID_PROP);
  if (!sheetId) {
    Logger.log('SHEET_ID Script Property is not set.');
    return {ok: false, reason: 'no_sheet_id'};
  }
  var book = SpreadsheetApp.openById(sheetId);

  // 1. VENDORS tab.
  var vendorsCreated = false;
  var vendors = book.getSheetByName(EDP_TAB_VENDORS);
  if (!vendors) {
    vendors = book.insertSheet(EDP_TAB_VENDORS);
    vendors.appendRow(EDP_VENDOR_COLUMNS);
    vendors.getRange(1, 1, 1, EDP_VENDOR_COLUMNS.length)
      .setFontWeight('bold')
      .setBackground('#1a2035')
      .setFontColor('#ffffff');
    vendors.setFrozenRows(1);
    vendorsCreated = true;
  }

  // 2. Pre-seed pickers only on a fresh creation.
  var seeded = [];
  if (vendorsCreated) {
    var initial = ['Ray', 'Angela', 'Chris Beckham', 'Randy Powell', 'Garrett'];
    var nowSeed = edpNowIso();
    var rows = [];
    for (var i = 0; i < initial.length; i++) {
      var seq = String(i + 1);
      while (seq.length < 3) seq = '0' + seq;
      rows.push([
        'VEN-' + seq,
        initial[i],
        '',
        'Pre-seeded picker',
        nowSeed,
        'System'
      ]);
      seeded.push(initial[i]);
    }
    if (rows.length) {
      vendors.getRange(2, 1, rows.length, EDP_VENDOR_COLUMNS.length)
             .setValues(rows);
    }
  }

  // 3. Migrate TICKETS schema: add "seller" column after "customer_email".
  var sellerAdded = false;
  var tk = book.getSheetByName(EDP_TAB_TICKETS);
  if (tk) {
    var lastCol = tk.getLastColumn();
    var headers = tk.getRange(1, 1, 1, lastCol).getValues()[0];
    if (headers.indexOf('seller') < 0) {
      var emailIdx = headers.indexOf('customer_email');
      if (emailIdx >= 0) {
        // insertColumnAfter is 1-indexed. emailIdx is 0-indexed.
        tk.insertColumnAfter(emailIdx + 1);
        tk.getRange(1, emailIdx + 2).setValue('seller');
        sellerAdded = true;
      }
    }
  }

  SpreadsheetApp.flush();
  Logger.log('Sheet target: ' + sheetId);
  Logger.log('VENDORS tab: ' + (vendorsCreated ? 'created' : 'already existed'));
  Logger.log('Pre-seeded: ' + (seeded.length ? seeded.join(', ') : 'none'));
  Logger.log('Seller column on TICKETS: ' +
    (sellerAdded ? 'added' : 'already present (or TICKETS tab missing)'));
  return {
    ok: true,
    vendors_created: vendorsCreated,
    seeded: seeded,
    seller_column_added: sellerAdded
  };
}

// ============================================================
// EDIT + ARCHIVE + AUDIT setup. Idempotent.
// - Creates AUDIT_LOG tab if missing.
// - Creates ARCHIVE tab if missing (TICKETS columns + archived_at /
//   archived_by / restore_deadline).
// - Migrates TICKETS schema: inserts "category" after "intake_type",
//   then "fuel_type" after "category".
// - Seeds EDP_EDIT_PINS Script Property if not already set, from
//   EDP_OWNER_PINS plus any PIN whose name in EDP_PIN_NAME_MAP is "Joe".
// ============================================================
function setupEDPIntakeEditAudit() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty(EDP_SHEET_ID_PROP);
  if (!sheetId) {
    Logger.log('SHEET_ID Script Property is not set.');
    return {ok: false, reason: 'no_sheet_id'};
  }
  var book = SpreadsheetApp.openById(sheetId);

  // 1. AUDIT_LOG
  var auditCreated = false;
  var audit = book.getSheetByName(EDP_TAB_AUDIT);
  if (!audit) {
    audit = book.insertSheet(EDP_TAB_AUDIT);
    audit.appendRow(EDP_AUDIT_COLUMNS);
    audit.getRange(1, 1, 1, EDP_AUDIT_COLUMNS.length)
      .setFontWeight('bold')
      .setBackground('#1a2035')
      .setFontColor('#ffffff');
    audit.setFrozenRows(1);
    auditCreated = true;
  }

  // 2. ARCHIVE
  var archiveCreated = false;
  var archive = book.getSheetByName(EDP_TAB_ARCHIVE);
  if (!archive) {
    archive = book.insertSheet(EDP_TAB_ARCHIVE);
    archive.appendRow(EDP_ARCHIVE_COLUMNS);
    archive.getRange(1, 1, 1, EDP_ARCHIVE_COLUMNS.length)
      .setFontWeight('bold')
      .setBackground('#7f1d1d')
      .setFontColor('#ffffff');
    archive.setFrozenRows(1);
    archiveCreated = true;
  }

  // 3. TICKETS schema migration: category + fuel_type, in that order.
  var migrations = [];
  var tk = book.getSheetByName(EDP_TAB_TICKETS);
  if (tk) {
    var headers = tk.getRange(1, 1, 1, tk.getLastColumn()).getValues()[0];

    if (headers.indexOf('category') < 0) {
      var intakeIdx = headers.indexOf('intake_type');
      if (intakeIdx >= 0) {
        tk.insertColumnAfter(intakeIdx + 1);
        tk.getRange(1, intakeIdx + 2).setValue('category');
        migrations.push('category');
        // Refresh header row after insertion.
        headers = tk.getRange(1, 1, 1, tk.getLastColumn()).getValues()[0];
      }
    }

    if (headers.indexOf('fuel_type') < 0) {
      var catIdx = headers.indexOf('category');
      if (catIdx >= 0) {
        tk.insertColumnAfter(catIdx + 1);
        tk.getRange(1, catIdx + 2).setValue('fuel_type');
        migrations.push('fuel_type');
      }
    }
  }

  // 4. EDP_EDIT_PINS - seed if not set.
  var editPinsSeeded = false;
  if (!props.getProperty('EDP_EDIT_PINS')) {
    var ownerRaw = props.getProperty('EDP_OWNER_PINS');
    var nameRaw  = props.getProperty('EDP_PIN_NAME_MAP');
    if (ownerRaw && nameRaw) {
      var owners  = JSON.parse(ownerRaw);
      var nameMap = JSON.parse(nameRaw);
      var editList = [].concat(owners);
      for (var pin in nameMap) {
        if (!nameMap.hasOwnProperty(pin)) continue;
        if (nameMap[pin] === 'Joe' && editList.indexOf(pin) < 0) {
          editList.push(pin);
        }
      }
      props.setProperty('EDP_EDIT_PINS', JSON.stringify(editList));
      editPinsSeeded = true;
    }
  }

  SpreadsheetApp.flush();
  Logger.log('Sheet target: ' + sheetId);
  Logger.log('AUDIT_LOG tab: ' + (auditCreated  ? 'created' : 'already existed'));
  Logger.log('ARCHIVE tab:   ' + (archiveCreated ? 'created' : 'already existed'));
  Logger.log('TICKETS columns added: ' +
    (migrations.length ? migrations.join(', ') : 'none (already present)'));
  Logger.log('EDP_EDIT_PINS: ' +
    (editPinsSeeded ? 'seeded' : 'already set or PIN config missing'));
  return {
    ok: true,
    audit_created:    auditCreated,
    archive_created:  archiveCreated,
    migrations:       migrations,
    edit_pins_seeded: editPinsSeeded
  };
}

// ============================================================
// FLOOR_READY PUSH + PUSHOVER setup. Idempotent.
// - Migrates TICKETS schema to add "appliance_item_id" column after
//   "fuel_type" if missing.
// - Seeds PUSHOVER_APP_TOKEN + PUSHOVER_USER_KEY Script Properties from
//   the values in this function ONLY if those keys are not already set.
//   (These are write-once defaults; rotate via Script Properties UI.)
// - Verifies the shared APPLIANCES tab exists. Does not create or modify it.
// ============================================================
function setupEDPIntakeFloorPush() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty(EDP_SHEET_ID_PROP);
  if (!sheetId) {
    Logger.log('SHEET_ID Script Property is not set.');
    return {ok: false, reason: 'no_sheet_id'};
  }
  var book = SpreadsheetApp.openById(sheetId);

  // 1. TICKETS schema: add appliance_item_id after fuel_type if missing.
  var migrations = [];
  var tk = book.getSheetByName(EDP_TAB_TICKETS);
  if (tk) {
    var headers = tk.getRange(1, 1, 1, tk.getLastColumn()).getValues()[0];
    if (headers.indexOf('appliance_item_id') < 0) {
      var fuelIdx = headers.indexOf('fuel_type');
      if (fuelIdx >= 0) {
        tk.insertColumnAfter(fuelIdx + 1);
        tk.getRange(1, fuelIdx + 2).setValue('appliance_item_id');
        migrations.push('appliance_item_id');
      }
    }
  }

  // 2. Pushover credential seeding. Only set if the keys are unset.
  var pushoverTokenSeeded = false;
  var pushoverUserSeeded  = false;
  if (!props.getProperty('PUSHOVER_APP_TOKEN')) {
    props.setProperty('PUSHOVER_APP_TOKEN', 'ajxbh3y239uv2edbus5xefkrb7tq5v');
    pushoverTokenSeeded = true;
  }
  if (!props.getProperty('PUSHOVER_USER_KEY')) {
    props.setProperty('PUSHOVER_USER_KEY', 'u8i24dck34a6r4f5p7jdp3gdhyxh4d');
    pushoverUserSeeded = true;
  }

  // 3. Verify APPLIANCES tab presence (read-only check).
  var appliances = book.getSheetByName(EDP_TAB_APPLIANCES);
  var appliancesPresent = !!appliances;

  SpreadsheetApp.flush();
  Logger.log('Sheet target: ' + sheetId);
  Logger.log('TICKETS columns added: ' +
    (migrations.length ? migrations.join(', ') : 'none (already present)'));
  Logger.log('PUSHOVER_APP_TOKEN: ' + (pushoverTokenSeeded ? 'seeded' : 'already set'));
  Logger.log('PUSHOVER_USER_KEY: ' + (pushoverUserSeeded  ? 'seeded' : 'already set'));
  Logger.log('APPLIANCES tab: ' + (appliancesPresent ? 'present' : 'MISSING - aborting future pushes will fail'));
  return {
    ok: true,
    migrations:        migrations,
    pushover_seeded:   {token: pushoverTokenSeeded, user: pushoverUserSeeded},
    appliances_present: appliancesPresent
  };
}

// ============================================================
// PHOTOS setup. Idempotent.
// - Migrates TICKETS to add photo_count and photo_folder_id columns
//   appended at the right edge of the sheet (header-name mapping makes
//   the column position irrelevant for writes).
// - Creates / locates EDP_PHOTOS root in My Drive, then INTAKE under it.
// - Caches the two folder IDs in Script Properties
//   (EDP_PHOTOS_ROOT_ID, EDP_PHOTOS_INTAKE_ID).
// ============================================================
function setupEDPIntakePhotos() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty(EDP_SHEET_ID_PROP);
  if (!sheetId) {
    Logger.log('SHEET_ID Script Property is not set.');
    return {ok: false, reason: 'no_sheet_id'};
  }
  var book = SpreadsheetApp.openById(sheetId);

  // 1. TICKETS schema: append photo_count and photo_folder_id at the right
  //    edge if missing. Position does not affect writes (header-name mapping)
  //    so we just append rather than insert.
  var migrations = [];
  var tk = book.getSheetByName(EDP_TAB_TICKETS);
  if (tk) {
    var lastCol = tk.getLastColumn();
    var headers = tk.getRange(1, 1, 1, lastCol).getValues()[0];
    if (headers.indexOf('photo_count') < 0) {
      tk.getRange(1, lastCol + 1).setValue('photo_count');
      lastCol++;
      migrations.push('photo_count');
    }
    if (headers.indexOf('photo_folder_id') < 0) {
      tk.getRange(1, lastCol + 1).setValue('photo_folder_id');
      migrations.push('photo_folder_id');
    }
  }

  // 2. Drive folder roots. Creates EDP_PHOTOS at My Drive root, then
  //    INTAKE underneath. Caches both ids in Script Properties.
  var intakeId = null;
  try {
    intakeId = edpEnsurePhotoRoots();
  } catch (e) {
    Logger.log('Failed to ensure photo roots: ' + e.message);
    return {ok: false, reason: 'drive_error', error: e.message};
  }

  var rootId = props.getProperty(EDP_PHOTOS_ROOT_PROP);

  SpreadsheetApp.flush();
  Logger.log('Sheet target: ' + sheetId);
  Logger.log('TICKETS columns added: ' +
    (migrations.length ? migrations.join(', ') : 'none (already present)'));
  Logger.log('EDP_PHOTOS root folder id: ' + (rootId || 'n/a'));
  Logger.log('INTAKE subfolder id: ' + (intakeId || 'n/a'));
  return {
    ok:                true,
    migrations:        migrations,
    root_folder_id:    rootId,
    intake_folder_id:  intakeId
  };
}

// ============================================================
// v1.0.9 schema migration: append first_photo_url column to TICKETS.
// Idempotent. No try/finally in this new code per project rule.
// ============================================================
function setupEDPIntakeV109() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty(EDP_SHEET_ID_PROP);
  if (!sheetId) {
    Logger.log('SHEET_ID Script Property is not set.');
    return {ok: false, reason: 'no_sheet_id'};
  }
  var book = SpreadsheetApp.openById(sheetId);
  var tk = book.getSheetByName(EDP_TAB_TICKETS);
  if (!tk) {
    Logger.log('TICKETS tab missing.');
    return {ok: false, reason: 'no_tickets_tab'};
  }
  var lastCol = tk.getLastColumn();
  var headers = tk.getRange(1, 1, 1, lastCol).getValues()[0];
  var added = false;
  if (headers.indexOf('first_photo_url') < 0) {
    tk.getRange(1, lastCol + 1).setValue('first_photo_url');
    added = true;
    Logger.log('v1.0.9 setup: added first_photo_url column');
  } else {
    Logger.log('v1.0.9 setup: first_photo_url column already present');
  }
  SpreadsheetApp.flush();
  return {ok: true, added: added};
}

// ============================================================
// One-shot admin: backfill first_photo_url for every ticket that already
// has photos but an empty first_photo_url. Reads each ticket's photo
// folder, picks the lowest-numbered photo (sorted by filename), and
// stores its w400 thumbnail URL. Safe to re-run; only touches empty rows.
// No try/finally in this new code per project rule.
// ============================================================
function backfillFirstPhotoUrls() {
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    var sheet = edpGetSheet(EDP_TAB_TICKETS);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) {
      Logger.log('Backfilled 0 tickets. Skipped 0 (no rows).');
      try { lock.releaseLock(); } catch (e1) {}
      return {ok: true, backfilled: 0, skipped: 0};
    }
    var headers   = values[0];
    var idIdx     = headers.indexOf('ticket_id');
    var firstIdx  = headers.indexOf('first_photo_url');
    var folderIdx = headers.indexOf('photo_folder_id');
    var countIdx  = headers.indexOf('photo_count');
    if (firstIdx < 0) {
      Logger.log('first_photo_url column missing - run setupEDPIntakeV109() first.');
      try { lock.releaseLock(); } catch (e1) {}
      return {ok: false, error: 'column_missing'};
    }

    var backfilled = 0;
    var skipped = 0;
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (!row[idIdx]) continue;
      var currentUrl = String(row[firstIdx] || '').trim();
      if (currentUrl) { skipped++; continue; }
      var count = parseInt(row[countIdx], 10);
      if (isNaN(count) || count === 0) { skipped++; continue; }
      var folderId = String(row[folderIdx] || '').trim();
      if (!folderId) { skipped++; continue; }
      var photos = edpListTicketPhotos(folderId);
      if (!photos.length) { skipped++; continue; }
      // v1.1.0: skip stickers - regular photos only become the thumbnail.
      var pickFile = null;
      for (var pp = 0; pp < photos.length; pp++) {
        if (photos[pp].kind === 'photo') { pickFile = photos[pp]; break; }
      }
      if (!pickFile) { skipped++; continue; }
      var thumbUrl = EDP_PHOTO_VIEW_PREFIX + pickFile.fileId + EDP_PHOTO_THUMB_SUFFIX;
      sheet.getRange(i + 1, firstIdx + 1).setValue(thumbUrl);
      backfilled++;
    }

    SpreadsheetApp.flush();
    Logger.log('Backfilled ' + backfilled + ' tickets. Skipped ' +
      skipped + ' (no photos or already cached).');
    try { lock.releaseLock(); } catch (e1) {}
    return {ok: true, backfilled: backfilled, skipped: skipped};
  } catch (e) {
    try { lock.releaseLock(); } catch (e2) {}
    Logger.log('Backfill error: ' + e.message);
    return {ok: false, error: e.message};
  }
}
