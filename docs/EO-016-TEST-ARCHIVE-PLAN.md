# EO-016 — EDP Kiosk TEST Build: Creation & Backup Plan

**Status:** AWAITING TAYLOR APPROVAL — nothing has been created, copied, modified, or deployed.
**Date prepared:** August 6, 2026 · **Last reconciled:** August 6, 2026
**Task:** EO-016 — Kiosk Attendance Compliance and Punch Exception Controls
**Authoritative LIVE source:** `EDP_MASTER_DATABASE` (`117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI`) → tab `TIME_LOGS` — **confirmed**

> This document has been reconciled against completed read-only verification. All conditional and
> blocked branches are resolved. Change history is in §9.

---

## 0. Standing prohibitions honored in this document

No action described below has been executed:

- LIVE `EDP_Kiosk_V2` was **not** modified, pushed to, renamed, or deployed. It was cloned read-only.
- No LIVE deployment was created or changed.
- No write of any kind was made to `EDP_MASTER_DATABASE` or any other LIVE spreadsheet.
- No Script Property was read or changed on any project.
- No trigger was created, modified, or deleted.

---

## 1. Verified inventory — all confirmed

### 1.1 LIVE Apps Script project

| Field | Value |
|---|---|
| Title | `EDP_Kiosk_V2` |
| Script ID | `1k3qXZU4Dnb42QHggds-BFmgd3iA1Za-rhWM7apzeRKIA-l9qgOtBBhqp` |
| Internal version | v2.6.0 |
| Owner | thedepote@gmail.com |
| Project type | Standalone (not container-bound) |
| Files | `appsscript.json`, `Kiosk_Main.js` (602 lines), `Kiosk.html` |
| Manifest | `America/Chicago` · V8 · `executeAs: USER_DEPLOYING` · `access: ANYONE_ANONYMOUS` |
| Active deployment | **@23** — `AKfycbzjf8Ka…ToXEN`, the URL on the kiosk iPad |
| Editor vs @23 | **Byte-identical — zero drift** |

**Spreadsheet binding — CONFIRMED HARDCODED** at `Kiosk_Main.js` line 15:

```js
var KIOSK_SHEET_ID    = "117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI";
var KIOSK_LOG_TAB     = "TIME_LOGS";
```

Not a Script Property, not a config sheet, not container binding. `PropertiesService` is used only for
PIN hashes and face-reference photo IDs.

**This is the condition that makes TEST/LIVE separation impossible today** — the environment can only
be switched by editing a literal and redeploying. Converting it to a Script Property is the first TEST
code change (§4.2 step 4).

### 1.2 Existing TEST-named project — NOT usable

| Field | Value |
|---|---|
| Title | `Copy of EDP_Kiosk_V2 TEST` |
| Script ID | `1hExChp4Z9q9fwwrGKAAwoF1vLqigaXY7b8-QvMBx9-ZpxuyLMP8aLcow` |
| Binding | Line 31 → `1laPGfSQnRXlPYPfRxR8vlDqOglCYgSuSK7FL2nmiQIo` = **`EDP_MASTER_OPS FOLDER 2026`** |
| Deployments | **2 live** — `…FrQ @HEAD` and `…R4sm @10` |
| Last modified | 2026-04-01 |

**Verified, not suspected: this project writes to a production spreadsheet** — the one LIVE @22 used —
and has two reachable URLs. Anyone opening either writes production rows.

**Disposition:** classify `POSSIBLE SUPERSEDED COPY`. Leave in place, **do not execute**, do not adopt
as TEST, do not delete without approval. Its two live deployments need a separate decision (§8).

### 1.3 Authoritative LIVE spreadsheet — CONFIRMED

| Field | Value |
|---|---|
| Title | `EDP_MASTER_DATABASE` |
| File ID | `117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI` |
| Log tab | `TIME_LOGS` |
| Extent | At least **row 1158**, current through August 6, 2026 |
| Headers | `Timestamp \| EmployeeID \| Name \| Action \| PhotoFileId \| Notes` |
| Drive parent | 🏗️ EDP OS — ALL SYSTEMS MASTER BUILD FOLDER (`1z4MM-4fwZFZCAMGEsBcbRd-2PtPMv9lo`) |

Confirmed two ways: by reading the LIVE binding (§1.1), and by Taylor verifying live contents. Punch
logging is working normally.

**This workbook is shared.** It also holds Register, AI-receptionist call log, Picker Portal, and
audit tables. That matters for both the archive (§5) and the TEST scrub (§4.2).

