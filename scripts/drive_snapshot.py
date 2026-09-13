#!/usr/bin/env python3
"""
Upload a source snapshot to the EDP Google Drive backup folder.

Second, independent backup: GitHub holds history, Drive holds periodic
archives. Credentials live ONLY in GitHub encrypted Secrets and are read
from the environment here — nothing credential-bearing is ever written
into Drive, and nothing is written to disk.

Uses a DEDICATED OAuth client, separate from the clasp credential, with
the single scope https://www.googleapis.com/auth/drive.file — which
grants access only to files this app itself created. It cannot read the
rest of the Drive.

Environment:
    GDRIVE_CLIENT_ID
    GDRIVE_CLIENT_SECRET
    GDRIVE_REFRESH_TOKEN
    GDRIVE_BACKUP_FOLDER_ID   folder the app created (see docs/CLASP_CI.md)

Usage:
    python3 scripts/drive_snapshot.py <file> [--name NAME] [--keep N]
"""
import json, mimetypes, os, sys, urllib.parse, urllib.request

TOKEN_URL = 'https://oauth2.googleapis.com/token'
UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size'
FILES_URL = 'https://www.googleapis.com/drive/v3/files'


def _req(url, data=None, headers=None, method=None):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(r) as resp:
        body = resp.read()
    return json.loads(body) if body else {}


def access_token():
    missing = [k for k in ('GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET', 'GDRIVE_REFRESH_TOKEN')
               if not os.environ.get(k)]
    if missing:
        sys.exit(f'missing environment: {", ".join(missing)}')
    payload = urllib.parse.urlencode({
        'client_id': os.environ['GDRIVE_CLIENT_ID'],
        'client_secret': os.environ['GDRIVE_CLIENT_SECRET'],
        'refresh_token': os.environ['GDRIVE_REFRESH_TOKEN'],
        'grant_type': 'refresh_token',
    }).encode()
    tok = _req(TOKEN_URL, payload,
               {'Content-Type': 'application/x-www-form-urlencoded'})['access_token']
    print('::add-mask::' + tok)
    return tok


def upload(token, path, name, folder_id):
    meta = {'name': name}
    if folder_id:
        meta['parents'] = [folder_id]
    ctype = mimetypes.guess_type(name)[0] or 'application/octet-stream'
    boundary = '===edp-snapshot-boundary==='
    body = b''.join([
        f'--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'.encode(),
        json.dumps(meta).encode(), b'\r\n',
        f'--{boundary}\r\nContent-Type: {ctype}\r\n\r\n'.encode(),
        open(path, 'rb').read(), b'\r\n',
        f'--{boundary}--\r\n'.encode(),
    ])
    return _req(UPLOAD_URL, body, {
        'Authorization': f'Bearer {token}',
        'Content-Type': f'multipart/related; boundary={boundary}',
        'Content-Length': str(len(body)),
    })


def prune(token, folder_id, keep):
    """Delete the oldest app-created snapshots beyond `keep`."""
    if not folder_id or keep <= 0:
        return
    q = urllib.parse.quote(f"'{folder_id}' in parents and trashed = false")
    url = f'{FILES_URL}?q={q}&orderBy=createdTime desc&fields=files(id,name,createdTime)&pageSize=200'
    files = _req(url, headers={'Authorization': f'Bearer {token}'}).get('files', [])
    for f in files[keep:]:
        _req(f"{FILES_URL}/{f['id']}", headers={'Authorization': f'Bearer {token}'}, method='DELETE')
        print(f"pruned  {f['name']}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit(__doc__)
    path = args[0]
    name = sys.argv[sys.argv.index('--name') + 1] if '--name' in sys.argv else os.path.basename(path)
    keep = int(sys.argv[sys.argv.index('--keep') + 1]) if '--keep' in sys.argv else 0

    token = access_token()
    result = upload(token, path, name, os.environ.get('GDRIVE_BACKUP_FOLDER_ID', ''))
    print(f"uploaded  {result.get('name')}  id={result.get('id')}  bytes={result.get('size')}")
    prune(token, os.environ.get('GDRIVE_BACKUP_FOLDER_ID', ''), keep)


if __name__ == '__main__':
    main()
