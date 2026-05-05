/*******************************************************
 * FILE: Kiosk_Main.gs  (EDP_Kiosk_V2)
 * EDP Kiosk Timeclock — v2.3.0
 *
 * SETUP STEPS (run in order, one time each):
 *   1. In Apps Script: Project Settings (gear icon) → Script properties.
 *      Add four properties:
 *        KIOSK_SHEET_ID     = (the spreadsheet id)
 *        KIOSK_PUSH_TOKEN   = (Pushover application token)
 *        KIOSK_PUSH_USER    = (Pushover user key)
 *        KIOSK_ALERT_EMAIL  = (where alert emails go)
 *   2. Run SETUP_KIOSK()
 *   3. Run SETUP_SCHEDULE_TRIGGER()
 *   4. Deploy → Manage Deployments → New Version
 *******************************************************/

var KIOSK_PROPS       = PropertiesService.getScriptProperties();
var KIOSK_SHEET_ID    = KIOSK_PROPS.getProperty("KIOSK_SHEET_ID")    || "";
var KIOSK_LOG_TAB     = "TIME_LOGS";
var KIOSK_TEST_TAB    = "TEST_LOGS";      // test punches go here — safe to delete anytime
var KIOSK_PUSH_TOKEN  = KIOSK_PROPS.getProperty("KIOSK_PUSH_TOKEN")  || "";
var KIOSK_PUSH_USER   = KIOSK_PROPS.getProperty("KIOSK_PUSH_USER")   || "";
var KIOSK_ALERT_EMAIL = KIOSK_PROPS.getProperty("KIOSK_ALERT_EMAIL") || "";

var KIOSK_EMPLOYEES = [
  { id:"JOE",      name:"Joe",      color:"#0D47A1", icon:"🛠️", weeklyHours:20, rate:23.00 },
  { id:"TAYLOR",   name:"Taylor",   color:"#4E342E", icon:"📋", weeklyHours:20, rate:20.00 },
  { id:"CLARENCE", name:"Clarence", color:"#1B5E20", icon:"🧹", weeklyHours:10, rate:12.00 },
  { id:"YVONNE",   name:"Yvonne",   color:"#4A148C", icon:"📞", weeklyHours:8,  rate:9.00  },
  // TEST employee — PIN 0000 — logs to TEST_LOGS only, never touches real payroll
  { id:"TEST",     name:"TEST",     color:"#B71C1C", icon:"🧪", weeklyHours:8,  rate:0.00  },
];

function _weekStart(d) {
  var t = new Date(d), day = t.getDay();
  var diff = (day >= 2) ? (day - 2) : (day + 5);
  t.setDate(t.getDate() - diff);
  t.setHours(10, 0, 0, 0);
  if (t > d) t.setDate(t.getDate() - 7);
  return t;
}

