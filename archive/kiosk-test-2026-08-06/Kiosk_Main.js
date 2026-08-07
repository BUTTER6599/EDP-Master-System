/*******************************************************
 * FILE: Kiosk_Main.gs  (EDP_Kiosk_TEST)  ** TEST ONLY **
 * Derived from LIVE EDP_Kiosk_V2 @23 on 2026-08-06.
 * Isolated: TEST spreadsheet, TEST photo folder,
 * notifications disabled, auto clock-out disabled.
 * Original header follows.
 * FILE: Kiosk_Main.gs  (EDP_Kiosk_V2)
 * EDP Kiosk Timeclock — v2.6.0
 *
 * AUTO-SETUP: PINs are set automatically on first page
 * load. You never need to run SETUP_KIOSK manually.
 *
 * CLOSEOUT SYSTEM (fires via 1-min trigger):
 *   4:55 PM  Heads-up Pushover
 *   5:00 PM  Pushover listing who is still in
 *   5:05 PM  Pushover + email manager alert
 *   5:15 PM  AUTO CLOCK-OUT for anyone still clocked in
 *******************************************************/

var KIOSK_SHEET_ID    = "1tZNShhyJ4mRRSO4xfUGrlzTYo_YWb3d3opagU_X315M";   // TEST DATA ONLY
var KIOSK_LOG_TAB     = "TIME_LOGS";
var KIOSK_PUSH_TOKEN  = "";   // TEST: disabled
var KIOSK_PUSH_USER   = "";   // TEST: disabled
var KIOSK_ALERT_EMAIL = "";   // TEST: disabled

// ═══════════════════════════════════════════════════════
//  TEST ENVIRONMENT ISOLATION — EO-016
//  This project must NEVER touch production resources.
// ═══════════════════════════════════════════════════════
var ENVIRONMENT            = "TEST";
var TEST_PHOTO_FOLDER_ID   = "1tVqYd55wSvd0_9-Pe-R96YeI94kd9SKB";
var NOTIFICATIONS_ENABLED  = false;
var AUTO_CLOCKOUT_ENABLED  = false;
var LIVE_SHEET_ID_BLOCKLIST = ["117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI","1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo"];

function _assertTestEnv_() {
  if (ENVIRONMENT !== "TEST") throw new Error("TEST GUARD: ENVIRONMENT is not TEST.");
  if (LIVE_SHEET_ID_BLOCKLIST.indexOf(KIOSK_SHEET_ID) !== -1)
    throw new Error("TEST GUARD: KIOSK_SHEET_ID points at a PRODUCTION spreadsheet. Refusing to run.");
  return true;
}

// One-click TEST Script Property setup. Run from the TEST editor only.
function SETUP_TEST_PROPERTIES() {
  _assertTestEnv_();
  var p = PropertiesService.getScriptProperties();
  p.setProperty("ENVIRONMENT", "TEST");
  p.setProperty("SPREADSHEET_ID", KIOSK_SHEET_ID);
  p.setProperty("NOTIFICATIONS_ENABLED", "false");
  p.setProperty("AUTO_CLOCKOUT_ENABLED", "false");
  p.setProperty("PHOTO_FOLDER_ID", TEST_PHOTO_FOLDER_ID);
  p.deleteProperty("LIVE_SPREADSHEET_ID");
  Logger.log("TEST properties set. LIVE_SPREADSHEET_ID explicitly absent.");
}

var KIOSK_EMPLOYEES = [
  { id:"JOE",      name:"Joe",      color:"#0D47A1", weeklyHours:20, rate:23.00,  email:"" },
  { id:"CLARENCE", name:"Clarence", color:"#1B5E20", weeklyHours:10, rate:12.00,  email:"" },
  { id:"KENNETH",  name:"Kenneth",  color:"#00695C", weeklyHours:20, rate:13.00,  email:"" },
  { id:"YVONNE",   name:"Yvonne",   color:"#4A148C", weeklyHours:8,  rate:7.25,   email:"" },
  { id:"TAYLOR",   name:"Taylor",   color:"#E65100", weeklyHours:20, rate:20.00,  email:"" },
];

