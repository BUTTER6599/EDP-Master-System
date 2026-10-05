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
| Sales tax | **9.75% TAX-INCLUSIVE** — approved, implemented, 115 assertions. Staged locally, NOT deployed |
| Receipt data model | **ONE model** — `buildReceiptModel()` (Package 11). Staged locally, NOT deployed |
| Receipt printing | Route D wired in source (system print hand-off). Staged locally, NOT deployed, NOT proven on paper |
| Tests | 432 assertions, 10 suites, 0 failed |

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

### Package 11 — Android to physical TEST receipt (STAGED, NOT DEPLOYED)

**Chosen route (owner-approved): Route D — print through the device's own print
service.** The page hands the rendered receipt to the browser, the browser hands
it to the OS, and the OS print service talks to the printer. The Register never
addresses the printer, so it holds no printer address, no certificate and no
credential — which is exactly why the untrusted self-signed printer certificate
and browser mixed-content rules cannot block it, and why there is nothing to
roll back on the printer.

Routes rejected, and why:

| Route | Why not |
| --- | --- |
| Certificate + ePOS-Print over HTTPS | Requires uploading a trusted certificate to the printer. Printer admin credentials are UNKNOWN, so this is blocked at step 1 |
| Server Direct Print | Also needs printer admin access, plus a world-reachable anonymous `/exec` holding receipt jobs — a security decision far larger than the problem |
| Local print bridge on the Windows PC | Called from an HTTPS page, so it needs a trusted certificate of its own. Solves a certificate problem with a certificate problem, and adds an always-on machine |

Verified printer facts (owner-observed, 2026-09-25): Epson TM-m30II, model
M362B, serial X855040637, MAC 38:1A:52:9C:C9:CA, at 192.168.12.97/24, gateway
192.168.12.1, DHCP enabled. The Android phone reaches it over the LAN; the
printer redirects HTTP to HTTPS; Chrome shows a RED warning on that HTTPS
(untrusted self-signed certificate); the "Authentication failed" dialog is the
**admin web UI**, not the print endpoint; and Epson TM Utility (a native Android
app) produced a physical test print. Printer admin credentials are UNKNOWN, so
certificate inspection is BLOCKED pending them.

What was built (staged locally, nothing deployed):

- `buildReceiptModel()` — the single receipt data model. Screen preview,
  thermal print, reprint, email receipt, text receipt and ePOS-Print XML all
  consume this and nothing else, so phone, tablet and desktop cannot drift.
- TEST marking — **TEST — NOT A SALE** at the top AND the bottom of every
  receipt, driven by `COMPLETE_SALE_ENABLED`, not by a separate switch. It
  fails CLOSED: any value other than boolean `true` still prints the mark.
- A second, independent field allowlist. The builder copies named fields out of
  an inventory record and never spreads it, so a future server-side change
  cannot put a private column onto paper.
- `#btnPrint` wired to `window.print()`. Email Receipt and Reprint stay inert.
- `buildEposPrintXml()` — written and tested against the same model, and
  **deliberately never called**. It exists so that if Route D's graphic print
  quality proves unacceptable, the ESC/POS text path already consumes the one
  model rather than growing a second one.
- A thermal print stylesheet: 72mm roll width, pure black, photos suppressed,
  page chrome removed. Verified by rendering the real page under `media: print`
  in a real browser and measuring computed style, not by reading the CSS.

**NOT proven:** no receipt has been printed on paper from the Register. Route
D's mechanism is standard Android plus standard Epson tooling, but it is
UNVERIFIED here until the owner sees a physical slip. Two specific risks are
open: whether Apps Script's sandboxed `userHtmlFrame` permits `window.print()`
(the code logs `BLOCKED` and names the browser-menu fallback if it does not),
and whether the print service issues an auto-cut.

Nothing was deployed. Nothing on the printer or the network was touched.

## Remaining TEST / mock elements on screen

Real inventory and its photographs are live. Everything else on the Register is
still simulated, and the screen says so in places:

| Element | State |
| --- | --- |
| Banner "TEST BUILD — MOCK DATA ONLY" | Static text. Now only partly true — inventory is real; the rest is not |
| Customer directory, purchase history, warranty claims | MOCK — `readCustomers` still returns `getMockCustomers()` |
| Activity timeline | MOCK — `readActivity` still returns `getMockActivity()` |
| Open ticket `TXN-MOCK-4471` | MOCK — and see NV-13 below |
| Sales Tax | **REAL** — 9.75% TAX-INCLUSIVE (owner policy 2026-10-03). NV-1 RESOLVED |
| Complete Sale | Hard-disabled |
| Receipt / invoice | Print is wired to the device print service (staged, not deployed). Email Receipt and Reprint are still inert |
| Every receipt produced | Marked **TEST — NOT A SALE**, top and bottom, driven by `COMPLETE_SALE_ENABLED` |

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
| NV-1 | **RESOLVED 2026-10-03 by owner policy decision.** EDP retail prices are TAX-INCLUSIVE at the combined 9.75% general rate (Louisiana state 5.00% + Jefferson Parish general merchandise 4.75%). The displayed price IS the customer total; tax is extracted from it (`tax = total - total / 1.0975`), never added. The 9.45% `MOCK_TAX_RATE` is deleted from source. The historical evidence below is consistent with this and was NOT the basis for the decision — the owner's authoritative rate review was. | **CLOSED.** It no longer blocks Complete Sale; the remaining blockers are the SALES writer and inventory mutation, neither of which exists. |
| NV-1 (historical evidence, retained) | Tax treatment. **Evidence corrected 2026-09-23 — the original basis was wrong.** Of 147 SALES rows: 74 carry `tax_rate` 0.0975, 71 are blank, 2 are zero. Of the 72 taxed rows with both `amount` and `tax_amount`, **71 match tax-INCLUSIVE arithmetic** (`tax = amount / 1.0975 * 0.0975`) and **0 match tax-ADDED** (`amount * 0.0975`); 1 row (`SHOPIFY-3102`) fits neither. The pattern holds across appliances, parts, delivery and repair alike, which contradicts the claim that tax applies only to add-ons. Unresolved: practice is not the filed rule; the 53 blank-tax appliance rows are unexplained; `MOCK_TAX_RATE` 0.0945 differs from the only observed rate (0.0975); and the Register currently ADDS tax on top, which no historical row does. | **OPEN. No tax policy decision is approved.** Closes only on an authoritative current tax source, never on historical rows alone. Blocks Complete Sale. |
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

### Package 11 test-harness provenance

- `test/run/receipt-tests.cjs` and `test/run/print-render-tests.cjs` are NEW
  in Package 11. They have no counterpart in `test/recovery-snapshot/`, so the
  "differs from the preserved evidence by exactly one line" claim in
  `test/run-all.cjs` does not apply to them and was never meant to.
- `test/run-all.cjs` was edited to register the two new suites and renumber the
  step headers. No existing suite file was modified.
- The "Tests" row above previously read **224 assertions, 7 suites** — that was
  already stale before Package 11 began. The accepted figure entering Package 11
  was 280 assertions across 8 suites; it now reads 432 across 10.
- Three Package 11 assertions check source-level bans against **comment-stripped**
  code rather than raw file text. That change was forced, not chosen: the first
  run failed because `DataSource.gs`'s own header says "No setProperty" and
  `Scripts.html`'s own header says "No fetch/XHR/WebSocket" — the suite was
  matching the prose that documents each ban. The stripper is itself asserted
  before any ban relies on it, and the printer-address and endpoint bans are
  still checked against the raw file, code and comments alike.
- Package 11 pre-write byte-exact copies of the three edited files, with their
  SHA-256 digests, are preserved in `test/pkg11-prewrite/`. That directory sits
  outside the `.claspignore` allowlist and can never reach Apps Script.

## Standing safety rules

