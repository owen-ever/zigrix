# Architecture

## Layers

### 1. CLI layer
- parses args
- formats text / JSON output
- maps commands to core functions

### 2. Core state layer
- resolves portable paths
- manages `.zigrix/` project runtime state
- persists tasks, prompts, evidence, and index files
- appends events
- renders user-facing reports from merged evidence
- detects stale in-progress tasks for recovery

### 3. Integration layer
- OpenClaw-aware but optional
- skill-pack installation and usage guidance
- worker/evidence lifecycle bridging without hard dependency on OpenClaw internals
- future adapter point for richer session-aware commands

## Runtime state model

Project-local runtime state:

```text
<project>/.zigrix/
├─ tasks/
├─ prompts/
├─ evidence/
├─ tasks.jsonl
└─ index.json
```

This keeps source and runtime clearly separated.

## Why project-local first
- easier to reason about
- reproducible per repo
- avoids hidden global mutation
- maps naturally to agent working directories

## Future boundary
The existing `orchestration/` scripts are the source material for later command families, but not the final public package layout. Zigrix should wrap and absorb the useful logic, not expose raw legacy script names.
