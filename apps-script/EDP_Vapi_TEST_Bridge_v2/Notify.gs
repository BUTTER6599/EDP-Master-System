/**
 * Notify.gs — one Pushover notification per logged call.
 *
 * Deliberately never throws: a notification failure must not turn into a
 * non-2xx response, because Vapi would then retry the webhook and the call
 * would be considered unlogged when in fact the row is already written.
 */

var PUSHOVER_URL = 'https://api.pushover.net/1/messages.json';

/** Trims a field to keep the notification readable on a phone. */
function clip_(text, max) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function formatDuration_(seconds) {
  var total = Number(seconds);
  if (!isFinite(total) || total <= 0) return 'unknown';
  var mins = Math.floor(total / 60);
  var secs = Math.round(total % 60);
  return mins > 0 ? mins + 'm ' + secs + 's' : secs + 's';
}

/** Builds the notification body from the normalized record. */
function buildPushMessage_(record) {
  var lines = [];
  lines.push('From: ' + (clip_(record.customer_number, 40) || 'unknown'));
  lines.push('Duration: ' + formatDuration_(record.duration_seconds));
  if (record.ended_reason) lines.push('Ended: ' + clip_(record.ended_reason, 60));
  if (record.summary) lines.push('');
  if (record.summary) lines.push(clip_(record.summary, 600));
  return lines.join('\n');
}

/**
 * Sends exactly one Pushover message. Returns true on a 2xx, false on any
 * failure or when Pushover is not configured.
 */
function sendCallNotification(record) {
  var token = cfgPushoverToken();
  var user = cfgPushoverUser();
  if (!token || !user) {
    console.warn('Pushover not configured; skipping notification.');
    return false;
  }

  var payload = {
    token: token,
    user: user,
    title: '[TEST] Call ended',
    message: buildPushMessage_(record)
  };
  if (record.recording_url) {
    payload.url = record.recording_url;
    payload.url_title = 'Recording';
  }

  try {
    var response = UrlFetchApp.fetch(PUSHOVER_URL, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      console.error('Pushover rejected the notification: HTTP ' + code);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Pushover request failed: ' + err.message);
    return false;
  }
}
