#!/usr/bin/env bash
set -euo pipefail

echo "=== Zigrix release smoke test ==="

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "1. version"
node dist/index.js --version

echo "2. config validate"
node dist/index.js config validate --json

echo "3. init"
node dist/index.js init --yes --project-root "$TMP_DIR" --json

echo "4. task create"
TASK_RAW="$(node dist/index.js task create --title "Smoke task" --description "Release smoke" --required-agent qa-zig --project-root "$TMP_DIR" --json)"
TASK_ID="$(echo "$TASK_RAW" | node -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).taskId))")"
echo "  taskId=$TASK_ID"

echo "5. evidence collect"
node dist/index.js evidence collect --task-id "$TASK_ID" --agent-id qa-zig --summary "smoke passed" --project-root "$TMP_DIR" --json

echo "6. evidence merge"
node dist/index.js evidence merge --task-id "$TASK_ID" --require-qa --project-root "$TMP_DIR" --json

echo "7. report render"
node dist/index.js report render --task-id "$TASK_ID" --project-root "$TMP_DIR" --json

echo "8. agent add"
node dist/index.js agent add --id smoke-agent --role qa --runtime test --include --project-root "$TMP_DIR" --json

echo "9. rule validate"
node dist/index.js rule validate --project-root "$TMP_DIR" --json

echo "10. workflow run"
node dist/index.js run examples/hello-workflow.json --json

echo ""
echo "=== All smoke tests passed ==="
