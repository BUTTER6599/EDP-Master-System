# EO-016 — Authoritative LIVE Source Map (Read-Only Verification)

**Date:** August 6, 2026 — updated 01:0x CDT after iPad deployment ID was supplied
**Authorization:** READ-ONLY VERIFICATION ONLY
**Status:** COMPLETE — all 8 steps answered.

> ## ⛔ UPDATE — PUNCH LOGGING HAS BEEN BROKEN SINCE JULY 17, 2026
>
> The open question in §6 is **resolved**. Employees have been punching normally. The kiosk uploads
> their photo, then **fails to write the time record**. Nothing is logged, no receipt is sent, and
> the employee sees a 2-second error flash.
>
> **At least 56 punch events between July 18 and August 5 have no time record anywhere.**
> Clarence and Kenneth both clocked in Wednesday August 5 (10:07 AM and 10:40 AM) and neither
> punch was recorded.
>
> The punch photos in Drive carry exact timestamps and are a usable reconstruction basis for
> payroll. Full table in §14. Root cause and evidence in §13.

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

## 13. INCIDENT — punch writes failing since July 17, 2026

### 13.1 iPad deployment matched — steps 1–3

The `/exec` URL supplied by Taylor:

```
https://script.google.com/macros/s/AKfycbzjf8KaKh0Cs5kI1DxPVl7Na8Hmlg-PEJHb6OtmRiMpApCWsP8gu_nrryfMho8ToXEN/exec
```

| Question | Answer |
|---|---|
| Matched deployment | `AKfycbzjf8Ka…ToXEN` — **exact match**, 4th entry in the deployment list |
| Version serving the iPad | **@23** — `Point kiosk to master sheet for TIME_LOGS/SCHEDULE` |
| @23 vs editor HEAD | **IDENTICAL — zero drift** |
| Spreadsheet the iPad writes to | `117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI` → `EDP_MASTER_DATABASE`, tab `TIME_LOGS` |

The iPad is running current code. Stale deployment is **eliminated** as an explanation.

### 13.2 The punches are real — proof

`api_punch` executes in this order (`Kiosk_Main.js` 184–215):

```
1. validate PIN                    ← passes (PINs live in Script Properties)
2. _saveToDrive(face photo)        ← SUCCEEDS — files exist in Drive
3. SpreadsheetApp.openById(...)
4. _getOrCreateLog(ss)
5. sh.appendRow([7 values])        ← FAILS HERE
6. _pushPunch() / _emailPunch()    ← never reached: no Pushover, no email receipt
```

Step 2 writes a file named `<Name>_FACE_<ACTION>_<epoch_ms>.jpg` into Drive folder
**`LOGIN_PHOTOS`** (`18NJEILkQDOil_a60pXakdUNdQfwg-VtM`), resolved from the `PHOTO_FOLDER_ID`
Script Property.

**Those files exist. The matching spreadsheet rows do not.** That is the proof: the punch reached
the server, authenticated, and got as far as the photo write — then died before the row write.

Wednesday August 5:

| Time (CDT) | Employee | Action | Photo in Drive | Row in `TIME_LOGS` |
|---|---|---|---|---|
| 10:07 AM | Clarence | CLOCK_IN | ✅ `Clarence_FACE_CLOCK_IN_1785942473783.jpg` | ❌ |
| 10:40 AM | Kenneth | CLOCK_IN | ✅ `Kenneth_FACE_CLOCK_IN_1785944440329.jpg` | ❌ |

Neither clocked out. No `AUTO_CLOCKOUT` fired either (§8.2 — and it could not have written a row
regardless, since it uses the same 7-value `appendRow`).

### 13.3 Answering the four candidate modes

| Mode | Verdict |
|---|---|
| Rejected before write | **No.** PIN validation passed — otherwise `_saveToDrive` would never have run. |
| **Partially written** | **YES — this is what is happening.** The Drive photo persists; the spreadsheet row is lost. Orphaned photos with no corresponding record. |
| Silently failed | **Effectively yes, from the floor.** `withFailureHandler` fires a red `ERROR` flash for ~2.2 s, then the kiosk resets. No Pushover, no email — because both come *after* the failed write. Nothing reaches an owner. |
| Written successfully, UI not updating | **No.** The write is precisely what fails. |

### 13.4 Root cause — column-count mismatch introduced by @23

`_getOrCreateLog` (line 455) returns an existing tab untouched; it only creates and formats a
7-column tab when one is **absent**:

```js
sh.appendRow(["Timestamp","EmployeeID","Name","Action","FacePhotoId","Notes","ShoesPhotoId"]);
sh.setColumnWidths(1,7,160);
```

`api_punch` then writes **7 values**.

The two spreadsheets differ exactly where it matters:

