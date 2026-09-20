# Verification Checklist

Nothing in this build is LIVE. A section is promoted only when its checks
below pass **on the real system**, with the result written in the Result
column. An unrun check is a failed check.

Status rules: **LIVE** = connected and tested · **TEST** = connected, not
yet validated · **BLOCKED** = needs access, credentials, hardware, source
data or a user action.

---

## A. Normal operation

| # | Check | Pass condition | Result |
|---|---|---|---|
| A1 | `?health=1` in a browser | `"ok": true`, `missing_tabs` empty | |
| A2 | `sensor.edp_bridge_health` | state `ok` | |
| A3 | `sensor.edp_tasks_open` | equals **6**, matching `TASKS_TEST` | |
| A4 | Open each of the 6 tasks on the Tasks subview | titles match the Sheet row for row | |
| A5 | `sensor.edp_bills_open` | equals the open-bill count in `BILLS` | |
| A6 | Bills subview | BCBS and Rent show correct amounts and due dates | |
| A7 | Schedule card on a weekday | names match `SCHEDULE` for today's `DayOfWeek` | |
| A8 | Clock times on the Schedule card | read `8:00:00 AM`, **not** `12/30/1899` | |
| A9 | Shopping List card | renders; adding an item in HA shows immediately | |
| A10 | Every subview loads | no red "Custom element doesn't exist" | |
| A11 | All 4 priority tiles navigate | each lands on the right subview | |
| A12 | Phone-width rendering | no horizontal scroll, tiles legible | |

**A3 is the gate for calling TASKS "TEST validated".** If it reads ~900,
the blank-row filter is not working and the tab name or `task_id` column
has changed.

## B. Privacy (run before any shared screen shows this)

| # | Check | Pass condition | Result |
|---|---|---|---|
| B1 | `?tab=BILLS&key=<PUBLIC>` | response contains **no** dollar amounts | |
| B2 | same | contains **no** bill names — no "Blue Cross" | |
| B3 | `?tab=PAYROLL&key=<PUBLIC>` | `"count": 0`, `rows` empty | |
| B4 | `?tab=TASKS&key=<PUBLIC>` | no `owner`, no `notes` | |
| B5 | `?list=1&key=<PUBLIC>` | refused — "requires the private token" | |
| B6 | `?tab=TASKS` with no key | `Unauthorized` | |
| B7 | `node bridge/test/bridge_test.mjs` | 22/22 pass | |

B1–B3 are the controls that keep health, financial and payroll data off a
shop-floor display. If any fails, do not mirror this dashboard anywhere
shared until it is fixed.

## C. Unavailable entities

| # | Check | Pass condition | Result |
|---|---|---|---|
| C1 | `sensor.edp_sensors_unavailable` | matches the Security subview's Unavailable card count | |
| C2 | Security subview → Locks card | shows BLOCKED/empty, does not error | |
| C3 | Security subview → Alarm card | shows BLOCKED/empty, does not error | |
| C4 | Frigate card on main view | reads BLOCKED with the reason, does not error | |
| C5 | Pull the battery from one contact sensor, wait 5 min | that sensor appears in the Unavailable card; count rises by 1 | |
| C6 | Replace the battery | sensor leaves the Unavailable list | |

C5/C6 are the real test — they prove a dead sensor becomes *visible* rather
than silently reading "closed" forever. A door sensor that has failed is
indistinguishable from a closed door unless this works.

## D. Stale data

| # | Check | Pass condition | Result |
|---|---|---|---|
| D1 | `sensor.edp_bridge_age` | under 5 during normal operation | |
| D2 | `binary_sensor.edp_bridge_stale` | `off` | |
| D3 | In Apps Script, **Manage deployments → Archive** the deployment | within ~20 min: `edp_bridge_stale` → `on` | |
| D4 | Main view header while stale | shows red "SHEET DATA STALE" with the age | |
| D5 | Task/Bills cards while stale | still show last-known rows, with the header warning above | |
| D6 | Re-deploy | stale clears within one poll (≤5 min) | |

D3–D4 are the most important checks in this document. A REST sensor holds
its last value forever when the endpoint dies. Without the staleness flag,
a dashboard showing "0 bills due" could mean "nothing due" or "the bridge
died three weeks ago", and those look identical.

## E. Notification failure

**Status: BLOCKED — not built.** No automation, alert or notify action
exists in this build. The Security section is read-only by design, and
nothing here sends a message.

Before any notification is added, these must be answerable:

| # | Check | Pass condition | Result |
|---|---|---|---|
| E1 | Which `notify.*` services exist? (Dev Tools → Actions) | at least one confirmed | |
| E2 | Send a test to that service | arrives on Taylor's phone | |
| E3 | Turn the phone off, send again | failure is visible somewhere, not silent | |
| E4 | Back-door-open rule (>5s, per the build plan) fires | notification arrives once, not in a loop | |
| E5 | Closing-check routine (from ~4:45 PM, every 5 min) | stops on confirmed closed | |

E3 is the one people skip. A notification that fails silently is worse
than no notification, because the closing check would be trusted.

## F. Rollback

| # | Check | Pass condition | Result |
|---|---|---|---|
| F1 | Dashboard backup file exists from before the paste | file saved and openable | |
| F2 | Paste the backup into the raw editor | previous dashboard returns, no restart | |
| F3 | Comment out both `!include` lines, restart | dashboard loads, all cards BLOCKED, nothing errors | |
| F4 | Apps Script → Manage deployments → previous version | HA recovers within one poll | |
| F5 | After every rollback: the Sheet | unchanged — the bridge never writes | |

F3 is a design check: losing the sensors must degrade the dashboard, not
break it.

---

## Promotion record

Fill in as each section earns it. A date without a checklist result behind
it is not a promotion.

| Section | Status | Evidence | Date |
|---|---|---|---|
| Tasks | TEST | | |
| Bills | TEST | | |
| Schedule / team | TEST | | |
| Shopping list | TEST | | |
| Kiosk messages | TEST | | |
| Restocking | TEST | | |
| Doors / windows / motion | TEST | | |
| Locks | BLOCKED | `lock` domain empty 2026-09-20 | |
| Alarm panel | BLOCKED | `alarm_control_panel` empty 2026-09-20 | |
| Cameras / Frigate | BLOCKED | `camera` empty; sensors down since 2026-05-18 | |
| Phone battery | BLOCKED | no battery sensors returned | |
| Presence | BLOCKED | no `person` entities returned | |
| Sales / spending | BLOCKED | weekly rollup tab empty in the Sheet | |
| Inventory | BLOCKED | tab name unconfirmed | |
| Repairs | BLOCKED | ticket tab name unconfirmed | |
| Notifications | BLOCKED | not built | |
