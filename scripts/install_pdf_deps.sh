#!/usr/bin/env bash
# Install WeasyPrint + native libs needed by /api/export/report/<run>.pdf.
#
# Closes QOBLIB overhaul gap #10. The Python pdf path raises
# ``services.report_generator.PdfDependencyMissingError`` with OS-specific
# install instructions; this script automates those instructions for the
# common Linux/macOS environments so a fresh deploy or new dev box can get
# PDF export working in one command.
#
# Usage:
#   chmod +x scripts/install_pdf_deps.sh
#   ./scripts/install_pdf_deps.sh             # detect OS, install, verify
#   ./scripts/install_pdf_deps.sh --check     # only verify; no install
#   ./scripts/install_pdf_deps.sh --no-pip    # native libs only; skip weasyprint pip
#   ./scripts/install_pdf_deps.sh --dry-run   # print commands, run nothing
#
# Env:
#   PYTHON  Python interpreter to install weasyprint into
#           (default: ``python3`` on PATH)
#   PIP     pip command (default: ``$PYTHON -m pip``)
#
# Exit codes:
#   0 — WeasyPrint imports successfully after install
#   1 — could not detect OS / unsupported package manager
#   2 — install command failed
#   3 — install completed but verification failed
#
# Notes:
#   * Uses sudo automatically when not root and the package manager needs it.
#     Run as root in containers (Dockerfile.fly already does this with apt).
#   * Idempotent: package managers skip already-installed packages.
#   * On WSL (Microsoft kernel), Ubuntu/Debian path is selected.

set -euo pipefail

# ── argument parsing ────────────────────────────────────────────────────────
DO_CHECK_ONLY=false
DO_PIP=true
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --check)   DO_CHECK_ONLY=true ;;
    --no-pip)  DO_PIP=false ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

PYTHON="${PYTHON:-python3}"
PIP_CMD="${PIP:-$PYTHON -m pip}"

# ── helpers ─────────────────────────────────────────────────────────────────
log() { printf "\033[1;36m[install_pdf_deps]\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m[install_pdf_deps] ERROR:\033[0m %s\n" "$*" >&2; exit "${2:-1}"; }

run_cmd() {
  if $DRY_RUN; then
    printf "  (dry-run) %s\n" "$*"
  else
    eval "$@"
  fi
}

# Pick sudo prefix when needed.
SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

verify_weasyprint() {
  log "Verifying WeasyPrint import..."
  if "$PYTHON" -c "import weasyprint; print('weasyprint', weasyprint.__version__)" 2>&1; then
    return 0
  else
    return 3
  fi
}

# ── early exit: --check ─────────────────────────────────────────────────────
if $DO_CHECK_ONLY; then
  if verify_weasyprint; then
    log "PDF export is available."
    exit 0
  else
    log "PDF export is NOT available — run without --check to install."
    exit 3
  fi
fi

# ── OS / package manager detection ──────────────────────────────────────────
OS_KIND=""
PKG_MGR=""

case "$(uname -s)" in
  Linux*)
    if [ -r /etc/os-release ]; then
      # shellcheck disable=SC1091
      . /etc/os-release
      OS_KIND="${ID:-linux}"
      OS_LIKE="${ID_LIKE:-}"
    fi
    if command -v apt-get >/dev/null 2>&1 && { [ "$OS_KIND" = "ubuntu" ] || [ "$OS_KIND" = "debian" ] || [[ "$OS_LIKE" == *debian* ]]; }; then
      PKG_MGR="apt"
    elif command -v dnf >/dev/null 2>&1; then
      PKG_MGR="dnf"
    elif command -v yum >/dev/null 2>&1; then
      PKG_MGR="yum"
    elif command -v pacman >/dev/null 2>&1; then
      PKG_MGR="pacman"
    elif command -v apk >/dev/null 2>&1; then
      PKG_MGR="apk"
    fi
    ;;
  Darwin*)
    OS_KIND="macos"
    if command -v brew >/dev/null 2>&1; then
      PKG_MGR="brew"
    else
      die "Homebrew not found. Install from https://brew.sh first." 1
    fi
    ;;
  *)
    die "Unsupported OS: $(uname -s). Add a case in scripts/install_pdf_deps.sh." 1
    ;;