// ═══════════════════════════════════════════════════════
// doGet
// ═══════════════════════════════════════════════════════
function doGet() {
  var names = ["Kiosk","kiosk","Index","index","Kiosk.html"];
  for (var i = 0; i < names.length; i++) {
    try {
      return HtmlService.createHtmlOutputFromFile(names[i])
        .setTitle("EDP Timeclock")
        .addMetaTag("viewport","width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch(e) {}
  }
  return HtmlService.createHtmlOutput("<p style='color:red'>HTML file not found. Name it: Kiosk</p>").setTitle("EDP Setup");
}

// ═══════════════════════════════════════════════════════
// api_boot
// ═══════════════════════════════════════════════════════
function api_boot() {
  var ss = SpreadsheetApp.openById(KIOSK_SHEET_ID);
  var sh = _getOrCreateLog(ss);
  var now = new Date(), nowMs = now.getTime();
  var wkStart = _weekStart(now).getTime();

  var states = {};
  KIOSK_EMPLOYEES.forEach(function(e) {
    states[e.id] = {
      id:e.id, name:e.name, color:e.color, icon:e.icon, rate:e.rate,
      state:"OUT", clockInTime:null, lunchOutTime:null,
      workedMs:0, lunchMs:0, weekWorkedMs:0,
      targetMs: e.weeklyHours * 3600000,
    };
  });

  var lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    var rows = sh.getRange(2, 1, lastRow-1, 7).getValues();
    rows.forEach(function(row) {
      var ts=row[0], empId=row[1], action=row[3];
      if (!ts||!empId||!action) return;
      var emp = states[empId]; if (!emp) return;
      var t = new Date(ts).getTime();
      if (action==="CLOCK_IN") {
        emp.state="WORKING"; emp.clockInTime=t; emp.lunchOutTime=null; emp.workedMs=0; emp.lunchMs=0;
        if (t>=wkStart) emp._shiftStart=t;
      } else if (action==="LUNCH_OUT") {
        if (emp.clockInTime) { var seg=t-emp.clockInTime; emp.workedMs+=seg; if(emp.clockInTime>=wkStart) emp.weekWorkedMs+=seg; }
        emp.state="LUNCH"; emp.lunchOutTime=t; emp.clockInTime=null;
      } else if (action==="LUNCH_IN") {
        if (emp.lunchOutTime) emp.lunchMs+=t-emp.lunchOutTime;
        emp.state="WORKING"; emp.clockInTime=t; emp.lunchOutTime=null;
      } else if (action==="CLOCK_OUT") {
        if (emp.clockInTime) { var seg2=t-emp.clockInTime; emp.workedMs+=seg2; if(emp.clockInTime>=wkStart) emp.weekWorkedMs+=seg2; }
        emp.state="OUT"; emp.clockInTime=null; emp.lunchOutTime=null; emp.workedMs=0; emp.lunchMs=0;
      }
    });
  }

  Object.keys(states).forEach(function(k) {
    var emp = states[k];
    if (emp.state==="WORKING"&&emp.clockInTime) {
      emp.totalWorkedMs = emp.workedMs+(nowMs-emp.clockInTime);
      emp.remainMs = Math.max(0,emp.targetMs-emp.totalWorkedMs);
      emp.overMs   = Math.max(0,emp.totalWorkedMs-emp.targetMs);
      if (emp.clockInTime>=wkStart) emp.weekWorkedMs+=(nowMs-emp.clockInTime);
    }
    if (emp.state==="LUNCH"&&emp.lunchOutTime) emp.lunchNowMs=nowMs-emp.lunchOutTime;
    emp.weekHoursStr = _fmtHours(emp.weekWorkedMs);
  });

  var dow=now.getDay(), isOpenDay=(dow>=1&&dow<=6);
  var openT=new Date(now); openT.setHours(10,0,0,0);
  var closeT=new Date(now); closeT.setHours(17,0,0,0);
  var storeOpen=isOpenDay&&now>=openT&&now<closeT;
  var msUntil=storeOpen?(closeT-now):(isOpenDay&&now<openT?(openT-now):0);

  return {
    ok:true,
    employees: Object.keys(states).map(function(k){ return states[k]; }),
    serverTimeMs:nowMs, storeOpen:storeOpen, msUntilEvent:msUntil,
    isTrashDay:(dow===2||dow===5),
    messages:_getIncomingMessages(),
  };
}

// ═══════════════════════════════════════════════════════
// api_punch
// If empId === "TEST", logs to TEST_LOGS tab, no Pushover/email
// ═══════════════════════════════════════════════════════
function api_punch(data) {
  var empId  = data.empId || data.employeeId;
  var action = data.action;
  var pin    = String(data.pin || "");
  var photo  = data.photoB64 || data.photoDataUrl || "";
  var isTest = (empId === "TEST");

  if (!empId||!action) return {ok:false,msg:"Missing data."};

  var emp = KIOSK_EMPLOYEES.find(function(e){ return e.id===empId; });
  if (!emp) return {ok:false,msg:"Employee not found: "+empId};

  // Verify PIN
  var props  = PropertiesService.getScriptProperties();
  var stored = props.getProperty("PIN_"+empId);
  if (!stored) return {ok:false,msg:"PIN not set. Run SETUP_KIOSK."};
  if (_hashPin(pin)!==stored) return {ok:false,msg:"Wrong PIN. Try again."};

  // Save face photo
  var facePhotoId = "";
  if (photo&&photo.length>200) {
    try { facePhotoId=_saveToDrive(emp.name+(isTest?"_TEST":""),"FACE_"+action,photo); }
    catch(e) { Logger.log("Face photo error: "+e.message); }
  }

  // Save shoes photo (clock-in only)
  var shoesPhotoId = "";
  var shoesPhoto = data.registerB64||"";
  if (action==="CLOCK_IN"&&shoesPhoto&&shoesPhoto.length>200) {
    try { shoesPhotoId=_saveToDrive(emp.name+(isTest?"_TEST":""),"SHOES_CLOCK_IN",shoesPhoto); }
    catch(e) { Logger.log("Shoes photo error: "+e.message); }
  }

  // Log to correct sheet tab
  var ss  = SpreadsheetApp.openById(KIOSK_SHEET_ID);
  var sh  = isTest ? _getOrCreateTestLog(ss) : _getOrCreateLog(ss);
  var now = new Date();
  sh.appendRow([now, empId, emp.name+(isTest?" [TEST]":""), action, facePhotoId, data.notes||"", shoesPhotoId]);

  var summary = {};
  if (action==="CLOCK_OUT"&&!isTest) {
    summary = _buildShiftSummary(_getOrCreateLog(ss), empId, now);
    if (summary.todayMs!=null) summary.todayPay="$"+(summary.todayMs/3600000*emp.rate).toFixed(2);
    if (summary.weekMs !=null) summary.weekPay ="$"+(summary.weekMs /3600000*emp.rate).toFixed(2);
  }

  // Only send Pushover/email for real employees
  if (!isTest) {
    _pushPunch(emp.name, action, now, summary);
    _emailPunch(emp.name, action, now, summary);
  }

  return {ok:true, msg:emp.name+" — "+action.replace(/_/g," "), summary:summary, isTest:isTest};
}

// ═══════════════════════════════════════════════════════
// api_notifyManager
// ═══════════════════════════════════════════════════════
function api_notifyManager(data) {
  var who=data.empName||"Someone at the kiosk";
  var msg="🚨 MANAGER NEEDED — "+who+" pressed alert at "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  _push(msg,1,"siren"); _email("🚨 EDP Kiosk Alert",msg);
  return {ok:true};
}

// ═══════════════════════════════════════════════════════
// api_sendMessage
// ═══════════════════════════════════════════════════════
function api_sendMessage(data) {
  var empId=data.empId||data.employeeId||"KIOSK";
  var text =data.text||"(no message)";
  var emp  =KIOSK_EMPLOYEES.find(function(e){ return e.id===empId; });
  var name =emp?emp.name:empId;
  var ss   =SpreadsheetApp.openById(KIOSK_SHEET_ID);
  _getOrCreateMsgTab(ss).appendRow([new Date(),empId,name,"TO_TAYLOR",text,false]);
  _push("💬 Message from "+name+": "+text,0,"pushover");
  _email("💬 EDP Message from "+name,"Received at "+new Date().toLocaleString()+"\n\n"+text);
  return {ok:true};
}

function api_markMessagesRead(data) { return {ok:true}; }

// ═══════════════════════════════════════════════════════
// api_checklist
// ═══════════════════════════════════════════════════════
function api_checklist(data) {
  var empId  = data.empId||data.employeeId||"";
  var emp    = KIOSK_EMPLOYEES.find(function(e){ return e.id===empId; });
  var name   = emp?emp.name:empId;
  var status = data.status||"DONE";
  var key    = data.itemKey||data.item||"";
  var photo  = data.photoB64||data.photoDataUrl||"";
  var isTest = (empId==="TEST");

  var photoId="";
  if (photo&&photo.length>200) {
    try { photoId=_saveToDrive(name+(isTest?"_TEST":""),"CHK_"+key,photo); }
    catch(e) { Logger.log("Checklist photo error: "+e.message); }
  }

  var ss=SpreadsheetApp.openById(KIOSK_SHEET_ID);
  var sh=isTest?_getOrCreateTestLog(ss):_getOrCreateLog(ss);
  sh.appendRow([new Date(),empId,name+(isTest?" [TEST]":""),"CHECKLIST_"+key+"_"+status,photoId,data.note||"",""]);

  if (status==="PROBLEM"&&!isTest) {
    _push("⚠️ "+name+" PROBLEM: "+key+" — "+(data.note||"no note"),1,"siren");
    _email("⚠️ EDP Checklist Problem — "+name,name+" reported problem: "+key+"\nNote: "+(data.note||""));
  }
  return {ok:true};
}

// ═══════════════════════════════════════════════════════
// SCHEDULE ALERTS — fires every 1 minute via trigger
// Run SETUP_SCHEDULE_TRIGGER() once to install
// ═══════════════════════════════════════════════════════
function checkScheduleAlerts() {
  var ss=SpreadsheetApp.openById(KIOSK_SHEET_ID);
  var sh=ss.getSheetByName("SCHEDULE");
  if (!sh||sh.getLastRow()<2) return;
  var now=new Date();
  var days=["SUN","MON","TUE","WED","THU","FRI","SAT"];
  var today=days[now.getDay()];
  var nowMin=now.getHours()*60+now.getMinutes();
  var rows=sh.getRange(2,1,sh.getLastRow()-1,6).getValues();
  rows.forEach(function(row) {
    var empId=row[0],name=row[1],day=String(row[2]).toUpperCase();
    var ciRaw=row[3],coRaw=row[4],active=row[5];
    if (!active||day!==today) return;
    [[ciRaw,"CLOCK IN"],[coRaw,"CLOCK OUT"]].forEach(function(pair) {
      var raw=pair[0],label=pair[1]; if (!raw) return;
      var tMin;
      if (raw instanceof Date) { tMin=raw.getHours()*60+raw.getMinutes(); }
      else { var parts=String(raw).split(":"); tMin=parseInt(parts[0])*60+parseInt(parts[1]||0); }
      var diff=tMin-nowMin;
      if      (diff===5) _push("⏰ "+name+" — "+label+" in 5 minutes",0,"pushover");
      else if (diff===1) _push("⚡ "+name+" — "+label+" in 1 MINUTE!",1,"siren");
      else if (diff===0) _push("🕐 "+name+" — "+label+" TIME NOW",1,"siren");
    });
  });
}

function SETUP_SCHEDULE_TRIGGER() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction()==="checkScheduleAlerts") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("checkScheduleAlerts").timeBased().everyMinutes(1).create();
  Logger.log("✅ Schedule trigger installed.");
}

