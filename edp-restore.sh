#!/usr/bin/env bash
# edp-restore.sh — restore clasp + 11 EDP Apps Script clones in a fresh sandbox.
# Idempotent: safe to run multiple times. Skips work that's already done.
#
# Usage:
#   /home/user/edp-restore.sh                 (run from anywhere)
#   bash /home/user/EDP-Master-System/edp-restore.sh
#
# After a sandbox reset, the file at /home/user/edp-restore.sh is gone but
# this canonical copy lives in the EDP-Master-System repo, so:
#   bash /home/user/EDP-Master-System/edp-restore.sh
# will rebuild the symlink and run the restore.

set -u
# Note: no `set -e` — we want clone failures to be reported, not fatal.

PROJECTS_ROOT="/home/user/edp-projects"
CLASPRC_LOCATIONS=("$HOME/.clasprc.json" "/root/.clasprc.json")
SYMLINK_PATH="/home/user/edp-restore.sh"
SELF_PATH="$(readlink -f "${BASH_SOURCE[0]}")"

PROJECT_NAMES=(
  floor-push
  customer-webapp
  customer-webapp-v2
  make-ready
  register
  kiosk
  owner-dashboard
  operations-portal
  accounting-master
  accounting-portal
  inventory-logic
)
PROJECT_IDS=(
  1z3E43VHyNi9mmM7AwZ2LkS8Gw39E97USBF6CxkIbFrg1MF_THVuDXxM9
  1JnWWDma-OUZzP0A7T8OrZY03iyn2JdMo9WniJn-XTis7MG-6x8pfLAtF
  1Xqr0EDau9souN7p-t08ygJkVtjyA-Tf3rIImIayyBKjUbtvnL0tFqbOZ
  1_O16sqOUQk0UZauIU_8J0x0oPhb_73gDJXF36u12IydWAJSu5a2YwupE
  1VeOcKP11K7B_BxnFKnjXLmB9jQA-j8wq-jEzpOH7M1gXt28NFTDhEe5P
  1k3qXZU4Dnb42QHggds-BFmgd3iA1Za-rhWM7apzeRKIA-l9qgOtBBhqp
  1ynuBg47UXLnXmqDJwjXiXLbMM6jlzKfW_5YjOwtISTPtTNS07o764Mee
  1UkGU0hU8BvTCAMLbsucd0QFMuS5GSkUMvOvExM171QSa_7ZjA0yHnnbT
  1U2UinE-GkxBu5RnnOtzIFTEB9j9avIFBXHbjbRg-u_zSzBJwNkRKXt28
  1T4_fH5c1ezWGmwm6aHv1lHh07FbjFWatIodhZFHgG_K7gaepQbEg4_2c
  10T9RuCJshxu8-p4KDDJ6YHymseLHpOkkU7kbfYNCXjcrzzosD1Vuid5M
)

CLASP_INSTALLED=no
AUTHED=no
declare -A CLONE_STATUS

echo "================================================================"
echo " EDP RESTORE — clasp + 11 GAS project clones"
echo " Started: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================"

# ---------- 0/5: convenience symlink at /home/user/edp-restore.sh ----------
echo ""
echo "==> [0/5] ensuring symlink at $SYMLINK_PATH ..."
if [ -L "$SYMLINK_PATH" ] && [ "$(readlink "$SYMLINK_PATH")" = "$SELF_PATH" ]; then
  echo "    symlink already correct"
elif [ -e "$SYMLINK_PATH" ] && [ "$SELF_PATH" != "$SYMLINK_PATH" ]; then
  echo "    $SYMLINK_PATH exists and is not the expected symlink — leaving alone"
else
  if [ "$SELF_PATH" != "$SYMLINK_PATH" ]; then
    ln -sf "$SELF_PATH" "$SYMLINK_PATH" && echo "    symlink created -> $SELF_PATH" \
      || echo "    !! could not create symlink"
  fi
fi

# ---------- 1/5: install clasp ----------
echo ""
echo "==> [1/5] checking clasp..."
if command -v clasp >/dev/null 2>&1; then
  echo "    clasp present: $(clasp --version 2>&1 | head -1)"
  CLASP_INSTALLED=yes
else
  echo "    clasp not found — installing via npm..."
  if npm install -g @google/clasp 2>&1 | tail -3; then
    if command -v clasp >/dev/null 2>&1; then
      CLASP_INSTALLED=yes
      echo "    installed: $(clasp --version 2>&1 | head -1)"
    else
      echo "    !! npm reported success but clasp still not on PATH"
    fi
  else
    echo "    !! npm install failed"
  fi
fi

# ---------- 2/5: auth ----------
echo ""
echo "==> [2/5] checking authentication..."
AUTH_FILE=""
for f in "${CLASPRC_LOCATIONS[@]}"; do
  if [ -s "$f" ]; then AUTH_FILE="$f"; break; fi
done

if [ -n "$AUTH_FILE" ] && [ "$CLASP_INSTALLED" = "yes" ]; then
  if clasp show-authorized-user >/dev/null 2>&1; then
    AUTHED=yes
    who=$(clasp show-authorized-user 2>&1 | head -1)
    echo "    auth OK ($AUTH_FILE)"
    echo "    $who"
  else
    echo "    auth file exists at $AUTH_FILE but API call failed — re-login required"
  fi
