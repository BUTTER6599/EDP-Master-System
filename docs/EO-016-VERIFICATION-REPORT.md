# EO-016 — Read-Only Verification Report

**Date:** August 6, 2026
**Authorization:** READ-ONLY VERIFICATION ONLY
**Status:** PARTIAL — 6 of 10 steps blocked on clasp authentication, which requires Taylor.

> ## ⚠️ SUPERSEDED IN PART — see `EO-016-AUTHORITATIVE-SOURCE-MAP.md`
>
> clasp has since been authenticated and the blocked steps completed. Two conclusions below are
> now corrected:
>
> **§3 — "today's punches are not in this Drive account."** Correct as far as it went, but the
> inference was wrong. Punches are not missing from Drive — they are missing from the
> **spreadsheet**. The kiosk has been uploading punch photos to Drive and then failing to write
> the time record since **July 17, 2026**. At least 56 punch events are unlogged.
> The photos are the surviving evidence.
>
> **§4 — spreadsheet binding "narrowed, unresolved."** Now resolved: **hardcoded** at
> `Kiosk_Main.js` line 15 → `EDP_MASTER_DATABASE`, tab `TIME_LOGS`. Not a Script Property.
>
> **§5.2 — 5:15 PM auto clock-out "not in this file."** Correct: it is in `EDP_Kiosk_V2`,
> `_autoClockOut()` at line 329, fired by a one-minute `checkScheduleAlerts` trigger.
>
> Everything else below — the clasp blocker, the missing `142367e` baseline, the two-timeclock
> finding — stands as written.

**Nothing was created, deployed, pushed, copied, or written.** No Script Property was read or changed.
No trigger was created. No LIVE or TEST project or spreadsheet was modified. All access was read-only
Google Drive metadata and content reads.

---

## Step-by-step results

| # | Step | Result |
|---|---|---|
| 1 | Re-authenticate clasp | **BLOCKED** — needs Taylor (interactive OAuth) |
| 2 | Fresh pull of EDP_Kiosk_V2 source | **BLOCKED** by 1 |
| 3 | Compare vs @22 / commit 142367e / local repo | **BLOCKED** by 2 — and two of the three baselines do not exist here (§2) |
| 4 | Exact LIVE spreadsheet ID | **NOT DETERMINED** — requires source read |
| 5 | Where the ID comes from | **NOT DETERMINED** — narrowed, not resolved (§4) |
| 6 | Today's punches for Kenneth and Clarence | **NOT FOUND** — strong negative result (§3) |
| 7 | Exact tab and spreadsheet holding them | **CANNOT REPORT** — see §3 |
| 8 | 5:15 PM auto clock-out location | **PARTIAL** — ruled out of one candidate, signature confirmed (§5) |
| 9 | Inspect "Copy of EDP_Kiosk_V2 TEST" | **BLOCKED** by 1 — metadata only (§6) |
| 10 | LIVE + TEST source maps | **PROVISIONAL** (§7) |

---

## 1. Step 1 — clasp is still not authenticated

Re-verified at the start of this session:

```
clasp show-authorized-user  →  Not logged in.
ls ~/.clasprc.json          →  No such file or directory
```

clasp 3.3.0 installs cleanly, so the tooling is not the problem — the credential is. `clasp login`
is an interactive Google OAuth flow and cannot be completed by an agent. No service account,
application default credential, or stored token exists in this container. The Google Drive connector
this session does have grants **Drive read access only**; it carries none of the Apps Script API
scopes needed to read project source, Script Properties, triggers, or deployments.

**This is the single blocker.** Steps 2–5 and 7–9 are all downstream of it.

To unblock:

```
cd /tmp/claude-0/-home-user-EDP-Master-System/a31d5558-9438-5b17-bd85-9cfdee76ddd2/scratchpad
./node_modules/.bin/clasp login --no-localhost
```

Open the printed URL, sign in as the approved EDP account, paste the code back. The Apps Script API
must also be on at https://script.google.com/home/usersettings.

---

## 2. Step 3 — two of the three comparison baselines are not available here

Worth flagging before clasp is fixed, because it changes what step 3 can produce:

- **Deployed version @22** — reachable only through clasp. Blocked, but valid.
- **Git commit `142367e`** — **does not exist in this repository.** `git cat-file -t 142367e` returns
  `Not a valid object name`, and no commit matching that prefix exists on any branch of
  `butter6599/EDP-Master-System`. It must live in a different repository.
- **The current local repo** — contains **no kiosk source at all.** This repository is the
  `edp-ai-receptionist` Node/Twilio project: `src/agents.js`, `src/knowledge.js`, `src/pushover.js`,
  `src/server.js`. A full-history search for `kiosk`, `clasp`, `appsscript`, `SpreadsheetApp`,
  `clock.?out`, and `EO-016` returns zero matches across every commit ever made.

So even with clasp working, step 3 can compare the fresh pull against **@22 only**. For the other two
baselines Taylor needs to tell me which repository holds `142367e`, and I can add it to this session.

---

## 3. Steps 6–7 — today's punches are not in this Drive account

