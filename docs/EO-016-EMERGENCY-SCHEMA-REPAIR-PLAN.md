# EO-016 — Emergency LIVE Schema Repair: Controlled Execution Plan

**Status:** PLAN ONLY — AWAITING SEPARATE FINAL APPROVAL. Nothing has been modified.
**Date prepared:** August 6, 2026
**Target:** `EDP_MASTER_DATABASE` (`117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI`) → tab `TIME_LOGS`
**Goal:** restore punch logging with the smallest possible LIVE change.

---

## 0. Two things that change the shape of this plan

### 0.1 I cannot execute the spreadsheet edit — you must

My Drive access is read-only, and the clasp token carries `drive.file` scope, which does not permit
editing a spreadsheet it did not create. There is no cell-write tool available to me.

**Steps 2–4 are performed by Taylor in the Google Sheets UI.** I prepare, verify before and after,
and confirm the result. That division is stated per step below.

### 0.2 A diagnosis gate must come first — the repair may not be the right fix

My root-cause finding (7-value `appendRow` into a 6-column tab) is high-confidence but **inferred,
not observed** — I did not execute code. Three hypotheses remain live, and they are distinguishable
in about two minutes:

| # | Hypothesis | Prediction if true | Correct fix |
|---|---|---|---|
| **A** | `TIME_LOGS` has exactly 6 columns; `appendRow` of 7 values throws | `Ctrl+End` lands in column **F**; Executions show a column-count exception | **This plan** |
| **B** | The deploying account lost edit access, so `openById`/write throws | `Ctrl+End` lands at column **Z** or beyond; Executions show a permission/authorization error | Re-authorize the deployment — **this plan would be a no-op** |
| **C** | A *new* `TIME_LOGS` tab was created and punches **are** landing there | A tab exists with rows dated after 7/17 and a `ShoesPhotoId` header | **No outage.** Stop. Nothing to repair. |

Hypothesis C matters most. My evidence against it is that a Drive full-text search for
`ShoesPhotoId` does not return this file — but Drive's index can lag, and a newly inserted tab sorts
to the end of the workbook, which is exactly the region the Drive text export truncated. I could not
rule it out by reading alone.

**If C is true, there is no outage and no missing payroll** — only a blind spot in my export. That
possibility must be eliminated before making any LIVE change.

**Do not proceed past Step 1 until Step 0 returns a definite A, B, or C.**

---

## 1. STEP 0 — Diagnosis gate *(Taylor, ~2 minutes, zero risk, read-only)*

Open `EDP_MASTER_DATABASE`. Report these five answers:

1. **How many tabs are named `TIME_LOGS`?** Exactly that spelling. Is there more than one punch-like
   tab (e.g. `TIME_LOG`, `TIME_LOGS_OLD`)?
2. Click any cell in `TIME_LOGS`, press **`Ctrl+End`** (Mac: `Cmd+Fn+→`). **Report the cell reference**
   — e.g. `F415` or `Z415`. The **letter** is the answer to hypothesis A vs B; the **number** is the
   authoritative row count for Step 1.
3. **Read row 1 across, left to right**, and report every header exactly as written.
4. **Scroll to the last row. What is the newest date?** If anything is dated after **7/17/2026**,
   stop — hypothesis C, and there is no outage.
5. Apps Script editor → **Executions** → filter function `api_punch`, August 5. **Report the status
   and the exact error text** of any failed run.

**Gate:**

| Result | Action |
|---|---|
| `Ctrl+End` = column **F** and/or a column-count exception | **Hypothesis A confirmed → proceed to Step 1** |
| A permission/authorization error in Executions | **Hypothesis B → stop, this plan is wrong, we fix the deployment authorization instead** |
| Rows dated after 7/17 | **Hypothesis C → stop, no outage, I re-verify my analysis** |
| Ambiguous | **Stop and report — do not proceed** |

---

## 2. STEP 1 — Backup and baseline *(before any modification)*

### 2.1 Full-file backup — preferred *(Claude, on approval)*

A whole-file Drive copy. **This does not touch the original** — it is a read of the source and a
write of a new file.

- Source: `EDP_MASTER_DATABASE` (`117AFF…`)
- New title: `ARCHIVE — EDP_MASTER_DATABASE — pre-TIME_LOGS-repair — 2026-08-06`
- Destination: 🏗️ EDP OS — ALL SYSTEMS MASTER BUILD FOLDER (`1z4MM-4fwZFZCAMGEsBcbRd-2PtPMv9lo`)

I record the new file ID and confirm it opens.

> Requires approval: this creates a Drive file. It is the only creation in this plan, and it writes
> nothing to LIVE. If you prefer, do it yourself via **File → Make a copy**.

