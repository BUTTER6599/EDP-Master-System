# Package 15 — Complete Sale design (PREPARATION ONLY)

Prepared 2026-10-04 against the schema verified in
`test/schema-evidence/EDP_MASTER_DATABASE-2026-10-04.md`.

**Nothing in this document has been executed.** No sheet was modified, no write
scope added, nothing deployed, no LIVE change.

---

## 1. Approved decisions recorded (Package 14B)

| Decision | Value |
| --- | --- |
| Register sale id | **`EDP-YYYYMMDD-NNN`**, e.g. `EDP-20261004-001`. NNN restarts at 001 each day |
| Multi-item sales | **One SALES row per item**, every row sharing one `sale_id` |
| Idempotency | **A dedicated `request_id` column**, never hidden in `notes` |
| Tax | Unchanged: tax-INCLUSIVE at 9.75% |

The chosen id shape matches what the business already mints elsewhere —
`CUSTOMER_HOLDS` uses `HR-YYYYMMDD-NNNN` and `AUDIT_LOG` uses
`LOG-YYYYMMDD-NNNN` — so it reads as an EDP id on sight and cannot be confused
with `SHOPIFY-<order#>` or the abandoned `S-<epochMs>-<rand>`. Both historical
families are preserved as read-only patterns and are never minted.

---

## 2. SALES row mapping

One row per item. Implemented as the pure function `buildSalesRows_()`, which
writes nothing.

| Column | Register value |
| --- | --- |
| `sale_id` | `EDP-YYYYMMDD-NNN`, **identical on every row of the transaction** |
| `timestamp` | `yyyy-MM-dd HH:mm:ss`, store time, server-authoritative |
| `sale_date` | `yyyy-MM-dd` |
| `week_id` | Monday of that week, `yyyy-MM-dd` (matches observed convention) |
| `amount` | That row's tax-INCLUSIVE total |
| `category` | `Appliance Sale` (the dominant existing value, 114 of 148 rows) |
| `payment_type` | The approved method label |
| `item_id`, `inventory_sku_at_sale` | The real appliance id |
| `item_description_at_sale`, `brand_at_sale`, `model_at_sale` | Snapshot at sale |
| `warranty_at_sale` | The warranty label chosen at the till |
| `tax_rate` | `0.0975` |
| `tax_amount` | That row's extracted tax |
| `sales_source` | `EDP_REGISTER` — a new value, distinguishing Register sales from `SHOPIFY` |
| `entry_type` | `REGISTER_SALE` — likewise |
| `customer_id`, `customer_name`, `customer_phone` | From `CUSTOMERS`, or blank for walk-in |
| `request_id` | The idempotency key (column 33, pending migration) |

**Deliberately left EMPTY, and why:**

- `notes`, `detail_status`, `inventory_update_status`, `accounting_status` —
  these are human reconciliation prose in the real sheet (27 / 25 / 24 distinct
  values, mostly unique sentences). A machine inventing a vocabulary here would
  corrupt a column people read. (NV-24)
- `invoice_number`, `source_order_id`, `source_order_number`, `import_batch_id`,
  `legacy_item_id` — these belong to Shopify imports and reconciliation. A
  Register sale has no such source.
- `serial_at_sale` — the Register holds only `[ SERIAL PLACEHOLDER ]`; writing
  that literal into a serial column would be worse than leaving it blank.
- `entered_by` — NV-25 unresolved; supplied by the caller or left blank.
- **Column 32** — has no header in the sheet. Never written.

### Money reconciliation

Each row carries its own tax-inclusive amount and its own extracted tax, because
every historical row stands alone. Rounding each row independently can leave the
row taxes a cent away from the transaction tax, so the difference is pushed onto
the largest row and the result is **asserted** before rows are returned. Totals
that do not reconcile throw. Verified across 3,000 two-item transactions.

---

## 3. The request_id migration — exact plan, NOT EXECUTED

| | |
| --- | --- |
| Target | `SALES` tab of `EDP_MASTER_DATABASE` |
| Change | **Append ONE column**, header `request_id`, at **column 33** |
| Existing columns | **Untouched and not reordered.** Columns 1–32 keep their positions |
| Existing rows | **Untouched.** 148 historical rows gain an empty cell; no value is written to any of them |
| Reversibility | Deleting column 33 restores the sheet exactly |