This is the most important finding, and it is a negative one.

You said employees used the kiosk today. I could not find today's punches — or Kenneth's punches on
any date — anywhere in this Google account.

**Evidence:**

1. **No spreadsheet in the account was modified today.** The most recently modified file of any type
   is a Google Doc at 2026-08-06 04:30. The most recently modified *spreadsheet* is the Employee
   Handbook tracker at 03:31, which is a document-side edit, not a kiosk write. `EDP_MASTER_DATABASE`
   last changed 2026-08-05 23:01.
2. **`KENNETH` appears zero times in `EDP_MASTER_DATABASE`** — not in the punch tab, not anywhere in
   the file. `CLARENCE` appears 135 times, all dated 4/9/2026 or earlier.
3. **The kiosk punch tab in `EDP_MASTER_DATABASE` ends 4/9/2026**, exactly as reported yesterday.
   411 rows, schema `Timestamp | EmployeeID | Name | Action | PhotoFileId | Notes`, employees
   JOE / CLARENCE / TAYLOR / YVONNE only.
4. **No other spreadsheet in the account contains `CLOCK_IN`.** A full-text search across all Google
   Sheets returns only `EDP_MASTER_DATABASE` with matching rows.
5. **Nothing relevant is shared in.** `sharedWithMe` returns exactly one spreadsheet, an unrelated
   2026-01 file owned by a compute service account.

**Conclusion:** the spreadsheet EDP_Kiosk_V2 writes to is **not visible to this Drive connector.**
The most likely explanations, in order:

- **(a)** It is owned by a **different Google account** — a store/business account that runs the
  kiosk — and merely shared with, or not shared with, thedepote@gmail.com.
- **(b)** It lives in a **Shared Drive** this connector does not enumerate.
- **(c)** The connector's full-text index is stale. This is the weakest explanation: it would not
  account for `modifiedTime` also showing no write today, since that field is not index-dependent.

I can't distinguish these from Drive alone. Reading the spreadsheet ID out of the LIVE project
settles it immediately — which is step 4, which needs clasp.

**One question only you can answer, and it will save a lot of time:** which Google account is the
kiosk iPad signed in as, and is that the same account clasp will be authenticating?

---

## 4. Steps 4–5 — spreadsheet binding: narrowed, not resolved

`EDP_Kiosk_V2` is a **standalone** Apps Script project (Drive parent is My Drive root, not a
spreadsheet). A standalone project cannot use `SpreadsheetApp.getActive()`, so its target must come
from either a hard-coded ID in source or a Script Property. That rules out the third option in your
step 5 — "another configuration source" such as container binding — but does not choose between the
first two. That choice requires reading the source.

---

## 5. Step 8 — 5:15 PM auto clock-out: one candidate ruled out

I found and read two Apps Script source exports sitting in Drive (dated 2026-07-27) and can report a
**definite negative** plus a useful structural finding.

### 5.1 `Main.gs` (36 KB) — the kiosk front-end

Header: `EDP_MASTER_SYSTEM — doGet Router + App Logic, v1.5.1`. This is the **EDP Timeclock kiosk UI**:
PIN pad, employee tiles, `CLOCK_IN` / `CLOCK_OUT` / `LUNCH_OUT` / `LUNCH_IN` buttons, closing
checklist, cash drop. Server calls it makes: `api_punch`, `api_getBoot`, `api_checklist`,
`api_cashDrop`, `api_setNextShift`, `api_resolveMissingClockOut`.

Two details bear directly on EO-016:

- **Store hours are hard-coded to 10:00 AM – 5:00 PM**, closed Sunday. So **5:15 PM is store close
  plus a 15-minute grace period** — that is where the number comes from.
- Employee icons are hard-coded for **Joe, Taylor, Clarence**. No Kenneth.

### 5.2 `EDP_Master_v1.2.0.gs` (92 KB) — the server logic

Header: `EDP_MASTER_SYSTEM — OPS v1.2.0`. Uses `SpreadsheetApp.getActive()` — it is a
**container-bound** script, bound to `EDP_MASTER_SYSTEM — OPS (INVENTORY + SALES + EXPENSES)`
(`19VuXh--un3y-iula8mrE8rYqZrUn4kA3ADWv4FpkvYg`, last modified 2026-03-10).

**It contains no 5:15 PM auto clock-out.** A search for `AUTO`, `5:15`, `autoClock`, `atHour`,
`everyDays`, and `ScriptApp` returns exactly one trigger installer:

```
line 1103:  ScriptApp.newTrigger("scheduledReminderTick_").timeBased().everyMinutes(5).create();
```

That is a 5-minute reminder tick, not a daily clock-out. So the 5:15 PM logic is **not in this file** —
it is in `EDP_Kiosk_V2`, which I cannot read.

### 5.3 Structural finding: there are two different timeclock implementations

Their schemas do not match, which means they are not the same system:

