# Verification & Rollback Checklist

## Normal operation

- [ ] Apps Script `/exec` returns HTTP content with valid JSON.
- [ ] `status` = TEST.
- [ ] `generated_at` changes after refresh.
- [ ] Master Sheet name/id match expected source.
- [ ] TASKS_TEST count matches the current source.
- [ ] No customer phone/email appears in bridge JSON.
- [ ] No payroll rate/gross pay appears in bridge JSON.
- [ ] No bill amount appears in bridge JSON.
- [ ] Home Assistant REST sensors populate.
- [ ] Dashboard renders without unknown custom-card dependencies.

## Unavailable entities

- [ ] Security/Frigate/locks/alarm remain labeled BLOCKED.
- [ ] No guessed entity IDs are added.
- [ ] Missing REST data does not expose stale values as LIVE.

## Stale data

- [ ] Temporarily break the TEST bridge URL.
- [ ] Confirm REST sensors become unavailable or stop updating.
- [ ] Confirm `sensor.edp_bridge_stale` identifies age > 5 minutes when source is stale.
- [ ] Restore URL and verify recovery.

## Notification failure

This package does not enable production notifications yet.

Before enabling notifications:
- [ ] identify exact notify service/device,
- [ ] send one TEST notification,
- [ ] verify receipt,
- [ ] verify privacy-safe content,
- [ ] test failure behavior,
- [ ] keep security alerts separate from unlock/disarm actions.

## Shopping List

- [ ] copy exact entity ID,
- [ ] add `todo-list` card,
- [ ] add one TEST item,
- [ ] verify it appears,
- [ ] mark complete,
- [ ] verify completion,
- [ ] only then label Shopping List LIVE.

## Rollback

1. Keep backups of pre-change `configuration.yaml`, `secrets.yaml`, and dashboard YAML/storage state.
2. If REST sensors cause a validation error, remove the include/merged REST block and revalidate.
3. If dashboard rendering fails, switch back to the previous dashboard/view; do not delete it during TEST.
4. Apps Script rollback: disable/delete the TEST deployment. No source-sheet data is modified by this bridge.
5. Do not promote branch `test/edp-ha-command-center-v1` into the production/default branch until all required checks pass.
