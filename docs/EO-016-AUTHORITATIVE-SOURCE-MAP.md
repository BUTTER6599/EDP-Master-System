# EO-016 — Authoritative LIVE Source Map (Read-Only Verification)

**Date:** August 6, 2026, 00:16 CDT
**Authorization:** READ-ONLY VERIFICATION ONLY
**Status:** COMPLETE — all 8 steps answered.

**Nothing was written, pushed, deployed, created, copied, or modified.** No `clasp push`, no deploy,
no Script Property change, no trigger creation, no spreadsheet write, no function execution.
Operations used: `clone` (read), `list-deployments`, `list-versions`, `show-authorized-user`.

---

## 1. Authenticated account — CONFIRMED

```
You are logged in as thedepote@gmail.com.
```

Matches the account you confirmed owns `EDP_Kiosk_V2`. Credential is at `~/.clasprc.json` in this
ephemeral container only.

---

## 2. Authoritative project — CONFIRMED

| Field | Value |
|---|---|
| Title | `EDP_Kiosk_V2` |
| Script ID | `1k3qXZU4Dnb42QHggds-BFmgd3iA1Za-rhWM7apzeRKIA-l9qgOtBBhqp` |
| Internal version | **v2.6.0** (`FILE: Kiosk_Main.gs (EDP_Kiosk_V2)`) |
| Files | 3 — `appsscript.json`, `Kiosk_Main.js` (28,374 B), `Kiosk.html` (52,785 B) |

**Manifest:**

| Setting | Value | Note |
|---|---|---|
| `timeZone` | `America/Chicago` | Correct |
| `runtimeVersion` | `V8` | |
| `exceptionLogging` | `STACKDRIVER` | |
| `webapp.executeAs` | `USER_DEPLOYING` | |
| `webapp.access` | **`ANYONE_ANONYMOUS`** | See §9 |

---

## 3. Source pulled to backup folder — DONE

`scratchpad/kiosk-live-backup-2026-08-06/` — pull only, never pushed.
Comparison clones: `ver2/`, `ver4/`, `ver22/`, `ver23/`, `testcopy/`.

### Version and deployment inventory

**23 versions.** Only two are described:

| Version | Description |
|---|---|
| @22 | `MONEY AMOUNT` |
| @23 | `Point kiosk to master sheet for TIME_LOGS/SCHEDULE` |

**4 deployments:**

| Deployment ID | Version |
|---|---|
| `AKfycbyGLJp2T5PYPN5eDbzHj5PAzqgklI5_EfE5p4C4nBM` | @HEAD |
| `AKfycbzoB42Oq9-aUZkAjW1FINRQQLwsCvQ7Qnes7T7PUwQFoUZUfp-ASxl4tvdBR3mMjtYG` | @2 |
| `AKfycbxU8QJza2jlUu3eDtZW_CCBz5hjRMs44_Bos9Q8KVU-W06zcvb7X8SN_09UDJyMkpvf` | @4 |
| `AKfycbzjf8KaKh0Cs5kI1DxPVl7Na8Hmlg-PEJHb6OtmRiMpApCWsP8gu_nrryfMho8ToXEN` | **@23** |

**@22 is not deployed.** It was superseded by @23 — the deployment that once served it was updated.
Four deployment URLs are live simultaneously, serving four different generations of code (§8).

### Drift check

| Comparison | Result |
|---|---|
| **@23 vs current editor source** | **IDENTICAL** — zero drift |
| **@22 vs current editor source** | **Exactly one line differs** |

The entire @22 → @23 change is line 15:

```diff
-var KIOSK_SHEET_ID = "1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo";
+var KIOSK_SHEET_ID = "117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI";
```

All three files are 602 lines. Nothing else changed. The editor is clean — no unpushed edits sitting
in LIVE.

---

## 4. Current LIVE spreadsheet ID — CONFIRMED

```
117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI     →  EDP_MASTER_DATABASE
```

Log tab: **`TIME_LOGS`** (`var KIOSK_LOG_TAB = "TIME_LOGS";`, line 16).

The candidate identified in yesterday's report was correct.

---

## 5. Where the ID comes from — CONFIRMED: HARDCODED

**Hardcoded in source at `Kiosk_Main.js` line 15.** Not a Script Property, not a config sheet, not
container binding.

```js
var KIOSK_SHEET_ID    = "117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI";
var KIOSK_LOG_TAB     = "TIME_LOGS";
```