// ═══════════════════════════════════════════════════════
// SETUP — run once
// ═══════════════════════════════════════════════════════
function SETUP_KIOSK() {
  var props=PropertiesService.getScriptProperties();
  props.setProperty("PIN_JOE",      _hashPin("9544"));
  props.setProperty("PIN_TAYLOR",   _hashPin("9911"));
  props.setProperty("PIN_CLARENCE", _hashPin("1200"));
  props.setProperty("PIN_YVONNE",   _hashPin("7864"));
  props.setProperty("PIN_TEST",     _hashPin("0000")); // test PIN — always 0000
  var ss=SpreadsheetApp.openById(KIOSK_SHEET_ID);
  _getOrCreateLog(ss); _getOrCreateTestLog(ss); _getOrCreateMsgTab(ss); _getOrCreateSchedule(ss);
  Logger.log("✅ KIOSK SETUP COMPLETE");
  Logger.log("Real PINs: Joe=9544  Taylor=9911  Clarence=1200  Yvonne=7864");
  Logger.log("Test PIN:  TEST=0000  (logs to TEST_LOGS only)");
  Logger.log("NEXT: Run SETUP_SCHEDULE_TRIGGER()");
}

function CHANGE_PIN(empId,newPin) {
  PropertiesService.getScriptProperties().setProperty("PIN_"+empId.toUpperCase(),_hashPin(String(newPin)));
  Logger.log("PIN updated: "+empId);
}

