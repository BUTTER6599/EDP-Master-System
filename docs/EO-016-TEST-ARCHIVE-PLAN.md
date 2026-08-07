# EO-016 — EDP Kiosk TEST Build: Creation & Backup Plan

**Status:** AWAITING TAYLOR APPROVAL — nothing has been created, copied, modified, or deployed.

> **Reconciled August 6, 2026.** The drift check that this plan was gated on is complete. The LIVE
> binding is confirmed (§5.1), so the conditional branches are resolved. Four design decisions have
> been made by Taylor and are recorded in §11.
**Date prepared:** August 6, 2026
**Task:** EO-016 — Kiosk Attendance Compliance and Punch Exception Controls
**Scope of this document:** Steps 1–9 of the approved architecture. Returns the exact creation and backup plan only.

---

## 0. Standing prohibitions honored in this document

No action described below has been executed. Specifically, in preparing this plan:

- LIVE `EDP_Kiosk_V2` was **not** modified, pulled into, pushed from, renamed, or deployed.
- No LIVE deployment was created or changed.
- No write of any kind was made to `EDP_MASTER_DATABASE` or any other LIVE spreadsheet.
- No Script Property was read or changed on any project.
- All Drive access was read-only metadata and content reads.

---

## 1. Verified inventory (read-only, confirmed today)

### 1.1 LIVE Apps Script project

| Field | Value |
|---|---|
| Title | `EDP_Kiosk_V2` |
| Script ID | `1k3qXZU4Dnb42QHggds-BFmgd3iA1Za-rhWM7apzeRKIA-l9qgOtBBhqp` |
| Owner | thedepote@gmail.com |
| Created | 2026-03-09 |
| Last modified | **2026-06-09 02:47 UTC** |
| Drive parent | My Drive root (`0AMtT76YhWR0uUk9PVA`) — standalone, **not** container-bound |
| Editor URL | https://script.google.com/d/1k3qXZU4Dnb42QHggds-BFmgd3iA1Za-rhWM7apzeRKIA-l9qgOtBBhqp/edit |

Because the project is standalone rather than bound to a spreadsheet, its target spreadsheet is resolved
at runtime — by a hard-coded ID in source, or by a Script Property. **Which of the two is used cannot be
determined without reading the source.** That read is currently blocked (see §2).

### 1.2 Existing TEST-named project (pre-existing, stale)

| Field | Value |
|---|---|
| Title | `Copy of EDP_Kiosk_V2 TEST` |
| Script ID | `1hExChp4Z9q9fwwrGKAAwoF1vLqigaXY7b8-QvMBx9-ZpxuyLMP8aLcow` |
| Created | 2026-03-25 |
| Last modified | **2026-04-01** — 10 weeks older than LIVE |

This project is **not** the approved TEST environment and must not be adopted as one. Reasons:

1. It is 10 weeks behind LIVE and its drift from LIVE is unmeasured.
2. Its spreadsheet target is unknown. As a raw copy of a standalone LIVE project, the overwhelming
   likelihood is that it still points at the **LIVE** spreadsheet, which would violate prohibition 3
   ("do not write to the LIVE spreadsheet") on first execution.
3. Its Script Properties, triggers, and deployments are unverified. If it inherited a time-based
   trigger, it may already be executing against LIVE data.

**Recommended disposition:** classify as `POSSIBLE SUPERSEDED COPY`, leave in place, do not execute,
do not delete. Its triggers should be inspected during the drift check and reported to Taylor before
any decision. A fresh TEST project is created instead (§4).

### 1.3 Candidate LIVE spreadsheet — identified but NOT confirmed

| Field | Value |
|---|---|
| Title | `EDP_MASTER_DATABASE` |
| File ID | `117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI` |
| Size | 367 KB |
| Last modified | 2026-08-05 (actively written by other systems) |
| Drive parent | 🏗️ EDP OS — ALL SYSTEMS MASTER BUILD FOLDER (`1z4MM-4fwZFZCAMGEsBcbRd-2PtPMv9lo`) |