**Why column 33 and not 32.** Column 32 exists, has no header, and holds one
stray populated cell. Reusing it would mean writing the idempotency key into a
column whose purpose nobody has established. `salesRowsToArrays_()` refuses to
build a positional row until `SALES_MIGRATION.APPLIED` is true, precisely so a
33-wide row can never be written into a 32-wide sheet and land `request_id` in
that unheaded column.

### Is request_id alone sufficient?

**Yes.** No other column is required, and none is proposed.

Reasoning: `sale_id` already groups the rows of one transaction, and `item_id`
already carries the per-row linkage, so neither a transaction-header column nor
a line-number column adds anything the schema cannot already express. Deliberately
**not** proposed: `line_number`, `sale_total`, `sold_at`, `register_id`,
`idempotency_expires_at`. Each is derivable, or belongs to a problem nobody has
yet.

One consequence to accept knowingly: with one row per item, `sale_id` stops
being unique per row and becomes unique *per transaction*. It is unique across
all 148 historical rows today. Any report that assumed row-uniqueness must be
re-read as "unique per transaction".

---

## 4. Sale-id generation and concurrency

`EDP-YYYYMMDD-NNN` needs a per-day sequence, and allocating one safely needs
three things this build does not have:

1. **A read of the SALES tab.** The Register's adapter reads APPLIANCES only.
   The read itself *is* permitted by the current `spreadsheets.readonly` scope,
   so this is a code gap, not a permissions gap.
2. **A lock.** Two cashiers finishing in the same second would both read "the
   highest today is 004" and both write 005.
3. **Write access**, so the allocation can be claimed.

`allocateDailySequence_()` therefore **throws**. Returning a guess would be the
single most dangerous line in the build, because a duplicated `sale_id` silently
merges two real sales.

### Proposed allocator (for approval, not built)

Apps Script provides `LockService`, and **no EDP system currently uses it** — a
search of this repository found no `LockService`, `getScriptLock` or
`CacheService` call anywhere.

```
lock = LockService.getScriptLock()
lock.waitLock(20000)              // fail closed if not acquired
try {
  rows   = read SALES column A for today's EDP- ids
  next   = max(NNN for today) + 1          // 0 rows today -> 001
  if (next > 999) -> refuse, do not roll over
  saleId = EDP-<today>-<next>
  append the rows                           // claims the allocation
} finally { lock.releaseLock() }
```

The lock must be held across **read-then-append**, not just the read; holding it
only for the read reintroduces the race it exists to prevent.

`> 999 sales in one day` refuses rather than rolling over into a format nobody
approved. At EDP's volume (148 sales in five months) this is unreachable, but a
silent format change is worse than a refusal.

---

## 5. Idempotency design

`request_id` is minted by the browser **once per checkout attempt** and reused
for every retry of that attempt. It is abandoned, and a new one minted, whenever
the cart changes — a retry must mean the same goods, or an idempotent server
would happily return a sale for items the customer did not buy. That half is
already built and tested (Package 13).

Server side, the check belongs **inside the same lock** as the sequence
allocation:

```
inside lock:
  if (SALES already contains this request_id) -> return the EXISTING sale, ok:true
  ... allocate, append ...
```

Checking outside the lock reintroduces the double-write it exists to prevent.

**A repeat must return the original sale and report success**, not an error. The
commonest cause of a repeat is a response lost *after* a successful commit — the
sale happened, and the till must be told so.

---

## 6. Ordering, and what each step costs if it fails

Order matters more than any individual step:

| # | Step | Reversible? |
| --- | --- | --- |
| 1 | Validate the request | yes — nothing has happened |
| 2 | Validate customer and payment | yes |
| 3 | Validate every item is **still** sellable | yes |
| 4 | **Acquire lock** | yes |
| 5 | Detect duplicate `request_id` → return existing sale | yes |
| 6 | Allocate `sale_id` | yes |
| 7 | **Append all SALES rows in ONE `Values.append` call** | **NO** |
| 8 | Mark each `APPLIANCES.status = SOLD` | no, but repairable |
| 9 | Release lock, verify, build receipt, emit events | yes |

**The sale record is written before inventory moves.** A crash between 7 and 8
leaves a sale that can be reconciled against stock. The reverse order would
leave stock marked sold against no sale at all — money unaccounted for, which is
strictly worse than inventory being briefly stale.