Accessed via `SpreadsheetApp.openById(KIOSK_SHEET_ID)` at 8 sites. `PropertiesService` **is** used in
this project, but only for PIN hashes (`PIN_<ID>`) and face-reference photo IDs (`FACE_REF_<ID>`) —
never for the spreadsheet target.

**Consequence for EO-016:** environment is switched by editing a literal and redeploying. There is no
configuration boundary between TEST and LIVE. Converting this to a Script Property is the first change
the TEST build should make.

---

## 6. Today's Clarence and Kenneth punch records — NOT FOUND

### 6.1 First, a timing correction

It is currently **00:16 Thursday, August 6, 2026** in America/Chicago. The store opens 10:00 AM and
closes 5:00 PM. **Today's business day has not started.** "Today" in your instruction is
**Wednesday, August 5** — the day that ended about six hours ago.

### 6.2 Kenneth is a configured employee

From `Kiosk_Main.js` (roster is hardcoded, lines 22–28):

| ID | Name | Weekly hrs | Rate | Email |
|---|---|---|---|---|
| JOE | Joe | 20 | 23.00 | thedepotedelivery@gmail.com |
| CLARENCE | Clarence | 10 | 12.00 | *(none)* |
| **KENNETH** | **Kenneth** | **20** | **13.00** | lane44802@gmail.com |
| YVONNE | Yvonne | 8 | 7.25 | landryyvonne15@gmail.com |
| TAYLOR | Taylor | 20 | 20.00 | thedepote@gmail.com |

So Kenneth is fully provisioned in the kiosk — roster entry, rate, email, and a default PIN.

### 6.3 But no punch record exists for him, on any date, in any deployed target

I checked the spreadsheet every deployed version points at:

| Deployment | Target spreadsheet | `TIME_LOGS` state |
|---|---|---|
| **@23 / HEAD** (active) | `EDP_MASTER_DATABASE` | 411 rows, **3/11/2026 → 4/9/2026**, 6 columns, employees JOE / CLARENCE / TAYLOR / YVONNE. **Zero KENNETH rows.** |
| **@22** | `EDP_MASTER_OPS FOLDER 2026` | 7 columns, header row flagged `⚠️ TEST DATA — Safe to delete anytime. Run CLEAR_TEST_LOGS() to wipe.` Latest activity July. **Zero KENNETH rows.** |
| **@2** | `EDP_Master_Management` (`1B0zqh…`) + a runtime `KIOSK_SETTINGS.spreadsheet_id` | File is 1,024 bytes, last modified 2026-03-10 — effectively empty |
| **@4** | `getActiveSpreadsheet()` + runtime `KIOSK_SETTINGS.spreadsheet_id` | Older architecture (`Config.js` / `Main.js` / `Dashboard.html`) |

**Not one of these contains a Wednesday August 5 punch, and none has ever contained Kenneth.**

`EDP_MASTER_DATABASE` *was* modified 18:01 CDT Wednesday — but that file is shared by the Register,
AI receptionist call log, Picker Portal, and audit systems (all present as separate tables). That
write was not a kiosk punch: `TIME_LOGS` still ends April 9.

### 6.4 What this most likely means — flagging, not concluding

If employees genuinely punched in on Wednesday, **their punches did not land in any spreadsheet this
kiosk is configured to write to.** The most probable explanations, in order:

1. **The punch write is failing silently.** `executeAs: USER_DEPLOYING` means every punch runs as the
   deploying account. If that account's authorization lapsed, or it lost edit access to
   `EDP_MASTER_DATABASE`, `api_punch` throws — and the kiosk UI shows a red `ERROR` flash for ~2
   seconds and resets. An employee would see a flash and walk away. Nothing would be logged.
2. **The iPad is on a deployment URL I haven't traced to a live sheet** — the @2 or @4 URL, whose
   target is resolved at runtime from a settings tab rather than a literal.
3. **The kiosk genuinely has not been used since April 9,** and Wednesday's activity was somewhere
   else entirely.

**This needs your eyes before anything else in EO-016.** If (1) is right, time worked is not being
recorded at all, which is a payroll-accuracy and wage-compliance problem far more urgent than the
exception queue EO-016 was scoped to build.

**Fastest way to settle it:** open the kiosk on the iPad and read the `/exec` URL in the address bar,
then tell me which of the four deployment IDs it contains. That identifies the running code exactly.

---

## 7. Exact tab and spreadsheet — ANSWERED

**Configured destination (active @23):** `EDP_MASTER_DATABASE`
(`117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI`), tab **`TIME_LOGS`**.

Row shape written by `api_punch` (line 205) — 7 values:

