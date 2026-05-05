/*******************************************************
 * FILE: Purchase_Main.gs  (EDP_Purchase_Form)
 * EDP Purchase Logger — v1.0.0
 *
 * SETUP STEPS (run in order, one time each):
 *   1. In Apps Script: Project Settings (gear icon) → Script properties.
 *      Add these properties (reuses kiosk values where possible):
 *        PURCHASE_SHEET_ID    = (the spreadsheet id — same as kiosk OK)
 *        PURCHASE_PUSH_TOKEN  = (Pushover application token — same as kiosk OK)
 *        PURCHASE_PUSH_USER   = (Pushover user key — same as kiosk OK)
 *        PURCHASE_ALERT_EMAIL = (where alert emails go)
 *        PURCHASE_ALERT_MIN   = (optional dollar threshold for "big purchase" siren; default 100)
 *   2. Run SETUP_PURCHASE()
 *   3. Deploy → New Deployment → Web App → Execute as: ME, Access: Anyone
 *******************************************************/

var PUR_PROPS        = PropertiesService.getScriptProperties();
var PUR_SHEET_ID     = PUR_PROPS.getProperty("PURCHASE_SHEET_ID")    || PUR_PROPS.getProperty("KIOSK_SHEET_ID")    || "";
var PUR_LOG_TAB      = "PURCHASES";
var PUR_TEST_TAB     = "PURCHASES_TEST";
var PUR_PUSH_TOKEN   = PUR_PROPS.getProperty("PURCHASE_PUSH_TOKEN")  || PUR_PROPS.getProperty("KIOSK_PUSH_TOKEN")  || "";
var PUR_PUSH_USER    = PUR_PROPS.getProperty("PURCHASE_PUSH_USER")   || PUR_PROPS.getProperty("KIOSK_PUSH_USER")   || "";
var PUR_ALERT_EMAIL  = PUR_PROPS.getProperty("PURCHASE_ALERT_EMAIL") || PUR_PROPS.getProperty("KIOSK_ALERT_EMAIL") || "";
var PUR_ALERT_MIN    = parseFloat(PUR_PROPS.getProperty("PURCHASE_ALERT_MIN") || "100");

var PUR_EMPLOYEES = [
  { id:"JOE",      name:"Joe",      color:"#0D47A1", icon:"🛠️" },
  { id:"TAYLOR",   name:"Taylor",   color:"#4E342E", icon:"📋" },
  { id:"CLARENCE", name:"Clarence", color:"#1B5E20", icon:"🧹" },
  { id:"YVONNE",   name:"Yvonne",   color:"#4A148C", icon:"📞" },
  { id:"TEST",     name:"TEST",     color:"#B71C1C", icon:"🧪" },
];

var PUR_CATEGORIES = [
  "Inventory","Supplies","Equipment","Repairs","Office",
  "Fuel","Food","Utilities","Marketing","Other"
];

var PUR_PAYMENT_METHODS = ["Cash","Debit","Credit","Check","ACH/Transfer","Other"];