var DEFAULT_PINS = {
  JOE:"9544", TAYLOR:"9911", CLARENCE:"1200", YVONNE:"7864", KENNETH:"1047"
};

function _weekStart(d) {
  var t = new Date(d), day = t.getDay();
  var diff = (day >= 2) ? (day - 2) : (day + 5);
  t.setDate(t.getDate() - diff);
  t.setHours(10, 0, 0, 0);
  if (t > d) t.setDate(t.getDate() - 7);
  return t;
}

// ═══════════════════════════════════════════════════════
// _autoSetupPins — called from api_boot every load.
// Only writes a PIN if it isn't already stored.
// Safe to call repeatedly — never overwrites existing PINs.
// ═══════════════════════════════════════════════════════
function _autoSetupPins() {
  var props = PropertiesService.getScriptProperties();
  var changed = false;
  Object.keys(DEFAULT_PINS).forEach(function(id) {
    if (!props.getProperty("PIN_"+id)) {
      props.setProperty("PIN_"+id, _hashPin(DEFAULT_PINS[id]));
      changed = true;
    }
  });
  if (changed) Logger.log("Auto-setup: default PINs written.");
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
  return HtmlService.createHtmlOutput("<p style='color:red'>HTML file not found. Name it: Kiosk</p>");
}

// ═══════════════════════════════════════════════════════
// api_boot — auto-sets PINs, returns employee states
// ═══════════════════════════════════════════════════════
function api_boot() {
  _autoSetupPins(); // ← ensures PINs always exist

  var ss  = SpreadsheetApp.openById(_assertTestEnv_()&&KIOSK_SHEET_ID);
  var sh  = _getOrCreateLog(ss);
  var now = new Date(), nowMs = now.getTime();
  var wkStart = _weekStart(now).getTime();

  var states = {};
  var todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  var todayStartMs = todayStart.getTime();
  KIOSK_EMPLOYEES.forEach(function(e) {
    states[e.id] = {
      id:e.id, name:e.name, color:e.color, rate:e.rate,
      state:"OUT", clockInTime:null, lunchOutTime:null,
      workedMs:0, lunchMs:0, weekWorkedMs:0, todayWorkedMs:0,
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
      if (action==="CLOCK_IN"||action==="AUTO_CLOCKIN") {
        emp.state="WORKING"; emp.clockInTime=t; emp.lunchOutTime=null;
        emp.workedMs=0; emp.lunchMs=0;
      } else if (action==="LUNCH_OUT") {
        if (emp.clockInTime) {
          var s=t-emp.clockInTime; emp.workedMs+=s;
          if(emp.clockInTime>=wkStart)   emp.weekWorkedMs+=s;
          if(emp.clockInTime>=todayStartMs) emp.todayWorkedMs+=s;
        }
        emp.state="LUNCH"; emp.lunchOutTime=t; emp.clockInTime=null;
      } else if (action==="LUNCH_IN") {
        if (emp.lunchOutTime) emp.lunchMs+=t-emp.lunchOutTime;
        emp.state="WORKING"; emp.clockInTime=t; emp.lunchOutTime=null;
      } else if (action==="CLOCK_OUT"||action==="AUTO_CLOCKOUT") {
        if (emp.clockInTime) {
          var s2=t-emp.clockInTime; emp.workedMs+=s2;
          if(emp.clockInTime>=wkStart)   emp.weekWorkedMs+=s2;
          if(emp.clockInTime>=todayStartMs) emp.todayWorkedMs+=s2;
        }
        emp.state="OUT"; emp.clockInTime=null; emp.lunchOutTime=null;
        emp.workedMs=0; emp.lunchMs=0;
      }
    });
  }

  Object.keys(states).forEach(function(k) {
    var emp = states[k];
    if (emp.state==="WORKING"&&emp.clockInTime) {
      emp.totalWorkedMs = emp.workedMs+(nowMs-emp.clockInTime);
      emp.remainMs = Math.max(0,emp.targetMs-emp.totalWorkedMs);
      emp.overMs   = Math.max(0,emp.totalWorkedMs-emp.targetMs);
      if (emp.clockInTime>=wkStart)      emp.weekWorkedMs +=(nowMs-emp.clockInTime);
      if (emp.clockInTime>=todayStartMs) emp.todayWorkedMs+=(nowMs-emp.clockInTime);
    }
    if (emp.state==="LUNCH"&&emp.lunchOutTime) emp.lunchNowMs=nowMs-emp.lunchOutTime;
    var r = emp.rate || 0;
    emp.weekHoursStr  = _fmtHours(emp.weekWorkedMs);
    emp.weekPay       = (r>0&&emp.weekWorkedMs>0) ? "$"+(emp.weekWorkedMs/3600000*r).toFixed(2) : "";
    emp.todayHoursStr = _fmtHours(emp.todayWorkedMs);
    emp.todayPay      = (r>0&&emp.todayWorkedMs>0) ? "$"+(emp.todayWorkedMs/3600000*r).toFixed(2) : "";
    // Face photo thumbnail for tile avatar
    var faceId = PropertiesService.getScriptProperties().getProperty("FACE_REF_"+k);
    emp.photoUrl = faceId ? "https://drive.google.com/thumbnail?id="+faceId+"&sz=w100" : null;
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
    messages:_getIncomingMessages(),
  };
}

// ═══════════════════════════════════════════════════════
// api_punch
// ═══════════════════════════════════════════════════════
function api_punch(data) {
  _autoSetupPins(); // safety net

  var empId  = data.empId || data.employeeId;
  var action = data.action;
  var pin    = String(data.pin || "");
  var photo  = data.photoB64 || data.photoDataUrl || "";

  if (!empId||!action) return {ok:false,msg:"Missing data."};

  var emp = null;
  for(var i=0;i<KIOSK_EMPLOYEES.length;i++){
    if(KIOSK_EMPLOYEES[i].id===empId){ emp=KIOSK_EMPLOYEES[i]; break; }
  }
  if (!emp) return {ok:false,msg:"Employee not found: "+empId};

  var props  = PropertiesService.getScriptProperties();
  var stored = props.getProperty("PIN_"+empId);
  if (!stored) return {ok:false,msg:"PIN error — please reload the kiosk page."};
  if (_hashPin(pin)!==stored) return {ok:false,msg:"Wrong PIN. Try again."};

  var facePhotoId = "";
  if (photo&&photo.length>200) {
    try { facePhotoId=_saveToDrive(emp.name,"FACE_"+action,photo); }
    catch(e) { Logger.log("Face photo error: "+e.message); }
  }

  var shoesPhotoId = "";
  var shoesPhoto = data.registerB64||"";
  if (action==="CLOCK_IN"&&shoesPhoto&&shoesPhoto.length>200) {
    try { shoesPhotoId=_saveToDrive(emp.name,"SHOES_CLOCK_IN",shoesPhoto); }
    catch(e) { Logger.log("Shoes photo error: "+e.message); }
  }

  var ss  = SpreadsheetApp.openById(_assertTestEnv_()&&KIOSK_SHEET_ID);
  var sh  = _getOrCreateLog(ss);
  var now = new Date();
  sh.appendRow([now,empId,emp.name,action,facePhotoId,data.notes||"",shoesPhotoId]);

  var summary = {};
  if (action==="CLOCK_OUT") {
    summary = _buildShiftSummary(sh, empId, now);
    if (summary.todayMs!=null) summary.todayPay="$"+(summary.todayMs/3600000*emp.rate).toFixed(2);
    if (summary.weekMs !=null) summary.weekPay ="$"+(summary.weekMs /3600000*emp.rate).toFixed(2);
  }

  _pushPunch(emp.name, action, now, summary);
  _emailPunch(emp.name, action, now, summary, empId);

  if (action==="CLOCK_IN"&&photo&&photo.length>200) {
    try { _checkFaceMatch(emp.name, empId, photo); } catch(e) {}
  }

  return {ok:true, msg:emp.name+" — "+action.replace(/_/g," "), summary:summary};
}

// ═══════════════════════════════════════════════════════
// api_notifyManager
// ═══════════════════════════════════════════════════════
function api_notifyManager(data) {
  var who=data.empName||"Someone at the kiosk";
  var msg="🚨 MANAGER NEEDED — "+who+" at "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  _push(msg,1,"siren"); _email("🚨 EDP Kiosk Alert",msg);
  return {ok:true};
}

// ═══════════════════════════════════════════════════════
// api_sendMessage
// ═══════════════════════════════════════════════════════
function api_sendMessage(data) {
  var empId=data.empId||"KIOSK";
  var text=data.text||"(no message)";
  var emp=null;
  for(var i=0;i<KIOSK_EMPLOYEES.length;i++){if(KIOSK_EMPLOYEES[i].id===empId){emp=KIOSK_EMPLOYEES[i];break;}}
  var name=emp?emp.name:empId;
  var ss=SpreadsheetApp.openById(_assertTestEnv_()&&KIOSK_SHEET_ID);
  _getOrCreateMsgTab(ss).appendRow([new Date(),empId,name,"TO_TAYLOR",text,false]);
  _push("💬 Message from "+name+": "+text,0,"pushover");
  _email("💬 EDP Message from "+name,"At "+new Date().toLocaleString()+"\n\n"+text);
  return {ok:true};
}

function api_markMessagesRead(data) { return {ok:true}; }

// ═══════════════════════════════════════════════════════
// api_checklist
// ═══════════════════════════════════════════════════════
function api_checklist(data) {
  var empId=data.empId||"";
  var emp=null;
  for(var i=0;i<KIOSK_EMPLOYEES.length;i++){if(KIOSK_EMPLOYEES[i].id===empId){emp=KIOSK_EMPLOYEES[i];break;}}
  var name=emp?emp.name:empId;
  var status=data.status||"DONE";
  var key=data.itemKey||"";
  var photo=data.photoB64||"";
  var photoId="";
  if (photo&&photo.length>200){
    try{photoId=_saveToDrive(name,"CHK_"+key,photo);}catch(e){}
  }
  var ss=SpreadsheetApp.openById(_assertTestEnv_()&&KIOSK_SHEET_ID);
  _getOrCreateLog(ss).appendRow([new Date(),empId,name,"CHECKLIST_"+key+"_"+status,photoId,data.note||"",""]);
  if (status==="PROBLEM"){
    _push("⚠️ "+name+" PROBLEM: "+key+" — "+(data.note||"no note"),1,"siren");
    _email("⚠️ EDP Checklist Problem",name+" reported: "+key);
  }
  return {ok:true};
}

// ═══════════════════════════════════════════════════════
// CLOSEOUT REMINDERS + AUTO CLOCK-OUT
// ═══════════════════════════════════════════════════════
function checkScheduleAlerts() {
  var ss=SpreadsheetApp.openById(_assertTestEnv_()&&KIOSK_SHEET_ID);
  var now=new Date();
  var days=["SUN","MON","TUE","WED","THU","FRI","SAT"];
  var today=days[now.getDay()];
  var nowMin=now.getHours()*60+now.getMinutes();

  if(today!=="SUN"){
    if(nowMin===16*60+55)
      _push("⏰ 5 minutes to close. Wrap up and prepare to clock out.",0,"pushover");

    if(nowMin===17*60){
      var s=_getStillClockedIn(ss);
      _push(s.length===0?"✅ 5:00 PM — Everyone out. Great close!":
        "🔴 5:00 PM — STILL IN: "+s.join(", ")+". Clock out NOW.",s.length?1:0,s.length?"siren":"pushover");
    }

    if(nowMin===17*60+5){
      var s2=_getStillClockedIn(ss);
      if(s2.length){
        _push("🚨 5:05 PM — "+s2.join(", ")+" still in 5 min past close. Manager approval needed.",1,"siren");
        _email("🚨 EDP After-Hours 5:05 PM",s2.join(", ")+" still clocked in at 5:05 PM on "+now.toLocaleDateString());
      } else {
        _push("✅ 5:05 PM — All clear. Everyone is out.",0,"pushover");
      }
    }

    if(nowMin===17*60+15) _autoClockOut(ss,now);
  }

  var sh=ss.getSheetByName("SCHEDULE");
  if(!sh||sh.getLastRow()<2) return;
  var rows=sh.getRange(2,1,sh.getLastRow()-1,6).getValues();
  rows.forEach(function(row){
    var empId=row[0],name=row[1],day=String(row[2]).toUpperCase();
    var ciRaw=row[3],coRaw=row[4],active=row[5];
    if(!active||day!==today) return;
    [[ciRaw,"CLOCK IN"],[coRaw,"CLOCK OUT"]].forEach(function(pair){
      var raw=pair[0],label=pair[1]; if(!raw) return;
      var tMin;
      if(raw instanceof Date){tMin=raw.getHours()*60+raw.getMinutes();}
      else{var p=String(raw).split(":");tMin=parseInt(p[0])*60+parseInt(p[1]||0);}
      var diff=tMin-nowMin;
      if(diff===5)_push("⏰ "+name+" — "+label+" in 5 minutes",0,"pushover");
      else if(diff===1)_push("⚡ "+name+" — "+label+" in 1 MINUTE!",1,"siren");
      else if(diff===0)_push("🕐 "+name+" — "+label+" TIME NOW",1,"siren");
    });
  });
}

function _autoClockOut(ss,now){
  var stillIn=_getStillClockedIn(ss);
  if(!stillIn.length) return;
  var sh=_getOrCreateLog(ss);
  stillIn.forEach(function(name){
    var emp=null;
    for(var i=0;i<KIOSK_EMPLOYEES.length;i++){if(KIOSK_EMPLOYEES[i].name===name){emp=KIOSK_EMPLOYEES[i];break;}}
    if(!emp) return;
    sh.appendRow([now,emp.id,emp.name,"AUTO_CLOCKOUT","","AUTO: System clock-out at 5:15 PM",""]);
  });
  _push("🤖 AUTO CLOCK-OUT — "+stillIn.join(", ")+" clocked out at 5:15 PM. Review TIME_LOGS if needed.",1,"siren");
  _email("🤖 EDP Auto Clock-Out 5:15 PM",stillIn.join(", ")+" auto clocked out on "+now.toLocaleDateString());
}

function _getStillClockedIn(ss){
  var sh=_getOrCreateLog(ss);
  if(sh.getLastRow()<2) return [];
  var rows=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  var states={};
  rows.forEach(function(row){
    var id=row[1],action=row[3]; if(!id||!action) return;
    if(action==="CLOCK_IN"||action==="LUNCH_IN") states[id]="IN";
    if(action==="CLOCK_OUT"||action==="LUNCH_OUT"||action==="AUTO_CLOCKOUT") states[id]="OUT";
  });
  var out=[];
  Object.keys(states).forEach(function(id){
    if(states[id]==="IN"){
      var emp=null;
      for(var i=0;i<KIOSK_EMPLOYEES.length;i++){if(KIOSK_EMPLOYEES[i].id===id){emp=KIOSK_EMPLOYEES[i];break;}}
      out.push(emp?emp.name:id);
    }
  });
  return out;
}

// ═══════════════════════════════════════════════════════
// BUDDY PUNCH — Gemini Vision face match
// ═══════════════════════════════════════════════════════
function _checkFaceMatch(empName,empId,clockInPhotoB64){
  var props=PropertiesService.getScriptProperties();
  var refId=props.getProperty("FACE_REF_"+empId);
  if(!refId) return; // no reference set yet — skip silently
  var refB64="";
  try{refB64=Utilities.base64Encode(DriveApp.getFileById(refId).getBlob().getBytes());}
  catch(e){return;}
  var clockInB64=clockInPhotoB64;
  var m=clockInPhotoB64.match(/^data:(.+);base64,(.+)$/);
  if(m) clockInB64=m[2];
  var geminiKey=props.getProperty("GEMINI_API_KEY");
  if(!geminiKey) return;
  var url="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+geminiKey;
  var payload={contents:[{parts:[
    {text:"Compare these two photos. Photo 1 is the REFERENCE of "+empName+". Photo 2 is the new clock-in. Same person? Answer ONLY: YES NO or UNCLEAR."},
    {inline_data:{mime_type:"image/jpeg",data:refB64}},
    {inline_data:{mime_type:"image/jpeg",data:clockInB64}}
  ]}],generationConfig:{temperature:0,maxOutputTokens:10}};
  try{
    var res=UrlFetchApp.fetch(url,{method:"post",contentType:"application/json",payload:JSON.stringify(payload),muteHttpExceptions:true});
    var json=JSON.parse(res.getContentText());
    var parts=json.candidates&&json.candidates[0]&&json.candidates[0].content&&json.candidates[0].content.parts;
    var result="";
    if(parts){for(var i=0;i<parts.length;i++){if(parts[i].text){var t=parts[i].text.trim().toUpperCase();if(t==="YES"||t==="NO"||t==="UNCLEAR"){result=t;break;}if(t.indexOf("NO")>=0){result="NO";break;}if(t.indexOf("YES")>=0){result="YES";break;}}}}
    if(result==="NO"){
      _push("🚨 BUDDY PUNCH! "+empName+" face does NOT match. Someone else used their PIN. Time: "+new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),1,"siren");
      _email("🚨 BUDDY PUNCH — "+empName,empName+" clocked in but face doesn't match reference. "+new Date().toLocaleString());
    }
  }catch(e){Logger.log("Face match error: "+e.message);}
}

