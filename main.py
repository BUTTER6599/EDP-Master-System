"""EDP Make Ready - FastAPI app, all routes and session handling."""

import os
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

import auth
import sheets
import drive

app = FastAPI(title="EDP Make Ready")

SESSION_SECRET = os.environ.get("SESSION_SECRET", "edp-dev-only-replace-in-railway")
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    max_age=60 * 60 * 12,
    same_site="lax",
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


STAGE_ORDER = {
    "RECEIVED": 0, "DIAGNOSTIC": 1, "REPAIR": 2, "WAITING_PARTS": 3,
    "TROUBLESHOOTING": 4, "CLEAN": 5, "FINAL_TEST": 6, "TECH_APPROVED": 7,
    "FLOOR_READY": 8, "SCRAP": 9,
}

STAGE_OPTIONS = list(STAGE_ORDER.keys())


def _require_login(request: Request):
    if not auth.current_user(request):
        return RedirectResponse(url="/login", status_code=302)
    return None


def _days_held(start_date: str) -> int:
    if not start_date:
        return 0
    try:
        d = datetime.strptime(str(start_date)[:10], "%Y-%m-%d").date()
        return (datetime.now().date() - d).days
    except Exception:
        return 0


# ------------------- AUTH ROUTES -------------------

@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, error: Optional[str] = None):
    return templates.TemplateResponse(
        "login.html", {"request": request, "error": error}
    )


@app.post("/login")
def login_submit(request: Request, pin: str = Form(...)):
    user = auth.verify_pin(pin)
    if not user:
        return RedirectResponse(url="/login?error=Invalid+PIN", status_code=302)
    request.session["user"] = user
    return RedirectResponse(url="/", status_code=302)


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/login", status_code=302)


# ------------------- QUEUE -------------------

@app.get("/", response_class=HTMLResponse)
def queue(request: Request, q: Optional[str] = None, created: Optional[str] = None):
    redirect = _require_login(request)
    if redirect:
        return redirect
    user = auth.current_user(request)
    try:
        tickets = sheets.get_all_tickets()
    except Exception as e:
        return templates.TemplateResponse(
            "queue.html",
            {"request": request, "user": user, "tickets": [],
             "q": q or "", "error": "Sheet error: " + str(e), "created": created},
        )
    out = []
    qlow = (q or "").lower().strip()
    for t in tickets:
        t["days_held"] = _days_held(t.get("StartDate", ""))
        if qlow:
            blob = " ".join(
                str(t.get(k, "")) for k in
                ("Brand", "Model", "ItemID", "Notes", "AssignedTo")
            ).lower()
            if qlow not in blob:
                continue
        out.append(t)
    out.sort(key=lambda x: STAGE_ORDER.get((x.get("Stage") or "").upper(), 99))
    return templates.TemplateResponse(
        "queue.html",
        {"request": request, "user": user, "tickets": out,
         "q": q or "", "error": None, "created": created},
    )


# ------------------- TICKET DETAIL -------------------

@app.get("/ticket/{item_id}", response_class=HTMLResponse)
def ticket_detail(request: Request, item_id: str):
    redirect = _require_login(request)
    if redirect:
        return redirect
    user = auth.current_user(request)
    t = sheets.get_ticket(item_id)
    if not t:
        raise HTTPException(404, "Ticket not found")
    photos = [p.strip() for p in (t.get("RepairPhotos") or "").split(",") if p.strip()]
    t["days_held"] = _days_held(t.get("StartDate", ""))
    return templates.TemplateResponse(
        "ticket.html",
        {"request": request, "user": user, "ticket": t,
         "photos": photos, "stage_options": STAGE_OPTIONS},
    )


@app.post("/ticket/{item_id}/edit")
def ticket_edit(
    request: Request, item_id: str,
    stage: str = Form(""), tech_notes: str = Form(""),
):
    redirect = _require_login(request)
    if redirect:
        return redirect
    updates = {}
    if stage:
        updates["Stage"] = stage
    updates["RepairNotes"] = tech_notes
    sheets.update_ticket(item_id, updates)
    return RedirectResponse(url="/ticket/" + item_id, status_code=302)


