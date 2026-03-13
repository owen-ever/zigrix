---
name: zigrix-task-create
version: 0.1.0
description: Create a new Zigrix task with title, description, and scale.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix task create --help"
---

# zigrix task create

Create a task in project-local `.zigrix/tasks/`.

```bash
zigrix task create \
  --title "Implement installer" \
  --description "Create a safe app-owned venv installer" \
  --scale normal \
  --json
```

Prefer `--json` when another agent or script will consume the result.