function SET_REFERENCE_PHOTO(empId){
  empId=empId.toUpperCase();
  var ss=SpreadsheetApp.openById(_assertTestEnv_()&&KIOSK_SHEET_ID);
  var sh=_getOrCreateLog(ss);
  if(sh.getLastRow()<2){Logger.log("No log entries yet.");return;}
  var rows=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  var photoId="";
  for(var i=rows.length-1;i>=0;i--){
    if(rows[i][1]===empId&&rows[i][3]==="CLOCK_IN"&&rows[i][4]){photoId=rows[i][4];break;}
  }
  if(!photoId){Logger.log("No face photo found for "+empId+". Have them clock in first.");return;}
  PropertiesService.getScriptProperties().setProperty("FACE_REF_"+empId,photoId);
  Logger.log("✅ Reference photo set for "+empId+" — buddy punch detection active.");
}

function CHECK_REFERENCE_PHOTOS(){
  var props=PropertiesService.getScriptProperties();
  KIOSK_EMPLOYEES.forEach(function(e){
    Logger.log((props.getProperty("FACE_REF_"+e.id)?"✅ ":"❌ ")+e.name+" reference photo");
  });
}

// ═══════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════
function SETUP_KIOSK(){
  var props=PropertiesService.getScriptProperties();
  // Always write default PINs (use CHANGE_PIN to update later)
  props.setProperty("PIN_JOE",      _hashPin("9544"));
  props.setProperty("PIN_TAYLOR",   _hashPin("9911"));
  props.setProperty("PIN_CLARENCE", _hashPin("1200"));
  props.setProperty("PIN_YVONNE",   _hashPin("7864"));
  var ss=SpreadsheetApp.openById(_assertTestEnv_()&&KIOSK_SHEET_ID);
  _getOrCreateLog(ss); _getOrCreateMsgTab(ss); _getOrCreateSchedule(ss);
  Logger.log("✅ KIOSK SETUP COMPLETE — Joe=9544 Taylor=9911 Clarence=1200 Yvonne=7864");
}

