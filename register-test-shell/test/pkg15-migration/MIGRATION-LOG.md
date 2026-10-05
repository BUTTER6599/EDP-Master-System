# Package 15 — `request_id` schema migration

**Status: PHASE 1 COMPLETE AND VERIFIED. PHASE 2 NOT EXECUTED.**

Owner approval: Taylor Landry, 2026-10-04, for appending exactly one column
(`request_id`, column 33) to the `SALES` tab of `EDP_MASTER_DATABASE`.

**No cell in any Google Sheet has been written.** The migration is blocked on
authorization, not on readiness — see "Why Phase 2 stopped" below.

## Phase 1 — pre-write verification (PASSED)

Read 2026-10-05 **03:05:23 UTC** via the read-only Google Drive connector, as a
fresh read immediately before the intended write.

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Column count | 32 | **32** | PASS |
| Data rows | 148 | **148** | PASS |
| `request_id` already present | no | **no** | PASS |
| Column 32 header | unheaded | **unheaded** | PASS |

Last row index 149 (1 header + 148 data). Workbook holds 38 tabs.

Headers 1–31, in order: `sale_id`, `timestamp`, `sale_date`, `week_id`,
`amount`, `category`, `payment_type`, `notes`, `entered_by`, `invoice_number`,
`item_id`, `inventory_sku_at_sale`, `legacy_item_id`,
`item_description_at_sale`, `brand_at_sale`, `model_at_sale`, `serial_at_sale`,
`warranty_at_sale`, `tax_rate`, `tax_amount`, `sales_source`, `entry_type`,
`source_order_id`, `source_order_number`, `customer_id`, `customer_name`,
`customer_phone`, `import_batch_id`, `detail_status`,
`inventory_update_status`, `accounting_status`. Column 32 is **unheaded**.

Integrity anchors, for the post-write comparison:

| | |
| --- | --- |
| Header hash | `f7dd73222da33c0aaa773180467023d30b024f1ed6745755a8ff9d8f44f8b526` |
| All-rows hash | `0fb12c9dc492b2f49cb37a0b1f9442ff947fc176b1c8463a290f9ef3bb2cbd0d` |

## Backup and exact recovery method

**Full-fidelity restore artifact:** `SALES-PREWRITE-20261005T030523Z.xlsx` — a
complete export of all 38 tabs, every value, exact column and row order.
sha256 `8f40726fbfdc6e23fb740e04b2965cbfd8ac791c1b4cb8703e625c5a8994f500`,
1,359,410 bytes.

**It is held by the owner, delivered directly, and is deliberately NOT in this
repository** because the SALES tab contains real customer names and phone
numbers. Committing it would publish customer personal data to GitHub.

**Committed here instead:** `SALES-PRE-WRITE-MANIFEST-20261005T030523Z.json` — a
PII-free integrity manifest holding row counts, column counts, headers, a
sha256 per column, a sha256 per data row, and the two aggregate hashes above.
It contains **no values** — verified: zero phone-shaped strings, zero `EDP-`
customer ids, zero sale ids. It cannot reconstruct the data, and it can prove
with certainty whether any of it changed.

Nothing pre-existing was overwritten; both artifacts are new and
timestamp-named.

### Restore procedure

The migration is a single header cell, so restoring is deleting it:

1. Open the `SALES` tab.
2. Right-click column **AG** (33) and choose **Delete column**.
3. Re-run the verifier against a fresh export; header hash and all-rows hash
   must return to the two values above.

Full restore from the xlsx is only needed if something far larger went wrong:
import the backup as a new spreadsheet and copy the `SALES` tab back. That path
has never been needed and is recorded only for completeness.

## Why Phase 2 stopped

The brief required obtaining **only the minimum authorization necessary**, and
not broadening permissions. Against that rule, no write path is available:

- **The Google Drive connector cannot write cells.** Its `update_file` tool
  changes *metadata only* — "currently only title and parent_id are supported".
  There is no Sheets `values.update` or `batchUpdate` capability of any kind.
- **The Apps Script route would cost far more than the change is worth.** It
  would mean adding a spreadsheets *write* scope to `appsscript.json` and
  pushing code — which is a deployment (explicitly forbidden here), and which
  would dismantle the structural read-only guarantee that has protected this
  build since Package 6. A one-cell header edit does not justify that.
- **The owner editing the cell directly requires no new permission at all**,
  which makes it the true minimum.

