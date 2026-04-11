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
- Creates `paths.baseDir` from `zigrix.config.json` with default directories
- Detects OpenClaw and imports agents from `openclaw.json`
- Seeds bundled rule templates from `rules/defaults/` into `paths.rulesDir`
- Ensures `zigrix` is reachable from PATH (creates symlink if needed)
- Registers bundled OpenClaw skills into `~/.openclaw/skills/` (including `oz` and the `zigrix-*` packs)

## 3) Check environment
```bash
zigrix doctor
```

If OpenClaw is present, onboarding should leave these chat-side entrypoints available:
- `/oz fix the onboarding bug`
- `이거 맡겨`
- `delegate this through Zigrix`

## 3.5) Reconfigure (optional)
```bash
# Re-import agents, re-register skills, etc.
zigrix configure --yes

# Or target specific sections
zigrix configure --section agents
zigrix configure --section skills
zigrix configure --section workspace --projects-base-dir ~/my-projects
```

## 3.6) Dashboard check (optional)
```bash
zigrix dashboard             # default port: 3838
# zigrix dashboard --port 3939
# stop with Ctrl+C
```

## 4) Dispatch a task (agent usage)
```bash
zigrix task dispatch \
  --title "First task" \
  --description "Verify orchestration flow" \
  --scale simple \
  --json
```

This returns an `orchestratorPrompt` for spawning the orchestrator agent.

## 5) Low-level task flow (agent usage)
```bash
# Dispatch a task (role-based selection)
zigrix task dispatch \
  --title "Manual task" \
  --description "Test direct flow" \
  --scale normal \
  --json

# Collect evidence (example: QA agent)
zigrix evidence collect \
  --task-id DEV-YYYYMMDD-001 \
  --agent-id <qaAgentId> \
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