### Partial-failure cases

| Case | Outcome under this design |
| --- | --- |
| **SALES appended, inventory update fails** | The sale stands. Items stay `AVAILABLE`. Detectable by querying SALES rows whose `item_id` is not `SOLD`. **Safe-ish: money is right, stock is stale.** |
| **One of several SALES rows succeeds** | **Cannot happen.** All rows go in a single `Values.append`; Sheets appends the block or nothing. This is the whole reason for one call rather than a loop. |
| **Inventory changes but SALES fails** | **Cannot happen** — inventory is step 8, after the append. |
| **Response lost after a successful commit** | The till retries with the same `request_id`, step 5 finds the existing sale and returns it with `ok:true`. No second sale. |
| **Same `request_id` submitted again** | Same as above. Idempotent by construction. |
| **Two cashiers sell the same appliance** | Step 3 re-validates sellability **inside** the lock. The second cashier is refused with `SALE_UNRESOLVED_LINE`. Without the lock, both would pass step 3 and both would sell it. |
| **Two transactions allocate simultaneously** | The lock serialises them: 001 then 002. |
| **Lock not acquired within 20s** | **Refuse the sale.** Never proceed unlocked. |

### Not solvable by ordering — stated plainly

If step 7 succeeds and the Apps Script execution is killed before step 8, there
is no transaction to roll back: Sheets has no multi-range atomic commit. The
design makes that case *detectable and repairable* rather than preventable. A
reconciliation query — SALES rows whose `item_id` is not `SOLD` in APPLIANCES —
is the backstop, and it is the same query NV-7 already needs.

---

## 7. Inventory SOLD mutation

`APPLIANCES.status` → `SOLD`. One cell per item.

- The value already exists on 16 rows; nothing is invented.
- **`stage` is NOT changed.** One existing SOLD row still reads `stage = REPAIR`.
- There is no `PAID` value in APPLIANCES, and no `sold_date`, `sold_price` or
  `sale_id` column. The appliance has no back-link to its sale; the only linkage
  is SALES → APPLIANCES via `item_id`.
- Requires a **write scope**, which this build does not have and which is a
  separate approval.

---

## 8. Store Credit — searched, and the finding is uncomfortable

**NOT FOUND as a structure. FOUND as an unstructured liability.**

No tab, and no column in any of the 38 tabs, holds a customer credit balance.
But store credit demonstrably exists in the business today, recorded as **free
text in at least four different places**:

- `PURCHASES.status` = `CREDIT OWED - UNREDEEMED`, and
  `SETTLED VIA $30 TRADE CREDIT - CUSTOMER LINK PENDING`
- `CUSTOMERS.notes` = `TRADE CREDIT OPEN: ...`
- `APPLIANCES.notes` **and** `APPLIANCES.stage` = `$30 appliance-purchase credit, still unredeemed`
- `TICKETS.notes` = `$30 trade credit toward customer's $265 ... purchase`, and a
  separate `$60 credit treatment` described as not verified

At least one real open liability is visible: a **$30 unredeemed trade credit**
for customer `EDP-3116`, recorded in four places and reconciled in none.

**Recommendation.** A real credit ledger is needed, and building it is its own
package — not a side effect of checkout. Until it exists, **STORE CREDIT must
not be selectable as a tender**, because a cashier would have nothing to check a
balance against, which is exactly the thing the owner forbade. Any migration
must also capture the existing open liabilities rather than starting from zero.

**Conflict to flag:** `VAPI_CALL_LOG` records the AI receptionist telling a
caller that EDP "only accept cash payments and do not offer financing or
credit." Trade-in credit is not customer financing, but the scripted line and
the practice disagree in a way customers can hear.

---

## 9. Payment & deposit plan — searched

**NO payment-plan structure exists.** No tab, no deposit field, no balance
field, no paid-to-date field, no pickup-due date.

Two existing things are adjacent and must not be duplicated:

**`CUSTOMER_HOLDS` — exists and is actively used** (rows from 2026-10-02 and
2026-10-03): `hold_id`, `item_id`, `customer_name`, `phone`, `hold_time`,
`expires_at`, `status`. `hold_id` is `HR-YYYYMMDD-NNNN`. This is the existing
"EDP holds the appliance" record. **It has no money fields at all**, and
`expires_at` is empty on every row, with `status` = `PENDING_REVIEW`. It is a
hold *request* intake, not a plan.

