/**
 * Code.gs — the only entry points for the TEST bridge.
 *
 * Flow: Vapi end-of-call-report -> shared-secret check -> assistant check
 * -> normalize -> one row in TEST_CALLS -> one Pushover notification.
 *
 * Response policy is deliberate, because Vapi retries any non-2xx:
 *   - rejected or ignored requests answer 200, so they are not retried;
 *   - a genuine failure to write the row throws, producing a 500 so that
 *     Vapi does retry. The duplicate check in SheetLog.gs is what makes
 *     that retry safe.
 */

var SUPPORTED_EVENT = 'end-of-call-report';
var LOCK_TIMEOUT_MS = 30000;

function jsonOut_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** Length-safe comparison so a wrong key cannot be probed by timing. */
function secretMatches_(supplied, expected) {
  if (!expected) return false;
  supplied = String(supplied || '');
  if (supplied.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) {
    diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Health check. Never reveals configuration values, only whether they exist. */
function doGet() {
  return jsonOut_({
    ok: true,
    service: 'EDP Vapi TEST Bridge v2',
    environment: 'TEST',
    configured: cfgMissing().length === 0
  });
}

function doPost(e) {
  // Fail closed: without a configured secret the endpoint accepts nothing.
  var missing = cfgMissing();
  if (missing.length) {
    console.error('Refusing request; unset Script Properties: ' + missing.join(', '));
    return jsonOut_({ ok: false, error: 'not_configured' });
  }

  if (!secretMatches_(e && e.parameter && e.parameter.key, cfgWebhookKey())) {
    console.warn('Rejected a request with a missing or invalid key.');
    return jsonOut_({ ok: false, error: 'unauthorized' });
  }

  var message;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    message = body.message || body;
  } catch (err) {
    console.warn('Rejected a request with an unparseable body.');
    return jsonOut_({ ok: false, error: 'bad_request' });
  }

  if (message.type !== SUPPORTED_EVENT) {
    return jsonOut_({ ok: true, ignored: true, type: String(message.type || '') });
  }

  var allowedAssistant = cfgAssistantId();
  var record = buildCallRecord(message);
  if (allowedAssistant && record.assistant_id !== allowedAssistant) {
    console.warn('Rejected an end-of-call-report from a non-allowlisted assistant.');
    return jsonOut_({ ok: false, error: 'assistant_not_allowed' });
  }

  // Serialize deliveries so two concurrent retries cannot both pass the
  // duplicate check and write two rows for one call.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error('Timed out waiting for the script lock; Vapi should retry.');
  }

  try {
    var wrote = logCallRow(record); // throws on a real failure -> 500 -> retry
    if (!wrote) {
      return jsonOut_({ ok: true, duplicate: true, call_id: record.call_id });
    }
    var notified = sendCallNotification(record);
    return jsonOut_({
      ok: true,
      logged: true,
      notified: notified,
      call_id: record.call_id
    });
  } finally {
    lock.releaseLock();
  }
}
