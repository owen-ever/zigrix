---
name: zigrix-task-create
version: 0.3.0
description: Create a new Zigrix task with title, description, and scale.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix task create --help"
---

# zigrix task create

Create a task record. The JSON output includes resolved absolute paths (`specPath`, `metaPath`, `projectDir`).

For full orchestration metadata (work packages, execution units, boot prompt), use `zigrix task dispatch` instead.

```bash
# Low-level task creation
zigrix task create \
  --title "Implement installer" \
  --description "Create a safe app-owned venv installer" \
  --scale normal \
  --json

# Full orchestration dispatch (preferred for agent workflows)
zigrix task dispatch \
  --title "Implement installer" \
  --description "Create a safe app-owned venv installer" \
  --scale normal \
  --json
```

Key JSON output fields for downstream use:
- `taskId` — the generated task identifier
- `specPath` — absolute path to the task spec markdown
- `metaPath` — absolute path to the task metadata JSON
- `projectDir` — resolved project directory (from `--project-dir` or config default)

Prefer `--json` when another agent or script will consume the result.
