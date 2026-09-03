/**********************************************************************
 * BankImport.gs — EDP Owner Dashboard
 * MANUAL BANK ROUTE — TEST Slice 1 (READ-ONLY financial; staging-only)
 *
 * Parses a manually-provided bank CSV into normalized staging rows in a
 * dedicated BANK_IMPORT_STAGING tab. PDF is evidence/reference only
 * (link preserved). NO bank API, NO credentials, NO transfers/payments,
 * NO writes to SALES/PURCHASES/CASH_MOVEMENTS/BILLS/PAYROLL/CASH_POSITION.
 *
 * Writes ONLY to BANK_IMPORT_STAGING, and ONLY when the four-key import
 * guard passes. Default is dryRun:true (parse + classify + match preview,
 * zero writes). Matching against source records is READ-ONLY (proposals
 * only). Internal transfers are kept but excluded from economic totals.
 *
 * ES5 only. No const/let/arrow functions/template literals.
 **********************************************************************/


var BI_STAGING_TAB = 'BANK_IMPORT_STAGING';

var BI_STAGING_HEADERS = [
  'staging_id', 'import_batch_id', 'imported_at',
  'source_institution', 'source_account',
  'txn_date', 'posted_date', 'amount', 'description', 'transaction_type',
  'pending_status', 'direction', 'internal_external', 'economic_impact',
  'source_file_name', 'raw_source_ref', 'provider_txn_id', 'dedup_fingerprint',
  'match_status', 'match_candidates', 'accounting_status', 'verification_status', 'notes'
];

// Column-name synonyms (lower-cased) -> canonical field.
var BI_COL_SYNONYMS = {
  txn_date:        ['transaction date', 'date', 'trans date', 'txn date'],
  posted_date:     ['posted date', 'post date', 'settlement date', 'posting date'],
  amount:          ['amount', 'transaction amount', 'amt'],
  debit:           ['debit', 'withdrawal', 'withdrawals', 'money out', 'debits'],
  credit:          ['credit', 'deposit', 'deposits', 'money in', 'credits'],
  description:     ['description', 'merchant', 'name', 'memo', 'details', 'payee', 'transaction'],
  transaction_type:['type', 'transaction type', 'trans type'],
  pending_status:  ['status', 'pending', 'pending/posted'],
  provider_txn_id: ['transaction id', 'reference', 'reference number', 'ref', 'id', 'check number'],
  account:         ['account', 'account name', 'account number', 'bucket']
};

// Strong signals that a line is an INTERNAL transfer (not economic).
var BI_INTERNAL_KEYWORDS = [
  'transfer', 'xfer', 'relay', 'to savings', 'from savings', 'online transfer',
  'internal transfer', 'between accounts', 'acct transfer', 'move money'
];




/**********************************************************************
 * SMALL PURE UTILITIES (no sheet access)
 **********************************************************************/

function bi_round2_(n) { return Math.round((parseFloat(n) || 0) * 100) / 100; }


function bi_norm_(s) { return String(s === null || typeof s === 'undefined' ? '' : s).toLowerCase().trim(); }


// Parse a money cell: strips $ and commas; "(12.34)" and trailing "-" => negative.
function bi_parseAmount_(v) {
  if (v === null || typeof v === 'undefined') { return null; }
  var s = String(v).trim();
  if (s === '') { return null; }
  var neg = false;
  if (s.indexOf('(') >= 0 && s.indexOf(')') >= 0) { neg = true; }
  if (/-\s*$/.test(s) || s.charAt(0) === '-') { neg = true; }
  s = s.replace(/[^0-9.]/g, '');
  if (s === '' || isNaN(parseFloat(s))) { return null; }
  var n = parseFloat(s);
  return bi_round2_(neg ? -n : n);
}


