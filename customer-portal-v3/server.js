const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const consentGatewayUrl = process.env.CONSENT_GATEWAY_URL || '';
const consentGatewaySecret = process.env.CONSENT_GATEWAY_SECRET || '';
const applianceGatewayUrl = process.env.APPLIANCE_GATEWAY_URL || '';
// Hold-request gateway reuses the same Apps Script project as the SMS
// consent gateway (dispatched on payload.action). Separate env vars so
// the ops surface stays explicit and the gateway URL can be rotated.
const holdGatewayUrl = process.env.HOLD_GATEWAY_URL || process.env.CONSENT_GATEWAY_URL || '';
const holdGatewaySecret = process.env.HOLD_GATEWAY_SECRET || process.env.CONSENT_GATEWAY_SECRET || '';

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'EDP Customer Portal V3',
    environment: 'TEST'
  });
});

app.get('/api/sms-consent/status', (_req, res) => {
  res.status(200).json({
    ready: Boolean(consentGatewayUrl && consentGatewaySecret),
    environment: 'TEST'
  });
});

// Public appliance browse. Read-only proxy to the TEST Apps Script
// gateway. Returns HTTP 200 in every branch so the client can render
// a friendly fallback instead of a network error; error responses
// carry only a short opaque code, never a stack trace or internal
// detail.
app.get('/api/appliances', async (_req, res) => {
  if (!applianceGatewayUrl) {
    return res.status(200).json({ ok: false, error: 'appliance_gateway_not_configured' });
  }

  try {
    const response = await fetch(applianceGatewayUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error('Appliance gateway returned HTTP', response.status);
      return res.status(200).json({ ok: false, error: 'unavailable' });
    }

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (_err) {
      console.error('Appliance gateway returned non-JSON. HTTP status:', response.status);
      return res.status(200).json({ ok: false, error: 'unavailable' });
    }

    if (!result || result.ok !== true || !Array.isArray(result.data)) {
      return res.status(200).json({ ok: false, error: 'unavailable' });
    }

    // Second, independent security boundary. Even if the upstream
    // Apps Script gateway drifts and starts emitting internal fields
    // (serial, cost_basis, notes, added_by, etc.) or unknown keys,
    // this rebuild guarantees only the public-safe allowlist can
    // reach the customer.
    const safeItems = result.data
      .map(sanitizeApplianceForCustomer)
      .filter(Boolean);

    return res.status(200).json({
      ok: true,
      count: safeItems.length,
      data: safeItems
    });
  } catch (err) {
    console.error('Appliance gateway request failed:', err && err.message ? err.message : err);
    return res.status(200).json({ ok: false, error: 'unavailable' });
  }
});

// Public hold-request submission. Proxies to the TEST Apps Script
// hold-request handler which writes to the CUSTOMER_HOLDS tab in
// EDP_MASTER_DATABASE. Only the three customer-supplied fields
// (item_id, customer_name, phone) are forwarded; everything else is
// server-controlled. On gateway failure the server returns a stable
// opaque error — the frontend keeps its session-only draft and
// surfaces a degraded confirmation.
app.post('/api/hold-request', async (req, res) => {
  if (!holdGatewayUrl || !holdGatewaySecret) {
    return res.status(503).json({ ok: false, error: 'hold_gateway_not_configured' });
  }

  const body = req.body || {};
  const itemId = cleanText(body.item_id, 60);
  const customerName = cleanText(body.customer_name, 120);
  const phoneDigits = normalizeUsPhoneDigits(body.phone);

  if (!itemId) {
    return res.status(400).json({ ok: false, error: 'invalid_item_id' });
  }
  if (!customerName) {
    return res.status(400).json({ ok: false, error: 'invalid_customer_name' });
  }
  if (phoneDigits.length !== 10) {
    return res.status(400).json({ ok: false, error: 'invalid_phone' });
  }

  const gatewayPayload = {
    secret: holdGatewaySecret,
    environment: 'TEST',
    action: 'hold_request',
    item_id: itemId,
    customer_name: customerName,
    phone: phoneDigits
  };

  try {
    const response = await fetch(holdGatewayUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gatewayPayload),
      signal: AbortSignal.timeout(10000)
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (_err) {
      console.error('Hold gateway returned non-JSON. HTTP status:', response.status);
      return res.status(502).json({ ok: false, error: 'invalid_gateway_response' });
    }

    if (!response.ok || !result.ok) {
      const safeError = result && result.error ? String(result.error) : 'hold_gateway_error';
      console.error('Hold gateway rejected TEST request:', safeError, 'HTTP status:', response.status);
      return res.status(502).json({ ok: false, error: safeError });
    }

    return res.status(201).json({
      ok: true,
      hold_id: result.hold_id,
      hold_time: result.hold_time,
      status: result.status,
      persisted_fields: Array.isArray(result.persisted_fields) ? result.persisted_fields : []
    });
  } catch (err) {
    console.error('Hold gateway request failed:', err && err.message ? err.message : err);
    return res.status(502).json({ ok: false, error: 'hold_gateway_unreachable' });
  }
});