### 2.2 In-tab backup — additional *(Taylor)*

Right-click the `TIME_LOGS` tab → **Duplicate**. Rename the copy:

```
TIME_LOGS_BACKUP_2026-08-06
```

This is a write to the LIVE file, but it is purely additive and touches no existing row. It gives an
in-place rollback that survives without needing the archive file.

### 2.3 Baseline record *(Taylor reports, Claude records)*

| Field | Value |
|---|---|
| `Ctrl+End` cell reference | *(from Step 0.2)* |
| Total rows including header | |
| Data rows | |
| Last column letter | |
| Row 1 headers, in order | |
| Newest date in column A | |
| Archive file ID | |
| Backup tab name | |

**My expected baseline, for comparison** — from the Drive export, to be confirmed, not assumed:

- Header: `Timestamp | EmployeeID | Name | Action | PhotoFileId | Notes` (6 columns)
- 414 data rows + 1 header = **415 rows**
- Newest date: **4/9/2026**

**If the observed baseline differs materially from this, stop and report before changing anything.**

---

## 3. STEP 2 — Add exactly one column *(Taylor, in the Sheets UI)*

**This is the only modification to existing LIVE data in the entire plan.**

1. In `TIME_LOGS`, **right-click the column F header**.
2. Choose **"Insert 1 column right"**.
3. A new empty column **G** appears.

**Use the insert command, not just typing into G1.** The failure is caused by the sheet's *column
count*, not by header text. Typing a label into a cell of an already-existing column would not widen
anything. Inserting is what raises the sheet's width to 7.

**Do not:** delete a column, reorder columns, sort, filter, edit any existing cell, or touch any
other tab.

---

## 4. STEP 3 — Set the header *(Taylor)*

Click **G1** and type exactly:

```
ShoesPhotoId
```

Case-sensitive, one word, no spaces, no trailing space. Press Enter.

Optionally match the existing formatting of A1–F1 (bold, dark background, white text) with the paint
format tool. Cosmetic only.

**Leave G2 through G415 empty.** Historical rows genuinely had no shoes photo; blank is the honest
value. Do not backfill.

---

## 5. STEP 4 — Verify preservation *(Taylor reports, Claude verifies)*

Before any test punch:

| Check | Expected |
|---|---|
| `Ctrl+End` | Same row number as baseline, column now **G** |
| Data row count | **Unchanged** from baseline |
| A1:F1 headers | **Unchanged**, same order |
| First data row (row 2) | Identical to baseline |
| Last data row | Identical to baseline |
| G1 | `ShoesPhotoId` |
| G2:G-last | Empty |
| Other tabs | Untouched |

**If the row count changed at all, stop and roll back (§8).**

---

## 6. Steps 5–9 — Explicitly not done

Confirming these are outside this plan, per your instruction:

| # | Constraint | Status |
|---|---|---|
| 5 | No Apps Script code change | ✅ none — not a single line |
| 6 | No deployment change | ✅ @23 stays active, no new version, no redeploy |
| 7 | No Script Property change | ✅ none read or written |
| 8 | No setup function run | ✅ `SETUP_KIOSK`, `SETUP_SCHEDULE_TRIGGER`, `CHANGE_PIN` all untouched |
| 9 | No trigger created | ✅ none created, modified, or deleted |

**Why no code change is needed:** the code already writes 7 values. Widening the destination to 7
columns makes the existing code correct. This is the smallest change that can fix the defect.

---

## 7. STEP 10–12 — Controlled punch test

### 7.1 Test punch *(Taylor, at the kiosk)*

On the kiosk iPad, at the production URL:

```
https://script.google.com/macros/s/AKfycbzjf8Ka…ToXEN/exec
```

1. Tap **TAYLOR** — use your own record, not an employee's, so no real wage data is affected.
2. Tap **CLOCK IN**.
3. Enter PIN, take the photo, submit.
4. **Note the wall-clock time to the minute.**

Watch what the screen does:

| Observed | Meaning |
|---|---|
| Green flash, `CLOCK IN OK`, spoken "clock in recorded" | Write succeeded |
| Red flash `ERROR` + reset after ~2 s | Still failing — capture the Executions error and stop |
| Red `BLOCKED` | PIN rejected — different problem |

### 7.2 Verify the row — 7 fields *(Taylor + Claude)*

Open `TIME_LOGS`, go to the last row:

| Column | Expected |
|---|---|
| A Timestamp | Test time, to the minute |
| B EmployeeID | `TAYLOR` |
| C Name | `Taylor` |
| D Action | `CLOCK_IN` |
| E PhotoFileId | A Drive file ID — **non-empty** |
| F Notes | Empty |
| G ShoesPhotoId | Empty (shoes photo is captured only when supplied) |