// Delete all test data — safe to run anytime
function CLEAR_TEST_LOGS() {
  var ss=SpreadsheetApp.openById(KIOSK_SHEET_ID);
  var sh=ss.getSheetByName(KIOSK_TEST_TAB);
  if (!sh) { Logger.log("No TEST_LOGS tab found."); return; }
  if (sh.getLastRow()>1) sh.deleteRows(2,sh.getLastRow()-1);
  Logger.log("✅ TEST_LOGS cleared.");
}

function TEST_PUSHOVER() {
  _push("✅ EDP Kiosk Pushover test — working!",0,"cashregister");
  Logger.log("Pushover test sent.");
}

// ═══════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════
function _getOrCreateLog(ss) {
  var sh=ss.getSheetByName(KIOSK_LOG_TAB);
  if (!sh) {
    sh=ss.insertSheet(KIOSK_LOG_TAB);
    sh.appendRow(["Timestamp","EmployeeID","Name","Action","FacePhotoId","Notes","ShoesPhotoId"]);
    sh.getRange(1,1,1,7).setFontWeight("bold").setBackground("#0d1b2a").setFontColor("#fff");
    sh.setFrozenRows(1); sh.setColumnWidths(1,7,160);
  }
  return sh;
}

function _getOrCreateTestLog(ss) {
  var sh=ss.getSheetByName(KIOSK_TEST_TAB);
  if (!sh) {
    sh=ss.insertSheet(KIOSK_TEST_TAB);
    sh.appendRow(["Timestamp","EmployeeID","Name","Action","FacePhotoId","Notes","ShoesPhotoId"]);
    sh.getRange(1,1,1,7).setFontWeight("bold").setBackground("#4a0000").setFontColor("#FFD740");
    sh.setFrozenRows(1); sh.setColumnWidths(1,7,160);
    sh.getRange(1,1).setValue("⚠️ TEST DATA — Safe to delete anytime. Run CLEAR_TEST_LOGS() to wipe.");
  }
  return sh;
}

