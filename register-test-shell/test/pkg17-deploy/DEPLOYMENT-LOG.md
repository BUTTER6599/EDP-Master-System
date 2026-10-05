# Package 17 — TEST deployment of the write-capable runtime

**2026-10-05 01:01:21 CDT (06:01:20 UTC). Deployed. Writers remain OFF.**

| | |
| --- | --- |
| Git commit deployed | `234f69f` |
| Apps Script project | `1Yk4bjqt8PXV7GCLwzJgdhtPQAiNTAwUtun3S865i67OOxnIKnmc_n87f` — the existing TEST project |
| Account | `thedepote@gmail.com` |
| Files pushed | **11** (the allowlist; `Sale.gs` is new to the project) |
| Deployments after | **1**, `AKfycbxUo_K3a5QOsg6s7mTriwndvBi4e3SamRNpUtta-sHj @HEAD` — unchanged, none created |
| Read-back parity | **11/11** |
| clasp after | logged out, credentials deleted |

## Before → after

| | Before | After |
| --- | --- | --- |
| Files in project | 10 | **11** |
| `Sale.gs` deployed | **no** | **yes** |
| Manifest scope | `spreadsheets.readonly` | **`spreadsheets`** |
| `Values.append` live | 0 | **1** |
| `Values.update` live | 0 | **1** |
| Writer gates | false | **false** |

## Fail-closed proof, read from what Google now holds

- `COMPLETE_SALE_ENABLED`, `SALES_WRITER_ENABLED`, `INVENTORY_MUTATION_ENABLED`,
  `PRINTER_ENABLED`, `EMAIL_RECEIPT_ENABLED`, `LIVE_DATABASE_ENABLED` — all
  **false** in the deployed `Config.gs`.
- The deployed `saleWriteAdapter_()` returns `null` unless **both** gates are
  open, verified in the pulled source.
- No function was executed. No sale was attempted. Fail-closed behaviour was
  proven by reading the deployed source, never by trying a transaction against
  the live sheet.

## Zero business-data writes

The spreadsheet's `modifiedTime` is **2026-10-05T04:13:46.857Z**, which
**predates this push by about 1 hour 48 minutes**. The deployment therefore
wrote nothing to SALES or APPLIANCES, and could not have: no function ran.

**Observation, not alarm:** that 04:13:46Z change is also *later* than the
request_id migration verified at 03:10:11Z, so something touched the workbook
between the two. It was not this session — every Google call made here was a
read or a code push. Worth identifying before the first controlled write, since
the Package 15 post-migration manifest no longer describes the current file.

## OAuth — the honest position

`clasp login` grants **clasp's own fixed tool scopes** (`script.projects`,
`script.deployments`, `drive.file`, `cloud-platform`, …). It does **not**
include `spreadsheets`, and clasp cannot grant a scope to the web app's runtime.

**Gate 6 is therefore NOT satisfied.** The deployed manifest *declares*
`spreadsheets`, but Google will request the owner's consent for it when the web
app next runs under the new manifest. Until that consent is given, the runtime
holds no write authority at all.

## Rollback

Restore by pushing commit `946a621` (Package 15C — last source with no mutation
code), or `34c79e8` (Package 11+12 — the exact state deployed before tonight,
10 files, `spreadsheets.readonly`). Both pre- and post-push digests are in this
directory.
