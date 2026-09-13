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
//
// Orchestrates: Vapi lookup → classification → Drive
// artifacts → TEST_CALLS upsert → Pushover.
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
