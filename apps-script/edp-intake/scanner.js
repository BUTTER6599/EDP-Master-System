// ============================================================
// scanner.gs - EDP Intake
// Version: v1.2.3
// Last Updated: 2026-05-19
// Change: v1.2.3 extended api_logUiEvent whitelist with the new
//   PURCHASE landing layout actions (PURCHASE_LANDING_OPENED,
//   PURCHASE_NEW_TAPPED, PURCHASE_INVENTORY_OPENED,
//   PURCHASE_CATEGORY_OPENED, PURCHASE_FUEL_FILTER, INVENTORY_SEARCH).
//   Scan pipeline unchanged.
//   v1.2.2 extended whitelist with the LO/Brian voice agent actions.
//   v1.1.5.1 extended api_logUiEvent whitelist (MASTER_SHEET_OPENED,
//   DOCUMENTS_OPENED, SEARCH_BAR_OPENED) and added api_getMasterSheetTabs
//   for the MASTER SHEET sub-portal. Scan pipeline unchanged.
//   v1.1.5: added api_logUiEvent endpoint (whitelisted UI events:
//   FIELD_UNLOCKED, COMING_SOON_TAPPED, SCAN_CANCELLED).
//   v1.1.4: Fixed Gemini 2.5-flash MAX_TOKENS truncation (maxOutputTokens
//   300 -> 2048). Vision OCR fallback disabled (API blocked 403).
//   v1.1.3 diagnostic logging retained.
// ES5 only. ASCII only.
// ============================================================

// v1.1.3: diagnostic logger. Writes ONE audit row per stage with a JSON
// blob in the notes column. Failure is swallowed so logging never breaks
// the scan flow.
function edpAuditDiag(stage, payload) {
  try {
    var detailStr;
    try {
      detailStr = JSON.stringify(payload);
    } catch (eStr) {
      detailStr = 'STRINGIFY_FAILED: ' + String(eStr);
    }
    if (detailStr && detailStr.length > 5000) {
      detailStr = detailStr.substring(0, 5000) + '...[TRUNCATED]';
    }
    edpWriteAudit('', 'SYSTEM', '', 'SCANNER_DIAGNOSTIC',
      stage || '', '', '', detailStr);
  } catch (eDiag) {
    try { Logger.log('Diagnostic logging failed: ' + eDiag); } catch (eLog) {}
  }
}

var EDP_GEMINI_KEY_PROP = 'GEMINI_KEY';

function api_scanSticker(base64Image, pin) {
  try {
    if (!base64Image) return {ok: false, error: 'No image data'};
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};

    var result = edpProcessStickerOCR(base64Image);
    if (result && result.error) {
      try {
        edpWriteAudit(user.name, user.role, '', 'SCANNER_ERROR',
          '', '', '', result.error);
      } catch (eAud) {}
      return {ok: false, error: result.error};
    }

    var normBrand    = edpNormalizeBrand(result.brand);
    var normCategory = edpNormalizeCategory(result.type);
    var normFuel     = edpNormalizeFuel(result.fuelType);

    var isEmptyFinal = !(String(result.brand || '').length ||
                         String(result.model || '').length ||
                         String(result.serial || '').length);
    edpAuditDiag('STEP_5_NORMALIZED', {
      source:     result.source || '',
      preNorm: {
        brand:    result.brand    || '',
        type:     result.type     || '',
        fuelType: result.fuelType || ''
      },
      postNorm: {
        brand:    normBrand,
        model:    String(result.model  || '').trim(),
        serial:   String(result.serial || '').trim(),
        category: normCategory,
        fuelType: normFuel
      },
      isEmpty:    isEmptyFinal
    });

    var parts = [];
    if (normBrand)    parts.push('brand=' + normBrand);
    if (result.model) parts.push('model=' + result.model);
    if (result.serial) parts.push('serial=' + result.serial);
    parts.push('source=' + (result.source || 'unknown'));
    try {
      edpWriteAudit(user.name, user.role, '', 'STICKER_SCANNED',
        '', '', '', parts.join(' '));
    } catch (eAud2) {}

    return {
      ok:        true,
      brand:     normBrand,
      model:     String(result.model  || '').trim(),
      serial:    String(result.serial || '').trim(),
      category:  normCategory,
      fuel_type: normFuel,
      source:    result.source || ''
    };
  } catch (e) {
    Logger.log('Scanner error: ' + e.message +
      (e.stack ? '\n' + e.stack : ''));
    try {
      edpWriteAudit('', 'SYSTEM', '', 'SCANNER_ERROR',
        '', '', '', e.message);
    } catch (eAud3) {}
    return {ok: false, error: e.message};
  }
}

