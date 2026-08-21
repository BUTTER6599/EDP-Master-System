const PORTAL_PUBLIC_FIELDS = Object.freeze([
  'item_id',
  'category',
  'brand',
  'model',
  'condition',
  'list_price',
  'photo_links',
  'status'
]);

function api_getPublicAppliances() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('EDP_MASTER_DATABASE_ID');
  if (!spreadsheetId) {
    throw new Error('Missing EDP_MASTER_DATABASE_ID Script Property.');
  }

  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('APPLIANCES');
  if (!sheet) {
    throw new Error('APPLIANCES sheet not found.');
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(normalizePortalHeader_);
  const headerIndex = new Map(headers.map((header, index) => [header, index]));

  const required = ['item_id', 'category', 'list_price', 'status'];
  required.forEach((field) => {
    if (!headerIndex.has(field)) {
      throw new Error(`Required public field missing from APPLIANCES headers: ${field}`);
    }
  });

  return values
    .slice(1)
    .map((row) => buildPublicAppliance_(row, headerIndex))
    .filter((record) => record !== null);
}

function buildPublicAppliance_(row, headerIndex) {
  const record = {};

  PORTAL_PUBLIC_FIELDS.forEach((field) => {
    const index = headerIndex.get(field);
    record[field] = index === undefined ? '' : sanitizePortalValue_(row[index]);
  });

  const normalizedStatus = String(record.status || '').trim().toUpperCase();
  if (!['AVAILABLE', 'SOLD'].includes(normalizedStatus)) {
    return null;
  }

  record.status = normalizedStatus;
  return record;
}

function sanitizePortalValue_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (Array.isArray(value)) {
    return value.map(sanitizePortalValue_);
  }
  return value === null || value === undefined ? '' : value;
}

function normalizePortalHeader_(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
