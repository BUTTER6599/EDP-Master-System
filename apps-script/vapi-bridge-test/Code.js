// EDP Vapi Bridge - Logs Vapi calls to Sheet + Pushover + Drive
// Created: May 18, 2026
// Updated: May 23, 2026 - added question-learning handler (log_unanswered_question)
// Updated: July 23, 2026 - authenticated Vapi recording download + categorized
//   Pushover alerts (fix/vapi-recording-pushover-categories, LOCAL TEST ONLY,
//   not yet pushed to the remote project)
// Updated: July 24, 2026 - private webhook path + assistant allowlist, so this
//   TEST endpoint can be safely pointed at by LO_TEST before Vapi is
//   connected. Apps Script does not reliably expose arbitrary incoming
//   Authorization headers, so the path segment after /exec/ plus an
//   assistant-ID allowlist stand in for header-based auth (LOCAL TEST ONLY,
//   not yet pushed to the remote project).
// Updated: July 26, 2026 - fixed four final pre-push QA blockers: recording
//   responses are now validated (Content-Type + byte signature) before
//   saving to Drive; Pushover fields are bounded to the API's documented
//   limits; end-of-call processing is now idempotent on Call ID under
//   LockService, with orphan Drive-file cleanup on partial failure; and the
//   SPAM classifier no longer flags legitimate warranty/sales questions
//   (LOCAL TEST ONLY, not yet pushed to the remote project).
// Updated: July 27, 2026 - isolated TEST data resources: the Spreadsheet ID,
//   Drive folder ID, and call-log tab name are no longer hardcoded in source
//   (the old hardcoded Spreadsheet ID was the live EDP_MASTER_DATABASE).
//   They now come from Script Properties only, gated by a fail-closed
//   configuration check - see isTestResourceConfigComplete_() below (LOCAL
//   TEST ONLY, not yet pushed to the remote project).
// Updated: July 27, 2026 - isolated the question-learning tabs too: the
//   hardcoded TECH_QUESTIONS / RECEPTIONIST_QUESTIONS tab names are gone,
//   replaced by VAPI_TEST_TECH_QUESTIONS_TAB / VAPI_TEST_RECEPTIONIST_QUESTIONS_TAB
//   Script Properties, validated (along with VAPI_TEST_SPREADSHEET_ID) before
//   any Sheet or Pushover action in handleUnansweredQuestion (LOCAL TEST
//   ONLY, not yet pushed to the remote project).
// Updated: July 27, 2026 - made every no-write path in
//   handleUnansweredQuestion return a truthful generic failure message
//   instead of the misleading "Logged with a note." A Pushover failure that
//   happens after a successful append no longer masks that success (LOCAL
//   TEST ONLY, not yet pushed to the remote project).

// Message types this bridge intentionally processes. Anything else is
// acknowledged safely with no business action - see doPost().
var SUPPORTED_EVENT_TYPES_ = ['end-of-call-report', 'tool-calls', 'function-call', 'tool_calls'];

// ============================================================
// TEST DATA RESOURCE CONFIGURATION (Spreadsheet / Drive folder / tab)
// ============================================================
// These three values live only in Script Properties, never in source, so
// this TEST bridge can never accidentally target the live production
// spreadsheet or an unverified Drive folder. isTestResourceConfigComplete_()
// is a fail-closed presence/blank check only - it never logs or returns the
// property values themselves. Functions that actually need a value
// (openCallLogSheet_, saveRecordingToDrive, saveTranscriptToDrive,
// handleUnansweredQuestion) read it directly via getTrimmedProperty_().
var TEST_RESOURCE_PROPERTY_NAMES_ = ['VAPI_TEST_SPREADSHEET_ID', 'VAPI_TEST_DRIVE_FOLDER_ID', 'VAPI_TEST_CALLS_TAB'];

function getTrimmedProperty_(name) {
  var raw = PropertiesService.getScriptProperties().getProperty(name);
  return (raw || '').toString().trim();
}

function isTestResourceConfigComplete_() {
  for (var i = 0; i < TEST_RESOURCE_PROPERTY_NAMES_.length; i++) {
    if (!getTrimmedProperty_(TEST_RESOURCE_PROPERTY_NAMES_[i])) {
      return false;
    }
  }
  return true;
}

function doPost(e) {
  try {
    // Path check first, before any parsing or processing of the request
    // body - an unrecognized path never even reaches JSON.parse.
    var pathCheck = validateWebhookPath_(e);
    if (!pathCheck.ok) {
      Logger.log('doPost rejected: path check failed');
      return jsonOutput_({ ok: false, error: 'unauthorized' });
    }

    var payload = JSON.parse(e.postData.contents);
    var msg = payload.message || {};
    var type = msg.type || '';

    // Assistant allowlist check happens before any Sheet, Drive, Pushover,
    // or recording-download action - including the tool-call path below,
    // which also writes to a Sheet and can fire Pushover.
    var assistantId = extractAssistantId_(msg);
    var assistantCheck = validateAssistantId_(assistantId);
    if (!assistantCheck.ok) {
      Logger.log('doPost rejected: assistant check failed');
      return jsonOutput_({ ok: false, error: 'unauthorized' });
    }

    if (SUPPORTED_EVENT_TYPES_.indexOf(type) === -1) {
      Logger.log('doPost: unsupported event type');
      return jsonOutput_({ ok: true, status: 'unsupported_event' });
    }

    // Handle Vapi tool calls (e.g., log_unanswered_question)
    if (type === 'tool-calls' || type === 'function-call' || type === 'tool_calls') {
      var toolResult = handleToolCall(msg, payload);
      return jsonOutput_(toolResult);
    }

    // Handle end-of-call report (existing behavior)
    if (type === 'end-of-call-report') {
      var eocResult = handleEndOfCall(msg);
      return jsonOutput_(eocResult);
    }

    return jsonOutput_({ ok: true });
  } catch (err) {
    Logger.log('Error: ' + err.toString());
    return jsonOutput_({ ok: false, error: err.toString() });
  }
}

