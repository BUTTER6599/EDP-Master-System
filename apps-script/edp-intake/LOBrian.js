// ============================================================
// LOBrian.gs - EDP Intake voice agent backend
// Version: v1.2.2 (dormant as of v1.2.4)
// Last Updated: 2026-05-17
//
// v1.2.4 NOTE: The frontend master flag AGENT_ENABLED in Intake.html
// is currently FALSE. Nothing in the UI calls api_askAgent or
// api_speakElevenLabs while the flag is false, so this whole file
// sits unused. Code intentionally preserved so a future build can
// re-enable the agent by flipping AGENT_ENABLED back to true with
// no backend changes required. Do not delete.
//
// Change: New file. Adds two voice agents (LO for shop/intake,
//   Brian for Make Ready) with Gemini-driven form fill, ElevenLabs
//   premium TTS endpoint, suggestion + approval workflows
//   (PENDING_TECHNIQUES + APPROVAL_LOG sheets, lazy-created),
//   duplicate detection with 2+ auto-flag, and Pushover alerting.
// ES5 only. ASCII only. LockService on writes.
// ============================================================

// ---- Voice + model constants ------------------------------------
var LO_VOICE_ID    = '21m00Tcm4TlvDq8ikWAM'; // Rachel - LO (intake/shop)
var BRIAN_VOICE_ID = 'EOVAuWqgSZN2Oel78Psj'; // Aidan  - Brian (Make Ready)
var LO_GEMINI_MODEL = 'gemini-2.5-flash';
var LO_GEMINI_MAX_TOKENS = 1024;

// ---- Script Property keys --------------------------------------
var LO_ELEVENLABS_KEY_PROPS = ['EL_KEY', 'ELEVENLABS_API_KEY'];
var LO_PUSHOVER_TOKEN_PROP  = 'PUSHOVER_APP_TOKEN';
var LO_PUSHOVER_USER_PROP   = 'PUSHOVER_USER_KEY';
var LO_GEMINI_KEY_PROP_LB   = 'GEMINI_KEY';

// ---- Sheet schemas ----------------------------------------------
var LO_TAB_PENDING  = 'PENDING_TECHNIQUES';
var LO_TAB_APPROVAL = 'APPROVAL_LOG';

var LO_PENDING_COLUMNS = [
  'pending_id', 'date_submitted', 'submitter', 'portal',
  'sop_or_diagnostic_id', 'suggestion_text', 'photos',
  'times_suggested', 'status',
  'your_decision', 'decision_date', 'decision_notes'
];

var LO_APPROVAL_COLUMNS = [
  'log_id', 'date', 'submitter', 'sku_or_sop_id',
  'request_type', 'request_text',
  'your_decision', 'time_to_decide', 'notes'
];

