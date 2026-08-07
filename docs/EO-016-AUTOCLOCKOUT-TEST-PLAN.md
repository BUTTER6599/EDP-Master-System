# EO-016 — Auto Clock-Out Reliability Fix: TEST-Only Implementation Plan

**Status:** PLAN ONLY — awaiting Taylor approval. Nothing implemented.
**Scope:** TEST environment only. **No LIVE change of any kind.**
**Depends on:** the TEST environment, which **does not yet exist** (§1).

---

## 0. Verified problem statement

| Month | `AUTO_CLOCKOUT` records |
|---|---|
| April 2026 | 11 |
| May 2026 | 13 |
| June 2026 | 2 |
| July 2026 | 0 |
| August 2026 | 0 |

**Total 26. Last fired June 5, 2026.** Status: **NEEDS CORRECTION / UNRELIABLE** — it worked,
degraded, then stopped. Not absent, not never-installed.

Three distinct defects, all of which must be fixed together (source map §14):

| # | Defect | Effect |
|---|---|---|
| **D1** | Trigger opens a 367 KB spreadsheet **1,440×/day**, and each closeout check re-reads all 1,158 `TIME_LOGS` rows | Daily trigger-runtime quota exhausted; late-day work dies first. **Primary cause** |
| **D2** | `if (nowMin === 17*60+15)` — exact-minute equality, no retry, no catch-up | Turns partial degradation into total failure |
| **D3** | `_getStillClockedIn` derives state from **all history** with no date filter | An old unclosed `CLOCK_IN` reads as "IN" forever. Fixing D1/D2 without D3 would **activate** this and write phantom shifts |

**D3 is the reason this must not be a one-line fix.** Restoring the trigger alone would start writing
`AUTO_CLOCKOUT` rows against shifts that ended days or weeks ago.

---

## 1. Blocking dependency — the TEST environment does not exist

There is currently **no isolated kiosk TEST environment** (source map §16):

- No `EDP_Kiosk_TEST` script project
- No `EDP_Kiosk_TEST_DATA` spreadsheet
- `Copy of EDP_Kiosk_V2 TEST` points at **production** data and has two live deployment URLs — unusable

**This plan cannot begin until the TEST environment is created**, per the already-prepared
`EO-016-TEST-ARCHIVE-PLAN.md` (still awaiting approval). Sequence:

```
Approve TEST/ARCHIVE plan  →  create TEST env  →  THIS plan  →  verify in TEST  →  separate LIVE promotion decision
```

No part of this work touches LIVE. Promotion to LIVE is a **separate approval**, not covered here.

---

## 2. Design — four changes

### 2.1 Fix D1 — exit before opening the spreadsheet

The single highest-value change. Currently `checkScheduleAlerts` opens the workbook on line 2, before
any time check:

```js
function checkScheduleAlerts() {
  var ss = SpreadsheetApp.openById(KIOSK_SHEET_ID);   // ← 1,440× per day
  var now = new Date();
  ...
```

Proposed — compute time first, return before any I/O when there is nothing to do:

```js
var CLOSEOUT_MIN = { HEADS_UP:16*60+55, AT_CLOSE:17*60, LATE:17*60+5, AUTO:17*60+15 };

function checkScheduleAlerts() {
  var now    = new Date();
  var today  = DAYS[now.getDay()];
  var nowMin = now.getHours()*60 + now.getMinutes();

  if (today === "SUN") return;                       // closed — no I/O
  if (!_needsAttention_(nowMin)) return;             // ← exits BEFORE opening the spreadsheet

  var ss = SpreadsheetApp.openById(KIOSK_SHEET_ID);  // now runs only when relevant
  ...
}
```

`_needsAttention_` returns true only inside the closeout window (≈16:50–17:45) or when a schedule
reminder is actually due.

**Effect:** roughly 1,440 spreadsheet opens/day → **fewer than 60**. Per-execution cost outside the
window drops to a few milliseconds. Quota pressure is removed rather than merely reduced, and minute
precision is retained.

### 2.2 Fix D2 — window + idempotency instead of equality

