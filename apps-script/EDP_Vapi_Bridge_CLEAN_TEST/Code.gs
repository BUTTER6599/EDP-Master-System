// ============================================================
// EDP VAPI BRIDGE — CLEAN TEST V3
// TEST ONLY
//
// Vapi call completion
// → fetch authoritative Vapi call
// → transcript
// → recording
// → classify business purpose
// → save TEST artifacts
// → upsert TEST_CALLS
// → smart Pushover
//
// LIVE systems are NOT written by this script.
// ============================================================

const TEST_SPREADSHEET_ID =
  '1ronx5A0l_v4lJTw19e5VrcnL4FUXDvgUjsEbxWJYx_c';

const TEST_SHEET_NAME = 'TEST_CALLS';

const TEST_ARTIFACTS_FOLDER_ID =
  '1yEKM5Sztz_2vJm5GOoW51AseKgE6Ts5K';


// ============================================================
// HEALTH CHECK
// ============================================================

function doGet() {
  return ContentService
    .createTextOutput('EDP CLEAN TEST BRIDGE V3 RUNNING')
    .setMimeType(ContentService.MimeType.TEXT);
}


// ============================================================
// MAIN VAPI WEBHOOK
// ============================================================

function doPost(e) {
  try {
    const rawBody =
      e &&
      e.postData &&
      e.postData.contents
        ? e.postData.contents
        : '{}';

    const payload = JSON.parse(rawBody);
    const message = payload.message || payload;

    const eventType =
      message.type ||
      payload.type ||
      '';

    const status =
      String(
        message.status ||
        payload.status ||
        ''
      ).toLowerCase();

    console.log(
      'Vapi event received: ' +
      eventType +
      ' / status=' +
      status
    );

    // We process:
    // 1. end-of-call-report
    // 2. status-update where status = ended
    //
    // The call-ID upsert prevents duplicates if both arrive.

    const shouldProcess =
      eventType === 'end-of-call-report' ||
      (
        eventType === 'status-update' &&
        status === 'ended'
      );

    if (!shouldProcess) {
      return jsonResponse({
        ok: true,
        ignored: true,
        eventType: eventType,
        status: status
      });
    }

    const call =
      message.call ||
      payload.call ||
      {};

    const callId =
      call.id ||
      message.callId ||
      payload.callId ||
      '';

    if (!callId) {
      throw new Error(
        'No Vapi Call ID received.'
      );
    }

    console.log(
      'Processing completed call: ' +
      callId
    );

    const result =
      processCompletedCall_(callId);

    return jsonResponse(result);

  } catch (err) {
    console.error(
      'EDP BRIDGE ERROR: ' +
      err
    );

    return jsonResponse({
      ok: false,
      error: String(err)
    });
  }
}


// ============================================================
// CORE COMPLETED-CALL PROCESSOR
// ============================================================

