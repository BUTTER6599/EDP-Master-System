// EDP Vapi Bridge - 03_Recording_Storage (split from Code.js b5a4038, move-only refactor)

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
