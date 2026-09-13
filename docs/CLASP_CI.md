# EDP clasp — cloud runner + dual backup

Removes the dependency on one local machine.

| Role | System |
|---|---|
| Source of truth + version history | GitHub — `BUTTER6599/EDP-Master-System` |
| clasp runner | GitHub Actions, `ubuntu-latest` |
| Second independent backup | Google Drive, weekly snapshot |
| Third copy (free) | GitHub Actions artifacts, 90 days |

Target: **EDP_Vapi_Bridge_CLEAN_TEST**, Script ID
`1_owUir-q9PiNl-LLP3oJ2o2D6asrYeAgoaZ7bOnu2eO_WbotD7uIYHwa`.
The legacy `EDP_Vapi_Bridge_TEST` project is never referenced by any workflow.

---

## 1. Dedicated EDP CLASP CI OAuth design

**No existing OAuth client or consent screen is reused or modified.** Create a
new Google Cloud project used for nothing else:

```
Project name : EDP-CLASP-CI
Purpose      : machine credential for pushing Apps Script source from CI
Owner        : thedepote@gmail.com
```

A dedicated project is the whole point: its consent screen governs this one
machine credential, so the Testing/Production decision has **no blast radius**
onto any other EDP integration. Never point this at a legacy client whose
ownership, purpose and scope list you have not personally re-read.

Two OAuth clients, in two separate Cloud projects, never crossed:

| Client | Project | Scope | Used by |
|---|---|---|---|
| `EDP CLASP CI — push` | `EDP-CLASP-CI` | `script.projects` | push workflow |
| `EDP Drive Backup` | `EDP-DRIVE-BACKUP` | `drive.file` | backup workflow |

### What scopes clasp will request

`clasp login` requests **clasp's own hardcoded list**, not a list you choose.
Expect roughly: `script.deployments`, `script.projects`, `script.webapp.deploy`,
`drive.file`, `drive.metadata.readonly`, `service.management`, `logging.read`,
`userinfo.email`, `userinfo.profile`. Treat that as indicative — **the consent
screen shown during login is authoritative**, and the exact granted set is
recorded in the `scope` field of `~/.clasprc.json` afterwards. Read both.

Two of those, `script.deployments` and `script.webapp.deploy`, are precisely the
ability we spent the workflow design forbidding. So we do not use `clasp login`.

`scripts/mint_clasp_token.py` mints the token directly against our dedicated
client, requesting only:

```
https://www.googleapis.com/auth/script.projects
```

That single scope covers both operations we use — `clasp push` calls Apps Script
API `projects.updateContent`, `clasp pull` calls `projects.getContent`. It does
**not** grant deployment. The resulting credential is *physically incapable* of
deploying, which is a stronger guarantee than a workflow that merely declines to.
The push job re-asserts this at runtime and fails if a broader token was pasted
in.

If clasp v2 turns out to need an identity call, re-mint with
`--scope-preset with-email` (adds `userinfo.email` + `openid`, still no deploy
scope). Prove which is needed by running the workflow in `verify-only` mode —
that is what the mode is for.

### Is Google verification required?

**No, not for this use case.** Verification is required when an app requests
sensitive or restricted scopes *and* is used by people other than the developer.
Here the only user is the account that owns the Cloud project.

- `script.projects` is a **sensitive** scope → an unverified app shows the
  "Google hasn't verified this app" interstitial. As the project owner you click
  **Advanced → Go to EDP CLASP CI (unsafe)** once, during the one-time mint.
  That warning is expected and is not a failure.
- `drive.file` is **not** a sensitive scope — it is Google's recommended
  least-privilege Drive scope. No interstitial, no verification, no CASA.

Going through verification would demand a homepage, privacy policy, demo video
and review turnaround, and would buy us nothing: it only removes a warning
screen that one owner sees once. Skip it.

### Testing vs In production

| | Testing | In production, unverified | In production, verified |
|---|---|---|---|
| Refresh token lifetime | **expires after 7 days** | does not expire on a timer | same |
| Verification needed | no | no | yes — weeks of review |
| Consent warning | yes | yes | no |
| User cap | 100 test users | ~100 users | none |
| Fits CI? | **no** — weekly re-mint | **yes** | overkill |

**Recommendation: set the dedicated `EDP-CLASP-CI` consent screen to In
production, unverified.** The 7-day refresh-token expiry in Testing status is
what breaks unattended CI, and it is the only reason to leave Testing. Because
this consent screen belongs to a project created solely for this credential,
flipping it affects nothing else you own.

Refresh tokens can still be invalidated by a Google password change, an explicit
revoke at <https://myaccount.google.com/permissions>, or ~6 months unused.

---

## 2. Drive backup authorization

`drive.file` is kept. Full `drive` scope is **not** requested and is not needed.

Under `drive.file` an app may only touch files and folders **it created**. That
single rule decides the comparison.

