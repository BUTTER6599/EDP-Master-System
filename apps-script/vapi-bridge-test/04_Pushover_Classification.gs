// EDP Vapi Bridge - 04_Pushover_Classification (split from Code.js b5a4038, move-only refactor)

// ============================================================
// PUSHOVER PRESENTATION (title / sound / priority by category)
// ============================================================
// Titles use Unicode escape sequences only - Code.js stays ASCII source.
var PUSHOVER_TITLES_ = {
  APPLIANCE_SALES: '\uD83D\uDCB5\uD83D\uDD0C APPLIANCE SALES LEAD',
  PARTS: '\uD83E\uDDE9 PARTS REQUEST',
  SELL_TRADE_IN: '\u267B\uFE0F\uD83D\uDCB5 APPLIANCE SELLER',
  WARRANTY: '\uD83D\uDEE1\uFE0F WARRANTY CALL',
  REPAIR_SERVICE: '\uD83D\uDEE0\uFE0F SERVICE / REPAIR',
  HUMAN_REQUEST: '\uD83D\uDC64 HUMAN REQUEST',
  SPAM: '\uD83D\uDEAB SPAM BLOCKED',
  SYSTEM_ERROR: '\u26A0\uFE0F VAPI SYSTEM ERROR',
  GENERAL: '\u260E\uFE0F GENERAL CALL'
};

// Built-in Pushover sound names only - no custom spoken sounds yet.
var PUSHOVER_SOUNDS_ = {
  APPLIANCE_SALES: 'cashregister',
  PARTS: 'magic',
  SELL_TRADE_IN: 'bike',
  WARRANTY: 'bugle',
  REPAIR_SERVICE: 'mechanical',
  HUMAN_REQUEST: 'falling',
  SPAM: 'none',
  SYSTEM_ERROR: 'siren',
  GENERAL: 'pushover'
};

// Built-in Pushover sound used when a human follow-up is requested.
// "persistent" repeats until acknowledged, which is the built-in sound
// closest to an "attention-level" alert without introducing a custom sound.
var PUSHOVER_ATTENTION_SOUND_ = 'persistent';

function getPushoverPresentation_(category, needsHuman) {
  var title = PUSHOVER_TITLES_[category] || PUSHOVER_TITLES_.GENERAL;
  var sound = PUSHOVER_SOUNDS_[category] || PUSHOVER_SOUNDS_.GENERAL;
  var priority = 0;

  if (category === 'SPAM') {
    priority = -1;
  }
  if (category === 'SYSTEM_ERROR') {
    priority = 1;
  }

  // The human-follow-up sound override never applies to SYSTEM_ERROR (per
  // spec) or SPAM (judgment call: a robocall that happens to say
  // "representative" should stay suppressed, not escalate to an attention
  // sound - see patch report for this deliberate deviation).
  if (needsHuman && category !== 'SYSTEM_ERROR' && category !== 'SPAM') {
    sound = PUSHOVER_ATTENTION_SOUND_;
  }

  return { title: title, sound: sound, priority: priority };
}

// ============================================================
// PUSHOVER MESSAGE CONTENT
// ============================================================
function buildIntentLabel_(category) {
  if (category === 'APPLIANCE_SALES') return 'buy';
  if (category === 'SELL_TRADE_IN') return 'sell/trade';
  if (category === 'WARRANTY') return 'warranty';
  if (category === 'REPAIR_SERVICE' || category === 'PARTS') return 'repair';
  return 'general';
}

function buildPushoverMessage_(data) {
  if (data.category === 'SPAM') {
    return buildSpamMessage_(data);
  }
  if (data.category === 'SYSTEM_ERROR') {
    return buildSystemErrorMessage_(data);
  }
  return buildCustomerCallMessage_(data);
}

function buildSpamMessage_(data) {
  return 'Caller: ' + (data.caller || 'Unknown') + '\n' +
         'Reason: automated/solicitation pattern detected\n' +
         'No action needed.';
}

function buildSystemErrorMessage_(data) {
  return 'Call ID: ' + (data.callId || 'unknown') + '\n' +
         'Ended reason: ' + (data.endedReason || 'unknown') + '\n' +
         'This was a technical/provider error, not a customer sales lead.';
}

