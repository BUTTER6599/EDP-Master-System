# EDP OS Register — Implementation Tracker

Owner: Taylor Landry, The Electronics Depot LLC.
Scope of this file: the TEST-only Register rebuild. It records sequencing,
open decisions and deferred requirements so nothing is carried in conversation
alone. It is never pushed to Apps Script (the `.claspignore` allowlist excludes
it).

## Operational sequence (owner-defined, in order)

1. REAL INVENTORY
2. CART / CUSTOMER / CHECKOUT
3. COMPLETE SALE
4. INVENTORY + SALES RECORDING
5. RECEIPT / INVOICE
6. EPSON RECEIPT PRINTING
7. TEXT / EMAIL RECEIPT
8. STORE-FLOOR TESTING
9. VISUAL / RESPONSIVE POLISH
10. LIVE APPROVAL

## Current state

| Area | State |
| --- | --- |
| TEST web app (`/dev`) | Loads; `doGet`, `google.script.run` success and failure paths all runtime-proven |
| Data seam (`DataSource.gs`) | Live; MOCK and APPLIANCES_SHEET sources both present |
| Fail-closed validator | Live; runtime-proven |
| Pagination contract (`queryInventory`) | Live; runtime-proven 9/9 |
| Read-only APPLIANCES adapter | Built, tested, DEPLOYED to TEST, and INERT |
| `ACTIVE_DATA_SOURCE` | `APPLIANCES_SHEET` — **real inventory live in TEST** (Package 8) |
| Real-inventory runtime | **PROVEN and fully reconciled** — see below |
| Real appliance photos | **VERIFIED COMPLETE** by owner visual check (Package 9) |
| Complete Sale | Hard-disabled |
| Tests | 224 assertions, 7 suites, 0 failed |

### Package 8 — real-inventory runtime proof (verified 2026-09-23)

Owner-observed in the TEST `/dev` Register, `userHtmlFrame` console:
`getDataSourceInfo()` returned `id = APPLIANCES_SHEET`, `isMock = false`,
`readOnly = true`, and `queryInventory` returned 8 real records:

`R-4321, R-4131, R-4142, R-4160, S-316Q, W-105G, W-0540, W-4554`

FULLY RECONCILED: replaying the deployed mapping against corrected source data
predicts exactly those 8 — an exact set match. Of the 12 sellable candidates,
4 are withheld for stated reasons: `W-TEST-001` (TEST record), `W-0271`
(missing `list_price`), `W-732G` and `F-2904` (no valid `photo_links`).

Also closed by this proof: the Script Property `EDP_MASTER_DATABASE_ID` is
readable at runtime, and `PropertiesService` needs no additional OAuth scope —
the manifest declares only `spreadsheets.readonly`. Both were carried as
unverified assumptions since Package 7.

`cost_basis` is absent from the client payload: it is never mapped, so it is
structurally incapable of reaching the browser.

### Package 9 — real appliance photo display (owner-verified 2026-09-23)

Real photographs now render on the catalog cards. Confirmed on screen by the
owner: `W-105G` GE APPLIANCES HTW240ASK6WS $295.00, `W-0540` MAYTAG MVW6230HW0
$235.00, `W-4554` Roper RTW4516FW2 $265.00.

`W-4554` is significant: it is one of only two records whose `photo_links` are
stored **exclusively** as `drive.google.com/.../view` viewer pages. Its photo
rendering proves the URL normaliser works on real data, and answers the open
question of whether the Drive photos were publicly readable — they are.

Design: only two URL shapes are accepted, a direct
`lh3.googleusercontent.com/d/<id>` image and a Drive viewer page normalised to
that form. Everything else is refused, so the Register never points an `<img>`
at an unrecognised host. The generated SVG remains the fallback for records
with no usable photo and for images that fail to load, and the "Photo
placeholder" label now appears only when that fallback is actually in use.

**Scope of the owner's approval:** the display milestone only. It is NOT
approval of checkout, tax, customer data, sales writing, inventory mutation,
printing, LIVE deployment, or production readiness.

## Remaining TEST / mock elements on screen

Real inventory and its photographs are live. Everything else on the Register is
still simulated, and the screen says so in places:

| Element | State |
| --- | --- |
| Banner "TEST BUILD — MOCK DATA ONLY" | Static text. Now only partly true — inventory is real; the rest is not |
| Customer directory, purchase history, warranty claims | MOCK — `readCustomers` still returns `getMockCustomers()` |
| Activity timeline | MOCK — `readActivity` still returns `getMockActivity()` |
| Open ticket `TXN-MOCK-4471` | MOCK — and see NV-13 below |
| Sales Tax "(MOCK) · 9.45%" | MOCK placeholder rate. NV-1 still OPEN |
| Complete Sale | Hard-disabled |
| Receipt / invoice | Preview only. No printer bridge, no mail sender |

## Deferred requirements

### R-1 — Employee lock (checkout / security phase). NOT IMPLEMENTED.

Recorded 2026-09-17 at owner request. **Do not build before the checkout
phase.**

Required behaviour:

1. Register starts LOCKED.
2. Employee authenticates (login / PIN) to unlock.
3. Employee rings **ONE** sale.
4. The sale is successfully completed and finalized.
5. Transaction and receipt records are **successfully committed**.
6. Register then **automatically LOCKS**.
7. The next sale requires authentication again.

Precise semantics the implementation must honour:

- The lock fires **only after a successful completed sale whose records were
  committed**. Not when items are added to the cart. Not on an aborted or
  failed transaction — a failure must leave the session usable so the employee
  can retry or correct, never strand a customer mid-sale.
- One authentication grants exactly one completed sale, not a time window.
- Commit-then-lock ordering matters: if the commit fails, the Register must not
  lock, because locking would hide an uncommitted sale.

Open questions for that phase: where employee identity lives (the database has
an `EMPLOYEES` tab with `pin_id`/`name`/`role`/`active`, and a `Pickers` tab
with a `PIN` column — which is authoritative?); whether a PIN is hashed at
rest; lock behaviour on idle/refresh; and supervisor override.

**Security note for whoever builds this:** a client-side-only lock is
decorative. Anything that guards a real write must be enforced server-side, in
the Apps Script layer, not in `Scripts.html`.

## Open Needs-Verification items

| Id | Item | Status |
| --- | --- | --- |
| NV-1 | Tax treatment. **Evidence corrected 2026-09-23 — the original basis was wrong.** Of 147 SALES rows: 74 carry `tax_rate` 0.0975, 71 are blank, 2 are zero. Of the 72 taxed rows with both `amount` and `tax_amount`, **71 match tax-INCLUSIVE arithmetic** (`tax = amount / 1.0975 * 0.0975`) and **0 match tax-ADDED** (`amount * 0.0975`); 1 row (`SHOPIFY-3102`) fits neither. The pattern holds across appliances, parts, delivery and repair alike, which contradicts the claim that tax applies only to add-ons. Unresolved: practice is not the filed rule; the 53 blank-tax appliance rows are unexplained; `MOCK_TAX_RATE` 0.0945 differs from the only observed rate (0.0975); and the Register currently ADDS tax on top, which no historical row does. | **OPEN. No tax policy decision is approved.** Closes only on an authoritative current tax source, never on historical rows alone. Blocks Complete Sale. |
| NV-2 | `location` has no authoritative source column. Made optional in Package 7; nothing is fabricated. | RESOLVED for now; revisit if a real column appears |
| NV-3 | `category` case is inconsistent in source (WASHER / Washer, REFRIGERATOR / Refrigerator, one `ELECTRIC STOVE`). Adapter Title-Cases deterministically. | Mitigated in the adapter; source unchanged |
| NV-4 | `fuel_type` contaminated — `S-205Q` holds warranty text (`30 DAYS`) in the fuel column. `warranty_tier` blank in most rows with many spellings. | OPEN — not used by the Register yet |
| NV-5 | Duplicate audit tabs: `AuditLog` (19 rows) and `AUDIT_LOG` (**2,854** rows, corrected), different schemas and different eras. | OPEN — conflict, owner decision needed |
| NV-6 | `PURCHASE_RULES_TEST` — a TEST-named tab with 19 live rows in the production database. | OPEN |
| NV-7 | SALES↔inventory linkage, **corrected**: 27 of 147 SALES rows carry an `item_id`; only 14 of those match a row in APPLIANCES, leaving **13 orphans**. | OPEN — blocks reliable sales recording and the later "mark SOLD" step |
| NV-8 | Apparent misaligned APPLIANCES rows. | PARTLY RESOLVED — most were export artifacts, but `S-205Q` and `S-4877` carry genuine column drift (multi-hundred-character notes sitting in the `stage` column) |
| NV-9 | `S-6272-2` has `stage` = `FLOOR READY` (space) where every other row uses `FLOOR_READY` (underscore). A one-character typo silently removes stock from the floor, with no error. | OPEN — class of defect, not a one-off; needs a detection rule |
| NV-10 | `W-732G` and `S-205Q` have `photo_links` containing the literal text `TAYLOR` instead of a URL. The adapter withholds them (fail-closed working), but the rows are invisible on the floor until fixed. | OPEN — data entry |
| NV-11 | `TASKS_TEST` — a second TEST-named tab in production, **999 rows of which only 6 carry a `task_id`**. Not seen at all in the original Package 5B pass. | OPEN — unknown purpose |
| NV-12 | `list_price` is blank in **54 of 100** APPLIANCES rows, and `photo_links` in 24. Any such row is withheld from the floor with a stated reason. | OPEN — data completeness, not a code fault |
| NV-13 | The mock open ticket `TXN-MOCK-4471` references item IDs `EDP-10241` and `EDP-10190`, which no longer exist now that inventory is real. `findItem()` returns null, so those cart lines render with a blank name and a zero list price. Surfaced by the Package 8 cutover; harmless today because Complete Sale is disabled, but it is the first thing the checkout milestone has to address. | OPEN — blocks the cart/checkout milestone |

