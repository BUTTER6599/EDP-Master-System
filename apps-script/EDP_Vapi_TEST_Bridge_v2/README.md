# EDP Vapi TEST Bridge v2

A standalone, TEST-only Google Apps Script web app. It accepts a Vapi
`end-of-call-report`, appends one row to the existing `TEST_CALLS` tab, and
sends one Pushover notification.

Brand-new project. Shares no code, script id, or deployment with
`EDP_Vapi_Bridge` (LIVE), `EDP_Vapi_Bridge_TEST`, or `EDP OS API — TEST`.
The only shared resource is the `TEST_CALLS` tab of the TEST spreadsheet
*EDP AI Receptionist — TEST Data*, which is appended to.

- `Code.gs` — the whole bridge. ES5, single file.
- `appsscript.json` — V8 runtime, America/Chicago, web app config.
- `test/run.cjs` — Node verification harness (not pushed to Google).

## Row format

`appendRow` writes five columns, in this order:

| 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| Timestamp | Call ID | Assistant | Caller | Duration (s) |

`TEST_CALLS` is currently empty with no header row, so the first call lands
in row 1. If you want headers, add that row by hand before the first call.

## Deploy

Requires a `clasp` login for the account that owns the TEST spreadsheet
(`thedepote@gmail.com`) and the Apps Script API enabled at
<https://script.google.com/home/usersettings>.

```bash
git pull
cd apps-script/EDP_Vapi_TEST_Bridge_v2
clasp login
clasp create --type standalone --title "EDP Vapi TEST Bridge v2" --rootDir .
clasp push && clasp open
```

Then **Deploy > New deployment > Web app**:

- **Execute as:** Me
- **Who has access:** Anyone

`appsscript.json` already declares both (`USER_DEPLOYING` /
`ANYONE_ANONYMOUS`), but the first deployment must still be confirmed in
the UI so the account grants the OAuth scopes. The deployment gives you the
`/exec` URL.

Re-deploying with `clasp deploy --deploymentId <id>` keeps that URL, so
Vapi needs no reconfiguring. A *new* deployment produces a new URL.

## Script Properties

Set under **Project Settings > Script Properties** before the first run:

| Property | Required | Value |
|---|---|---|
| `TEST_SPREADSHEET_ID` | yes | `1ronx5A0l_v4lJTw19e5VrcnL4FUXDvgUjsEbxWJYx_c` |
| `PUSHOVER_TOKEN` | yes | Pushover application token |
| `PUSHOVER_USER` | yes | Pushover user/group key |
| `TEST_CALLS_TAB_NAME` | no | Defaults to `TEST_CALLS` |

That spreadsheet id is the TEST workbook. Do not point it at a LIVE sheet.

## Verify before wiring up Vapi

In the editor, run `testHarness()`. It appends one row and sends one
notification using fixed sample values, which confirms the Sheet and
Pushover legs independently of Vapi. Approve the OAuth consent prompt on
this first run, then check `TEST_CALLS` and your phone.

To check the parsing and routing logic without Google at all:

```bash
node apps-script/EDP_Vapi_TEST_Bridge_v2/test/run.cjs
```

It stubs the Apps Script runtime and runs the real `Code.gs` — covering the
happy path, ignored event types, empty bodies, the assistant/caller/
duration fallbacks, a missing tab, and missing Pushover credentials.
Excluded from `clasp push` by `.claspignore`.

## Wiring up Vapi

Point the **LO_TEST** assistant's server URL at the `/exec` URL from the
deployment and enable the `end-of-call-report` server message. Do not put
this URL on the LIVE assistant.

## Known limits

Accepted tradeoffs of the clean rebuild, not bugs — worth revisiting before
this carries real traffic:

- **No authentication.** Access is `Anyone`, and the endpoint checks no
  shared secret, so anyone with the URL can append rows and trigger
  notifications.
- **Failures are silent.** `doPost` catches everything and still returns a
  200, so a bad spreadsheet id, a renamed tab, or a quota error drops the
  call with no row and no push. Vapi sees success and does not retry; the
  only trace is `Logger.log`. Check the executions log if a call goes
  missing.
- **No duplicate protection.** Nothing dedupes on call id, so anything that
  delivers the same report twice produces two rows and two notifications.
