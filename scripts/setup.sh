#!/usr/bin/env bash
# Sets up the Canairy software (bridge + dashboard) on Mac/Linux.
# Safe to re-run. Usage: ./scripts/setup.sh [--skip-tests]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_TESTS=1
for arg in "$@"; do
  case "$arg" in
    --skip-tests) RUN_TESTS=0 ;;
    -h|--help) sed -n '2,3p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$1"; }
fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

# --- Check prerequisites -----------------------------------------------------
step "Checking prerequisites"

PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 \
     && "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    PYTHON="$candidate"
    break
  fi
done
[ -n "$PYTHON" ] || fail "Python 3.10 or newer not found. Install it from https://www.python.org/downloads/"
echo "Python: $($PYTHON --version)"

command -v node >/dev/null 2>&1 || fail "Node.js 18 or newer not found. Install it from https://nodejs.org/"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js 18 or newer required, found $(node -v). Install it from https://nodejs.org/"
command -v npm >/dev/null 2>&1 || fail "npm not found. It normally comes with Node.js: https://nodejs.org/"
echo "Node:   $(node -v), npm $(npm -v)"

# --- Serial port access (Linux only) -----------------------------------------
# Opening /dev/ttyACM0 or /dev/ttyUSB0 needs the "dialout" group (Arch: "uucp").
# This only matters for a real Arduino, so warn instead of failing.
if [ "$(uname -s)" = "Linux" ] && ! id -nG | tr ' ' '\n' | grep -qxE 'dialout|uucp'; then
  step "Note: Arduino serial access"
  echo "Your user isn't in the 'dialout' group, so the bridge can't open an Arduino's serial port."
  echo "Not needed for simulated workers. For a real Arduino run:"
  echo "  sudo usermod -aG dialout \$USER   (Arch: uucp), then log out and back in"
fi

# --- Bridge ------------------------------------------------------------------
step "Setting up the bridge (Python virtual environment)"
cd "$ROOT/bridge"
# A half-created venv (e.g. python3-venv missing) has no pip, so treat that as "not created".
if [ -d .venv ] && ! .venv/bin/python -m pip --version >/dev/null 2>&1; then
  echo "Existing virtual environment is broken, recreating it"
  rm -rf .venv
fi
if [ ! -d .venv ]; then
  if ! "$PYTHON" -m venv .venv; then
    rm -rf .venv
    fail "Could not create a virtual environment. On Debian/Ubuntu try: sudo apt install python3-venv"
  fi
else
  echo "Virtual environment already exists, reusing it"
fi
.venv/bin/python -m pip install --quiet --disable-pip-version-check -r requirements.txt
echo "Bridge dependencies installed"

# --- Dashboard ---------------------------------------------------------------
step "Setting up the dashboard (npm packages)"
cd "$ROOT/canairy-dashboard"
npm ci --no-audit --no-fund

# --- Tests -------------------------------------------------------------------
if [ "$RUN_TESTS" -eq 1 ]; then
  step "Running tests"
  (cd "$ROOT/bridge" && .venv/bin/python -m unittest)
  (cd "$ROOT/canairy-dashboard" && CI=true npm test)
fi

cat <<MSG

Setup complete. To run Canairy (two terminals):

  1) cd bridge && source .venv/bin/activate && python bridge.py --no-serial
  2) cd canairy-dashboard && npm start

Then open http://localhost:3000
MSG
