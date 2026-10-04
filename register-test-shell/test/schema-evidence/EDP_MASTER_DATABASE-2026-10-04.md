# EDP_MASTER_DATABASE — recovered schema evidence

**Read 2026-10-04. READ ONLY. Zero writes.**

This file exists because the Package 5B evidence directories lived *outside* the
repository and were lost when a Claude container was reclaimed, which is what
turned NV-15 into a blocker. This record is committed so that cannot happen
again.

## Provenance

| | |
| --- | --- |
| Source | Google Drive file titled **`EDP_MASTER_DATABASE`**, owner `thedepote@gmail.com` |
| Spreadsheet id | **deliberately not recorded here.** It lives only in the Apps Script Script Property `EDP_MASTER_DATABASE_ID`, per the standing rule that no live database id appears in source or repo |
| Access path | Google Drive connector, read-only export to `.xlsx`. No Apps Script authorisation was used and no scope was broadened |
| Export sha256 | `84663077dd5eb4c256313f468ab943743aa3946fbc224c27dad787fc1313284f` (1,359,410 bytes) |
| File modified | 2026-10-04T01:36:52Z |
| Parser | `exceljs` 4.4.0 — a vetted library, **deliberately not the hand-written regex parser** whose greedy attribute match corrupted the Package 8 reading |
| Tabs | **38** |

Nothing was written. No tab, row, schema, Apps Script project, deployment or
LIVE system was created or modified.

## SALES — 32 columns, in exact order

| # | Header | Fill (of 148 rows) |
| --- | --- | --- |
| 1 | `sale_id` | 100% |
| 2 | `timestamp` | 99% |
| 3 | `sale_date` | 100% |
| 4 | `week_id` | 100% |
| 5 | `amount` | 100% |
| 6 | `category` | 100% |
| 7 | `payment_type` | 100% |
| 8 | `notes` | 99% |
| 9 | `entered_by` | 97% |
| 10 | `invoice_number` | 53% |
| 11 | `item_id` | 19% |
| 12 | `inventory_sku_at_sale` | 18% |
| 13 | `legacy_item_id` | 6% |
| 14 | `item_description_at_sale` | 55% |
| 15 | `brand_at_sale` | 15% |
| 16 | `model_at_sale` | 9% |
| 17 | `serial_at_sale` | 9% |
| 18 | `warranty_at_sale` | 47% |
| 19 | `tax_rate` | 52% |
| 20 | `tax_amount` | 53% |
| 21 | `sales_source` | 55% |
| 22 | `entry_type` | 55% |
| 23 | `source_order_id` | 46% |
| 24 | `source_order_number` | 55% |
| 25 | `customer_id` | 8% |
| 26 | `customer_name` | 50% |
| 27 | `customer_phone` | 44% |
| 28 | `import_batch_id` | 55% |
| 29 | `detail_status` | 54% |
| 30 | `inventory_update_status` | 54% |
| 31 | `accounting_status` | 54% |
| 32 | *(blank header)* | 1 row |

Column 32 has **no header** and one populated cell. Treat it as unused; do not
write to it.

`sale_id` is unique across all 148 rows — zero duplicates — so it behaves as the
primary key.

## Sale-id formats: legacy vs current

| Family | Shape | n | Date range | Carries structured fields? |
| --- | --- | --- | --- | --- |
| **`S-<epochMs>-<2–3 digits>`** | `S-1780964571246-775` | 66 | 2026-06-08 → **2026-07-18 only** | **No. Zero.** item_id 0, customer_id 0, tax_rate 0, status 0 |
| **`SHOPIFY-<order#>`** | `SHOPIFY-3013` | 80 | 2026-07-01 → 2026-09-25 | **Yes, all of them** |
| `SHOPIFY-<order#>-RECON` | `SHOPIFY-3123-RECON` | 1 | 2026-09-25 | Yes |
| `MANUAL-<yyyymmdd>-<NAME>-<nnn>` | owner manual intake | 1 | 2026-08-23 | Yes |

