#!/usr/bin/env python3
"""
Verification for the EDP_Vapi_Bridge_CLEAN_TEST Apps Script project.

Runs against either a source directory or a project JSON payload, so
the identical checks gate the payload BEFORE a push and confirm the
project AFTER one.

    python3 scripts/verify_project.py --dir apps-script/EDP_Vapi_Bridge_CLEAN_TEST
    python3 scripts/verify_project.py --json exported.json

--json accepts the decoded application/vnd.google-apps.script+json
payload (a Drive export, or what `clasp pull` was built from).

Checks, in the order requested:
  1. the project contains the 10 modular .gs files
  2. Code.gs is no longer present
  3. appsscript.json is unchanged (scopes, runtime, webapp access)
  4. all 19 functions exist exactly once
  5. TEST IDs / Script Property names / endpoints unchanged
"""
import argparse, glob, json, os, re, sys, collections

EXPECTED_GS = [
    '00_Config', '01_Webhook', '02_VapiApi', '03_Artifacts',
    '04_TranscriptFormat', '05_Classification', '06_TestCalls',
    '07_Pushover', '08_RealtimeAlerts', '99_TestHelpers',
]
EXPECTED_FNS = [
    'doGet', 'doPost', 'processCompletedCall_', 'jsonResponse',
    'getVapiCall_', 'saveVapiRecording_', 'saveTranscript_',
    'extractUserText_', 'makePreview_', 'formatTranscriptForDisplay_',
    'classifyCall_', 'containsAny_', 'ensureHeaders_', 'findCallRow_',
    'sendPushover_', 'testVapiLookup', 'testDriveAccess',
    'testProcessExistingCall', 'forceDriveAuthorization',
]
EXPECTED_MANIFEST = {
    'timeZone': 'America/Chicago',
    'runtimeVersion': 'V8',
    'exceptionLogging': 'STACKDRIVER',
    'oauthScopes': [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/script.external_request',
    ],
    'webapp': {'executeAs': 'USER_DEPLOYING', 'access': 'ANYONE_ANONYMOUS'},
}
EXPECTED_IDS = ['1ronx5A0l_v4lJTw19e5VrcnL4FUXDvgUjsEbxWJYx_c',
                '1yEKM5Sztz_2vJm5GOoW51AseKgE6Ts5K']
EXPECTED_PROPS = ['PUSHOVER_APP_TOKEN', 'PUSHOVER_USER_KEY', 'VAPI_PRIVATE_API_KEY']

ap = argparse.ArgumentParser()
g = ap.add_mutually_exclusive_group(required=True)
g.add_argument('--dir', help='source directory holding appsscript.json + *.gs')
g.add_argument('--json', help='project JSON payload')
ap.add_argument('--label', default='', help='text for the report header')
args = ap.parse_args()

if args.json:
    proj = json.load(open(args.json))
else:
    entries = [{'name': 'appsscript', 'type': 'json',
                'source': open(os.path.join(args.dir, 'appsscript.json')).read()}]
    for path in sorted(glob.glob(os.path.join(args.dir, '*.gs'))):
        entries.append({'name': os.path.basename(path)[:-3], 'type': 'server_js',
                        'source': open(path).read()})
    proj = {'files': entries}

print(f'\nVERIFYING: {args.label or args.json or args.dir}')
files = {f['name']: f for f in proj['files']}
gs = sorted(n for n, f in files.items() if f['type'] == 'server_js')
code = '\n'.join(f['source'] for f in proj['files'] if f['type'] == 'server_js')
fails = []

def check(label, ok, detail=''):
    print(f'  {"PASS" if ok else "FAIL"}  {label}' + (f'   {detail}' if detail else ''))
    if not ok:
        fails.append(label)

print('\n1. TEN MODULAR .gs FILES PRESENT')
for name in EXPECTED_GS:
    check(name + '.gs', name in files)
check('exactly 10 .gs files', len(gs) == 10, f'found {len(gs)}: {gs}')

print('\n2. Code.gs REMOVED')
check('Code.gs absent', 'Code' not in files)

print('\n3. appsscript.json UNCHANGED')
mf = json.loads(files['appsscript']['source'])
for k, v in EXPECTED_MANIFEST.items():
    check(f'manifest.{k}', mf.get(k) == v, f'got {mf.get(k)!r}')
check('no extra manifest keys', set(mf) <= set(EXPECTED_MANIFEST) | {'dependencies'},
      f'got {sorted(mf)}')

print('\n4. ALL 19 FUNCTIONS EXIST EXACTLY ONCE')
found = collections.Counter(re.findall(r'^function\s+([A-Za-z0-9_]+)', code, re.M))
for fn in EXPECTED_FNS:
    check(f'{fn}', found.get(fn) == 1, f'count={found.get(fn, 0)}')
check('exactly 19 functions total', sum(found.values()) == 19 and len(found) == 19,
      f'{len(found)} distinct / {sum(found.values())} definitions')
extra = sorted(set(found) - set(EXPECTED_FNS))
check('no unexpected functions', not extra, f'extra={extra}')

print('\n5. IDS / PROPERTIES / ENDPOINTS UNCHANGED')
check('TEST IDs', sorted(set(re.findall(r"'(1[A-Za-z0-9_-]{20,})'", code))) == sorted(EXPECTED_IDS))
check('Script Properties', sorted(set(re.findall(r"getProperty\(\s*'([A-Z_]+)'", code))) == EXPECTED_PROPS)
check('endpoints', sorted(set(re.findall(r"'(https://api\.[^']*)'", code)))
      == ['https://api.pushover.net/1/messages.json', 'https://api.vapi.ai/call/'])
check('08_RealtimeAlerts still a placeholder',
      not re.search(r'^(function|const|let|var)\s', files['08_RealtimeAlerts']['source'], re.M))

summary = 'ALL CHECKS PASSED' if not fails else f'{len(fails)} FAILED: {fails}'
print('\n' + summary)

step_summary = os.environ.get('GITHUB_STEP_SUMMARY')
if step_summary:
    with open(step_summary, 'a') as fh:
        fh.write(f'\n**{args.label or "verification"}** — {summary}\n')
sys.exit(1 if fails else 0)
