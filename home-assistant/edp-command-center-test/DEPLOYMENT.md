# Deployment — EDP Home Assistant Command Center TEST

## A. Apps Script bridge

1. Open Apps Script for a new standalone TEST project named `EDP_HA_COMMAND_CENTER_BRIDGE_TEST`.
2. Replace `Code.gs` with `apps-script/Code.gs`.
3. Replace the manifest with `apps-script/appsscript.json` if manifest editing is enabled.
4. Confirm project timezone is America/Chicago.
5. Project Settings > Script Properties: add `EDP_BRIDGE_KEY` with a long random value (32+ random characters).
6. Run `buildPayload_` once from the editor and approve read access to the Master Sheet.
7. Inspect the execution. It must complete without write operations.
8. Deploy > New deployment > Web app.
9. Execute as: Me.
10. Access: Anyone. The endpoint still requires the secret `key` query value and returns `UNAUTHORIZED` without it.
11. Copy the generated `/exec` URL.
12. Test `/exec?key=YOUR_KEY` in a private browser window. Expected JSON includes `"status":"TEST"` and `"schema_version":"1.0.0"`.
13. Test the same URL without `?key=` and confirm the JSON status is BLOCKED with `UNAUTHORIZED`.

The TEST bridge is read-only and privacy-reduced. It omits customer phone/email, payroll rates/pay, bill amounts, and kiosk message bodies.

## B. Home Assistant REST sensors

1. Back up `configuration.yaml`, `secrets.yaml`, and the existing Lovelace dashboard configuration.
2. Copy `ha-rest-sensors.yaml` into the HA config area.
3. Put the Apps Script URL plus the key into `secrets.yaml`:
   `edp_ha_bridge_url: "https://script.google.com/macros/s/.../exec?key=LONG_RANDOM_KEY"`
4. Include the sensor file from `configuration.yaml`, or merge its `rest:` and `template:` blocks carefully with existing configuration.
5. Run Home Assistant configuration validation before restart.
6. Restart Home Assistant only if validation passes.
7. Developer Tools > States: verify:
   - sensor.edp_bridge_health = TEST
   - sensor.edp_open_tasks
   - sensor.edp_bills_due
   - sensor.edp_schedule_today
   - sensor.edp_team_clocked_in
   - sensor.edp_kiosk_unread
   - sensor.edp_sales_7d
   - sensor.edp_purchases_7d
   - sensor.edp_inventory_available
   - sensor.edp_repairs_open
   - sensor.edp_parts_low_stock

## C. Dashboard

1. Create or open the existing TEST dashboard path `edp-command-center`.
2. Keep the current dashboard intact until the TEST view is verified.
3. Add a new TEST view using `dashboard-test.yaml`.
4. Do not replace blocked entity placeholders with guessed IDs.
5. Copy the exact Shopping List entity ID from Developer Tools > States or Settings > Devices & services > Entities.
6. Replace the Shopping List markdown placeholder with a `todo-list` card only after the exact ID is verified.
7. Add exact phone, door, motion, lock, alarm, camera, and Frigate entities only after registry export/verification.

## D. Frigate/security phase

Required discovery before configuration:
- exact entity IDs,
- integration/config-entry ownership,
- exact camera IDs/names,
- exact door/window/motion entities,
- exact lock/alarm entities,
- exact Frigate MQTT/event path if direct MQTT is used.

No automatic unlock or disarm behavior is part of this TEST package.
