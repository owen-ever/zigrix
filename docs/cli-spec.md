# CLI Specification

## Design goals
- predictable command groups
- low surprise text UX
- strict `--json` support for automation
- project-local state by default

## Global flags

- `--json` — emit machine-readable JSON
- `--project-root <path>` — operate on a specific project root
- `--version` — print version and exit

## Command tree

```text
zigrix
├─ init
├─ doctor
├─ version
├─ index-rebuild
├─ task
│  ├─ create --title --description [--scale] [--required-agent]
│  ├─ list
│  ├─ status <task_id>
│  ├─ events [task_id]
│  ├─ start <task_id>
│  ├─ finalize <task_id>
│  └─ report <task_id>
├─ worker
│  ├─ prepare --task-id --agent-id --description [--constraints] [--unit-id] [--work-package] [--dod]
│  ├─ register --task-id --agent-id --session-key [--run-id] [--session-id] [--unit-id] [--work-package] [--reason]
│  └─ complete --task-id --agent-id --session-key --run-id [--result] [--session-id] [--unit-id] [--work-package]
└─ evidence
   ├─ collect --task-id --agent-id [--run-id] [--transcript] [--summary] [--tool-result] [--notes]
   └─ merge --task-id [--required-agent] [--require-qa]
```

## Implemented foundation commands

### `zigrix init`
Creates `.zigrix/` runtime directories in the target project.

Text output:
- `Initialized Zigrix state at <path>`

JSON output shape:
```json
{
  "ok": true,
  "projectRoot": "/path/to/project",
  "projectState": "/path/to/project/.zigrix"
}
```

### `zigrix doctor`
Inspects Python, paths, OpenClaw presence, and basic readiness.

Exit codes:
- `0` ready
- `1` warnings/blockers present

### `zigrix task create`
Creates a task JSON file under `.zigrix/tasks/` and appends a ledger event.

Required flags:
- `--title`
- `--description`

Optional flags:
- `--scale simple|normal|risky|large`
- `--required-agent <agent>` (repeatable)

### `zigrix task list`
Lists task records from `.zigrix/tasks/`.

### `zigrix task status <task_id>`
Prints one task.

### `zigrix task events [task_id]`
Prints append-only ledger events, optionally filtered to one task.

### `zigrix task start|finalize|report <task_id>`
Applies a status transition.

### `zigrix worker prepare`
Generates a worker prompt and stores it under `.zigrix/prompts/`.

### `zigrix worker register`
Persists worker dispatch/session metadata into the task record.

### `zigrix worker complete`
Marks worker result and reports whether evidence is still missing.

### `zigrix evidence collect`
Stores one agent's evidence under `.zigrix/evidence/<taskId>/`.
Supports transcript JSONL extraction or explicit summary/tool results.

### `zigrix evidence merge`
Builds `_merged.json` for a task and reports completeness against required agents.

## Planned next-wave commands
- `zigrix task stale`
- `zigrix release doctor`
- `zigrix skill install`

These are intentionally deferred until the current orchestration surface is hardened.

## Output rules
- human mode: concise, outcome-first
- `--json`: valid JSON only on stdout
- stderr: reserved for actionable warnings/errors

## Exit code policy
- `0` success
- `1` runtime or readiness failure
- `2` config error
- `3` validation error
- `4` not found
- `5` integration error

## Breaking change rule
After alpha foundation freeze, changes to command names, required flags, or JSON keys must be called out explicitly in `CHANGELOG.md`.
