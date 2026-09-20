# EDP Home Assistant Command Center — TEST

Status: TEST BUILD PACKAGE

Purpose: make Home Assistant the command center and interaction layer for The Electronics Depot while Google Drive, Google Sheets, Apps Script, n8n, Register, Kiosk, Inventory, Repairs, Calendar, and other EDP systems remain authoritative.

## Verified source state

- Master Sheet: EDP_MASTER_DATABASE
- Spreadsheet ID: 117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI
- TASKS_TEST exists and remains TEST-only.
- Assist-level Home Assistant access does not expose entity IDs, entity registry, config entries, SSH, MQTT, or private-network access.
- Reported Assist-level domains: camera=0, lock=0, alarm_control_panel=0, todo=1 friendly-named Shopping List, binary_sensor=39.
- Do not mark Frigate, cameras, locks, alarms, or sensor ownership LIVE until verified in Home Assistant.

## Files

- dashboard-test.yaml — TEST dashboard structure.
- ha-rest-sensors.yaml — REST sensor package for the Apps Script bridge.
- secrets.example.yaml — values Taylor must fill in.
- apps-script/Code.gs — read-only Google Sheets JSON bridge.
- apps-script/appsscript.json — Apps Script manifest.
- DATA_CONTRACT.md — JSON contract and source mapping.
- DEPLOYMENT.md — exact deployment steps.
- VERIFICATION.md — verification and rollback checklist.
- DESKTOP_ACTIONS.md — desktop work split into 5- and 10-minute sessions.

## Status rules

- LIVE = connected and tested.
- TEST = connected but still being validated.
- BLOCKED = requires access, credentials, hardware, source data, or user action.

Security: never automate unlock or disarm. Do not expose customer PII, detailed payroll, health, or private financial detail on public displays.
