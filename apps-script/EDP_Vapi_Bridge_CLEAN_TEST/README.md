# EDP_Vapi_Bridge_CLEAN_TEST

Clean TEST bridge for EDP-005 AI Receptionist. **TEST ONLY** — this project
writes no LIVE resources.

| | |
|---|---|
| Script ID | `1_owUir-q9PiNl-LLP3oJ2o2D6asrYeAgoaZ7bOnu2eO_WbotD7uIYHwa` |
| Drive | https://script.google.com/d/1_owUir-q9PiNl-LLP3oJ2o2D6asrYeAgoaZ7bOnu2eO_WbotD7uIYHwa/edit |
| Created | 2026-09-13 |
| Runtime | V8, timezone `America/Chicago` |
| Web app | `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS` |

Do **not** modify or replace the legacy `EDP_Vapi_Bridge_TEST` project
(`15a2iC4Sljs4Lr-igYk5M0V5T5HArZESJhxTIbaOkuHQC59IskXoVtokT`).

## Module layout

| File | Contents |
|---|---|
| `00_Config.gs` | `TEST_SPREADSHEET_ID`, `TEST_SHEET_NAME`, `TEST_ARTIFACTS_FOLDER_ID` |
| `01_Webhook.gs` | `doGet`, `doPost`, `processCompletedCall_`, `jsonResponse` |
| `02_VapiApi.gs` | `getVapiCall_` |
| `03_Artifacts.gs` | `saveVapiRecording_`, `saveTranscript_` |
| `04_TranscriptFormat.gs` | `extractUserText_`, `makePreview_` |
| `05_Classification.gs` | `classifyCall_`, `containsAny_` |
| `06_TestCalls.gs` | `ensureHeaders_`, `findCallRow_` |
| `07_Pushover.gs` | `sendPushover_` |
| `08_RealtimeAlerts.gs` | Reserved — no code today (see note below) |
| `99_TestHelpers.gs` | `testVapiLookup`, `testDriveAccess`, `testProcessExistingCall`, `forceDriveAuthorization` |

Apps Script concatenates all `.gs` files into a single global scope, so the
split is organizational only. The three `const` declarations in `00_Config.gs`
are referenced only from inside function bodies, so file load order cannot
produce a temporal-dead-zone error.

`08_RealtimeAlerts.gs` is a comment-only placeholder. The original single-file
`Code.gs` contained no realtime/mid-call alert logic, so adding behavior here
was out of scope for a behavior-preserving refactor.

## Script Properties (set in the Apps Script project, not in this repo)

- `VAPI_PRIVATE_API_KEY` — read by `getVapiCall_` and `saveVapiRecording_`
- `PUSHOVER_USER_KEY` — read by `sendPushover_`
- `PUSHOVER_APP_TOKEN` — read by `sendPushover_`

These live in the project's Script Properties and are untouched by `clasp push`.

## TEST resources

- Spreadsheet `1ronx5A0l_v4lJTw19e5VrcnL4FUXDvgUjsEbxWJYx_c`, sheet `TEST_CALLS`
- Drive artifacts folder `1yEKM5Sztz_2vJm5GOoW51AseKgE6Ts5K`

## OAuth scopes

```
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/script.external_request
```

## External endpoints

- `https://api.vapi.ai/call/{id}` — authoritative call lookup
- `https://api.vapi.ai/call/{id}/mono-recording` — recording redirect (not auto-followed)
- `https://api.pushover.net/1/messages.json` — notification

## TEST_CALLS columns (A–O)

`Received At`, `Call ID`, `Caller Number`, `Assistant`, `Duration Seconds`,
`Ended Reason`, `Started At`, `Ended At`, `Purpose`, `Action`, `Priority`,
`Money Opportunity`, `Transcript File`, `Recording File`, `Transcript Preview`

## Pre-refactor restore point

The pristine single-file `Code.gs` (1,604 lines) is preserved in git:

```
git show 3663c01:apps-script/EDP_Vapi_Bridge_CLEAN_TEST/Code.gs
```