So the migration is handed back as a single typed cell. Nothing about Phase 1
is wasted: the verification, the backup and the hashes are exactly what the
post-write comparison needs, whoever performs the write.

## Code state

`SALES_MIGRATION.APPLIED` remains **`false`** in `Sale.gs`, because the sheet
has not changed. Phase 4 is explicit that it flips only *after* the sheet
migration independently verifies. `salesRowsToArrays_()` therefore still
refuses to build a positional row, which is correct.

---

# PHASE 2–4 — MIGRATION EXECUTED AND INDEPENDENTLY VERIFIED

**Status: COMPLETE. 19 of 19 verification checks passed.**

## Who performed the write

**Not this build.** The column was appended through the owner's authorised
Google Sheets connection (reported via ChatGPT). This project still holds **no
write scope** — its manifest remains `spreadsheets.readonly` and clasp was never
authenticated during Package 15.

This separation is worth noting rather than glossing: the party that performed
the write is not the party that verified it, and the verification below was run
against a manifest captured **before** the write, by a different tool, five
minutes earlier. Nothing in the result depends on trusting the reported outcome.

## Independent corroboration that a write occurred

Drive `modifiedTime` moved from `2026-10-04T01:36:52.206Z` to
**`2026-10-05T03:10:11.237Z`** — after the 03:05:23 pre-write snapshot and
consistent with the reported migration time.

## The ten required proofs

Post-write export read 2026-10-05, compared against
`SALES-PRE-WRITE-MANIFEST-20261005T030523Z.json`.

| # | Proof | Result |
| --- | --- | --- |
| 1 | Total SALES columns = 33 | **PASS** |
| 2 | AG1 exactly `request_id` — no whitespace, no case difference | **PASS** |
| 3 | Columns 1–32 in exactly the same order | **PASS** — header hash `f7dd7322…` identical |
| 4 | Column 32 unchanged and still unheaded | **PASS** — header blank, column data hash `aae7e0a0…` identical |
| 5 | All 148 historical rows present | **PASS** — last row index still 149 |
| 6 | Historical `request_id` cells blank | **PASS** — 148 of 148 blank |
| 7 | No historical value changed | **PASS** — 148 of 148 per-row hashes identical |
| 8 | No row added or deleted | **PASS** — 148 before, 148 after |
| 9 | No row reordered | **PASS** — row indices in identical positions |
| 10 | Per-column hashes | **PASS** — 32 of 32 identical |

Plus two whole-workbook checks: still 38 tabs, and **the other 37 tabs are
unchanged in shape**. SALES changed in exactly the approved way — 149×32 to
149×33, rows untouched.

Aggregate all-rows hash over columns 1–32: `0fb12c9dc492b2f4…` **before and
after**.

### One correction made during verification

The comparator's first run reported 18 of 19, flagging "no OTHER tab changed
shape — SALES: 149x32 → 149x33". That was the comparator counting SALES itself
in a check meant to exclude it. The check was corrected to exclude SALES and a
separate assertion added that SALES changed in *exactly* the approved way. This
was a defect in the test, not a discrepancy in the data — recorded here because
a 1-of-19 failure that turns out to be the test's own fault is exactly the kind
of thing that should not be quietly edited away.

## Code state change

`SALES_MIGRATION.APPLIED` moved `false` → **`true`**, with `APPLIED_AT` and
`VERIFIED_AGAINST` recorded alongside it.

**This grants nothing.** It records only that column 33 exists, so
`salesRowsToArrays_()` may build a correctly aligned 33-wide row. Writing one
still requires `SALES_WRITER_ENABLED`, a writer that does not exist, and a write
scope this project does not hold. Fifteen assertions now cover exactly that,
including `completeSale()` still refusing with `SALE_WRITES_DISABLED` after the
migration.

## Post-change artifacts

`SALES-POST-WRITE-MANIFEST-20261005T031011Z.json` — the post-change integrity
manifest, same PII-free form as the pre-write one. Together the two manifests
are a permanent, reproducible record of exactly what the migration did.

## Rollback — unchanged and still one step

1. Open the `SALES` tab, right-click column **AG** (33), **Delete column**.
2. Re-run the verifier; the header hash and all-rows hash must return to
   `f7dd7322…` and `0fb12c9d…`.
3. Set `SALES_MIGRATION.APPLIED` back to `false` in `Sale.gs`.

The full-fidelity pre-write export (`SALES-PREWRITE-20261005T030523Z.xlsx`,
sha256 `8f40726f…`) is held by the owner if a larger restore is ever needed.
