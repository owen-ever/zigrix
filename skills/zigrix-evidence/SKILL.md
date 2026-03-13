---
name: zigrix-evidence
version: 0.1.0
description: Collect and merge task evidence in Zigrix project state.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix evidence --help"
---

# zigrix evidence

Use evidence commands to persist verification outputs and merge completion state.

```bash
zigrix evidence collect --task-id TASK-20260313-001 --agent-id qa-zig --summary "QA passed" --json
zigrix evidence merge --task-id TASK-20260313-001 --require-qa --json
```

Evidence files are stored under `.zigrix/evidence/<taskId>/`.
