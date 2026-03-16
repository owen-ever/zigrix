# Architecture

## Layers

### 1. CLI layer
- parses args
- formats text / JSON output
- maps commands to core functions

### 2. Core state layer
- resolves portable paths
- manages `~/.zigrix/` global runtime state
- persists tasks (sidecar model: `.meta.json` + `.md`), prompts, evidence, and index files
- appends events to `tasks.jsonl`
- renders user-facing reports from merged evidence
- detects stale in-progress tasks for recovery

### 3. Integration layer
- OpenClaw-aware but optional
- PATH stabilization and skill-pack auto-registration during onboard
- worker/evidence lifecycle bridging without hard dependency on OpenClaw internals
- `configure` for section-targeted reconfiguration

## Runtime state model

Global runtime state:

```text
~/.zigrix/
├─ zigrix.config.json
├─ tasks/
│  ├─ <taskId>.meta.json    # machine-readable metadata
│  └─ <taskId>.md           # human-readable spec
├─ prompts/
├─ evidence/
├─ rules/                   # seeded from orchestration/rules/
├─ runs/
├─ tasks.jsonl              # append-only event log
└─ index.json               # derived projection (rebuildable)
```

## Why global
- Zigrix manages multiple projects in parallel — tasks are NOT project-bound
- A single task may span multiple project directories
- Global state avoids scattering `.zigrix/` across unrelated repos
- `meta.json` records `projectDir` per task when relevant

## Future boundary
The existing `orchestration/scripts/*.py` are the migration source. Zigrix CLI replaces them:
- `dev_dispatch.py` → `zigrix task dispatch`
- `dev_finalize.py` → `zigrix task finalize`
- Worker scripts → `zigrix worker prepare/register/complete`