function _getOrCreateMsgTab(ss) {
  var sh=ss.getSheetByName("KIOSK_MESSAGES");
  if (!sh) {
    sh=ss.insertSheet("KIOSK_MESSAGES");
    sh.appendRow(["Timestamp","EmployeeID","Name","Direction","Message","Read"]);
    sh.getRange(1,1,1,6).setFontWeight("bold").setBackground("#0d1b2a").setFontColor("#fff");
    sh.setFrozenRows(1);
  }
  return sh;
}

function _getOrCreateSchedule(ss) {
  var sh=ss.getSheetByName("SCHEDULE");
  if (!sh) {
    sh=ss.insertSheet("SCHEDULE");
    sh.appendRow(["EmployeeID","Name","DayOfWeek","ClockInTime","ClockOutTime","Active"]);
    sh.getRange(1,1,1,6).setFontWeight("bold").setBackground("#0d1b2a").setFontColor("#fff");
    sh.setFrozenRows(1);
    var days=["MON","TUE","WED","THU","FRI","SAT"];
    KIOSK_EMPLOYEES.forEach(function(e){
      if (e.id==="TEST") return;
      days.forEach(function(d){ sh.appendRow([e.id,e.name,d,"10:00","17:00",true]); });
    });
    sh.autoResizeColumns(1,6);
  }
  return sh;
}

function _getIncomingMessages() {
  try {
    var ss=SpreadsheetApp.openById(KIOSK_SHEET_ID);
    var sh=ss.getSheetByName("KIOSK_MESSAGES");
    if (!sh||sh.getLastRow()<2) return [];
    var rows=sh.getRange(2,1,sh.getLastRow()-1,6).getValues();
    return rows.filter(function(r){ return r[3]==="FROM_TAYLOR"&&!r[5]; })
               .map(function(r){ return {empId:r[1],text:r[4],ts:r[0]}; });
  } catch(e) { return []; }
}

function _buildShiftSummary(sh,empId,now) {
  var todayStart=new Date(now); todayStart.setHours(0,0,0,0);
  var wkStart=_weekStart(now);
  var todayMs=0,weekMs=0,lastCI=null;
  if (sh.getLastRow()<2) return {};
  var rows=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  rows.forEach(function(row){
    var ts=row[0],id=row[1],action=row[3];
    if (!ts||!id||!action||id!==empId) return;
    var t=new Date(ts).getTime();
    if      (action==="CLOCK_IN")   { lastCI=t; }
    else if (action==="LUNCH_OUT")  { if(lastCI){var s=t-lastCI;if(lastCI>=todayStart.getTime())todayMs+=s;if(lastCI>=wkStart.getTime())weekMs+=s;}lastCI=null; }
    else if (action==="LUNCH_IN")   { lastCI=t; }
    else if (action==="CLOCK_OUT")  { if(lastCI){var s2=t-lastCI;if(lastCI>=todayStart.getTime())todayMs+=s2;if(lastCI>=wkStart.getTime())weekMs+=s2;}lastCI=null; }
  });
  return {todayHrs:_fmtHours(todayMs),weekHrs:_fmtHours(weekMs),todayMs:todayMs,weekMs:weekMs};
}

