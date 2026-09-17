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
| `ACTIVE_DATA_SOURCE` | `MOCK` — real inventory not cut over |
| Complete Sale | Hard-disabled |
| Tests | 184 assertions, 6 suites, 0 failed |

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
| NV-1 | Tax treatment. 53 of 58 in-store appliance sales record no separate tax at round, cents-free prices; the only rows carrying 0.0975 are Shopify imports, two of which are column-shifted. Practice is not the filed rule. `MOCK_TAX_RATE` 0.0945 is a placeholder and differs from the only observed real rate. | OPEN — must be resolved from approved EDP records before Complete Sale is enabled |
| NV-2 | `location` has no authoritative source column. Made optional in Package 7; nothing is fabricated. | RESOLVED for now; revisit if a real column appears |
| NV-3 | `category` case is inconsistent in source (WASHER / Washer, REFRIGERATOR / Refrigerator, one `ELECTRIC STOVE`). Adapter Title-Cases deterministically. | Mitigated in the adapter; source unchanged |
| NV-4 | `fuel_type` contaminated — some rows hold warranty values, one holds `1954`. `warranty_tier` blank in most rows with 13 spellings. | OPEN — not used by the Register yet |
| NV-5 | Duplicate audit tabs: `AuditLog` (19 rows) and `AUDIT_LOG` (248 rows), different schemas. | OPEN — conflict, owner decision needed |
| NV-6 | `PURCHASE_RULES_TEST` — a TEST-named tab with 19 live rows in the production database. | OPEN |
| NV-7 | Weak SALES↔inventory linkage: only 5 of 76 SALES rows carry an `item_id`. Matters for the later "mark SOLD" step. | OPEN — blocks reliable sales recording |
| NV-8 | Apparent misaligned APPLIANCES rows. | RESOLVED — markdown-export artifact, not data corruption; the real cells are clean |

## Known cosmetic item

`Scripts.html` renders `esc(it.itemId) + ' · ' + esc(it.location)`. With an
empty location this yields a trailing `· `. Invisible today because every mock
record has a location; it can only appear after real-inventory cutover. One-line
fix, deliberately deferred to the cutover package rather than touching a client
file under a no-redesign freeze.

## Standing safety rules

No LIVE changes. No old Register. No production deployment. No merge to
`main`/`master`. No SALES, inventory, or customer writes. No spreadsheet writes
of any kind. Complete Sale stays disabled until explicitly authorized. Every
write is preceded by a byte-exact backup and a stated rollback.
