---
name: zigrix-shared
version: 0.3.0
description: Shared guidance for Zigrix CLI usage, output modes, path resolution, and safety.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
---

# Zigrix Shared Reference

Use Zigrix for multi-project parallel task orchestration with file-backed, inspectable state.

## Rules
- Prefer `--json` for automation-heavy flows.
- Tasks are NOT project-bound — one Zigrix instance manages tasks across projects.
- Do not assume OpenClaw internals are required unless the task explicitly needs them.

## Path Resolution Contract

Bare symbolic keys like `paths.tasksDir` or `workspace.projectsBaseDir` are **not** auto-expanded variables. They are config key names. To get the actual absolute path, use the following priority:

1. **CLI JSON output fields** (preferred — already resolved)
   - `zigrix task dispatch --json` → `specPath`, `metaPath`, `promptPath`, `projectDir`
   - `zigrix task create --json` → `specPath`, `metaPath`, `projectDir`
   - `zigrix task status <taskId> --json` → `specPath`, `metaPath`, `projectDir`
   - `zigrix worker prepare --json` → `promptPath`, `specPath`, `metaPath`, `projectDir`
   - `zigrix evidence collect --json` → `evidencePath`
   - `zigrix evidence merge --json` → `mergedPath`

2. **`zigrix path` commands** (for runtime directory lookup)
   ```bash
   zigrix path get tasksDir --json        # → {"canonicalKey":"paths.tasksDir","value":"/abs/..."}
   zigrix path get evidenceDir --json
   zigrix path get workspace.projectsBaseDir --json
   zigrix path list --json                # → all resolved paths
   ```

3. **`zigrix doctor --json`** (for environment overview including paths)

4. **Last resort:** Read `~/.zigrix/zigrix.config.json` and resolve `paths.*` manually.

## Common commands
```bash
zigrix doctor --json
zigrix task list --json
zigrix task dispatch --title "..." --description "..." --scale normal --json
zigrix task finalize <taskId> --auto-report --json
zigrix path list --json
```

## Safety
- Confirm before destructive actions.
- Treat runtime state and source code as separate concerns.
