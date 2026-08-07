# EO-016 — Authoritative LIVE Source Map (Read-Only Verification)

**Date:** August 6, 2026 — updated 01:0x CDT after iPad deployment ID was supplied
**Authorization:** READ-ONLY VERIFICATION ONLY
**Status:** COMPLETE — all 8 steps answered.

> ## ✅ CORRECTION — August 6, 2026: THERE IS NO OUTAGE
>
> **The reported 19-day outage was my error. It is retracted in full.** Punch logging has been
> working the whole time.
>
> Verified by Taylor against the live sheet: `TIME_LOGS` extends to **at least row 1158** and
> contains **August 5 and August 6** punch records — including Clarence and Kenneth clocking in on
> Aug 5, and Joe and Clarence on Aug 6.
>
> **Cause of my error:** the Google Drive text export silently truncated the `TIME_LOGS` tab at
> **row 414** and continued rendering the next tab with no marker, no ellipsis, and no warning. I
> read rows 2–415 of 1158 and treated the cut as the end of the data (§13.1).
>
> **Retracted:** the 19-day outage, the 56 "lost" punch events, the column-count root cause, and
> the emergency schema repair. `docs/EO-016-EMERGENCY-SCHEMA-REPAIR-PLAN.md` is **WITHDRAWN — do
> not execute.** No column G. No LIVE change.
>
> **Still valid:** everything derived from clasp and the Apps Script source — deployment match,
> zero drift, the hardcoded binding, the `_autoClockOut` location, the TEST-copy finding, and the
> security notes. See §13.3 for the clean split.

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

## 6. Clarence and Kenneth punch records — FOUND (corrected)

> **This section originally read "NOT FOUND" and concluded an outage. That was wrong.** It is
> rewritten below with the verified answer. The error analysis is in §13.

### 6.1 A timing note

At the time of the original inspection it was **00:16 Thursday, August 6, 2026** America/Chicago.
The store runs 10:00 AM – 5:00 PM, so "today" in the original instruction meant **Wednesday,
August 5**. That framing was correct and is unchanged.

### 6.2 Kenneth is a configured employee

From `Kiosk_Main.js` (roster hardcoded, lines 22–28) — source-derived, still valid:

| ID | Name | Weekly hrs | Rate | Email |
|---|---|---|---|---|
| JOE | Joe | 20 | 23.00 | thedepotedelivery@gmail.com |
| CLARENCE | Clarence | 10 | 12.00 | *(none)* |
| **KENNETH** | **Kenneth** | **20** | **13.00** | lane44802@gmail.com |
| YVONNE | Yvonne | 8 | 7.25 | landryyvonne15@gmail.com |
| TAYLOR | Taylor | 20 | 20.00 | thedepote@gmail.com |

### 6.3 Their punch records exist and are current

Verified by Taylor against the live sheet:

| Date | Records present in `TIME_LOGS` |
|---|---|
| **Wed Aug 5** | Clarence clock-in, Kenneth clock-in |
| **Thu Aug 6** | Joe clock-in, Clarence clock-in |

`TIME_LOGS` extends to at least **row 1158**. Headers confirmed as:

```
Timestamp | EmployeeID | Name | Action | PhotoFileId | Notes
```

**Answer to the original question:** Wednesday's Clarence and Kenneth punches are in
`EDP_MASTER_DATABASE` (`117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI`), tab **`TIME_LOGS`** — the
spreadsheet the active @23 deployment writes to. Everything is where it should be.

### 6.4 Why the original answer was wrong

The Drive text export silently truncated `TIME_LOGS` at row 414. I read the first third and treated
the cut as the end of the data, then reported a search of that truncated text as a fact about the
sheet. Full analysis in §13.

## 7. Exact tab and spreadsheet — ANSWERED

**Configured destination (active @23):** `EDP_MASTER_DATABASE`
(`117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI`), tab **`TIME_LOGS`**.

Row shape written by `api_punch` (line 205) — 7 values:

```
[ timestamp, employeeId, name, action, facePhotoId, notes, shoesPhotoId ]
```

The tab header in `EDP_MASTER_DATABASE` has 6 named columns
(`Timestamp | EmployeeID | Name | Action | PhotoFileId | Notes`) — no `ShoesPhotoId`. The 7th value
lands in an unnamed 7th column, which the sheet has: **writes succeed.** Confirmed by Aug 5 and
Aug 6 records being present. This is a **cosmetic** header gap, not a functional defect — `appendRow`
validates against the sheet's column count, not the header row. Worth labelling in TEST; **do not
change LIVE for it** (§10).