function doGet(e) {
  return ContentService.createTextOutput('EDP Vapi Bridge is running.');
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// TEST WEBHOOK PROTECTION (private path + assistant allowlist)
// ============================================================
// Never hardcode, print, return, or log either Script Property value below.
// A future endpoint has the form:
//   https://script.google.com/macros/s/DEPLOYMENT_ID/exec/PRIVATE_PATH

function validateWebhookPath_(e) {
  var expectedPath = PropertiesService.getScriptProperties().getProperty('VAPI_TEST_WEBHOOK_PATH_SECRET');
  var actualPath = (e && e.pathInfo) ? e.pathInfo : '';

  if (!expectedPath) {
    return { ok: false, reason: 'missing_property' };
  }
  if (!actualPath) {
    return { ok: false, reason: 'missing_path' };
  }
  if (actualPath !== expectedPath) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}

// Mirrors the same defensive call/msg structure this bridge already uses
// to extract the assistant NAME (see handleEndOfCall), applied to the
// assistant ID instead, plus the flat assistantId fields Vapi sometimes
// sends directly on call/message.
function extractAssistantId_(msg) {
  msg = msg || {};
  var call = msg.call || {};
  return (call.assistant && call.assistant.id) || (msg.assistant && msg.assistant.id) || call.assistantId || msg.assistantId || '';
}

function validateAssistantId_(assistantId) {
  var expected = PropertiesService.getScriptProperties().getProperty('VAPI_TEST_ASSISTANT_ID');
  if (!expected) {
    return { ok: false, reason: 'missing_property' };
  }
  if (!assistantId) {
    return { ok: false, reason: 'missing_assistant_id' };
  }
  if (assistantId !== expected) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}

// ============================================================
// TOOL CALL ROUTER (Vapi function/tool calls)
// ============================================================
function handleToolCall(msg, payload) {
  var toolCalls = msg.toolCalls || msg.toolCallList || (msg.functionCall ? [msg.functionCall] : []);
  var results = [];

  for (var i = 0; i < toolCalls.length; i++) {
    var tc = toolCalls[i];
    var fn = tc.function || tc;
    var name = fn.name || tc.name || '';
    var args = fn.arguments || tc.arguments || {};
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch (e) { args = {}; }
    }
    var toolCallId = tc.id || tc.toolCallId || '';

    var resultText = '';
    if (name === 'log_unanswered_question') {
      resultText = handleUnansweredQuestion(args, msg);
    } else {
      resultText = 'Unknown tool: ' + name;
    }

    results.push({ toolCallId: toolCallId, result: resultText });
  }

  return { results: results };
}

// ============================================================
// QUESTION LEARNING
// ============================================================
// This route must never claim a question was logged/saved/recorded/
// submitted unless sheet.appendRow() below actually completed successfully.
// QUESTION_LOG_FAILURE_MESSAGE_ is generic on purpose - it must never expose
// which property was missing, any spreadsheet ID or tab name, or exception
// details.
var QUESTION_LOG_FAILURE_MESSAGE_ = 'I couldn\'t log that question right now.';

function handleUnansweredQuestion(args, msg) {
  try {
    var category = (args.category || 'receptionist').toString().toLowerCase();
    var question = (args.question || '').toString();
    var customerName = (args.customer_name || 'Unknown').toString();
    var customerPhone = (args.customer_phone || '').toString();
    var callId = (args.call_id || (msg && msg.call && msg.call.id) || '').toString();
    var timestamp = new Date();

    if (!question) {
      return 'No question provided.';
    }

    // No hardcoded tab literal here or elsewhere - the tech vs. receptionist
    // question tab is always read from its own TEST Script Property, never a
    // default/active sheet or a fallback literal.
    var tabProperty = (category === 'tech') ? 'VAPI_TEST_TECH_QUESTIONS_TAB' : 'VAPI_TEST_RECEPTIONIST_QUESTIONS_TAB';
    var spreadsheetId = getTrimmedProperty_('VAPI_TEST_SPREADSHEET_ID');
    var tabName = getTrimmedProperty_(tabProperty);
    if (!spreadsheetId || !tabName) {
      Logger.log('handleUnansweredQuestion: TEST question-tab configuration incomplete');
      return QUESTION_LOG_FAILURE_MESSAGE_;
    }
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.appendRow([
        'Timestamp', 'Question', 'Normalized Question', 'Category',
        'Customer Name', 'Customer Phone', 'Call ID', 'Times Asked', 'Status', 'Answer'
      ]);
      sheet.getRange('A1:J1').setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    var normalized = normalizeQuestion(question);
    var count = countMatchingQuestions(sheet, normalized) + 1;

    sheet.appendRow([
      timestamp, question, normalized, category,
      customerName, customerPhone, callId, count, 'NEW', ''
    ]);

    // The row is now durably persisted. A later Pushover failure must never
    // retry this append, create a duplicate row, or cause this route to
    // falsely report that logging failed - only the notification failed.
    if (count >= 2) {
      try {
        fireQuestionAlertPushover(question, count, category);
      } catch (alertErr) {
        Logger.log('handleUnansweredQuestion: question alert failed after a successful log: ' + alertErr.toString());
      }
    }

    return 'Logged. I\'ll get an answer and follow up.';
  } catch (err) {
    Logger.log('handleUnansweredQuestion error: ' + err.toString());
    return QUESTION_LOG_FAILURE_MESSAGE_;
  }
}