```js
// BEFORE
if (nowMin === 17*60 + 15) _autoClockOut(ss, now);

// AFTER
if (nowMin >= CLOSEOUT_MIN.AUTO && nowMin < CLOSEOUT_MIN.AUTO + 45) {
  _autoClockOutIfNeeded_(ss, now);   // safe to call repeatedly
}
```

`_autoClockOutIfNeeded_` is idempotent: for each employee still clocked in **today**, it writes an
`AUTO_CLOCKOUT` only if one does not already exist for that employee today. A 45-minute window with
an idempotency guard means any single execution landing anywhere in the window does the job, and
extra executions are harmless.

Same treatment for the 4:55 / 5:00 / 5:05 rungs, each guarded by a "already sent today" flag in
Script Properties so a repeated run does not re-notify.

### 2.3 Fix D3 — scope state to today, and bound the read

```js
// BEFORE — reads all 1,158 rows, no date filter
var rows = sh.getRange(2, 1, sh.getLastRow()-1, 7).getValues();

// AFTER — bounded tail read, then filter to today
var last  = sh.getLastRow();
var start = Math.max(2, last - 300);                       // bounded window
var rows  = sh.getRange(start, 1, last-start+1, 7).getValues();

var todayStart = new Date(now); todayStart.setHours(0,0,0,0);
rows = rows.filter(function(r){ return r[0] instanceof Date && r[0] >= todayStart; });
```

Two benefits: the read stops growing with history, and **only today's punches determine today's
state.** An employee whose last punch was an unclosed `CLOCK_IN` last Tuesday is no longer treated as
currently working.

**Open question for Taylor (§6):** a stale unclosed shift is a real timekeeping exception. Scoping to
today makes it *invisible* to auto clock-out rather than resolved. Recommendation is to surface it as
an owner exception instead of silently ignoring it — that is EO-016's exception-queue work, and the
two should be built together.

### 2.4 New — missed-window alert

The current design fails silently. Nothing told anyone the auto clock-out had stopped for two months.

- On each successful closeout run, record `LAST_CLOSEOUT_RUN = <ISO date>` in Script Properties.
- A single daily trigger at ~18:00 checks it. If today's closeout never ran, send an owner Pushover
  and email: *"Closeout did not run today — check trigger health."*
- That check is one execution per day, reads no spreadsheet, and costs effectively nothing.

**This is the change that matters most for trust.** The other three fix the current fault; this one
surfaces the next one within a day instead of two months.

---

## 3. Trigger configuration in TEST

| Trigger | Frequency | Purpose |
|---|---|---|
| `checkScheduleAlerts` | `everyMinutes(1)` — **unchanged** | Now cheap: exits before I/O outside the window |
| `closeoutHealthCheck` | `atHour(18).everyDays(1)` — **new** | Missed-window alert |

Deliberately **not** switching to `atHour().everyDays()` for the closeout itself: Apps Script fires
those at an arbitrary minute inside the hour, which would make 5:15 PM approximate. Keeping the
one-minute trigger with a cheap early exit preserves precision *and* fixes quota. Both effects come
from §2.1, not from changing the trigger cadence.

All triggers created **in the TEST project only**. No LIVE trigger is created, modified, or deleted.

---

## 4. TEST acceptance criteria

Verified in TEST against `EDP_Kiosk_TEST_DATA`. No production data involved.

| # | Test | Pass condition |
|---|---|---|
| 1 | Employee clocked in, window reached | Exactly one `AUTO_CLOCKOUT` row, note preserved |
| 2 | Function invoked repeatedly inside the window | Still exactly one row — idempotency holds |
| 3 | Nobody clocked in | No rows written, no alert |
| 4 | Employee clocked out normally before the window | Not auto-clocked-out |
| 5 | Employee on `LUNCH_OUT` at the window | Handled per Taylor's decision (§6) |
| 6 | **Stale unclosed `CLOCK_IN` from a prior day** | **Not** auto-clocked-out today; no phantom shift |
| 7 | Execution lands at 17:16, 17:30, 17:59 | Still fires — window, not equality |
| 8 | Execution lands at 18:05 (past window) | Does not fire; missed-window alert instead |
| 9 | Outside the window entirely | No spreadsheet open — verify in Executions |
| 10 | Closeout skipped for a day | Health check alerts that evening |
| 11 | Notifications | Pushover and email fire once, to TEST addresses only |
| 12 | Row shape | 7 fields, `AUTO_CLOCKOUT`, correct timestamp, note intact |
| 13 | Existing TEST rows | Unchanged — nothing overwritten or deleted |
| 14 | Isolation | LIVE spreadsheet `modifiedTime` unchanged throughout |

