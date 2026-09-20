# Home Assistant entity inventory — 2026-09-20

Captured by direct live query against Home Assistant, not from
documentation. **Source: the Assist-level API**, which returns friendly
names, domains, states and device classes — but **no entity_ids, no
integration/config_entry, and only entities exposed to Assist.**

That last point matters for reading this document: a domain reading zero
here means *nothing is exposed to Assist in that domain*. It does not by
itself prove the entities do not exist. The Lovelace frontend sees the
full registry, which is why the dashboard's hardware cards are built as
filters rather than hardcoded entity lists — they will populate on their
own if the entities are there.

## Domain counts

| Domain | Count | Status | Note |
|---|---|---|---|
| `binary_sensor` | **39** | TEST | full list below |
| `todo` | **1** | TEST | "Shopping List", 0 items |
| `camera` | **0** | BLOCKED | unchanged since 2026-09-02 |
| `lock` | **0** | BLOCKED | unchanged since 2026-09-02 |
| `alarm_control_panel` | **0** | BLOCKED | unchanged since 2026-09-02 |
| `sensor` | **0** | BLOCKED | no battery, no diagnostics |
| `person` | **0** | BLOCKED | no presence |
| `device_tracker` | **0** | BLOCKED | no presence |

The `sensor`, `person` and `device_tracker` results are new since the
2026-09-02 brief, which did not query them. They are why "phone battery
and presence" is BLOCKED rather than TEST.

## Item 4 of the addendum — Ring inventory

The addendum asked for every entity whose integration is actually Ring,
regardless of friendly name. **That question cannot be answered from this
layer** — integration membership is registry data. What follows is a
naming-pattern analysis, which is evidence, not confirmation.

Ring Alarm registers devices as `<type> <last-5-of-serial>`. Eleven of the
39 binary sensors carry that signature:

| Name | Class | Basis |
|---|---|---|
| Ring Contact Sensor 00279 | door | name says Ring |
| Ring Keypad 45101 Motion | motion | name says Ring |
| BACK ROOM  Motion Detector 04674 | motion | serial pattern |
| Home Office Door  24507 | door | serial pattern |
| Keypad 45101 Motion | motion | serial pattern |
| Motion Detector 05118 | motion | serial pattern |
| Refrigerator Top Contact Sensor 33572 | door | serial pattern |
| Snacks Bin Contact Sensor 27246 | window | serial pattern |
| Upstairs Bathroom Motion Detector 05118 | motion | serial pattern |
| kitchen window Sensor 26970 | window | serial pattern |
| refrigerator  Contact Sensor 17688 | window | serial pattern |

### Two probable duplicate pairs

Worth acting on — the original brief mentions stale suffixed entities:

- Serial **45101** → `Keypad 45101 Motion` **and** `Ring Keypad 45101 Motion`
- Serial **05118** → `Motion Detector 05118` **and** `Upstairs Bathroom Motion Detector 05118`

If each pair is one physical device, the real figure is **11 entities
across 9 devices**. Confirm in Settings → Devices & Services → Ring, and
delete the stale entity of each pair.

**Conclusion on item 4:** the assumed count of two was wrong — at least 11
entities are plausibly Ring. But the exact set still requires the registry.
See Session 8 in `TAYLOR-ACTIONS.md`.

## The other 28 sensors

Plain friendly names, no serial, brand undeterminable from this layer:

BACK DOOR · Back Window · Back of Showroom Motion · DRINK FRIDGE ·
Front Door · Front Window · Front of Store 2 Motion ·
HALL WAY ENTRANCE DOOR 🚪 · Laurel St Motion · MAIN OFFICE DOOR ·
Outside Back Gate Motion · Outside Back Motion · Outside Front West Motion ·
Pantry Door · Parts Cabinet 1 And Two · SHOOW ROOM BACK DOOR ·
Showroom Motion · Tool Room · Up Stairs hall · WORK BATH ROOM ·
YVONNES OFFICE DOOR 🚪 · garage door 🚪 · kitchen motion ·
main bedroom door · money 💰 · showroom door · stoor back door 🚪 ·
upstairs bath room door

Device-class split across all 39: **18 door · 7 window · 14 motion**.

Several are mis-classed — `HALL WAY ENTRANCE DOOR 🚪` and
`Parts Cabinet 1 And Two` both report `device_class: window`. That affects
the dashboard's rollups, since doors and windows are counted by device
class. Worth correcting in the entity settings.

## Not reachable from this session

Verified, not assumed:

| Path | Result |
|---|---|
| `ssh` binary | not installed |
| `tailscale` binary | not installed |
| `mosquitto_sub` | not installed |
| `100.114.19.113` (Frigate host) | unroutable — `100.64.0.0/10` is in the proxy's no-route list |
| `192.168.12.201` (camera), `192.168.12.211` (Zigbee) | unroutable — `192.168.0.0/16` likewise |
| HA entity registry / websocket API | no credential available in this environment |

So items 1, 2 and 3 of the original brief, and the registry half of item
4, are BLOCKED for any session configured like this one — not merely
unfinished. They need Taylor at a desktop, or a session with SSH and an
HA long-lived token.