// ═══════════════════════════════════════════════════════
// doGet
// ═══════════════════════════════════════════════════════
function doGet() {
  var names = ["Purchase","purchase","Index","index","Purchase.html"];
  for (var i = 0; i < names.length; i++) {
    try {
      return HtmlService.createHtmlOutputFromFile(names[i])
        .setTitle("EDP Purchase Form")
        .addMetaTag("viewport","width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch(e) {}
  }
  return HtmlService.createHtmlOutput("<p style='color:red'>HTML file not found. Name it: Purchase</p>").setTitle("EDP Setup");
}

// ═══════════════════════════════════════════════════════
// api_boot — sends config + recent purchases to the UI
// ═══════════════════════════════════════════════════════
function api_boot() {
  if (!PUR_SHEET_ID) {
    return { ok:false, msg:"Set PURCHASE_SHEET_ID (or KIOSK_SHEET_ID) in Script Properties, then run SETUP_PURCHASE." };
  }
  var ss = SpreadsheetApp.openById(PUR_SHEET_ID);
  var sh = _getOrCreatePurchaseLog(ss);
  var recent = [];
  var lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    var startRow = Math.max(2, lastRow - 9);
    var n = lastRow - startRow + 1;
    var rows = sh.getRange(startRow, 1, n, 10).getValues();
    recent = rows.reverse().map(function(r) {
      return {
        ts: r[0] ? new Date(r[0]).toLocaleString() : "",
        empName: r[2] || "",
        vendor: r[3] || "",
        amount: r[4] || 0,
        payment: r[5] || "",
        category: r[6] || "",
        notes: r[7] || "",
      };
    });
  }
  return {
    ok: true,
    employees: PUR_EMPLOYEES,
    categories: PUR_CATEGORIES,
    paymentMethods: PUR_PAYMENT_METHODS,
    alertMin: PUR_ALERT_MIN,
    recent: recent,
    serverTimeMs: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════
// api_logPurchase — main submit endpoint
// ═══════════════════════════════════════════════════════
function api_logPurchase(data) {
  var empId    = (data.empId || data.employeeId || "").toUpperCase();
  var pin      = String(data.pin || "");
  var vendor   = String(data.vendor || "").trim();
  var amount   = parseFloat(data.amount);
  var payment  = String(data.payment || "").trim();
  var category = String(data.category || "").trim();
  var notes    = String(data.notes || "").trim();
  var photo    = data.photoB64 || data.photoDataUrl || "";
  var isTest   = (empId === "TEST");

  if (!empId)            return { ok:false, msg:"Pick who is logging this." };
  if (!vendor)           return { ok:false, msg:"Vendor / store is required." };
  if (!isFinite(amount) || amount <= 0) return { ok:false, msg:"Amount must be greater than 0." };
  if (!payment)          return { ok:false, msg:"Pick a payment method." };
  if (!category)         return { ok:false, msg:"Pick a category." };

  var emp = PUR_EMPLOYEES.find(function(e){ return e.id === empId; });
  if (!emp) return { ok:false, msg:"Employee not found: " + empId };

  // Verify PIN — reuses kiosk PIN_<EMPID> hash
  var props  = PropertiesService.getScriptProperties();
  var stored = props.getProperty("PIN_" + empId);
  if (!stored) return { ok:false, msg:"PIN not set. Run SETUP_PURCHASE or SETUP_KIOSK first." };
  if (_purHashPin(pin) !== stored) return { ok:false, msg:"Wrong PIN. Try again." };

  // Save receipt photo (optional)
  var photoId = "";
  if (photo && photo.length > 200) {
    try { photoId = _purSaveToDrive(emp.name + (isTest ? "_TEST" : ""), "RECEIPT_" + category, photo); }
    catch(e) { Logger.log("Receipt photo error: " + e.message); }
  }

  var ss  = SpreadsheetApp.openById(PUR_SHEET_ID);
  var sh  = isTest ? _getOrCreatePurchaseTestLog(ss) : _getOrCreatePurchaseLog(ss);
  var now = new Date();
  var amt = Math.round(amount * 100) / 100;
  sh.appendRow([
    now,
    empId,
    emp.name + (isTest ? " [TEST]" : ""),
    vendor,
    amt,
    payment,
    category,
    notes,
    photoId,
    isTest ? "TEST" : "LIVE",
  ]);

  if (!isTest) {
    var bigPurchase = (amt >= PUR_ALERT_MIN);
    _purPushPurchase(emp.name, vendor, amt, payment, category, notes, bigPurchase);
    _purEmailPurchase(emp.name, vendor, amt, payment, category, notes, photoId);
  }

  return {
    ok: true,
    msg: "Logged $" + amt.toFixed(2) + " — " + vendor,
    photoSaved: !!photoId,
    isTest: isTest,
  };
}

// ═══════════════════════════════════════════════════════
// SETUP — run once
// ═══════════════════════════════════════════════════════
function SETUP_PURCHASE() {
  var props = PropertiesService.getScriptProperties();
  // If kiosk PINs already exist (same script project), keep them. Otherwise seed.
  var seeded = 0;
  PUR_EMPLOYEES.forEach(function(e) {
    if (!props.getProperty("PIN_" + e.id)) {
      var defaults = { JOE:"9544", TAYLOR:"9911", CLARENCE:"1200", YVONNE:"7864", TEST:"0000" };
      props.setProperty("PIN_" + e.id, _purHashPin(defaults[e.id] || "0000"));
      seeded++;
    }
  });
  var ss = SpreadsheetApp.openById(PUR_SHEET_ID);
  _getOrCreatePurchaseLog(ss);
  _getOrCreatePurchaseTestLog(ss);
  Logger.log("✅ PURCHASE FORM SETUP COMPLETE");
  Logger.log("PINs seeded: " + seeded + " (existing PINs preserved)");
  Logger.log("Sheet tabs created: " + PUR_LOG_TAB + ", " + PUR_TEST_TAB);
  Logger.log("Big-purchase alert threshold: $" + PUR_ALERT_MIN.toFixed(2));
  Logger.log("NEXT: Deploy → New Deployment → Web App.");
}

function CLEAR_PURCHASE_TEST_LOGS() {
  var ss = SpreadsheetApp.openById(PUR_SHEET_ID);
  var sh = ss.getSheetByName(PUR_TEST_TAB);
  if (!sh) { Logger.log("No " + PUR_TEST_TAB + " tab found."); return; }
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  Logger.log("✅ " + PUR_TEST_TAB + " cleared.");
}

function TEST_PURCHASE_PUSHOVER() {
  _purPush("✅ EDP Purchase Form Pushover test — working!", 0, "cashregister");
  Logger.log("Pushover test sent.");
}

// ═══════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════
function _getOrCreatePurchaseLog(ss) {
  var sh = ss.getSheetByName(PUR_LOG_TAB);
  if (!sh) {
    sh = ss.insertSheet(PUR_LOG_TAB);
    sh.appendRow(["Timestamp","EmployeeID","Name","Vendor","Amount","Payment","Category","Notes","ReceiptPhotoId","Mode"]);
    sh.getRange(1,1,1,10).setFontWeight("bold").setBackground("#0d1b2a").setFontColor("#fff");
    sh.setFrozenRows(1); sh.setColumnWidths(1,10,140);
    sh.getRange("E:E").setNumberFormat("$#,##0.00");
  }
  return sh;
}

function _getOrCreatePurchaseTestLog(ss) {
  var sh = ss.getSheetByName(PUR_TEST_TAB);
  if (!sh) {
    sh = ss.insertSheet(PUR_TEST_TAB);
    sh.appendRow(["Timestamp","EmployeeID","Name","Vendor","Amount","Payment","Category","Notes","ReceiptPhotoId","Mode"]);
    sh.getRange(1,1,1,10).setFontWeight("bold").setBackground("#4a0000").setFontColor("#FFD740");
    sh.setFrozenRows(1); sh.setColumnWidths(1,10,140);
    sh.getRange("E:E").setNumberFormat("$#,##0.00");
    sh.getRange(1,1).setNote("⚠️ TEST DATA — Safe to delete anytime. Run CLEAR_PURCHASE_TEST_LOGS() to wipe.");
  }
  return sh;
}

function _purHashPin(pin) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin);
  return bytes.map(function(b){ return ("0" + ((b & 0xFF).toString(16))).slice(-2); }).join("");
}

function _purSaveToDrive(name, tag, dataUrl) {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty("PURCHASE_PHOTO_FOLDER_ID") || props.getProperty("PHOTO_FOLDER_ID");
  var folder;
  if (folderId) { try { folder = DriveApp.getFolderById(folderId); } catch(e) { folder = null; } }
  if (!folder) {
    var iter = DriveApp.getFoldersByName("EDP Purchase Receipts");
    folder = iter.hasNext() ? iter.next() : DriveApp.createFolder("EDP Purchase Receipts");
    props.setProperty("PURCHASE_PHOTO_FOLDER_ID", folder.getId());
  }
  var m = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!m) throw new Error("Bad photo data URL");
  var bytes = Utilities.base64Decode(m[2]);
  var filename = name + "_" + tag + "_" + Date.now() + ".jpg";
  var blob = Utilities.newBlob(bytes, m[1], filename);
  return folder.createFile(blob).getId();
}

