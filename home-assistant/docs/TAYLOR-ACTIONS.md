# Desktop actions for Taylor

Everything here needs a desktop browser, the Home Assistant config
directory, or physical access — none of it could be done from the session
that wrote this code.

Sessions are ordered by dependency. **Sessions 1–5 get a working TEST
dashboard on screen** in about 35 minutes total. Sessions 6+ unblock the
hardware and can happen another day.

Stop after any session. Nothing is left half-applied between them.

---

## Session 1 — Deploy the bridge · 10 min

Full detail: `bridge/README-deploy.md`.

1. Open the Sheet → **Extensions → Apps Script**.
2. Paste `bridge/Code.gs` over the stub. Show the manifest in Project
   Settings and paste `bridge/appsscript.json`.
3. **Project Settings → Script Properties**, add two properties with two
   different random strings: `BRIDGE_TOKEN`, `BRIDGE_TOKEN_PRIVATE`.
4. **Deploy → New deployment → Web app** · Execute as **Me** · Access
   **Anyone** · Deploy · authorise.
5. Copy the `/exec` URL somewhere safe.

**Done when:** you have the URL and both tokens.

---

## Session 2 — Verify the mapped tabs · 5 min

The core source names were verified directly from EDP_MASTER_DATABASE before
this consolidated TEST branch was created: Inventory = `APPLIANCES`,
Repairs = `REPAIR_TICKETS`, plus the already verified TASKS_TEST, BILLS,
SCHEDULE, KIOSK_MESSAGES, PURCHASES, PARTS, SALES and PAYROLL mappings.

1. In a browser: `<web app url>?list=1&key=<BRIDGE_TOKEN_PRIVATE>`
2. Find the `configured` block. Every entry should read `"found": true`.
3. If any entry is `false`, stop there and report it before editing anything.

**Done when:** every configured tab reads `"found": true`.

This is now a verification step, not a discovery step.

---

## Session 3 — Privacy spot-check · 5 min

Do this before the dashboard goes on any screen other than your own.

1. `<web app url>?tab=BILLS&key=<BRIDGE_TOKEN>` (the **public** token)
2. Confirm: no dollar amounts, and no bill names — specifically no
   "Blue Cross".
3. `<web app url>?tab=PAYROLL&key=<BRIDGE_TOKEN>` → must be `"count": 0`.

**Done when:** both confirmed. If either leaks, stop and re-paste
`Code.gs` whole.

---

## Session 4 — Install the sensors · 10 min

Full detail: `dashboard/README-deploy.md` steps 1–3.

1. Copy `config/rest_sensors.yaml` and `config/template_sensors.yaml` to
   `/config/edp/`.
2. Append the three secrets from `config/secrets.yaml.example` to
   `/config/secrets.yaml`, filling in the URL and both tokens.
3. Add to `configuration.yaml`:
   ```yaml
   rest: !include edp/rest_sensors.yaml
   template: !include edp/template_sensors.yaml
   ```
   plus the `recorder: exclude:` block from the deploy guide.
4. **Developer Tools → YAML → Check configuration**, then **Restart**.
5. **Developer Tools → States**, filter `edp` — expect 15 entities.
   `sensor.edp_bridge_health` must read `ok` and `sensor.edp_tasks_open`
   must read `6`.

**Done when:** both of those read correctly. If not, fix here — the
dashboard will not diagnose it for you.

---

## Session 5 — Paste the dashboard · 10 min

1. **Back up first.** EDP Command Center → pencil → ⋮ → **Raw
   configuration editor** → select all → copy → save to a file. Pasting
   replaces everything and there is no undo.
2. Select all → paste `dashboard/edp-command-center-TEST.yaml` → Save.
3. Tap **Diagnostics** in the navigation grid and read it.
4. Copy the exact Shopping List entity_id shown in Diagnostics and report
   it back. The consolidated TEST dashboard intentionally does not guess it.
5. Replace the four `REPLACE_WITH_..._URL` placeholders with the real
   Register, Kiosk, Inventory and Repairs URLs.