function SETUP_SCHEDULE_TRIGGER(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction()==="checkScheduleAlerts") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("checkScheduleAlerts").timeBased().everyMinutes(1).create();
  Logger.log("✅ Trigger installed.");
}

function CHANGE_PIN(empId,newPin){
  PropertiesService.getScriptProperties().setProperty("PIN_"+empId.toUpperCase(),_hashPin(String(newPin)));
  Logger.log("PIN updated for "+empId);
}

function TEST_PUSHOVER(){
  _push("✅ EDP Kiosk test — working!",0,"cashregister");
}

// ═══════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════
function _getOrCreateLog(ss){
  var sh=ss.getSheetByName(KIOSK_LOG_TAB);
  if(!sh){
    sh=ss.insertSheet(KIOSK_LOG_TAB);
    sh.appendRow(["Timestamp","EmployeeID","Name","Action","FacePhotoId","Notes","ShoesPhotoId"]);
    sh.getRange(1,1,1,7).setFontWeight("bold").setBackground("#0d1b2a").setFontColor("#fff");
    sh.setFrozenRows(1); sh.setColumnWidths(1,7,160);
  }
  return sh;
}

function _getOrCreateMsgTab(ss){
  var sh=ss.getSheetByName("KIOSK_MESSAGES");
  if(!sh){
    sh=ss.insertSheet("KIOSK_MESSAGES");
    sh.appendRow(["Timestamp","EmployeeID","Name","Direction","Message","Read"]);
    sh.getRange(1,1,1,6).setFontWeight("bold").setBackground("#0d1b2a").setFontColor("#fff");
    sh.setFrozenRows(1);
  }
  return sh;
}

