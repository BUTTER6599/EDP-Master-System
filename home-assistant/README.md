# EDP Home Assistant Command Center

Status: **TEST** · built 2026-09-20 · nothing here is LIVE.

Home Assistant is the command center and interaction layer. Google
Sheets, Apps Script, n8n, Register, Kiosk and Inventory remain
authoritative. Nothing in this directory writes to any of them, and no
data is duplicated into Home Assistant — every card renders a row that
already exists in the Sheet.

> This lives in the `EDP-Master-System` repository because it is the only
> repository available to the session that built it. It is not part of the
> AI receptionist app in `src/` and shares no code with it. Move it to its
> own repo when one exists.

## Layout

```
home-assistant/
├── dashboard/
│   ├── edp-command-center-TEST.yaml   the dashboard (paste target)
│   └── README-deploy.md               back up → sensors → restart → paste
├── bridge/
│   ├── Code.gs                        Apps Script read-only JSON web app
│   ├── appsscript.json                manifest
│   ├── .clasp.json.example
│   ├── README-deploy.md               15-min browser deploy
│   └── test/bridge_test.mjs           22 checks, no network needed
├── config/
│   ├── rest_sensors.yaml              10 REST sensors
│   ├── template_sensors.yaml          9 derived sensors
│   └── secrets.yaml.example
└── docs/
    ├── DATA-CONTRACT.md               Sheet ↔ HA contract, real columns
    ├── VERIFICATION-CHECKLIST.md      what must pass before LIVE
    ├── TAYLOR-ACTIONS.md              desktop work, in timed sessions
    └── HA-ENTITY-INVENTORY-2026-09-20.md   live query results
```

## Start here

`docs/TAYLOR-ACTIONS.md`. Deploy the TEST bridge first, then verify the
mapped tabs. Before pasting the dashboard, use its Diagnostics view process
to confirm the exact Shopping List entity_id; this consolidated branch does
not guess `todo.shopping_list`.

## Status legend

**LIVE** connected and tested · **TEST** connected, not yet validated ·
**BLOCKED** needs access, credentials, hardware, source data or a user
action.

| Section | Status | Why |
|---|---|---|
| Tasks, Bills, Schedule, Kiosk, Restocking | TEST | deployed runtime/privacy checks passed; Home Assistant-side validation still pending |
| Shopping list | TEST | the one confirmed live entity — `todo`, 1 entity, 0 items |
| Doors / windows / motion | TEST | 39 binary sensors read live; no alerting wired |
| Locks | BLOCKED | `lock` domain empty on 2026-09-02 and 2026-09-20 |
| Alarm panel | BLOCKED | no `alarm_control_panel` entity |
| Cameras / Frigate | BLOCKED | `camera` domain empty; detection sensors down since 2026-05-18 |
| Phone battery / presence | BLOCKED | no `sensor`, `person` or `device_tracker` entities returned |
| Sales / spending | BLOCKED | raw feeds are connected, but an approved current-period money rollup is still missing |
| Inventory / Repairs | TEST | active-inventory/open-repair REST sensors are built; HA-side validation pending |
| Notifications | BLOCKED | not built; no automation or notify action exists here |

## Two things worth knowing before reading the code

**Hardware cards are filters, not entity lists.** This was built with
Assist-level API access, which returns no entity_ids and reported zero
camera, lock, alarm and sensor entities. The Lovelace frontend does not
share that limit — it runs as Taylor and sees the whole registry. So every
hardware card uses `auto-entities` filters and `states.*` iteration
instead of hardcoded ids. If those entities exist, the cards populate on
first load with no edit; if they do not, each card says so in place.
Nothing claims a device is connected.

**Freshness is a first-class signal.** A REST sensor keeps its last value
forever when its endpoint dies, so "0 bills due" and "the bridge died
three weeks ago" look identical. `binary_sensor.edp_bridge_stale` and the
red banner in the header exist to tell those apart. Check D3–D4 in the
verification checklist proves it works.

## Security posture

- Read-only end to end. No `doPost`, no `rest_command`, no write path.
- Two tokens, two scopes. The token presented decides the scope; a public
  caller cannot request private data. Fields are allowlisted per tab, so a
  new column in the Sheet cannot silently publish itself.
- Detailed BILLS data is private, including bill IDs, due dates, statuses,
  names, amounts, notes, and updater names. Shared/shop views must use only
  a separately approved generic aggregate.
- Payroll has no public projection at all.
- No customer PII tab is served.
- No automatic lock, unlock, arm or disarm exists, and no card calls a
  lock or alarm service.

## Running the tests

```bash
node home-assistant/bridge/test/bridge_test.mjs
```

Runs the real `Code.gs` against fixture rows copied from the live Sheet.
The suite now checks auth, filtering, and privacy across tasks, bills,
schedule, kiosk, parts, purchases, sales, inventory, repairs and payroll.
Run it after any edit to `TABS`.


## Dashboard continuity / Apps Script fallback

Home Assistant is the preferred operating dashboard, but it is not a
single point of business failure. EDP's existing Apps Script/EDP OS apps
remain authoritative and usable independently.

The portable rebuild specification lives in
`docs/DATA-CONTRACT.md`. Every material Home Assistant dashboard change
must preserve enough source mapping, privacy rules, status logic,
navigation, refresh behavior, and failure behavior to reproduce the same
business meaning in the Apps Script owner dashboard later.

The Apps Script fallback is **planned architecture**, not part of the
current TEST deployment. Do not create a duplicate business database or
silently build a second set of business rules.


## Cloud automation authentication checkpoint — 2026-09-20

The one-time Google/clasp authorization was completed in a GitHub Codespace under the EDP account. GitHub Actions TEST deployment secrets/variable were configured. This commit intentionally triggers the TEST workflow so automated validation and redeployment can be verified. LIVE remains blocked pending separate approval.
