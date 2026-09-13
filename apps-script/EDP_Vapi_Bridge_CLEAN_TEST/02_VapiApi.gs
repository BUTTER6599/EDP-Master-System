// ============================================================
// VAPI AUTHENTICATED CALL LOOKUP
//
// Reads Script Property: VAPI_PRIVATE_API_KEY
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
