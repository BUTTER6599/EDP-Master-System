# EO-016 — TEST Isolation Completion Report

**Date:** August 7, 2026 (03:48–03:56 UTC / Aug 6, 22:48–22:56 CDT)
**Authorization:** APPROVED — CREATE EO-016 TEST ENVIRONMENT AND ARCHIVE
**Result:** TEST environment created and isolated. **LIVE not modified — verified by hash.**
**Status:** Awaiting approval before any EO-016 feature coding.

---

## 1. Resources created

### 1.1 Archive

| Item | Value |
|---|---|
| Folder | `ARCHIVE — EDP Kiosk LIVE — 2026-08-06` |
| Folder ID | `1g_hIHfTiPQH7UrpcPM3a4umndVfEWrVj` |
| Folder URL | https://drive.google.com/drive/folders/1g_hIHfTiPQH7UrpcPM3a4umndVfEWrVj |
| Archived spreadsheet | `ARCHIVE — EDP_MASTER_DATABASE — 2026-08-06` |
| Spreadsheet ID | `1xzQzTLS-wm_sqxatOzGKRqtmL_4Y9z78Wds4m-TJLus` |
| Spreadsheet URL | https://docs.google.com/spreadsheets/d/1xzQzTLS-wm_sqxatOzGKRqtmL_4Y9z78Wds4m-TJLus/edit |
| Size | **381,601 bytes** — full copy |

Source snapshots also committed to this branch under `archive/`, with `SHA256SUMS.txt`.

### 1.2 TEST environment

| Item | Value |
|---|---|
| TEST folder | `EDP Kiosk TEST` — `15B4ERK7O3ED5bifdhESMPLUhXI6MVlaW` |
| **TEST spreadsheet** | `EDP_Kiosk_TEST_DATA` |
| **TEST spreadsheet ID** | `1tZNShhyJ4mRRSO4xfUGrlzTYo_YWb3d3opagU_X315M` |
| TEST spreadsheet URL | https://docs.google.com/spreadsheets/d/1tZNShhyJ4mRRSO4xfUGrlzTYo_YWb3d3opagU_X315M/edit |
| TEST photo folder | `TEST_LOGIN_PHOTOS` — `1tVqYd55wSvd0_9-Pe-R96YeI94kd9SKB` |
| **TEST Script ID** | `1Q7_6jgY-BcZJoATq0wh31zxpugaP9d4n2tJ4KYUxYFxn-l5HQdlzNAJm` |
| TEST editor URL | https://script.google.com/d/1Q7_6jgY-BcZJoATq0wh31zxpugaP9d4n2tJ4KYUxYFxn-l5HQdlzNAJm/edit |
| **TEST deployment ID** | `AKfycbx9U_BuZgbnymjD5f3B75oCKz9wfafrU6dIv7FaKyIFRaZ8bbxnxwou1NJwxzhEwQ8Feg` @1 |
| **TEST /exec URL** | https://script.google.com/macros/s/AKfycbx9U_BuZgbnymjD5f3B75oCKz9wfafrU6dIv7FaKyIFRaZ8bbxnxwou1NJwxzhEwQ8Feg/exec |

**Exactly one deployment was created on this project:** `@1` above.

`clasp list-deployments` shows a second entry, `AKfycbwKEV2VrtYthFiogPjd5tdIGm8SolUnxyg-2nN9x0o3 @HEAD`.
That is the **automatic head deployment** Apps Script maintains for every project — it always tracks
the current editor content and is not a deployment anyone created. It is listed for completeness, not
as a second TEST web app.

---

## 2. Source revision used

| Field | Value |
|---|---|
| Derived from | LIVE `EDP_Kiosk_V2` **@23** — the version serving the kiosk iPad |
| LIVE `Kiosk_Main.js` SHA-256 | `29096a2a70bdfe361b2b015682d15297584a16f68ad15eb3bc40e0914152bd96` |
| TEST `Kiosk_Main.js` SHA-256 | `25837139f385d9d40096f6892a4d8a1085a8a2e332bc33a30a3eae0deb61a3d3` |
| `Kiosk.html` | **Byte-identical** to LIVE — no production references, no change needed |
| `appsscript.json` | Byte-identical — `America/Chicago`, V8 |
| Lines changed | **83** |

---

## 3. TEST Script Properties

**Not set — I have no capability to set them.** clasp offers no Script Property command, and setting
them requires either the editor UI or executing code, which is outside this authorization.

**Isolation does not depend on them.** Every isolation control is hardcoded in the TEST source, so
TEST is safe whether or not the properties are ever set.

A one-click helper is included in TEST source — run `SETUP_TEST_PROPERTIES()` once from the TEST
editor:

| Property | Value it will set |
|---|---|
| `ENVIRONMENT` | `TEST` |
| `SPREADSHEET_ID` | `1tZNShhyJ4mRRSO4xfUGrlzTYo_YWb3d3opagU_X315M` |
| `NOTIFICATIONS_ENABLED` | `false` |
| `AUTO_CLOCKOUT_ENABLED` | `false` |
| `PHOTO_FOLDER_ID` | `1tVqYd55wSvd0_9-Pe-R96YeI94kd9SKB` |
| `LIVE_SPREADSHEET_ID` | **explicitly deleted** — never created |