This is the **only** spreadsheet in the account whose content contains kiosk punch actions. A full-text
search across all Google Sheets for `CLOCK_IN` returns this file and no other with matching rows.

The kiosk log tab inside it uses this schema:

```
Timestamp | EmployeeID | Name | Action | PhotoFileId | Notes
```

411 punch/checklist rows were parsed from the export. Action distribution:

| Action | Count |
|---|---|
| `CLOCK_IN` | 82 |
| `CLOCK_OUT` | 78 |
| `LUNCH_OUT` | 9 |
| `LUNCH_IN` | 6 |
| `AUTO_CLOCKOUT` | **4** |
| `CHECKLIST_*` (22 variants) | 232 |

Employees present: JOE (144 rows), CLARENCE (129), TAYLOR (74), YVONNE (64).

**This spreadsheet is a candidate, not a confirmation.** It is confirmed to *contain* kiosk punch data;
it is not confirmed to be the spreadsheet `EDP_Kiosk_V2` currently writes to. Confirmation requires
reading the LIVE source or Script Properties (§2).

---

## 2. Step 7 — clasp re-authentication and drift check: **BLOCKED, needs Taylor**

### 2.1 Current state, verified

| Check | Result |
|---|---|
| clasp installed in this container | **No** — was not present |
| clasp installable | **Yes** — `@google/clasp@3.3.0` installed cleanly into the scratchpad, matching the version recorded in the tracker |
| `clasp show-authorized-user` | **`Not logged in.`** |
| `~/.clasprc.json` | **Does not exist** |

### 2.2 Why the tracker disagrees

The Implementation Tracker records "clasp authenticated to the approved EDP Google account." That was
true of a **previous** container. This session runs in a fresh, ephemeral remote container: the
filesystem was rebuilt from a clean clone and no credential survived. The tracker entry is not wrong
about what happened — it is simply no longer in effect.

### 2.3 What unblocking requires

`clasp login` is an interactive Google OAuth flow. It cannot be completed by an agent. There is no
service account, application default credential, or stored token in this environment that substitutes
for it. The Google Drive connector available to this session grants Drive read access only — it does
**not** grant the Apps Script API scopes needed to read project source, Script Properties, triggers,
or deployments.

**Action required from Taylor**, in this container, when approved:

```
cd /tmp/claude-0/-home-user-EDP-Master-System/a31d5558-9438-5b17-bd85-9cfdee76ddd2/scratchpad
./node_modules/.bin/clasp login --no-localhost
```

This prints a Google URL. Taylor opens it, signs in to the approved EDP account, approves the scopes,
and pastes the returned code back into the terminal. The Apps Script API must also be enabled at
https://script.google.com/home/usersettings.

### 2.4 Drift check, to run the moment auth succeeds — read-only

Executed in a **throwaway scratchpad directory**, never in a directory that could be pushed:

1. `clasp clone <LIVE_SCRIPT_ID>` into `scratchpad/kiosk-live-readonly/`.
   This is a pull-only operation. `clasp push` will not be run against LIVE at any point.
2. `clasp deployments` — enumerate LIVE deployments and record the active one and its version.
3. `clasp list-versions` — record the LIVE version history.
4. Read `appsscript.json` — record `timeZone` (must be `America/Chicago`), scopes, `webapp.access`,
   and `webapp.executeAs`.
5. Inventory every `.gs` / `.html` file with size and hash.
6. Diff LIVE against `Copy of EDP_Kiosk_V2 TEST` to quantify the 10-week drift and report it.
7. Extract the spreadsheet binding: grep the source for `openById`, `getActiveSpreadsheet`,
   `SPREADSHEET_ID`, and `PropertiesService`. **This is the step that confirms or refutes
   `EDP_MASTER_DATABASE` as the LIVE target.**
8. Enumerate LIVE triggers (see §3).

Nothing in steps 1–8 writes. The drift report is returned to Taylor before §4 begins.

---

## 3. Step 8 — location of the 5:15 PM automatic clock-out

### 3.1 Confirmed by data — the mechanism exists and its output signature is known