function _getOrCreateSchedule(ss){
  var sh=ss.getSheetByName("SCHEDULE");
  if(!sh){
    sh=ss.insertSheet("SCHEDULE");
    sh.appendRow(["EmployeeID","Name","DayOfWeek","ClockInTime","ClockOutTime","Active"]);
    sh.getRange(1,1,1,6).setFontWeight("bold").setBackground("#0d1b2a").setFontColor("#fff");
    sh.setFrozenRows(1);
    var days=["MON","TUE","WED","THU","FRI","SAT"];
    KIOSK_EMPLOYEES.forEach(function(e){
      days.forEach(function(d){sh.appendRow([e.id,e.name,d,"10:00","17:00",true]);});
    });
    sh.autoResizeColumns(1,6);
  }
  return sh;
}

function _getIncomingMessages(){
  try{
    var ss=SpreadsheetApp.openById(_assertTestEnv_()&&KIOSK_SHEET_ID);
    var sh=ss.getSheetByName("KIOSK_MESSAGES");
    if(!sh||sh.getLastRow()<2) return [];
    var rows=sh.getRange(2,1,sh.getLastRow()-1,6).getValues();
    return rows.filter(function(r){return r[3]==="FROM_TAYLOR"&&!r[5];})
               .map(function(r){return{empId:r[1],text:r[4],ts:r[0]};});
  }catch(e){return [];}
}