**Actual destination of Wednesday's punches: this tab.** Confirmed present. See §6.3.

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

> **Retracted:** this section originally claimed "only 4 `AUTO_CLOCKOUT` events exist across the
> whole log, on days where many more shifts ended without a clock-out." That count came from the
> truncated export (rows 2–415 of 1158) and is **not evidence of anything**. The real frequency is
> unverified — see §14.2. The code-level fragility described above stands on its own, from reading
> the source.

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

## 13. CORRECTED — no outage; what went wrong in my inspection

### 13.1 The reading error

The authoritative kiosk time log is, and always was:

```
117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI   →  EDP_MASTER_DATABASE   →  tab TIME_LOGS
```

I identified the correct spreadsheet and the correct tab. **What I got wrong was its contents.**

The Google Drive connector's text rendering of a large spreadsheet **silently caps rows per tab.**
For `TIME_LOGS` it emitted 414 data rows, ending at 4/9/2026, then a blank line, then the next tab
(`SCHEDULE`). There is no truncation marker, no ellipsis, no row count — nothing distinguishes a
capped table from a complete one.

Verified in the saved export: the table ends at line 506, and line 508 begins
`| EmployeeID | Name | DayOfWeek | ClockInTime | ClockOutTime | Active |`. It reads exactly like a
table that ended naturally.

**Actual state:** `TIME_LOGS` extends to at least **row 1158**, with August 5 and 6 records present.
I saw roughly the first third and treated it as the whole.

### 13.2 What that error caused

Every downstream conclusion inherited it:

| Claim | Status |
|---|---|
| "TIME_LOGS ends 4/9/2026" | **Wrong** — artifact of the row cap |
| "Kenneth has never appeared in any punch record" | **Wrong** — his rows are past row 415. `KENNETH: 0` was a search of a truncated export, not of the sheet |
| "19-day outage, punch writes failing since 7/17" | **Wrong** — no outage occurred |
| "56 punch events have no time record" | **Wrong** — those photos have matching rows I could not see |
| "Root cause: 7-value `appendRow` into a 6-column tab" | **Wrong, and disproven** — punches land in a 6-header tab daily, so the sheet's column count is ≥ 7 (default 26). `appendRow` validates against the sheet's width, not the header row |
| "Emergency schema repair needed" | **Withdrawn** — no repair, no column G |
| "@23 broke logging on July 17" | **Wrong** — the @23 repoint worked correctly |

A compounding mistake: I searched the *export* for `KENNETH`, got zero hits, and reported that as a
fact about the *spreadsheet*. A negative result from a source of unknown completeness is not evidence
of absence, and I presented it as though it were.

### 13.3 What survives — the clean split

The dividing line is sharp and worth keeping:

| Source | Reliability here |
|---|---|
| **clasp / Apps Script source** — deployments, versions, diffs, code | **Held up completely.** Every finding verified against the live project is intact |
| **Drive text export of a large spreadsheet** | **Unreliable.** Silently truncates; produced every wrong conclusion |

Still valid, all clasp- or source-derived:

- iPad `/exec` → **@23**, exact match; **@23 byte-identical to editor HEAD** (§13.4)
- `KIOSK_SHEET_ID` **hardcoded** at `Kiosk_Main.js` line 15; `KIOSK_LOG_TAB = "TIME_LOGS"` (§5)
- `_autoClockOut()` at line 329, called line 306, `checkScheduleAlerts` trigger every minute (§8)
- Kenneth provisioned in `KIOSK_EMPLOYEES` (§6.2)
- `Copy of EDP_Kiosk_V2 TEST` points at `EDP_MASTER_OPS FOLDER 2026`, two live deployments (§16)
- Manifest: `America/Chicago`, `USER_DEPLOYING`, `ANYONE_ANONYMOUS` (§2)
- Security findings: plaintext PINs, Pushover token, anonymous access (§11)

### 13.4 Deployment match and drift — unchanged

| Question | Answer |
|---|---|
| Matched deployment | `AKfycbzjf8Ka…ToXEN` — exact match |
| Version serving the iPad | **@23** |
| @23 vs editor HEAD | **IDENTICAL — zero drift** |
| Target | `EDP_MASTER_DATABASE` → `TIME_LOGS` — **confirmed correct and receiving writes** |

### 13.5 August 5 reassessed — no punch failure

| Time (CDT) | Employee | Action | Photo | Row in `TIME_LOGS` |
|---|---|---|---|---|
| 10:07 AM | Clarence | CLOCK_IN | ✅ | ✅ present |
| 10:40 AM | Kenneth | CLOCK_IN | ✅ | ✅ present |