// ============================================================
// Setup -- idempotent. Creates both sheets if missing. Safe to
// call from the script editor before first use.
// ============================================================
function api_setupAgentSheets() {
  try {
    edpEnsureTypedSheet(LO_TAB_PENDING,  LO_PENDING_COLUMNS);
    edpEnsureTypedSheet(LO_TAB_APPROVAL, LO_APPROVAL_COLUMNS);
    return {ok: true, tabs: [LO_TAB_PENDING, LO_TAB_APPROVAL]};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ============================================================
// Gemini call. Returns an array of action objects parsed from the
// model output. Tokens capped to keep cost ~$0.001/turn.
// formContext: {form_type, fields: [{id, label, value, locked}]}
// userRole:    'OWNER' | 'TECH' | 'EMPLOYEE'
// voice:       'LO' | 'BRIAN'
// ============================================================
function api_askAgent(transcript, formContext, userRole, voice, pin) {
  try {
    if (!transcript) return {ok: false, error: 'No transcript'};
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};

    var apiKey = PropertiesService.getScriptProperties()
      .getProperty(LO_GEMINI_KEY_PROP_LB);
    if (!apiKey) return {ok: false, error: 'GEMINI_KEY not configured'};

    var roleStr = String(userRole || user.role || 'EMPLOYEE').toUpperCase();
    var finOpen = (roleStr === 'OWNER');
    var who     = (String(voice || 'LO').toUpperCase() === 'BRIAN') ? 'BRIAN' : 'LO';

    var systemPrompt = loBuildSystemPrompt(who, roleStr, finOpen, formContext);
    var userPrompt   = 'User just said: "' + String(transcript) + '"\n' +
      'Current form state (JSON):\n' +
      JSON.stringify(formContext || {}) + '\n' +
      'Respond with JSON array of actions only. No prose. No markdown fences.';

    var payload = {
      contents: [{parts: [{text: systemPrompt + '\n\n' + userPrompt}]}],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: LO_GEMINI_MAX_TOKENS
      }
    };
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      LO_GEMINI_MODEL + ':generateContent?key=' + apiKey;
    var startMs = Date.now();
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    var elapsedMs = Date.now() - startMs;
    var status    = res.getResponseCode();
    var body      = res.getContentText();

    var parsed = null, raw = '';
    try {
      parsed = JSON.parse(body);
    } catch (eOuter) {
      return {ok: false, error: 'Gemini parse failed', status: status,
              elapsedMs: elapsedMs};
    }
    if (parsed && parsed.candidates && parsed.candidates[0] &&
        parsed.candidates[0].content &&
        parsed.candidates[0].content.parts &&
        parsed.candidates[0].content.parts[0]) {
      raw = String(parsed.candidates[0].content.parts[0].text || '');
    }
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    if (!raw) return {ok: true, actions: [], elapsedMs: elapsedMs, status: status};

    var actions = [];
    try {
      var p = JSON.parse(raw);
      if (Object.prototype.toString.call(p) === '[object Array]') actions = p;
      else if (p && p.action) actions = [p];
    } catch (eInner) {
      return {ok: true, actions: [{action: 'speak',
        text: 'Sorry, I did not catch that.'}],
        rawText: raw.substring(0, 500), elapsedMs: elapsedMs};
    }

    // Filter out fill_field actions targeting gated fields when the
    // user is not an OWNER. Defense in depth -- the prompt also tells
    // Gemini not to do this, but we belt-and-suspender here.
    if (!finOpen) {
      var gated = {
        purchase_price: 1, sale_price: 1, vault: 1, cost: 1,
        profit: 1, tax: 1, buy_price: 1, f_price: 1
      };
      var filtered = [];
      for (var i = 0; i < actions.length; i++) {
        var act = actions[i];
        if (act && act.action === 'fill_field' && act.field &&
            gated.hasOwnProperty(String(act.field).toLowerCase())) {
          continue;
        }
        filtered.push(act);
      }
      actions = filtered;
    }

    return {ok: true, actions: actions, elapsedMs: elapsedMs, status: status};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function loBuildSystemPrompt(who, role, finOpen, formContext) {
  var p = '';
  if (who === 'BRIAN') {
    p += 'You are Brian, the lead tech for The Electronics Depot LLC, a ' +
      'used appliance shop in Metairie, LA. Steady, technical, no-nonsense. ' +
      'Talk like a 30-year shop mechanic. You NEVER mention financial data ' +
      '(cost, profit, vault, tax, prices) regardless of who is logged in.';
  } else {
    p += 'You are LO, the operations assistant for The Electronics Depot LLC, ' +
      'a used appliance shop in Metairie, LA. You help employees fill out ' +
      'intake forms by listening to what they say and filling the fields.';
  }
  p += ' User role is ' + role + '. Financial fields are ' +
    (finOpen ? 'VISIBLE' : 'HIDDEN') + '. ' +
    (finOpen ? '' : 'Do NOT fill or mention financial fields ' +
      '(cost, profit, vault, tax, buy_price, sale_price, purchase_price).') +
    '\n\n';
  p += 'Respond ONLY in JSON. Either a single action object or an array of ' +
    'action objects. No prose, no markdown fences. Valid actions:\n' +
    '  {"action":"fill_field","field":"<form_field_id>","value":"<value>"}\n' +
    '  {"action":"ask_question","text":"<question to speak>"}\n' +
    '  {"action":"speak","text":"<confirmation or info>"}\n' +
    '  {"action":"save_form"}\n' +
    '  {"action":"trigger_alert","alert_type":"NEEDS_APPROVAL|TECHNIQUE","details":"<text>"}\n' +
    '  {"action":"no_action"}\n' +
    'Use the EXACT field ids shown in the form_context. Be friendly, brief, ' +
    'use contractions, do not over-explain.';
  return p;
}

// ============================================================
// NEEDS APPROVAL submission. Writes to APPROVAL_LOG and fires
// Pushover with priority 1 (persistent until acknowledged).
// payload: {request_type, request_text, sku_or_sop_id?, pin}
// ============================================================
function api_submitApprovalRequest(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!payload) return {ok: false, error: 'No payload'};
    var user = edpVerifyPin(payload.pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    var text = String(payload.request_text || '').trim();
    if (!text) return {ok: false, error: 'Request text is required.'};
    var reqType = String(payload.request_type || 'OTHER').toUpperCase();
    var validTypes = {SKIP_STEP: 1, NEW_TECHNIQUE: 1, NEEDS_HELP: 1, OTHER: 1};
    if (!validTypes.hasOwnProperty(reqType)) reqType = 'OTHER';

    var sh = edpEnsureTypedSheet(LO_TAB_APPROVAL, LO_APPROVAL_COLUMNS);
    var now = edpNowIso();
    var logId = 'AL-' + Date.now();
    var row = {
      log_id:         logId,
      date:           now,
      submitter:      user.name,
      sku_or_sop_id:  String(payload.sku_or_sop_id || ''),
      request_type:   reqType,
      request_text:   text,
      your_decision: 'PENDING',
      time_to_decide: '',
      notes:          ''
    };
    edpAppendByHeader(sh, row);

    edpWriteAudit(user.name, user.role, String(payload.sku_or_sop_id || ''),
      'NEEDS_APPROVAL_SUBMITTED', '', '', logId,
      'type=' + reqType + ' ' + text.substring(0, 400));

    loSendPushover({
      title:    user.name + ' Needs Approval',
      message:  (payload.sku_or_sop_id ? '[' + payload.sku_or_sop_id + '] ' : '') +
                text + ' (type=' + reqType + ')',
      priority: 1
    });

    SpreadsheetApp.flush();
    return {ok: true, log_id: logId};
  } catch (e) {
    return {ok: false, error: e.message};
  } finally {
    try { lock.releaseLock(); } catch (eL) {}
  }
}

// ============================================================
// ADD MY TECHNIQUE submission. Writes to PENDING_TECHNIQUES.
// Runs duplicate detection: if a row with the same portal +
// sop_or_diagnostic_id and >70% text similarity exists, the
// existing row's times_suggested increments and the status flips
// to AUTO_FLAGGED at 2+; otherwise a fresh PT- row is appended.
// ============================================================
function api_submitTechnique(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!payload) return {ok: false, error: 'No payload'};
    var user = edpVerifyPin(payload.pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    var text = String(payload.suggestion_text || '').trim();
    if (!text) return {ok: false, error: 'Suggestion text is required.'};
    var portal = String(payload.portal || 'PURCHASE').toUpperCase();
    var sopId  = String(payload.sop_or_diagnostic_id || 'NEW');

    var sh = edpEnsureTypedSheet(LO_TAB_PENDING, LO_PENDING_COLUMNS);
    var dup = loFindDuplicateSuggestion(sh, portal, sopId, text);
    var now = edpNowIso();
    var resultId, autoFlagged = false, timesSuggested = 1, status = 'PENDING';

    if (dup) {
      timesSuggested = dup.times + 1;
      autoFlagged    = (timesSuggested >= 2);
      status         = autoFlagged ? 'AUTO_FLAGGED' : 'PENDING';
      sh.getRange(dup.rowIndex, dup.timesCol + 1).setValue(timesSuggested);
      sh.getRange(dup.rowIndex, dup.statusCol + 1).setValue(status);
      resultId = dup.id;
      edpWriteAudit(user.name, user.role, '', 'TECHNIQUE_AUTO_FLAGGED',
        '', String(dup.times), String(timesSuggested),
        'portal=' + portal + ' sop=' + sopId + ' ' + text.substring(0, 300));
      loSendPushover({
        title:    'Suggestion Auto-Flagged (' + timesSuggested + ' submissions)',
        message:  text.substring(0, 400) + ' (portal=' + portal +
                  ', sop=' + sopId + ') -- review PENDING_TECHNIQUES',
        priority: 1
      });
    } else {
      resultId = 'PT-' + Date.now();
      var row = {
        pending_id:           resultId,
        date_submitted:       now,
        submitter:            user.name,
        portal:               portal,
        sop_or_diagnostic_id: sopId,
        suggestion_text:      text,
        photos:               String(payload.photos || ''),
        times_suggested:      1,
        status:               'PENDING',
        your_decision:        '',
        decision_date:        '',
        decision_notes:       ''
      };
      edpAppendByHeader(sh, row);
      edpWriteAudit(user.name, user.role, '', 'TECHNIQUE_SUBMITTED',
        '', '', resultId,
        'portal=' + portal + ' sop=' + sopId + ' ' + text.substring(0, 400));
      loSendPushover({
        title:    'New Technique from ' + user.name,
        message:  text.substring(0, 400) +
                  (payload.photos ? ' Photo: ' + payload.photos : ''),
        priority: 0
      });
    }

    SpreadsheetApp.flush();
    return {
      ok:              true,
      pending_id:      resultId,
      times_suggested: timesSuggested,
      auto_flagged:    autoFlagged,
      status:          status
    };
  } catch (e) {
    return {ok: false, error: e.message};
  } finally {
    try { lock.releaseLock(); } catch (eL) {}
  }
}

