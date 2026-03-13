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
├─ index-rebuild
└─ task
   ├─ create --title --description [--scale]
   ├─ list
   ├─ status <task_id>
   ├─ start <task_id>
   ├─ finalize <task_id>
   └─ report <task_id>
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

### `zigrix task list`
Lists task records from `.zigrix/tasks/`.

### `zigrix task status <task_id>`
Prints one task.

### `zigrix task start|finalize|report <task_id>`
Applies a status transition.

## Planned next-wave commands
- `zigrix worker prepare`
- `zigrix worker register`
- `zigrix worker complete`
- `zigrix evidence collect`
- `zigrix evidence merge`
- `zigrix task stale`

These are intentionally excluded from the first scaffold until path/state abstractions are stable.

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
