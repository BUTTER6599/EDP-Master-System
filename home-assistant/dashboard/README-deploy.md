# Deploying the Command Center dashboard

Order matters: **back up → sensors → restart → dashboard**. The dashboard
references sensors that must exist first, or every card renders "unknown"
and looks broken when it is merely early.

## 0. Back up first (2 min) — do not skip

Pasting into the raw configuration editor **replaces the entire
dashboard**. There is no undo.

1. Open **EDP Command Center** → pencil (top right) → ⋮ → **Raw
   configuration editor**.
2. Select all, copy, and paste into a file you keep:
   `edp-command-center-BACKUP-2026-09-20.yaml`.
3. Close without saving.

If the dashboard is new and empty, note that instead — then rollback is
"delete the dashboard and recreate it".

## 1. Install the sensors (5 min)

Copy into your Home Assistant config directory:

```
/config/edp/rest_sensors.yaml
/config/edp/template_sensors.yaml
```

Add the two secrets blocks to `/config/secrets.yaml` using
`config/secrets.yaml.example` as the template — the deployed web app URL
and both tokens.

In `configuration.yaml`:

```yaml
rest: !include edp/rest_sensors.yaml
template: !include edp/template_sensors.yaml
```

If you already have a top-level `rest:` or `template:` key, you cannot
have it twice. Either merge the lists by hand, or switch to
`!include_dir_merge_list`.

**Recommended** — keep the row attributes out of the recorder database.
They are re-fetched every 5 minutes and have no history value, and left
alone they will bloat `home-assistant_v2.db`:

```yaml
recorder:
  exclude:
    entity_globs:
      - sensor.edp_*
    entities:
      - sensor.edp_bridge_health
```

## 2. Check the config and restart (3 min)

**Developer Tools → YAML → Check configuration.** Fix anything it reports,
then **Restart Home Assistant**. A template reload alone is not enough —
`rest:` is only read at startup.

## 3. Verify the sensors before touching the dashboard (3 min)

**Developer Tools → States**, filter `edp`. You should see 15 entities.
Check in this order:

1. `sensor.edp_bridge_health` — must be `ok`. If it is `degraded`, open
   its attributes and read `missing_tabs`, then fix the tab names in
   `Code.gs` (see `bridge/README-deploy.md` step 4).
2. `sensor.edp_tasks_open` — must be `6`, matching `TASKS_TEST`.
3. `sensor.edp_doors_open` — expand attributes; `names` should list the
   doors actually open right now. Open a door and confirm the count moves.

If `sensor.edp_bridge_health` is `unknown` or `unavailable`, the dashboard
will not help you — debug the bridge URL and tokens first.

## 4. Paste the dashboard (2 min)

Raw configuration editor → select all → paste
`edp-command-center-TEST.yaml` → **Save**.

The navigation paths assume the dashboard's URL path is
`edp-command-center`. If yours differs, update the six
`navigation_path: /edp-command-center/...` values to match, or the tiles
will 404.

## 5. Open Diagnostics first (2 min)

Tap **Diagnostics** in the navigation grid. That view prints the things
this build could not determine:

- the real `entity_id` of the Shopping List todo entity
- how many `lock`, `camera`, `alarm_control_panel` and `person` entities
  actually exist
- the live bridge health table

If the todo entity is **not** `todo.shopping_list`, correct the
`entity: todo.shopping_list` line in the Shopping & Restocking section
and re-save. This is the one hardcoded entity_id in the whole dashboard.

## 6. Fill in the deep links (2 min)

Six navigation buttons carry `REPLACE_WITH_..._URL` placeholders
(Register, Kiosk, Inventory, Repairs). Replace them with the real EDP app
URLs. They are inert until you do — a button that goes nowhere is
preferable to one that goes somewhere wrong.

## Rollback

**Dashboard:** raw configuration editor → select all → paste your backup →
Save. Immediate, no restart.

**Sensors:** comment out the two `!include` lines in `configuration.yaml`
and restart. The dashboard then renders with every card in its BLOCKED
state, which is by design — no card throws when its sensor is missing.

**Bridge:** roll back the Apps Script deployment (see
`bridge/README-deploy.md`). Nothing in the Sheet is ever modified, so
there is no data rollback to perform.

## Requirements

Already installed per the Implementation Tracker:

- **auto-entities** (HACS) — the Security view's door/window/motion/lock/
  camera/battery cards. These filter by domain and device class rather
  than entity_id, which is why they work without the registry access this
  build did not have.
- **card-mod** (HACS) — the graphite/neon styling.

Not used yet, on purpose: Bubble Card and ApexCharts. Fewer moving parts
while validating in TEST. Add them once the data is trusted.
