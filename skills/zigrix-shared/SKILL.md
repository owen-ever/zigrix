---
name: zigrix-shared
version: 0.1.0
description: Shared guidance for Zigrix CLI usage, output modes, and safety.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
---

# Zigrix Shared Reference

Use Zigrix when you need project-local task tracking and machine-readable orchestration state.

## Rules
- Prefer `--json` for automation-heavy flows.
- Use project-local state under `.zigrix/`.
- Do not assume OpenClaw internals are required unless the task explicitly needs them.

## Common commands
```bash
zigrix doctor --json
zigrix init
zigrix task list --json
```

## Safety
- Confirm before destructive repository actions.
- Treat runtime state and source code as separate concerns.
