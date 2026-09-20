# EDP Command Center — Data Contract

Version 1 · 2026-09-20 · status **TEST**

The contract between `EDP_MASTER_DATABASE` (authoritative) and Home
Assistant (display only). Home Assistant never writes to the Sheet, never
computes a balance, and never stores a business record. Every number on a
card is a rendering of a row that already exists in the Sheet.

## Where the columns came from

Column names below were read from a live Drive export of
`EDP_MASTER_DATABASE` (ID `117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI`)
on 2026-09-20. They are real.

**Core tab names are now runtime-verified.** On 2026-09-20 the deployed
TEST bridge authenticated successfully against `EDP_MASTER_DATABASE` and
reported `missing_tabs: []`. The confirmed mappings include
`TASKS_TEST`, `BILLS`, `SCHEDULE`, `KIOSK_MESSAGES`, `PURCHASES`,
`PARTS`, `SALES`, `APPLIANCES`, `REPAIR_TICKETS`, and `PAYROLL`.
Keep `?list=1` as a deployment/recovery verification check so later sheet
renames fail visibly rather than silently.

## Transport

```
GET <web app url>?tab=<TAB>&key=<token>
GET <web app url>?health=1&key=<token>
GET <web app url>?list=1&key=<private token>      # private only
```

Response:

```json
{
  "ok": true,
  "tab": "TASKS",
  "sheet": "TASKS_TEST",
  "status": "TEST",
  "scope": "private",
  "generated_at": "2026-09-20T03:30:00-05:00",
  "count": 6,
  "truncated": false,
  "rows": [ { "task_id": "...", "title": "..." } ]
}
```

- `count` is the number of rows **after** filtering, before the 25-row cap.
  It becomes the Home Assistant sensor's state. Row data travels in
  attributes, because a Home Assistant state is capped at 255 characters.
- `truncated` is true when more than 25 rows matched. A card that shows a
  truncated list must say so.
- `generated_at` is the freshness clock. `sensor.edp_bridge_age` and
  `binary_sensor.edp_bridge_stale` derive from it. A REST sensor that stops
  polling keeps its last state forever, so a number that *looks* fine is
  not evidence it is current — always read the staleness flag alongside.
- `ok: false` never throws a 500. A failure degrades one card and leaves
  the other sensors alone.

## Scopes

Two tokens. **The token presented decides the scope** — a caller holding
only the public token cannot request private data by asking for it.

| Scope | Token | Intended for |
|---|---|---|
| `public` | `BRIDGE_TOKEN` | kiosk, shop-floor or any shared screen |
| `private` | `BRIDGE_TOKEN_PRIVATE` | Taylor's phone, iPad, office display |

Fields are allowlisted per tab. **A column not listed in `fields` is never
returned at any scope**, so adding a column to a tab cannot silently
publish it. Verified by test: `test/bridge_test.mjs`.

## Tabs

### TASKS → `TASKS_TEST` · status TEST

Real columns: `task_id, list, title, category, status, priority, owner,
due_date, recurrence, source_type, source_id, amount, location, notes,
created_at, updated_at, completed_at, completed_by, next_action, active`

| Field | Scope | Notes |
|---|---|---|
| `task_id` | public | required; also the blank-row filter |
| `title` | public | |
| `category` | public | `shopping`, `restocking`, … |
| `status` | public | |
| `priority` | public | `high`/`urgent`/`1` sort first |
| `due_date` | public | |
| `list` | public | |
| `next_action` | public | |
| `owner` | private | staff name |
| `amount` | private | money |
| `location` | private | |
| `notes` | private | |

Filter: `task_id` present **and** `active` ≠ `FALSE` **and** `status` not
`done`/`completed`. The tab pads roughly 900 blank rows below the data with
`active = FALSE`; without the `task_id` test the card would report ~900
open tasks.

**This tab is TEST data.** Six real business tasks were entered 2026-09-19.
Do not promote to LIVE until the rows on screen are checked against the
Sheet.

### BILLS → `BILLS` · status TEST

Real columns: `bill_id, timestamp, due_date, week_id, bill_name,
amount_due, fund_balance, status, priority, notes, updated_by`

| Field | Scope | Notes |
|---|---|---|
| `bill_id` | **private** | provider-identifying IDs stay owner-only |
| `due_date` | **private** | financial timing stays owner-only |
| `status` | **private** | past-due/suspension language stays owner-only |
| `priority` | **private** | bill urgency stays owner-only |
| `bill_name` | **private** | see below |
| `amount_due` | **private** | |
| `fund_balance` | private | |
| `notes`, `updated_by` | private | |

`BILLS` is owner-private by design. Testing on 2026-09-20 proved that
provider-identifying bill IDs and detailed financial status can reveal
sensitive business or health-related information even when dollar amounts
are hidden. The public/shop projection therefore exposes no detailed bill
fields. Shared screens may show only a separately designed generic summary
such as a count/attention flag after that aggregate is implemented and
privacy-tested.