esac

if [ -z "$PKG_MGR" ]; then
  die "Could not detect a supported package manager on $OS_KIND." 1
fi

log "Detected OS=$OS_KIND  package_manager=$PKG_MGR  python=$PYTHON"

# ── install native libs ─────────────────────────────────────────────────────
case "$PKG_MGR" in
  apt)
    # Mirrors deploy/docker/Dockerfile.fly. ``libgdk-pixbuf-2.0-0`` is the
    # newer name; ``libgdk-pixbuf2.0-0`` is the legacy alias still on
    # Ubuntu 22.04 LTS. Ship both — apt skips the missing one without error
    # *only* if we list them separately, so try the new name first.
    log "Installing native libs via apt..."
    run_cmd "$SUDO apt-get update"
    run_cmd "$SUDO apt-get install -y --no-install-recommends \
      libpango-1.0-0 \
      libpangoft2-1.0-0 \
      libpangocairo-1.0-0 \
      libcairo2 \
      libharfbuzz0b \
      libgdk-pixbuf-2.0-0 \
      libffi8 \
      shared-mime-info \
      fonts-liberation || $SUDO apt-get install -y --no-install-recommends libgdk-pixbuf2.0-0"
    ;;
  dnf|yum)
    log "Installing native libs via $PKG_MGR..."
    run_cmd "$SUDO $PKG_MGR install -y \
      pango \
      cairo \
      harfbuzz \
      gdk-pixbuf2 \
      libffi \
      shared-mime-info \
      liberation-sans-fonts"
    ;;
  pacman)
    log "Installing native libs via pacman..."
    run_cmd "$SUDO pacman -Sy --noconfirm \
      pango \
      cairo \
      harfbuzz \
      gdk-pixbuf2 \
      libffi \
      shared-mime-info \
      ttf-liberation"
    ;;
  apk)
    log "Installing native libs via apk (Alpine)..."
    run_cmd "$SUDO apk add --no-cache \
      pango \
      cairo \
      harfbuzz \
      gdk-pixbuf \
      libffi \
      shared-mime-info \
      ttf-liberation"
    ;;
  brew)
    log "Installing native libs via brew..."
    # On macOS WeasyPrint resolves Pango/Cairo through dyld; ``brew install
    # pango`` pulls cairo, glib, harfbuzz, gdk-pixbuf as dependencies.
    run_cmd "brew install pango libffi"
    ;;
esac

# ── install Python wheel ────────────────────────────────────────────────────
if $DO_PIP; then
  log "Installing weasyprint into $PYTHON..."
  run_cmd "$PIP_CMD install --upgrade weasyprint"
fi

# ── verify ──────────────────────────────────────────────────────────────────
if $DRY_RUN; then
  log "Dry run complete — no commands were executed. Re-run without --dry-run."
  exit 0
fi

if verify_weasyprint; then
  log "PDF export is now available. /api/reports/capabilities should report pdf_export=true."
  exit 0
else
  cat <<EOF >&2

WeasyPrint installed but the import probe failed. Common causes:
  * The shell's ``$PYTHON`` is a different interpreter than the API runs in.
    Re-run with PYTHON=/path/to/api/venv/bin/python ./scripts/install_pdf_deps.sh
  * On macOS, the dyld linker may need a fresh shell; open a new terminal
    and re-run the verification:  python3 -c 'import weasyprint'
  * On WSL Ubuntu, install ``shared-mime-info`` if not picked up above and
    re-run.

Full reason from /api/reports/capabilities will appear in the API logs.
EOF
  exit 3
fi
