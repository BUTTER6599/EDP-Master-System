"""Google Sheets read and write functions for MAKE_READY tab."""

import os
import json
import time
from datetime import datetime
from threading import Lock

import gspread
from google.oauth2.service_account import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

SHEET_ID = os.environ.get("SHEET_ID", "")
TAB = "MAKE_READY"

EXPECTED_COLUMNS = [
    "ticket_id", "date_received", "ticket_type", "brand", "model",
    "serial", "category", "fuel_type", "condition", "stage",
    "assigned_to", "customer_name", "customer_phone", "problem",
    "vendor", "purchase_price", "target_price", "tech_notes",
    "photos", "status",
]

_lock = Lock()
_client = None
_sheet = None


def _get_creds():
    raw = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if not raw:
        raise RuntimeError("GOOGLE_CREDENTIALS_JSON not set")
    info = json.loads(raw)
    return Credentials.from_service_account_info(info, scopes=SCOPES)


def _get_sheet():
    global _client, _sheet
    with _lock:
        if _sheet is None:
            creds = _get_creds()
            _client = gspread.authorize(creds)
            book = _client.open_by_key(SHEET_ID)
            try:
                _sheet = book.worksheet(TAB)
            except gspread.WorksheetNotFound:
                _sheet = book.add_worksheet(
                    title=TAB, rows=1000, cols=len(EXPECTED_COLUMNS)
                )
                _sheet.update("A1", [EXPECTED_COLUMNS])
        return _sheet


def _ensure_headers():
    sheet = _get_sheet()
    headers = sheet.row_values(1)
    if not headers:
        sheet.update("A1", [EXPECTED_COLUMNS])
        return list(EXPECTED_COLUMNS)
    missing = [c for c in EXPECTED_COLUMNS if c not in headers]
    if missing:
        new_headers = headers + missing
        sheet.update("A1", [new_headers])
        return new_headers
    return headers


def get_all_tickets():
    sheet = _get_sheet()
    headers = _ensure_headers()
    rows = sheet.get_all_values()
    out = []
    if len(rows) < 2:
        return out
    for row in rows[1:]:
        padded = row + [""] * (len(headers) - len(row))
        d = dict(zip(headers, padded))
        if d.get("ticket_id"):
            out.append(d)
    return out


def get_ticket(ticket_id):
    for t in get_all_tickets():
        if t.get("ticket_id") == ticket_id:
            return t
    return None


def create_ticket(fields):
    sheet = _get_sheet()
    headers = _ensure_headers()
    ticket_id = "MR-" + str(int(time.time()))
    fields["ticket_id"] = ticket_id
    fields.setdefault("date_received", datetime.now().strftime("%Y-%m-%d"))
    fields.setdefault("stage", "RECEIVED")
    fields.setdefault("status", "RECEIVED")
    row = [str(fields.get(h, "")) for h in headers]
    sheet.append_row(row, value_input_option="USER_ENTERED")
    return ticket_id


def update_ticket(ticket_id, updates):
    sheet = _get_sheet()
    headers = _ensure_headers()
    rows = sheet.get_all_values()
    for i, row in enumerate(rows[1:], start=2):
        padded = row + [""] * (len(headers) - len(row))
        d = dict(zip(headers, padded))
        if d.get("ticket_id") == ticket_id:
            new_row = list(padded)
            for k, v in updates.items():
                if k in headers:
                    new_row[headers.index(k)] = str(v)
            sheet.update(f"A{i}", [new_row], value_input_option="USER_ENTERED")
            return True
    return False
