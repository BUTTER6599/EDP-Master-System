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

## Secrets

Both sets live in **GitHub Environments**, not repository-wide, so the push
job cannot read Drive credentials and vice versa.

### Environment `appsscript-test`

| Secret | Contents |
|---|---|
| `CLASPRC_JSON` | Entire contents of `~/.clasprc.json` after a local `clasp login` |
| `CLASP_SCRIPT_ID_CLEAN_TEST` | `1_owUir-…` — written to `.clasp.json` at runtime |

### Environment `drive-backup`

| Secret | Contents |
|---|---|
| `GDRIVE_CLIENT_ID` | Dedicated OAuth client ID (separate from clasp) |
| `GDRIVE_CLIENT_SECRET` | That client's secret |
| `GDRIVE_REFRESH_TOKEN` | Refresh token, scope `drive.file` only |
| `GDRIVE_BACKUP_FOLDER_ID` | Drive folder ID for the backup area |

Nothing credential-bearing is ever committed. `.gitignore` blocks
`.clasprc.json`, `creds.json`, `client_secret*.json` and friends, and the
backup workflow fails the run if a credential-shaped file appears inside a
snapshot.

## One-time authentication

Done once on any machine; afterwards no laptop is required.

**1. Enable the Apps Script API** — <https://script.google.com/home/usersettings>,
toggle on. Without this every `clasp push` fails.

**2. Create your own OAuth client** (do not rely on clasp's built-in one).
Google Cloud Console → a project you own → APIs & Services:
- Enable **Apps Script API**.
- OAuth consent screen → External → add `thedepote@gmail.com` as a test user.
- **Set publishing status to "In production"** and see the 7-day warning below.
- Credentials → Create credentials → OAuth client ID → **Desktop app**.
- Download the JSON as `creds.json`.

**3. Mint the credential locally:**

```bash
npm install -g @google/clasp@2.4.2
clasp login --creds creds.json      # opens a browser, sign in as thedepote@gmail.com
cat ~/.clasprc.json                 # this whole file becomes CLASPRC_JSON
```

**4. Paste it into the secret**, then delete `creds.json` and, if you like,
`~/.clasprc.json` — the runner no longer needs the laptop.

> **The 7-day trap.** While the OAuth consent screen is in **Testing**, Google
> expires refresh tokens after 7 days and every push starts failing with
> `invalid_grant`. Set publishing status to **In production**. A personal
> gmail.com account has no "Internal" option, so production is the only way to
> get a durable token. If it must stay in Testing, expect to re-mint
> `CLASPRC_JSON` weekly.

**5. Drive backup credential** — repeat with a *separate* OAuth client
requesting only `https://www.googleapis.com/auth/drive.file`. Because
`drive.file` limits the app to files it created, let the app create the backup
folder and record that folder's ID as `GDRIVE_BACKUP_FOLDER_ID`. A folder made
by hand in the Drive UI is not visible under this scope.

## Running a push

Actions → **Apps Script — manual push (TEST)** → Run workflow.

| Input | Meaning |
|---|---|
| `target` | `CLEAN_TEST` (only option) |
| `confirm` | must be exactly `PUSH` |
| `mode` | `verify-only` runs checks and stops; `push` verifies, pushes, pulls back, re-verifies |

Start with `verify-only`. It exercises the whole path except the write.

The job runs: intent check → no-deploy-command guard → `.claspignore` guard →
**pre-push verification** → write credentials → `clasp push --force` →
`clasp pull` into a temp dir → **post-push verification** → shred credentials →
rollback summary. Credentials are shredded in an `if: always()` step, so they
go away even when a step fails.

## Rollback

`clasp push` only replaces project content. Roll back by pushing the previous
commit — the run summary prints these with the real SHAs filled in:

```bash
git checkout -b rollback/<prev-short-sha> <prev-sha>
git push -u origin rollback/<prev-short-sha>
```

Then re-run the workflow selecting that branch, `mode: push`, confirm `PUSH`.
The pull-back verification proves what actually landed.

Deeper restores:

| Situation | Restore from |
|---|---|
| Bad push, previous commit good | the rollback above |
| Need the original pre-refactor single file | `git show 3663c01:apps-script/EDP_Vapi_Bridge_CLEAN_TEST/Code.gs` |
| GitHub unavailable | newest zip in the Drive backup folder |
| Drive and GitHub both suspect | Actions artifact from a recent backup run |

Apps Script's own **File → See version history** is a fourth net inside the editor.

## Deployments stay untouched

No workflow runs `clasp deploy`, `clasp redeploy`, `clasp undeploy` or
`clasp version`, and the push job fails outright if a deploy-class command ever
appears in `.github/workflows/`.

**Check before the first push:** if Vapi's webhook points at the Apps Script
`/dev` URL, that URL serves HEAD and a push changes TEST behavior the moment it
lands. If it points at a versioned `/exec` deployment, that deployment keeps
serving its pinned version until someone deploys manually. Confirm which URL
Vapi uses so you know whether a push is immediately live for TEST calls.

## Security risks

| Risk | Mitigation |
|---|---|
| `CLASPRC_JSON` holds a refresh token for the Google account | Environment-scoped secret; required reviewer on `appsscript-test`; masked in logs; shredded after every run |
| Anyone who can run workflows can push to Apps Script | `workflow_dispatch` only, `confirm: PUSH`, environment approval gate |
| A malicious PR adds a step that exfiltrates the secret | Environment secrets are unavailable to `pull_request` runs from forks; keep the required reviewer; review workflow diffs specifically |
| Compromised third-party action steals secrets | Only `actions/checkout`, `actions/setup-node`, `actions/upload-artifact` — all first-party; pin to SHAs for stricter supply-chain control |
| clasp's OAuth scopes are broader than push strictly needs | Accepted: clasp's own login requests a fixed scope set. Bounded by the approval gate and the no-deploy guard rather than by scope |
| Token expiry breaks pushes silently | Set consent screen to production; a failed run emails the actor |
| Drive credential over-reach | Separate OAuth client, `drive.file` only — cannot read the wider Drive |
| Secret leaking into a Drive snapshot | Backup job greps the zip and fails before upload |
| Script ID treated as a secret | It is an identifier, not a credential. Kept in a secret because it was requested; a repository *variable* would be equally safe |

## What you click, in order

1. Enable the Apps Script API at the user-settings link above.
2. Create the OAuth client, set consent screen to **In production**.
3. Run `clasp login --creds creds.json` once locally.
4. GitHub → Settings → Environments → create `appsscript-test`, add yourself as
   a **required reviewer**, add `CLASPRC_JSON` and `CLASP_SCRIPT_ID_CLEAN_TEST`.
5. Create environment `drive-backup`, add the four `GDRIVE_*` secrets.
6. Confirm whether Vapi points at `/dev` or `/exec`.
7. Run the workflow in `verify-only` mode.
8. Only then run it in `push` mode.

Steps 1-6 are yours — they need a browser and your Google account.