function processCompletedCall_(callId) {

  // ----------------------------------------------------------
  // GET AUTHORITATIVE CALL FROM VAPI API
  // ----------------------------------------------------------

  const vapiCall =
    getVapiCall_(callId);

  if (!vapiCall) {
    throw new Error(
      'Vapi call lookup returned empty result.'
    );
  }


  // ----------------------------------------------------------
  // BASIC CALL INFORMATION
  // ----------------------------------------------------------

  const callerNumber =
    (
      vapiCall.customer &&
      vapiCall.customer.number
    ) ||
    '';

  const assistantName =
    (
      vapiCall.assistant &&
      vapiCall.assistant.name
    ) ||
    vapiCall.assistantName ||
    'LO_TEST';

  const startedAt =
    vapiCall.startedAt ||
    '';

  const endedAt =
    vapiCall.endedAt ||
    '';

  const endedReason =
    vapiCall.endedReason ||
    '';

  let durationSeconds = '';

  if (startedAt && endedAt) {
    const startMs =
      new Date(startedAt).getTime();

    const endMs =
      new Date(endedAt).getTime();

    if (
      !isNaN(startMs) &&
      !isNaN(endMs)
    ) {
      durationSeconds =
        Math.round(
          ((endMs - startMs) / 1000) * 100
        ) / 100;
    }
  }


  // ----------------------------------------------------------
  // SUPPORT BOTH CURRENT + LEGACY VAPI ARTIFACT SHAPES
  // ----------------------------------------------------------

  const artifact =
    vapiCall.artifact ||
    {};

  const transcript =
    vapiCall.transcript ||
    artifact.transcript ||
    '';

  const recordingReference =
    vapiCall.recordingUrl ||
    artifact.recording ||
    '';


  console.log(
    'Transcript chars: ' +
    String(transcript).length
  );

  console.log(
    'Recording reference present: ' +
    Boolean(recordingReference)
  );


  // ----------------------------------------------------------
  // CLASSIFICATION
  // Use USER speech only to avoid Brian's words creating
  // false flags.
  // ----------------------------------------------------------

  const userText =
    extractUserText_(transcript);

  const classification =
    classifyCall_(userText);


  // ----------------------------------------------------------
  // EXISTING TEST ARTIFACTS FOLDER
  // ----------------------------------------------------------

  const folder =
    DriveApp.getFolderById(
      TEST_ARTIFACTS_FOLDER_ID
    );

  let transcriptFileUrl = '';
  let recordingFileUrl = '';


  // ----------------------------------------------------------
  // SAVE / UPDATE TRANSCRIPT
  // ----------------------------------------------------------

  if (transcript) {
    try {
      const transcriptFile =
        saveTranscript_(
          folder,
          callId,
          transcript
        );

      transcriptFileUrl =
        transcriptFile
          ? transcriptFile.getUrl()
          : '';

      console.log(
        'Transcript file saved: ' +
        transcriptFileUrl
      );

    } catch (err) {
      console.error(
        'Transcript save failed: ' +
        err
      );
    }
  }


  // ----------------------------------------------------------
  // SAVE AUTHENTICATED VAPI RECORDING
  // ----------------------------------------------------------

  try {
    const recordingFile =
      saveVapiRecording_(
        callId,
        folder
      );

    if (recordingFile) {
      recordingFileUrl =
        recordingFile.getUrl();

      console.log(
        'Recording file saved: ' +
        recordingFileUrl
      );
    }

  } catch (recordingErr) {
    console.error(
      'Recording save failed: ' +
      recordingErr
    );
  }


  // ----------------------------------------------------------
  // TEST_CALLS
  // ----------------------------------------------------------

  const sheet =
    SpreadsheetApp
      .openById(TEST_SPREADSHEET_ID)
      .getSheetByName(TEST_SHEET_NAME);

  if (!sheet) {
    throw new Error(
      'TEST_CALLS sheet not found'
    );
  }

  ensureHeaders_(sheet);

  const rowNumber =
    findCallRow_(
      sheet,
      callId
    );

  const receivedAt =
    rowNumber
      ? sheet
          .getRange(rowNumber, 1)
          .getValue() || new Date()
      : new Date();

  const rowValues = [
    receivedAt,                         // A
    callId,                             // B
    callerNumber,                       // C
    assistantName,                      // D
    durationSeconds,                    // E
    endedReason,                        // F
    startedAt,                          // G
    endedAt,                            // H
    classification.purpose,             // I
    classification.action,              // J
    classification.priority,            // K
    classification.moneyOpportunity,    // L
    transcriptFileUrl,                  // M
    recordingFileUrl,                   // N
    makePreview_(transcript, 450)        // O
  ];

  if (rowNumber) {
    sheet
      .getRange(
        rowNumber,
        1,
        1,
        rowValues.length
      )
      .setValues([rowValues]);

    console.log(
      'TEST_CALLS row updated: ' +
      rowNumber
    );

  } else {
    sheet.appendRow(rowValues);

    console.log(
      'TEST_CALLS row appended.'
    );
  }


  // ----------------------------------------------------------
  // PUSHOVER
  // ----------------------------------------------------------

  sendPushover_({
    callerNumber: callerNumber,
    assistantName: assistantName,
    durationSeconds:
      durationSeconds,
    endedReason:
      endedReason,
    callId:
      callId,

    purpose:
      classification.purpose,
    action:
      classification.action,
    priority:
      classification.priority,
    moneyOpportunity:
      classification.moneyOpportunity,

    transcript:
      transcript,

    transcriptFileUrl:
      transcriptFileUrl,

    recordingFileUrl:
      recordingFileUrl
  });


  return {
    ok: true,
    logged: true,
    callId: callId,

    purpose:
      classification.purpose,

    action:
      classification.action,

    priority:
      classification.priority,

    transcriptSaved:
      Boolean(transcriptFileUrl),

    recordingSaved:
      Boolean(recordingFileUrl),

    rowUpdated:
      Boolean(rowNumber)
  };
}