**Deposits are recorded today as SALES rows.** One row carries
`category = Deposit`, `entry_type = DEPOSIT_REFERENCE_NONREVENUE`, and an
`accounting_status` explaining it was later consolidated into the final sale and
must not be double counted.

### Recommended representation (for approval)

A **Payment & Pickup Plan is not a tender type** and must not be added to the
payment-method list. It is an agreement with a lifecycle:

- purchase total, deposit and subsequent payments, total paid, remaining balance
- pickup due date, storage-fee eligibility and status
- a link to the held appliance and to the eventual sale

The cleanest fit is a **new `PAYMENT_PLANS` tab plus a `PLAN_PAYMENTS` tab**
(one row per payment), with the plan referencing `CUSTOMER_HOLDS.hold_id` for
the hold it already creates, and emitting a normal SALES row **only when the
plan completes**. That keeps SALES meaning "revenue recognised" exactly as it
does today, and keeps deposits out of it.

**Split tender** (`$50 Store Credit + $250 Cash`) cannot be represented in SALES
as it stands: `payment_type` is a single free-text value. Making split tender
possible needs either a `SALE_PAYMENTS` child tab or an agreed encoding. **Not
proposed here** — it needs a decision, and inventing one would be exactly the
guess this project refuses.

---

## 10. Storage rules — recorded

| | Payment & Pickup Plan | Repair |
| --- | --- | --- |
| Allowance | 14 calendar days, then **6 EDP open days** | **3 open days** from ready-for-pickup |
| Sunday | Does not count (EDP closed) | Does not count |
| Then | **$9.00 per day** | **$9.00 per day** |

Kept as two separate rule sets, deliberately — they differ in both shape and
trigger, and merging them would make a change to one silently change the other.

**Corroboration:** the repair rule is already live in the business. A
`VAPI_CALL_LOG` summary records the AI receptionist telling a caller about "a $9
per day storage fee if not picked up within three days of notification." The
constants recorded here agree with what customers are already being told.

**Holidays: NEEDS VERIFICATION (NV-27).** No holiday or business-calendar
structure exists anywhere in the 38 tabs. Nothing has been assumed.

---

## 11. Receipt and Text Receipt architecture

The Package 11 receipt model (`buildReceiptModel()`) is already the single source
for every channel, and it stays so. Text Receipt becomes one more consumer.

**Provider-neutral boundary.** Checkout must never name a provider. The proposed
seam mirrors the existing `DataSource` seam that made the inventory cutover a
one-line change:

```
ReceiptDelivery = {
  id, deliver(receiptModel, destination) -> { ok, providerMessageId, error }
}
ACTIVE_RECEIPT_DELIVERY = NONE        // nothing is sent
```

Google Voice is explicitly **not** wired in. No SMS is sent by this package, and
none can be: there is no messaging code and no `UrlFetchApp` anywhere.

**Consent is not optional, and the structure already exists.** `SMS_CONSENT_LOG`
has `cust_id`, `mobile_number`, `event_type`, `consent_status_after_event`,
`consent_scope`, `disclosure_version`, and an `environment` column separating
TEST from LIVE. **A Text Receipt must check this log before sending anything.**
Do not build a competing consent concept.

---

## 12. Needs Verification

| Id | Item |
| --- | --- |
| NV-14 | Warranty taxability — still **OPEN**, unchanged |
| NV-23 | `payment_type` vocabulary. Approved: `Cash`, `Store Credit` (blocked), `Payment & Pickup Plan` (not a tender). Card, Financing, Check are **not approved** and must be removed from the UI or disabled |
| NV-24 | The three status columns stay empty for Register sales |
| NV-25 | `entered_by` — what a Register sale records |
| NV-26 | **Split tender has no representation in SALES** |
| NV-27 | **Holiday handling for both storage rules** — no calendar exists |
| NV-28 | **Store credit is an unreconciled liability in free text**, at least $30 open for `EDP-3116` |
| NV-29 | The AI receptionist tells callers EDP does not offer credit, while trade-in credit is being issued |
| NV-7 | 14 orphan SALES rows — now the backstop query for partial failure |