// TEST-only auth diagnostic for the Hold Request bug. Returns server
// env state (which var is in use, whether it is configured, its byte
// length, leading/trailing whitespace flags) and a round-trip through
// the Apps Script gateway's diag_hold_auth action (returns Script
// Property length/match without the value). Remove this endpoint and
// the matching Apps Script branch once the mismatch is resolved.
app.get('/api/hold-request/_diag', async (_req, res) => {
  const urlEnv = process.env.HOLD_GATEWAY_URL ? 'HOLD_GATEWAY_URL'
    : process.env.CONSENT_GATEWAY_URL ? 'CONSENT_GATEWAY_URL_fallback'
    : 'none';
  const secretEnv = process.env.HOLD_GATEWAY_SECRET ? 'HOLD_GATEWAY_SECRET'
    : process.env.CONSENT_GATEWAY_SECRET ? 'CONSENT_GATEWAY_SECRET_fallback'
    : 'none';
  const urlTail = holdGatewayUrl ? holdGatewayUrl.slice(-20) : '';
  const serverInfo = {
    url_source: urlEnv,
    url_configured: Boolean(holdGatewayUrl),
    url_tail20: urlTail,
    secret_source: secretEnv,
    secret_configured: Boolean(holdGatewaySecret),
    secret_length: holdGatewaySecret.length,
    secret_leading_ws: holdGatewaySecret.length > 0 && /^\s/.test(holdGatewaySecret),
    secret_trailing_ws: holdGatewaySecret.length > 0 && /\s$/.test(holdGatewaySecret)
  };
  if (!holdGatewayUrl || !holdGatewaySecret) {
    return res.status(200).json({ ok: true, server: serverInfo, gateway: null, note: 'gateway not configured' });
  }
  try {
    const response = await fetch(holdGatewayUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        environment: 'TEST',
        action: 'diag_hold_auth',
        probe_secret: holdGatewaySecret
      }),
      signal: AbortSignal.timeout(10000)
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch (_) { result = { ok: false, error: 'non_json', raw: text.slice(0, 200) }; }
    return res.status(200).json({ ok: true, server: serverInfo, gateway: result });
  } catch (err) {
    return res.status(200).json({ ok: true, server: serverInfo, gateway: { ok: false, error: err && err.message ? err.message : 'network' } });
  }
});

app.post('/api/sms-consent', async (req, res) => {
  if (!consentGatewayUrl || !consentGatewaySecret) {
    return res.status(503).json({ ok: false, error: 'consent_gateway_not_configured' });
  }

  const body = req.body || {};
  const customerName = cleanText(body.customer_name, 120);
  const mobileNumber = normalizeUsPhone(body.mobile_number);
  const smsConsent = body.sms_consent === true;

  if (!mobileNumber) {
    return res.status(400).json({ ok: false, error: 'invalid_mobile_number' });
  }

  if (!smsConsent) {
    return res.status(400).json({ ok: false, error: 'sms_consent_required_for_opt_in' });
  }

  const origin = `${req.protocol}://${req.get('host')}`;
  const gatewayPayload = {
    secret: consentGatewaySecret,
    environment: 'TEST',
    customer_name: customerName,
    mobile_number: mobileNumber,
    disclosure_version: 'EDP-SMS-CONSENT-2026-08-26-v1',
    source_url: `${origin}/sms-consent.html`,
    privacy_url: `${origin}/privacy.html`,
    sms_terms_url: `${origin}/sms-terms.html`
  };

  try {
    const response = await fetch(consentGatewayUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gatewayPayload),
      signal: AbortSignal.timeout(10000)
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (_err) {
      console.error('SMS consent gateway returned non-JSON response. HTTP status:', response.status);
      return res.status(502).json({ ok: false, error: 'invalid_gateway_response' });
    }

    if (!response.ok || !result.ok) {
      const safeError = result && result.error ? String(result.error) : 'consent_gateway_error';
      console.error('SMS consent gateway rejected TEST request:', safeError, 'HTTP status:', response.status);
      return res.status(502).json({ ok: false, error: safeError });
    }

    return res.status(201).json({
      ok: true,
      consent_id: result.consent_id,
      timestamp: result.timestamp
    });
  } catch (err) {
    console.error('SMS consent gateway request failed:', err && err.message ? err.message : err);
    return res.status(502).json({ ok: false, error: 'consent_gateway_unreachable' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`EDP Customer Portal V3 TEST listening on port ${port}`);
});

// Public-safe field allowlist for /api/appliances. Any key not in
// this array is dropped from the customer response, regardless of
// what the upstream Apps Script gateway sent.
const PUBLIC_APPLIANCE_FIELDS = [
  'item_id',
  'category',
  'brand',
  'model',
  'condition',
  'list_price',
  'warranty_tier',
  'fuel_type',
  'photo_links',
  'width_in',
  'height_in',
  'depth_in',
  'capacity_cu_ft',
  'dimensions_display',
  'is_held',
  'hold_id',
  'held_until'
];

function sanitizeApplianceForCustomer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const key of PUBLIC_APPLIANCE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = raw[key];
    }
  }
  return out;
}

function cleanText(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength || 500);
}

function normalizeUsPhone(value) {
  let digits = String(value == null ? '' : value).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return '';
  return `+1${digits}`;
}

function normalizeUsPhoneDigits(value) {
  let digits = String(value == null ? '' : value).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits;
}
