// ============================================================
// tickets.gs - EDP Intake
// Version: v1.2.3
// Last Updated: 2026-05-19
// Change: v1.2.3 added api_listPurchases(opts, pin) -- server-side
//   query for the new PURCHASE landing layout. Filters TICKETS where
//   intake_type='PURCHASE' by category bucket (Washer/Dryer/Stove/
//   Refrigerator/Freezer/Misc), fuel_type, current calendar month,
//   and free-text query across brand/model/serial/appliance_item_id.
// v1.2.0 split intake -- added api_addWarranty and api_addRepair
//   writing to separate WARRANTY_TICKETS / REPAIR_TICKETS sheets with
//   their own folder roots (EDP_PHOTOS/WARRANTY, EDP_PHOTOS/REPAIRS) and
//   typed ticket ids (W-YYYYMMDD-NNN, R-YYYYMMDD-NNN). api_uploadPhoto
//   now routes by ticket prefix via edpLocateTicketRow so photos land
//   in the correct subfolder regardless of which sheet owns the row.
//   PURCHASE flow (api_createTicket / api_quickAddFloor) is unchanged.
// v1.1.0: Sticker scanner integration. api_uploadPhoto 'kind' arg.
// v1.0.9 carries: first_photo_url cache.
// v1.0.8.1 carries: item_id prefix system, 500-char labels.
// LockService used on writes to prevent races.
// ES5 only. ASCII only.
// ============================================================

