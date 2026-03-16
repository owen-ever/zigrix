---
name: zigrix-worker
version: 0.2.0
description: Prepare, register, and complete Zigrix worker runs.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix worker --help"
---

# zigrix worker

Use worker lifecycle commands to bridge agent execution and global orchestration state.

```bash
zigrix worker prepare --task-id DEV-20260316-001 --agent-id qa-zig --description "Run QA checks" --json
zigrix worker register --task-id DEV-20260316-001 --agent-id qa-zig --session-key agent:test:qa --run-id run-001 --json
zigrix worker complete --task-id DEV-20260316-001 --agent-id qa-zig --session-key agent:test:qa --run-id run-001 --json
```

These commands intentionally avoid hard-coding OpenClaw internals into the Zigrix core.
