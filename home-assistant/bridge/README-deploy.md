# Deploying the Sheet bridge

Read-only Apps Script web app over `EDP_MASTER_DATABASE`. Roughly 15
minutes, all in the browser. `clasp` is optional — the manual path is
fine and needs no local tooling.

## 1. Create the project (5 min)

1. Open the Sheet:
   <https://docs.google.com/spreadsheets/d/117AFFI8t1ORiiq8CKaCTSW-9pAmGhMSQKWSh-DShWtI>
2. **Extensions → Apps Script**. A bound project opens.
3. Delete the stub in `Code.gs` and paste the whole of
   `home-assistant/bridge/Code.gs`.
4. **Project Settings** (gear) → tick *Show "appsscript.json" manifest file
   in editor*. Open `appsscript.json` in the editor and replace it with
   `home-assistant/bridge/appsscript.json`.
5. Save.

## 2. Set the tokens (3 min)

Generate two different random strings — a password manager works, or run
`openssl rand -hex 24` twice.

**Project Settings → Script Properties → Add script property:**

| Property | Value |
|---|---|
| `BRIDGE_TOKEN` | first random string — grants public scope |
| `BRIDGE_TOKEN_PRIVATE` | second random string — grants private scope |

These are the only credentials. They are never in the code, never in git,
and go into Home Assistant's `secrets.yaml` only.

> The tokens are the entire access control on this endpoint. Treat the
> private one like the Sheet itself: it returns bill amounts, employee
> names and staff messages. Do not paste either into a chat, a doc, or a
> screenshot.

## 3. Deploy (3 min)

1. **Deploy → New deployment → ⚙ → Web app**
2. Description: `EDP HA bridge v1`
3. Execute as: **Me**
4. Who has access: **Anyone**
5. **Deploy**, then authorise — Google will warn that the script is
   unverified; that is expected for your own bound script. *Advanced →
   Go to <project> (unsafe) → Allow*.
6. Copy the **Web app URL**. It ends in `/exec`.

"Anyone" means anyone *with the URL and a valid token*. Requests without
a matching token get `{"ok":false,"error":"Unauthorized"}` and no data.

## 4. Confirm the real tab names (2 min) — do not skip

The tab names in `Code.gs` came from the brief, not from the live file.
In a browser:

```
<web app url>?list=1&key=<BRIDGE_TOKEN_PRIVATE>
```

You get every sheet name, its row and column counts, its header row, and a
`configured` block showing which of the bridge's expected tabs were found:

```json
"configured": { "TASKS": { "sheet": "TASKS_TEST", "found": true }, ... }
```

For any `"found": false`, edit the `sheet:` value in that entry of `TABS`
in `Code.gs` to the real name, save, and **Deploy → Manage deployments →
✏ → Version: New version → Deploy**. Re-check until every tab reads true.

This step is also how INVENTORY, REPAIRS and PAYROLL get unblocked.

## 5. Spot-check a tab (2 min)

```
<web app url>?tab=TASKS&key=<BRIDGE_TOKEN_PRIVATE>
```

Expect `"count": 6` and the six tasks entered on 2026-09-19. Then the same
URL with `BRIDGE_TOKEN` (public) — you should get the same six titles but
**no** `owner` and **no** `notes`. If the public response contains an
owner name, stop and re-check that you pasted `Code.gs` whole.

Then:

```
<web app url>?tab=BILLS&key=<BRIDGE_TOKEN>
```

The response must contain no dollar amounts and no bill names. That is
the check that matters most — it is what keeps health and financial
detail off a shop-floor screen.

## Updating later

Editing `Code.gs` does **not** change what the URL serves. You must
**Deploy → Manage deployments → ✏ → Version: New version → Deploy**.
Keeping the same deployment keeps the same URL, so Home Assistant needs no
change. This is the single most common reason "my fix did nothing".

## Rollback

Every deployment is versioned. **Manage deployments → ✏ → Version →** pick
the previous version → **Deploy**. The URL is unchanged and Home Assistant
picks up the old behaviour within one poll (≤5 min). Nothing in the Sheet
is touched by a rollback, because the bridge never writes.

## Optional: clasp

```bash
npm i -g @google/clasp
clasp login
cp home-assistant/bridge/.clasp.json.example .clasp.json
# paste the Script ID from Project Settings
clasp push
clasp deploy -i <DEPLOYMENT_ID> -d "EDP HA bridge v2"
```

Keep `.clasp.json` out of git — it is already covered by the ignore rule
added for this directory.

## Running the tests

The bridge's filtering and scope rules are covered by a harness that runs
the real `Code.gs` against fixture rows copied from the live Sheet:

```bash
node home-assistant/bridge/test/bridge_test.mjs
```

22 checks, no network and no Google account needed. Run it after any edit
to `TABS` — it is what proves a public caller cannot see payroll, bill
amounts or the insurer's name.
