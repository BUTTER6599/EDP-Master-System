// ============================================================
// AUTHENTICATED VAPI RECORDING DOWNLOAD
//
// Reads Script Property: VAPI_PRIVATE_API_KEY
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

  // Presentation formatting is applied HERE ONLY, so the
  // Drive artifact is readable while classification, the
  // TEST_CALLS preview and Pushover keep the raw transcript.
  const displayText =
    formatTranscriptForDisplay_(
      transcript
    );

  const files =
    folder.getFilesByName(
      fileName
    );

  if (files.hasNext()) {
    const existing =
      files.next();

    existing.setContent(
      displayText
    );

    return existing;
  }

  return folder.createFile(
    fileName,
    displayText,
    MimeType.PLAIN_TEXT
  );
}