**Done when:** the dashboard loads with no red cards and the Tasks tile
reads 6.

**Report back:** a photo of the Diagnostics view. It answers the entity
questions this build could not.

---

## Session 6 — Wyze locks · 10 min

Likely the cheapest hardware win: the `lock` domain returned zero entities
on both 2026-09-02 and 2026-09-20, yet the Wyze integration reports
connected. Zero entities — rather than entities reading `unavailable` — is
the signature of an integration not creating them at all.

1. **Settings → Devices & Services → Wyze** → open it.
2. Count the devices and entities it lists. Look for Front Door and Office
   Door.
3. If the locks are listed but disabled: enable them.
4. If they are listed and enabled but there are still no `lock.*`
   entities, note the integration version and any error in **Settings →
   System → Logs** filtered for `wyze`.
5. If they are not listed at all: reload the integration, then reconfigure
   it.
6. **Settings → Voice assistants → Expose** → expose any lock entities so
   the chat side can read them too.

**Done when:** you can say how many `lock.*` entities exist. The
dashboard's Locks card fills itself in once they do — no edit needed.

**Security rule: do not add any automatic lock or unlock. Nothing in this
build calls a lock service, and that is deliberate.**

---

## Session 7 — Ring alarm panel · 10 min

1. **Settings → Devices & Services → Ring** → open it.
2. Look for a base station / alarm panel device, not just the contact
   sensors.
3. If present but without an `alarm_control_panel` entity, check whether
   the Ring account used for the integration has Ring Alarm permissions —
   a shared user without alarm scope produces exactly this symptom.
4. If absent, re-authenticate the integration with the owner account.
5. Expose any `alarm_control_panel` entity to Assist.

**Done when:** you can say whether an `alarm_control_panel` entity exists.

**Do not enable any automatic arm or disarm.** Per the standing rule, any
arm/disarm test happens with you watching.

---

## Session 8 — Ring inventory (needs registry access) · 10 min

Answers item 4 of the addendum properly. From the Assist layer, 11 of the
39 binary sensors carry Ring's `<type> <serial>` naming pattern, but
friendly names are not proof of integration.

1. **Settings → Devices & Services → Ring → entities** — this is the
   authoritative list, by integration rather than by name.
2. Note the count and the entity_ids.
3. Compare against the 11 suspected in
   `docs/HA-ENTITY-INVENTORY-2026-09-20.md`.
4. Check the two suspected duplicate pairs specifically: serial **45101**
   appears as both "Keypad 45101 Motion" and "Ring Keypad 45101 Motion";
   serial **05118** as both "Motion Detector 05118" and "Upstairs Bathroom
   Motion Detector 05118". If each pair is one physical device, delete the
   stale entity.
5. **Settings → Voice assistants → Expose** — expose every Ring entity.

**Done when:** an accurate Ring device count exists, replacing the assumed
one.

---

## Session 9 — Frigate / MQTT · 30+ min, not a five-minute job

Needs SSH and is the largest item. Do not start it in the same sitting as
the rest.

1. SSH to the Frigate host over Tailscale: `ssh <user>@100.114.19.113`
2. `docker ps` (or `systemctl status frigate`) — is it running?
3. `df -h` — is the FrigateVG pool full? A full disk stops recordings and
   is the cheapest thing to rule out.
4. Confirm Mosquitto is up and Frigate is publishing:
   `mosquitto_sub -h <broker> -t 'frigate/#' -v` — you want live traffic.
5. Only if traffic is flowing: configure Home Assistant's native MQTT
   integration against `frigate/events`, per the plan already on file.

**Done when:** `states.camera` is non-empty in Home Assistant. The
dashboard's Frigate card activates on its own at that point.

**Report back:** the output of steps 2–4. Those three answers determine
whether this is a Frigate problem, a disk problem or an integration
problem — and they are currently unknown.

---

## Not scheduled — open scope question

The addendum notes you mentioned wanting "a bunch of other things" beyond
items 1–5, without specifics. Nothing has been assumed about those. Say
what they are and they can be planned.
