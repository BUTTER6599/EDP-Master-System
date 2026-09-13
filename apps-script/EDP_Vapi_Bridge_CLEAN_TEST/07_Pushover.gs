// ============================================================
// PUSHOVER
// 
// Reads Script Properties:
//   PUSHOVER_USER_KEY
//   PUSHOVER_APP_TOKEN
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
