---
name: zigrix-task-create
version: 0.2.0
description: Create a new Zigrix task with title, description, and scale.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix task create --help"
---

# zigrix task create

Create a task in `paths.tasksDir` from `zigrix.config.json`.

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

Prefer `--json` when another agent or script will consume the result.