### Option A — backup app creates its own dedicated folder

- Works natively with `drive.file`; no extra API surface.
- The folder is created with *your* user token, so **you own it**. It appears in
  your Drive like any other folder.
- `drive.file` restricts what the **app** can see. It places no restriction on
  what **you** can see, so human recovery — browse, preview, download — is
  completely normal.
- The grant follows the object, not the path: renaming the folder or **moving it
  into the approved EDP backup area does not break the app's access.**

### Option B — authorize/select an existing approved folder

- A pre-existing folder was not created by the app, so `drive.file` cannot reach
  it by ID. Pointing the workflow at one simply fails.
- Legitimate routes are (i) the **Google Picker**, where the user selects the
  folder and that selection grants per-folder `drive.file` access, or (ii)
  escalating to full `drive` scope.
- The Picker needs a hosted web page, an API key and a browser step — real
  complexity for a headless one-time setup. Full `drive` scope hands a CI
  credential read/write over your entire Drive, which is exactly what you asked
  to avoid.

### Verdict: **A, then relocate**

A is safer *and* easier to recover:

- **Safer** — keeps `drive.file`. The credential can never read the rest of your
  Drive, so a leaked backup token exposes only the backups it made.
- **Easier to recover** — the folder is owned by your own account and browsable
  in the Drive UI with no app, no token and no script involved. Under B with
  full `drive`, recovery is no better, and the blast radius of a leak is your
  whole Drive.

You still get the governance B was after: **let the app create the folder, then
drag it into the approved EDP backup area yourself.** Access survives the move,
so the archive lives where policy wants it while the credential stays minimal.

First run prints the created folder ID — paste it into `GDRIVE_BACKUP_FOLDER_ID`
so later runs reuse it.

---

## 3. Vapi webhook URL

### NEEDS VERIFICATION

Not determinable from repo or project data. What was checked:

| Source | Result |
|---|---|
| Repo grep for `script.google.com`, `/exec`, `/dev`, `AKfycb` | only the editor URL `/d/<id>/edit` in README |
| Repo webhook/Vapi config | only `src/server.js` Twilio host — a different system |
| Apps Script source, all 10 modules | no self-URL, no `ScriptApp.getService()`, no deployment ID |
| `appsscript.json` | has a `webapp` block, which proves the project is *configured* as a web app but says nothing about which deployments exist |
| Drive `script+json` export | carries **source only** — deployments are not represented |

Listing deployments needs the Apps Script API, which this environment cannot
authenticate to. The webhook target itself lives in the **Vapi dashboard**,
outside Google entirely.

**Unverified inference, recorded as reasoning only:** a `/dev` URL requires the
caller to be signed in as a Google user with edit access to the script. Vapi
holds no Google session, so a `/dev` URL would return an HTML sign-in page
instead of running `doPost`. Since calls have been processing successfully, the
webhook is *probably* a deployed `/exec` URL. **This is not verified — do not
act on it.**

### How to verify, in about a minute

1. Vapi dashboard → the TEST assistant → Server / Webhook URL. Read the suffix:
   `…/macros/s/<ID>/exec` or `…/macros/s/<ID>/dev`.
2. Cross-check in Apps Script: **Deploy → Manage deployments**. Note each
   deployment's type and its **Version** — a number, or "HEAD".

### Why this gates the first push

| If Vapi uses | `clasp push` effect on TEST |
|---|---|
| `/dev` | HEAD is served directly → **the change goes live for TEST calls the moment the push lands** |
| `/exec` pinned to a version number | deployment keeps serving its pinned version → **push changes nothing until someone deploys a new version** |

The second case carries a consequence worth deciding before approval: your
transcript-formatting change **will not take effect from a push alone**. Making
it live requires a new deployment version, which current instructions forbid. So
the answer to "which URL" determines whether the push is the finish line or only
step one. Resolve item 3 before approving the first `push`-mode run.

---

## Secrets model

Scoped to **GitHub Environments**, never repository-wide, so the push job cannot
read Drive credentials and the backup job cannot read clasp credentials.

### Environment `appsscript-test` — required reviewer: you

| Secret | Contents |
|---|---|
| `CLASPRC_JSON` | Full output of `scripts/mint_clasp_token.py` — `script.projects` only |
| `CLASP_SCRIPT_ID_CLEAN_TEST` | `1_owUir-…`, written to `.clasp.json` at runtime |

### Environment `drive-backup`

| Secret | Contents |
|---|---|
| `GDRIVE_CLIENT_ID` / `GDRIVE_CLIENT_SECRET` | Dedicated backup client, separate Cloud project |
| `GDRIVE_REFRESH_TOKEN` | `drive.file` only |
| `GDRIVE_BACKUP_FOLDER_ID` | App-created folder, printed by the first run |