else
  echo "    no usable auth file found"
fi

if [ "$AUTHED" = "no" ] && [ "$CLASP_INSTALLED" = "yes" ]; then
  echo ""
  echo "    >>> starting interactive OAuth login (PTY-wrapped)"
  echo "    >>> 1. Visit the URL clasp prints below in your phone/desktop browser"
  echo "    >>> 2. Sign in as the correct Google account"
  echo "    >>> 3. After the redirect to http://localhost:8888/?... fails to load,"
  echo "    >>>    copy the FULL redirect URL from your browser address bar"
  echo "    >>> 4. Paste it into THIS terminal and press Enter"
  echo ""
  PTY_SCRIPT=$(mktemp /tmp/clasp_login_XXXXXX.py)
  cat > "$PTY_SCRIPT" <<'PYEOF'
import pty, os, sys, time, select, re
pid, fd = pty.fork()
if pid == 0:
    os.execvp("clasp", ["clasp", "login", "--no-localhost"])
url_captured = False
buf = ""
deadline = time.time() + 1800
while time.time() < deadline:
    try:
        r, _, _ = select.select([fd, sys.stdin], [], [], 1.0)
        if fd in r:
            try: data = os.read(fd, 4096).decode("utf-8", errors="replace")
            except OSError: break
            if not data: break
            buf += data
            sys.stdout.write(data); sys.stdout.flush()
            if not url_captured and re.search(r"https://accounts\.google\.com/", buf):
                url_captured = True
        if sys.stdin in r and url_captured:
            line = sys.stdin.readline()
            if line:
                os.write(fd, line.encode())
        try:
            wpid, _ = os.waitpid(pid, os.WNOHANG)
            if wpid != 0: break
        except ChildProcessError: break
    except OSError: break
PYEOF
  python3 "$PTY_SCRIPT"
  rm -f "$PTY_SCRIPT"

  # re-check
  for f in "${CLASPRC_LOCATIONS[@]}"; do
    if [ -s "$f" ]; then AUTH_FILE="$f"; break; fi
  done
  if clasp show-authorized-user >/dev/null 2>&1; then
    AUTHED=yes
    echo "    auth OK after login: $(clasp show-authorized-user 2>&1 | head -1)"
  else
    echo "    !! still not authenticated after login attempt"
  fi
fi

# ---------- 3/5: folder structure ----------
echo ""
echo "==> [3/5] ensuring folder structure under $PROJECTS_ROOT ..."
mkdir -p "$PROJECTS_ROOT"
for name in "${PROJECT_NAMES[@]}"; do
  mkdir -p "$PROJECTS_ROOT/$name"
done
echo "    11 folders ready"

# ---------- 4/5: clone ----------
echo ""
echo "==> [4/5] cloning projects (skips any already cloned)..."
for i in "${!PROJECT_NAMES[@]}"; do
  name="${PROJECT_NAMES[$i]}"
  sid="${PROJECT_IDS[$i]}"
  dir="$PROJECTS_ROOT/$name"
  if [ -f "$dir/.clasp.json" ]; then
    echo "    [$name] already cloned — skipping"
    CLONE_STATUS[$name]=already
    continue
  fi
  if [ "$AUTHED" != "yes" ]; then
    echo "    [$name] skipped (no auth)"
    CLONE_STATUS[$name]=no-auth
    continue
  fi
  echo "    [$name] cloning $sid ..."
  log=$(mktemp /tmp/clone-${name}-XXXX.log)
  if (cd "$dir" && clasp clone "$sid" --rootDir . > "$log" 2>&1); then
    files=$(ls -1 "$dir" | wc -l | tr -d ' ')
    echo "    [$name] OK ($files files)"
    CLONE_STATUS[$name]=ok
  else
    echo "    [$name] FAILED — log tail:"
    tail -3 "$log" | sed 's/^/        /'
    CLONE_STATUS[$name]=failed
  fi
done

# ---------- 5/5: summary ----------
echo ""
echo "================================================================"
echo " SUMMARY"
echo "================================================================"
if [ "$CLASP_INSTALLED" = "yes" ]; then echo "✅ clasp installed: yes"; else echo "❌ clasp installed: no"; fi
if [ "$AUTHED" = "yes" ];          then echo "✅ authenticated:  yes"; else echo "❌ authenticated:  no"; fi
echo ""
echo "Project clone status:"
for name in "${PROJECT_NAMES[@]}"; do
  st="${CLONE_STATUS[$name]:-unknown}"
  case "$st" in
    ok)      icon="✅" ; msg="cloned" ;;
    already) icon="✅" ; msg="already cloned" ;;
    failed)  icon="❌" ; msg="FAILED" ;;
    no-auth) icon="⚠️ "; msg="skipped (no auth)" ;;
    *)       icon="❓" ; msg="unknown" ;;
  esac
  printf "  %s %-22s %s\n" "$icon" "$name" "$msg"
done
echo "================================================================"
echo " Finished: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================"
