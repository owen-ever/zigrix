#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_BASE="${ZIGRIX_INSTALL_BASE:-$HOME/.local/share/zigrix}"
BIN_DIR="${ZIGRIX_BIN_DIR:-$HOME/.local/bin}"
VENV_DIR="$INSTALL_BASE/venv"
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
WITH_OPENCLAW_SKILLS=0

usage() {
  cat <<'EOF'
Usage: ./install.sh [--with-openclaw-skills]

Installs Zigrix into an app-owned virtual environment and exposes the `zigrix`
command at ~/.local/bin/zigrix by default.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --with-openclaw-skills)
      WITH_OPENCLAW_SKILLS=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

PYTHON=""
for candidate in python3.13 python3.12 python3.11 python3.10; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON="$(command -v "$candidate")"
    break
  fi
done
if [[ -z "$PYTHON" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PY_VER="$(python3 -c 'import sys; print(sys.version_info[:2])')"
    if python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
      PYTHON="$(command -v python3)"
    fi
  fi
fi
if [[ -z "$PYTHON" ]]; then
  echo "Error: Python 3.10+ is required but not found on PATH." >&2
  echo "Searched: python3.13, python3.12, python3.11, python3.10, python3" >&2
  exit 1
fi
echo "Using Python: $PYTHON ($($PYTHON --version 2>&1))"

mkdir -p "$INSTALL_BASE" "$BIN_DIR"
"$PYTHON" -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install --upgrade pip >/dev/null

if ls "$REPO_ROOT"/dist/zigrix-*.whl >/dev/null 2>&1; then
  WHEEL="$(ls -1 "$REPO_ROOT"/dist/zigrix-*.whl | head -n 1)"
  "$VENV_DIR/bin/pip" install --force-reinstall "$WHEEL"
else
  "$VENV_DIR/bin/pip" install --force-reinstall "$REPO_ROOT"
fi

ln -sfn "$VENV_DIR/bin/zigrix" "$BIN_DIR/zigrix"

if [[ "$WITH_OPENCLAW_SKILLS" == "1" ]]; then
  mkdir -p "$OPENCLAW_HOME/skills"
  for skill_dir in "$REPO_ROOT"/skills/*; do
    [[ -d "$skill_dir" ]] || continue
    skill_name="$(basename "$skill_dir")"
    ln -sfn "$skill_dir" "$OPENCLAW_HOME/skills/$skill_name"
  done
fi

cat <<EOF
Zigrix install complete.
- executable: $BIN_DIR/zigrix
- venv: $VENV_DIR

Next steps:
  zigrix doctor
  zigrix init
EOF
