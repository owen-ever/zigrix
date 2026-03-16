# Quickstart

## Goal
Get from a fresh checkout to a Zigrix environment that OpenClaw agents can use.

## Canonical target flow
```text
install
  -> zigrix onboard
  -> done
```

After onboarding, day-to-day Zigrix usage belongs to OpenClaw agents.

## Prerequisites
- Node.js 22+
- npm 10+
- macOS or Linux

## 1) Install from source
```bash
./install.sh
```

## 2) Onboard
```bash
zigrix onboard --yes
```

This:
- Creates `~/.zigrix/` with default config and directories
- Detects OpenClaw and imports agents from `openclaw.json`
- Seeds rule files from `orchestration/rules/`
- Ensures `zigrix` is reachable from PATH (creates symlink if needed)
- Registers zigrix skill packs into `~/.openclaw/skills/`

## 3) Check environment
```bash
zigrix doctor
```

## 3.5) Reconfigure (optional)
```bash
# Re-import agents, re-register skills, etc.
zigrix configure --yes

# Or target specific sections
zigrix configure --section agents
zigrix configure --section skills
zigrix configure --section workspace --projects-base-dir ~/my-projects
```

## 4) Dispatch a task (agent usage)
```bash
zigrix task dispatch \
  --title "First task" \
  --description "Verify orchestration flow" \
  --scale simple \
  --json
```

This returns a `proZigPrompt` for spawning the orchestrator agent.

## 5) Low-level task flow (agent usage)
```bash
# Create a task
zigrix task create \
  --title "Manual task" \
  --description "Test direct flow" \
  --required-agent qa-zig \
  --json

# Collect evidence
zigrix evidence collect \
  --task-id DEV-YYYYMMDD-001 \
  --agent-id qa-zig \
  --summary "Smoke passed"

# Merge and report
zigrix evidence merge \
  --task-id DEV-YYYYMMDD-001 \
  --require-qa

zigrix report render \
  --task-id DEV-YYYYMMDD-001
```

## 6) Finalize a task (agent usage)
```bash
zigrix task finalize DEV-YYYYMMDD-001 --auto-report --json
```

## Recovery
Reset one template:
```bash
zigrix template reset workerPrompt --yes
```

Reset all runtime state:
```bash
zigrix reset state --yes
```

## Next reads
- `docs/product-decisions.md`
- `docs/cli-spec.md`
- `docs/onboarding-ownership-model.md`
