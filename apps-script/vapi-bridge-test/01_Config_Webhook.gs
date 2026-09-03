// EDP Vapi Bridge - 01_Config_Webhook (split from Code.js b5a4038, move-only refactor)

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