Four `AUTO_CLOCKOUT` rows exist in the kiosk log, each carrying an identical, literal note string:

| Date | Employee | Action | Notes |
|---|---|---|---|
| 4/6/2026 | JOE | `AUTO_CLOCKOUT` | `AUTO: System clock-out at 5:15 PM` |
| 4/8/2026 | JOE | `AUTO_CLOCKOUT` | `AUTO: System clock-out at 5:15 PM` |
| 4/9/2026 | TAYLOR | `AUTO_CLOCKOUT` | `AUTO: System clock-out at 5:15 PM` |
| 4/9/2026 | CLARENCE | `AUTO_CLOCKOUT` | `AUTO: System clock-out at 5:15 PM` |

The note is a fixed string with the time **hard-coded into the message text**, not interpolated from a
variable. This is the single highest-value search key available, and it will land directly on the
implementing function.

### 3.2 Where it is, in source terms — not yet read

The mechanism is a **time-driven Apps Script trigger** on `EDP_Kiosk_V2` firing at the 5:00–6:00 PM
hour slot, calling a handler that scans for employees in a `WORKING` (and possibly `LUNCH`) state and
appends an `AUTO_CLOCKOUT` row. The handler's name and file are **not yet known** and will not be
guessed.

The moment the LIVE clone from §2.4 exists, the locate sequence is:

1. `grep -rn "AUTO: System clock-out" .` → lands on the exact line that writes the note.
2. `grep -rn "AUTO_CLOCKOUT" .` → the enum/constant and every consumer.
3. `grep -rniE "5:?15|autoClock|forceClockOut|ScriptApp.newTrigger|atHour|everyDays" .` → the trigger
   installer and any second scheduling path.
4. `clasp` trigger enumeration → confirm the trigger is installed, its handler function name, its hour
   slot, and its owning account.

Only after that returns a definite file and line will a replacement be designed. Per the approved
architecture, the replacement is built in TEST only.

### 3.3 A finding Taylor should see before approving

**The kiosk punch log ends on 4/9/2026.** The most recent row of any kind in that tab is dated April 9,
2026 — nearly four months ago — while the LIVE script itself was modified 6/9/2026 and
`EDP_MASTER_DATABASE` is written daily by other systems.

Only two explanations fit, and they lead to different backups:

- **(a)** The kiosk was repointed to a different spreadsheet after 4/9/2026. If so,
  `EDP_MASTER_DATABASE` is a *historical* record and the true authoritative LIVE spreadsheet is
  something else — and §5 would be backing up the wrong file.
- **(b)** The kiosk simply has not been used since 4/9/2026, and the 5:15 PM trigger has been dormant
  or firing against nobody.

Note also that the four `AUTO_CLOCKOUT` events span 4/6 – 4/9 only, and that no `AUTO_CLOCKOUT` exists
for many days on which employees clocked in without clocking out. That is consistent with the plan
document's own instruction that the 5:15 PM clock-out "must be audited and made reliable."

**Distinguishing (a) from (b) requires reading the LIVE spreadsheet binding — §2.4 step 7.** This plan
therefore does not finalize the backup target until that read completes. See §5.1.

---

## 4. Steps 2–4 — TEST environment creation plan

Executed **only after** Taylor approves this document and the §2.4 drift report.

### 4.1 Naming, aligned to the approved Kiosk & Dashboard plan §15

| Asset | Name |
|---|---|
| TEST Apps Script project | `EDP_Kiosk_TEST` |
| TEST spreadsheet | `EDP_Kiosk_TEST_DATA` |
| TEST deployment | separate web-app deployment, own URL |

No STAGING environment is created, per approved item 6.

### 4.2 Creation order — data first, code second

The order is deliberate. The TEST spreadsheet is created and its ID captured **before** any TEST code
is capable of executing, so that no TEST execution can ever occur while the code still points at LIVE.

1. **Create the TEST spreadsheet.**
   Copy the confirmed LIVE spreadsheet (target fixed by §5.1) to `EDP_Kiosk_TEST_DATA`, placed in a new
   `EDP Kiosk TEST` subfolder of the master build folder. Record its new file ID.