No LIVE Script Property was read or written.

---

## 4. Isolation verification results

### 4.1 Static verification — performed by me, conclusive

| # | Test | Result |
|---|---|---|
| 1 | TEST code contains **no production spreadsheet write path** | ✅ **PASS** — all 8 `openById` call sites use `KIOSK_SHEET_ID` = TEST ID, each wrapped in `_assertTestEnv_()` |
| 2 | Production spreadsheet IDs absent from TEST code | ✅ **PASS** — the two production IDs appear **only** on line 34, inside `LIVE_SHEET_ID_BLOCKLIST`, which exists to *refuse* them |
| 3 | Production photo folder `LOGIN_PHOTOS` absent | ✅ **PASS** — 0 occurrences. `_saveToDrive` now resolves to a fixed TEST folder; Script Properties cannot redirect it |
| 4 | Production fallback folder `"EDP Kiosk Photos"` absent | ✅ **PASS** — 0 occurrences |
| 5 | Employee emails scrubbed | ✅ **PASS** — `thedepotedelivery@`, `lane44802@`, `landryyvonne15@`, `thedepote@` all 0 occurrences |
| 6 | Pushover token and user key removed | ✅ **PASS** — both 0 occurrences; constants set to `""` |
| 7 | Notifications disabled at the function level | ✅ **PASS** — `_push`, `_email`, `_pushPunch`, `_emailPunch` each return early when `NOTIFICATIONS_ENABLED` is false, logging instead of sending |
| 8 | Auto clock-out disabled | ✅ **PASS** — `AUTO_CLOCKOUT_ENABLED = false`; **no trigger installed** in TEST |
| 9 | TEST timezone | ✅ **PASS** — `America/Chicago` |
| 10 | TEST spreadsheet is empty | ✅ **PASS** — 1,024 bytes, no rows |

### 4.2 LIVE integrity — verified by re-pull and hash comparison

| # | Test | Result |
|---|---|---|
| 11 | LIVE source unchanged | ✅ **PASS** — re-cloned after all work; all three files hash-identical to the pre-work baseline |
| 12 | LIVE deployment @23 unchanged | ✅ **PASS** — still 4 deployments, @23 active with its original description |
| 13 | LIVE version count unchanged | ✅ **PASS** — still 23 versions; no version created |
| 14 | No `clasp push` to LIVE | ✅ **PASS** — the only push targeted the TEST script ID |
| 15 | Old `Copy of EDP_Kiosk_V2 TEST` untouched | ✅ **PASS** — `modifiedTime` still `2026-04-01T12:10:25.821Z`; its 2 deployments unchanged; never cloned into, pushed to, or executed |

### 4.3 Requires execution — NOT yet verified

These need a real punch through the TEST URL, which I cannot perform.

| # | Test | Status |
|---|---|---|
| 16 | TEST punch writes only to TEST data | ⏳ **Structurally guaranteed** (tests 1–2), **not executed** |
| 17 | TEST photos land in `TEST_LOGIN_PHOTOS` | ⏳ Structurally guaranteed (test 3), not executed |
| 18 | TEST emails reach nobody | ⏳ Structurally guaranteed (tests 5, 7), not executed |
| 19 | TEST Pushover sends nothing | ⏳ Structurally guaranteed (tests 6, 7), not executed |

**To close these:** open the TEST `/exec` URL, tap an employee, punch in with the default PIN, then
confirm the row appears in `EDP_Kiosk_TEST_DATA`, the photo in `TEST_LOGIN_PHOTOS`, and that **no**
Pushover or email arrives. Roughly two minutes.

---

## 5. Deviations from the approved plan — both deliberate

### 5.1 TEST spreadsheet created **blank**, not as a copy of LIVE

The plan said Drive-copy `EDP_MASTER_DATABASE` → `EDP_Kiosk_TEST_DATA`, then scrub it.

**I created a blank spreadsheet instead**, for two reasons:

1. **I cannot scrub a spreadsheet.** There is no cell-write tool in this session. A copy would have
   arrived unscrubbed and stayed that way.
2. **A copy carries real production data** — the workbook also holds `CUSTOMERS` (names, emails,
   phones), AI-receptionist call logs with transcript URLs, Picker Portal, and audit tables. Copying
   all of that into a TEST environment I could not clean would have been worse than the problem the
   TEST environment exists to solve.

A blank sheet is safe because the kiosk builds its own tabs: `_getOrCreateLog`, `_getOrCreateSchedule`,
and `_getOrCreateMsgTab` create `TIME_LOGS`, `SCHEDULE`, and `KIOSK_MESSAGES` on first use, with the
correct 7-column header.