function normalizeQuestion(q) {
  return q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function countMatchingQuestions(sheet, normalized) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var values = sheet.getRange(2, 3, lastRow - 1, 1).getValues(); // column C = Normalized Question
  var count = 0;
  for (var i = 0; i < values.length; i++) {
    if ((values[i][0] || '').toString() === normalized) count++;
  }
  return count;
}

function fireQuestionAlertPushover(question, count, category) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('PUSHOVER_APP_TOKEN');
  var user = props.getProperty('PUSHOVER_USER_KEY');
  if (!token || !user) {
    Logger.log('Pushover credentials missing for question alert');
    return;
  }
  var title = 'New Question to Answer (asked ' + count + 'x)';
  var message = 'Category: ' + category + '\n' +
                'Question: ' + question + '\n\n' +
                'Add an answer to the knowledge base so Lo/Brian can handle this next time.';
  UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', {
    method: 'post',
    payload: { token: token, user: user, title: title, message: message },
    muteHttpExceptions: true
  });
}

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

// ============================================================
// PUSHOVER PRESENTATION (title / sound / priority by category)
// ============================================================
// Titles use Unicode escape sequences only - Code.js stays ASCII source.
var PUSHOVER_TITLES_ = {
  APPLIANCE_SALES: '\uD83D\uDCB5\uD83D\uDD0C APPLIANCE SALES LEAD',
  PARTS: '\uD83E\uDDE9 PARTS REQUEST',
  SELL_TRADE_IN: '\u267B\uFE0F\uD83D\uDCB5 APPLIANCE SELLER',
  WARRANTY: '\uD83D\uDEE1\uFE0F WARRANTY CALL',
  REPAIR_SERVICE: '\uD83D\uDEE0\uFE0F SERVICE / REPAIR',
  HUMAN_REQUEST: '\uD83D\uDC64 HUMAN REQUEST',
  SPAM: '\uD83D\uDEAB SPAM BLOCKED',
  SYSTEM_ERROR: '\u26A0\uFE0F VAPI SYSTEM ERROR',
  GENERAL: '\u260E\uFE0F GENERAL CALL'
};

// Built-in Pushover sound names only - no custom spoken sounds yet.
var PUSHOVER_SOUNDS_ = {
  APPLIANCE_SALES: 'cashregister',
  PARTS: 'magic',
  SELL_TRADE_IN: 'bike',
  WARRANTY: 'bugle',
  REPAIR_SERVICE: 'mechanical',
  HUMAN_REQUEST: 'falling',
  SPAM: 'none',
  SYSTEM_ERROR: 'siren',
  GENERAL: 'pushover'
};

// Built-in Pushover sound used when a human follow-up is requested.
// "persistent" repeats until acknowledged, which is the built-in sound
// closest to an "attention-level" alert without introducing a custom sound.
var PUSHOVER_ATTENTION_SOUND_ = 'persistent';

function getPushoverPresentation_(category, needsHuman) {
  var title = PUSHOVER_TITLES_[category] || PUSHOVER_TITLES_.GENERAL;
  var sound = PUSHOVER_SOUNDS_[category] || PUSHOVER_SOUNDS_.GENERAL;
  var priority = 0;

  if (category === 'SPAM') {
    priority = -1;
  }
  if (category === 'SYSTEM_ERROR') {
    priority = 1;
  }

  // The human-follow-up sound override never applies to SYSTEM_ERROR (per
  // spec) or SPAM (judgment call: a robocall that happens to say
  // "representative" should stay suppressed, not escalate to an attention
  // sound - see patch report for this deliberate deviation).
  if (needsHuman && category !== 'SYSTEM_ERROR' && category !== 'SPAM') {
    sound = PUSHOVER_ATTENTION_SOUND_;
  }

  return { title: title, sound: sound, priority: priority };
}

// ============================================================
// PUSHOVER MESSAGE CONTENT
// ============================================================
function buildIntentLabel_(category) {
  if (category === 'APPLIANCE_SALES') return 'buy';
  if (category === 'SELL_TRADE_IN') return 'sell/trade';
  if (category === 'WARRANTY') return 'warranty';
  if (category === 'REPAIR_SERVICE' || category === 'PARTS') return 'repair';
  return 'general';
}

function buildPushoverMessage_(data) {
  if (data.category === 'SPAM') {
    return buildSpamMessage_(data);
  }
  if (data.category === 'SYSTEM_ERROR') {
    return buildSystemErrorMessage_(data);
  }
  return buildCustomerCallMessage_(data);
}

function buildSpamMessage_(data) {
  return 'Caller: ' + (data.caller || 'Unknown') + '\n' +
         'Reason: automated/solicitation pattern detected\n' +
         'No action needed.';
}

function buildSystemErrorMessage_(data) {
  return 'Call ID: ' + (data.callId || 'unknown') + '\n' +
         'Ended reason: ' + (data.endedReason || 'unknown') + '\n' +
         'This was a technical/provider error, not a customer sales lead.';
}

