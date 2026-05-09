"""Google Drive photo upload."""

import os
import io

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

import creds

SCOPES = ["https://www.googleapis.com/auth/drive"]
FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "")

_service = None


def _get_service():
    global _service
    if _service is None:
        info = creds.load_credentials_info()
        sa_creds = Credentials.from_service_account_info(info, scopes=SCOPES)
        _service = build("drive", "v3", credentials=sa_creds, cache_discovery=False)
    return _service


def upload_photo(file_bytes, filename, mimetype="image/jpeg"):
    """Upload bytes to Drive folder. Returns shareable URL."""
    if not FOLDER_ID:
        raise RuntimeError("DRIVE_FOLDER_ID not set")
    service = _get_service()
    metadata = {"name": filename, "parents": [FOLDER_ID]}
    media = MediaIoBaseUpload(
        io.BytesIO(file_bytes), mimetype=mimetype or "image/jpeg", resumable=False
    )
    f = service.files().create(
        body=metadata, media_body=media, fields="id, webViewLink"
    ).execute()
    file_id = f["id"]
    try:
        service.permissions().create(
            fileId=file_id,
            body={"role": "reader", "type": "anyone"},
        ).execute()
    except Exception:
        pass
    return f"https://drive.google.com/uc?id={file_id}"