// Minimal RFC-4180-ish CSV parser (handles quotes, commas, CRLF). Pure.
function bi_parseCsv_(text) {
  var rows = [];
  var row = [];
  var field = '';
  var i = 0, inQ = false;
  text = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  while (i < text.length) {
    var c = text.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  row.push(field); rows.push(row);
  // drop trailing empty last row
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') { rows.pop(); }
  return rows;
}


// Map a header row to canonical field -> column index.
function bi_detectColumns_(headerRow) {
  var map = {};
  for (var c = 0; c < headerRow.length; c++) {
    var h = bi_norm_(headerRow[c]);
    for (var field in BI_COL_SYNONYMS) {
      if (!BI_COL_SYNONYMS.hasOwnProperty(field)) { continue; }
      var syns = BI_COL_SYNONYMS[field];
      for (var s = 0; s < syns.length; s++) {
        if (h === syns[s]) { if (typeof map[field] === 'undefined') { map[field] = c; } }
      }
    }
  }
  return map;
}


// Strong-signal internal-transfer detection. Returns 'INTERNAL'|'EXTERNAL'.
function bi_classifyInternal_(description, transaction_type) {
  var hay = bi_norm_(description) + ' ' + bi_norm_(transaction_type);
  for (var i = 0; i < BI_INTERNAL_KEYWORDS.length; i++) {
    if (hay.indexOf(BI_INTERNAL_KEYWORDS[i]) >= 0) { return 'INTERNAL'; }
  }
  return 'EXTERNAL';
}


// Deterministic fingerprint for duplicate protection.
// Prefers provider account + provider_txn_id; else date|amount|desc|account|type.
function bi_fingerprint_(rec) {
  var pid = bi_norm_(rec.provider_txn_id);
  var acct = bi_norm_(rec.source_account);
  if (pid !== '') { return 'PID:' + acct + '|' + pid; }
  return 'FP:' + [bi_norm_(rec.txn_date), String(rec.amount),
                  bi_norm_(rec.description), acct, bi_norm_(rec.transaction_type)].join('|');
}


// Normalize one raw CSV row into a staging record (no sheet access).
function bi_normalizeRow_(raw, colMap, meta) {
  function cell(field) {
    var idx = colMap[field];
    return (typeof idx === 'number' && idx < raw.length) ? String(raw[idx]) : '';
  }
  // amount: single column, else credit - debit
  var amount = bi_parseAmount_(cell('amount'));
  if (amount === null) {
    var cr = bi_parseAmount_(cell('credit'));
    var db = bi_parseAmount_(cell('debit'));
    if (cr !== null || db !== null) { amount = bi_round2_((cr || 0) - Math.abs(db || 0)); }
  }
  var rec = {
    source_institution: meta.institution || '',
    source_account:     cell('account') || meta.account || '',
    txn_date:           cell('txn_date'),
    posted_date:        cell('posted_date'),
    amount:             (amount === null ? null : amount),
    description:        cell('description'),
    transaction_type:  cell('transaction_type'),
    pending_status:    cell('pending_status'),
    provider_txn_id:   cell('provider_txn_id'),
    source_file_name:  meta.fileName || '',
    raw_source_ref:    raw.join(' | ')
  };
  rec.direction = (rec.amount === null) ? '' : (rec.amount >= 0 ? 'credit' : 'debit');
  rec.internal_external = bi_classifyInternal_(rec.description, rec.transaction_type);
  rec.economic_impact = (rec.internal_external === 'INTERNAL' || rec.amount === null) ? 0 : rec.amount;
  rec.dedup_fingerprint = bi_fingerprint_(rec);
  // Uncertain rows are never silently classified as economic-final.
  rec.verification_status = (rec.amount === null) ? 'NEEDS_VERIFICATION' : 'UNVERIFIED';
  rec.accounting_status   = 'UNPOSTED';
  return rec;
}


// Economic totals EXCLUDING internal transfers. Pure.
function bi_computeTotals_(records) {
  var t = { economicIncome: 0, economicExpense: 0, internalTransferCount: 0,
            internalTransferAmount: 0, count: records.length };
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    if (r.internal_external === 'INTERNAL') {
      t.internalTransferCount++;
      t.internalTransferAmount = bi_round2_(t.internalTransferAmount + (r.amount || 0));
      continue;
    }
    if (typeof r.economic_impact === 'number') {
      if (r.economic_impact >= 0) { t.economicIncome = bi_round2_(t.economicIncome + r.economic_impact); }
      else { t.economicExpense = bi_round2_(t.economicExpense + r.economic_impact); }
    }
  }
  return t;
}


