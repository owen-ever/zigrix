---
name: zigrix-worker
version: 0.1.0
description: Prepare, register, and complete Zigrix worker runs.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix worker --help"
---

# zigrix worker

Use worker lifecycle commands to bridge agent execution and project-local orchestration state.

```bash
zigrix worker prepare --task-id TASK-20260313-001 --agent-id qa-zig --description "Run QA checks" --json
zigrix worker register --task-id TASK-20260313-001 --agent-id qa-zig --session-key agent:test:qa --run-id run-001 --json
zigrix worker complete --task-id TASK-20260313-001 --agent-id qa-zig --session-key agent:test:qa --run-id run-001 --json
```

These commands intentionally avoid hard-coding OpenClaw internals into the Zigrix core.