The `S-` numeric segment is epoch milliseconds and decodes to the sale date in
55 of 66 rows; the suffix is 2–3 digits with 64 distinct values across 66 rows,
so it is random, not a sequence.

**Conclusion.** `S-<epochMs>-<rand>` is a **LEGACY, ABANDONED** format produced
by an earlier EDP till. It stopped on 2026-07-18 and it carries no item,
customer, tax or status linkage at all. Everything since is Shopify order
numbers reconciled by hand.

**There is therefore no currently-active EDP-generated sale-id convention for an
in-store Register sale.** The Register will not be colliding with a live format;
it will be establishing the first one. That is a decision for the owner, not an
inference from the data.

## Controlled vocabularies observed

- `payment_type`: `Cash` (137), `Unknown` (5), `UNKNOWN - OWNER CONFIRMED PAID` (3), `Cash App` (2), `N/A` (1). **No card, finance, layaway or check row exists yet**, though the Register offers all four.
- `tax_rate`: `0.0975` (75), empty (71), `0` (2). Consistent with the approved 9.75% policy.
- `category`: `Appliance Sale` (114), `Parts` (13), `Delivery` (10), `Repair` (5), plus 5 one-offs.
- `entry_type`: empty (66), `RECONCILED_MANUAL` (47), `INDIVIDUAL` (33), 2 one-offs.
- `entered_by`: free text — `TAYLOR` (92), `THE ELECTRONICS DEPOT` (33), `Yvonne` (6), and reconciliation phrases. **Not a PIN and not an EMPLOYEES key.**
- `detail_status` / `inventory_update_status` / `accounting_status`: **free-text prose**, 27 / 25 / 24 distinct values across ~80 populated rows, most of them unique sentences. These are a human reconciliation narrative, **not an enum**.

## APPLIANCES — 26 columns, in exact order

`item_id`, `sku_id`, `category`, `brand`, `model`, `serial`, `condition`,
`list_price`, `cost_basis`, `rating`, `warranty_tier`, `fuel_type`, `notes`,
`stage`, `status`, `days_on_hand`, `date_acquired`, `added_by`, `photo_links`,
`width_in`, `height_in`, `depth_in`, `capacity_cu_ft`, `dimensions_display`,
`spec_source`, `spec_verified`

### Marking an appliance SOLD

- The existing marker is **`status` = `SOLD`** — already present on 16 rows.
- `stage` is **not** changed to SOLD. Sold rows keep whatever stage they had
  (one `SOLD` row still reads `stage = REPAIR`).
- `status` values observed: `NOT_READY` (35), empty (32), **`SOLD` (16)**,
  `AVAILABLE` (13), `HOLD` (2), `FLOOR_READY` (1), `DIAGNOSTIC` (1).
- **There is no `PAID` value and no PAID concept in APPLIANCES.** Payment state
  lives in SALES (`accounting_status`), not on the appliance.
- **There is no `sold_date`, `sold_price` or `sale_id` column.** APPLIANCES has
  no back-link to the sale that sold it. The only linkage is SALES → APPLIANCES
  via `item_id`.

So "mark SOLD" is a single-cell write: `status` → `SOLD`. Nothing else in the
approved schema records the sale on the appliance row.

## CUSTOMERS — 26 columns, in exact order

`cust_id`, `first_name`, `last_name`, `phone1`, `phone2`, `phone2_name`,
`phone3`, `phone3_name`, `email`, `address`, `type`, `date_added`, `last_visit`,
`added_by`, `total_spent`, `visit_count`, `notes`, `portal_active`,
`shopify_customer_id`, `square_customer_id`, `housecall_customer_id`,
`customer_role`, `customer_rating`, `discount_percent`, `call_alert`,
`last_verified`

- 1,128 rows. `cust_id` is **uniformly `EDP-####`** — 1,128 of 1,128.
- The key is `cust_id` here but **`customer_id` in SALES**. The names differ.
- Name is split (`first_name` / `last_name`); the Register's contract uses a
  single `name`. Phone is `phone1`..`phone3`; the Register uses one `phone`.