// ---- duplicate detection ----------------------------------------
// Simple Jaccard token similarity. >0.55 for a clear match, scoped
// to the same portal + sop_or_diagnostic_id pair. Returns the
// matching row info or null.
function loFindDuplicateSuggestion(sh, portal, sopId, text) {
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return null;
  var headers = values[0];
  var portalCol = headers.indexOf('portal');
  var sopCol    = headers.indexOf('sop_or_diagnostic_id');
  var textCol   = headers.indexOf('suggestion_text');
  var idCol     = headers.indexOf('pending_id');
  var timesCol  = headers.indexOf('times_suggested');
  var statusCol = headers.indexOf('status');
  if (portalCol < 0 || sopCol < 0 || textCol < 0 || timesCol < 0) return null;

  var newTokens = loTokenize(text);
  if (!newTokens.length) return null;

  for (var i = 1; i < values.length; i++) {
    var rowPortal = String(values[i][portalCol] || '').toUpperCase();
    var rowSop    = String(values[i][sopCol]    || '');
    if (rowPortal !== portal || rowSop !== sopId) continue;
    var rowText = String(values[i][textCol] || '');
    var sim = loJaccard(newTokens, loTokenize(rowText));
    if (sim >= 0.55) {
      var rowTimes = parseInt(values[i][timesCol], 10);
      if (isNaN(rowTimes)) rowTimes = 1;
      return {
        rowIndex:  i + 1,
        id:        String(values[i][idCol] || ''),
        times:     rowTimes,
        timesCol:  timesCol,
        statusCol: statusCol,
        similarity: sim
      };
    }
  }
  return null;
}

