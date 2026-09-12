/**
 * CallRecord.gs — turns a Vapi end-of-call-report payload into one flat,
 * normalized record.
 *
 * Vapi has moved these fields around between versions (summary/transcript/
 * recordingUrl used to sit on `message`, they now sit under
 * `message.analysis` and `message.artifact`). Every getter below therefore
 * checks several paths and takes the first one that actually has a value,
 * so an upstream reshuffle degrades to a blank cell instead of an
 * exception.
 */

var MAX_CELL_CHARS = 45000; // Sheets hard-caps a cell at 50k.

/** Safely walks a dotted path; returns undefined instead of throwing. */
function pick_(obj, path) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

/** First non-empty value among the given dotted paths. */
function firstOf_(obj, paths) {
  for (var i = 0; i < paths.length; i++) {
    var v = pick_(obj, paths[i]);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}

function asText_(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try {
      value = JSON.stringify(value);
    } catch (err) {
      return '';
    }
  }
  value = String(value);
  return value.length > MAX_CELL_CHARS
    ? value.slice(0, MAX_CELL_CHARS) + '…[truncated]'
    : value;
}

/**
 * Builds the normalized record. Keys here are the canonical column names;
 * SheetLog.gs maps them onto whatever headers the tab actually has.
 */
function buildCallRecord(message) {
  var m = message || {};

  var startedAt = firstOf_(m, ['startedAt', 'call.startedAt', 'artifact.startedAt']);
  var endedAt = firstOf_(m, ['endedAt', 'call.endedAt', 'artifact.endedAt']);

  var duration = firstOf_(m, ['durationSeconds', 'call.durationSeconds']);
  if (duration === '' && startedAt && endedAt) {
    var deltaMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    if (!isNaN(deltaMs) && deltaMs >= 0) duration = Math.round(deltaMs / 1000);
  }

  return {
    logged_at: new Date(),
    call_id: asText_(firstOf_(m, ['call.id', 'callId', 'artifact.call.id'])),
    event_type: asText_(m.type || ''),
    assistant_id: asText_(firstOf_(m, ['assistant.id', 'call.assistantId', 'assistantId'])),
    assistant_name: asText_(firstOf_(m, ['assistant.name', 'call.assistant.name'])),
    customer_number: asText_(firstOf_(m, [
      'customer.number',
      'call.customer.number',
      'call.customerNumber'
    ])),
    phone_number: asText_(firstOf_(m, [
      'phoneNumber.number',
      'call.phoneNumber.number',
      'call.phoneNumberId'
    ])),
    started_at: asText_(startedAt),
    ended_at: asText_(endedAt),
    duration_seconds: duration === '' ? '' : Number(duration),
    ended_reason: asText_(firstOf_(m, ['endedReason', 'call.endedReason'])),
    cost: asText_(firstOf_(m, ['cost', 'call.cost'])),
    success_evaluation: asText_(firstOf_(m, [
      'analysis.successEvaluation',
      'successEvaluation'
    ])),
    summary: asText_(firstOf_(m, ['analysis.summary', 'summary', 'artifact.summary'])),
    transcript: asText_(firstOf_(m, [
      'artifact.transcript',
      'transcript',
      'call.transcript'
    ])),
    recording_url: asText_(firstOf_(m, [
      'artifact.recordingUrl',
      'recordingUrl',
      'artifact.stereoRecordingUrl',
      'stereoRecordingUrl'
    ])),
    structured_data: asText_(firstOf_(m, [
      'analysis.structuredData',
      'structuredData'
    ]))
  };
}