| Target | `TIME_LOGS` header | Columns | Created by | Writes |
|---|---|---|---|---|
| `EDP_MASTER_OPS FOLDER 2026` (@22) | `… \| EmployeeID \| Name \| Action \| FacePhotoId \| Notes \| ShoesPhotoId` | **7** | `_getOrCreateLog` | worked through 7/17 |
| `EDP_MASTER_DATABASE` (@23) | `Timestamp \| EmployeeID \| Name \| Action \| PhotoFileId \| Notes` | **6** | pre-existing, not by this code | **failing** |

Two independent confirmations that master's tab was never created by this code:

1. It uses `PhotoFileId`, not `FacePhotoId`, and has no `ShoesPhotoId`.
2. A Drive full-text search for `ShoesPhotoId` returns `EDP_MASTER_OPS FOLDER 2026`,
   `EDP_MASTER_SYSTEM — OPS`, and the two script projects — **but not `EDP_MASTER_DATABASE`**.
   Had `_getOrCreateLog` ever created a tab there, that header string would exist in the file.

All 414 rows in master's `TIME_LOGS` are uniformly 6 fields, ending 4/9/2026. No 7-field row has
ever landed.

**Conclusion:** @23 repointed a 7-value writer at a pre-existing 6-column tab. `Sheet.appendRow()`
does not widen a sheet; when the array is longer than the sheet's column count it throws
`The number of columns in the data does not match the number of columns in the range`.

Confidence: **high but not executed** — I did not run code, so the exception text is inferred rather
than observed. The timing, the column evidence, and the working-vs-failing contrast between the two
targets all agree.

**Two 30-second confirmations, both zero-risk:**

1. Open `EDP_MASTER_DATABASE` → `TIME_LOGS` and check the sheet's actual column count. If it is 6,
   this is confirmed outright.
2. Apps Script editor → **Executions** → filter `api_punch`, August 5. Failed executions with a
   column-count exception confirm it directly. (This panel is the execution log; it is not reachable
   through clasp, which needs a GCP project the script is not attached to — see §15.)

### 13.5 When it broke

| Date | Evidence |
|---|---|
| 7/17 11:36 AM CDT | Joe CLOCK_IN — photo **and** presumably logged |
| **7/17 1:39 PM CDT** | **`EDP_MASTER_OPS FOLDER 2026` last modified — last successful kiosk write** |
| 7/17 4:00 PM CDT | Joe LUNCH_OUT — photo, no row |
| 7/17 6:08 PM CDT | Joe LUNCH_IN + CLOCK_OUT — photos, no row |
| 7/18 onward | every punch — photos, no rows |

**@23 was deployed on July 17, 2026, between 1:39 PM and 4:00 PM CDT.** Everything after is lost.

---

## 14. Reconstructed punch record — 56 unlogged events

From `LOGIN_PHOTOS` filename timestamps (`Date.now()` at punch time), converted to CDT. **This is
the only surviving record of this time.** Photos: Joe 23, Kenneth 18, Clarence 15.
Actions: 24 CLOCK_IN, 25 CLOCK_OUT, 4 LUNCH_OUT, 3 LUNCH_IN.

| Date | Punches (CDT) |
|---|---|
| Sat 7/18 | 10:59 Kenneth IN · 11:03 Clarence IN · 11:39 Clarence OUT · 14:49 Kenneth OUT · 16:44 Clarence OUT · 16:46 Clarence OUT · 17:01 Clarence IN · 17:28 Clarence OUT |
| Mon 7/20 | 11:55 Joe IN · 12:38 Joe LUNCH_OUT |
| Tue 7/21 | 12:55 Joe IN · 12:55 Joe OUT · 12:56 Joe IN · 14:43 Joe LUNCH_OUT · 15:10 Clarence IN · 17:02 Joe LUNCH_IN · 17:03 Clarence OUT |
| Thu 7/23 | 12:39 Joe OUT · 12:40 Joe IN · 15:34 Joe OUT |
| Fri 7/24 | 11:45 Joe IN · 16:23 Joe OUT |
| Tue 7/28 | 12:02 Joe IN · 17:39 Joe OUT |
| Wed 7/29 | 12:39 Kenneth IN · 14:58 Clarence IN · 14:59 Kenneth LUNCH_OUT · 15:30 Kenneth LUNCH_IN · 18:01 Kenneth OUT · 18:02 Clarence OUT |
| Thu 7/30 | 09:55 Clarence IN · 12:34 Clarence OUT · 12:41 Joe IN · 15:16 Joe OUT |
| Fri 7/31 | 10:50 Kenneth IN · 13:20 Kenneth LUNCH_OUT · 13:51 Joe IN · 14:19 Kenneth LUNCH_IN · 17:02 Joe OUT · 17:02 Joe OUT · 17:03 Kenneth OUT |
| Sat 8/1 | 09:56 Kenneth IN · 13:23 Kenneth OUT |
| Mon 8/3 | 11:46 Kenneth IN · 11:53 Joe IN · 13:48 Kenneth OUT · 13:48 Kenneth OUT · 15:17 Joe OUT |
| Tue 8/4 | 10:32 Kenneth IN · 11:56 Joe IN · 12:47 Clarence IN · 14:29 Kenneth OUT · 16:55 Clarence OUT · 17:01 Joe OUT |
| **Wed 8/5** | **10:07 Clarence IN · 10:40 Kenneth IN** *(no clock-outs)* |

