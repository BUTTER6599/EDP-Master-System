const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const consentGatewayUrl = process.env.CONSENT_GATEWAY_URL || '';
const consentGatewaySecret = process.env.CONSENT_GATEWAY_SECRET || '';
const applianceGatewayUrl = process.env.APPLIANCE_GATEWAY_URL || '';

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
  'dimensions_display'
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
