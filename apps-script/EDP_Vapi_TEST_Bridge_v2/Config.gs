/**
 * Config.gs — Script Properties accessors for the TEST bridge.
 *
 * Nothing in this file may ever hold a literal secret, Sheet ID, or
 * assistant ID. Everything is read from Script Properties so that this
 * source stays safe to commit and can never point at LIVE by accident.
 */

var PROP_SHEET_ID = 'TEST_SHEET_ID';
var PROP_SHEET_TAB = 'TEST_SHEET_TAB';
var PROP_WEBHOOK_KEY = 'TEST_WEBHOOK_KEY';
var PROP_PUSHOVER_TOKEN = 'PUSHOVER_APP_TOKEN';
var PROP_PUSHOVER_USER = 'PUSHOVER_USER_KEY';
var PROP_ASSISTANT_ID = 'TEST_ASSISTANT_ID';

var DEFAULT_SHEET_TAB = 'TEST_CALLS';

/** Reads a single Script Property, or '' when unset. */
function cfg_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  return value ? String(value).trim() : '';
}

function cfgSheetId() {
  return cfg_(PROP_SHEET_ID);
}

function cfgSheetTab() {
  return cfg_(PROP_SHEET_TAB) || DEFAULT_SHEET_TAB;
}

function cfgWebhookKey() {
  return cfg_(PROP_WEBHOOK_KEY);
}

function cfgPushoverToken() {
  return cfg_(PROP_PUSHOVER_TOKEN);
}

function cfgPushoverUser() {
  return cfg_(PROP_PUSHOVER_USER);
}

/**
 * Optional assistant allowlist. When empty every assistant is accepted,
 * which is the sane default for a bench-test bridge. Set it to the
 * LO_TEST assistant id to lock the endpoint down to one assistant.
 */
function cfgAssistantId() {
  return cfg_(PROP_ASSISTANT_ID);
}

/**
 * The bridge refuses to run until the operator has supplied the values it
 * cannot safely guess. Returns an array of human-readable problems.
 */
function cfgMissing() {
  var missing = [];
  if (!cfgSheetId()) missing.push(PROP_SHEET_ID);
  if (!cfgWebhookKey()) missing.push(PROP_WEBHOOK_KEY);
  if (!cfgPushoverToken()) missing.push(PROP_PUSHOVER_TOKEN);
  if (!cfgPushoverUser()) missing.push(PROP_PUSHOVER_USER);
  return missing;
}
