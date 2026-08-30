# EDP OS Register — clean TEST shell (pass 1)

The Electronics Depot LLC. **TEST ONLY.** UI/state simulation with mock data.
Nothing in this build reads or writes a live spreadsheet, database, printer,
or mailbox.

---

## Target project — verify before pushing

| | |
|---|---|
| Intended TEST project | `TEST - EDP Register Clean Build` |
| Intended TEST Script ID | `1Yk4bjqt8PXV7GCLwzJgdhtPQAiNTAwUtun3S865i67OOxnIKnmc_n87f` |
| Old Register project — **never touch** | `1VeOcKP11K7B_BxnFKnjXLmB9jQA-j8wq-jEzpOH7M1gXt28NFTDhEe5P` |

> **This repository does not contain a `.clasp.json`, and the push has NOT been
> performed.** These files were authored in an environment with no clasp CLI and
> no Google credentials, so the Script ID could not be verified from here and
> `clasp push` could not run. Verification and push are manual steps — see below.

## Files

| File | Purpose |
|---|---|
| `appsscript.json` | Manifest. `America/Chicago`, V8, web app `executeAs: USER_DEPLOYING`, `access: MYSELF`. No OAuth scopes declared — the build calls no Google services, so none are needed. |
| `Code.gs` | `doGet()` + read-only server endpoints. No mutation, no I/O. |
| `Config.gs` | Non-secret TEST constants and feature flags (all write features `false`). |
| `MockData.gs` | Demo inventory, customers, activity events, open ticket. |
| `Index.html` | Page structure + inline SVG icon sprite. |
| `Styles.html` | All CSS. Responsive, light/dark, print rules for the receipt. |
| `Scripts.html` | All client behavior. |
| `.clasp.json.example` | Reference copy of the intended TEST config. Not used by clasp. |

## Pushing to the TEST project (run locally)

From `C:\Users\Owner\EDP_Register_TEST_Clean`, copy these files in, then:

```powershell
# 1. VERIFY the target. Must print the TEST id, NOT 1VeOcKP...
type .clasp.json

# 2. Read-only check of what would be pushed
npx clasp status

# 3. Push (no deployment is created by this)
npx clasp push
```

If `.clasp.json` shows any Script ID other than
`1Yk4bjqt8PXV7GCLwzJgdhtPQAiNTAwUtun3S865i67OOxnIKnmc_n87f`, **stop** and do not
push. Do not run `clasp create` — the TEST project already exists.

No deployment is created here. Viewing the UI in a browser needs a TEST web-app
deployment, which is a separate, explicit decision.

## What is real vs. mock

**Works for real (client-side):** live America/Chicago clock; product search;
category filters; add/remove line items; warranty selection with price effect;
payment method selection; subtotal/warranty/tax/total math; customer search,
selection and linking; receipt preview rendering; activity timeline that logs
your actions as you take them; connection/queue/sync/printer status simulation;
responsive layout down to phone width.

**Mock only:** all inventory, customers, purchase history, warranty claims, and
the seeded activity events. Serial numbers, store address, store phone, and
policy text are literal `[ PLACEHOLDER ]` strings. `MOCK_TAX_RATE` (9.45%) is a
layout placeholder, not the filed rate.

**Deliberately not connected:** the SALES writer, inventory mutation, the
printer bridge, receipt email, the persistent offline queue/database, Script
Properties, triggers, and any live spreadsheet or `EDP_MASTER_DATABASE` access.
`Complete Sale` is hard-disabled and the Print / Email / Reprint buttons only
write a line to the activity timeline.

## Safety properties

- No `SpreadsheetApp`, `DriveApp`, `MailApp`, `GmailApp`, `UrlFetchApp`,
  `PropertiesService`, or `ScriptApp` anywhere.
- No `fetch`, `XMLHttpRequest`, or `WebSocket`. Verified in a headless browser:
  **0 external requests** on load and through a full interaction pass.
- No external images, fonts, or CDNs. Product photos are SVG placeholders
  generated in-page as `data:` URIs. The only `http` string in the source is the
  SVG XML namespace `http://www.w3.org/2000/svg`, which is an identifier and is
  never fetched.
- `doGet()` performs no mutation. Nothing is created or repaired on page load.
- No secrets, keys, tokens, PINs, or live file IDs.
- Write-path functions exist only as named stubs that `throw`, so no half-built
  write path can be wired into the UI by accident.

## Local preview without deploying

The Apps Script templating (`<?!= include(...) ?>`) means `Index.html` will not
render correctly if opened directly in a browser. To preview, concatenate the
includes and inject `getBootstrapJson()` in place of `<?!= bootJson ?>`.

When doing this in JavaScript, pass a **function** to `String.replace()`:

```js
html.replace(/<\?!=\s*include\('Scripts'\);\s*\?>/, () => scriptsHtml)
```

A plain string replacement silently corrupts the payload, because `$$`, `$'`,
and `$&` inside it are treated as replacement patterns — and `Scripts.html`
contains both `$$(` and `'$'`.