## Known cosmetic item

`Scripts.html` renders `esc(it.itemId) + ' · ' + esc(it.location)`. With an
empty location this yields a trailing `· `. Invisible today because every mock
record has a location; it can only appear after real-inventory cutover. One-line
fix, deliberately deferred to the cutover package rather than touching a client
file under a no-redesign freeze.

## Evidence provenance and superseded findings

**The corrected re-discovery of 2026-09-23 supersedes the affected Package 5B
analysis.** The original evidence directory
`EDP_PKG5B_SCHEMA_DISCOVERY_20260917T045422Z` is **preserved unchanged** as
history — nothing in it was edited or deleted. Where the two disagree, the
corrected pass in `EDP_PKG5B_CORRECTED_REDISCOVERY_20260923T024912Z` is right.

Two independent faults caused the original errors:

1. **Truncated export.** Package 5B read a markdown export of the workbook. The
   tool warned the content might be incomplete for large files, and it was.
   Roughly half the database was missing and the warning was not acted on.
2. **Broken parser.** Later xlsx tooling used a greedy attribute regex that
   mishandles self-closing empty cells, swallowing following cells and shifting
   values into the wrong columns. The fix is one character: `[^>]*` → `[^>]*?`.

Corrected row counts (old → corrected): SALES 76 → **147**, CUSTOMERS 94 →
**1,127**, AUDIT_LOG 248 → **2,854**, TIME_LOGS 414 → **1,431**,
VAPI_CALL_LOG 206 → **975**, APPLIANCES 94 → **100**, TICKETS 81 → **88**,
tabs 37 → **38**. Twenty-nine tabs were unchanged.

**Superseded specifically:**

- All Package 5B row counts, and its blank-field counts for `list_price` and
  `photo_links`.
- The Package 5B tax claim that "53 of 58 appliance sales record no separate
  tax; only Shopify imports carry 0.0975" — wrong on the facts.
- The Package 5B linkage claim of "5 of 76 SALES rows carry an item_id".
- **The Package 6 correction about `W-0271` is itself withdrawn.** It claimed
  `W-0271` had a price of 100.0 and a blank stage; that came from the broken
  parser. The original Package 5B finding was correct: `W-0271` has **no**
  `list_price` and **is** `FLOOR_READY`/`AVAILABLE`, which is exactly why the
  adapter withholds it today.

**Still valid from Package 5B:** APPLIANCES as the authoritative inventory tab
and its 26 headers; the `FLOOR_READY` + `AVAILABLE` sellability rule;
appliances as unit records versus PARTS carrying a quantity; that no Sheets
adapter previously existed anywhere; `photo_links` as a comma-separated URL
list; that `cost_basis` must never reach the client; the duplicate audit-tab
conflict; and weak SALES linkage (now quantified more precisely).

## Standing safety rules

No LIVE changes. No old Register. No production deployment. No merge to
`main`/`master`. No SALES, inventory, or customer writes. No spreadsheet writes
of any kind. Complete Sale stays disabled until explicitly authorized. Every
write is preceded by a byte-exact backup and a stated rollback.
