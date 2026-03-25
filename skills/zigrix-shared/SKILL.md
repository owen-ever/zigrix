---
name: zigrix-shared
version: 0.2.0
description: Shared guidance for Zigrix CLI usage, output modes, and safety.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
---

# Zigrix Shared Reference

Use Zigrix for multi-project parallel task orchestration with file-backed, inspectable state.

## Rules
- Prefer `--json` for automation-heavy flows.
- Runtime paths are sourced from `zigrix.config.json` (`paths.*`).
- Tasks are NOT project-bound — one Zigrix instance manages tasks across projects.
- Do not assume OpenClaw internals are required unless the task explicitly needs them.

## Common commands
```bash
zigrix doctor --json
zigrix task list --json
zigrix task dispatch --title "..." --description "..." --scale normal --json
zigrix task finalize <taskId> --auto-report --json
```

## Safety
- Confirm before destructive actions.
- Treat runtime state and source code as separate concerns.