August 6 records are present too (Joe and Clarence clock-ins). The photo/row pairing is intact —
`_saveToDrive` and `appendRow` both complete, which also means `_pushPunch` and `_emailPunch` are
being reached.

**There is no punch-failure incident.** `LOGIN_PHOTOS` remains a useful corroborating audit trail,
but it is not the sole record of anything.

---

## 14. The 5:15 PM auto clock-out — reassessed, now UNVERIFIED

Two claims must be separated, because only one was ever data-dependent.

### 14.1 Code-level observation — still stands

Line 306 is unchanged:

```js
if (nowMin === 17*60 + 15) _autoClockOut(ss, now);
```

Exact equality on a single minute, driven by a trigger with no per-minute delivery guarantee. If
`checkScheduleAlerts` does not execute during minute 1035, that day's auto clock-out never fires —
no retry, no catch-up, no alert. The 4:55 / 5:00 / 5:05 rungs share the pattern. This is a fact about
the code, verified by reading it, independent of any spreadsheet.

### 14.2 Real-world failure rate — retracted, unknown

My earlier claim that "only 4 `AUTO_CLOCKOUT` events exist in five months, therefore it is broken"
came from the truncated export. Rows 415–1158 were never examined. **There may be many
`AUTO_CLOCKOUT` rows since April.**

**Current status: unverified.** The design fragility is real; whether it actually misfires is
unknown, and I will not assert either way without the data. To settle it, see §18.

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

## 17. Recommended next steps — corrected

**There is no emergency.** The outage was my error. `EO-016-EMERGENCY-SCHEMA-REPAIR-PLAN.md` is
withdrawn; no LIVE change is warranted or requested.

**Do not do any of these** (all were recommended under the mistaken diagnosis):

- ~~Add column G to `TIME_LOGS`~~ — unnecessary; writes already succeed
- ~~Roll back to @22~~ — @23 is correct and working
- ~~Reconstruct 19 days of payroll from photos~~ — nothing is missing
- ~~Treat `LOGIN_PHOTOS` as sole evidence~~ — it is corroborating, not primary

**Read-only, to close the last open question (§18):**

1. Confirm whether the 5:15 PM auto clock-out is actually firing. One filter on `TIME_LOGS`.

**Then EO-016 resumes as originally scoped** — build in TEST, no LIVE change:

2. First code change in TEST: move `KIOSK_SHEET_ID` from a literal to a Script Property (§5). Still
   the right call — a hardcoded environment binding is what makes TEST/LIVE separation impossible.
3. Rewrite the 5:15 PM check as a window + idempotency guard with a missed-window alert (§8) —
   justified by code inspection regardless of §18's outcome.
4. Label the 7th column in the **TEST** copy of `TIME_LOGS` (§7). Cosmetic; do not touch LIVE.
5. Decide on the TEST copy's two live deployments pointing at production data (§16).
6. Borrow the OPS v1.2.0 design — void-not-delete, LockService, exceptions table (§9).
7. Owner decision on the security findings — plaintext PINs, anonymous web-app access (§11).

---

## 18. The one open question — read-only

**Is the 5:15 PM auto clock-out firing?** Unverified since my count came from truncated data (§14.2).

In `TIME_LOGS`, filter or search column **D** (`Action`) for **`AUTO_CLOCKOUT`** and report:

- how many rows match
- the date of the most recent one
- roughly how they distribute since April

| Result | Interpretation |
|---|---|
| Regular entries through August | Trigger is firing reliably. The equality bug is a latent risk, not an active fault. Priority drops. |
| Nothing since April 9 | Trigger has not fired in ~4 months. Real fault, and shifts have been closing without auto clock-out. Priority rises. |
| Sporadic | Consistent with the equality bug — firing only when the trigger happens to land on minute 1035. |

Useful alongside it: whether Taylor receives the 4:55 / 5:00 / 5:05 Pushover alerts on a normal
workday. Those share the same exact-minute pattern, so if they arrive reliably the trigger is
healthy and the risk is theoretical.

---

## 19. Method note — for the rest of this project

The failure mode is worth carrying forward, because it will recur:

**The Drive text export of a large spreadsheet silently truncates.** It caps rows per tab, emits no
marker, and a truncated table is indistinguishable from a complete one. It must not be used to
establish that data is absent.

Two rules for the remainder of EO-016:

1. **Never conclude absence from that export.** "X does not appear" means "X does not appear in an
   unknown fraction of the data." Confirm against the sheet — row count via `Ctrl+End`, or a filter.
2. **Prefer clasp and source reads.** Everything drawn from the Apps Script project held up exactly;
   everything drawn from the spreadsheet export did not.
