---
name: zigrix-worker
version: 0.3.0
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
zigrix worker prepare --task-id DEV-20260316-001 --agent-id <workerAgentId> --description "Run role-specific checks" --json
zigrix worker register --task-id DEV-20260316-001 --agent-id <workerAgentId> --session-key agent:test:worker --run-id run-001 --json
zigrix worker complete --task-id DEV-20260316-001 --agent-id <workerAgentId> --session-key agent:test:worker --run-id run-001 --json
```

Key JSON output fields from `worker prepare`:
- `promptPath` — absolute path to the generated worker prompt file (the canonical assignment)
- `specPath` — absolute path to the task spec markdown
- `metaPath` — absolute path to the task metadata JSON
- `projectDir` — resolved project directory for the worker to operate in

Workers should treat the `promptPath` content as their authoritative assignment. Do not reconstruct task file paths from symbolic config keys.

These commands intentionally avoid hard-coding OpenClaw internals into the Zigrix core.
