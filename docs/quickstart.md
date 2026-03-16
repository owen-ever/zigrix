# Quickstart

## Goal
Get from a fresh checkout to a Zigrix environment that OpenClaw agents can actually use.

## Canonical target flow
The intended operator experience is:

```text
install
  -> zigrix onboard
  -> done
```

Meaning:
- the human operator installs Zigrix
- the human operator runs `zigrix onboard`
- after onboarding, day-to-day Zigrix usage belongs to OpenClaw agents
- `zigrix configure` and `zigrix reset` exist for maintenance/recovery, not as the main happy path

See `docs/onboarding-ownership-model.md` for the product-direction source of truth.

## Current alpha reality
The current implementation still uses `zigrix init` as the practical setup entrypoint.
That is an implementation gap, not the intended long-term UX.

## Prerequisites
- Node.js 22+
- npm 10+
- macOS or Linux

## Current alpha setup flow
### 1) Install from source checkout
```bash
./install.sh
```

### 2) Check environment
```bash
zigrix doctor
```

### 3) Initialize a demo project
```bash
mkdir -p .scratch/zigrix-demo
zigrix init --yes --project-root .scratch/zigrix-demo
```

### 4) Create a task
```bash
zigrix task create \
  --title "First task" \
  --description "Verify local orchestration flow" \
  --required-agent qa-zig \
  --project-root .scratch/zigrix-demo \
  --json
```

### 5) Collect evidence and render a report
```bash
zigrix evidence collect \
  --task-id TASK-YYYYMMDD-001 \
  --agent-id qa-zig \
  --summary "Smoke passed" \
  --project-root .scratch/zigrix-demo

zigrix evidence merge \
  --task-id TASK-YYYYMMDD-001 \
  --require-qa \
  --project-root .scratch/zigrix-demo

zigrix report render \
  --task-id TASK-YYYYMMDD-001 \
  --project-root .scratch/zigrix-demo
```

## Recovery from mistakes
Reset one template back to default:
```bash
zigrix template reset workerPrompt --yes --project-root .scratch/zigrix-demo
```

Reset runtime state only:
```bash
zigrix reset state --yes --project-root .scratch/zigrix-demo
```

## Next reads
- `docs/onboarding-ownership-model.md`
- `docs/concepts.md`
- `docs/runtime-flow.md`
- `docs/state-layout.md`
- `docs/troubleshooting.md`
