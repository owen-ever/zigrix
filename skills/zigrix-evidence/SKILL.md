---
name: zigrix-evidence
version: 0.2.0
description: Collect and merge task evidence in Zigrix.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix evidence --help"
---

# zigrix evidence

Use evidence commands to persist verification outputs and merge completion state.

```bash
zigrix evidence collect --task-id DEV-20260316-001 --agent-id qa-zig --summary "QA passed" --json
zigrix evidence merge --task-id DEV-20260316-001 --require-qa --json
```

Evidence files are stored under `~/.zigrix/evidence/<taskId>/`.