No LIVE changes. No old Register. No production deployment. No merge to
`main`/`master`. No SALES, inventory, or customer writes. No spreadsheet writes
of any kind. Complete Sale stays disabled until explicitly authorized. Every
write is preceded by a byte-exact backup and a stated rollback.

## Package 12 — tax-inclusive retail pricing (STAGED, NOT DEPLOYED)

Owner policy decision, 2026-10-03. This closed NV-1.

**EDP advertised and selling prices are TAX-INCLUSIVE.** The price shown on an
item IS what the customer pays. Tax is never added on top; it is extracted from
the total already displayed.

| | |
| --- | --- |
| Combined rate | **9.75%** |
| Louisiana state general sales tax | 5.00% |
| Jefferson Parish general merchandise | 4.75% |
| Tax contained in a total | `tax = total - (total / 1.0975)` |
| Pre-tax taxable amount | `subtotal_before_tax = total - tax` |

A $300.00 advertised appliance is a $300.00 customer total, of which $26.65 is
tax and $273.35 is the pre-tax amount.

**What changed structurally:**

- `MOCK_TAX_RATE` 0.0945 is **deleted**, not commented out, so it cannot be
  reinstated by uncommenting a line. 9.45% was never an EDP rate: it appears
  nowhere in the historical SALES data, and it was applied additively, which no
  historical EDP sale does.
- The rate now exists in exactly **one** place, `CONFIG.SALES_TAX` in
  `Config.gs`, together with its authority and its component rates. The client
  hard-codes no rate at all — a test asserts that `0.0975`, `0.0945` and
  `1.0975` appear nowhere in `Scripts.html`.
- Tax configuration **fails closed**. The old `CFG.taxRate || 0` idiom turned a
  missing rate into a silent 0%, which renders as a perfectly normal-looking
  `$0.00` tax line. A rate that is absent, zero, negative, non-numeric or out of
  range now produces no tax figure and no total at all, and the screen shows an
  em dash with a stated reason.
- `money()` renders any non-finite figure as an em dash rather than `$0.00`, so
  an uncomputed total can never be mistaken for a real one.
- Tax is split in whole cents: the tax is rounded once and the pre-tax amount is
  the remainder, so the two parts always reconstruct the total exactly. Verified
  across every total from $0.01 to $2,000.00 — 200,000 cases, zero drift and
  zero inflation of the customer total.

**Warranty treatment — NEW OPEN ITEM (NV-14).** Warranty coverage is currently
carried inside the tax-inclusive total along with the goods, so the customer
total is exactly the sum of the prices on display. Whether a service contract is
taxable at the same combined rate in Jefferson Parish has NOT been established
and was not part of the owner's decision. This does not change what the customer
pays either way — only how the tax portion is reported. **OPEN.**

Nothing was deployed. No Sheet write, no inventory mutation, no SALES write.

## Package 13 — Complete Sale foundation (STAGED, NOT DEPLOYED)

Built 2026-10-04. TEST only. Nothing deployed, no write enabled.

### What already existed (inspection result)

Almost nothing. The honest finding is that **no Complete Sale architecture
existed at all** beyond four throwing stubs in `Code.gs`:
`completeSale_NOT_IMPLEMENTED`, `markInventorySold_NOT_IMPLEMENTED`,
`printReceipt_NOT_IMPLEMENTED`, `emailReceipt_NOT_IMPLEMENTED`. None is called
by anything. There was **no SALES adapter, no inventory-mutation adapter, no
event/outbox mechanism, no transaction id generator, no idempotency, no tender
capture, no duplicate-click protection, and no visible error state** — both
`withFailureHandler` callbacks were silent, one with an empty body.

### What Package 13 added

`Sale.gs` (new, 11th allowlisted file) holds the parts that can exist safely
while every write flag is off:

- **Server-authoritative identity and clock.** `newSaleId_()` and `saleNow_()`.
  One instant per sale, reused everywhere, so id, record and receipt cannot
  disagree about when a sale happened. A client-supplied id, timestamp or total
  is ignored outright, not re-checked.