Nothing credential-bearing is committed. `.gitignore` blocks `.clasprc.json`,
`clasprc.json`, `creds.json`, `client_secret*.json`. The runner shreds
`~/.clasprc.json` in an `if: always()` step. The backup job greps each zip and
refuses to upload if a credential-shaped file is inside.

---

## One-time setup

Once, on a machine with a browser. Afterwards no laptop is involved.

1. Enable the Apps Script API for your account —
   <https://script.google.com/home/usersettings>. Without this every push fails.
2. Create Cloud project **`EDP-CLASP-CI`**. Enable the **Apps Script API** in it.
3. Consent screen: External → **publish to In production** → add nothing else.
   Do not touch any other project's consent screen.
4. Credentials → OAuth client ID → **Desktop app** → download `client_secret.json`.
5. Mint the minimal token:
   ```bash
   python3 scripts/mint_clasp_token.py client_secret.json
   ```
   Expect the unverified-app warning → **Advanced → Go to EDP CLASP CI**. The
   script prints the granted scopes and warns if any deploy scope appears.
6. Paste `clasprc.json` into `CLASPRC_JSON`. Delete `clasprc.json` and
   `client_secret.json` locally.
7. Repeat 2-5 in a second project **`EDP-DRIVE-BACKUP`** for the `drive.file`
   client; fill the `GDRIVE_*` secrets.
8. Run the backup workflow once; copy the printed folder ID into
   `GDRIVE_BACKUP_FOLDER_ID`; drag the folder into the approved EDP backup area.

---

## Running a push

Actions → **Apps Script — manual push (TEST)** → Run workflow.
`target: CLEAN_TEST`, `confirm: PUSH`, `mode: verify-only` first.

Sequence: intent check → no-deploy-command guard → `.claspignore` guard →
**pre-push verification** → credentials staged → **token scope assertion** →
`clasp push --force` → `clasp pull` back → **post-push verification** → shred
credentials → rollback summary.

---

## Rollback

`clasp push` replaces content only. Roll back by pushing the previous commit —
the run summary prints these with real SHAs filled in:

```bash
git checkout -b rollback/<prev-short-sha> <prev-sha>
git push -u origin rollback/<prev-short-sha>
```

Re-run the workflow on that branch. Pull-back verification proves what landed.

| Situation | Restore from |
|---|---|
| Bad push, previous commit good | the rollback above |
| Need the pre-refactor single file | `git show 3663c01:apps-script/EDP_Vapi_Bridge_CLEAN_TEST/Code.gs` |
| GitHub unavailable | newest zip in the Drive backup folder |
| Both suspect | Actions artifact from a recent backup run |

Apps Script's **File → See version history** is a fourth net inside the editor.

---

## Security risks

| Risk | Mitigation |
|---|---|
| `CLASPRC_JSON` is a Google refresh token | Dedicated client, `script.projects` only; environment-scoped; required reviewer; masked; shredded every run |
| A CI credential could deploy | **Scope omitted at mint time** — not just unused. Runtime assertion fails the job if a deploy scope is present |
| Anyone who can run workflows can push | `workflow_dispatch` only, `confirm: PUSH`, environment approval |
| Malicious workflow edit exfiltrates a secret | Environment secrets unavailable to fork PRs; keep the reviewer; review workflow diffs specifically |
| Third-party action compromise | Only first-party `actions/*`; pin to SHAs for stricter supply-chain control |
| Token expiry breaks pushes silently | Consent screen In production, not Testing; a failed run emails the actor |
| Drive credential over-reach | Separate Cloud project, separate client, `drive.file` only — cannot read the wider Drive |
| Secret leaking into a snapshot | Backup job greps the zip and fails before upload |
| Script ID treated as a secret | An identifier, not a credential. Held as a secret because requested; a repository variable is equally safe |

---

## Exact remaining manual steps

| # | Step | Why it needs you |
|---|---|---|
| 1 | **Verify the Vapi webhook URL — `/dev` or `/exec`** | Vapi dashboard login; decides whether a push is live immediately |
| 2 | Check **Deploy → Manage deployments** and note each version | Confirms the existing deployment stays pinned |
| 3 | Enable the Apps Script API | Your Google account |
| 4 | Create `EDP-CLASP-CI`, consent screen In production, Desktop client | Google Cloud Console |
| 5 | Run `mint_clasp_token.py`, accept the unverified warning | Browser + your Google login |
| 6 | Create `EDP-DRIVE-BACKUP` and its `drive.file` client | Same |
| 7 | Create both GitHub Environments, add reviewer, paste 6 secrets | GitHub Settings |
| 8 | Run backup once, record folder ID, move folder to approved area | Drive UI |
| 9 | Run push workflow in `verify-only` | GitHub Actions |
| 10 | Only after 1-9: run in `push` mode | Your approval |

Step 1 is the gate. Do it before approving anything else.