**Row shape note:** `api_punch` writes 7 values into a tab with 6 named headers. The 7th lands in an
unnamed column and **writes succeed** — this is cosmetic, not a defect. It will be labelled in TEST.
**No LIVE change for it.**

---

## 2. Prerequisite verification — COMPLETE

All read-only verification this plan was gated on has been performed:

| Check | Result |
|---|---|
| clasp authenticated | ✅ `thedepote@gmail.com` |
| LIVE source pulled read-only | ✅ 3 files, into a throwaway scratchpad |
| Deployments and versions enumerated | ✅ 4 deployments, 23 versions |
| iPad `/exec` matched to a version | ✅ **@23** |
| Editor-vs-deployment drift | ✅ **Zero** |
| Spreadsheet binding identified | ✅ Hardcoded, line 15 |
| 5:15 PM implementation located | ✅ §3 |
| TEST copy inspected | ✅ §1.2 |

`clasp push` was never run. No LIVE resource was modified.

**Not obtainable read-only:** Apps Script execution logs. `clasp tail-logs` requires a GCP project the
script is not attached to, and attaching one would modify LIVE project settings. The editor's
**Executions** panel shows the same data and needs no change.

---

## 3. The 5:15 PM automatic clock-out — located and assessed

### 3.1 Location — confirmed

| Attribute | Value |
|---|---|
| Function | `_autoClockOut(ss, now)` |
| File | `Kiosk_Main.js` — **defined line 329** |
| Call site | **line 306**, inside `checkScheduleAlerts` |
| Trigger | `checkScheduleAlerts`, time-based, **every 1 minute** — installer at line 439 |
| Project / deployment | `EDP_Kiosk_V2` / @23 |
| Writes to | `EDP_MASTER_DATABASE` → `TIME_LOGS` |

Closeout ladder: 4:55 PM heads-up · 5:00 PM still-in list · 5:05 PM manager alert · **5:15 PM auto
clock-out**.

### 3.2 Status — NEEDS CORRECTION / UNRELIABLE

Verified by Taylor against the live sheet:

| Month | `AUTO_CLOCKOUT` records |
|---|---|
| April 2026 | 11 |
| May 2026 | 13 |
| June 2026 | 2 |
| July 2026 | 0 |
| August 2026 | 0 |

**Total 26. Last fired June 5, 2026.** It worked, degraded, then stopped — a gradual decline, not a
clean cutoff.

Three defects, which must be fixed together:

| # | Defect | Effect |
|---|---|---|
| D1 | Trigger opens the 367 KB workbook 1,440×/day; each closeout check re-reads all 1,158 rows | Trigger-runtime quota exhausted; late-day work dies first. **Primary cause** |
| D2 | `if (nowMin === 17*60+15)` exact-minute equality | Turns degradation into total failure |
| D3 | `_getStillClockedIn` has no date filter | An old unclosed `CLOCK_IN` reads as "IN" forever; fixing D1/D2 alone would write phantom shifts |

Full analysis and the fix design: `EO-016-AUTOCLOCKOUT-TEST-PLAN.md`. **TEST only.**

---

## 4. TEST environment creation plan

Executed **only after** Taylor gives the approval in §10.

### 4.1 Naming

| Asset | Name |
|---|---|
| TEST Apps Script project | `EDP_Kiosk_TEST` — **created fresh** |
| TEST spreadsheet | `EDP_Kiosk_TEST_DATA` — **created fresh** |
| TEST deployment | New web app, own `/exec` URL |

No STAGING environment, per approved item 6. `Copy of EDP_Kiosk_V2 TEST` is **not** reused (§1.2).

### 4.2 Creation order — data first, code second

Deliberate: the TEST spreadsheet exists and its ID is captured **before** any TEST code can execute,
so TEST can never run while still pointing at LIVE.

1. **Create the TEST spreadsheet.** Drive-copy `EDP_MASTER_DATABASE` → `EDP_Kiosk_TEST_DATA`, into a
   new `EDP Kiosk TEST` subfolder of the master build folder. Record the new file ID.

2. **Scrub TEST data** — in `EDP_Kiosk_TEST_DATA` only:
   - Employee emails → non-routable test addresses, so no TEST run can reach Joe, Kenneth, Clarence,
     or Yvonne.
   - Preserve punch history structurally — it is the fixture the exception logic needs.
   - Add a visible `ENVIRONMENT = TEST` marker.
   - Review the non-kiosk tabs inherited from the shared workbook (Register, call log, Picker Portal,
     audit) and neutralize anything that could act on real data.

