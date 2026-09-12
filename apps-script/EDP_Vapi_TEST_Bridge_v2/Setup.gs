/**
 * Setup.gs — one-time operator helpers. Run these from the Apps Script
 * editor; nothing here is reachable from the web endpoint.
 *
 * Pushover credentials are never written by this file. Set those two by
 * hand under Project Settings > Script Properties so they exist only in
 * the project, never in Git.
 */

// TEST spreadsheet: "EDP AI Receptionist — TEST Data". Not a secret, and
// not LIVE. Kept here rather than in Code.gs so the runtime still reads it
// from Script Properties like every other setting.
var TEST_SHEET_ID = '1ronx5A0l_v4lJTw19e5VrcnL4FUXDvgUjsEbxWJYx_c';

/** Generates a 64-character URL-safe secret (256 bits of UUID entropy). */
function generateWebhookKey_() {
  return (
    Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '')
  );
}

/**
 * Seeds the TEST configuration. Safe to re-run: it never overwrites an
 * existing webhook key, so the URL already given to Vapi keeps working.
 */
function setupTestBridge() {
  var props = PropertiesService.getScriptProperties();

  props.setProperty(PROP_SHEET_ID, TEST_SHEET_ID);
  props.setProperty(PROP_SHEET_TAB, DEFAULT_SHEET_TAB);

  if (!cfgWebhookKey()) {
    props.setProperty(PROP_WEBHOOK_KEY, generateWebhookKey_());
    console.log('Generated a new TEST_WEBHOOK_KEY.');
  } else {
    console.log('Kept the existing TEST_WEBHOOK_KEY.');
  }

  var missing = cfgMissing();
  if (missing.length) {
    console.warn(
      'Still unset (add these under Script Properties): ' + missing.join(', ')
    );
  } else {
    console.log('Configuration complete.');
  }
  showWebhookUrl();
}

/**
 * Prints the exact URL to paste into the Vapi server-URL field, key
 * included. Run this after deploying.
 */
function showWebhookUrl() {
  var key = cfgWebhookKey();
  if (!key) {
    console.warn('No webhook key set yet; run setupTestBridge() first.');
    return '';
  }
  var url = ScriptApp.getService().getUrl();
  if (!url) {
    console.warn('No web app deployment yet; deploy first, then re-run this.');
    return '';
  }
  var full = url + '?key=' + encodeURIComponent(key);
  console.log('Vapi server URL:\n' + full);
  return full;
}

/** Reports which settings exist, without printing their values. */
function configStatus() {
  var status = {
    sheet_id: cfgSheetId() ? 'set' : 'MISSING',
    sheet_tab: cfgSheetTab(),
    webhook_key: cfgWebhookKey() ? 'set' : 'MISSING',
    pushover_token: cfgPushoverToken() ? 'set' : 'MISSING',
    pushover_user: cfgPushoverUser() ? 'set' : 'MISSING',
    assistant_allowlist: cfgAssistantId() ? 'set' : 'off (any assistant accepted)'
  };
  console.log(JSON.stringify(status, null, 2));
  return status;
}