### SCHEDULE → `SCHEDULE` · status TEST

Real columns: `EmployeeID, Name, DayOfWeek, ClockInTime, ClockOutTime,
Active`

| Field | Scope |
|---|---|
| `DayOfWeek`, `Active` | public |
| `EmployeeID`, `Name`, `ClockInTime`, `ClockOutTime` | private |

Filter: `Active` ≠ `FALSE`. `DayOfWeek` is `MON`…`SUN`; the card matches
against `now().strftime('%a') | upper`.

Clock times are stored as time-only cells and come back over JSON as
`1899-12-30` date objects. The bridge uses `getDisplayValues()` throughout,
which returns `8:00:00 AM` — what the Sheet actually shows. Do not switch
to `getValues()`.

### KIOSK → `KIOSK_MESSAGES` · status TEST

Real columns: `Timestamp, EmployeeID, Name, Direction, Message, Read`

| Field | Scope |
|---|---|
| `Timestamp`, `Direction`, `Read` | public |
| `EmployeeID`, `Name`, `Message` | private |

Filter: `Read` ≠ `TRUE`. Message bodies are staff-to-owner and never
public.

### PARTS → `PARTS` · status TEST

Real columns: `part_id, name, category, brand, model, cost, price,
quantity, notes, photo_links, condition`

| Field | Scope |
|---|---|
| `part_id`, `name`, `category`, `quantity`, `brand`, `condition` | public |
| `cost`, `price`, `notes` | private |

Filter: `quantity` ≤ 2 — this is the restock view, not the catalogue.

### PURCHASES → `PURCHASES` · status TEST

Real columns: `purchase_id, timestamp, purchase_date, week_id, vendor,
item, category, cost, status, notes`. `vendor`, `item`, `cost`, `notes`
private.

### SALES → `SALES` · status TEST

Real columns: `sale_id, timestamp, sale_date, week_id, amount, category,
payment_type, notes, entered_by, invoice_number, item_id, …`. Only
`sale_id`, `sale_date`, `category` are public — a public screen gets a
count, never the money.

### INVENTORY / REPAIRS / PAYROLL

- **INVENTORY → `APPLIANCES` · status TEST.** Runtime mapping is verified.
  Public fields are limited to non-sensitive operating fields; model,
  serial, list price, and cost basis are private.
- **REPAIRS → `REPAIR_TICKETS` · status TEST.** Runtime mapping is verified.
  Customer name, phones, email, and photo-folder IDs are not declared at
  either scope and therefore never leave the Sheet.
- **PAYROLL → `PAYROLL` · status BLOCKED.** Every field is private; there
  is no public projection. At public scope the bridge returns zero rows so
  a public caller cannot infer payroll row counts.

## What is deliberately absent

- **No writes.** No `rest_command`, no `doPost`. Adding write-back is a
  separate, separately-reviewed change.
- **No customer PII.** The Sheet holds customer names, phones, emails and
  addresses in other tabs. None are in `TABS`, so the bridge cannot serve
  them.
- **No derived money.** No totals, averages or balances are computed here
  or in Home Assistant. If a figure is not a cell in the Sheet, it does
  not appear on a card.


## Portable dashboard mirror / recovery contract

**Approved architecture direction — 2026-09-20.**

Home Assistant is the preferred day-to-day EDP command-center surface, but
it must not become the only description of how the business dashboard
works. The existing Apps Script / EDP OS dashboard remains the recovery and
fallback path.

Rules:

1. **One data contract, two possible renderers.** Home Assistant and the
   Apps Script dashboard must read the same authoritative EDP sources and
   the same privacy/status rules. Neither renderer becomes a competing
   database.
2. **Home Assistant is the primary interaction layer.** It may provide
   cards, subviews, graphs, alerts, quick actions, and deep links.
3. **Apps Script is the fallback/rebuild surface.** It does not need every
   Home Assistant visual copied immediately, but every approved dashboard
   capability must remain reproducible there from this repository and the
   Drive architecture records.
4. **Record the view model, not screenshots alone.** For each dashboard
   area preserve: source tab/API, fields, privacy scope, calculations,
   LIVE/TEST/BLOCKED state, card purpose, drill-down behavior, deep link,
   refresh/freshness rule, and failure behavior.
5. **Mirror-impact check before promotion.** Any future Home Assistant
   dashboard change that alters business meaning, privacy, calculations,
   navigation, or workflow must update this contract (and the permanent
   Drive architecture/tracker) before LIVE approval.
6. **Recovery goal.** If Home Assistant is unavailable, EDP should still be
   able to operate from the authoritative Apps Script/EDP apps, and the
   owner dashboard can be rebuilt without rediscovering business rules.

The current Apps Script fallback dashboard is **not being rebuilt in this
TEST step**. This section preserves the specification so a future rebuild
or synchronized enhancement is controlled rather than recreated from
memory.
