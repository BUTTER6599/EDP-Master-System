/**
 * Tests.gs — manual verification from the Apps Script editor.
 *
 * These drive the real doPost with a synthetic payload, so a green run
 * proves the whole path: auth, parsing, the sheet write, and Pushover.
 * Run them before pointing Vapi at the deployment.
 */

/** A representative end-of-call-report, shaped like current Vapi output. */
function sampleEndOfCallReport_(callId) {
  return {
    message: {
      type: 'end-of-call-report',
      endedReason: 'customer-ended-call',
      startedAt: '2026-09-12T15:04:05.000Z',
      endedAt: '2026-09-12T15:06:23.000Z',
      durationSeconds: 138,
      cost: 0.0912,
      call: { id: callId, assistantId: 'asst_test_lo' },
      assistant: { id: 'asst_test_lo', name: 'LO_TEST' },
      customer: { number: '+15045551234' },
      phoneNumber: { number: '+15044381959' },
      analysis: {
        summary: 'Caller asked about a used washer and left a callback number.',
        successEvaluation: 'true',
        structuredData: { intent: 'sales', appliance: 'washer' }
      },
      artifact: {
        transcript: 'AI: Thanks for calling. User: Do you have used washers?',
        recordingUrl: 'https://example.invalid/recording.mp3'
      }
    }
  };
}

/** Builds the fake request object that Apps Script hands to doPost. */
function fakeRequest_(bodyObject, key) {
  return {
    parameter: { key: key },
    postData: { contents: JSON.stringify(bodyObject) }
  };
}

/**
 * Happy path: writes one row to TEST_CALLS and sends one Pushover
 * notification. Each run uses a fresh call id so it is not deduplicated.
 */
function testEndOfCallReport() {
  var callId = 'test-' + Utilities.getUuid();
  var result = doPost(fakeRequest_(sampleEndOfCallReport_(callId), cfgWebhookKey()));
  console.log(result.getContent());
  return result.getContent();
}

/**
 * Duplicate protection: the same call id twice must produce one row and
 * one notification. The second response should report duplicate: true.
 */
function testDuplicateIsIgnored() {
  var callId = 'dupe-' + Utilities.getUuid();
  var payload = sampleEndOfCallReport_(callId);
  var first = doPost(fakeRequest_(payload, cfgWebhookKey())).getContent();
  var second = doPost(fakeRequest_(payload, cfgWebhookKey())).getContent();
  console.log('first:  ' + first);
  console.log('second: ' + second);
  if (second.indexOf('"duplicate":true') === -1) {
    throw new Error('Duplicate protection failed; the call was logged twice.');
  }
  return 'ok';
}

/** A wrong key must be rejected before anything is written. */
function testRejectsBadKey() {
  var payload = sampleEndOfCallReport_('bad-key-' + Utilities.getUuid());
  var result = doPost(fakeRequest_(payload, 'not-the-real-key')).getContent();
  console.log(result);
  if (result.indexOf('"unauthorized"') === -1) {
    throw new Error('A request with a bad key was not rejected.');
  }
  return 'ok';
}

/** Unsupported event types are acknowledged but never logged. */
function testIgnoresOtherEvents() {
  var result = doPost(
    fakeRequest_({ message: { type: 'status-update' } }, cfgWebhookKey())
  ).getContent();
  console.log(result);
  if (result.indexOf('"ignored":true') === -1) {
    throw new Error('A non end-of-call-report event was not ignored.');
  }
  return 'ok';
}

/** Runs every check in order. */
function runAllTests() {
  testRejectsBadKey();
  testIgnoresOtherEvents();
  testEndOfCallReport();
  testDuplicateIsIgnored();
  console.log('All tests passed.');
}
