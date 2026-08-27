const EDP_MASTER_SPREADSHEET_ID = '117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI';
const SMS_CONSENT_SHEET = 'SMS_CONSENT_LOG';
const CUSTOMERS_SHEET = 'CUSTOMERS';
const ALLOWED_ENVIRONMENT = 'TEST';
const PORTAL_SECRET_PROPERTY = 'PORTAL_SHARED_SECRET';

function doGet() {
  return jsonResponse_({
    ok: true,
    service: 'EDP SMS Consent Gateway',
    environment: ALLOWED_ENVIRONMENT
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expectedSecret = PropertiesService.getScriptProperties().getProperty(PORTAL_SECRET_PROPERTY);

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse_({ ok: false, error: 'unauthorized' });
    }

    if (payload.environment !== ALLOWED_ENVIRONMENT) {
      return jsonResponse_({ ok: false, error: 'environment_not_allowed' });
    }

    const mobileNumber = normalizeUsPhone_(payload.mobile_number);
    if (!mobileNumber) {
      return jsonResponse_({ ok: false, error: 'invalid_mobile_number' });
    }

    const disclosureVersion = String(payload.disclosure_version || '').trim();
    if (!disclosureVersion) {
      return jsonResponse_({ ok: false, error: 'missing_disclosure_version' });
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      return jsonResponse_({ ok: false, error: 'busy_retry' });
    }

    try {
      const ss = SpreadsheetApp.openById(EDP_MASTER_SPREADSHEET_ID);
      const logSheet = ss.getSheetByName(SMS_CONSENT_SHEET);
      if (!logSheet) {
        return jsonResponse_({ ok: false, error: 'consent_log_missing' });
      }

      const customerMatch = findUniqueCustomerByPhone_(ss, mobileNumber);
      const customerName = customerMatch.customerName || cleanText_(payload.customer_name, 120);
      const consentId = 'CONS-' + Utilities.getUuid().toUpperCase();
      const timestamp = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd HH:mm:ss z');

      const record = {
        consent_id: consentId,
        timestamp: timestamp,
        environment: ALLOWED_ENVIRONMENT,
        cust_id: customerMatch.custId,
        customer_name: customerName,
        mobile_number: mobileNumber,
        event_type: 'OPT_IN',
        consent_status_after_event: 'OPTED_IN',
        consent_scope: 'CUSTOMER_CARE',
        consent_source: 'PORTAL_WEB',
        source_url: cleanUrl_(payload.source_url),
        disclosure_version: disclosureVersion,
        privacy_url: cleanUrl_(payload.privacy_url),
        sms_terms_url: cleanUrl_(payload.sms_terms_url),
        recorded_by: 'EDP Customer Portal V3 / Railway TEST',
        evidence_url: '',
        notes: customerMatch.matchStatus
      };

      appendByHeader_(logSheet, record);

      return jsonResponse_({
        ok: true,
        consent_id: consentId,
        timestamp: timestamp,
        cust_id: customerMatch.custId || ''
      });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return jsonResponse_({ ok: false, error: 'gateway_error' });
  }
}

function appendByHeader_(sheet, record) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const missing = Object.keys(record).filter(function(key) { return headers.indexOf(key) === -1; });
  if (missing.length) {
    throw new Error('Missing SMS_CONSENT_LOG headers: ' + missing.join(', '));
  }

  const row = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
  });
  sheet.appendRow(row);
}

function findUniqueCustomerByPhone_(ss, normalizedPhone) {
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    return { custId: '', customerName: '', matchStatus: 'No verified customer match at consent time.' };
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idx = {
    custId: headers.indexOf('cust_id'),
    firstName: headers.indexOf('first_name'),
    lastName: headers.indexOf('last_name'),
    phone1: headers.indexOf('phone1'),
    phone2: headers.indexOf('phone2'),
    phone3: headers.indexOf('phone3')
  };

  if (idx.custId < 0 || idx.phone1 < 0) {
    return { custId: '', customerName: '', matchStatus: 'CUSTOMERS headers incomplete; customer link not assigned.' };
  }

  const targetDigits = phoneDigits_(normalizedPhone);
  const matches = [];

  for (let r = 1; r < values.length; r += 1) {
    const row = values[r];
    const phones = [idx.phone1, idx.phone2, idx.phone3]
      .filter(function(i) { return i >= 0; })
      .map(function(i) { return phoneDigits_(row[i]); })
      .filter(Boolean);

    if (phones.indexOf(targetDigits) !== -1) {
      const custId = String(row[idx.custId] || '').trim();
      const first = idx.firstName >= 0 ? String(row[idx.firstName] || '').trim() : '';
      const last = idx.lastName >= 0 ? String(row[idx.lastName] || '').trim() : '';
      matches.push({ custId: custId, customerName: (first + ' ' + last).trim() });
    }
  }

  const uniqueIds = Array.from(new Set(matches.map(function(m) { return m.custId; }).filter(Boolean)));
  if (uniqueIds.length === 1) {
    const match = matches.find(function(m) { return m.custId === uniqueIds[0]; });
    return {
      custId: uniqueIds[0],
      customerName: match ? match.customerName : '',
      matchStatus: 'Unique exact phone match linked to existing customer.'
    };
  }

  if (uniqueIds.length > 1) {
    return { custId: '', customerName: '', matchStatus: 'Multiple customer records matched phone; cust_id left blank for reconciliation.' };
  }

  return { custId: '', customerName: '', matchStatus: 'No exact customer phone match; cust_id left blank.' };
}

function normalizeUsPhone_(value) {
  let digits = phoneDigits_(value);
  if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
  if (digits.length !== 10) return '';
  return '+1' + digits;
}

function phoneDigits_(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

function cleanText_(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength || 500);
}

function cleanUrl_(value) {
  const text = cleanText_(value, 500);
  return /^https:\/\//i.test(text) ? text : '';
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