function _buildShiftSummary(sh,empId,now){
  var todayStart=new Date(now); todayStart.setHours(0,0,0,0);
  var wkStart=_weekStart(now);
  var todayMs=0,weekMs=0,lastCI=null;
  if(sh.getLastRow()<2) return {};
  var rows=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  rows.forEach(function(row){
    var ts=row[0],id=row[1],action=row[3];
    if(!ts||!id||!action||id!==empId) return;
    var t=new Date(ts).getTime();
    if(action==="CLOCK_IN"){lastCI=t;}
    else if(action==="LUNCH_OUT"){if(lastCI){var s=t-lastCI;if(lastCI>=todayStart.getTime())todayMs+=s;if(lastCI>=wkStart.getTime())weekMs+=s;}lastCI=null;}
    else if(action==="LUNCH_IN"){lastCI=t;}
    else if(action==="CLOCK_OUT"||action==="AUTO_CLOCKOUT"){if(lastCI){var s2=t-lastCI;if(lastCI>=todayStart.getTime())todayMs+=s2;if(lastCI>=wkStart.getTime())weekMs+=s2;}lastCI=null;}
  });
  return{todayHrs:_fmtHours(todayMs),weekHrs:_fmtHours(weekMs),todayMs:todayMs,weekMs:weekMs};
}