- `portal_active` already exists, which is the hook a future Customer Portal
  would use.

## Employees

`EMPLOYEES`: `pin_id`, `name`, `role`, `active` — 5 rows. This is the real
employee source for the deferred R-1 employee lock. SALES `entered_by` does not
reference it.

## Event / outbox / print queue / idempotency

**None exists.** A header scan of all 38 tabs for `request|idempot|outbox|event|
queue|print|dedup|correlat|retry|attempt|job|webhook|published|dispatch` found
only `APPROVAL_LOG.request_type` / `request_text` and
`SMS_CONSENT_LOG.event_type` — neither is a message outbox. No tab name matches
either.

The closest existing thing is **`AUDIT_LOG`** (2,934 rows, actively written by
another EDP system):

`log_id`, `timestamp`, `actor`, `actor_role`, `ticket_id`, `action`,
`field_changed`, `old_value`, `new_value`, `notes`

Its `action` vocabulary has 71 values (`SCANNER_DIAGNOSTIC`, `SHOP_OPENED`,
`PHOTO_ADDED`, `STAGE_CHANGE`, `CREATE`, `SAVE_QUEUED`, …). It is a genuine
append-only audit trail, but it is **keyed on `ticket_id`, not on a sale**, and
it has **no delivery or consumption state**, so it cannot act as an outbox
without adding columns to a schema this package is forbidden to modify.

`log_id` uses the format `LOG-<yyyymmdd>-<nnnn>` — a date-plus-sequence
convention, notably different from the abandoned `S-<epochMs>-<rand>`.

A second, much older `AuditLog` tab (19 rows) has a different schema
(`User_PIN`, `Entity`, `Entity_ID`, …). The duplicate remains unresolved (NV-5).

## Linkage quality

- **`SALES.item_id` → `APPLIANCES.item_id`: 28 populated, 14 match, 14 orphans.**
  Orphans: `W-0576`, `RTB-9657`, `W-0794`, `W-1249`, `DEW-6784`, `RTSS-4509`,
  `DEW-0W83`, `RTW-1531`, `SESS-502Q`, `730Q`, `SEB-3810`, `SEB-431Q`, `R-1122`,
  `W-0007`. This updates NV-7 from 13 orphans to **14**.
- **`SALES.customer_id` → `CUSTOMERS.cust_id`: 12 populated, 11 match.** The one
  failure is a Shopify order number (`#3088`) sitting in the customer column.
- `SHOPIFY-3088` also has its tax **rate** written into the `tax_amount` column
  (`tax_amount` = `0.0975`, `tax_rate` empty). A transposition, not a rounding
  difference.
- Two APPLIANCES rows carry multi-hundred-character prose in the **`stage`**
  column instead of a stage value (NV-8, still present).
- One APPLIANCES row still reads `FLOOR READY` with a space where every other
  row uses `FLOOR_READY` (NV-9, still present).

## What a Register-written SALES row must preserve

Write only fields the schema already defines, and leave the reconciliation
narrative columns to humans:

- **Identity/time**: `sale_id`, `timestamp`, `sale_date`, `week_id`
- **Money**: `amount` (tax-inclusive customer total), `tax_rate`, `tax_amount`
- **Classification**: `category`, `payment_type`, `entered_by`
- **Item snapshot at sale**: `item_id`, `inventory_sku_at_sale`,
  `item_description_at_sale`, `brand_at_sale`, `model_at_sale`,
  `serial_at_sale`, `warranty_at_sale`
- **Customer**: `customer_id`, `customer_name`, `customer_phone`
- **Provenance**: `sales_source`, `entry_type`

`week_id` is the Monday of the sale week (observed: `2026-09-08` for sales on
2026-09-10 and 2026-09-12).

Two shapes have no home in this schema and must not be invented into it: a
**multi-line sale** (one row carries exactly one item snapshot) and an
**idempotency key**. Both need an owner decision.
