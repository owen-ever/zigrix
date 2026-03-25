---
name: zigrix-task-status
version: 0.1.0
description: Inspect Zigrix task records and state transitions.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix task status --help"
---

# zigrix task status

Use this to inspect one task or list tasks.

```bash
zigrix task list --json
zigrix task status TASK-20260313-001 --json
zigrix task events TASK-20260313-001 --json
zigrix task progress --task-id TASK-20260313-001 --actor my-orchestrator --message "진행 상황 요약" --json
zigrix task stale --hours 24 --json
zigrix task start TASK-20260313-001
zigrix task finalize TASK-20260313-001
zigrix task report TASK-20260313-001
```

Treat status transitions as explicit lifecycle events.