- **A normalised request model** carrying `requestId`, customer, payment,
  tender and lines — and deliberately **no money the server will believe**.
- **Fail-closed validation** with stable error codes (`SALE_*`), so the client
  can branch and tests can assert without matching prose. Twenty-three refusal
  cases are covered.
- **Authoritative money in whole cents**, including the Package 12 tax-inclusive
  split. A test proves server and client agree across 100,000 totals.
- **`prepareSale()`** — an exposed read-only dry run that prices a cart and says
  whether it is sellable, without completing anything.
- **`completeSale()`** — the orchestration skeleton. It refuses as its first
  statement, and the seven future steps are comments in dependency order, not
  code. With both write flags forced on it STILL refuses, because no writer
  exists: the flag is not the only thing between a cart and a sale.

Client (`Scripts.html`): request-attempt identity that survives retries and is
abandoned whenever the cart changes; a real double-submit lock that cannot be
unlocked by a stale release; and server failures routed into the Activity
timeline instead of being swallowed.

### Deliberately NOT built

No SALES row layout, no SALES writer, no inventory mutation, no outbox. See the
blockers below — each is a thing that must be confirmed, not guessed.

### New open items

| Id | Item | Status |
| --- | --- | --- |
| NV-15 | **RESOLVED 2026-10-04 (Package 14A).** The SALES schema was re-read read-only from `EDP_MASTER_DATABASE` and is recorded durably at `test/schema-evidence/EDP_MASTER_DATABASE-2026-10-04.md`: 32 columns, `sale_id` unique across all 148 rows. The `S-<epochMs>-<rand>` format is LEGACY and ABANDONED (66 rows, 2026-06-08 to 2026-07-18 only, carrying zero item/customer/tax/status linkage); everything since is `SHOPIFY-<order#>` reconciled by hand. **There is no currently-active EDP-generated sale-id convention**, so the Register is not at risk of colliding with one — it would be establishing the first, which is an owner decision (NV-20). | **CLOSED** — superseded text below kept as history |
| NV-15 (original, superseded) | **The approved SALES schema could not be confirmed.** The Package 5B evidence directories lived outside the repository and did not survive the container being reclaimed; `ROADMAP.md` records row counts and a few field names (`tax_rate`, `amount`, `tax_amount`, `item_id`) but not the column list. Reading the live database needs owner authorisation. The existing sale-id convention is likewise unknown — rows such as `SHOPIFY-3102` were observed, so a convention exists. `SALE_ID.PRODUCTION_PREFIX` is therefore `null` and the generator REFUSES to mint an id when writes are enabled. | **OPEN — blocks the SALES writer** |
| NV-16 | Whether a sale must name a customer. Today the Register sells to Walk-in and no owner decision has changed that, so `REQUIRE_CUSTOMER_FOR_SALE` is `false`. It is a named constant so the policy is visible and testable both ways. | OPEN — policy |
| NV-17 | **Server-side idempotency cannot be completed yet.** Apps Script is stateless between calls, and this build has no store: `PropertiesService.setProperty` is banned by the zero-write-verb guarantee, and the OAuth scope is read-only, so a sheet-backed ledger is impossible too. The `requestId` travels end to end and is validated; ENFORCEMENT needs a store (CacheService, or a sheet once writes exist). A repeated dry run therefore still mints a fresh id, and a test asserts exactly that rather than implying dedupe works. | **OPEN — blocks safe retry** |
| NV-18 | No tender capture exists in the UI. The request model and validation accept `amountTenderedCents` and compute change, but no control produces it. | OPEN — UI work |
| NV-19 | No event/outbox mechanism exists anywhere. Designed only, not built: `SALE_COMPLETED`, `INVENTORY_SOLD`, `RECEIPT_PRINT_REQUESTED`, appended after the SALES row succeeds, so downstream systems react to one authoritative record instead of inventing their own version of the sale. | OPEN — design recorded, not implemented |

NV-7 (13 orphan SALES rows with no matching appliance) remains open and is now
directly on the critical path: it is the same linkage the "mark SOLD" step will
depend on.

