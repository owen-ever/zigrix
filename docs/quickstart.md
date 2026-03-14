# Quickstart

## Goal
Get from fresh checkout to the first successful Zigrix run in a few minutes.

## Prerequisites
- Node.js 22+
- npm 10+
- macOS or Linux

## 1) Install from source checkout
```bash
./install.sh
```

## 2) Check environment
```bash
zigrix doctor
```

## 3) Initialize a demo project
```bash
mkdir -p .scratch/zigrix-demo
zigrix init --yes --project-root .scratch/zigrix-demo
```

## 4) Create a task
```bash
zigrix task create \
  --title "First task" \
  --description "Verify local orchestration flow" \
  --required-agent qa-zig \
  --project-root .scratch/zigrix-demo \
  --json
```

## 5) Collect evidence and render a report
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

## 6) Recover from mistakes
Reset one template back to default:
```bash
zigrix template reset workerPrompt --yes --project-root .scratch/zigrix-demo
```

Reset runtime state only:
```bash
zigrix reset state --yes --project-root .scratch/zigrix-demo
```

## Next reads
- `docs/concepts.md`
- `docs/runtime-flow.md`
- `docs/state-layout.md`
- `docs/troubleshooting.md`
