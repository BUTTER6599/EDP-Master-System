"""Load Google service account credentials from Railway env vars.

Tries GOOGLE_CREDENTIALS_B64 first (base64-encoded JSON, avoids Railway
JSON mangling), then falls back to GOOGLE_CREDENTIALS_JSON (raw JSON).
Standard library only.
"""

import os
import base64
import json


def load_credentials_info():
    """Return the parsed service-account JSON as a dict.

    Order:
      1. GOOGLE_CREDENTIALS_B64 - base64-encoded JSON string.
      2. GOOGLE_CREDENTIALS_JSON - raw JSON string (legacy).

    Raises RuntimeError with a clear message if neither is set.
    """
    b64 = os.environ.get("GOOGLE_CREDENTIALS_B64")
    if b64 and b64.strip():
        try:
            decoded = base64.b64decode(b64).decode("utf-8")
        except Exception as e:
            raise RuntimeError(
                "GOOGLE_CREDENTIALS_B64 set but base64 decode failed: " + str(e)
            )
        return json.loads(decoded)

    raw = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if raw and raw.strip():
        return json.loads(raw)

    raise RuntimeError(
        "No Google credentials found. Set GOOGLE_CREDENTIALS_B64 in Railway."
    )
