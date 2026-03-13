---
name: zigrix-report
version: 0.1.0
description: Render a user-facing Zigrix completion report from merged evidence.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix report --help"
---

# zigrix report

Render a user-facing completion summary after evidence merge.

```bash
zigrix report render --task-id TASK-20260313-001 --record-events --json
```

When `--record-events` is enabled, Zigrix appends `user_report_prepared` and `feedback_requested` events.