function _fmtHours(ms){
  var m=Math.round(ms/60000),h=Math.floor(m/60),min=m%60;
  if(h===0) return min+"m";
  return h+"h "+(min>0?min+"m":"");
}

function _hashPin(pin){
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,pin);
  return bytes.map(function(b){return("0"+((b&0xFF).toString(16))).slice(-2);}).join("");
}

function _saveToDrive(name,tag,dataUrl){
  _assertTestEnv_();
  // TEST: photo destination is fixed. Script Properties cannot redirect it.
  var folder=DriveApp.getFolderById(TEST_PHOTO_FOLDER_ID);
  var m=dataUrl.match(/^data:(.+);base64,(.+)$/);
  if(!m) throw new Error("Bad photo data");
  var blob=Utilities.newBlob(Utilities.base64Decode(m[2]),m[1],name+"_"+tag+"_"+Date.now()+".jpg");
  return folder.createFile(blob).getId();
}

function _push(message,priority,sound){
  if(!NOTIFICATIONS_ENABLED||!KIOSK_PUSH_TOKEN||!KIOSK_PUSH_USER){Logger.log("TEST: push suppressed: "+message);return;}
  try{
    UrlFetchApp.fetch("https://api.pushover.net/1/messages.json",{
      method:"post",contentType:"application/x-www-form-urlencoded",
      payload:{token:KIOSK_PUSH_TOKEN,user:KIOSK_PUSH_USER,title:"EDP Timeclock",
               message:message,priority:String(priority||0),sound:sound||"pushover"},
      muteHttpExceptions:true});
  }catch(e){Logger.log("Pushover: "+e.message);}
}