// Critical structured fields (category, caller, appliance/intent, budget,
// human-follow-up flag) are built first and are never truncated except as
// an absolute last resort. Only the summary is shortened to make room -
// see assembleBoundedMessage_.
function buildCustomerCallMessage_(data) {
  var criticalLines = [];

  if (data.needsHuman) {
    criticalLines.push('HUMAN FOLLOW-UP REQUESTED');
    criticalLines.push('');
  }

  criticalLines.push('Customer: ' + (data.customerName || 'Unknown'));
  criticalLines.push('Caller: ' + (data.caller || 'Unknown'));
  criticalLines.push('Category: ' + data.category);
  criticalLines.push('Human follow-up requested: ' + (data.needsHuman ? 'YES' : 'NO'));

  if (data.applianceOrPart) {
    criticalLines.push('Appliance/part: ' + data.applianceOrPart);
  }
  criticalLines.push('Intent: ' + data.intent);

  if (data.budgetOrPrice) {
    criticalLines.push('Budget/asking price: ' + data.budgetOrPrice);
  }
  if (data.brandModel) {
    criticalLines.push('Brand/model: ' + data.brandModel);
  }

  criticalLines.push('Agent: ' + data.assistant);
  criticalLines.push('Duration: ' + data.duration + ' min');
  criticalLines.push('Cost: $' + data.cost);

  if (data.recordingSaveFailed) {
    criticalLines.push('Recording: save failed (see logs for call ID + HTTP status)');
  }

  var criticalText = criticalLines.join('\n');
  var transcriptLine = data.driveTranscriptUrl ? ('\n\nTranscript: ' + data.driveTranscriptUrl) : '';
  var summaryHeader = '\n\n=== SUMMARY ===\n';
  var summaryText = data.summary || 'No summary';

  return assembleBoundedMessage_(criticalText, summaryHeader, summaryText, transcriptLine);
}

// Fits critical details + summary + transcript link inside
// PUSHOVER_MESSAGE_LIMIT_, shortening only the summary. The transcript link
// is included whole or not at all - never truncated into a broken URL.
function assembleBoundedMessage_(criticalText, summaryHeader, summaryText, transcriptLine) {
  var reserved = criticalText.length + summaryHeader.length + transcriptLine.length;
  var budgetForSummary = PUSHOVER_MESSAGE_LIMIT_ - reserved;

  if (budgetForSummary >= summaryText.length) {
    return criticalText + summaryHeader + summaryText + transcriptLine;
  }

  if (budgetForSummary > TRUNCATION_SUFFIX_.length) {
    var trimmedSummary = truncateSafely_(summaryText, budgetForSummary - TRUNCATION_SUFFIX_.length);
    return criticalText + summaryHeader + trimmedSummary + TRUNCATION_SUFFIX_ + transcriptLine;
  }

  if (reserved <= PUSHOVER_MESSAGE_LIMIT_) {
    // No room for even a shortened summary plus the suffix - drop the
    // summary section but keep the critical details and transcript link.
    return criticalText + transcriptLine;
  }

  // Extremely rare: even the critical block + transcript link alone
  // doesn't fit. Truncate the whole assembled text as a last resort so
  // Pushover never receives an oversized message.
  return truncateSafely_(criticalText + transcriptLine, PUSHOVER_MESSAGE_LIMIT_);
}

// Official Pushover field limits (message/title/URL/URL title).
var PUSHOVER_MESSAGE_LIMIT_ = 1024;
var PUSHOVER_TITLE_LIMIT_ = 250;
var PUSHOVER_URL_LIMIT_ = 512;
var PUSHOVER_URL_TITLE_LIMIT_ = 100;
var TRUNCATION_SUFFIX_ = '\n[Message shortened]';

// Truncates text to at most maxLength UTF-16 code units without splitting a
// surrogate pair (so multi-code-unit emoji/characters near the boundary
// are dropped whole, never half-written). Source stays ASCII-only; the
// text this operates on at runtime may contain any Unicode.
function truncateSafely_(text, maxLength) {
  text = (text || '').toString();
  if (text.length <= maxLength) {
    return text;
  }
  var cut = text.substring(0, maxLength);
  var lastCode = cut.charCodeAt(cut.length - 1);
  if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
    cut = cut.substring(0, cut.length - 1);
  }
  return cut;
}

function firePushover(data) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('PUSHOVER_APP_TOKEN');
  var user = props.getProperty('PUSHOVER_USER_KEY');
  if (!token || !user) {
    Logger.log('Pushover credentials missing in Script Properties');
    return;
  }

  var presentation = getPushoverPresentation_(data.category, data.needsHuman);
  // Defense in depth: buildPushoverMessage_ already keeps the message at or
  // under the limit, but every message is capped again here unconditionally.
  var message = truncateSafely_(buildPushoverMessage_(data), PUSHOVER_MESSAGE_LIMIT_);
  var title = truncateSafely_(presentation.title, PUSHOVER_TITLE_LIMIT_);

  var payload = {
    token: token,
    user: user,
    title: title,
    message: message,
    sound: presentation.sound,
    priority: presentation.priority
  };

  // Only the durable Drive recording link is ever used here - never the
  // obsolete raw Vapi recordingUrl/stereoRecordingUrl. An oversized URL is
  // omitted entirely (with its title) rather than sent broken/truncated.
  if (data.driveRecordingUrl && data.driveRecordingUrl.length <= PUSHOVER_URL_LIMIT_) {
    payload.url = data.driveRecordingUrl;
    payload.url_title = truncateSafely_('Listen to recording', PUSHOVER_URL_TITLE_LIMIT_);
  }

  var response = UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  });
  Logger.log('Pushover HTTP code: ' + response.getResponseCode());
  Logger.log('Pushover response: ' + response.getContentText());
}

// ============================================================
// CALL CLASSIFICATION
// ============================================================
var SYSTEM_ERROR_PATTERN_ = /call\.in-progress\.error-|providerfault|vapifault|voice-failed/;

