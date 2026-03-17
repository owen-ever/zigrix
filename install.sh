#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
WITH_OPENCLAW_SKILLS=0

usage() {
  cat <<'EOF'
Usage: ./install.sh [--with-openclaw-skills]

Builds the Node/TypeScript Zigrix CLI from this checkout and exposes the
`zigrix` command via `npm link`.

After install, run `zigrix onboard` to complete setup.
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

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 22+ is required but not found on PATH." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required but not found on PATH." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "Error: Node.js 22+ is required. Found: $(node -v)" >&2
  exit 1
fi

cd "$REPO_ROOT"
npm install
npm run build
npm run build:dashboard
npm link

# Symlink zigrix to /usr/local/bin for non-login shell access (e.g., OpenClaw agents using exec)
ZIGRIX_LINKED="$(command -v zigrix 2>/dev/null || true)"
if [[ -n "$ZIGRIX_LINKED" ]] && [[ -w /usr/local/bin ]]; then
  ln -sfn "$ZIGRIX_LINKED" /usr/local/bin/zigrix
  echo "- /usr/local/bin/zigrix → $ZIGRIX_LINKED (non-login shell PATH)"
elif [[ -n "$ZIGRIX_LINKED" ]]; then
  echo "⚠️  /usr/local/bin is not writable. To make zigrix available in non-login shells, run:"
  echo "   sudo ln -sfn $ZIGRIX_LINKED /usr/local/bin/zigrix"
fi

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
- executable: $(command -v zigrix)
- node: $(node -v)

Next step:
  zigrix onboard

This will create ~/.zigrix, seed rule files, and register agents.
EOF