Test 6 is the one that would fail on a naive fix. Test 9 is the quota fix. Test 10 is the
early-warning capability.

**Quota measurement:** record total `checkScheduleAlerts` runtime per day in TEST before and after.
Expect a drop of roughly 95%.

---

## 5. Effort

| Task | Estimate |
|---|---|
| Implement §2.1–2.4 in TEST | 2–3 h |
| TEST triggers + fixtures (incl. stale-shift case) | 1–2 h |
| Run 14 acceptance tests | 2–3 h |
| Multi-day observation in TEST | 2–3 days elapsed, ~1 h attention |
| Document results | 1 h |
| **Total focused** | **6–9 hours**, plus observation |

Fits inside the 6–10 hour EO-016 estimate in the Implementation Tracker.

---

## 6. Design decisions — DECIDED by Taylor, August 6, 2026

Carried into this plan as requirements. **Not yet implemented.**

| # | Decision | Status |
|---|---|---|
| 1 | **`LUNCH_OUT` at 5:15 PM → FLAG FOR OWNER REVIEW.** Not a verified auto-close. The employee's true end time is unknown, so no close is written; an owner exception is raised instead | **DECIDED** |
| 2 | **Stale unclosed shifts → OWNER EXCEPTION.** Not silently ignored, not auto-closed. Surfaced for owner resolution | **DECIDED** |
| 3 | **Auto-close window = 45 minutes in TEST** (17:15–18:00), with an idempotency guard, and every generated row marked **unverified / system-generated** | **DECIDED** |
| 4 | **Historical July/August cleanup → READ-ONLY COUNT FIRST.** No retroactive correction without owner review | **DECIDED** |

### 6.1 Consequence of decisions 1–3: auto-close rows must be labelled

Decisions 1 and 3 together mean an `AUTO_CLOCKOUT` row is **not** an assertion that the employee
stopped work at 5:15 PM. It is a system-generated placeholder that closes an open shift so payroll
can be reviewed — its accuracy is unverified.

The TEST implementation must therefore mark these rows explicitly, e.g. in the Notes field:

```
AUTO: System clock-out at 5:15 PM — UNVERIFIED, system-generated. Owner review required.
```

Downstream consumers — payroll totals, the owner dashboard, the exception queue — must be able to
distinguish an employee-entered `CLOCK_OUT` from a system-generated one. This is what keeps the
system from silently inventing paid time, which is EO-016's core requirement and the Kiosk &
Dashboard plan's stated rule that no automatic paid-hours creation may occur.

### 6.2 Three exception types this produces

All three feed the owner exception queue rather than being resolved automatically:

| Condition | Handling |
|---|---|
| Still `CLOCK_IN` at window | Auto-close written, marked unverified, exception raised for review |
| On `LUNCH_OUT` at window | **No row written.** Exception raised — true end time unknown (decision 1) |
| Unclosed shift from a prior day | **No row written.** Exception raised (decision 2) |

### 6.3 Remaining open parameter

**Window length in LIVE.** 45 minutes is decided for TEST. Whether LIVE uses the same is deferred to
the separate LIVE-promotion approval, once TEST observation shows how often the window is actually
needed.

---

## 7. Explicitly out of scope

- Any LIVE change — code, deployment, trigger, Script Property, or spreadsheet
- Promotion of this fix to LIVE — **separate approval**
- The wider EO-016 exception queue, beyond the hooks noted above
- The hardcoded `KIOSK_SHEET_ID` (source map §5) — same TEST build, separate change
- Security findings (source map §11) — owner decision, unrelated

---

## 8. Approval gate

Two approvals, in order:

1. **`EO-016-TEST-ARCHIVE-PLAN.md`** — creates the TEST environment. Blocks everything here.
2. **This plan**, plus answers to the four §6 decisions.

Nothing will be implemented until both are given. **No LIVE modification is proposed at any point in
this document.**
