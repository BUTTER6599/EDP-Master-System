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
//
// MODULE LAYOUT
//   00_Config.gs           IDs + shared constants
//   01_Webhook.gs          doGet / doPost / core processor
//   02_VapiApi.gs          authenticated Vapi API lookup
//   03_Artifacts.gs        Drive artifact writes
//   04_TranscriptFormat.gs transcript text shaping
//   05_Classification.gs   business purpose classification
//   06_TestCalls.gs        TEST_CALLS sheet helpers
//   07_Pushover.gs         Pushover notification
//   08_RealtimeAlerts.gs   reserved (no behavior today)
//   99_TestHelpers.gs      manual test entry points
//
// Apps Script concatenates every .gs file into one global
// scope, so this split is purely organizational. Function
// bodies are unchanged from the single-file Code.gs.
// ============================================================


// ============================================================
// CONFIG — TEST TARGETS
//
// These point at TEST resources only. Never repoint these
// at LIVE Sheets or LIVE Drive folders.
// ============================================================

const TEST_SPREADSHEET_ID =
  '1ronx5A0l_v4lJTw19e5VrcnL4FUXDvgUjsEbxWJYx_c';

const TEST_SHEET_NAME = 'TEST_CALLS';

const TEST_ARTIFACTS_FOLDER_ID =
  '1yEKM5Sztz_2vJm5GOoW51AseKgE6Ts5K';