// ============================================================
// VAPI AUTHENTICATED CALL LOOKUP
// ============================================================

function getVapiCall_(callId) {

  const key =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'VAPI_PRIVATE_API_KEY'
      );

  if (!key) {
    throw new Error(
      'VAPI_PRIVATE_API_KEY not configured.'
    );
  }

  const url =
    'https://api.vapi.ai/call/' +
    encodeURIComponent(callId);

  const response =
    UrlFetchApp.fetch(
      url,
      {
        method: 'get',

        headers: {
          Authorization:
            'Bearer ' + key
        },

        muteHttpExceptions: true
      }
    );

  const code =
    response.getResponseCode();

  const body =
    response.getContentText();

  if (
    code < 200 ||
    code >= 300
  ) {
    throw new Error(
      'Vapi call lookup failed. HTTP ' +
      code +
      ': ' +
      body
    );
  }

  return JSON.parse(body);
}

// ============================================================
// AUTHENTICATED VAPI RECORDING DOWNLOAD
// ============================================================

function saveVapiRecording_(
  callId,
  folder
) {

  // Deterministic filename prevents duplicate files
  // if Vapi sends more than one completion event.

  const baseName =
    'RECORDING_' +
    callId;

  const existingWav =
    folder.getFilesByName(
      baseName + '.wav'
    );

  if (existingWav.hasNext()) {
    return existingWav.next();
  }

  const existingMp3 =
    folder.getFilesByName(
      baseName + '.mp3'
    );

  if (existingMp3.hasNext()) {
    return existingMp3.next();
  }


  const key =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'VAPI_PRIVATE_API_KEY'
      );

  if (!key) {
    throw new Error(
      'VAPI_PRIVATE_API_KEY not configured.'
    );
  }


  const vapiUrl =
    'https://api.vapi.ai/call/' +
    encodeURIComponent(callId) +
    '/mono-recording';


  // ------------------------------------------------------------
  // STEP 1 — Ask Vapi for recording redirect.
  // Do NOT auto-follow into signed storage URL.
  // ------------------------------------------------------------

  const vapiResponse =
    UrlFetchApp.fetch(
      vapiUrl,
      {
        method: 'get',

        headers: {
          Authorization:
            'Bearer ' + key
        },

        followRedirects: false,

        muteHttpExceptions: true
      }
    );


  const vapiCode =
    vapiResponse.getResponseCode();


  if (
    vapiCode !== 301 &&
    vapiCode !== 302 &&
    vapiCode !== 303 &&
    vapiCode !== 307 &&
    vapiCode !== 308
  ) {

    throw new Error(
      'Vapi recording redirect failed. HTTP ' +
      vapiCode +
      ': ' +
      vapiResponse.getContentText()
    );
  }


  const headers =
    vapiResponse.getAllHeaders();

  const signedUrl =
    headers.Location ||
    headers.location;


  if (!signedUrl) {
    throw new Error(
      'Vapi recording redirect did not include Location header.'
    );
  }


  if (
    typeof signedUrl !== 'string' ||
    signedUrl.indexOf('https://') !== 0
  ) {
    throw new Error(
      'Vapi recording redirect returned invalid signed URL.'
    );
  }


  // ------------------------------------------------------------
  // STEP 2 — Fetch signed storage URL separately.
  // IMPORTANT:
  // Do NOT send Vapi Authorization header to storage provider.
  // ------------------------------------------------------------

  const audioResponse =
    UrlFetchApp.fetch(
      signedUrl,
      {
        method: 'get',
        followRedirects: true,
        muteHttpExceptions: true
      }
    );


  const audioCode =
    audioResponse.getResponseCode();


  if (
    audioCode < 200 ||
    audioCode >= 300
  ) {
    throw new Error(
      'Signed recording download failed. HTTP ' +
      audioCode
    );
  }


  const blob =
    audioResponse.getBlob();


  const contentType =
    String(
      blob.getContentType() ||
      ''
    ).toLowerCase();


  if (
    contentType.indexOf('audio/') !== 0 &&
    contentType.indexOf('mpeg') === -1 &&
    contentType.indexOf('wav') === -1
  ) {
    throw new Error(
      'Recording download did not return audio. Content-Type: ' +
      contentType
    );
  }


  let extension =
    '.wav';


  if (
    contentType.indexOf('mpeg') !== -1 ||
    contentType.indexOf('mp3') !== -1
  ) {
    extension =
      '.mp3';
  }


  blob.setName(
    baseName +
    extension
  );


  return folder.createFile(blob);
}