// READ-ONLY match proposal against pre-loaded source rows.
// sources = { CASH_MOVEMENTS:[{amount,date}], PURCHASES:[...], SALES:[...], BILLS:[...] }
// Returns { match_status, match_candidates } — NEVER writes.
function bi_matchReadOnly_(rec, sources, nowParse) {
  if (rec.internal_external === 'INTERNAL' || rec.amount === null) {
    return { match_status: 'N/A_INTERNAL', match_candidates: '' };
  }
  var target = Math.abs(rec.amount);
  var recTime = nowParse(rec.txn_date);
  var cands = [];
  for (var tab in sources) {
    if (!sources.hasOwnProperty(tab)) { continue; }
    var arr = sources[tab] || [];
    for (var i = 0; i < arr.length; i++) {
      var a = Math.abs(parseFloat(arr[i].amount) || 0);
      if (Math.abs(a - target) > 0.01) { continue; }
      var dt = nowParse(arr[i].date);
      var withinWindow = true;
      if (recTime !== null && dt !== null) {
        var days = Math.abs(recTime - dt) / (1000 * 60 * 60 * 24);
        withinWindow = (days <= 3);
      }
      if (withinWindow) { cands.push(tab + '#' + i + '($' + a + ')'); }
    }
  }
  if (cands.length === 1) { return { match_status: 'MATCHED_CANDIDATE', match_candidates: cands[0] }; }
  if (cands.length > 1)  { return { match_status: 'NEEDS_VERIFICATION', match_candidates: cands.join(';') }; }
  return { match_status: 'UNMATCHED', match_candidates: '' };
}




/**********************************************************************
 * STAGING TAB (created only when the importer runs)
 **********************************************************************/

function bi_ensureStagingTab_(ss) {
  var sh = ss.getSheetByName(BI_STAGING_TAB);
  if (!sh) { sh = ss.insertSheet(BI_STAGING_TAB); }
  sh.getRange(1, 1, 1, BI_STAGING_HEADERS.length).setValues([BI_STAGING_HEADERS]);
  return sh;
}


// Existing fingerprints already in staging (read-only) -> object set.
function bi_existingFingerprints_(ss) {
  var set = {};
  var sh = ss.getSheetByName(BI_STAGING_TAB);
  if (!sh) { return set; }
  var data = sh.getDataRange().getValues();
  if (data.length < 2) { return set; }
  var h = data[0].map(function (x) { return String(x).toLowerCase().trim(); });
  var fpCol = h.indexOf('dedup_fingerprint');
  if (fpCol < 0) { return set; }
  for (var i = 1; i < data.length; i++) { set[String(data[i][fpCol])] = true; }
  return set;
}




/**********************************************************************
 * PUBLIC API — api_importBankCsv(payload, opts)
 * READ-ONLY by default (dryRun:true). Writes staging rows ONLY when:
 *   opts.dryRun === false AND opts.confirmAction === 'IMPORT_BANK_CSV'
 * Never writes to source financial tabs.
 **********************************************************************/

function api_importBankCsv(payload, opts) {
  payload = payload || {}; opts = opts || {};
  try {
    var csvText = String(payload.csvText || '');
    if (csvText === '') { return { ok: false, error: 'csvText is required (paste the bank CSV).' }; }

    var meta = {
      institution: payload.institution || '',
      account:     payload.account || '',
      fileName:    payload.fileName || '',
      pdfLink:     payload.pdfLink || ''    // evidence/reference only
    };

    var rows = bi_parseCsv_(csvText);
    if (rows.length < 2) { return { ok: false, error: 'CSV has no data rows.' }; }
    var colMap = bi_detectColumns_(rows[0]);
    if (typeof colMap.txn_date === 'undefined' ||
        (typeof colMap.amount === 'undefined' && typeof colMap.debit === 'undefined' && typeof colMap.credit === 'undefined')) {
      return { ok: false, error: 'Could not detect required columns (date + amount/debit/credit). Detected: ' + JSON.stringify(colMap) };
    }

    var batchId = 'BATCH-' + (new Date().getTime());
    var records = [];
    for (var r = 1; r < rows.length; r++) {
      if (rows[r].length === 1 && rows[r][0] === '') { continue; }
      records.push(bi_normalizeRow_(rows[r], colMap, meta));
    }

    // Duplicate protection (against existing staging + within-file).
    var ss = (typeof fp_openSheet_ === 'function') ? fp_openSheet_() : null;
    var existing = ss ? bi_existingFingerprints_(ss) : {};
    var seen = {};
    var toWrite = [], dupCount = 0;
    for (var k = 0; k < records.length; k++) {
      var fp = records[k].dedup_fingerprint;
      if (existing[fp] || seen[fp]) { records[k]._dup = true; dupCount++; continue; }
      seen[fp] = true; records[k]._dup = false; toWrite.push(records[k]);
    }

    // Read-only matching (sources loaded read-only).
    var sources = bi_loadSourcesReadOnly_(ss);
    for (var m = 0; m < records.length; m++) {
      var mt = bi_matchReadOnly_(records[m], sources, bi_parseDate_);
      records[m].match_status = mt.match_status;
      records[m].match_candidates = mt.match_candidates;
    }

    var totals = bi_computeTotals_(records);
    var approved = (opts.dryRun === false && String(opts.confirmAction) === 'IMPORT_BANK_CSV');

    var written = 0;
    if (approved && ss && toWrite.length) {
      var sh = bi_ensureStagingTab_(ss);
      var out = [];
      for (var w = 0; w < toWrite.length; w++) {
        out.push(bi_toStagingRow_(toWrite[w], batchId, meta));
      }
      var startRow = sh.getLastRow() + 1;
      sh.getRange(startRow, 1, out.length, BI_STAGING_HEADERS.length).setValues(out);
      written = out.length;
    }

    return {
      ok: true,
      dryRun: !approved,
      wroteRows: written > 0,
      writeBoundary: approved ? 'STAGING_ONLY' : 'READ_ONLY',
      batchId: batchId,
      parsed: records.length,
      newRows: toWrite.length,
      duplicatesSkipped: dupCount,
      written: written,
      totals: totals,
      needsVerification: records.filter(function (x) { return x.verification_status === 'NEEDS_VERIFICATION' || x.match_status === 'NEEDS_VERIFICATION'; }).length,
      internalTransfers: totals.internalTransferCount,
      pdfEvidence: meta.pdfLink || null,
      preview: records.slice(0, 10)
    };
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : String(e), writeBoundary: 'READ_ONLY' };
  }
}


