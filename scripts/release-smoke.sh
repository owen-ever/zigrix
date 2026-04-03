#!/usr/bin/env bash
set -euo pipefail

echo "=== Zigrix release smoke test ==="

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

export HOME="$TMP_DIR/home"
export OPENCLAW_HOME="$HOME/.openclaw"
mkdir -p "$HOME" "$OPENCLAW_HOME"
cat > "$OPENCLAW_HOME/openclaw.json" <<'EOF'
{
  "agents": {
    "list": [
      { "id": "orch-main", "name": "orch-main", "identity": { "theme": "Orchestrator Agent" } },
      { "id": "qa-main", "name": "qa-main", "identity": { "theme": "QA Agent" } }
    ]
  }
}
EOF

echo "1. version"
node dist/index.js --version

echo "2. onboard"
node dist/index.js onboard --yes --json >/dev/null

echo "3. config validate"
node dist/index.js config validate --json

echo "4. task dispatch"
TASK_RAW="$(node dist/index.js task dispatch --title "Smoke task" --description "Release smoke" --scale normal --project-dir "$TMP_DIR/project" --json)"
TASK_ID="$(echo "$TASK_RAW" | node -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).taskId))")"
QA_AGENT_ID="$(echo "$TASK_RAW" | node -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).qaAgentId || 'qa'))")"
echo "  taskId=$TASK_ID"
echo "  qaAgentId=$QA_AGENT_ID"

echo "5. evidence collect"
node dist/index.js evidence collect --task-id "$TASK_ID" --agent-id "$QA_AGENT_ID" --summary "smoke passed" --json

echo "6. evidence merge"
node dist/index.js evidence merge --task-id "$TASK_ID" --require-qa --json

echo "7. report render"
node dist/index.js report render --task-id "$TASK_ID" --json

echo "8. agent add"
node dist/index.js agent add --id smoke-agent --role qa --runtime test --include --json

echo "9. rule validate"
node dist/index.js rule validate --json

echo "10. configure (path section)"
node dist/index.js configure --section path --yes --json >/dev/null

echo "11. workflow run"
node dist/index.js run examples/hello-workflow.json --json

echo "12. npm pack dry-run (files check)"
PACK_RAW="$(npm pack --dry-run --json)"
PACK_LIST="$(printf '%s' "$PACK_RAW" | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const raw = chunks.join('');
  for (let i = raw.indexOf('['); i >= 0; i = raw.indexOf('[', i + 1)) {
    try {
      const arr = JSON.parse(raw.slice(i));
      const files = arr[0].files.map(f => f.path);
      console.log(files.join('\\n'));
      return;
    } catch {}
  }
  process.exit(1);
});
" 2>/dev/null)"
if [[ "$PACK_LIST" != *"dist/dashboard/server.js"* ]]; then
  echo "❌ dist/dashboard/server.js not found in pack"
  exit 1
fi
if [[ "$PACK_LIST" == *"dist/dashboard/node_modules/"* ]]; then
  echo "❌ dist/dashboard/node_modules should not be present in pack"
  exit 1
fi
echo "  ✅ dist/dashboard/server.js found in pack"
echo "  ✅ dist/dashboard/node_modules omitted from pack"

echo ""
echo "=== All smoke tests passed ==="