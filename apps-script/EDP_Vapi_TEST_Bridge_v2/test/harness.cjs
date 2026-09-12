// Simulates the Apps Script runtime so the .gs logic can be exercised in Node.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');

// ---- fake spreadsheet ----------------------------------------------------
function makeSheet(rows) {
  const data = rows.map(r => r.slice());
  return {
    _data: data,
    getLastRow: () => data.length,
    getLastColumn: () => data.reduce((m, r) => Math.max(m, r.length), 0),
    setFrozenRows: () => {},
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          const out = [];
          for (let r = row - 1; r < row - 1 + numRows; r++) {
            const src = data[r] || [];
            const line = [];
            for (let c = col - 1; c < col - 1 + numCols; c++) line.push(src[c] === undefined ? '' : src[c]);
            out.push(line);
          }
          return out;
        },
        setValues(values) {
          values.forEach((line, i) => {
            const r = row - 1 + i;
            while (data.length <= r) data.push([]);
            line.forEach((v, j) => { data[r][col - 1 + j] = v; });
          });
        },
      };
    },
    appendRow(rowArray) { data.push(rowArray.slice()); },
  };
}

const pushCalls = [];
const fetchLog = [];

function buildSandbox(opts) {
  const props = Object.assign({}, opts.props);
  const sheet = opts.sheet;
  let lockHeld = false;

  return {
    console,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
      }),
    },
    SpreadsheetApp: {
      openById: id => ({
        getSheetByName: name => (opts.tabName === name ? sheet : null),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { if (lockHeld) return false; lockHeld = true; return true; },
        releaseLock: () => { lockHeld = false; },
      }),
    },
    UrlFetchApp: {
      fetch: (url, params) => {
        fetchLog.push({ url, params });
        pushCalls.push(params.payload);
        return { getResponseCode: () => opts.pushoverStatus || 200 };
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: text => ({
        setMimeType() { return this; },
        getContent: () => text,
      }),
    },
    Utilities: {
      getUuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
    },
    ScriptApp: { getService: () => ({ getUrl: () => opts.execUrl || '' }) },
    _props: props,
  };
}

function loadContext(sandbox) {
  const ctx = vm.createContext(sandbox);
  for (const f of ['Config.gs', 'CallRecord.gs', 'SheetLog.gs', 'Notify.gs', 'Code.gs', 'Setup.gs', 'Tests.gs']) {
    vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

module.exports = { makeSheet, buildSandbox, loadContext, pushCalls, fetchLog };
