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


def _days_held(date_received: str) -> int:
    if not date_received:
        return 0
    try:
        d = datetime.strptime(str(date_received)[:10], "%Y-%m-%d").date()
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
             "q": q or "", "error": f"Sheet error: {e}", "created": created},
        )
    out = []
    qlow = (q or "").lower().strip()
    for t in tickets:
        t["days_held"] = _days_held(t.get("date_received", ""))
        if qlow:
            blob = " ".join(
                str(t.get(k, "")) for k in
                ("brand", "model", "customer_name", "ticket_id", "category", "vendor")
            ).lower()
            if qlow not in blob:
                continue
        out.append(t)
    out.sort(key=lambda x: STAGE_ORDER.get((x.get("stage") or "").upper(), 99))
    return templates.TemplateResponse(
        "queue.html",
        {"request": request, "user": user, "tickets": out,
         "q": q or "", "error": None, "created": created},
    )


# ------------------- TICKET DETAIL -------------------

@app.get("/ticket/{ticket_id}", response_class=HTMLResponse)
def ticket_detail(request: Request, ticket_id: str):
    redirect = _require_login(request)
    if redirect:
        return redirect
    user = auth.current_user(request)
    t = sheets.get_ticket(ticket_id)
    if not t:
        raise HTTPException(404, "Ticket not found")
    photos = [p.strip() for p in (t.get("photos") or "").split(",") if p.strip()]
    t["days_held"] = _days_held(t.get("date_received", ""))
    return templates.TemplateResponse(
        "ticket.html",
        {"request": request, "user": user, "ticket": t,
         "photos": photos, "stage_options": STAGE_OPTIONS},
    )


@app.post("/ticket/{ticket_id}/edit")
def ticket_edit(
    request: Request, ticket_id: str,
    stage: str = Form(""), tech_notes: str = Form(""),
):
    redirect = _require_login(request)
    if redirect:
        return redirect
    updates = {}
    if stage:
        updates["stage"] = stage
        updates["status"] = stage
    updates["tech_notes"] = tech_notes
    sheets.update_ticket(ticket_id, updates)
    return RedirectResponse(url=f"/ticket/{ticket_id}", status_code=302)


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

    photo_urls = []
    for i in range(1, 11):
        upload = None
        cam = form.get(f"photo_{i}_cam")
        lib = form.get(f"photo_{i}_lib")
        if cam and getattr(cam, "filename", "") and getattr(cam, "filename"):
            upload = cam
        elif lib and getattr(lib, "filename", ""):
            upload = lib
        if upload:
            data = await upload.read()
            if not data:
                continue
            ts = int(datetime.now().timestamp())
            safe_name = f"mr_{ts}_p{i}_" + (upload.filename or "photo.jpg").replace(" ", "_")
            try:
                url = drive.upload_photo(
                    data, safe_name, upload.content_type or "image/jpeg"
                )
                photo_urls.append(url)
            except Exception as e:
                print(f"[drive] upload failed slot {i}: {e}")

    fields = {
        "ticket_type": ticket_type,
        "brand": (form.get("brand") or "").strip(),
        "category": (form.get("category") or "").strip(),
        "fuel_type": (form.get("fuel_type") or "").strip(),
        "model": (form.get("model") or "").strip(),
        "serial": (form.get("serial") or "").strip(),
        "condition": (form.get("condition") or "").strip(),
        "customer_name": (form.get("customer_name") or "").strip() if ticket_type == "SERVICE" else "",
        "customer_phone": (form.get("customer_phone") or "").strip() if ticket_type == "SERVICE" else "",
        "vendor": (form.get("vendor") or "").strip(),
        "problem": (form.get("problem") or "").strip(),
        "tech_notes": (form.get("tech_notes") or "").strip(),
        "photos": ",".join(photo_urls),
    }

    if user.get("role") == "owner":
        fields["purchase_price"] = (form.get("purchase_price") or "").strip()
        fields["target_price"] = (form.get("target_price") or "").strip()

    try:
        sheets.create_ticket(fields)
    except Exception as e:
        return RedirectResponse(url=f"/new?error=Save+failed:+{e}", status_code=302)

    return RedirectResponse(url="/?created=1", status_code=302)


# ------------------- HEALTH -------------------

@app.get("/healthz")
def healthz():
    return {"ok": True}