function api_listOpenTickets() {
  try {
    var rows = edpReadRows(EDP_TAB_TICKETS, EDP_TICKET_COLUMNS);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var t = rows[i];
      if (t.current_stage === 'COMPLETE') continue;
      out.push({
        ticket_id:       t.ticket_id,
        intake_type:     t.intake_type,
        category:        t.category,
        brand:           t.brand,
        model:           t.model,
        current_stage:   t.current_stage,
        age_days:        edpAgeDays(t.created_at),
        created_at:      t.created_at,
        photo_count:     parseInt(t.photo_count, 10) || 0,
        first_photo_url: String(t.first_photo_url || '')
      });
    }
    var order = {
      RECEIVED:0, DIAGNOSTIC:1, REPAIR:2, CLEAN:3, PAINT:4,
      FINAL_TEST:5, FLOOR_READY:6, COMPLETE:7
    };
    out.sort(function(a, b) {
      var oa = order[a.current_stage] != null ? order[a.current_stage] : 99;
      var ob = order[b.current_stage] != null ? order[b.current_stage] : 99;
      if (oa !== ob) return oa - ob;
      return (b.age_days || 0) - (a.age_days || 0);
    });
    return {ok: true, tickets: out};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function api_getTicket(ticket_id, pin) {
  try {
    if (!ticket_id) return {ok: false, error: 'No ticket_id'};
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};

    var rows = edpReadRows(EDP_TAB_TICKETS, EDP_TICKET_COLUMNS);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].ticket_id === ticket_id) {
        var gated = edpGateTicket(rows[i], user.role);
        return {
          ok:       true,
          ticket:   gated,
          stages:   edpStagesFor(rows[i].intake_type),
          can_edit: edpCanEdit(user)
        };
      }
    }
    return {ok: false, error: 'Ticket not found'};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function api_createTicket(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!payload) return {ok: false, error: 'No payload'};
    var user = edpVerifyPin(payload.pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};

    var intakeType = String(payload.intake_type || '').toUpperCase();
    if (intakeType !== 'PURCHASE' &&
        intakeType !== 'WARRANTY' &&
        intakeType !== 'REPAIR') {
      return {ok: false, error: 'intake_type required'};
    }
    var brand = String(payload.brand || '').trim();
    var model = String(payload.model || '').trim();
    if (!brand && !model) {
      return {ok: false, error: 'Brand or model required'};
    }

    var ticketId = edpNextTicketId();
    var now = edpNowIso();

    var ticket = {
      ticket_id:         ticketId,
      created_at:        now,
      created_by:        user.name,
      intake_type:       intakeType,
      category:          String(payload.category  || '').trim(),
      fuel_type:         String(payload.fuel_type || '').trim(),
      brand:             brand,
      model:             model,
      serial:            String(payload.serial || '').trim(),
      notes:             String(payload.notes  || ''),
      current_stage:     'RECEIVED',
      customer_name:     '',
      customer_phone_1:  '',
      customer_phone_2:  '',
      customer_email:    '',
      seller:            '',
      purchase_price:    '',
      appliance_item_id: '',
      last_updated:      now,
      last_updated_by:   user.name,
      photo_count:       0,
      photo_folder_id:   ''
    };

    if (intakeType === 'WARRANTY' || intakeType === 'REPAIR') {
      ticket.customer_name    = String(payload.customer_name    || '').trim();
      ticket.customer_phone_1 = String(payload.customer_phone_1 || '').trim();
      ticket.customer_phone_2 = String(payload.customer_phone_2 || '').trim();
      ticket.customer_email   = String(payload.customer_email   || '').trim();
    }
    if (intakeType === 'PURCHASE') {
      ticket.seller = String(payload.seller || '').trim();
    }
    if (intakeType === 'PURCHASE' && user.role === 'OWNER') {
      ticket.purchase_price = String(payload.purchase_price || '').trim();
    }

    // v1.0.8.1: Generate the appliance item_id at creation time for PURCHASE
    // tickets so the SKU is known throughout the workflow. Non-PURCHASE
    // tickets never get an item_id (they belong to customers, not us).
    if (intakeType === 'PURCHASE') {
      var prefixCreate = edpItemIdPrefixV2(ticket.category);
      ticket.appliance_item_id = edpNextItemIdV2(
        prefixCreate, ticket.serial, ticket.model
      );
    }

    var sheet = edpGetSheet(EDP_TAB_TICKETS);
    edpAppendByHeader(sheet, ticket);

    var histSheet = edpGetSheet(EDP_TAB_HISTORY);
    var historyId = 'H-' + ticketId + '-1';
    histSheet.appendRow(edpRowToArray({
      history_id:       historyId,
      ticket_id:        ticketId,
      from_stage:       '',
      to_stage:         'RECEIVED',
      transitioned_by:  user.name,
      transitioned_at:  now,
      duration_minutes: 0
    }, EDP_HISTORY_COLUMNS));

    edpWriteAudit(
      user.name, user.role, ticketId, 'CREATE',
      '', '', ticketId, intakeType
    );

    SpreadsheetApp.flush();
    return {ok: true, ticket_id: ticketId};
  } catch (e) {
    return {ok: false, error: e.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function api_transitionStage(ticket_id, to_stage, pin) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!ticket_id) return {ok: false, error: 'No ticket_id'};
    if (!to_stage)  return {ok: false, error: 'No to_stage'};
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    if (EDP_STAGES.indexOf(to_stage) < 0) {
      return {ok: false, error: 'Unknown stage'};
    }

    var sheet = edpGetSheet(EDP_TAB_TICKETS);
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var idIdx     = headers.indexOf('ticket_id');
    var stageIdx  = headers.indexOf('current_stage');
    var luIdx     = headers.indexOf('last_updated');
    var lubIdx    = headers.indexOf('last_updated_by');
    var applIdx   = headers.indexOf('appliance_item_id');

    var rowIndex = -1;
    var ticketDict = null;
    for (var i = 1; i < values.length; i++) {
      if (values[i][idIdx] === ticket_id) {
        rowIndex = i + 1;
        ticketDict = {};
        for (var c = 0; c < headers.length; c++) {
          ticketDict[headers[c]] = values[i][c];
        }
        break;
      }
    }
    if (rowIndex < 0) return {ok: false, error: 'Ticket not found'};

    var fromStage  = String(ticketDict.current_stage || '');
    var intakeType = String(ticketDict.intake_type   || '');

    var allowed = edpStagesFor(intakeType);
    if (allowed.indexOf(to_stage) < 0) {
      return {ok: false, error: to_stage + ' not allowed for ' + intakeType};
    }

    // ATOMICITY GUARD: For PURCHASE tickets transitioning to FLOOR_READY,
    // we either (a) push a new APPLIANCES row when this ticket has never
    // been pushed before, or (b) update the existing APPLIANCES row back
    // to AVAILABLE when the ticket has bounced out and back in. The push
    // happens BEFORE TICKETS is touched so a push failure leaves the
    // stage unchanged. The re-entry update happens before too for the
    // same reason.
    var newItemId       = null;  // populated only on a fresh push
    var returningItemId = null;  // populated only on re-entry
    if (to_stage === 'FLOOR_READY' && intakeType === 'PURCHASE') {
      var existingItemId = String(ticketDict.appliance_item_id || '').trim();
      if (existingItemId) {
        // Re-entering FLOOR_READY. No new row, no new id, no new push.
        // Refresh status AND photo_links in case photos changed since last push.
        edpUpdateAppliancesStatus(existingItemId, 'FLOOR_READY', 'AVAILABLE');
        edpUpdateAppliancesPhotos(
          existingItemId,
          edpGatherPhotoLinks(ticketDict.photo_folder_id)
        );
        returningItemId = existingItemId;
      } else {
        // First time. Push a fresh row.
        ticketDict.current_stage = to_stage;
        newItemId = edpPushToAppliances(ticketDict, user);
      }
    }

    var now = edpNowIso();
    sheet.getRange(rowIndex, stageIdx + 1).setValue(to_stage);
    sheet.getRange(rowIndex, luIdx + 1).setValue(now);
    sheet.getRange(rowIndex, lubIdx + 1).setValue(user.name);
    if (newItemId && applIdx >= 0) {
      sheet.getRange(rowIndex, applIdx + 1).setValue(newItemId);
    }

    // STAGE_HISTORY append.
    var histSheet = edpGetSheet(EDP_TAB_HISTORY);
    var hValues = histSheet.getDataRange().getValues();
    var hHeaders = hValues[0];
    var hTicketIdx = hHeaders.indexOf('ticket_id');
    var hAtIdx     = hHeaders.indexOf('transitioned_at');
    var lastAt = null;
    var count = 0;
    for (var j = 1; j < hValues.length; j++) {
      if (hValues[j][hTicketIdx] === ticket_id) {
        count++;
        var atVal = hValues[j][hAtIdx];
        if (atVal) lastAt = atVal;
      }
    }
    var durationMin = 0;
    if (lastAt) {
      try {
        var prevMs = new Date(lastAt).getTime();
        var nowMs  = new Date(now).getTime();
        if (!isNaN(prevMs) && !isNaN(nowMs)) {
          durationMin = Math.max(0, Math.round((nowMs - prevMs) / 60000));
        }
      } catch (e) { durationMin = 0; }
    }
    var historyId = 'H-' + ticket_id + '-' + (count + 1);
    histSheet.appendRow(edpRowToArray({
      history_id:       historyId,
      ticket_id:        ticket_id,
      from_stage:       fromStage,
      to_stage:         to_stage,
      transitioned_by:  user.name,
      transitioned_at:  now,
      duration_minutes: durationMin
    }, EDP_HISTORY_COLUMNS));

    // Audit: STAGE_CHANGE
    edpWriteAudit(
      user.name, user.role, ticket_id, 'STAGE_CHANGE',
      'current_stage', fromStage, to_stage, ''
    );

    // Audit: FLOOR_READY_PUSH (fresh push) or FLOOR_READY_RETURN (re-entry).
    if (newItemId) {
      edpWriteAudit(
        user.name, user.role, ticket_id, 'FLOOR_READY_PUSH',
        'item_id', '', newItemId, 'Pushed to APPLIANCES tab'
      );
    }
    if (returningItemId) {
      edpWriteAudit(
        user.name, user.role, ticket_id, 'FLOOR_READY_RETURN',
        '', '', returningItemId,
        'Already pushed previously, updated existing APPLIANCES row to AVAILABLE'
      );
    }

    SpreadsheetApp.flush();

    // Pushover notifications. Helper swallows errors; never blocks the txn.
    // Only fire on a FRESH push - re-entry is silent to avoid duplicate alerts.
    if (newItemId) {
      edpPushover(
        'EDP: New Floor Item',
        String(ticketDict.brand || '') + ' ' +
        String(ticketDict.model || '') +
        ' (' + String(ticketDict.category || '') + ')' +
        ' is now on the floor. SKU: ' + newItemId +
        '. Added by ' + user.name + '.',
        0
      );
    }
    if (to_stage === 'COMPLETE' &&
        (intakeType === 'WARRANTY' || intakeType === 'REPAIR')) {
      edpPushover(
        'EDP: Repair Complete',
        String(ticketDict.brand || '') + ' ' +
        String(ticketDict.model || '') +
        ' repair complete for ' + String(ticketDict.customer_name || '') +
        '. Ticket: ' + ticket_id + '. Tech: ' + user.name + '.',
        0
      );
    }

    return {
      ok:         true,
      new_stage:  to_stage,
      from_stage: fromStage,
      item_id:    newItemId || returningItemId || null,
      reused:     !!returningItemId
    };
  } catch (e) {
    return {ok: false, error: e.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ============================================================
// QUICK-ADD-TO-FLOOR
// Atomic: ticket created + STAGE_HISTORY + audits + APPLIANCES push.
// Stage is set to FLOOR_READY directly. Only allowed PINs (OWNER + Joe)
// can call this (server-enforced via edpCanEdit).
// ============================================================
function api_quickAddFloor(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!payload) return {ok: false, error: 'No payload'};
    var user = edpVerifyPin(payload.pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    if (!edpCanEdit(user)) {
      return {ok: false, error: 'Not authorized'};
    }

    var category = String(payload.category || '').trim();
    var brand    = String(payload.brand    || '').trim();
    var model    = String(payload.model    || '').trim();
    if (!category) return {ok: false, error: 'Category required'};
    if (!brand)    return {ok: false, error: 'Brand required'};
    if (!model)    return {ok: false, error: 'Model required'};

    var fuel   = String(payload.fuel_type || '').trim();
    var serial = String(payload.serial    || '').trim();
    var notes  = String(payload.notes     || '');
    var seller = String(payload.seller    || '').trim();
    var price  = (user.role === 'OWNER')
      ? String(payload.purchase_price || '').trim() : '';

    var ticketId = edpNextTicketId();
    var now      = edpNowIso();

    var ticket = {
      ticket_id:         ticketId,
      created_at:        now,
      created_by:        user.name,
      intake_type:       'PURCHASE',
      category:          category,
      fuel_type:         fuel,
      brand:             brand,
      model:             model,
      serial:            serial,
      notes:             notes,
      current_stage:     'FLOOR_READY',
      customer_name:     '',
      customer_phone_1:  '',
      customer_phone_2:  '',
      customer_email:    '',
      seller:            seller,
      purchase_price:    price,
      appliance_item_id: '',
      last_updated:      now,
      last_updated_by:   user.name,
      photo_count:       0,
      photo_folder_id:   ''
    };

    // v1.0.8.1: Assign item_id BEFORE the APPLIANCES push so the same id
    // flows into both TICKETS and APPLIANCES atomically. edpPushToAppliances
    // will reuse the pre-set ticket.appliance_item_id.
    var prefixQA = edpItemIdPrefixV2(ticket.category);
    ticket.appliance_item_id = edpNextItemIdV2(
      prefixQA, ticket.serial, ticket.model
    );

    // APPLIANCES push first - if it throws, nothing else is written.
    var itemId = edpPushToAppliances(ticket, user);

    var ticketsSheet = edpGetSheet(EDP_TAB_TICKETS);
    edpAppendByHeader(ticketsSheet, ticket);

    var histSheet = edpGetSheet(EDP_TAB_HISTORY);
    histSheet.appendRow(edpRowToArray({
      history_id:       'H-' + ticketId + '-1',
      ticket_id:        ticketId,
      from_stage:       '',
      to_stage:         'FLOOR_READY',
      transitioned_by:  user.name,
      transitioned_at:  now,
      duration_minutes: 0
    }, EDP_HISTORY_COLUMNS));

    edpWriteAudit(user.name, user.role, ticketId, 'CREATE',
      '', '', ticketId, 'QUICK_ADD');
    edpWriteAudit(user.name, user.role, ticketId, 'STAGE_CHANGE',
      'current_stage', '', 'FLOOR_READY', 'Quick-added to floor');
    edpWriteAudit(user.name, user.role, ticketId, 'FLOOR_READY_PUSH',
      'item_id', '', itemId, 'Pushed to APPLIANCES tab');

    SpreadsheetApp.flush();

    edpPushover(
      'EDP: New Floor Item',
      brand + ' ' + model + ' (' + category + ') is now on the floor. ' +
      'SKU: ' + itemId + '. Added by ' + user.name + '.',
      0
    );

    return {ok: true, ticket_id: ticketId, item_id: itemId};
  } catch (e) {
    return {ok: false, error: e.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ============================================================
// EDIT
// ============================================================
function api_updateTicket(ticket_id, updates, pin) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!ticket_id) return {ok: false, error: 'No ticket_id'};
    if (!updates || typeof updates !== 'object') {
      return {ok: false, error: 'No updates'};
    }
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    if (!edpCanEdit(user)) {
      return {ok: false, error: 'Not authorized to edit'};
    }

    var sheet = edpGetSheet(EDP_TAB_TICKETS);
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var idIdx = headers.indexOf('ticket_id');
    var rowIndex = -1;
    for (var i = 1; i < values.length; i++) {
      if (values[i][idIdx] === ticket_id) {
        rowIndex = i + 1;
        break;
      }
    }
    if (rowIndex < 0) return {ok: false, error: 'Ticket not found'};

    var currentRow = values[rowIndex - 1];
    var current = {};
    for (var c = 0; c < headers.length; c++) {
      current[headers[c]] = currentRow[c];
    }

    var editable = [
      'intake_type', 'category', 'fuel_type', 'brand', 'model', 'serial',
      'notes',
      'customer_name', 'customer_phone_1', 'customer_phone_2', 'customer_email',
      'seller',
      'purchase_price'
    ];

    var effectiveType = updates.hasOwnProperty('intake_type')
      ? String(updates.intake_type || '').toUpperCase().trim()
      : String(current.intake_type || '').toUpperCase();

    var changes = [];
    for (var k = 0; k < editable.length; k++) {
      var field = editable[k];
      if (!updates.hasOwnProperty(field)) continue;

      if (field === 'purchase_price') {
        if (user.role !== 'OWNER') continue;
        if (effectiveType !== 'PURCHASE') continue;
      }
      if (field === 'seller' && effectiveType !== 'PURCHASE') continue;
      if ((field === 'customer_name'    || field === 'customer_phone_1' ||
           field === 'customer_phone_2' || field === 'customer_email') &&
          effectiveType === 'PURCHASE') continue;

      var newVal = String(updates[field] == null ? '' : updates[field]).trim();
      var oldVal = String(current[field] == null ? '' : current[field]);
      if (newVal !== oldVal) {
        changes.push({field: field, oldValue: oldVal, newValue: newVal});
      }
    }

    if (changes.length === 0) {
      return {ok: true, changes_applied: 0, no_changes: true};
    }

    for (var x = 0; x < changes.length; x++) {
      var fIdx = headers.indexOf(changes[x].field);
      if (fIdx >= 0) {
        sheet.getRange(rowIndex, fIdx + 1).setValue(changes[x].newValue);
      }
    }
    var now = edpNowIso();
    var luIdx  = headers.indexOf('last_updated');
    var lubIdx = headers.indexOf('last_updated_by');
    if (luIdx  >= 0) sheet.getRange(rowIndex, luIdx + 1).setValue(now);
    if (lubIdx >= 0) sheet.getRange(rowIndex, lubIdx + 1).setValue(user.name);

    for (var y = 0; y < changes.length; y++) {
      edpWriteAudit(
        user.name, user.role, ticket_id, 'EDIT',
        changes[y].field, changes[y].oldValue, changes[y].newValue, ''
      );
    }

    SpreadsheetApp.flush();
    return {ok: true, ticket_id: ticket_id, changes_applied: changes.length};
  } catch (e) {
    return {ok: false, error: e.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ============================================================
// ARCHIVE (soft delete, 90 day window)
// ============================================================
function api_archiveTicket(ticket_id, pin) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!ticket_id) return {ok: false, error: 'No ticket_id'};
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    if (!edpCanEdit(user)) {
      return {ok: false, error: 'Not authorized to archive'};
    }

    var sheet = edpGetSheet(EDP_TAB_TICKETS);
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var idIdx = headers.indexOf('ticket_id');
    var rowIndex = -1;
    var row = null;
    for (var i = 1; i < values.length; i++) {
      if (values[i][idIdx] === ticket_id) {
        rowIndex = i + 1;
        row = values[i];
        break;
      }
    }
    if (rowIndex < 0) return {ok: false, error: 'Ticket not found'};

    var archiveSheet = edpGetSheet(EDP_TAB_ARCHIVE);
    var archiveHeaders = archiveSheet
      .getRange(1, 1, 1, archiveSheet.getLastColumn())
      .getValues()[0];

    var dict = {};
    for (var c = 0; c < headers.length; c++) dict[headers[c]] = row[c];

    var now = edpNowIso();
    var tz = Session.getScriptTimeZone() || 'America/Chicago';
    var deadline = new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000);
    var deadlineStr = Utilities.formatDate(deadline, tz, 'yyyy-MM-dd');

    dict.archived_at      = now;
    dict.archived_by      = user.name;
    dict.restore_deadline = deadlineStr;

    var archiveRow = [];
    for (var ah = 0; ah < archiveHeaders.length; ah++) {
      var h = archiveHeaders[ah];
      archiveRow.push(dict[h] == null ? '' : dict[h]);
    }
    archiveSheet.appendRow(archiveRow);

    sheet.deleteRow(rowIndex);

    edpWriteAudit(
      user.name, user.role, ticket_id, 'ARCHIVE',
      '', '', 'moved to ARCHIVE tab',
      'restore_deadline: ' + edpFormatDate(deadline)
    );

    SpreadsheetApp.flush();
    return {ok: true, restore_deadline: deadlineStr};
  } catch (e) {
    return {ok: false, error: e.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ============================================================
// VENDORS API
// ============================================================
function api_listVendors() {
  try {
    var rows = edpReadRows(EDP_TAB_VENDORS, EDP_VENDOR_COLUMNS);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      out.push({
        vendor_id: rows[i].vendor_id,
        name:      rows[i].name,
        phone:     rows[i].phone,
        notes:     rows[i].notes
      });
    }
    return {ok: true, vendors: out};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function api_createVendor(name, phone, notes, pin) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};

    var nm = String(name || '').trim();
    if (!nm) return {ok: false, error: 'Seller name required'};

    var sheet = edpGetSheet(EDP_TAB_VENDORS);
    var values = sheet.getDataRange().getValues();

    var nmLower = nm.toLowerCase();
    for (var d = 1; d < values.length; d++) {
      if (String(values[d][1] || '').toLowerCase() === nmLower) {
        return {
          ok: false,
          error: 'Seller name already exists',
          vendor: {vendor_id: values[d][0], name: values[d][1]}
        };
      }
    }

    var max = 0;
    for (var i = 1; i < values.length; i++) {
      var id = String(values[i][0] || '');
      var m = id.match(/^VEN-(\d+)$/);
      if (m) {
        var n = parseInt(m[1], 10);
        if (!isNaN(n) && n > max) max = n;
      }
    }
    var seq = String(max + 1);
    while (seq.length < 3) seq = '0' + seq;
    var vendorId = 'VEN-' + seq;

    sheet.appendRow([
      vendorId,
      nm,
      String(phone || '').trim(),
      String(notes || '').trim(),
      edpNowIso(),
      user.name
    ]);
    SpreadsheetApp.flush();
    return {
      ok: true,
      vendor: {
        vendor_id: vendorId,
        name:      nm,
        phone:     String(phone || ''),
        notes:     String(notes || '')
      }
    };
  } catch (e) {
    return {ok: false, error: e.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ============================================================
// PHASE 2 PLACEHOLDER - serial-number lookup against APPLIANCES
// ============================================================
function api_lookupSerial(serial) {
  return null;
}

// ============================================================
// PHOTOS API
// ============================================================
// api_uploadPhoto(ticket_id, base64data, mime, pin)
//   - Open to any valid PIN.
//   - Server-side cap: refuses if photo_count >= EDP_PHOTO_MAX_PER_TICKET.
//   - Creates per-ticket Drive folder if needed and caches its id on the
//     ticket row (photo_folder_id column).
//   - Names the file photo_NNN.jpg/png/webp by ascending sequence.
//   - Increments photo_count.
//   - Writes PHOTO_ADDED audit row.
//   - If the ticket has an appliance_item_id, refreshes APPLIANCES.photo_links.
//
// api_listPhotos(ticket_id, pin)
//   - Reads the Drive folder (source of truth). Returns [{fileId, filename, url}].
//
// api_deletePhoto(ticket_id, file_id, pin)
//   - OWNER or TECH only (STAFF rejected).
//   - Verifies the file belongs to this ticket's folder before trashing.
//   - Decrements photo_count.
//   - Writes PHOTO_DELETED audit row.
//   - If the ticket has an appliance_item_id, refreshes APPLIANCES.photo_links.
// ============================================================

function api_uploadPhoto(ticket_id, base64data, mime, pin, kind) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!ticket_id)  return {ok: false, error: 'No ticket_id'};
    if (!base64data) return {ok: false, error: 'No data'};
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    // Upload open to any valid PIN.

    // v1.2.0: ticket may live in TICKETS (PURCHASE / existing flow),
    // WARRANTY_TICKETS (W- prefix), or REPAIR_TICKETS (R- prefix). The
    // lookup helper picks the right sheet by prefix. APPLIANCES sync and
    // first_photo_url caching only apply to TICKETS (the legacy queue).
    var loc = edpLocateTicketRow(ticket_id);
    if (!loc) return {ok: false, error: 'Ticket not found'};
    var sheet     = loc.sheet;
    var values    = loc.values;
    var headers   = loc.headers;
    var rowIndex  = loc.rowIndex;
    var idIdx     = loc.idIdx;
    var countIdx  = loc.countIdx;
    var folderIdx = loc.folderIdx;
    var applIdx   = headers.indexOf('appliance_item_id');
    var firstIdx  = headers.indexOf('first_photo_url');

    var currentCount = parseInt(values[rowIndex - 1][countIdx], 10);
    if (isNaN(currentCount)) currentCount = 0;
    var folderId = String(values[rowIndex - 1][folderIdx] || '');
    var applianceItemId = (applIdx  >= 0) ? String(values[rowIndex - 1][applIdx]  || '') : '';
    var currentFirstUrl = (firstIdx >= 0) ? String(values[rowIndex - 1][firstIdx] || '').trim() : '';

    if (currentCount >= EDP_PHOTO_MAX_PER_TICKET) {
      return {ok: false, error: 'MAX_PHOTOS_REACHED'};
    }

    if (!folderId) {
      if (loc.tab === EDP_TAB_WARRANTY) {
        folderId = edpEnsureTypedTicketFolder('WARRANTY', ticket_id);
      } else if (loc.tab === EDP_TAB_REPAIR) {
        folderId = edpEnsureTypedTicketFolder('REPAIR', ticket_id);
      } else {
        folderId = edpEnsureTicketFolder(ticket_id);
      }
      sheet.getRange(rowIndex, folderIdx + 1).setValue(folderId);
    }

    var mt = String(mime || 'image/jpeg').toLowerCase();
    var ext = '.jpg';
    if (mt.indexOf('png')  >= 0) ext = '.png';
    if (mt.indexOf('webp') >= 0) ext = '.webp';
    if (mt.indexOf('heic') >= 0) ext = '.heic';
    if (mt.indexOf('heif') >= 0) ext = '.heif';

    // v1.1.0: sticker vs regular photo. Sticker files use sticker_NNN
    // numbered independently of regular photos.
    var fileKind = (kind === 'sticker') ? 'sticker' : 'photo';
    var seqNum = (fileKind === 'sticker')
      ? edpNextStickerSeq(folderId)
      : edpNextPhotoSeq(folderId);
    var seq = String(seqNum);
    while (seq.length < 3) seq = '0' + seq;
    var filename = (fileKind === 'sticker' ? 'sticker_' : 'photo_') + seq + ext;

    var bytes;
    try {
      bytes = Utilities.base64Decode(base64data);
    } catch (e) {
      return {ok: false, error: 'Invalid base64 data'};
    }
    var folder = DriveApp.getFolderById(folderId);
    var blob = Utilities.newBlob(bytes, mt, filename);
    var file = folder.createFile(blob);

    // Public-link share so the lh3.googleusercontent.com CDN URL works for
    // other portals (Register, Customer App, Owner Dashboard).
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (eShare) {
      Logger.log('Photo sharing failed (may already be shared): ' + eShare.message);
    }

    var newCount = currentCount + 1;
    sheet.getRange(rowIndex, countIdx + 1).setValue(newCount);

    edpWriteAudit(
      user.name, user.role, ticket_id, 'PHOTO_ADDED',
      '', '', filename, file.getId()
    );

    // Refresh APPLIANCES.photo_links if the ticket has been pushed.
    if (applianceItemId) {
      edpUpdateAppliancesPhotos(applianceItemId, edpGatherPhotoLinks(folderId));
    }

    // v1.0.9: cache first_photo_url on the first upload so the queue tile
    // can show a thumbnail without round-tripping to Drive.
    // v1.1.0: stickers are NOT eligible. Skip if this upload is a sticker.
    var cachedFirstUrl = '';
    if (fileKind === 'photo' && firstIdx >= 0 && !currentFirstUrl) {
      cachedFirstUrl = EDP_PHOTO_VIEW_PREFIX + file.getId() + EDP_PHOTO_THUMB_SUFFIX;
      sheet.getRange(rowIndex, firstIdx + 1).setValue(cachedFirstUrl);
      edpWriteAudit(
        user.name, user.role, ticket_id, 'FIRST_PHOTO_CACHED',
        '', '', cachedFirstUrl, 'cached on upload of ' + filename
      );
    }

    SpreadsheetApp.flush();
    return {
      ok:              true,
      fileId:          file.getId(),
      filename:        filename,
      kind:            fileKind,
      url:             EDP_PHOTO_VIEW_PREFIX + file.getId() + EDP_PHOTO_VIEW_SUFFIX,
      photo_count:     newCount,
      label:           '',
      dateStr:         edpFormatDate(file.getDateCreated()),
      first_photo_url: cachedFirstUrl
    };
  } catch (e) {
    return {ok: false, error: e.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function api_listPhotos(ticket_id, pin) {
  try {
    if (!ticket_id) return {ok: false, error: 'No ticket_id'};
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};

    var sheet = edpGetSheet(EDP_TAB_TICKETS);
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var idIdx     = headers.indexOf('ticket_id');
    var folderIdx = headers.indexOf('photo_folder_id');
    if (folderIdx < 0) return {ok: true, photos: [], can_delete: false};

    var folderId = '';
    for (var i = 1; i < values.length; i++) {
      if (values[i][idIdx] === ticket_id) {
        folderId = String(values[i][folderIdx] || '');
        break;
      }
    }
    var photos = edpListTicketPhotos(folderId);
    return {
      ok:         true,
      photos:     photos,
      can_delete: edpCanDeletePhoto(user)
    };
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function api_deletePhoto(ticket_id, file_id, pin) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!ticket_id) return {ok: false, error: 'No ticket_id'};
    if (!file_id)   return {ok: false, error: 'No file_id'};
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    if (!edpCanDeletePhoto(user)) {
      return {ok: false, error: 'Not authorized'};
    }

    var sheet = edpGetSheet(EDP_TAB_TICKETS);
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var idIdx     = headers.indexOf('ticket_id');
    var countIdx  = headers.indexOf('photo_count');
    var folderIdx = headers.indexOf('photo_folder_id');
    var applIdx   = headers.indexOf('appliance_item_id');
    var firstIdx  = headers.indexOf('first_photo_url');

    var rowIndex = -1;
    var currentCount = 0;
    var folderId = '';
    var applianceItemId = '';
    var currentFirstUrl = '';
    for (var i = 1; i < values.length; i++) {
      if (values[i][idIdx] === ticket_id) {
        rowIndex = i + 1;
        currentCount = parseInt(values[i][countIdx], 10);
        if (isNaN(currentCount)) currentCount = 0;
        folderId = String(values[i][folderIdx] || '');
        if (applIdx  >= 0) applianceItemId = String(values[i][applIdx]  || '');
        if (firstIdx >= 0) currentFirstUrl = String(values[i][firstIdx] || '').trim();
        break;
      }
    }
    if (rowIndex < 0) return {ok: false, error: 'Ticket not found'};
    if (!folderId)    return {ok: false, error: 'Ticket has no photo folder'};

    var file;
    try {
      file = DriveApp.getFileById(file_id);
    } catch (e) {
      return {ok: false, error: 'File not found'};
    }
    var filename = file.getName();

    // Verify the file lives in this ticket's folder.
    var parents = file.getParents();
    var inFolder = false;
    while (parents.hasNext()) {
      if (parents.next().getId() === folderId) {
        inFolder = true;
        break;
      }
    }
    if (!inFolder) return {ok: false, error: 'File does not belong to this ticket'};

    file.setTrashed(true);

    var newCount = currentCount > 0 ? currentCount - 1 : 0;
    sheet.getRange(rowIndex, countIdx + 1).setValue(newCount);

    edpWriteAudit(
      user.name, user.role, ticket_id, 'PHOTO_DELETED',
      '', filename, file_id, ''
    );

    if (applianceItemId) {
      edpUpdateAppliancesPhotos(applianceItemId, edpGatherPhotoLinks(folderId));
    }

    // v1.0.9: if the deleted file was the cached queue-tile thumbnail,
    // swap to the next remaining photo or clear if none are left.
    // v1.1.0: skip stickers - they never become the thumbnail.
    var newFirstUrl = currentFirstUrl;
    if (firstIdx >= 0 && currentFirstUrl &&
        currentFirstUrl.indexOf(file_id) >= 0) {
      var remaining = edpListTicketPhotos(folderId);
      newFirstUrl = '';
      for (var rp = 0; rp < remaining.length; rp++) {
        if (remaining[rp].kind === 'photo') {
          newFirstUrl = EDP_PHOTO_VIEW_PREFIX + remaining[rp].fileId +
            EDP_PHOTO_THUMB_SUFFIX;
          break;
        }
      }
      sheet.getRange(rowIndex, firstIdx + 1).setValue(newFirstUrl);
      edpWriteAudit(
        user.name, user.role, ticket_id, 'FIRST_PHOTO_CACHED',
        '', currentFirstUrl, newFirstUrl,
        newFirstUrl ? 'swapped after delete' : 'cleared after delete'
      );
    }

    SpreadsheetApp.flush();
    return {ok: true, photo_count: newCount, first_photo_url: newFirstUrl};
  } catch (e) {
    return {ok: false, error: e.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ============================================================
// PHOTO LABELS
// ============================================================
// api_setPhotoLabel(ticket_id, photo_filename, label, pin)
//   - Open to any valid PIN.
//   - Trims label and caps at 80 chars.
//   - Empty / whitespace-only label removes the entry.
//   - Reads, mutates, and writes back the per-ticket _labels.json sidecar.
//   - Audits PHOTO_LABELED.
// No try/finally; lock release is explicit in every return path per project rule.
// ============================================================
function api_setPhotoLabel(ticket_id, photo_filename, label, pin) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!ticket_id) {
      try { lock.releaseLock(); } catch (e0) {}
      return {ok: false, error: 'No ticket_id'};
    }
    if (!photo_filename) {
      try { lock.releaseLock(); } catch (e0) {}
      return {ok: false, error: 'No photo_filename'};
    }
    var user = edpVerifyPin(pin);
    if (!user) {
      try { lock.releaseLock(); } catch (e0) {}
      return {ok: false, error: 'Invalid PIN'};
    }

    var sheet = edpGetSheet(EDP_TAB_TICKETS);
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var idIdx     = headers.indexOf('ticket_id');
    var folderIdx = headers.indexOf('photo_folder_id');
    if (folderIdx < 0) {
      try { lock.releaseLock(); } catch (e0) {}
      return {ok: false, error: 'Schema missing photo_folder_id. Run setupEDPIntakePhotos().'};
    }

    var folderId = '';
    for (var i = 1; i < values.length; i++) {
      if (values[i][idIdx] === ticket_id) {
        folderId = String(values[i][folderIdx] || '');
        break;
      }
    }
    if (!folderId) {
      try { lock.releaseLock(); } catch (e0) {}
      return {ok: false, error: 'Ticket has no photo folder'};
    }

    var trimmed = String(label == null ? '' : label).trim();
    if (trimmed.length > EDP_PHOTO_LABEL_MAX_LEN) {
      trimmed = trimmed.substring(0, EDP_PHOTO_LABEL_MAX_LEN);
    }

    var labels = edpReadLabels(folderId);
    var oldLabel = labels[photo_filename] || '';
    if (trimmed === '') {
      if (labels.hasOwnProperty(photo_filename)) {
        delete labels[photo_filename];
      }
    } else {
      labels[photo_filename] = trimmed;
    }
    var ok = edpWriteLabels(folderId, labels);
    if (!ok) {
      try { lock.releaseLock(); } catch (e0) {}
      return {ok: false, error: 'Failed to write labels file'};
    }

    edpWriteAudit(
      user.name, user.role, ticket_id, 'PHOTO_LABELED',
      photo_filename, oldLabel, trimmed,
      photo_filename + ' => ' + (trimmed || '(cleared)')
    );

    SpreadsheetApp.flush();
    try { lock.releaseLock(); } catch (e0) {}
    return {ok: true, label: trimmed, photo_filename: photo_filename};
  } catch (e) {
    try { lock.releaseLock(); } catch (e2) {}
    return {ok: false, error: e.message};
  }
}

// ============================================================
// v1.2.0: WARRANTY + REPAIR save endpoints. Each writes to its own
// sheet (lazy-created), generates a typed ticket_id, ensures the typed
// photo subfolder, and writes the row by header name so column drift
// can never misalign data. Customer fields are required for both.
// ============================================================

function api_addWarranty(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!payload) return {ok: false, error: 'No payload'};
    var user = edpVerifyPin(payload.pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};

    var category = String(payload.category || '').trim();
    var brand    = String(payload.brand    || '').trim();
    if (!category) return {ok: false, error: 'Category is required.'};
    if (!brand)    return {ok: false, error: 'Brand is required.'};
    var custName  = String(payload.customer_name    || '').trim();
    var custPhone = String(payload.customer_phone_1 || '').trim();
    if (!custName)  return {ok: false, error: 'Customer name is required.'};
    if (!custPhone) return {ok: false, error: 'Customer phone is required.'};
    var warrantyIssue = String(payload.warranty_issue || '').trim();
    if (!warrantyIssue) return {ok: false, error: 'Warranty issue is required.'};

    var sh = edpEnsureTypedSheet(EDP_TAB_WARRANTY, EDP_WARRANTY_COLUMNS);
    var ticketId  = edpNextTypedTicketId('W', EDP_TAB_WARRANTY, EDP_WARRANTY_COLUMNS);
    var folderId  = edpEnsureTypedTicketFolder('WARRANTY', ticketId);
    var folderUrl = 'https://drive.google.com/drive/folders/' + folderId;
    var now = edpNowIso();

    var row = {
      ticket_id:          ticketId,
      created_at:         now,
      created_by:         user.name,
      intake_type:        'WARRANTY',
      category:           category,
      brand:              brand,
      model:              String(payload.model  || '').trim(),
      serial:             String(payload.serial || '').trim(),
      customer_name:      custName,
      customer_phone_1:   custPhone,
      customer_phone_2:   String(payload.customer_phone_2 || '').trim(),
      customer_email:     String(payload.customer_email   || '').trim(),
      original_sale_date: String(payload.original_sale_date || '').trim(),
      warranty_issue:     warrantyIssue,
      notes:              String(payload.notes || ''),
      photo_folder_url:   folderUrl,
      photo_folder_id:    folderId,
      photo_count:        0,
      status:             'NEW',
      resolution_notes:   '',
      resolved_at:        '',
      resolved_by:        ''
    };

    edpAppendByHeader(sh, row);
    edpWriteAudit(
      user.name, user.role, ticketId, 'CREATE',
      '', '', ticketId, 'WARRANTY'
    );
    SpreadsheetApp.flush();
    return {ok: true, ticket_id: ticketId, photo_folder_id: folderId};
  } catch (e) {
    return {ok: false, error: e.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function api_addRepair(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!payload) return {ok: false, error: 'No payload'};
    var user = edpVerifyPin(payload.pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};

    var category = String(payload.category || '').trim();
    var brand    = String(payload.brand    || '').trim();
    if (!category) return {ok: false, error: 'Category is required.'};
    if (!brand)    return {ok: false, error: 'Brand is required.'};
    var custName  = String(payload.customer_name    || '').trim();
    var custPhone = String(payload.customer_phone_1 || '').trim();
    if (!custName)  return {ok: false, error: 'Customer name is required.'};
    if (!custPhone) return {ok: false, error: 'Customer phone is required.'};
    var problem = String(payload.problem_description || '').trim();
    if (!problem) return {ok: false, error: 'Problem description is required.'};

    var dropOffDate = String(payload.drop_off_date || '').trim();
    if (!dropOffDate) {
      var tz = Session.getScriptTimeZone() || 'America/Chicago';
      dropOffDate = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    }

    var sh = edpEnsureTypedSheet(EDP_TAB_REPAIR, EDP_REPAIR_COLUMNS);
    var ticketId  = edpNextTypedTicketId('R', EDP_TAB_REPAIR, EDP_REPAIR_COLUMNS);
    var folderId  = edpEnsureTypedTicketFolder('REPAIR', ticketId);
    var folderUrl = 'https://drive.google.com/drive/folders/' + folderId;
    var now = edpNowIso();

    var row = {
      ticket_id:           ticketId,
      created_at:          now,
      created_by:          user.name,
      intake_type:         'REPAIR',
      category:            category,
      brand:               brand,
      model:               String(payload.model  || '').trim(),
      serial:              String(payload.serial || '').trim(),
      customer_name:       custName,
      customer_phone_1:    custPhone,
      customer_phone_2:    String(payload.customer_phone_2 || '').trim(),
      customer_email:      String(payload.customer_email   || '').trim(),
      problem_description: problem,
      diagnostic_notes:    String(payload.diagnostic_notes || '').trim(),
      drop_off_date:       dropOffDate,
      notes:               String(payload.notes || ''),
      photo_folder_url:    folderUrl,
      photo_folder_id:     folderId,
      photo_count:         0,
      status:              'NEW',
      diagnostic_quote:    '',
      final_cost:          '',
      completed_at:        '',
      completed_by:        ''
    };

    edpAppendByHeader(sh, row);
    edpWriteAudit(
      user.name, user.role, ticketId, 'CREATE',
      '', '', ticketId, 'REPAIR'
    );
    SpreadsheetApp.flush();
    return {ok: true, ticket_id: ticketId, photo_folder_id: folderId};
  } catch (e) {
    return {ok: false, error: e.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ============================================================
// v1.2.3: PURCHASE landing layout queries.
//
// api_listPurchases(opts, pin) returns purchase rows from TICKETS
// (intake_type='PURCHASE') with optional filters applied server-side:
//   opts.category   - 'Washer'|'Dryer'|'Stove'|'Refrigerator'|'Freezer'|'Misc'
//                     (or '' for all). 'Misc' rolls up anything not in
//                     the known set, plus blanks / unrecognized values.
//   opts.fuel       - 'Gas'|'Electric'|'' (filters fuel_type, case-insensitive)
//   opts.monthOnly  - true to restrict to current calendar month
//   opts.query      - free text matched (case-insensitive substring) against
//                     brand / model / serial / appliance_item_id
//   opts.limit      - max rows returned (default 200)
//
// Returns {ok:true, units:[...]} sorted by created_at desc. Each unit:
//   {ticket_id, brand, model, serial, category, fuel_type,
//    appliance_item_id, created_at, first_photo_url}
// ============================================================
function api_listPurchases(opts, pin) {
  try {
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    opts = opts || {};

    var wantCat = String(opts.category || '').trim();
    var wantFuel = String(opts.fuel || '').trim().toLowerCase();
    var wantMonth = !!opts.monthOnly;
    var query = String(opts.query || '').trim().toLowerCase();
    var limit = parseInt(opts.limit, 10);
    if (isNaN(limit) || limit <= 0 || limit > 1000) limit = 200;

    var knownCats = {
      WASHER: 'Washer', DRYER: 'Dryer', STOVE: 'Stove',
      REFRIGERATOR: 'Refrigerator', FREEZER: 'Freezer', MISC: 'Misc'
    };
    var wantCatUpper = wantCat ? wantCat.toUpperCase() : '';

    var monthStartIso = '';
    if (wantMonth) {
      var now = new Date();
      var first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      monthStartIso = first.toISOString();
    }

    var rows = edpReadRows(EDP_TAB_TICKETS, EDP_TICKET_COLUMNS);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var t = rows[i];
      if (String(t.intake_type || '').toUpperCase() !== 'PURCHASE') continue;

      // Bucket category. Anything blank or unrecognized rolls to MISC.
      var rawCat = String(t.category || '').trim();
      var bucket;
      var rawUpper = rawCat.toUpperCase();
      if (knownCats.hasOwnProperty(rawUpper)) bucket = knownCats[rawUpper];
      else bucket = 'Misc';

      if (wantCatUpper) {
        if (wantCatUpper === 'MISC') {
          if (bucket !== 'Misc') continue;
        } else if (bucket.toUpperCase() !== wantCatUpper) {
          continue;
        }
      }

      if (wantFuel) {
        var fuelLower = String(t.fuel_type || '').toLowerCase();
        if (fuelLower !== wantFuel) continue;
      }

      if (wantMonth) {
        var createdStr = String(t.created_at || '');
        if (!createdStr || createdStr < monthStartIso) continue;
      }

      if (query) {
        var hay = (
          String(t.brand || '') + ' ' +
          String(t.model || '') + ' ' +
          String(t.serial || '') + ' ' +
          String(t.appliance_item_id || '')
        ).toLowerCase();
        if (hay.indexOf(query) < 0) continue;
      }

      out.push({
        ticket_id:         String(t.ticket_id || ''),
        brand:             String(t.brand || ''),
        model:             String(t.model || ''),
        serial:            String(t.serial || ''),
        category:          bucket,
        fuel_type:         String(t.fuel_type || ''),
        appliance_item_id: String(t.appliance_item_id || ''),
        created_at:        String(t.created_at || ''),
        first_photo_url:   String(t.first_photo_url || '')
      });
    }

    // Newest first.
    out.sort(function (a, b) {
      if (a.created_at === b.created_at) return 0;
      return (a.created_at < b.created_at) ? 1 : -1;
    });

    if (out.length > limit) out = out.slice(0, limit);
    return {ok: true, units: out};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}