3. **Create the TEST script project.** `clasp create --title "EDP_Kiosk_TEST" --type standalone`, then
   copy in the LIVE source from the read-only clone. Separate script ID. **LIVE is never pushed to.**

4. **Repoint the binding — before first execution.** The LIVE binding is a hardcoded literal (§1.1),
   so the first TEST code change is to replace it with a Script Property lookup, then point that
   property at `EDP_Kiosk_TEST_DATA`. This removes the root condition that makes environment
   separation impossible.

5. **Set TEST Script Properties** — on the TEST project only:

   | Property | Value |
   |---|---|
   | `ENVIRONMENT` | `TEST` |
   | `SPREADSHEET_ID` | *(TEST spreadsheet ID from step 1)* |
   | `LIVE_SPREADSHEET_ID` | *(deliberately absent — TEST gets no path to LIVE)* |
   | `NOTIFICATIONS_ENABLED` | `false` |
   | `AUTO_CLOCKOUT_ENABLED` | `false` *(until explicitly enabled per test)* |

   LIVE Script Properties are not read and not changed.

6. **Install a TEST-only guard.** A startup assertion that throws if the resolved spreadsheet ID
   equals the LIVE ID, or if `ENVIRONMENT !== 'TEST'`. Makes "TEST writes to LIVE" a hard failure
   rather than a silent one.

7. **Create the TEST deployment** — new web app on the TEST project, own `/exec` URL, recorded in the
   tracker. LIVE deployments untouched.

8. **Do not install a TEST 5:15 PM trigger yet.** Auto clock-out stays disabled until the fix in
   `EO-016-AUTOCLOCKOUT-TEST-PLAN.md` is approved and built.

### 4.3 Isolation verification — before any feature work

TEST is not accepted until all five pass:

1. TEST `SPREADSHEET_ID` ≠ LIVE ID — asserted in code, not eyeballed.
2. A write through the TEST URL lands in `EDP_Kiosk_TEST_DATA`, and LIVE `modifiedTime` is unchanged.
3. TEST project timezone is `America/Chicago`.
4. TEST trigger list contains no trigger inherited from LIVE.
5. TEST emails route only to test addresses — verified by sending one.

---

## 5. ARCHIVE backup plan

Executed **before** §4, and before any TEST implementation.

### 5.1 Backup target — RESOLVED

**`EDP_MASTER_DATABASE`** (`117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI`) — the sole LIVE kiosk
target, confirmed at `Kiosk_Main.js` line 15.

No second spreadsheet needs archiving. `EDP_MASTER_OPS FOLDER 2026` was the @22 target and is
superseded.

### 5.2 Archive location

New folder `ARCHIVE — EDP Kiosk LIVE — 2026-08-06`, inside 🏗️ EDP OS — ALL SYSTEMS MASTER BUILD
FOLDER (`1z4MM-4fwZFZCAMGEsBcbRd-2PtPMv9lo`).

### 5.3 Archive contents

| Item | Method |
|---|---|
| LIVE source snapshot | Read-only clone, committed to this branch under `archive/kiosk-live-2026-08-06/` |
| LIVE spreadsheet copy | Drive copy → `ARCHIVE — EDP_Kiosk LIVE DATA — 2026-08-06` (copy, not move) |
| LIVE spreadsheet XLSX export | Drive export — readable without Google |
| Deployment + version manifest | Already captured: 4 deployments, 23 versions, @23 active |
| LIVE `appsscript.json` | From the clone |
| This plan | `docs/EO-016-TEST-ARCHIVE-PLAN.md` |

**Not archived:** Script Properties — outside read-only scope, and they contain secrets that must not
enter git. **Trigger inventory** — enumerating triggers requires executing `ScriptApp.getProjectTriggers()`,
which is outside read-only authorization. Recorded here as a known gap rather than a completed item.

### 5.4 Archive verification

Before §4 begins: archive spreadsheet opens and row count matches the original; source snapshot file
list and sizes match the clone; git commit exists on the remote; LIVE `modifiedTime` unchanged.

---

## 6. Execution order on approval