function loTokenize(s) {
  var lower = String(s || '').toLowerCase();
  var clean = lower.replace(/[^a-z0-9 ]+/g, ' ');
  var parts = clean.split(/\s+/);
  var stop = {the:1, a:1, an:1, and:1, or:1, of:1, to:1, in:1, on:1,
              for:1, is:1, it:1, this:1, that:1, was:1, with:1, '':1};
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].length >= 3 && !stop.hasOwnProperty(parts[i])) {
      out.push(parts[i]);
    }
  }
  return out;
}
function loJaccard(a, b) {
  if (!a.length || !b.length) return 0;
  var sa = {}, sb = {};
  for (var i = 0; i < a.length; i++) sa[a[i]] = 1;
  for (var j = 0; j < b.length; j++) sb[b[j]] = 1;
  var inter = 0, union = 0;
  for (var k in sa) { if (sa.hasOwnProperty(k)) { union++; if (sb[k]) inter++; } }
  for (var k2 in sb) { if (sb.hasOwnProperty(k2) && !sa[k2]) union++; }
  return union ? inter / union : 0;
}

// ============================================================
// Premium TTS via ElevenLabs. Returns {ok, audio_base64, mime}.
// Caller plays via `new Audio('data:audio/mpeg;base64,...')`.
// Frontend should only call this for greetings/alerts/long-form
// speech (>~12 words). Routine confirmations use Web Speech API.
// ============================================================
function api_speakElevenLabs(text, voice_id, pin) {
  try {
    if (!text) return {ok: false, error: 'No text'};
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    var apiKey = loGetElevenLabsKey();
    if (!apiKey) return {ok: false, error: 'EL_KEY not configured'};
    var voiceId = String(voice_id || LO_VOICE_ID).trim() || LO_VOICE_ID;
    var url = 'https://api.elevenlabs.io/v1/text-to-speech/' + voiceId;
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      headers: {'xi-api-key': apiKey, 'accept': 'audio/mpeg'},
      payload: JSON.stringify({
        text: String(text),
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {stability: 0.5, similarity_boost: 0.75}
      }),
      muteHttpExceptions: true
    });
    var status = res.getResponseCode();
    if (status !== 200) {
      return {ok: false, error: 'ElevenLabs HTTP ' + status,
              body: res.getContentText().substring(0, 300)};
    }
    var bytes = res.getContent();
    var b64   = Utilities.base64Encode(bytes);
    return {ok: true, audio_base64: b64, mime: 'audio/mpeg'};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