// ============================================================
// TRANSCRIPT FILE
// ============================================================

function saveTranscript_(
  folder,
  callId,
  transcript
) {

  const fileName =
    'TRANSCRIPT_' +
    callId +
    '.txt';

  const files =
    folder.getFilesByName(
      fileName
    );

  if (files.hasNext()) {
    const existing =
      files.next();

    existing.setContent(
      String(transcript)
    );

    return existing;
  }

  return folder.createFile(
    fileName,
    String(transcript),
    MimeType.PLAIN_TEXT
  );
}


// ============================================================
// TEST_CALLS HEADERS
// ============================================================

function ensureHeaders_(sheet) {

  const headers = [
    'Received At',
    'Call ID',
    'Caller Number',
    'Assistant',
    'Duration Seconds',
    'Ended Reason',
    'Started At',
    'Ended At',
    'Purpose',
    'Action',
    'Priority',
    'Money Opportunity',
    'Transcript File',
    'Recording File',
    'Transcript Preview'
  ];

  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([headers]);
}


// ============================================================
// FIND EXISTING CALL ID
// ============================================================

function findCallRow_(
  sheet,
  callId
) {

  if (
    !callId ||
    sheet.getLastRow() < 2
  ) {
    return 0;
  }

  const finder =
    sheet
      .getRange(
        2,
        2,
        sheet.getLastRow() - 1,
        1
      )
      .createTextFinder(
        String(callId)
      )
      .matchEntireCell(true);

  const found =
    finder.findNext();

  return found
    ? found.getRow()
    : 0;
}


// ============================================================
// EXTRACT USER-ONLY SPEECH
// ============================================================

function extractUserText_(
  transcript
) {

  const lines =
    String(
      transcript ||
      ''
    )
      .split(/\r?\n/);

  const userLines = [];

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {

    const line =
      lines[i].trim();

    if (
      /^user\s*:/i.test(line) ||
      /^customer\s*:/i.test(line)
    ) {

      userLines.push(
        line.replace(
          /^(user|customer)\s*:\s*/i,
          ''
        )
      );
    }
  }

  // Fallback if transcript formatting changes.
  if (!userLines.length) {
    return String(
      transcript ||
      ''
    );
  }

  return userLines.join(' ');
}


// ============================================================
// BUSINESS CLASSIFICATION
// ============================================================