| | `EDP_Master_v1.2.0.gs` (OPS) | `EDP_MASTER_DATABASE` punch tab |
|---|---|---|
| Tab | `TIME_EVENTS` | unnamed 6-column log |
| Columns | 17 — `EventID`, `TimestampServerISO`, `TimestampLocal`, `EmployeeID`, `EmployeeName`, `EventType`, `DeviceID`, 3 photo URLs, `Notes`, `Source`, `RowHash`, `IsVoided`, `VoidReason`, `VoidedAt`, `CreatedAt` | 6 — `Timestamp`, `EmployeeID`, `Name`, `Action`, `PhotoFileId`, `Notes` |
| Void handling | `IsVoided` / `VoidReason`, rows never deleted | none |
| Concurrency | LockService | unknown |
| Auto clock-out | **none** | `AUTO_CLOCKOUT` rows present |

The v1.2.0 system is the more mature design — payroll week Tue 10:00 → Mon 17:00, state machine,
duplicate-punch blocking, LockService, `EXCEPTIONS_ALERTS`. Much of what EO-016 calls for already
exists there. Whether it is running, abandoned, or superseded is unknown.

### 5.4 What is still confirmed about the 5:15 mechanism

Four `AUTO_CLOCKOUT` rows, all with the literal note `AUTO: System clock-out at 5:15 PM`:
4/6 JOE, 4/8 JOE, 4/9 TAYLOR, 4/9 CLARENCE. Function name, file, trigger, and spreadsheet target
remain unknown pending the source read. The grep sequence to find it is unchanged:

```
grep -rn "AUTO: System clock-out"                       # exact write site
grep -rn "AUTO_CLOCKOUT"                                # constant + consumers
grep -rniE "5:?15|autoClock|forceClockOut|atHour"       # trigger installer
```

---

## 6. Step 9 — TEST copy: metadata only

`Copy of EDP_Kiosk_V2 TEST` (`1hExChp4Z9q9fwwrGKAAwoF1vLqigaXY7b8-QvMBx9-ZpxuyLMP8aLcow`), created
2026-03-25, last modified 2026-04-01. Whether it points at LIVE data or LIVE properties **cannot be
determined without clasp** — that is exactly a source-and-properties read.

Unchanged recommendation: **do not execute it.** As a raw copy of a standalone project it most likely
still resolves to whatever spreadsheet LIVE resolves to, and if it inherited a time-based trigger it
could already be writing to LIVE. Its trigger list should be the first thing checked after auth.

---

## 7. Step 10 — provisional source maps

### 7.1 Authoritative LIVE map (confirmed / unconfirmed marked)

| Element | Value | Status |
|---|---|---|
| Kiosk script project | `EDP_Kiosk_V2` | **Confirmed** |
| Script ID | `1k3qXZU4Dnb42QHggds-BFmgd3iA1Za-rhWM7apzeRKIA-l9qgOtBBhqp` | **Confirmed** |
| Project type | Standalone (not container-bound) | **Confirmed** |
| Last modified | 2026-06-09 | **Confirmed** |
| Active deployment | @22 | **Unverified** — from your instruction, not yet read |
| Spreadsheet target | — | **UNKNOWN — not in this Drive account** |
| Binding mechanism | hard-coded ID *or* Script Property | **Narrowed, unresolved** |
| Punch tab name | — | **UNKNOWN** |
| 5:15 PM handler | — | **UNKNOWN** (ruled out of OPS v1.2.0) |
| Historical punch record | `EDP_MASTER_DATABASE` 6-col tab, 3/11–4/9/2026 | **Confirmed, but stale** |
| Parallel system | `EDP_MASTER_SYSTEM — OPS` v1.2.0, bound, richer schema, no auto clock-out | **Confirmed from 7/27 export** |

### 7.2 Recommended isolated TEST map — unchanged in shape, one addition

Same as the approved plan: fresh `EDP_Kiosk_TEST` project, separate `EDP_Kiosk_TEST_DATA`
spreadsheet, separate Script Properties, separate deployment, no STAGING, data created before code
so TEST code is never executable while still pointing at LIVE, plus a startup guard that throws if
the resolved spreadsheet ID equals LIVE's.

The one addition this verification forces: **the TEST spreadsheet must be copied from whatever
spreadsheet LIVE actually resolves to** — which is still unidentified. Copying `EDP_MASTER_DATABASE`
would build TEST on a fixture whose punch data stops in April and has never contained Kenneth. That
would be the wrong baseline for attendance-exception work.

---

## 8. What I need from Taylor

1. **Run `clasp login --no-localhost`** (§1). Everything else is downstream.
2. **Which Google account is the kiosk iPad signed in as?** If it is not thedepote@gmail.com, that
   alone explains §3, and clasp must authenticate as that account to read the LIVE project.
3. **Which repository holds commit `142367e`?** It is not in this one (§2). I can add it to the
   session once named.
4. **Is the `EDP_MASTER_SYSTEM — OPS` v1.2.0 timeclock live, abandoned, or superseded?** (§5.3) It
   already implements much of EO-016 — state machine, void-not-delete, LockService, exceptions —
   and if it is still running, EO-016 may be an extension of it rather than a rebuild of the kiosk.

No further action taken. Awaiting approval.