# ------------------- NEW INTAKE -------------------

@app.get("/new", response_class=HTMLResponse)
def new_ticket_page(request: Request):
    redirect = _require_login(request)
    if redirect:
        return redirect
    user = auth.current_user(request)
    return templates.TemplateResponse(
        "new.html", {"request": request, "user": user}
    )


@app.post("/new")
async def new_ticket_submit(request: Request):
    redirect = _require_login(request)
    if redirect:
        return redirect
    user = auth.current_user(request)
    form = await request.form()

    ticket_type = (form.get("ticket_type") or "").strip().upper()
    if ticket_type not in ("INVENTORY", "SERVICE", "PARTS"):
        return RedirectResponse(url="/new?error=Pick+ticket+type", status_code=302)

    # Upload photos
    photo_urls = []
    for i in range(1, 11):
        upload = None
        cam = form.get("photo_" + str(i) + "_cam")
        lib = form.get("photo_" + str(i) + "_lib")
        if cam and getattr(cam, "filename", ""):
            upload = cam
        elif lib and getattr(lib, "filename", ""):
            upload = lib
        if upload:
            data = await upload.read()
            if not data:
                continue
            ts = int(datetime.now().timestamp())
            safe_name = "mr_" + str(ts) + "_p" + str(i) + "_" + (upload.filename or "photo.jpg").replace(" ", "_")
            try:
                url = drive.upload_photo(
                    data, safe_name, upload.content_type or "image/jpeg"
                )
                photo_urls.append(url)
            except Exception as e:
                print("[drive] upload failed slot " + str(i) + ": " + str(e))

    # Pull form values
    brand = (form.get("brand") or "").strip()
    model = (form.get("model") or "").strip()
    serial = (form.get("serial") or "").strip()
    problem = (form.get("problem") or "").strip()
    tech_notes = (form.get("tech_notes") or "").strip()
    vendor = (form.get("vendor") or "").strip()
    customer_name = (form.get("customer_name") or "").strip()
    purchase_price = (form.get("purchase_price") or "").strip()

    # Build RepairNotes from problem + tech notes
    repair_parts = []
    if problem:
        repair_parts.append("Problem: " + problem)
    if tech_notes:
        repair_parts.append("Tech Notes: " + tech_notes)
    repair_notes = "\n".join(repair_parts)

    # Build Notes from vendor + customer (service) + purchase price (owner)
    notes_parts = []
    if vendor:
        notes_parts.append("Vendor: " + vendor)
    if ticket_type == "SERVICE" and customer_name:
        notes_parts.append("Customer: " + customer_name)
    if user.get("role") == "owner" and purchase_price:
        notes_parts.append("Purchase: $" + purchase_price)
    notes = " | ".join(notes_parts)

    fields = {
        "Type": ticket_type,
        "Brand": brand,
        "Model": model,
        "Serial": serial,
        "Stage": "RECEIVED",
        "CleanDone": "",
        "CleanPhotos": "",
        "RepairDone": "",
        "RepairPhotos": ",".join(photo_urls),
        "RepairNotes": repair_notes,
        "PaintDone": "",
        "PaintPhotos": "",
        "FinalTestDone": "",
        "FinalTestPhotos": "",
        "AssignedTo": "",
        "StartDate": datetime.now().strftime("%Y-%m-%d"),
        "CompletedDate": "",
        "ApprovedBy": "",
        "ApprovedDate": "",
        "Notes": notes,
    }

    try:
        sheets.create_ticket(fields)
    except Exception as e:
        return RedirectResponse(url="/new?error=Save+failed:+" + str(e), status_code=302)

    return RedirectResponse(url="/?created=1", status_code=302)


# ------------------- HEALTH -------------------

@app.get("/healthz")
def healthz():
    return {"ok": True}