2. **Scrub TEST data.** In `EDP_Kiosk_TEST_DATA` only:
   - Replace real employee email addresses with non-routable test addresses, so no TEST run can email
     Joe, Kenneth, Clarence, Yvonne, or a customer.
   - Preserve punch history structurally — it is the fixture the exception logic must be tested against.
   - Add a visible `ENVIRONMENT = TEST` marker cell.

3. **Create the TEST script project.**
   `clasp create --title "EDP_Kiosk_TEST" --type standalone`, then copy in the LIVE source pulled in
   §2.4. This produces a genuinely separate script ID. The LIVE project is never pushed to.

4. **Repoint the binding — before first execution.**
   Set the TEST project's spreadsheet reference to the `EDP_Kiosk_TEST_DATA` ID. If the LIVE binding
   turns out to be hard-coded in source rather than a Script Property, the first TEST change is to
   convert it to a Script Property lookup, so the environment can never again be switched by editing
   a literal.

5. **Set separate TEST Script Properties** (approved item 4), on the TEST project only:

   | Property | Value |
   |---|---|
   | `ENVIRONMENT` | `TEST` |
   | `SPREADSHEET_ID` | *(TEST spreadsheet ID from step 1)* |
   | `LIVE_SPREADSHEET_ID` | *(deliberately absent — TEST must have no path to LIVE)* |
   | `NOTIFICATIONS_ENABLED` | `false` |
   | `AUTO_CLOCKOUT_ENABLED` | `false` *(until explicitly enabled for a test)* |

   LIVE Script Properties are not read and not changed.

6. **Install a TEST-only guard.** A startup assertion that throws if the resolved spreadsheet ID equals
   the LIVE ID, or if `ENVIRONMENT !== 'TEST'`. This makes "TEST writes to LIVE" a hard failure rather
   than a silent one.

7. **Create the TEST deployment** (approved item 4) — a new web-app deployment on the TEST project with
   its own `/exec` URL, recorded in the tracker. LIVE deployments are untouched.

8. **Do not install a TEST 5:15 PM trigger yet.** Auto clock-out stays disabled in TEST until §3.2 has
   located the LIVE implementation and its replacement has been reviewed.

### 4.3 Isolation verification, before any EO-016 feature work

TEST is not accepted until all five pass:

1. TEST `SPREADSHEET_ID` ≠ LIVE spreadsheet ID — asserted in code, not merely eyeballed.
2. A write through the TEST URL appears in `EDP_Kiosk_TEST_DATA` and the LIVE spreadsheet's
   `modifiedTime` is unchanged.
3. TEST project timezone is `America/Chicago`.
4. TEST trigger list contains no trigger inherited from LIVE.
5. TEST emails route only to test addresses — verified by sending one.

---

## 5. Step 5 — ARCHIVE backup plan

Executed **before** step 4, and before any TEST implementation.

### 5.1 Backup target — RESOLVED

> **Update, August 6, 2026.** This was conditional pending the drift check. **The drift check is
> complete and the binding is confirmed.**

**Back up `EDP_MASTER_DATABASE`** (`117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI`), the sole LIVE
kiosk target. Confirmed by reading `Kiosk_Main.js` line 15 in the live project — hardcoded, log tab
`TIME_LOGS`. No second spreadsheet needs archiving; `EDP_MASTER_OPS FOLDER 2026` was the @22 target
and is superseded.

**Caution — this file is shared.** `EDP_MASTER_DATABASE` also holds Register, AI-receptionist call
log, Picker Portal, and audit tables. The archive copies the whole workbook, which is correct for
backup purposes, but the TEST spreadsheet derived from it must be scrubbed accordingly (§4.2).

### 5.2 Archive location

New folder: `ARCHIVE — EDP Kiosk LIVE — 2026-08-06`, created inside
🏗️ EDP OS — ALL SYSTEMS MASTER BUILD FOLDER (`1z4MM-4fwZFZCAMGEsBcbRd-2PtPMv9lo`).

### 5.3 Archive contents