function _email(subject,body){
  if(!NOTIFICATIONS_ENABLED){Logger.log("TEST: email suppressed: "+subject);return;}
  if(!KIOSK_ALERT_EMAIL) return;
  try{MailApp.sendEmail(KIOSK_ALERT_EMAIL,subject,body);}
  catch(e){Logger.log("Email: "+e.message);}
}

function _pushPunch(name,action,ts,summary){
  if(!NOTIFICATIONS_ENABLED){Logger.log("TEST: punch push suppressed for "+name);return;}
  var icons={CLOCK_IN:"✅",CLOCK_OUT:"🏁",LUNCH_OUT:"🍽️",LUNCH_IN:"↩️",AUTO_CLOCKOUT:"🤖"};
  var time=ts.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  var msg=(icons[action]||"⏱")+" "+name+" — "+action.replace(/_/g," ")+" at "+time;
  if((action==="CLOCK_OUT"||action==="AUTO_CLOCKOUT")&&summary&&summary.todayHrs){
    msg+="\n⏱ Today: "+summary.todayHrs+(summary.todayPay?" ("+summary.todayPay+")":"");
    msg+="  |  📅 Week: "+summary.weekHrs+(summary.weekPay?" ("+summary.weekPay+")":"");
  }
  _push(msg,0,action==="CLOCK_IN"?"cashregister":"pushover");
}

function _emailPunch(name,action,ts,summary,empId){
  if(!NOTIFICATIONS_ENABLED){Logger.log("TEST: punch email suppressed for "+name);return;}
  var body=name+" — "+action.replace(/_/g," ")+" at "+ts.toLocaleString();
  if(summary&&summary.todayHrs){
    body+="\nToday: "+summary.todayHrs+(summary.todayPay?" ("+summary.todayPay+")":"");
    body+="\nThis week: "+summary.weekHrs+(summary.weekPay?" ("+summary.weekPay+")":"");
    body+="\nLast week: "+(summary.lastWeekHrs||"0m")+(summary.lastWeekPay?" ("+summary.lastWeekPay+")":"");
    body+="\nEst. Tuesday paycheck: "+(summary.weekPay||"$0.00")+" (before taxes)";
  }
  _email("EDP Kiosk — "+name+" "+action.replace(/_/g," "),body);

  // Send personal email to employee on clock-out
  if(action==="CLOCK_OUT"&&empId){
    var emp=KIOSK_EMPLOYEES.filter(function(e){return e.id===empId;})[0];
    if(emp&&emp.email){
      var empBody ="Hi "+emp.name+"!\n\n";
      empBody+="Your shift summary for "+ts.toLocaleDateString()+":\n\n";
      empBody+="Today:          "+(summary.todayHrs||"0m")+(summary.todayPay?" ("+summary.todayPay+")":"")+"\n";
      empBody+="This week:      "+(summary.weekHrs||"0m")+(summary.weekPay?" ("+summary.weekPay+")":"")+"\n";
      empBody+="Last week:      "+(summary.lastWeekHrs||"0m")+(summary.lastWeekPay?" ("+summary.lastWeekPay+")":"")+"\n\n";
      empBody+="Est. Tuesday paycheck: "+(summary.weekPay||"$0.00")+"\n";
      empBody+="(Gross pay before taxes. Deductions applied on payday.)\n\n";
      empBody+="Thank you for working at The Electronics Depot!\n";
      empBody+="— Taylor & Yvonne Landry";
      try{MailApp.sendEmail(emp.email,"Your EDP Pay Summary — "+ts.toLocaleDateString(),empBody);}
      catch(e){Logger.log("Employee email error: "+e.message);}
    }
  }
}