```
[ timestamp, employeeId, name, action, facePhotoId, notes, shoesPhotoId ]
```

The existing tab header in `EDP_MASTER_DATABASE` has only 6 named columns
(`Timestamp | EmployeeID | Name | Action | PhotoFileId | Notes`) — no `ShoesPhotoId`. The 7th value
lands in an unnamed column. Minor schema mismatch, worth correcting in TEST.

**Actual destination of Wednesday's punches: unknown.** See §6.4.

---

## 8. The 5:15 PM automatic clock-out — FULLY LOCATED

| Attribute | Value |
|---|---|
| **Function** | `_autoClockOut(ss, now)` |
| **Source file** | `Kiosk_Main.js` — **defined line 329** |
| **Call site** | **line 306**, inside `checkScheduleAlerts` |
| **Trigger** | `checkScheduleAlerts`, time-based, **every 1 minute** — installed at line 439 |
| **Project** | `EDP_Kiosk_V2` |
| **Deployment** | @23 (active), identical in @22 |
| **Spreadsheet target** | `EDP_MASTER_DATABASE` → `TIME_LOGS` |

### 8.1 The closeout ladder

Declared in the file header and implemented in `checkScheduleAlerts`:

| Time | Action |
|---|---|
| 4:55 PM | Heads-up Pushover |
| 5:00 PM | Pushover listing who is still clocked in |
| 5:05 PM | Pushover **+** email manager alert |
| **5:15 PM** | **AUTO CLOCK-OUT for anyone still clocked in** |

`_autoClockOut` calls `_getStillClockedIn(ss)`, returns early if nobody is in, then for each person
appends:

```js
sh.appendRow([now, emp.id, emp.name, "AUTO_CLOCKOUT", "", "AUTO: System clock-out at 5:15 PM", ""]);
```

then sends a Pushover siren and an email. That is the exact string seen in the four historical rows.

### 8.2 Root cause of the unreliability — found

Line 306:

```js
if (nowMin === 17*60 + 15) _autoClockOut(ss, now);
```

**This is exact equality on the minute, driven by an every-minute trigger.** Apps Script does not
guarantee a minute-interval trigger fires in every single minute — executions are throttled, delayed,
and skipped under quota pressure or transient failure. If the trigger does not happen to execute
during minute 1035, the condition is never true and **auto clock-out is silently skipped for that
entire day.** There is no catch-up, no retry, no missed-window alert.

The same fragility applies to all four rungs — 4:55, 5:00, and 5:05 use identical exact-equality
checks, so closeout alerts can vanish the same way.

This explains the data: only **4** `AUTO_CLOCKOUT` events exist across the whole log (4/6 JOE,
4/8 JOE, 4/9 TAYLOR, 4/9 CLARENCE), on days where many more shifts ended without a clock-out.

**The EO-016 replacement should use a window plus an idempotency guard** — "if now ≥ 17:15 and no
`AUTO_CLOCKOUT` row exists for this employee today, then act" — rather than an equality test, and
should raise an owner alert when the window is missed entirely.

---

## 9. OPS v1.2.0 — assessed: SUPERSEDED

`EDP_MASTER_SYSTEM — OPS v1.2.0` is container-bound (`SpreadsheetApp.getActive()`) to
`EDP_MASTER_SYSTEM — OPS (INVENTORY + SALES + EXPENSES)` (`19VuXh--un3y-iula8mrE8rYqZrUn4kA3ADWv4FpkvYg`).

**That spreadsheet was last modified 2026-03-10 — nearly five months ago.** Its richer
`TIME_EVENTS` / `TIME_SHIFTS` schema appears nowhere in either spreadsheet the kiosk currently uses.
The kiosk moved to `EDP_MASTER_OPS FOLDER 2026` (@22) and then to `EDP_MASTER_DATABASE` (@23),
neither of which carries that schema.

**Assessment: superseded, not live.** Its design is still the better one — state machine, void-not-
delete, LockService, `EXCEPTIONS_ALERTS`, Tue 10:00 → Mon 17:00 payroll week — and EO-016 should
borrow that design rather than reinvent it. I could not enumerate its triggers, because that requires
executing `ScriptApp.getProjectTriggers()`, which is outside read-only authorization.

---

## 10. TEST copy — CONFIRMED POINTING AT LIVE DATA

`Copy of EDP_Kiosk_V2 TEST` (`1hExChp4Z9q9fwwrGKAAwoF1vLqigaXY7b8-QvMBx9-ZpxuyLMP8aLcow`):

