# EDP Home Assistant TEST Bridge — Data Contract

Schema version: 1.0.0  
Mode: TEST  
Source of truth: EDP_MASTER_DATABASE and existing EDP apps.

The bridge is read-only. It does not create a competing database.

## Envelope

```json
{
  "status": "TEST",
  "mode": "TEST",
  "schema_version": "1.0.0",
  "generated_at": "ISO-8601",
  "source": {
    "system": "Google Sheets / Apps Script",
    "spreadsheet_id": "117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI",
    "spreadsheet_name": "EDP_MASTER_DATABASE"
  }
}
```

## Sections

| Section | Authoritative source | HA receives | Privacy rule |
|---|---|---|---|
| tasks | TASKS_TEST | open/urgent counts + top task summary | no sensitive notes |
| bills | BILLS | attention count + name/date/status/priority | amount omitted |
| schedule | SCHEDULE | today's active staff rows | no payroll data |
| team | TIME_LOGS | latest clock state + names | no pay/rate |
| sales | SALES | 7-day count + aggregate amount | no customer detail |
| purchases | PURCHASES | 7-day count/aggregate + unpaid count | no vendor-private detail |
| inventory | APPLIANCES | available/floor-ready/not-ready counts | no detailed cost basis |
| repairs | REPAIR_TICKETS | open/diagnosing/overdue counts | no customer PII |
| parts | PARTS | low-stock count + part name/qty | no supplier credentials |
| kiosk | KIOSK_MESSAGES | unread count + latest operational messages | review public-display suitability |
| notifications | derived | small alert array | no private content |
| security | Home Assistant registry | BLOCKED until exact entities verified | no unsafe actions |
| frigate | HA/Frigate/MQTT | BLOCKED until exact entities/topics verified | snapshots later |
| locks | Home Assistant registry | BLOCKED until exact entities verified | explicit confirmation for unlock |
| alarm | Home Assistant registry | BLOCKED until exact entity verified | explicit confirmation for disarm |

## TEST-to-LIVE gate

A section may move from TEST to LIVE only when:
1. source fields are verified,
2. endpoint output is inspected,
3. Home Assistant sensor state/attributes match the source,
4. stale/unavailable behavior is tested,
5. display privacy is approved for the target screen,
6. rollback is documented.