// Critical structured fields (category, caller, appliance/intent, budget,
// human-follow-up flag) are built first and are never truncated except as
// an absolute last resort. Only the summary is shortened to make room -
// see assembleBoundedMessage_.
function buildCustomerCallMessage_(data) {
  var criticalLines = [];

  if (data.needsHuman) {
    criticalLines.push('HUMAN FOLLOW-UP REQUESTED');
    criticalLines.push('');
  }

  criticalLines.push('Customer: ' + (data.customerName || 'Unknown'));
  criticalLines.push('Caller: ' + (data.caller || 'Unknown'));
  criticalLines.push('Category: ' + data.category);
  criticalLines.push('Human follow-up requested: ' + (data.needsHuman ? 'YES' : 'NO'));

  if (data.applianceOrPart) {
    criticalLines.push('Appliance/part: ' + data.applianceOrPart);
  }
  criticalLines.push('Intent: ' + data.intent);

  if (data.budgetOrPrice) {
    criticalLines.push('Budget/asking price: ' + data.budgetOrPrice);
  }
  if (data.brandModel) {
    criticalLines.push('Brand/model: ' + data.brandModel);
  }

  criticalLines.push('Agent: ' + data.assistant);
  criticalLines.push('Duration: ' + data.duration + ' min');
  criticalLines.push('Cost: $' + data.cost);

  if (data.recordingSaveFailed) {
    criticalLines.push('Recording: save failed (see logs for call ID + HTTP status)');
  }

  var criticalText = criticalLines.join('\n');
  var transcriptLine = data.driveTranscriptUrl ? ('\n\nTranscript: ' + data.driveTranscriptUrl) : '';
  var summaryHeader = '\n\n=== SUMMARY ===\n';
  var summaryText = data.summary || 'No summary';

  return assembleBoundedMessage_(criticalText, summaryHeader, summaryText, transcriptLine);
}

// Fits critical details + summary + transcript link inside
// PUSHOVER_MESSAGE_LIMIT_, shortening only the summary. The transcript link
// is included whole or not at all - never truncated into a broken URL.
function assembleBoundedMessage_(criticalText, summaryHeader, summaryText, transcriptLine) {
  var reserved = criticalText.length + summaryHeader.length + transcriptLine.length;
  var budgetForSummary = PUSHOVER_MESSAGE_LIMIT_ - reserved;

  if (budgetForSummary >= summaryText.length) {
    return criticalText + summaryHeader + summaryText + transcriptLine;
  }

  if (budgetForSummary > TRUNCATION_SUFFIX_.length) {
    var trimmedSummary = truncateSafely_(summaryText, budgetForSummary - TRUNCATION_SUFFIX_.length);
    return criticalText + summaryHeader + trimmedSummary + TRUNCATION_SUFFIX_ + transcriptLine;
  }

  if (reserved <= PUSHOVER_MESSAGE_LIMIT_) {
    // No room for even a shortened summary plus the suffix - drop the
    // summary section but keep the critical details and transcript link.
    return criticalText + transcriptLine;
  }

  // Extremely rare: even the critical block + transcript link alone
  // doesn't fit. Truncate the whole assembled text as a last resort so
  // Pushover never receives an oversized message.
  return truncateSafely_(criticalText + transcriptLine, PUSHOVER_MESSAGE_LIMIT_);
}

// Official Pushover field limits (message/title/URL/URL title).
var PUSHOVER_MESSAGE_LIMIT_ = 1024;
var PUSHOVER_TITLE_LIMIT_ = 250;
var PUSHOVER_URL_LIMIT_ = 512;
var PUSHOVER_URL_TITLE_LIMIT_ = 100;
var TRUNCATION_SUFFIX_ = '\n[Message shortened]';

// Truncates text to at most maxLength UTF-16 code units without splitting a
// surrogate pair (so multi-code-unit emoji/characters near the boundary
// are dropped whole, never half-written). Source stays ASCII-only; the
// text this operates on at runtime may contain any Unicode.
function truncateSafely_(text, maxLength) {
  text = (text || '').toString();
  if (text.length <= maxLength) {
    return text;
  }
  var cut = text.substring(0, maxLength);
  var lastCode = cut.charCodeAt(cut.length - 1);
  if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
    cut = cut.substring(0, cut.length - 1);
  }
  return cut;
}

