# EDP Vapi TEST Bridge v2

A standalone, TEST-only Google Apps Script web app. It accepts one Vapi
`end-of-call-report` webhook, writes **one row** to the existing
`TEST_CALLS` tab, and sends **one** Pushover notification.

This is a brand-new project. It does not read, modify, or share any
resource with:

- `EDP_Vapi_Bridge` (legacy LIVE) — untouched
- `EDP_Vapi_Bridge_TEST` (legacy TEST) — untouched
- `EDP OS API — TEST` — untouched

The only shared resource is the TEST spreadsheet
*EDP AI Receptionist — TEST Data*, and only its `TEST_CALLS` tab, appended
to. No LIVE sheet, assistant, phone number, or deployment is referenced
anywhere in this source.

## Files

| File | Responsibility | Lines |
|---|---|---|
| `Code.gs` | The only `doGet`/`doPost`; auth, routing, locking | 100 |
| `Config.gs` | Script Properties accessors | 64 |
| `CallRecord.gs` | Normalizes the Vapi payload into a flat record | 108 |
| `SheetLog.gs` | Appends one row to `TEST_CALLS` | 144 |
| `Notify.gs` | Sends one Pushover notification | 76 |
| `Setup.gs` | One-time operator helpers | 83 |
| `Tests.gs` | Manual verification from the editor | 102 |

## Behaviour

- **Fails closed.** Until `TEST_SHEET_ID`, `TEST_WEBHOOK_KEY`,
  `PUSHOVER_APP_TOKEN`, and `PUSHOVER_USER_KEY` are all set, every request
  is refused.
- **Authenticated** by a shared secret in the `?key=` query parameter,
  compared in constant time. Apps Script does not reliably expose custom
  request headers to `doPost`, so the query parameter is the supported
  mechanism here.
- **Optional assistant allowlist.** Set `TEST_ASSISTANT_ID` to accept
  reports from only one assistant. Left unset, any assistant is accepted.
- **Exactly one row, exactly one notification.** A script lock serializes
  concurrent deliveries, and the `call_id` column of the sheet itself is
  scanned before every append, so a Vapi retry is recognized as a duplicate
  and produces neither a second row nor a second push.
- **Adapts to the tab's existing columns.** Row 1 of `TEST_CALLS` decides
  the column order; fields are matched to headers by name (case and
  spacing insensitive, with aliases for common wordings). A header this
  bridge has no value for is left blank instead of shifting the row.
  Headers are written only if the tab is completely empty.
- **Logs no sensitive data.** No payloads, transcripts, or customer phone
  numbers are written to the execution log.

### Response codes

Vapi retries any non-2xx, so the responses are chosen deliberately:

| Situation | Response | Vapi retries? |
|---|---|---|
| Bad or missing key | `200 {"error":"unauthorized"}` | no |
| Not an `end-of-call-report` | `200 {"ignored":true}` | no |
| Already logged | `200 {"duplicate":true}` | no |
| Logged successfully | `200 {"logged":true}` | no |
| Sheet write failed | throws → `500` | yes (dedupe makes this safe) |

## Deployment

Requires a `clasp` login for the Google account that owns the TEST
spreadsheet (`thedepote@gmail.com`), and the Apps Script API enabled at
<https://script.google.com/home/usersettings>.

```bash
cd apps-script/EDP_Vapi_TEST_Bridge_v2

clasp login                       # opens a browser; authorizes the account
clasp create --type standalone --title "EDP Vapi TEST Bridge v2" --rootDir .
clasp push
clasp deploy --description "TEST v1"
clasp deployments                 # note the deployment id
```

Then set the web app access. In the Apps Script editor
(`clasp open`) use **Deploy > New deployment > Web app** with:

- **Execute as:** Me
- **Who has access:** Anyone

The manifest already declares this (`"executeAs": "USER_DEPLOYING"`,
`"access": "ANYONE_ANONYMOUS"`), but the first deployment must still be
confirmed in the UI so the account grants the OAuth scopes.

### If you prefer not to use clasp

Create a new standalone project at <https://script.new>, title it
**EDP Vapi TEST Bridge v2**, paste each `.gs` file in as a file of the same
name, replace the manifest with `appsscript.json` (enable *Show
`appsscript.json`* under Project Settings first), then deploy as above.

## Configuration

After the first deployment, in the editor:

1. Run `setupTestBridge()`. It sets the TEST sheet id and tab, generates a
   webhook key if there isn't one, and tells you what is still missing.
   Approve the OAuth consent prompt on this first run.
2. Under **Project Settings > Script Properties**, add:
   - `PUSHOVER_APP_TOKEN`
   - `PUSHOVER_USER_KEY`
3. Run `configStatus()` to confirm everything reads `set`.
4. Run `runAllTests()`. It exercises auth rejection, event filtering, the
   happy path, and duplicate protection — you should end up with two new
   rows in `TEST_CALLS` and two Pushover notifications.
5. Run `showWebhookUrl()` to print the exact URL to give Vapi.

## Wiring up Vapi

Point the **LO_TEST** assistant's server URL at the value
`showWebhookUrl()` printed:

```
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?key=<TEST_WEBHOOK_KEY>
```

Enable the `end-of-call-report` server message. Do not put this URL on the
LIVE assistant.

Re-deploying with `clasp deploy --deploymentId <id>` keeps the same `/exec`
URL, so Vapi does not need reconfiguring. Creating a *new* deployment
produces a new URL.

## Script Properties reference

| Property | Required | Purpose |
|---|---|---|
| `TEST_SHEET_ID` | yes | TEST spreadsheet id (set by `setupTestBridge()`) |
| `TEST_SHEET_TAB` | no | Defaults to `TEST_CALLS` |
| `TEST_WEBHOOK_KEY` | yes | Shared secret for `?key=` |
| `PUSHOVER_APP_TOKEN` | yes | Pushover application token |
| `PUSHOVER_USER_KEY` | yes | Pushover user/group key |
| `TEST_ASSISTANT_ID` | no | Restricts to one assistant id |

## Verifying without Google

`test/` holds a Node harness that stubs the Apps Script runtime
(`SpreadsheetApp`, `PropertiesService`, `LockService`, `UrlFetchApp`,
`ContentService`) and runs the real `.gs` source against it:

```bash
node apps-script/EDP_Vapi_TEST_Bridge_v2/test/run.cjs
```

It covers header seeding, mapping onto pre-existing custom headers,
fail-closed behaviour, the older flat Vapi payload shape, malformed input,
a Pushover outage, duplicate protection, and the assistant allowlist. It is
excluded from `clasp push` by `.claspignore`.