function loGetElevenLabsKey() {
  var props = PropertiesService.getScriptProperties();
  for (var i = 0; i < LO_ELEVENLABS_KEY_PROPS.length; i++) {
    var k = props.getProperty(LO_ELEVENLABS_KEY_PROPS[i]);
    if (k) return k;
  }
  return '';
}

// ============================================================
// Pushover helper. Failure is swallowed (logged) so a Pushover
// outage never blocks a sheet write.
// ============================================================
function loSendPushover(opts) {
  try {
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty(LO_PUSHOVER_TOKEN_PROP);
    var user  = props.getProperty(LO_PUSHOVER_USER_PROP);
    if (!token || !user) return false;
    var priority = parseInt(opts.priority, 10);
    if (isNaN(priority)) priority = 0;
    if (priority < -2) priority = -2;
    if (priority >  2) priority =  2;
    var payload = {
      token:    token,
      user:     user,
      title:    String(opts.title   || 'EDP').substring(0, 250),
      message:  String(opts.message || '').substring(0, 1024),
      priority: priority
    };
    // Priority 2 needs retry/expire. Priority 1 (high) is enough here.
    UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', {
      method: 'post', payload: payload, muteHttpExceptions: true
    });
    return true;
  } catch (e) {
    try {
      edpWriteAudit('', 'SYSTEM', '', 'PUSHOVER_FAIL',
        '', '', '', String(e && e.message ? e.message : e));
    } catch (eA) {}
    return false;
  }
}