**Trade-off:** no punch-history fixture yet. The auto-clock-out tests need one — in particular the
stale-unclosed-shift case. Recommendation: build a small **synthetic** fixture (a handful of invented
punches for test employees) rather than copying real history. That keeps TEST free of real employee
data permanently. Say the word and I'll prepare it.

### 5.2 Script Properties not set

Covered in §3. No capability; isolation does not depend on them; one-click helper provided.

---

## 6. Unexpected production references found

**None in the TEST code.** Two observations worth recording:

1. **The two production spreadsheet IDs are present in TEST source on line 34** — deliberately, as
   the `LIVE_SHEET_ID_BLOCKLIST` the guard checks against. This is a safety mechanism, not a write
   path. `_assertTestEnv_()` throws if `KIOSK_SHEET_ID` ever matches one.
2. **TEST web app inherits `ANYONE_ANONYMOUS` access** from LIVE's manifest. Anyone with the TEST URL
   can open it. Low risk — notifications are off and it writes only to TEST data — but the URL should
   not be shared casually. Tightening it is a one-line manifest change if you want it.

---

## 7. Data counts

| Resource | Before | After |
|---|---|---|
| `EDP_MASTER_DATABASE` (LIVE) | 377,946 bytes at baseline | Not written by me. Size moves continuously — the kiosk is actively logging punches (§8) |
| Archive copy | — | 381,601 bytes, full copy |
| `EDP_Kiosk_TEST_DATA` | — | 1,024 bytes, empty |
| `TEST_LOGIN_PHOTOS` | — | 0 files |
| LIVE deployments | 4 | **4** |
| LIVE versions | 23 | **23** |
| TEST deployments **created** | — | **1** (`@1`). `clasp` also lists the automatic `@HEAD` entry, which is not a created deployment |

---

## 8. Confirmation: LIVE was not modified

| Prohibited action | Status |
|---|---|
| LIVE code change | ❌ Not done — source hash-identical before and after |
| LIVE deployment or redeployment | ❌ Not done — 4 deployments, @23 unchanged |
| LIVE Script Property change | ❌ Not done — none read or written |
| LIVE trigger change | ❌ Not done — none created, modified, or deleted |
| `clasp push` to LIVE | ❌ Not done — only push was to the TEST script ID |
| Write to `EDP_MASTER_DATABASE` | ❌ Not done — only read, for the archive copy |
| Production notification | ❌ Not done — no Pushover, no email sent |
| EO-016 auto-clockout fix | ❌ Not started |

**On `modifiedTime`:** LIVE `EDP_MASTER_DATABASE` timestamps and size *do* keep changing — employees
are punching normally, and the file is shared with other systems. That is expected activity, not my
writes. The reliable proof that I made no change is the **source hash comparison** (test 11) and the
unchanged deployment and version counts (tests 12–13), none of which can drift on their own.

---

## 9. Rollback procedure

Nothing created here touches production, so rollback is deletion. In order:

1. **Undeploy the one TEST deployment that was created** —
   `clasp undeploy AKfycbx9U_BuZgbnymjD5f3B75oCKz9wfafrU6dIv7FaKyIFRaZ8bbxnxwou1NJwxzhEwQ8Feg`

   That is the only deployment to remove. Do **not** try to undeploy the automatic `@HEAD` entry —
   it is intrinsic to the project and disappears with the project itself at step 2.
2. **Delete the TEST Apps Script project** — `1Q7_6jgY-BcZJoATq0wh31zxpugaP9d4n2tJ4KYUxYFxn-l5HQdlzNAJm`,
   via Drive trash or `clasp delete-script`.
3. **Delete the TEST folder** — `15B4ERK7O3ED5bifdhESMPLUhXI6MVlaW`, which removes
   `EDP_Kiosk_TEST_DATA` and `TEST_LOGIN_PHOTOS` with it.
4. **Keep or delete the archive** — `1g_hIHfTiPQH7UrpcPM3a4umndVfEWrVj`. Recommend **keeping** it;
   it is a clean point-in-time backup and costs nothing.
5. **Git** — `git revert` the commit adding `archive/`, or leave it; it is inert documentation.

**No rollback step touches LIVE**, because no forward step did. LIVE needs no restoration under any
scenario here.

---

## 10. State and next gate

**Complete:** archive taken · TEST spreadsheet, photo folder, script project and deployment created ·
isolation controls implemented and statically verified · LIVE verified unmodified.

**Open before feature work:**

1. **Run the four execution tests** (§4.3) — one TEST punch, ~2 minutes.
2. **Run `SETUP_TEST_PROPERTIES()`** once from the TEST editor (§3) — optional; isolation holds without it.
3. **Decide on a synthetic punch fixture** (§5.1) — needed for the auto-clock-out tests.
4. *(Optional)* Tighten TEST web-app access from `ANYONE_ANONYMOUS` (§6.2).

**Not started, awaiting separate approval:** the EO-016 auto clock-out fix
(`EO-016-AUTOCLOCKOUT-TEST-PLAN.md`) and all other EO-016 feature work.