| Item | Method | Note |
|---|---|---|
| LIVE source snapshot | `clasp clone` output, committed to this git branch under `archive/kiosk-live-2026-08-06/` | Version-controlled, diffable, survives container loss |
| LIVE spreadsheet copy | Drive copy → `ARCHIVE — EDP_Kiosk LIVE DATA — 2026-08-06` | Copy, not move; original untouched |
| LIVE spreadsheet XLSX export | Drive export | Format-independent, readable without Google |
| LIVE deployment manifest | `clasp deployments` / `list-versions` output → text file | Records exactly which version was live on this date |
| LIVE `appsscript.json` | From the clone | Timezone, scopes, webapp access |
| LIVE trigger inventory | Enumerated during drift check → text file | Records the 5:15 PM trigger as it exists today |
| This plan | `docs/EO-016-TEST-ARCHIVE-PLAN.md` | Committed |

Script Properties are deliberately **not** archived — reading them is not covered by the approved
read-only scope, and they may contain secrets that should not enter git.

### 5.4 Archive verification

Before §4 begins: archive spreadsheet opens and row counts match the original; the source snapshot's
file list and sizes match the clone; the git commit exists on the remote; LIVE `modifiedTime` is
unchanged from its pre-archive value.

---

## 6. Execution order on approval

| # | Step | Gate |
|---|---|---|
| 1 | Taylor completes `clasp login --no-localhost` | Manual — blocks everything |
| 2 | Read-only drift check (§2.4) | Report returned to Taylor |
| 3 | Locate 5:15 PM logic (§3.2) | Exact file + line reported |
| 4 | Confirm LIVE spreadsheet binding (§5.1) | **Stop-and-ask if unresolved** |
| 5 | ARCHIVE backup (§5) | Verified per §5.4 |
| 6 | Create TEST spreadsheet + scrub (§4.2 1–2) | ID recorded |
| 7 | Create TEST project, repoint, properties, guard (§4.2 3–6) | Guard asserts |
| 8 | Create TEST deployment (§4.2 7) | URL recorded |
| 9 | Isolation verification (§4.3) | All 5 pass |
| 10 | EO-016 feature work begins in TEST | Separate approval |

Steps 5 onward do not begin until Taylor approves this document.

---

## 7. Open questions requiring a Taylor decision

1. **Why does the punch log stop on 4/9/2026?** Was the kiosk repointed, or has it been unused? This
   changes which file gets archived (§5.1).
2. **`Copy of EDP_Kiosk_V2 TEST`** — leave dormant as `POSSIBLE SUPERSEDED COPY` (recommended), or
   review for deletion? No project is classified DELETE without Taylor approval.
3. **Should TEST punch history be preserved or emptied?** This plan preserves it structurally, because
   exception-detection logic needs realistic missing-punch and auto-clockout fixtures to test against.
4. **Confirm `EDP_MASTER_DATABASE` may be copied.** It is 367 KB and shared with Register, Make Ready,
   and accounting systems. The copy is read-only against the original, but Taylor should confirm that
   a full duplicate of that file into a TEST folder is acceptable.

---

## 11. Design decisions carried in — DECIDED August 6, 2026

Recorded here as requirements for the TEST build. **Not yet implemented.**

| # | Decision |
|---|---|
| 1 | **`LUNCH_OUT` at 5:15 PM = FLAG FOR OWNER REVIEW**, not a verified auto-close |
| 2 | **Stale unclosed shifts = OWNER EXCEPTION**, not auto-closed and not ignored |
| 3 | **Auto-close window = 45 minutes in TEST**, with idempotency, and rows marked **unverified / system-generated** |
| 4 | **Historical July/August cleanup = READ-ONLY COUNT FIRST**; no retroactive correction without review |

Implementation detail for all four: `docs/EO-016-AUTOCLOCKOUT-TEST-PLAN.md` §6.

Decision 3 has a schema consequence for the TEST spreadsheet: system-generated closes must be
distinguishable from employee-entered ones, so payroll never treats an unverified placeholder as a
confirmed end time.
