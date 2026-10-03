# Package 11 + 12 — TEST deployment evidence

**2026-10-03 05:14:34 UTC.** TEST only. Nothing on LIVE was touched.

| | |
| --- | --- |
| Git commit deployed | `34c79e8015075f43b7204572d9d6a21d0f85bf1e` |
| Apps Script project | `1Yk4bjqt8PXV7GCLwzJgdhtPQAiNTAwUtun3S865i67OOxnIKnmc_n87f` — the existing TEST project |
| Authorized account | `thedepote@gmail.com` |
| clasp | 3.4.1 |
| Files pushed | 10 — the `.claspignore` allowlist, nothing else |
| Deployments after push | 1, `AKfycbxUo_K3a5QOsg6s7mTriwndvBi4e3SamRNpUtta-sHj @HEAD` — unchanged. No new deployment or version was created |

## Evidence files

- `OUTBOUND-SHA256.txt` — digests captured BEFORE the push, of the exact files intended for it.
- `DEPLOYED-BEFORE-SHA256.txt` — the state Google held BEFORE the push, read back from the API. Verified **10/10 byte-identical to Package 10 commit `5217761`**, which confirms the previously-unverified claim that the deployed app was still Package 10.
- `READBACK-AFTER-SHA256.txt` — the state Google holds AFTER the push, read back from the API. **10/10 identical to `OUTBOUND-SHA256.txt`.**

A partial, reordered or altered push is therefore detectable rather than assumed.

## Content verified on what Google now holds

- `CONFIG.SALES_TAX` present: `MODE: 'INCLUSIVE'`, `RATE: 0.0975`.
- `MOCK_TAX_RATE` exists only inside the comment recording its deletion.
- `COMPLETE_SALE_ENABLED`, `SALES_WRITER_ENABLED`, `INVENTORY_MUTATION_ENABLED`,
  `PRINTER_ENABLED`, `EMAIL_RECEIPT_ENABLED` — all `false`.
- Manifest `oauthScopes` is exactly `["https://www.googleapis.com/auth/spreadsheets.readonly"]`.

## Rollback

`clasp push` from Package 10 commit `5217761`, whose content is proven equal to
`DEPLOYED-BEFORE-SHA256.txt`. Byte-exact local copies also sit in
`test/pkg11-prewrite/` and `test/pkg12-prewrite/`.

## Not done

No SALES write, no inventory mutation, no Sheets write, no new deployment, no
LIVE change, no printer/router/network change. No receipt has reached paper yet.
