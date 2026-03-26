# Architecture

## Layers

### 1. CLI layer
- parses args
- formats text / JSON output
- maps commands to core functions

### 2. Core state layer
- resolves portable paths
- manages global runtime state from `zigrix.config.json` (`paths.*`)
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
~/.zigrix/zigrix.config.json        # config location
<paths.baseDir>/
├─ tasks/
│  ├─ <taskId>.meta.json    # machine-readable metadata
│  └─ <taskId>.md           # human-readable spec
├─ prompts/
├─ evidence/
├─ rules/                   # seeded from bundled rules/defaults/
├─ runs/
├─ tasks.jsonl              # append-only event log
└─ index.json               # derived projection (rebuildable)
```

## Why global
- Zigrix manages multiple projects in parallel — tasks are NOT project-bound
- A single task may span multiple project directories
- Global state avoids scattering `.zigrix/` across unrelated repos
- `meta.json` records `projectDir` per task when relevant

## CLI chain
- `zigrix task dispatch` — creates task with full orchestration metadata
- `zigrix task finalize` — merges evidence, checks units, auto-reports
- `zigrix worker prepare/register/complete` — worker lifecycle management
rker prepare/register/complete` — worker lifecycle management