**The row must occupy A through G.** Row count = baseline + 1.

Column E holding a real file ID is the specific proof that `_saveToDrive` and `appendRow` both
completed in the same execution — the exact pairing that has been broken since July 17.

### 7.3 Verify notifications *(Taylor)*

Both fire *after* `appendRow`, so they are the independent confirmation that the write completed:

| Channel | Expected |
|---|---|
| **Pushover** | A punch notification on your phone |
| **Email** | A receipt to `thedepote@gmail.com` |
| Executions panel | `api_punch` — status **Completed**, not Failed |

**If the row is written but no Pushover or email arrives**, the write is fixed but the notification
path has a separate fault — report it; do not treat that as failure of this repair.

### 7.4 Clean up the test punch *(Taylor)*

The test creates a real `CLOCK_IN` for TAYLOR with no matching clock-out — which would show as an
open shift and could trip the 5:15 PM auto clock-out.

Preferred: clock out normally at the kiosk, then annotate both rows in column F:

```
TEST PUNCH — EO-016 schema repair verification 2026-08-06 — not work time
```

**Do not delete the rows.** Annotating preserves the audit trail; deleting breaks the very principle
EO-016 exists to enforce.

---

## 8. Rollback

Trivial at every stage. Nothing here is one-way.

### 8.1 If Step 2 or 3 goes wrong

**Ctrl+Z.** The insert is a single undoable action in an open session.

### 8.2 If discovered later

Right-click the **column G header** → **Delete column**. This returns the tab to its exact prior
state — existing columns A–F are untouched by an insert-right, so removing G restores the baseline
byte-for-byte.

### 8.3 If a row is damaged

1. Open `TIME_LOGS_BACKUP_2026-08-06` (§2.2).
2. Copy the affected row range back into `TIME_LOGS`.
3. Verify count against the §2.3 baseline.

### 8.4 If the file is damaged

Restore from the archive copy (§2.1), or use **File → Version history → See version history** and
restore the state immediately before this plan ran. Google Sheets keeps full version history
independently of anything done here.

### 8.5 If the repair does not fix logging

Delete column G (§8.2) and stop. The cause is hypothesis B or something not yet identified; nothing
is lost by reverting, and we return to the Executions log for the real error.

**No rollback path requires an Apps Script change, a redeploy, or a Script Property edit.**

---

## 9. Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Insert-right corrupts existing rows | Very low | High | Two backups; insert-right does not modify existing columns |
| Wrong column inserted | Low | Low | Ctrl+Z or delete column G |
| Repair does not fix it (hypothesis B) | Moderate | None — no-op | Step 0 gate rules this out before any change |
| No outage exists (hypothesis C) | Low | Wasted change | Step 0 gate stops the plan |
| Test punch pollutes payroll | Certain by design | Low | Uses TAYLOR; annotated, not deleted |
| Other systems disturbed | Very low | Medium | Only one tab in one file; other tabs untouched |

**Net:** the only irreversible-feeling step is inserting a column, and it is reversible by deleting
that column. This is a low-risk repair — provided Step 0 confirms hypothesis A first.

---

## 10. Known cosmetic mismatch — deliberately not fixed

The kiosk's `_getOrCreateLog` would name column E `FacePhotoId`. The existing tab names it
`PhotoFileId`.

**Leave it.** `appendRow` writes positionally and never reads headers, so the name has no functional
effect. Renaming it is a second change with no benefit, and it would break any formula, query, or
report elsewhere that references `PhotoFileId`. Note it for the TEST build; do not touch LIVE.

---

## 11. Deliverables on completion

1. Before-and-after row counts
2. Before-and-after headers
3. Archive file ID and backup tab name
4. Test punch result — screen behavior, row contents A–G, notification status
5. Executions panel status for the test
6. Confirmation that no code, deployment, property, setup function, or trigger changed
7. Rollback instructions — §8, restated with the actual IDs recorded

---

## 12. What this does **not** fix

Restoring logging is not the end of the incident:

1. **19 days of missing punches remain missing.** This repair stops the bleeding; it recovers
   nothing. Reconstruction from `LOGIN_PHOTOS` (source map §14) is a separate approved action.
2. **`LOGIN_PHOTOS` is still the only evidence** of that period and should be preserved before any
   Drive cleanup.
3. **The 5:15 PM auto clock-out is still broken independently** — the exact-minute equality bug
   (source map §8.2) survives this repair.
4. **Silent failure is still possible.** The deeper defect is that a payroll write could fail for 19
   days without alerting anyone. That fix belongs in the TEST build.
5. **The environment binding is still hardcoded** (source map §5) — the condition that caused this.

---

**Awaiting separate final approval. No LIVE modification will occur until then, and Step 0 must
return hypothesis A first.**