function _purPush(message, priority, sound) {
  if (!PUR_PUSH_TOKEN || !PUR_PUSH_USER) return;
  try {
    UrlFetchApp.fetch("https://api.pushover.net/1/messages.json", {
      method: "post",
      contentType: "application/x-www-form-urlencoded",
      payload: {
        token: PUR_PUSH_TOKEN, user: PUR_PUSH_USER,
        title: "EDP Purchase",
        message: message,
        priority: String(priority || 0),
        sound: sound || "cashregister",
      },
      muteHttpExceptions: true,
    });
  } catch(e) { Logger.log("Pushover error: " + e.message); }
}

function _purEmail(subject, body) {
  if (!PUR_ALERT_EMAIL || PUR_ALERT_EMAIL === "YOUR_EMAIL_HERE") return;
  try { MailApp.sendEmail(PUR_ALERT_EMAIL, subject, body); }
  catch(e) { Logger.log("Email error: " + e.message); }
}

function _purPushPurchase(name, vendor, amt, payment, category, notes, big) {
  var icon = big ? "🚨" : "💸";
  var msg = icon + " " + name + " logged $" + amt.toFixed(2) + " at " + vendor +
            "\n" + category + " · " + payment +
            (notes ? "\n📝 " + notes : "");
  _purPush(msg, big ? 1 : 0, big ? "siren" : "cashregister");
}

function _purEmailPurchase(name, vendor, amt, payment, category, notes, photoId) {
  var subject = "EDP Purchase — " + name + " — $" + amt.toFixed(2) + " — " + vendor;
  var body =
    name + " logged a purchase.\n" +
    "Time: " + new Date().toLocaleString() + "\n" +
    "Vendor: " + vendor + "\n" +
    "Amount: $" + amt.toFixed(2) + "\n" +
    "Payment: " + payment + "\n" +
    "Category: " + category + "\n" +
    "Notes: " + (notes || "(none)") + "\n";
  if (photoId) body += "Receipt photo (Drive): https://drive.google.com/file/d/" + photoId + "/view\n";
  _purEmail(subject, body);
}