function bi_toStagingRow_(rec, batchId, meta) {
  return [
    'STG-' + (new Date().getTime()) + '-' + Math.floor(Math.random() * 10000),
    batchId, new Date(),
    rec.source_institution, rec.source_account,
    rec.txn_date, rec.posted_date, rec.amount, rec.description, rec.transaction_type,
    rec.pending_status, rec.direction, rec.internal_external, rec.economic_impact,
    rec.source_file_name, rec.raw_source_ref, rec.provider_txn_id, rec.dedup_fingerprint,
    rec.match_status, rec.match_candidates, rec.accounting_status, rec.verification_status, ''
  ];
}


// Parse a date string to epoch ms, or null.
function bi_parseDate_(v) {
  if (!v) { return null; }
  if (v instanceof Date) { return isNaN(v.getTime()) ? null : v.getTime(); }
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d.getTime();
}


// Load source records READ-ONLY for matching. Never writes.
function bi_loadSourcesReadOnly_(ss) {
  var out = { CASH_MOVEMENTS: [], PURCHASES: [], SALES: [], BILLS: [] };
  if (!ss) { return out; }
  function readTab(name, amtNames, dateNames) {
    var sh = ss.getSheetByName(name);
    if (!sh) { return []; }
    var data = sh.getDataRange().getValues();
    if (data.length < 2) { return []; }
    var h = data[0].map(function (x) { return String(x).toLowerCase().trim(); });
    function find(cands) { for (var i = 0; i < cands.length; i++) { var c = h.indexOf(cands[i]); if (c >= 0) { return c; } } return -1; }
    var aCol = find(amtNames), dCol = find(dateNames);
    var arr = [];
    for (var i = 1; i < data.length; i++) {
      arr.push({ amount: aCol >= 0 ? data[i][aCol] : null, date: dCol >= 0 ? data[i][dCol] : null });
    }
    return arr;
  }
  out.CASH_MOVEMENTS = readTab('CASH_MOVEMENTS', ['amount_credit', 'amount_debit', 'amount'], ['timestamp', 'date']);
  out.PURCHASES      = readTab('PURCHASES', ['cost', 'amount'], ['purchase_date', 'timestamp']);
  out.SALES          = readTab('SALES', ['amount'], ['sale_date', 'timestamp']);
  out.BILLS          = readTab('BILLS', ['amount_due', 'amount'], ['due_date', 'timestamp']);
  return out;
}




/**********************************************************************
 * TEST WRAPPER (READ-ONLY) — run manually in the Apps Script editor.
 * Dry-run against a pasted CSV; writes nothing.
 **********************************************************************/

function runBankImportDryRun(csvText, institution, account, fileName) {
  var r = api_importBankCsv(
    { csvText: csvText || '', institution: institution || 'TEST', account: account || 'TEST', fileName: fileName || 'test.csv' },
    { dryRun: true });
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
