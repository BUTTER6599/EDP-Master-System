// EDP AI Receptionist - TEST Webhook Bridge (Clean Rebuild)
// Purpose: Vapi end-of-call-report -> TEST_CALLS row -> Pushover
// ES5 only. Complete file - Code.gs

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('No body').setMimeType(ContentService.MimeType.TEXT);
    }

    var data = JSON.parse(e.postData.contents);
    var message = data.message || {};

    if (message.type !== 'end-of-call-report') {
      return ContentService.createTextOutput('Ignored: ' + message.type).setMimeType(ContentService.MimeType.TEXT);
    }

    var call = message.call || {};
    var callId = call.id || 'unknown';

    var assistantName = 'unknown';
    if (message.assistant && message.assistant.name) {
      assistantName = message.assistant.name;
    } else if (call.assistant && call.assistant.name) {
      assistantName = call.assistant.name;
    }

    var callerNumber = 'unknown';
    if (call.customer && call.customer.number) {
      callerNumber = call.customer.number;
    } else if (message.customer && message.customer.number) {
      callerNumber = message.customer.number;
    }

    var durationSeconds = '';
    if (typeof message.durationSeconds !== 'undefined') {
      durationSeconds = message.durationSeconds;
    } else if (call.startedAt && call.endedAt) {
      var startMs = new Date(call.startedAt).getTime();
      var endMs = new Date(call.endedAt).getTime();
      if (!isNaN(startMs) && !isNaN(endMs)) {
        durationSeconds = Math.round((endMs - startMs) / 1000);
      }
    }

    var timestamp = new Date();

    writeTestCallRow(timestamp, callId, assistantName, callerNumber, durationSeconds);
    sendPushoverNotification(assistantName, callerNumber, durationSeconds, callId);

    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);

  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return ContentService.createTextOutput('Error logged').setMimeType(ContentService.MimeType.TEXT);
  }
}

function writeTestCallRow(timestamp, callId, assistantName, callerNumber, durationSeconds) {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('TEST_SPREADSHEET_ID');
  var tabName = props.getProperty('TEST_CALLS_TAB_NAME') || 'TEST_CALLS';

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(tabName);

  if (!sheet) {
    throw new Error('Sheet tab not found: ' + tabName);
  }

  sheet.appendRow([timestamp, callId, assistantName, callerNumber, durationSeconds]);
}

function sendPushoverNotification(assistantName, callerNumber, durationSeconds, callId) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('PUSHOVER_TOKEN');
  var user = props.getProperty('PUSHOVER_USER');

  if (!token || !user) {
    Logger.log('Pushover credentials missing, skipping notification');
    return;
  }

  var message = 'Call ended: ' + assistantName +
    '\nCaller: ' + callerNumber +
    '\nDuration: ' + durationSeconds + 's' +
    '\nCall ID: ' + callId;

  var payload = {
    token: token,
    user: user,
    message: message,
    title: 'EDP TEST Call Logged'
  };

  var options = {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', options);
}

// Run this manually from the Apps Script editor FIRST, before touching Vapi.
// Confirms Sheet + Pushover work on their own.
function testHarness() {
  var timestamp = new Date();
  writeTestCallRow(timestamp, 'TEST-CALL-ID-123', 'LO_TEST', '+15551234567', 42);
  sendPushoverNotification('LO_TEST', '+15551234567', 42, 'TEST-CALL-ID-123');
  Logger.log('Test harness complete - check TEST_CALLS and Pushover');
}