function _fmtHours(ms) {
  var totalMin=Math.round(ms/60000),h=Math.floor(totalMin/60),m=totalMin%60;
  if (h===0) return m+"m"; return h+"h "+(m>0?m+"m":"");
}

function _hashPin(pin) {
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,pin);
  return bytes.map(function(b){ return ("0"+((b&0xFF).toString(16))).slice(-2); }).join("");
}

function _saveToDrive(name,tag,dataUrl) {
  var props=PropertiesService.getScriptProperties();
  var folderId=props.getProperty("PHOTO_FOLDER_ID");
  var folder;
  if (folderId) { try{folder=DriveApp.getFolderById(folderId);}catch(e){folder=null;} }
  if (!folder) {
    var iter=DriveApp.getFoldersByName("EDP Kiosk Photos");
    folder=iter.hasNext()?iter.next():DriveApp.createFolder("EDP Kiosk Photos");
    props.setProperty("PHOTO_FOLDER_ID",folder.getId());
  }
  var m=dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!m) throw new Error("Bad photo data URL");
  var bytes=Utilities.base64Decode(m[2]);
  var filename=name+"_"+tag+"_"+Date.now()+".jpg";
  var blob=Utilities.newBlob(bytes,m[1],filename);
  return folder.createFile(blob).getId();
}

function _push(message,priority,sound) {
  try {
    UrlFetchApp.fetch("https://api.pushover.net/1/messages.json",{
      method:"post",contentType:"application/x-www-form-urlencoded",
      payload:{token:KIOSK_PUSH_TOKEN,user:KIOSK_PUSH_USER,title:"EDP Timeclock",
               message:message,priority:String(priority||0),sound:sound||"pushover"},
      muteHttpExceptions:true,
    });
  } catch(e) { Logger.log("Pushover error: "+e.message); }
}

function _email(subject,body) {
  if (!KIOSK_ALERT_EMAIL||KIOSK_ALERT_EMAIL==="YOUR_EMAIL_HERE") return;
  try { MailApp.sendEmail(KIOSK_ALERT_EMAIL,subject,body); }
  catch(e) { Logger.log("Email error: "+e.message); }
}

function _pushPunch(name,action,ts,summary) {
  var icons={CLOCK_IN:"✅",CLOCK_OUT:"🏁",LUNCH_OUT:"🍽️",LUNCH_IN:"↩️"};
  var icon=icons[action]||"⏱";
  var time=ts.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  var msg=icon+" "+name+" — "+action.replace(/_/g," ")+" at "+time;
  if (action==="CLOCK_OUT"&&summary&&summary.todayHrs) {
    msg+="\n⏱ Today: "+summary.todayHrs+(summary.todayPay?" ("+summary.todayPay+")":"");
    msg+="  |  📅 Week: "+summary.weekHrs+(summary.weekPay?" ("+summary.weekPay+")":"");
  }
  _push(msg,0,action==="CLOCK_IN"?"cashregister":"pushover");
}

function _emailPunch(name,action,ts,summary) {
  var subject="EDP Kiosk — "+name+" "+action.replace(/_/g," ");
  var body=name+" performed: "+action.replace(/_/g," ")+"\nTime: "+ts.toLocaleString()+"\n";
  if (summary&&summary.todayHrs) {
    body+="\nToday: "+summary.todayHrs+(summary.todayPay?" ("+summary.todayPay+")":"");
    body+="\nThis week: "+summary.weekHrs+(summary.weekPay?" ("+summary.weekPay+")":"");
  }
  _email(subject,body);
}