function firePushover(data) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('PUSHOVER_APP_TOKEN');
  var user = props.getProperty('PUSHOVER_USER_KEY');
  if (!token || !user) {
    Logger.log('Pushover credentials missing in Script Properties');
    return;
  }

  var presentation = getPushoverPresentation_(data.category, data.needsHuman);
  // Defense in depth: buildPushoverMessage_ already keeps the message at or
  // under the limit, but every message is capped again here unconditionally.
  var message = truncateSafely_(buildPushoverMessage_(data), PUSHOVER_MESSAGE_LIMIT_);
  var title = truncateSafely_(presentation.title, PUSHOVER_TITLE_LIMIT_);

  var payload = {
    token: token,
    user: user,
    title: title,
    message: message,
    sound: presentation.sound,
    priority: presentation.priority
  };

  // Only the durable Drive recording link is ever used here - never the
  // obsolete raw Vapi recordingUrl/stereoRecordingUrl. An oversized URL is
  // omitted entirely (with its title) rather than sent broken/truncated.
  if (data.driveRecordingUrl && data.driveRecordingUrl.length <= PUSHOVER_URL_LIMIT_) {
    payload.url = data.driveRecordingUrl;
    payload.url_title = truncateSafely_('Listen to recording', PUSHOVER_URL_TITLE_LIMIT_);
  }

  var response = UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  });
  Logger.log('Pushover HTTP code: ' + response.getResponseCode());
  Logger.log('Pushover response: ' + response.getContentText());
}

// ============================================================
// CALL CLASSIFICATION
// ============================================================
var SYSTEM_ERROR_PATTERN_ = /call\.in-progress\.error-|providerfault|vapifault|voice-failed/;

// Deliberately does NOT include bare "warranty", "extended warranty", or
// "offer" - those are common, legitimate parts of an appliance warranty or
// sales conversation and must never be enough by themselves to suppress a
// real lead as quiet SPAM. Every entry here is specific to robocall/
// solicitation phrasing (vehicle-warranty scams, "final notice", "press
// one", Google-listing/SEO pitches, merchant-services/loan solicitation).
var SPAM_PATTERN_ = /google listing|google business profile|\bseo\b|search engine optimization|verify your business|yellow pages|merchant cash|solar (panel|quote|program)|business funding|business loan|working capital loan|robocall|vehicle warranty|extended (car|auto|vehicle) warranty|auto.?warranty|car warranty|press one|final notice|this is not a solicitation|lower your interest rate|credit card processing rates|merchant services (rates|processing)|payment processing rates/;

var WARRANTY_PATTERN_ = /warrant(y|ies)|guarantee|(just |recently )?(bought|purchased).{0,30}(stopped working|broke|died|quit working)|exchange.{0,15}(under warranty|replacement)|covered (repair|under)/;

var PARTS_PATTERN_ = /\bparts?\b|control board|\btimer\b|\bknob\b|\bbelt\b|\belement\b|igniter|thermostat|\bswitch\b|\bmotor\b|model number/;

// "sell my"/"buy my" allow a short gap (e.g. "sell my old dryer") rather
// than requiring the appliance word immediately next to them.
var SELL_TRADE_IN_PATTERN_ = /sell my.{0,15}(appliance|washer|dryer|refrigerator|fridge|stove|range|freezer)|trade.?in|buy my.{0,15}(washer|dryer|refrigerator|fridge|stove|range|freezer)|pick.?up my old (appliance|washer|dryer|refrigerator|fridge|stove|range|freezer)|asking price|photos? (of|for) (my|the) (appliance|washer|dryer|refrigerator|fridge|stove|range|freezer)/;

var REPAIR_SERVICE_PATTERN_ = /\brepair\b|\bservice\b|\bfix\b|diagnostic|technician|broken (appliance|washer|dryer|refrigerator|fridge|stove|range|freezer)|drop.?off.{0,15}repair|repair status/;

// Covers both word orders: "want to buy a washer" and "washer... I want to
// buy one" (appliance word mentioned first, buy-intent referenced later
// with a pronoun instead of repeating the appliance word).
var APPLIANCE_SALES_PATTERN_ = /\b(buy|buying|purchase|shopping|looking for|need a|want a)\b.{0,30}(washer|dryer|refrigerator|fridge|freezer|stove|range|appliance)|\b(washers?|dryers?|refrigerators?|fridges?|freezers?|stoves?|ranges?)\b.{0,40}\b(buy|buying|purchase)\b|\b(washer|dryer|refrigerator|fridge|freezer|stove|range)\b.{0,20}(availability|in stock|price|cost|how much|offer|deal)|\bbest offer\b.{0,20}(washer|dryer|refrigerator|fridge|freezer|stove|range)|appliance set|delivery (inquiry|question|available)|\b(budget|color|brand)\b.{0,20}(washer|dryer|refrigerator|fridge|freezer|stove|range)|come (in|by) (and )?(look|see|visit)/;

