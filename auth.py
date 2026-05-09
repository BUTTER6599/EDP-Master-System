"""PIN verification and session helpers."""

PINS = {
    "9911": {"name": "Taylor",   "role": "owner"},
    "7864": {"name": "Yvonne",   "role": "owner"},
    "9544": {"name": "Joe",      "role": "tech"},
    "1200": {"name": "Clarence", "role": "labor"},
}


def verify_pin(pin):
    if pin is None:
        return None
    return PINS.get(str(pin).strip())


def current_user(request):
    return request.session.get("user")


def is_owner(request):
    u = current_user(request)
    return bool(u and u.get("role") == "owner")
