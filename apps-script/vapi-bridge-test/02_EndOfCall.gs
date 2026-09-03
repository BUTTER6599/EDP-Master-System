// EDP Vapi Bridge - 02_EndOfCall (split from Code.js b5a4038, move-only refactor)

// ============================================================
// END OF CALL
// ============================================================
// Sheet schema - Call ID is column 2 ("B"), matching the header row below.
// Identified directly from the existing header, not guessed.
var VAPI_CALL_LOG_HEADERS_ = [
  'Timestamp', 'Call ID', 'Caller Phone', 'Assistant',
  'Duration (sec)', 'Cost ($)', 'Status', 'Intake Type',
  'Summary', 'Recording URL', 'Transcript URL', 'Customer Name'
];
var VAPI_CALL_LOG_CALL_ID_COLUMN_ = 2;

var VAPI_CALL_LOG_LOCK_WAIT_MS_ = 10000;

// Owns the complete, idempotent end-of-call transaction: acquire lock,
// check for a duplicate Call ID, download+save recording/transcript, append
// the Sheet row, then fire Pushover only after that row durably exists.
// Returns a plain result object - never throws for expected outcomes
// (missing Call ID, duplicate, lock timeout, processing error).
function handleEndOfCall(msg) {
  var call = msg.call || {};
  var artifact = msg.artifact || {};
  var timestamp = new Date();
  var callId = call.id || '';
  var caller = (call.customer && call.customer.number) || '';
  var assistant = (call.assistant && call.assistant.name) || (msg.assistant && msg.assistant.name) || 'Unknown';
  var duration = msg.durationSeconds || 0;
  var cost = msg.cost || 0;
  var endedReason = msg.endedReason || '';
  var summary = msg.summary || '';
  var transcript = artifact.transcript || msg.transcript || '';

  // These raw fields are read only to decide whether a recording likely
  // exists for this call (compatibility/diagnostic use). They are never
  // fetched and never used as the Pushover or Sheet recording link -
  // fetchVapiMonoRecordingBlob_() below is the only recording source now.
  var rawRecordingUrl = artifact.recordingUrl || artifact.stereoRecordingUrl || msg.recordingUrl || '';

  // The Call ID is the idempotency key - required before any recording
  // download, Drive save, Sheet append, or Pushover action.
  if (!callId) {
    Logger.log('handleEndOfCall rejected: missing Call ID');
    return { ok: false, status: 'invalid_request' };
  }

  var lock = LockService.getScriptLock();
  var locked = false;
  var createdDriveFileIds = [];

  try {
    locked = lock.tryLock(VAPI_CALL_LOG_LOCK_WAIT_MS_);
    if (!locked) {
      Logger.log('handleEndOfCall: lock acquisition timed out for call ' + callId);
      return { ok: false, status: 'lock_timeout' };
    }

    // Fail closed before touching the Sheet, Drive, recording download, or
    // Pushover - a missing/blank TEST resource property must never fall
    // back to any hardcoded (and possibly live) resource.
    if (!isTestResourceConfigComplete_()) {
      Logger.log('handleEndOfCall: TEST resource configuration incomplete for call ' + callId);
      return { ok: false, status: 'configuration_error' };
    }

    var sheet = openCallLogSheet_();

    if (isCallIdAlreadyLogged_(sheet, callId)) {
      Logger.log('handleEndOfCall: duplicate delivery for call ' + callId);
      return { ok: true, status: 'duplicate' };
    }

    var classification = determineIntakeType(endedReason, summary, transcript);
    var intakeType = classification.category;
    var needsHuman = classification.needsHuman;

    var driveRecordingUrl = '';
    var recordingSaveFailed = false;
    if (rawRecordingUrl) {
      try {
        var recordingResult = saveRecordingToDrive(callId, caller, timestamp, assistant);
        driveRecordingUrl = recordingResult.url;
        createdDriveFileIds.push(recordingResult.fileId);
      } catch (err) {
        recordingSaveFailed = true;
        Logger.log('Recording save failed for call ' + callId + ': ' + err.toString());
      }
    }

    var driveTranscriptUrl = '';
    if (transcript) {
      try {
        var transcriptResult = saveTranscriptToDrive(transcript, callId, caller, timestamp, assistant);
        driveTranscriptUrl = transcriptResult.url;
        createdDriveFileIds.push(transcriptResult.fileId);
      } catch (err) {
        Logger.log('Transcript save failed: ' + err.toString());
      }
    }

    var customerName = extractCustomerName(transcript);
    var combinedText = transcript + ' ' + summary;

    try {
      appendCallLogRow_(sheet, {
        timestamp: timestamp,
        callId: callId,
        caller: caller,
        assistant: assistant,
        duration: duration,
        cost: cost,
        status: endedReason,
        intakeType: intakeType,
        summary: summary,
        recordingUrl: driveRecordingUrl,
        transcriptUrl: driveTranscriptUrl,
        customerName: customerName
      });
    } catch (sheetErr) {
      // The transaction failed before a durable record exists - remove any
      // Drive files already created so a retry doesn't leave orphans.
      Logger.log('Sheet append failed for call ' + callId + ': ' + sheetErr.toString());
      cleanupDriveFiles_(createdDriveFileIds);
      return { ok: false, status: 'processing_error' };
    }

    // Pushover only runs after the Sheet row durably exists. Its failure
    // must never undo or fail the transaction - the call is already safely
    // logged at this point, and the webhook must not appear retryable.
    try {
      firePushover({
        callId: callId,
        caller: caller,
        customerName: customerName,
        assistant: assistant,
        duration: Math.round(duration / 60 * 10) / 10,
        cost: cost,
        category: intakeType,
        needsHuman: needsHuman,
        endedReason: endedReason,
        summary: summary,
        applianceOrPart: extractApplianceMention_(combinedText),
        intent: buildIntentLabel_(intakeType),
        budgetOrPrice: extractBudgetOrPrice_(combinedText),
        brandModel: extractBrandModel_(combinedText),
        driveRecordingUrl: driveRecordingUrl,
        recordingSaveFailed: recordingSaveFailed,
        driveTranscriptUrl: driveTranscriptUrl
      });
    } catch (pushoverErr) {
      Logger.log('Pushover notification failed for call ' + callId + ': ' + pushoverErr.toString());
    }

    return { ok: true, status: 'accepted' };
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }
}

function openCallLogSheet_() {
  var spreadsheetId = getTrimmedProperty_('VAPI_TEST_SPREADSHEET_ID');
  var tabName = getTrimmedProperty_('VAPI_TEST_CALLS_TAB');
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.appendRow(VAPI_CALL_LOG_HEADERS_);
    sheet.getRange('A1:L1').setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function isCallIdAlreadyLogged_(sheet, callId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return false;
  }
  var values = sheet.getRange(2, VAPI_CALL_LOG_CALL_ID_COLUMN_, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if ((values[i][0] || '').toString() === callId) {
      return true;
    }
  }
  return false;
}

function appendCallLogRow_(sheet, data) {
  sheet.appendRow([
    data.timestamp, data.callId, data.caller, data.assistant,
    data.duration, data.cost, data.status, data.intakeType,
    data.summary, data.recordingUrl, data.transcriptUrl, data.customerName
  ]);
}