### Ordering rule for the eventual writer

Nothing irreversible happens until the sale record exists, and the record is
written before inventory moves. A crash between the two then leaves a sale that
can be reconciled, rather than stock that vanished into no sale at all.


## Package 14A — NV-15 resolved by read-only schema recovery (2026-10-04)

Read-only. Zero writes, zero deployment, no LIVE change. Evidence committed at
`test/schema-evidence/EDP_MASTER_DATABASE-2026-10-04.md` so a future container
reclaim cannot erase it again — which is exactly what created NV-15.

Method note: the workbook was parsed with `exceljs` 4.4.0, a vetted library,
**not** the hand-written regex parser whose greedy attribute match corrupted the
Package 8 reading. The export sha256 is recorded alongside the schema.

### What this unblocked

- **SALES row shape** — 32 named columns, exact order recorded.
- **"Mark SOLD"** — a single-cell write, `APPLIANCES.status` to `SOLD`. The value
  already exists on 16 rows. `stage` is NOT changed. There is no `PAID` value and
  no `sold_date`/`sale_id` column on the appliance.
- **Customer key** — `CUSTOMERS.cust_id`, uniformly `EDP-####` across all 1,128
  rows. SALES calls the same thing `customer_id`.
- **Employee source** — `EMPLOYEES` (`pin_id`, `name`, `role`, `active`), which is
  what the deferred R-1 employee lock will read.
- **Outbox** — confirmed none exists, so Package 13's design does not duplicate
  anything.

### New open items

| Id | Item | Status |
| --- | --- | --- |
| NV-20 | **The Register must establish the first active EDP sale-id convention.** The only native format (`S-<epochMs>-<rand>`) was abandoned on 2026-07-18 and carried no linkage; `SHOPIFY-<order#>` belongs to Shopify and cannot be minted for an in-store sale. `AUDIT_LOG` uses a different convention again (`LOG-<yyyymmdd>-<nnnn>`). Package 13 therefore still refuses to mint a production id, and `SALE_ID.PRODUCTION_PREFIX` stays `null`. | **OPEN — owner decision, blocks the writer** |
| NV-21 | **SALES has no multi-line sale shape.** One row carries exactly one item snapshot (`item_id`, `brand_at_sale`, `model_at_sale`, `serial_at_sale`, `warranty_at_sale`). A two-appliance cart has no approved representation: one row losing an item, or N rows sharing a `sale_id`, are both schema changes. | **OPEN — owner decision, blocks the writer** |
| NV-22 | **SALES has no idempotency column.** Nothing in the 32 columns can hold a request id, so a retry cannot be recognised against the sheet without a schema change. This is the sheet-side half of NV-17. | **OPEN — blocks safe retry** |
| NV-23 | `payment_type` has only ever held `Cash`, `Cash App`, `Unknown` and `N/A`. The Register offers Card, Financing, Layaway and Check, none of which has ever been written. The vocabulary a Register sale should use is unconfirmed. | OPEN — policy |
| NV-24 | `detail_status`, `inventory_update_status` and `accounting_status` are free-text human reconciliation prose (27 / 25 / 24 distinct values, mostly unique sentences), not enums. A machine writer should probably leave them empty rather than invent a vocabulary. | OPEN — policy |
| NV-25 | `entered_by` is free text (`TAYLOR`, `THE ELECTRONICS DEPOT`, `Yvonne`, reconciliation phrases) and does **not** reference `EMPLOYEES.pin_id`. What a Register sale should record is unconfirmed. | OPEN — policy |

### Findings that update existing items

- **NV-7 worsens: 14 orphans, not 13.** `SALES.item_id` is populated on 28 rows
  and only 14 match an APPLIANCES row. The newest orphan is `W-0007`, from the
  most recent reconciled sale.
- **NV-5 confirmed still open** — both `AUDIT_LOG` (2,934 rows) and `AuditLog`
  (19 rows) exist with different schemas.
- **NV-8 confirmed still present** — two APPLIANCES rows carry multi-hundred-character
  prose in the `stage` column.