// Deliberately does NOT include bare "warranty", "extended warranty", or
// "offer" - those are common, legitimate parts of an appliance warranty or
// sales conversation and must never be enough by themselves to suppress a
// real lead as quiet SPAM. Every entry here is specific to robocall/
// solicitation phrasing (vehicle-warranty scams, "final notice", "press
// one", Google-listing/SEO pitches, merchant-services/loan solicitation).
var SPAM_PATTERN_ = /google listing|google business profile|\bseo\b|search engine optimization|verify your business|yellow pages|merchant cash|solar (panel|quote|program)|business funding|business loan|working capital loan|robocall|vehicle warranty|extended (car|auto|vehicle) warranty|auto.?warranty|car warranty|press one|final notice|this is not a solicitation|lower your interest rate|credit card processing rates|merchant services (rates|processing)|payment processing rates/;

var WARRANTY_PATTERN_ = /warrant(y|ies)|guarantee|(just |recently )?(bought|purchased).{0,30}(stopped working|broke|died|quit working)|exchange.{0,15}(under warranty|replacement)|covered (repair|under)/;

var PARTS_PATTERN_ = /\bparts?\b|control board|\btimer\b|\bknob\b|\bbelt\b|\belement\b|igniter|thermostat|\bswitch\b|\bmotor\b|model number/;

// "sell my"/"buy my" allow a short gap (e.g. "sell my old dryer") rather
// than requiring the appliance word immediately next to them.
var SELL_TRADE_IN_PATTERN_ = /sell my.{0,15}(appliance|washer|dryer|refrigerator|fridge|stove|range|freezer)|trade.?in|buy my.{0,15}(washer|dryer|refrigerator|fridge|stove|range|freezer)|pick.?up my old (appliance|washer|dryer|refrigerator|fridge|stove|range|freezer)|asking price|photos? (of|for) (my|the) (appliance|washer|dryer|refrigerator|fridge|stove|range|freezer)/;

var REPAIR_SERVICE_PATTERN_ = /\brepair\b|\bservice\b|\bfix\b|diagnostic|technician|broken (appliance|washer|dryer|refrigerator|fridge|stove|range|freezer)|drop.?off.{0,15}repair|repair status/;

// Covers both word orders: "want to buy a washer" and "washer... I want to
// buy one" (appliance word mentioned first, buy-intent referenced later
// with a pronoun instead of repeating the appliance word).
var APPLIANCE_SALES_PATTERN_ = /\b(buy|buying|purchase|shopping|looking for|need a|want a)\b.{0,30}(washer|dryer|refrigerator|fridge|freezer|stove|range|appliance)|\b(washers?|dryers?|refrigerators?|fridges?|freezers?|stoves?|ranges?)\b.{0,40}\b(buy|buying|purchase)\b|\b(washer|dryer|refrigerator|fridge|freezer|stove|range)\b.{0,20}(availability|in stock|price|cost|how much|offer|deal)|\bbest offer\b.{0,20}(washer|dryer|refrigerator|fridge|freezer|stove|range)|appliance set|delivery (inquiry|question|available)|\b(budget|color|brand)\b.{0,20}(washer|dryer|refrigerator|fridge|freezer|stove|range)|come (in|by) (and )?(look|see|visit)/;

var HUMAN_REQUEST_PATTERN_ = /\btaylor\b|\bmanager\b|representative|real person|\bhuman\b|\bemployee\b|\bagent\b|someone at the store/;

// Returns { category: <one of the 9 primary categories>, needsHuman: bool }.
// needsHuman is computed independently of the primary category so a
// warranty/repair/sales call does not lose its business category merely
// because the caller also asked for a person.
//
// Precedence (matches the approved design):
//   1. SYSTEM_ERROR  2. SPAM  3. WARRANTY  4. PARTS  5. SELL_TRADE_IN
//   6. REPAIR_SERVICE  7. APPLIANCE_SALES  8. HUMAN_REQUEST  9. GENERAL
function determineIntakeType(status, summary, transcript) {
  var statusText = (status || '').toString().toLowerCase();
  var text = ((summary || '') + ' ' + (transcript || '')).toLowerCase();

  var needsHuman = HUMAN_REQUEST_PATTERN_.test(text);

  if (SYSTEM_ERROR_PATTERN_.test(statusText)) {
    return { category: 'SYSTEM_ERROR', needsHuman: needsHuman };
  }
  if (SPAM_PATTERN_.test(text)) {
    return { category: 'SPAM', needsHuman: needsHuman };
  }
  if (WARRANTY_PATTERN_.test(text)) {
    return { category: 'WARRANTY', needsHuman: needsHuman };
  }
  if (PARTS_PATTERN_.test(text)) {
    return { category: 'PARTS', needsHuman: needsHuman };
  }
  if (SELL_TRADE_IN_PATTERN_.test(text)) {
    return { category: 'SELL_TRADE_IN', needsHuman: needsHuman };
  }
  if (REPAIR_SERVICE_PATTERN_.test(text)) {
    return { category: 'REPAIR_SERVICE', needsHuman: needsHuman };
  }
  if (APPLIANCE_SALES_PATTERN_.test(text)) {
    return { category: 'APPLIANCE_SALES', needsHuman: needsHuman };
  }
  if (needsHuman) {
    return { category: 'HUMAN_REQUEST', needsHuman: true };
  }
  return { category: 'GENERAL', needsHuman: needsHuman };
}

