// ============================================================
// TEST HELPERS
// 
// Manual entry points. Not called by doPost.
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