// Audit-only endpoint for the post-scan UI choices. Called from the
// scan results modal when the user taps YES, NO, or SCAN AGAIN.
function api_auditScanAction(action, scanDetail, pin) {
  try {
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    var valid = {STICKER_CONFIRMED: 1, STICKER_EDITED: 1, STICKER_RESCANNED: 1};
    if (!valid.hasOwnProperty(action)) {
      return {ok: false, error: 'Invalid action'};
    }
    var detail = '';
    if (scanDetail) {
      var parts = [];
      if (scanDetail.brand)    parts.push('brand=' + scanDetail.brand);
      if (scanDetail.model)    parts.push('model=' + scanDetail.model);
      if (scanDetail.serial)   parts.push('serial=' + scanDetail.serial);
      if (scanDetail.category) parts.push('category=' + scanDetail.category);
      if (scanDetail.source)   parts.push('source=' + scanDetail.source);
      detail = parts.join(' ');
    }
    edpWriteAudit(user.name, user.role, '', action, '', '', '', detail);
    return {ok: true};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// v1.1.5: client-facing audit endpoint for non-scan UI events.
// Whitelisted actions only. detailObj is flattened to a "k=v k=v" string.
function api_logUiEvent(action, detailObj, pin) {
  try {
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    var valid = {
      FIELD_UNLOCKED:           1,
      COMING_SOON_TAPPED:       1,
      SCAN_CANCELLED:           1,
      MASTER_SHEET_OPENED:      1,
      DOCUMENTS_OPENED:         1,
      SEARCH_BAR_OPENED:        1,
      INTAKE_OPENED:            1,
      SHOP_OPENED:              1,
      SHOP_CLOSED:              1,
      OWNER_DASHBOARD_OPENED:   1,
      OWNER_DASHBOARD_CLOSED:   1,
      PARTS_OPENED:             1,
      PARTS_CLOSED:             1,
      OWNER_TILE_TAPPED:        1,
      PARTS_TILE_TAPPED:        1,
      AGENT_GREETING:           1,
      AGENT_LISTENING_ON:       1,
      AGENT_LISTENING_OFF:      1,
      AGENT_HEARD:              1,
      AGENT_GEMINI_CALL:        1,
      AGENT_FILLED_FIELD:       1,
      AGENT_SPOKE:              1,
      AGENT_PERMISSION_BLOCKED: 1,
      NEEDS_APPROVAL_TAPPED:    1,
      NEEDS_APPROVAL_SUBMITTED: 1,
      TECHNIQUE_TAPPED:         1,
      TECHNIQUE_SUBMITTED:      1,
      TECHNIQUE_AUTO_FLAGGED:   1,
      APPROVAL_GRANTED:         1,
      APPROVAL_DENIED:          1,
      PURCHASE_LANDING_OPENED:  1,
      PURCHASE_NEW_TAPPED:      1,
      PURCHASE_INVENTORY_OPENED:1,
      PURCHASE_CATEGORY_OPENED: 1,
      PURCHASE_FUEL_FILTER:     1,
      INVENTORY_SEARCH:         1
    };
    if (!valid.hasOwnProperty(action)) {
      return {ok: false, error: 'Invalid action'};
    }
    var detail = '';
    if (detailObj && typeof detailObj === 'object') {
      var parts = [];
      for (var k in detailObj) {
        if (detailObj.hasOwnProperty(k) && detailObj[k] != null && detailObj[k] !== '') {
          parts.push(k + '=' + String(detailObj[k]));
        }
      }
      detail = parts.join(' ');
    } else if (detailObj != null) {
      detail = String(detailObj);
    }
    var ticketId = (detailObj && detailObj.ticket_id) ? String(detailObj.ticket_id) : '';
    var field    = (detailObj && detailObj.field)     ? String(detailObj.field)     : '';
    edpWriteAudit(user.name, user.role, ticketId, action, field, '', '', detail);
    return {ok: true};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// v1.1.5.1: enumerates the Master Sheet tabs for the new MASTER SHEET
// sub-portal. Returns {ok, sheetId, tabs:[{name, gid}]}. Tabs are
// returned in workbook order (left-to-right). Hidden tabs included.
function api_getMasterSheetTabs(pin) {
  try {
    var user = edpVerifyPin(pin);
    if (!user) return {ok: false, error: 'Invalid PIN'};
    var sheetId = PropertiesService.getScriptProperties()
      .getProperty('SHEET_ID');
    if (!sheetId) return {ok: false, error: 'SHEET_ID not configured.'};
    var book = SpreadsheetApp.openById(sheetId);
    var sheets = book.getSheets();
    var out = [];
    for (var i = 0; i < sheets.length; i++) {
      out.push({
        name: sheets[i].getName(),
        gid:  sheets[i].getSheetId()
      });
    }
    return {ok: true, sheetId: sheetId, tabs: out};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ---- PORTED FROM FLOOR PUSH (Code.gs) ----------------------
// Tries Gemini first, falls back to Vision OCR if Gemini fails or
// returns empty. Same logic, same Gemini prompt verbatim.
function edpProcessStickerOCR(base64Image) {
  try {
    var apiKey = PropertiesService.getScriptProperties()
      .getProperty(EDP_GEMINI_KEY_PROP);
    if (!apiKey) {
      return {brand: '', model: '', serial: '', type: '', fuelType: '',
        error: 'Gemini API key not configured. Please contact admin.'};
    }

    var prompt = 'Look at this appliance label or sticker. Extract the following information and return ONLY a JSON object with no extra text, no markdown, no code blocks:\n' +
      '{\n' +
      '  "brand": "the brand name printed on the label (e.g. Whirlpool, Admiral, GE, Maytag, Samsung) -- use the LABEL brand not the manufacturer at the bottom",\n' +
      '  "model": "the model number",\n' +
      '  "serial": "the serial number",\n' +
      '  "type": "one of: Washer, Dryer, Refrigerator, Stove, Freezer, Dishwasher, Microwave, Other",\n' +
      '  "fuelType": "one of: Electric, Gas, N/A"\n' +
      '}\n' +
      'If you cannot find a value use an empty string. Return only the JSON.';

    var payload = {
      contents: [{parts: [
        {text: prompt},
        {inline_data: {mime_type: 'image/jpeg', data: base64Image}}
      ]}],
      generationConfig: {temperature: 0, maxOutputTokens: 2048}
    };

    var geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
    var startMs = Date.now();
    var res = UrlFetchApp.fetch(
      geminiUrl,
      {method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload), muteHttpExceptions: true}
    );
    var elapsedMs = Date.now() - startMs;
    var respBody  = res.getContentText();
    var respCode  = res.getResponseCode();

    // Step 1: raw HTTP response.
    edpAuditDiag('STEP_1_GEMINI_RAW', {
      url:         geminiUrl.replace(apiKey, '[REDACTED]'),
      status:      respCode,
      elapsedMs:   elapsedMs,
      bodyLength:  respBody ? respBody.length : 0,
      bodyPreview: respBody ? respBody.substring(0, 2000) : '',
      truncated:   !!(respBody && respBody.length > 2000)
    });

    var json = null;
    var outerParseOk = false;
    var outerParseErr = '';
    try {
      json = JSON.parse(respBody);
      outerParseOk = true;
    } catch (pOuter) {
      outerParseErr = String(pOuter && pOuter.message ? pOuter.message : pOuter);
    }

    // Step 2: outer JSON parse.
    var topKeys = [];
    if (outerParseOk && json && typeof json === 'object') {
      for (var kk in json) { if (json.hasOwnProperty(kk)) topKeys.push(kk); }
    }
    edpAuditDiag('STEP_2_JSON_PARSE', {
      success:  outerParseOk,
      error:    outerParseErr,
      topKeys:  topKeys
    });

    // Step 3: candidate text extraction.
    var rawText = null;
    var missingAt = '';
    if (!outerParseOk || !json) {
      missingAt = 'outer_parse_failed';
    } else if (!json.candidates) {
      missingAt = 'candidates';
    } else if (!json.candidates[0]) {
      missingAt = 'candidates[0]';
    } else if (!json.candidates[0].content) {
      missingAt = 'candidates[0].content';
    } else if (!json.candidates[0].content.parts) {
      missingAt = 'candidates[0].content.parts';
    } else if (!json.candidates[0].content.parts[0]) {
      missingAt = 'candidates[0].content.parts[0]';
    } else if (typeof json.candidates[0].content.parts[0].text === 'undefined') {
      missingAt = 'candidates[0].content.parts[0].text';
    } else {
      rawText = json.candidates[0].content.parts[0].text || '';
    }
    edpAuditDiag('STEP_3_CANDIDATE_TEXT', {
      hasText:    rawText !== null,
      missingAt:  missingAt,
      textLength: rawText === null ? 0 : rawText.length,
      textValue:  rawText === null ? '' : String(rawText).substring(0, 2000)
    });

    if (rawText !== null) {
      var raw = rawText;
      raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      var innerParsed = null;
      var innerParseOk = false;
      var innerParseErr = '';
      try {
        innerParsed = JSON.parse(raw);
        innerParseOk = true;
      } catch (pe) {
        innerParseErr = String(pe && pe.message ? pe.message : pe);
      }

      // Step 4: inner JSON parse (Gemini's content).
      edpAuditDiag('STEP_4_INNER_PARSE', {
        success:    innerParseOk,
        error:      innerParseErr,
        rawCleaned: raw.substring(0, 2000),
        preNorm:    innerParseOk ? {
          brand:    innerParsed && innerParsed.brand    || '',
          model:    innerParsed && innerParsed.model    || '',
          serial:   innerParsed && innerParsed.serial   || '',
          type:     innerParsed && innerParsed.type     || '',
          fuelType: innerParsed && innerParsed.fuelType || ''
        } : null
      });

      if (innerParseOk && innerParsed &&
          (innerParsed.model || innerParsed.serial || innerParsed.brand)) {
        return {
          brand:    String(innerParsed.brand    || '').trim(),
          model:    String(innerParsed.model    || '').trim(),
          serial:   String(innerParsed.serial   || '').trim(),
          type:     String(innerParsed.type     || '').trim(),
          fuelType: String(innerParsed.fuelType || 'N/A').trim(),
          source:   'gemini'
        };
      }
    }

    // v1.1.4: Vision OCR fallback disabled. The Cloud Vision API key is
    // blocked (HTTP 403 PERMISSION_DENIED). Re-enable by activating Vision
    // API in Cloud Console for the project tied to GEMINI_KEY, then restore
    // the call below: return edpFallbackVisionOCR(base64Image, apiKey);
    edpAuditDiag('STEP_GEMINI_FAILED_NO_FALLBACK', {
      reason: rawText === null ? 'no_candidate_text' : 'gemini_empty_or_invalid',
      note:   'Vision OCR fallback disabled in v1.1.4 (API blocked).'
    });
    return {brand: '', model: '', serial: '', type: '', fuelType: '',
      error: "Couldn't read the sticker. Try retaking the photo in better lighting, or enter manually.",
      source: 'gemini_failed'};
  } catch (err) {
    edpAuditDiag('STEP_GEMINI_THROW', {
      message: String(err && err.message ? err.message : err),
      stack:   err && err.stack ? String(err.stack).substring(0, 2000) : ''
    });
    // v1.1.4: Vision OCR fallback disabled (see note above).
    // Previous behavior: return edpFallbackVisionOCR(base64Image, key2);
    return {brand: '', model: '', serial: '', type: '', fuelType: '',
      error: 'Scanner offline. Please enter brand/model/serial manually.',
      source: 'gemini_failed'};
  }
}

function edpFallbackVisionOCR(base64Image, apiKey) {
  if (!apiKey) {
    edpAuditDiag('STEP_6_VISION_NO_KEY', {});
    return {brand: '', model: '', serial: '', type: '', fuelType: '',
      error: "Couldn't read the sticker. Try retaking the photo in better lighting, or enter manually."};
  }
  try {
    var visionUrl = 'https://vision.googleapis.com/v1/images:annotate?key=' + apiKey;
    var vStartMs = Date.now();
    var res = UrlFetchApp.fetch(
      visionUrl,
      {method: 'post', contentType: 'application/json',
        muteHttpExceptions: true,
        payload: JSON.stringify({requests: [{
          image: {content: base64Image},
          features: [{type: 'TEXT_DETECTION'}]
        }]})}
    );
    var vElapsedMs = Date.now() - vStartMs;
    var vBody = res.getContentText();
    var vCode = res.getResponseCode();

    edpAuditDiag('STEP_6_VISION_RAW', {
      url:         visionUrl.replace(apiKey, '[REDACTED]'),
      status:      vCode,
      elapsedMs:   vElapsedMs,
      bodyLength:  vBody ? vBody.length : 0,
      bodyPreview: vBody ? vBody.substring(0, 2000) : '',
      truncated:   !!(vBody && vBody.length > 2000)
    });

    var json = JSON.parse(vBody);
    if (!json.responses || !json.responses[0] ||
        !json.responses[0].fullTextAnnotation) {
      edpAuditDiag('STEP_6_VISION_EMPTY', {
        hasResponses:    !!json.responses,
        hasResponse0:    !!(json.responses && json.responses[0]),
        hasAnnotation:   !!(json.responses && json.responses[0] && json.responses[0].fullTextAnnotation)
      });
      return {brand: '', model: '', serial: '', type: '', fuelType: '',
        error: "Couldn't read the sticker. Try retaking the photo in better lighting, or enter manually."};
    }
    var fullText = json.responses[0].fullTextAnnotation.text || '';
    var parsed = edpParseOCRText(fullText);
    edpAuditDiag('STEP_6_VISION_PARSED', {
      fullTextLength: fullText.length,
      fullTextPreview: fullText.substring(0, 2000),
      parsed: {
        brand:    parsed.brand    || '',
        model:    parsed.model    || '',
        serial:   parsed.serial   || '',
        type:     parsed.type     || '',
        fuelType: parsed.fuelType || ''
      }
    });
    return parsed;
  } catch (e) {
    edpAuditDiag('STEP_6_VISION_THROW', {
      message: String(e && e.message ? e.message : e),
      stack:   e && e.stack ? String(e.stack).substring(0, 2000) : ''
    });
    return {brand: '', model: '', serial: '', type: '', fuelType: '',
      error: "Couldn't read the sticker. Try retaking the photo in better lighting, or enter manually."};
  }
}

// Verbatim port of Floor Push parseOCRText_. Sub-brand priority
// (Admiral/Amana/Roper before Whirlpool) so "Whirlpool Corp" at the
// bottom of an Admiral sticker doesn't win. Kenmore 110-prefix detection.
function edpParseOCRText(rawText) {
  var out = {brand: '', model: '', serial: '', type: '', fuelType: 'N/A', source: 'ocr'};
  if (!rawText) return out;
  var text  = String(rawText).toUpperCase();
  var lines = text.split('\n');
  var i, m, s;

  var brands = ['ADMIRAL','AMANA','ROPER','ESTATE','MAYTAG','KENMORE',
                'KITCHENAID','HOTPOINT','FRIGIDAIRE','ELECTROLUX',
                'SAMSUNG','LG','BOSCH','HAIER','GE','WHIRLPOOL'];
  for (i = 0; i < brands.length; i++) {
    if (text.indexOf(brands[i]) !== -1) { out.brand = brands[i]; break; }
  }

  for (i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('MODEL') !== -1 || lines[i].indexOf('MOD') !== -1) {
      m = lines[i].replace(/MODEL\s*(NO\.?|NUMBER)?/i,'').trim().match(/([A-Z0-9][A-Z0-9\-\.]{3,})/);
      if (m && m[1] !== 'MODEL') { out.model = m[1]; break; }
      if (i + 1 < lines.length) {
        m = lines[i+1].trim().match(/^([A-Z0-9][A-Z0-9\-\.]{3,})/);
        if (m) { out.model = m[1]; break; }
      }
    }
  }
  if (!out.model) { m = text.match(/\b([A-Z]{2,5}[0-9]{3,}[A-Z0-9]*)\b/); if (m) out.model = m[1]; }

  for (i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('SERIAL') !== -1 || lines[i].indexOf('SER') !== -1 || lines[i].indexOf('S/N') !== -1) {
      s = lines[i].replace(/SERIAL\s*(NO\.?|NUMBER)?|SER\s*NO\.?|S\/N\s*/i,'').trim().match(/([A-Z0-9][A-Z0-9\-]{4,})/);
      if (s && s[1] !== 'SERIAL') { out.serial = s[1]; break; }
      if (i + 1 < lines.length) {
        s = lines[i+1].trim().match(/^([A-Z0-9][A-Z0-9\-]{4,})/);
        if (s) { out.serial = s[1]; break; }
      }
    }
  }
  if (!out.serial) { s = text.match(/\b([A-Z]{1,3}[0-9]{6,})\b/); if (s) out.serial = s[1]; }
  if (!out.brand && out.model && out.model.indexOf('110.') === 0) out.brand = 'KENMORE';

  return out;
}

// ---- normalizers for the EDP_INTAKE dropdowns --------------
function edpNormalizeBrand(raw) {
  if (!raw) return '';
  var trimmed = String(raw).trim();
  if (!trimmed) return '';
  var u = trimmed.toUpperCase();
  var map = {
    'ADMIRAL': 'Admiral', 'AMANA': 'Amana', 'ROPER': 'Roper',
    'ESTATE': 'Estate', 'MAYTAG': 'Maytag', 'KENMORE': 'Kenmore',
    'KITCHENAID': 'KitchenAid', 'HOTPOINT': 'Hotpoint',
    'FRIGIDAIRE': 'Frigidaire', 'ELECTROLUX': 'Electrolux',
    'SAMSUNG': 'Samsung', 'LG': 'LG', 'BOSCH': 'Bosch',
    'HAIER': 'Haier', 'GE': 'GE', 'WHIRLPOOL': 'Whirlpool',
    'SPEED QUEEN': 'Speed Queen', 'TAPPAN': 'Tappan'
  };
  if (map.hasOwnProperty(u)) return map[u];
  return trimmed;
}

function edpNormalizeCategory(raw) {
  if (!raw) return '';
  var u = String(raw).trim().toUpperCase();
  if (u === 'WASHER') return 'Washer';
  if (u === 'DRYER')  return 'Dryer';
  if (u === 'REFRIGERATOR' || u === 'FRIDGE') return 'Refrigerator';
  if (u === 'STOVE' || u === 'RANGE' || u === 'OVEN') return 'Stove';
  if (u === 'FREEZER')    return 'Freezer';
  if (u === 'DISHWASHER') return 'Dishwasher';
  if (u === 'MICROWAVE')  return 'Microwave';
  if (u === 'OTHER')      return 'Other';
  return '';
}

function edpNormalizeFuel(raw) {
  if (!raw) return '';
  var u = String(raw).trim().toUpperCase();
  if (u === 'ELECTRIC') return 'Electric';
  if (u === 'GAS')      return 'Gas';
  if (u === 'BOTH' || u === 'COMBO' || u === 'BOTH (COMBO UNIT)') return 'Both (combo unit)';
  if (u === 'N/A' || u === 'NA' || u === 'NONE') return 'N/A';
  return '';
}