- **NV-9 confirmed still present** — one row still reads `FLOOR READY` with a space.
- **Two new data faults**, recorded but not corrected (this package writes nothing):
  `SHOPIFY-3088` has its tax RATE in the `tax_amount` column and a Shopify order
  number (`#3088`) in `customer_id`.

## Package 14B / 15 preparation — approved architecture recorded (2026-10-04)

Owner decisions approved 2026-10-04: sale id **`EDP-YYYYMMDD-NNN`**; **one SALES
row per item sharing one `sale_id`**; a **dedicated `request_id` column**, never
hidden in `notes`. Full design at
`test/design/PACKAGE-15-COMPLETE-SALE-DESIGN.md`.

**Nothing was written, migrated or deployed.** The migration is approved and
recorded as `SALES_MIGRATION.APPLIED = false`, and `salesRowsToArrays_()`
refuses to build a positional row until it is true — so a 33-wide row can never
be written into the current 32-wide sheet.

`allocateDailySequence_()` throws. The format is approved but the allocator is
not built: it needs a SALES read (permitted by the current read-only scope — a
code gap, not a permissions gap), a `LockService` lock held across read-then-append,
and write access. A guessed sequence would silently merge two real sales.

### Searches performed before proposing anything

| Looked for | Result |
| --- | --- |
| Store credit ledger | **NOT FOUND as a structure. FOUND as free-text liability** in `PURCHASES.status`, `CUSTOMERS.notes`, `APPLIANCES.notes` *and* `APPLIANCES.stage`, and `TICKETS.notes`. At least $30 open and unredeemed for `EDP-3116` |
| Payment / deposit plan | **NOT FOUND.** Deposits are recorded today as SALES rows with `category = Deposit` and `entry_type = DEPOSIT_REFERENCE_NONREVENUE` |
| Hold structure | **FOUND — `CUSTOMER_HOLDS`, actively used** (rows 2026-10-02 and 2026-10-03), `hold_id` = `HR-YYYYMMDD-NNNN`. No money fields. Must not be duplicated |
| Locking / concurrency | **NOT FOUND.** No `LockService`, `getScriptLock` or `CacheService` anywhere in EDP |
| Messaging consent | **FOUND — `SMS_CONSENT_LOG`**, with `cust_id`, `consent_status_after_event`, `consent_scope`, `disclosure_version` and a TEST/LIVE `environment` column. A Text Receipt must check it |
| Holiday / business calendar | **NOT FOUND** (NV-27) |

### New open items

| Id | Item | Status |
| --- | --- | --- |
| NV-26 | **Split tender has no representation in SALES.** `payment_type` is one free-text value, so `$50 Store Credit + $250 Cash` cannot be recorded without a child tab or an agreed encoding | OPEN — blocks split tender |
| NV-27 | **Holiday handling for both storage rules.** No calendar exists anywhere; nothing was assumed | OPEN |
| NV-28 | **Store credit is an unreconciled liability in free text.** A ledger is its own package. Until it exists, STORE CREDIT must not be selectable as a tender — a cashier would have no balance to check against | OPEN — blocks Store Credit tender |
| NV-29 | The AI receptionist tells callers EDP does "not offer financing or credit" while trade-in credit is being issued | OPEN — customer-facing conflict |
| NV-30 | `sale_id` stops being unique per ROW and becomes unique per TRANSACTION. It is unique across all 148 historical rows today; any report assuming row-uniqueness must be re-read | Recorded consequence of the approved design |

NV-23 narrows: approved tender is **Cash** only. Store Credit is blocked by
NV-28, Payment & Pickup Plan is not a tender, and **Card, Financing and Check
are not approved** — their UI controls should be removed or disabled rather than
left to imply capability.

### Storage rules recorded (not charged)