**Caveats for payroll use:**

- Duplicate adjacent entries (7/31 Joe 17:02 ×2, 8/3 Kenneth 13:48 ×2, 7/18 Clarence 16:44/16:46)
  are double-taps, not separate punches.
- Photo timestamps are **device** time captured at upload, not server-authoritative time.
- Only punches that carry a photo appear here. Any punch where the camera was skipped left no trace
  at all, so **this table is a floor, not a complete record.**
- 44 checklist photos (`*_CHK_*`) exist in the same window; those `CHECKLIST_*` writes also failed.
- Employees should confirm their own hours before these figures are paid.

---

## 15. Execution logs — not reachable read-only

`clasp tail-logs` returns `GCP project ID is not set, unable to continue.` The project uses the
default hidden GCP project, and attaching a standard one would modify LIVE project settings, which
is outside authorization. The Apps Script editor's **Executions** panel shows the same data and
needs no change — that is the route to the actual exception text (§13.4).

---

## 16. Existing TEST environment — findings

| Asset | Exists? | Detail |
|---|---|---|
| `Copy of EDP_Kiosk_V2 TEST` (script) | **Yes** | Points at `1laPGf…` = `EDP_MASTER_OPS FOLDER 2026`, a **production** sheet. 2 live deployments (`@HEAD`, `@10`). Not isolated. |
| A kiosk TEST spreadsheet | **No** | Title search for `Kiosk_TEST` / `EDP_Kiosk_TEST` / `KIOSK TEST` returns only the script above. No `EDP_Kiosk_TEST_DATA` exists. |
| `TEST — EDP Operations App` + `— DATA` | Yes, unrelated | Belongs to EO-013/015, isolated, not kiosk. |

**No usable kiosk TEST environment exists.** The one thing named TEST writes to production data.

Note: because that project shares `EDP_MASTER_OPS FOLDER 2026` — which has a **correct 7-column**
`TIME_LOGS` — its punches would still write successfully. If anyone opens either of its two URLs,
rows land in a production spreadsheet.

---

## 17. Recommended next steps

**EO-016 is no longer the most urgent item.** A production outage is losing wage records daily.

**Immediate — stop the bleeding (needs approval; each is a LIVE change):**

1. **Confirm the cause** — check `TIME_LOGS` column count, or the Executions panel (§13.4). Zero risk,
   no approval needed.
2. **Restore logging.** Two options:
   - **(a) Widen the target** — add a 7th column to `EDP_MASTER_DATABASE` → `TIME_LOGS`. One
     spreadsheet edit, no code change, no redeploy. Lowest risk, fastest.
   - **(b) Roll back to @22** — repoints at `EDP_MASTER_OPS FOLDER 2026`, which has a working
     7-column tab. Restores logging immediately but splits history across two spreadsheets, and that
     tab is banner-flagged as TEST data.

   **(a) is the recommendation.** It fixes the defect where it exists and keeps history in one place.
3. **Preserve the photo evidence** before Drive retention or cleanup touches `LOGIN_PHOTOS`. It is
   currently the only record of 19 days of work.
4. **Reconstruct and approve the missing time** with each employee (§14), then enter it as owner
   corrections with reasons — not as invented punches.

**Then, for the TEST build** — plan shape unchanged, with these corrections:

5. First code change in TEST: move `KIOSK_SHEET_ID` from a literal to a Script Property (§5). This
   incident is exactly what a hardcoded environment binding causes.
6. Rewrite the 5:15 PM check as a window + idempotency guard, with a missed-window alert (§8.2).
7. **Make write failure loud.** `api_punch` must verify the row landed and, on failure, alert the
   owner and tell the employee their punch was not recorded. A payroll write that can fail silently
   for 19 days is the deeper defect — bigger than the column mismatch that triggered it.
8. Validate the target schema at boot: if the log tab is too narrow or misnamed, refuse to start and
   alert, rather than failing per-punch.
9. Borrow the OPS v1.2.0 design — void-not-delete, LockService, exceptions table (§9).

Stopping here. No further action without approval.
