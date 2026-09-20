# Deployment — EDP Home Assistant Command Center TEST

## A. Apps Script bridge

1. Open Apps Script for a new standalone TEST project named `EDP_HA_COMMAND_CENTER_BRIDGE_TEST`.
2. Replace `Code.gs` with `apps-script/Code.gs`.
3. Replace the manifest with `apps-script/appsscript.json` if manifest editing is enabled.
4. Confirm project timezone is America/Chicago.
5. Run `buildPayload_` once from the editor and approve read access to the Master Sheet.
6. Inspect the execution log. It must complete without write operations.
7. Deploy > New deployment > Web app.
8. Execute as: Me.
9. Access: Anyone. This TEST endpoint is intentionally privacy-reduced; it does not return customer contact data, payroll rates/pay, or bill amounts.
10. Copy the generated `/exec` URL.
11. Open that URL in a private browser window. Expected JSON includes `"status":"TEST"` and `"schema_version":"1.0.0"`.

Do not promote to a sensitive owner-data endpoint without authentication design review.

## B. Home Assistant REST sensors

1. Back up `configuration.yaml` and any existing Lovelace dashboard configuration.
2. Copy `ha-rest-sensors.yaml` into the HA config area.
3. Put the Apps Script `/exec` URL into `secrets.yaml` as:
   `edp_ha_bridge_url: "https://script.google.com/macros/s/.../exec"`
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
