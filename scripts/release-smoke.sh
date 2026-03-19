#!/usr/bin/env bash
set -euo pipefail

echo "=== Zigrix release smoke test ==="

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

export ZIGRIX_HOME="$TMP_DIR/.zigrix"

echo "1. version"
node dist/index.js --version

echo "2. onboard"
node dist/index.js onboard --yes --json >/dev/null

echo "3. config validate"
node dist/index.js config validate --base-dir "$ZIGRIX_HOME" --json

echo "4. task dispatch"
TASK_RAW="$(node dist/index.js task dispatch --title "Smoke task" --description "Release smoke" --scale normal --project-dir "$TMP_DIR/project" --base-dir "$ZIGRIX_HOME" --json)"
TASK_ID="$(echo "$TASK_RAW" | node -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).taskId))")"
echo "  taskId=$TASK_ID"

echo "5. evidence collect"
node dist/index.js evidence collect --task-id "$TASK_ID" --agent-id qa-zig --summary "smoke passed" --base-dir "$ZIGRIX_HOME" --json

echo "6. evidence merge"
node dist/index.js evidence merge --task-id "$TASK_ID" --require-qa --base-dir "$ZIGRIX_HOME" --json

echo "7. report render"
node dist/index.js report render --task-id "$TASK_ID" --base-dir "$ZIGRIX_HOME" --json

echo "8. agent add"
node dist/index.js agent add --id smoke-agent --role qa --runtime test --include --base-dir "$ZIGRIX_HOME" --json

echo "9. rule validate"
node dist/index.js rule validate --base-dir "$ZIGRIX_HOME" --json

echo "10. configure (path section)"
node dist/index.js configure --section path --yes --json >/dev/null

echo "11. workflow run"
node dist/index.js run examples/hello-workflow.json --base-dir "$ZIGRIX_HOME" --json

echo "12. npm pack dry-run (files check)"
PACK_LIST="$(npm pack --dry-run --json 2>/dev/null | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const arr = JSON.parse(chunks.join(''));
  const files = arr[0].files.map(f => f.path);
  console.log(files.join('\n'));
});
" 2>/dev/null || npm pack --dry-run 2>&1)"
echo "$PACK_LIST" | grep -q "dist/dashboard/server.js" || { echo "❌ dist/dashboard/server.js not found in pack"; exit 1; }
echo "  ✅ dist/dashboard/server.js found in pack"

echo ""
echo "=== All smoke tests passed ==="