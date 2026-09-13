#!/usr/bin/env python3
"""
Mint a MINIMAL-SCOPE clasp credential for EDP CLASP CI.

Why this exists
---------------
`clasp login` requests clasp's own hardcoded scope list, which includes
script.deployments and script.webapp.deploy. A CI credential that can
push does not need the ability to deploy, and the safest way to
guarantee "never deploys" is a token that is incapable of it.

This mints the token directly against a DEDICATED OAuth client,
requesting only what push/pull actually use, then writes a
.clasprc.json in the shape clasp v2 expects.

    DEFAULT SCOPE:  https://www.googleapis.com/auth/script.projects
      clasp push -> Apps Script API projects.updateContent
      clasp pull -> Apps Script API projects.getContent
    Both are covered by script.projects alone.
    Deliberately NOT requested:
      script.deployments        (create/update deployments)
      script.webapp.deploy      (publish a web app)
      drive / drive.metadata    (not needed to push source)

Run this ONCE on a machine with a browser. Nothing is uploaded and no
secret is stored anywhere except the file you choose to paste into the
GitHub Environment secret.

    python3 scripts/mint_clasp_token.py client_secret.json
    python3 scripts/mint_clasp_token.py client_secret.json --out clasprc.json
    python3 scripts/mint_clasp_token.py client_secret.json --scope-preset with-email
"""
import argparse, http.server, json, secrets, socket, sys, threading
import urllib.parse, urllib.request, webbrowser

AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
TOKEN_URL = 'https://oauth2.googleapis.com/token'

PRESETS = {
    # Everything clasp push and clasp pull actually need.
    'push-only': ['https://www.googleapis.com/auth/script.projects'],
    # Add identity if clasp v2 complains it cannot resolve the account.
    'with-email': ['https://www.googleapis.com/auth/script.projects',
                   'https://www.googleapis.com/auth/userinfo.email',
                   'openid'],
}


def load_client(path):
    blob = json.load(open(path))
    node = blob.get('installed') or blob.get('web')
    if not node:
        sys.exit('Not a Desktop-app OAuth client JSON (no "installed" key). '
                 'Create credentials of type "Desktop app".')
    return node['client_id'], node['client_secret']


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def capture_code(port, expect_state):
    box = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            box.update({k: v[0] for k, v in q.items()})
            ok = 'code' in box and box.get('state') == expect_state
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'<h2>Done. Close this tab and return to the terminal.</h2>'
                             if ok else b'<h2>Authorization failed. Check the terminal.</h2>')

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(('127.0.0.1', port), H)
    threading.Thread(target=srv.handle_request, daemon=True).start()
    return srv, box


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('client_secret_json')
    ap.add_argument('--out', default='clasprc.json')
    ap.add_argument('--scope-preset', choices=sorted(PRESETS), default='push-only')
    args = ap.parse_args()

    client_id, client_secret = load_client(args.client_secret_json)
    scopes = PRESETS[args.scope_preset]
    port = free_port()
    redirect = f'http://127.0.0.1:{port}'
    state = secrets.token_urlsafe(16)

    url = AUTH_URL + '?' + urllib.parse.urlencode({
        'client_id': client_id,
        'redirect_uri': redirect,
        'response_type': 'code',
        'scope': ' '.join(scopes),
        'access_type': 'offline',
        'prompt': 'consent',          # force a refresh_token every time
        'state': state,
    })

    print('\nRequesting ONLY these scopes:')
    for s in scopes:
        print('   ' + s)
    print('\nThe Google consent screen is authoritative — read what it lists.')
    print('If the app is unverified you will see a warning; as the project')
    print('owner, choose Advanced -> Go to (app) to continue.\n')
    print('Opening browser. If it does not open, paste this URL:\n\n' + url + '\n')

    srv, box = capture_code(port, state)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    while 'code' not in box and 'error' not in box:
        threading.Event().wait(0.3)

    if 'error' in box:
        sys.exit('Authorization failed: ' + box['error'])
    if box.get('state') != state:
        sys.exit('State mismatch — aborting.')

    body = urllib.parse.urlencode({
        'code': box['code'], 'client_id': client_id, 'client_secret': client_secret,
        'redirect_uri': redirect, 'grant_type': 'authorization_code',
    }).encode()
    req = urllib.request.Request(
        TOKEN_URL, body, {'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req) as r:
        tok = json.loads(r.read())

    if 'refresh_token' not in tok:
        sys.exit('No refresh_token returned. Revoke prior access at '
                 'https://myaccount.google.com/permissions and retry.')

    granted = tok.get('scope', '')
    print('\nGRANTED SCOPES (verify these are what you expect):')
    for s in granted.split():
        print('   ' + s)
    for forbidden in ('script.deployments', 'script.webapp.deploy'):
        if forbidden in granted:
            print(f'\n  WARNING: {forbidden} was granted. This token CAN deploy.')

    clasprc = {
        'token': {
            'access_token': tok['access_token'],
            'refresh_token': tok['refresh_token'],
            'scope': granted,
            'token_type': tok.get('token_type', 'Bearer'),
            'expiry_date': 0,
        },
        'oauth2ClientSettings': {
            'clientId': client_id,
            'clientSecret': client_secret,
            'redirectUri': 'http://localhost',
        },
        'isLocalCreds': False,
    }
    if 'id_token' in tok:
        clasprc['token']['id_token'] = tok['id_token']

    with open(args.out, 'w') as fh:
        json.dump(clasprc, fh, indent=2)
    print(f'\nWrote {args.out}')
    print('Paste its ENTIRE contents into the CLASPRC_JSON secret, then delete')
    print('this file and the client_secret JSON. Never commit either.')


if __name__ == '__main__':
    main()
