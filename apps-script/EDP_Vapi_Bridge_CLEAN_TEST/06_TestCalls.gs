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