| # | Step | Gate |
|---|---|---|
| 1 | ARCHIVE backup (§5) | Verified per §5.4 |
| 2 | Create TEST spreadsheet + scrub (§4.2 1–2) | ID recorded |
| 3 | Create TEST project, repoint binding, set properties, install guard (§4.2 3–6) | Guard asserts |
| 4 | Create TEST deployment (§4.2 7) | URL recorded |
| 5 | Isolation verification (§4.3) | All 5 pass |
| 6 | Auto clock-out fix in TEST | **Separate approval** — `EO-016-AUTOCLOCKOUT-TEST-PLAN.md` |
| 7 | Wider EO-016 feature work in TEST | **Separate approval** |
| 8 | Any promotion to LIVE | **Separate approval** — not covered by this plan |

Nothing begins until §10 is given.

---

## 7. Design decisions — DECIDED August 6, 2026

Requirements for the TEST build. **Not yet implemented.**

| # | Decision |
|---|---|
| 1 | **`LUNCH_OUT` at 5:15 PM = FLAG FOR OWNER REVIEW**, not a verified auto-close |
| 2 | **Stale unclosed shifts = OWNER EXCEPTION**, not auto-closed and not ignored |
| 3 | **Auto-close window = 45 minutes in TEST**, with idempotency, rows marked **unverified / system-generated** |
| 4 | **Historical July/August cleanup = READ-ONLY COUNT FIRST**; no retroactive correction without review |

Implementation detail: `EO-016-AUTOCLOCKOUT-TEST-PLAN.md` §6.

Decision 3 carries a schema consequence for the TEST spreadsheet: system-generated closes must stay
distinguishable from employee-entered ones, so payroll never treats an unverified placeholder as a
confirmed end time.

---

## 8. Open questions for Taylor

Neither blocks approval; both need an answer eventually.

1. **`Copy of EDP_Kiosk_V2 TEST` has two live deployment URLs pointing at a production spreadsheet**
   (§1.2). Leave dormant as `POSSIBLE SUPERSEDED COPY`, or undeploy those URLs? *Recommendation:
   undeploy them* — they are a standing write path into production with no owner.
2. **Confirm `EDP_MASTER_DATABASE` may be copied.** 367 KB, shared with Register, Make Ready, and
   accounting. The copy is read-only against the original, but a full duplicate into a TEST folder
   should be explicitly acceptable to you.

---

## 9. Change history

| Date | Change |
|---|---|
| Aug 6 | Original plan written. LIVE spreadsheet listed as a *candidate*; drift check *blocked* on clasp authentication |
| Aug 6 | clasp authenticated. Drift check completed: @23 matched, zero drift, binding confirmed hardcoded at line 15 |
| Aug 6 | **Reported a 19-day punch-logging outage. This was an error** — the Drive text export silently truncated `TIME_LOGS` at row 414 of 1158. Retracted in full; the emergency schema repair plan derived from it is **WITHDRAWN**. Analysis: source map §13 |
| Aug 6 | `TIME_LOGS` confirmed current through Aug 6 and healthy. `EDP_MASTER_DATABASE` confirmed as the sole authoritative LIVE source; §5.1 conditional resolved |
| Aug 6 | Auto clock-out verified NEEDS CORRECTION / UNRELIABLE — 26 records, last June 5, 2026 |
| Aug 6 | Four design decisions recorded (§7) |
| Aug 6 | **This reconciliation.** Removed "candidate, not confirmed" and "BLOCKED on clasp" language and the retracted 4/9 punch-log finding from the active plan body. History preserved here |

**Superseded claims — for the record, not for action:** the LIVE spreadsheet was never merely a
candidate; the drift check is no longer blocked; the punch log does not end 4/9/2026; there was no
outage; the "only 4 `AUTO_CLOCKOUT` events" figure was wrong (verified: 26).

---

## 10. Approval wording required before creation begins

> **APPROVED — CREATE EO-016 TEST ENVIRONMENT AND ARCHIVE.**
>
> Authorized:
> 1. Create archive folder `ARCHIVE — EDP Kiosk LIVE — 2026-08-06` and copy `EDP_MASTER_DATABASE` into it
> 2. Create TEST spreadsheet `EDP_Kiosk_TEST_DATA` and scrub it
> 3. Create TEST Apps Script project `EDP_Kiosk_TEST`
> 4. Set TEST Script Properties on that project only
> 5. Create one TEST web-app deployment
> 6. Run TEST isolation verification
>
> Not authorized: any LIVE change, LIVE deploy, LIVE Script Property change, LIVE trigger change,
> `clasp push` to LIVE, or any write to `EDP_MASTER_DATABASE`.
>
> Stop after TEST isolation verification.

**Until that wording is given, nothing is created or modified.**