function extractCustomerName(transcript) {
  if (!transcript) return '';
  var patterns = [
    /[Mm]y name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /[Tt]his is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /[Ii]'m\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /[Ii] am\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /[Cc]alling for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /[Nn]ame['']?s\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/
  ];
  var falsePositives = [
    'Trying','Looking','Calling','Wondering','Hoping','Just',
    'Going','Not','Sorry','Really','Interested','In','On',
    'A','An','The','My','Your','Here','Out','Up','Down',
    'Curious','Wanting','Needing','Thinking','Asking',
    'Brian','Lo','Sofia','Elena','Latoya'
  ];
  for (var i = 0; i < patterns.length; i++) {
    var match = transcript.match(patterns[i]);
    if (match) {
      var firstWord = match[1].split(' ')[0];
      if (falsePositives.indexOf(firstWord) === -1 && firstWord.length >= 2) {
        return match[1];
      }
    }
  }
  return '';
}

function extractApplianceMention_(text) {
  var match = (text || '').toLowerCase().match(/\b(washer|dryer|refrigerator|fridge|freezer|stove|range|dishwasher|microwave)\b/);
  if (!match) return '';
  return match[1].charAt(0).toUpperCase() + match[1].slice(1);
}

function extractBudgetOrPrice_(text) {
  var match = (text || '').match(/\$\s?\d{1,5}(?:\.\d{2})?|\b\d{2,5}\s?dollars\b/i);
  return match ? match[0].trim() : '';
}

var APPLIANCE_BRANDS_ = ['whirlpool', 'ge', 'samsung', 'lg', 'maytag', 'frigidaire', 'kitchenaid', 'kenmore', 'bosch', 'amana', 'electrolux', 'haier'];

function extractBrandModel_(text) {
  var lower = (text || '').toLowerCase();
  for (var i = 0; i < APPLIANCE_BRANDS_.length; i++) {
    var brand = APPLIANCE_BRANDS_[i];
    var pattern = new RegExp('\\b' + brand + '\\b');
    if (pattern.test(lower)) {
      return brand.charAt(0).toUpperCase() + brand.slice(1);
    }
  }
  return '';
}

// ============================================================
// AUTHENTICATED VAPI RECORDING DOWNLOAD
// ============================================================
var VAPI_REDIRECT_CODES_ = [301, 302, 303, 307, 308];
var VAPI_MAX_REDIRECTS_ = 3;

// Fetches the mono call recording directly from Vapi's authenticated API
// rather than trusting the (short-lived, sometimes unauthenticated) URL
// Vapi includes in the webhook payload. Returns a validated Blob on
// success; throws on any failure, including a validation failure. Never
// logs, returns, or exposes the API key, and never sends the Authorization
// header to the redirected storage host.
function fetchVapiMonoRecordingBlob_(callId) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('VAPI_API_KEY');
  if (!apiKey) {
    throw new Error('Missing VAPI_API_KEY in Script Properties');
  }

  var url = 'https://api.vapi.ai/call/' + encodeURIComponent(callId) + '/mono-recording';
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + apiKey },
    followRedirects: false,
    muteHttpExceptions: true
  });

  var redirectCount = 0;
  while (VAPI_REDIRECT_CODES_.indexOf(response.getResponseCode()) !== -1) {
    redirectCount++;
    if (redirectCount > VAPI_MAX_REDIRECTS_) {
      throw new Error('Too many redirects fetching Vapi recording for call ' + callId);
    }
    var headers = response.getHeaders();
    var location = headers['Location'] || headers['location'];
    if (!location) {
      throw new Error('Redirect with no Location header for call ' + callId);
    }
    // Signed storage URL - the Vapi Authorization header must never be
    // sent here.
    response = UrlFetchApp.fetch(location, {
      method: 'get',
      followRedirects: false,
      muteHttpExceptions: true
    });
  }

  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('Vapi recording fetch failed for call ' + callId + ' with HTTP ' + code);
  }

  var blob = response.getBlob();
  var validation = validateRecordingBlob_(blob, response.getHeaders());
  if (!validation.ok) {
    // reason is always a short fixed category string - never response
    // body content - so this is safe to include in the thrown message.
    throw new Error('Vapi recording response failed validation for call ' + callId + ': ' + validation.reason);
  }

  return blob;
}

// ------------------------------------------------------------
// Recording response validation - never save a blob merely because the
// server returned HTTP 200. Content-Type is checked first as a fast,
// coarse reject; the byte signature check is the authoritative allow-list
// gate. Neither check ever logs or returns response body content.
// ------------------------------------------------------------
var VAPI_REJECTED_CONTENT_TYPES_ = ['text/html', 'text/plain', 'application/json', 'application/xml', 'text/xml'];
var VAPI_MIN_RECORDING_BYTES_ = 512;