var HUMAN_REQUEST_PATTERN_ = /\btaylor\b|\bmanager\b|representative|real person|\bhuman\b|\bemployee\b|\bagent\b|someone at the store/;

// Returns { category: <one of the 9 primary categories>, needsHuman: bool }.
// needsHuman is computed independently of the primary category so a
// warranty/repair/sales call does not lose its business category merely
// because the caller also asked for a person.
//
// Precedence (matches the approved design):
//   1. SYSTEM_ERROR  2. SPAM  3. WARRANTY  4. PARTS  5. SELL_TRADE_IN
//   6. REPAIR_SERVICE  7. APPLIANCE_SALES  8. HUMAN_REQUEST  9. GENERAL
function determineIntakeType(status, summary, transcript) {
  var statusText = (status || '').toString().toLowerCase();
  var text = ((summary || '') + ' ' + (transcript || '')).toLowerCase();

  var needsHuman = HUMAN_REQUEST_PATTERN_.test(text);

  if (SYSTEM_ERROR_PATTERN_.test(statusText)) {
    return { category: 'SYSTEM_ERROR', needsHuman: needsHuman };
  }
  if (SPAM_PATTERN_.test(text)) {
    return { category: 'SPAM', needsHuman: needsHuman };
  }
  if (WARRANTY_PATTERN_.test(text)) {
    return { category: 'WARRANTY', needsHuman: needsHuman };
  }
  if (PARTS_PATTERN_.test(text)) {
    return { category: 'PARTS', needsHuman: needsHuman };
  }
  if (SELL_TRADE_IN_PATTERN_.test(text)) {
    return { category: 'SELL_TRADE_IN', needsHuman: needsHuman };
  }
  if (REPAIR_SERVICE_PATTERN_.test(text)) {
    return { category: 'REPAIR_SERVICE', needsHuman: needsHuman };
  }
  if (APPLIANCE_SALES_PATTERN_.test(text)) {
    return { category: 'APPLIANCE_SALES', needsHuman: needsHuman };
  }
  if (needsHuman) {
    return { category: 'HUMAN_REQUEST', needsHuman: true };
  }
  return { category: 'GENERAL', needsHuman: needsHuman };
}

function extractCustomerName(transcript) {
  if (!transcript) return '';
  var patterns = [
    /[Mm]y name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /[Tt]his is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /[Ii]'m\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /[Ii] am\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /[Cc]alling for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /[Nn]ame['']?s\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/
  ];
  var falsePositives = [
    'Trying','Looking','Calling','Wondering','Hoping','Just',
    'Going','Not','Sorry','Really','Interested','In','On',
    'A','An','The','My','Your','Here','Out','Up','Down',
    'Curious','Wanting','Needing','Thinking','Asking',
    'Brian','Lo','Sofia','Elena','Latoya'
  ];
  for (var i = 0; i < patterns.length; i++) {
    var match = transcript.match(patterns[i]);
    if (match) {
      var firstWord = match[1].split(' ')[0];
      if (falsePositives.indexOf(firstWord) === -1 && firstWord.length >= 2) {
        return match[1];
      }
    }
  }
  return '';
}

function extractApplianceMention_(text) {
  var match = (text || '').toLowerCase().match(/\b(washer|dryer|refrigerator|fridge|freezer|stove|range|dishwasher|microwave)\b/);
  if (!match) return '';
  return match[1].charAt(0).toUpperCase() + match[1].slice(1);
}

function extractBudgetOrPrice_(text) {
  var match = (text || '').match(/\$\s?\d{1,5}(?:\.\d{2})?|\b\d{2,5}\s?dollars\b/i);
  return match ? match[0].trim() : '';
}

var APPLIANCE_BRANDS_ = ['whirlpool', 'ge', 'samsung', 'lg', 'maytag', 'frigidaire', 'kitchenaid', 'kenmore', 'bosch', 'amana', 'electrolux', 'haier'];

function extractBrandModel_(text) {
  var lower = (text || '').toLowerCase();
  for (var i = 0; i < APPLIANCE_BRANDS_.length; i++) {
    var brand = APPLIANCE_BRANDS_[i];
    var pattern = new RegExp('\\b' + brand + '\\b');
    if (pattern.test(lower)) {
      return brand.charAt(0).toUpperCase() + brand.slice(1);
    }
  }
  return '';
}
