"""Google Sheets read and write functions for MAKE_READY tab."""

import os
from datetime import datetime
from threading import Lock

import gspread
from google.oauth2.service_account import Credentials

import creds

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

SHEET_ID = os.environ.get("SHEET_ID", "")
TAB = "MAKE_READY"

# Actual column headers in the MAKE_READY tab, in order.
EXPECTED_COLUMNS = [
    "ItemID", "Type", "Brand", "Model", "Serial", "Stage",
    "CleanDone", "CleanPhotos",
    "RepairDone", "RepairPhotos", "RepairNotes",
    "PaintDone", "PaintPhotos",
    "FinalTestDone", "FinalTestPhotos",
    "AssignedTo", "StartDate", "CompletedDate",
    "ApprovedBy", "ApprovedDate", "Notes",
]

_lock = Lock()
_client = None
_sheet = None


def _get_creds():
    info = creds.load_credentials_info()
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


def _read_headers():
    """Return the actual header row from the sheet. If empty, seed it."""
    sheet = _get_sheet()
    headers = sheet.row_values(1)
    if not headers:
        sheet.update("A1", [EXPECTED_COLUMNS])
        return list(EXPECTED_COLUMNS)
    return headers


def get_all_tickets():
    sheet = _get_sheet()
    headers = _read_headers()
    rows = sheet.get_all_values()
    out = []
    if len(rows) < 2:
        return out
    for row in rows[1:]:
        padded = row + [""] * (len(headers) - len(row))
        d = dict(zip(headers, padded))
        if d.get("ItemID"):
            out.append(d)
    return out


def get_ticket(item_id):
    for t in get_all_tickets():
        if t.get("ItemID") == item_id:
            return t
    return None


def _next_item_id():
    """Return the next sequential ItemID for today, e.g. MR-20260509-001."""
    sheet = _get_sheet()
    today = datetime.now().strftime("%Y%m%d")
    prefix = "MR-" + today + "-"
    rows = sheet.get_all_values()
    max_n = 0
    if len(rows) > 1:
        for row in rows[1:]:
            if row and row[0].startswith(prefix):
                tail = row[0][len(prefix):]
                try:
                    n = int(tail)
                    if n > max_n:
                        max_n = n
                except ValueError:
                    pass
    return prefix + ("%03d" % (max_n + 1))


def create_ticket(fields):
    """Append a new row keyed by exact sheet column names.

    Auto-fills ItemID, Stage, StartDate if not provided.
    Returns the ItemID.
    """
    sheet = _get_sheet()
    headers = _read_headers()
    if not fields.get("ItemID"):
        fields["ItemID"] = _next_item_id()
    fields.setdefault("Stage", "RECEIVED")
    fields.setdefault("StartDate", datetime.now().strftime("%Y-%m-%d"))
    row = [str(fields.get(h, "")) for h in headers]
    sheet.append_row(row, value_input_option="USER_ENTERED")
    return fields["ItemID"]


def update_ticket(item_id, updates):
    """Update fields on the row with the given ItemID. Returns True if found."""
    sheet = _get_sheet()
    headers = _read_headers()
    rows = sheet.get_all_values()
    for i, row in enumerate(rows[1:], start=2):
        padded = row + [""] * (len(headers) - len(row))
        d = dict(zip(headers, padded))
        if d.get("ItemID") == item_id:
            new_row = list(padded)
            for k, v in updates.items():
                if k in headers:
                    new_row[headers.index(k)] = str(v)
            sheet.update("A" + str(i), [new_row], value_input_option="USER_ENTERED")
            return True
    return False