function validateRecordingBlob_(blob, headers) {
  var contentType = getContentTypeFromHeaders_(headers);
  if (contentType && isRejectedContentType_(contentType)) {
    return { ok: false, reason: 'content_type_rejected' };
  }

  var bytes = blob.getBytes();
  if (!bytes || bytes.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (bytes.length < VAPI_MIN_RECORDING_BYTES_) {
    return { ok: false, reason: 'too_small' };
  }

  if (!hasKnownAudioSignature_(bytes)) {
    return { ok: false, reason: 'no_audio_signature' };
  }

  return { ok: true };
}

function getContentTypeFromHeaders_(headers) {
  headers = headers || {};
  var key;
  for (key in headers) {
    if (headers.hasOwnProperty(key) && key.toLowerCase() === 'content-type') {
      return (headers[key] || '').toString().toLowerCase();
    }
  }
  return '';
}

function isRejectedContentType_(contentType) {
  for (var i = 0; i < VAPI_REJECTED_CONTENT_TYPES_.length; i++) {
    if (contentType.indexOf(VAPI_REJECTED_CONTENT_TYPES_[i]) === 0) {
      return true;
    }
  }
  return false;
}

// Allow-list only: WAV (RIFF....WAVE), MP3 (ID3 tag or a raw frame sync
// byte pair), OGG (OggS), and MP4/M4A (ftyp box at offset 4). Anything that
// doesn't match one of these signatures is rejected, which naturally
// covers HTML/JSON/XML/plain-text error bodies without needing separate
// text-sniffing logic.
function hasKnownAudioSignature_(bytes) {
  var sample = [];
  var sampleLen = Math.min(bytes.length, 16);
  for (var i = 0; i < sampleLen; i++) {
    sample.push(toUnsignedByte_(bytes[i]));
  }

  if (matchesAscii_(sample, 0, 'RIFF') && matchesAscii_(sample, 8, 'WAVE')) {
    return true;
  }
  if (matchesAscii_(sample, 0, 'ID3')) {
    return true;
  }
  if (sample[0] === 0xFF && (sample[1] & 0xE0) === 0xE0) {
    return true;
  }
  if (matchesAscii_(sample, 0, 'OggS')) {
    return true;
  }
  if (matchesAscii_(sample, 4, 'ftyp')) {
    return true;
  }
  return false;
}

function matchesAscii_(bytes, offset, str) {
  if (bytes.length < offset + str.length) {
    return false;
  }
  for (var i = 0; i < str.length; i++) {
    if (bytes[offset + i] !== str.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

// Apps Script's Blob.getBytes() returns signed bytes (-128..127) for the
// underlying Java byte[] - normalize to the usual 0..255 range before
// comparing against expected signature values like 0xFF.
function toUnsignedByte_(b) {
  return b < 0 ? b + 256 : b;
}

// ============================================================
// DRIVE STORAGE
// ============================================================
// Both functions return { url, fileId } rather than a bare URL so the
// end-of-call transaction can track newly created files and remove them if
// the transaction fails before the Sheet row is durably appended (see
// cleanupDriveFiles_ and handleEndOfCall).
function saveRecordingToDrive(callId, caller, timestamp, assistant) {
  var blob = fetchVapiMonoRecordingBlob_(callId);
  var dateStr = Utilities.formatDate(timestamp, 'America/Chicago', 'yyyy-MM-dd_HH-mm');
  var safeCaller = (caller || 'unknown').replace(/\+/g, '').replace(/\D/g, '') || 'unknown';
  var shortId = (callId || 'noid').substring(0, 8);
  var safeAgent = (assistant || 'agent').replace(/[^a-zA-Z0-9]/g, '');
  var filename = dateStr + '_' + safeAgent + '_' + safeCaller + '_' + shortId + '.mp3';
  blob.setName(filename);
  var file = DriveApp.getFolderById(getTrimmedProperty_('VAPI_TEST_DRIVE_FOLDER_ID')).createFile(blob);
  return { url: file.getUrl(), fileId: file.getId() };
}

function saveTranscriptToDrive(transcript, callId, caller, timestamp, assistant) {
  var dateStr = Utilities.formatDate(timestamp, 'America/Chicago', 'yyyy-MM-dd_HH-mm');
  var safeCaller = (caller || 'unknown').replace(/\+/g, '').replace(/\D/g, '') || 'unknown';
  var shortId = (callId || 'noid').substring(0, 8);
  var safeAgent = (assistant || 'agent').replace(/[^a-zA-Z0-9]/g, '');
  var filename = dateStr + '_' + safeAgent + '_' + safeCaller + '_' + shortId + '_transcript.txt';
  var file = DriveApp.getFolderById(getTrimmedProperty_('VAPI_TEST_DRIVE_FOLDER_ID')).createFile(filename, transcript, 'text/plain');
  return { url: file.getUrl(), fileId: file.getId() };
}

// Best-effort cleanup for a failed transaction - trashes (not permanently
// deletes) any Drive files created before the failure, so a later retry
// does not accumulate orphan files. A cleanup failure is logged and
// swallowed; it must never mask the original error.
function cleanupDriveFiles_(fileIds) {
  for (var i = 0; i < fileIds.length; i++) {
    try {
      DriveApp.getFileById(fileIds[i]).setTrashed(true);
    } catch (err) {
      Logger.log('Drive cleanup failed for a file from this transaction: ' + err.toString());
    }
  }
}

function testPushover() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('PUSHOVER_APP_TOKEN');
  var user = props.getProperty('PUSHOVER_USER_KEY');
  Logger.log('App Token starts with: ' + (token ? token.substring(0, 6) + '...' : 'MISSING'));
  Logger.log('User Key starts with: ' + (user ? user.substring(0, 6) + '...' : 'MISSING'));
  if (!token || !user) {
    Logger.log('ERROR: Credentials missing in Script Properties');
    return;
  }
  try {
    var response = UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', {
      method: 'post',
      payload: {
        token: token,
        user: user,
        title: 'TEST - EDP Bridge',
        message: 'If you see this, Pushover works. Time: ' + new Date().toLocaleString()
      },
      muteHttpExceptions: true
    });
    Logger.log('Pushover HTTP code: ' + response.getResponseCode());
    Logger.log('Pushover response: ' + response.getContentText());
  } catch (err) {
    Logger.log('EXCEPTION: ' + err.toString());
  }
}

// ============================================================
// LOCAL, NON-NETWORK MANUAL TESTS
// ============================================================
// Run from the Apps Script editor. Never sends a real Pushover message,
// never makes a real Vapi API request, never writes to Drive or
// VAPI_CALL_LOG - determineIntakeType() and the extract*_ helpers are pure
// text-processing functions with no external calls.
function testClassification() {
  var cases = [
    {
      label: 'appliance buyer',
      status: 'customer-ended-call',
      summary: 'Customer wants to buy a new washer, asked about price and delivery.',
      transcript: 'Hi, I am looking for a new washer, how much does the Whirlpool one cost and can you deliver it?',
      expectedCategory: 'APPLIANCE_SALES'
    },
    {
      label: 'parts customer',
      status: 'customer-ended-call',
      summary: 'Customer needs a control board for their dryer.',
      transcript: 'I need a part, specifically a control board for my dryer, do you have it in stock?',
      expectedCategory: 'PARTS'
    },
    {
      label: 'appliance seller',
      status: 'customer-ended-call',
      summary: 'Customer wants to sell their old refrigerator.',
      transcript: 'I want to sell my refrigerator, what is your asking price for a trade-in?',
      expectedCategory: 'SELL_TRADE_IN'
    },
    {
      label: 'warranty customer',
      status: 'customer-ended-call',
      summary: 'Customer bought a stove recently and it stopped working, wants warranty exchange.',
      transcript: 'I just purchased a stove and it stopped working, is this covered under warranty?',
      expectedCategory: 'WARRANTY'
    },
    {
      label: 'repair customer',
      status: 'customer-ended-call',
      summary: 'Customer needs their dryer repaired, it is not working.',
      transcript: 'My dryer is broken and not working, can I schedule a repair or diagnostic?',
      expectedCategory: 'REPAIR_SERVICE'
    },
    {
      label: 'human-only request',
      status: 'customer-ended-call',
      summary: 'Caller just wants to speak to Taylor.',
      transcript: 'Can I speak to Taylor or a manager please, I need a real person.',
      expectedCategory: 'HUMAN_REQUEST',
      expectedNeedsHuman: true
    },
    {
      label: 'warranty plus human request',
      status: 'customer-ended-call',
      summary: 'Customer has a warranty issue and wants to speak to a manager.',
      transcript: 'My fridge is under warranty and stopped working, I would like to speak to a manager about it.',
      expectedCategory: 'WARRANTY',
      expectedNeedsHuman: true
    },
    {
      label: 'spam robocall',
      status: 'customer-ended-call',
      summary: 'Automated call about Google Business listing verification.',
      transcript: 'This call is regarding your Google listing, please verify your business to improve your search ranking.',
      expectedCategory: 'SPAM',
      expectedNeedsHuman: false
    },
    {
      label: 'actual Vapi system error',
      status: 'call.in-progress.error-providerfault-openai-llm-failed',
      summary: '',
      transcript: '',
      expectedCategory: 'SYSTEM_ERROR'
    },
    {
      label: 'short legitimate customer call',
      status: 'customer-ended-call',
      summary: 'Quick call, customer asked about store hours.',
      transcript: 'What time do you close today?',
      expectedCategory: 'GENERAL',
      expectedNeedsHuman: false
    },
    {
      label: 'washer customer asking about extended warranty (Blocker 4 regression)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'Do you sell washers, and do you offer an extended warranty on them?',
      expectedCategory: 'WARRANTY'
    },
    {
      label: 'refrigerator customer asking whether a warranty is offered (Blocker 4 regression)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'If I buy a refrigerator from you, is there a warranty offered on it?',
      expectedCategory: 'WARRANTY'
    },
    {
      label: 'vehicle-warranty robocall (spam must still be caught)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'This call is about your vehicle warranty, your extended car warranty is about to expire.',
      expectedCategory: 'SPAM'
    },
    {
      label: 'final notice press one robocall (spam must still be caught)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'This is your final notice, press one to speak with a representative.',
      expectedCategory: 'SPAM'
    },
    {
      label: 'legitimate appliance customer using the word offer',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'What is your best offer on a used dryer today?',
      expectedCategory: 'APPLIANCE_SALES'
    },
    {
      label: 'legitimate customer asking for a manager (not spam)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'My dryer is broken, can I speak to a manager about getting it repaired?',
      expectedNotCategory: 'SPAM'
    },
    {
      label: 'legitimate caller asking about a sale (not spam)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'Is there a sale on refrigerators this week? I am looking to buy one.',
      expectedCategory: 'APPLIANCE_SALES'
    },
    {
      label: 'unrelated merchant-services solicitation (spam)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'We can offer your business better merchant services processing rates on your credit card transactions.',
      expectedCategory: 'SPAM'
    },
    {
      label: 'sell my old dryer (regression fix)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'I want to sell my old dryer.',
      expectedCategory: 'SELL_TRADE_IN'
    },
    {
      label: 'sales wording then buy intent (regression fix)',
      status: 'customer-ended-call',
      summary: '',
      transcript: 'Are you having any sales on washers right now? I want to buy one.',
      expectedCategory: 'APPLIANCE_SALES'
    }
  ];

  var results = [];
  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    var classification = determineIntakeType(c.status, c.summary, c.transcript);
    var pass = true;
    if (c.expectedCategory !== undefined) {
      pass = pass && (classification.category === c.expectedCategory);
    }
    if (c.expectedNotCategory !== undefined) {
      pass = pass && (classification.category !== c.expectedNotCategory);
    }
    if (c.expectedNeedsHuman !== undefined) {
      pass = pass && (classification.needsHuman === c.expectedNeedsHuman);
    }
    results.push({
      label: c.label,
      expectedCategory: c.expectedCategory,
      actualCategory: classification.category,
      needsHuman: classification.needsHuman,
      pass: pass
    });
  }

  Logger.log(JSON.stringify(results, null, 2));
  return results;
}