Payment & Pickup Plan: 14 calendar days, then 6 EDP open days, then $9.00/day.
Repair: 3 open days from ready-for-pickup, then $9.00/day. Sunday never counts.
Kept as two separate rule sets. The repair rule is already live — `VAPI_CALL_LOG`
records the AI receptionist quoting "$9 per day ... within three days of
notification", which agrees with the constants recorded in `Sale.gs`.

## Package 15B — locked sale-id sequence allocator (READ ONLY, 2026-10-05)

Built after the `request_id` migration verified. **No write of any kind** — no
SALES row, no reservation, no new tab, no Script Property, no scope change.

### Architecture

Split deliberately into a pure core and one I/O call, so every rule is
deterministic and testable without a clock or a network:

| Function | Kind | Job |
| --- | --- | --- |
| `businessDateKey_(epochMs)` | pure | `yyyyMMdd` in **America/Chicago** |
| `parseRegisterSaleId_(id)` | pure | strict parse, or `null` |
| `looksLikeRegisterSaleId_(id)` | pure | does it *claim* to be ours |
| `highestSequenceFor_(ids, day)` | pure | highest used that day |
| `nextSequenceFrom_(ids, day)` | pure | highest + 1, ceiling-checked |
| `fetchSaleIdColumn_()` | **I/O** | `Sheets…Values.get('SALES!A2:A')` |
| `withSaleLock_(fn)` | **I/O** | the transaction boundary |
| `allocateDailySequence_(now)` | both | the above, composed |

**Only column A is read.** Reading the whole tab would pull customer names and
phone numbers into the Register for no reason; the allocator needs one column
and takes one column.

### Rules

Highest wins — **gaps are never refilled**. If `001` and `003` exist the next is
`004`, because reusing `002` would point two sales at one id the moment that gap
turned out to be a deleted row rather than a skipped one.

`S-…`, `SHOPIFY-…`, `SHOPIFY-…-RECON` and `MANUAL-…` are ignored, as is any
unknown third-party format. But a value that **claims** to be a Register id and
is malformed — `EDP-20261005-1000`, `EDP-20261005-01`, `edp-…` — **fails
closed**, because silently skipping a Register id this code cannot read could
hand out a number already in use.

At `999` for one business date it refuses rather than rolling over into a format
nobody approved.

### Locking, and the limitation that matters

`withSaleLock_()` uses `LockService.getScriptLock()` with `tryLock(20000)` — a
boolean is easier to fail closed on than an exception — and releases in a
`finally`, so one bad sale cannot wedge every till behind it. A busy lock, a
throwing lock service, and no `LockService` at all **all refuse the sale**.

**The allocator is ADVISORY, and this is not papered over.** The number is
correct at the instant it is read and is *not reserved*, because nothing is
written. Two sales calling it back to back with no append between them **both
receive the same number** — a test asserts exactly that rather than implying a
safety that does not exist. The lock serialises the readers; it cannot reserve
what nobody writes.

Uniqueness arrives only when the SALES append happens **inside the same
`withSaleLock_` call**, making "read the highest" and "claim the next" one
indivisible step.

### The intended transaction boundary (NOT implemented)

```
withSaleLock_(function () {
  check request_id idempotency        <- needs a SALES read, exists
  determine next sale id              <- BUILT (Package 15B)
  build and validate rows             <- BUILT (Package 14B)
  append SALES rows                   <- NOT BUILT, needs a write scope
  mark APPLIANCES.status = SOLD       <- NOT BUILT, needs a write scope
});
```

Everything inside that block up to the append now exists. The two write steps do
not, and neither does the scope that would permit them.

### Test-harness corrections, disclosed

Two of this package's failures were my own harness, not the code:

- The `Utilities.formatDate` stub **ignored the timezone** and formatted in UTC.
  That was tolerable while nothing asserted a real wall-clock date; the
  business-date rules do. It now resolves the zone through `Intl`. This stub has
  been wrong twice now, and both times it failed correct code.
- An end-to-end fixture hard-coded `20261005` while `prepareSale` uses the real
  clock. In Chicago it was still 2026-10-04, so the allocator correctly started
  a fresh day at `001`. The fixture now derives today's Chicago business date.