function classifyCall_(
  inputText
) {

  const t =
    String(
      inputText ||
      ''
    )
      .toLowerCase();


  let purpose =
    'ℹ️ GENERAL INFO';

  let priority =
    'NORMAL';

  let moneyOpportunity =
    'NO';

  const actions = [];


  // ----------------------------------------------------------
  // WARRANTY
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'warranty',
        'under warranty',
        'just bought',
        'just purchased',
        'bought from you',
        'purchased from you',
        'got it from you'
      ]
    )
  ) {

    purpose =
      '🛡️ WARRANTY';

    priority =
      'HIGH';
  }


  // ----------------------------------------------------------
  // REPAIR
  // ----------------------------------------------------------

  if (
    purpose !==
      '🛡️ WARRANTY' &&
    containsAny_(
      t,
      [
        'repair',
        'fix',
        'broken',
        'not working',
        "won't work",
        "doesn't work",
        'no heat',
        'not heating',
        'not cooling',
        'not spinning',
        'not draining',
        'leaking',
        'diagnostic'
      ]
    )
  ) {

    purpose =
      '🔧 REPAIR';

    moneyOpportunity =
      'YES';
  }


  // ----------------------------------------------------------
  // PARTS
  // ----------------------------------------------------------

  if (
    purpose !==
      '🛡️ WARRANTY' &&
    containsAny_(
      t,
      [
        'part',
        'parts',
        'belt',
        'element',
        'thermostat',
        'knob',
        'hose',
        'cord',
        'plug'
      ]
    )
  ) {

    purpose =
      '🧩 PARTS';

    moneyOpportunity =
      'YES';
  }


  // ----------------------------------------------------------
  // SELL / TRADE / RECYCLE
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'trade in',
        'trade-in',
        'trade my',
        'sell you',
        'sell my',
        'buy my',
        'pick up my',
        'recycle',
        'haul away'
      ]
    )
  ) {

    purpose =
      '♻️ SELL / TRADE / RECYCLE';
  }


  // ----------------------------------------------------------
  // SALES LEAD
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'looking to buy',
        'looking for a',
        'looking for an',
        'want to buy',
        'need to buy',
        'do you have',
        'do yall have',
        "do y'all have",
        'how much is',
        'how much are',
        'price on',
        'what do you have',
        'in stock',
        'available',
        'buy a washer',
        'buy a dryer',
        'buy a refrigerator',
        'buy a fridge',
        'buy a stove'
      ]
    )
  ) {

    purpose =
      '💰💵 SALES LEAD';

    moneyOpportunity =
      'YES';

    priority =
      'HIGH';
  }


  // ----------------------------------------------------------
  // APPOINTMENT / STORE VISIT
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'appointment',
        'schedule',
        'scheduled',
        'come by',
        'coming by',
        'stop by',
        'stopping by',
        'come in',
        'coming in',
        'visit the store',
        'see it in person',
        'look at it',
        'look at the'
      ]
    )
  ) {

    actions.push(
      '📅 APPOINTMENT / STORE VISIT'
    );

    if (
      priority !==
      'URGENT'
    ) {
      priority =
        'HIGH';
    }
  }


  // ----------------------------------------------------------
  // CALLBACK
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'call me back',
        'call back',
        'callback',
        'give me a call'
      ]
    )
  ) {

    actions.push(
      '📞 CALLBACK NEEDED'
    );

    if (
      priority !==
      'URGENT'
    ) {
      priority =
        'HIGH';
    }
  }


  // ----------------------------------------------------------
  // TEXT BACK
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'text me',
        'send me a text',
        'text me back'
      ]
    )
  ) {

    actions.push(
      '💬 TEXT BACK'
    );

    if (
      priority !==
      'URGENT'
    ) {
      priority =
        'HIGH';
    }
  }


  // ----------------------------------------------------------
  // URGENT / OWNER ESCALATION
  // ----------------------------------------------------------

  if (
    containsAny_(
      t,
      [
        'emergency',
        'fire',
        'gas leak',
        'injured',
        'injury',
        'police',
        'lawyer',
        'attorney',
        'lawsuit',
        'fraud',
        'chargeback',
        'threat',
        'threaten',
        'speak to the owner',
        'talk to the owner',
        'speak to a manager',
        'talk to a manager',
        'serious complaint'
      ]
    )
  ) {

    actions.push(
      '⚠️ MANAGER / ESCALATION'
    );

    priority =
      'URGENT';
  }


  // Warranty = existing obligation, not new-money flag.
  if (
    purpose ===
    '🛡️ WARRANTY'
  ) {

    moneyOpportunity =
      'NO';
  }


  const action =
    actions.length
      ? actions.join(' | ')
      : 'NONE';


  return {
    purpose:
      purpose,

    action:
      action,

    priority:
      priority,

    moneyOpportunity:
      moneyOpportunity
  };
}


// ============================================================
// PHRASE MATCHER
// ============================================================

function containsAny_(
  text,
  phrases
) {

  for (
    let i = 0;
    i < phrases.length;
    i++
  ) {

    if (
      text.indexOf(
        phrases[i]
      ) !== -1
    ) {

      return true;
    }
  }

  return false;
}


// ============================================================
// PUSHOVER
// ============================================================

