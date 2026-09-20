# Taylor Desktop Actions

Do these in short sessions. Stop after each session if needed.

## 5-minute session 1 — unlock the Shopping List card

1. Home Assistant > Developer Tools > States.
2. Search for **Shopping List**.
3. Copy the exact entity ID shown on screen.
4. Save it in the Home Assistant project notes.
5. Do not rename anything yet.

Result: the live Shopping List card can be wired without guessing.

## 5-minute session 2 — export entity IDs for security

1. Settings > Devices & services > Entities.
2. Filter domain/name for:
   - door,
   - window,
   - motion,
   - lock,
   - alarm,
   - camera,
   - Frigate,
   - battery,
   - Taylor phone.
3. Copy/export exact entity IDs and friendly names.
4. Do not change or delete entities.

Result: blocked dashboard sections can be mapped safely.

## 10-minute session 3 — Apps Script TEST bridge

1. Open script.google.com.
2. New project: `EDP_HA_COMMAND_CENTER_BRIDGE_TEST`.
3. Paste `apps-script/Code.gs`.
4. Set timezone America/Chicago.
5. Run `buildPayload_`; approve read access.
6. Deploy as TEST web app, execute as you, access Anyone.
7. Copy the `/exec` URL.
8. Open it once and confirm JSON says TEST.

Result: Home Assistant has a read-only TEST feed from the authoritative Master Sheet.

## 10-minute session 4 — Home Assistant REST sensors

1. Make a backup.
2. Add the REST sensor YAML and secret URL.
3. Run configuration validation.
4. Restart only if validation passes.
5. Developer Tools > States: search `sensor.edp_`.
6. Confirm bridge health = TEST.

Result: business summaries are connected in TEST.

## 10-minute session 5 — dashboard view

1. Open the EDP Command Center dashboard.
2. Add/import the TEST view.
3. Confirm tasks, bills, schedule, operations cards render.
4. Wire the exact Shopping List entity ID.
5. Leave Security/Frigate/locks/alarm BLOCKED until their IDs are verified.
6. Test on phone and iPad.

## Next desktop action right now

Do **Session 1** first: copy the exact Home Assistant entity ID for **Shopping List**. That is the smallest blocker and takes about a minute once Developer Tools > States is open.