```
line 31:  var KIOSK_SHEET_ID = "1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo";
line 32:  var KIOSK_LOG_TAB  = "TIME_LOGS";
```

**That is `EDP_MASTER_OPS FOLDER 2026` — the production spreadsheet LIVE @22 wrote to.** The "TEST"
project is not isolated. It shares a data target with a real deployed generation of the kiosk.

It also has **2 live deployments**: `…FrQ @HEAD` and `…R4sm @10`. Both are reachable URLs. Anyone
opening either can write into that spreadsheet.

Yesterday's recommendation is now confirmed rather than precautionary: **do not execute this project,
do not adopt it as the TEST environment.** Its trigger list still needs checking — if it inherited
`checkScheduleAlerts`, it is running a 5:15 PM auto clock-out against that sheet every day. That check
requires either the Apps Script editor UI or an authorized execution.

---

## 11. Security findings (incidental, reporting only)

Found while reading source. Not acted on.

1. **Employee PINs are hardcoded in plaintext** in `Kiosk_Main.js` (the `DEFAULT_PINS` object, ~line
   30) for all five employees. `_autoSetupPins()` writes their hashes into Script Properties on every
   page load. Anyone with read access to the project can read every PIN. Values are deliberately not
   reproduced here.
2. **A Pushover API token and user key are hardcoded** in the same file (lines 17–18).
3. **`webapp.access` is `ANYONE_ANONYMOUS`** — the kiosk endpoint is reachable by anyone on the
   internet with the URL, with no Google sign-in. PIN entry is the only gate, and PINs are 4 digits.
4. **Four deployment URLs are simultaneously live**, serving four generations of code that write to
   three different spreadsheets. Any of them still works if someone has the link.

None of these is in EO-016's scope. Items 1 and 3 together are worth a decision soon.

---

## 12. Authoritative source map — summary

```
EDP_Kiosk_V2  (1k3qXZU4Dnb42QHggds-BFmgd3iA1Za-rhWM7apzeRKIA-l9qgOtBBhqp)
│  v2.6.0 · America/Chicago · V8 · USER_DEPLOYING · ANYONE_ANONYMOUS
│  Editor source == @23  (zero drift)
│
├── appsscript.json
├── Kiosk_Main.js   602 lines
│     line 15  KIOSK_SHEET_ID  = 117AFF…  → EDP_MASTER_DATABASE      [HARDCODED]
│     line 16  KIOSK_LOG_TAB   = "TIME_LOGS"
│     line 22  KIOSK_EMPLOYEES = JOE, CLARENCE, KENNETH, YVONNE, TAYLOR
│     line 205 api_punch       → appendRow(7 cols)
│     line 306 if (nowMin === 17*60+15) _autoClockOut()      ◄ fragile equality
│     line 329 _autoClockOut()                               ◄ THE 5:15 PM LOGIC
│     line 439 trigger checkScheduleAlerts, everyMinutes(1)
└── Kiosk.html      52,785 B

Deployments:  @HEAD · @2 · @4 · @23(active)
Version map:  @22 → EDP_MASTER_OPS FOLDER 2026 · @23 → EDP_MASTER_DATABASE
              @2  → EDP_Master_Management + runtime settings
              @4  → getActiveSpreadsheet + runtime settings

Copy of EDP_Kiosk_V2 TEST  (1hExChp4…)
      line 31 KIOSK_SHEET_ID = 1laPGf…  → EDP_MASTER_OPS FOLDER 2026  ◄ LIVE DATA
      deployments: @HEAD, @10                                        ◄ both live
```

---

## 13. Recommended next steps

**Before any TEST build:**

1. **Resolve where Wednesday's punches went** (§6.4). Read the `/exec` URL off the kiosk iPad and tell
   me which deployment ID it contains. If punches are failing silently, that outranks all of EO-016.
2. Decide on the TEST copy's two live deployments (§10).

**Then, for the TEST build** — plan shape is unchanged, with these corrections:

3. Copy `EDP_MASTER_DATABASE` as the TEST fixture only once §6.4 confirms it is the real target.
4. First code change in TEST: move `KIOSK_SHEET_ID` from a literal to a Script Property (§5).
5. Rewrite the 5:15 PM check as a window + idempotency guard, with a missed-window alert (§8.2).
6. Add the missing `ShoesPhotoId` column to the TEST `TIME_LOGS` header (§7).
7. Borrow the OPS v1.2.0 design — void-not-delete, LockService, exceptions table (§9).

Stopping here. No further action without approval.