function sendPushover_(
  callData
) {

  const props =
    PropertiesService
      .getScriptProperties();


  const userKey =
    props.getProperty(
      'PUSHOVER_USER_KEY'
    );


  const appToken =
    props.getProperty(
      'PUSHOVER_APP_TOKEN'
    );


  if (
    !userKey ||
    !appToken
  ) {

    console.log(
      'Pushover properties not configured.'
    );

    return;
  }


  const duration =
    callData.durationSeconds !== ''
      ? callData.durationSeconds +
        ' sec'
      : 'Unknown';


  const preview =
    makePreview_(
      callData.transcript,
      300
    );


  let message =
    'Caller: ' +
    (
      callData.callerNumber ||
      'Unknown'
    ) +
    '\n' +

    'Purpose: ' +
    callData.purpose +
    '\n' +

    'Action: ' +
    callData.action +
    '\n' +

    'Priority: ' +
    callData.priority +
    '\n' +

    'Money Opportunity: ' +
    callData.moneyOpportunity +
    '\n' +

    'Duration: ' +
    duration +
    '\n';


  if (preview) {

    message +=
      '\nConversation:\n' +
      preview +
      '\n';
  }


  if (
    callData.recordingFileUrl
  ) {

    message +=
      '\n🎧 Recording:\n' +
      callData.recordingFileUrl +
      '\n';
  }


  if (
    callData.transcriptFileUrl
  ) {

    message +=
      '\n📝 Transcript:\n' +
      callData.transcriptFileUrl;
  }


  if (
    message.length >
    1000
  ) {

    message =
      message.substring(
        0,
        997
      ) +
      '...';
  }


  let title =
    'EDP AI CALL — TEST';


  if (
    callData.priority ===
    'URGENT'
  ) {

    title =
      '⚠️ EDP URGENT CALL — TEST';

  } else if (
    callData.moneyOpportunity ===
    'YES'
  ) {

    title =
      '💰 EDP MONEY CALL — TEST';
  }


  const response =
    UrlFetchApp.fetch(
      'https://api.pushover.net/1/messages.json',
      {
        method:
          'post',

        payload: {
          token:
            appToken,

          user:
            userKey,

          title:
            title,

          message:
            message
        },

        muteHttpExceptions:
          true
      }
    );


  console.log(
    'Pushover HTTP ' +
    response.getResponseCode() +
    ': ' +
    response.getContentText()
  );
}


// ============================================================
// PREVIEW
// ============================================================

function makePreview_(
  text,
  maxLength
) {

  const cleaned =
    String(
      text ||
      ''
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();


  if (
    cleaned.length <=
    maxLength
  ) {

    return cleaned;
  }


  return (
    cleaned.substring(
      0,
      maxLength - 3
    ) +
    '...'
  );
}


// ============================================================
// JSON RESPONSE
// ============================================================

function jsonResponse(obj) {

  return ContentService
    .createTextOutput(
      JSON.stringify(obj)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}


// ============================================================
// TEST HELPERS
// ============================================================

// Tests Vapi API authentication only.
function testVapiLookup() {

  const callId =
    '01a09918-478c-7ffd-b425-985075f70f2f';

  try {

    const result =
      getVapiCall_(callId);

    console.log(
      'CALL FOUND: ' +
      result.id
    );

    console.log(
      'TRANSCRIPT CHARS: ' +
      String(
        result.transcript ||
        (
          result.artifact &&
          result.artifact.transcript
        ) ||
        ''
      ).length
    );

  } catch (err) {

    console.error(
      'VAPI LOOKUP ERROR: ' +
      err
    );
  }
}


// Tests Drive authorization only.
function testDriveAccess() {

  const folder =
    DriveApp.getFolderById(
      TEST_ARTIFACTS_FOLDER_ID
    );

  console.log(
    folder.getName()
  );
}


// IMPORTANT:
// This tests the FULL new pipeline using the EXISTING
// verified 11:48 PM call — no new phone call needed.
function testProcessExistingCall() {

  const callId =
    '01a09918-478c-7ffd-b425-985075f70f2f';

  try {

    const result =
      processCompletedCall_(
        callId
      );

    console.log(
      JSON.stringify(
        result
      )
    );

  } catch (err) {

    console.error(
      'FULL PIPELINE TEST ERROR: ' +
      err
    );
  }
}

function forceDriveAuthorization() {
  ScriptApp.requireScopes(
    ScriptApp.AuthMode.FULL,
    [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/script.external_request'
    ]
  );

  Logger.log('Required scopes are authorized.');
}
