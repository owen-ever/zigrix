# CLI Specification

> Note: repository root is now the Node/TypeScript implementation path. The previous Python CLI lives under `legacy-python/` for reference/parity migration only.

## Design goals
- predictable command groups
- low surprise text UX
- strict `--json` support for automation
- project-local state by default
- recoverable mutation flows

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
├─ config
│  ├─ validate
│  ├─ get [path]
│  ├─ schema [path]
│  ├─ set <path> --value <jsonOrString>
│  ├─ diff <path>
│  └─ reset --path <path> --yes
├─ reset
│  ├─ config [--path <path>] --yes
│  └─ state --yes
├─ agent
│  ├─ list
│  ├─ add --id --role --runtime [--label] [--include] [--disabled]
│  ├─ remove <agentId>
│  ├─ include <agentId>
│  ├─ exclude <agentId>
│  ├─ enable <agentId>
│  ├─ disable <agentId>
│  └─ set-role <agentId> --role <role>
├─ rule
│  ├─ list
│  ├─ get <path>
│  ├─ validate
│  ├─ render <templateKind> --context <json>
│  ├─ set <path> --value <jsonOrString>
│  ├─ diff <path>
│  └─ reset --path <path> --yes
├─ template
│  ├─ list
│  ├─ get <name>
│  ├─ set <name> --body <body> [--format] [--version] [--placeholders]
│  ├─ diff <name>
│  ├─ reset <name> --yes
│  └─ render <name> --context <json>
├─ index-rebuild
├─ task
│  ├─ create --title --description [--scale] [--required-agent]
│  ├─ list
│  ├─ status <task_id>
│  ├─ events [task_id]
│  ├─ progress --task-id --actor --message [--unit-id] [--work-package]
│  ├─ stale [--hours] [--apply] [--reason]
│  ├─ start <task_id>
│  ├─ finalize <task_id>
│  └─ report <task_id>
├─ worker
│  ├─ prepare --task-id --agent-id --description [--constraints] [--unit-id] [--work-package] [--dod]
│  ├─ register --task-id --agent-id --session-key [--run-id] [--session-id] [--unit-id] [--work-package] [--reason]
│  └─ complete --task-id --agent-id --session-key --run-id [--result] [--session-id] [--unit-id] [--work-package]
├─ evidence
│  ├─ collect --task-id --agent-id [--run-id] [--transcript] [--summary] [--tool-result] [--notes]
│  └─ merge --task-id [--required-agent] [--require-qa]
├─ report
│  └─ render --task-id [--record-events]
└─ pipeline
   └─ run --title --description [--scale] [--required-agent] [--evidence-summary] [--require-qa] [--auto-report] [--record-feedback]
```

## Implemented commands

### `zigrix init`
Creates `.zigrix/` runtime directories in the target project and writes default config when needed.

### `zigrix doctor`
Inspects Node version, config presence, write access, state directory, and OpenClaw readiness.

### `zigrix config set/diff/reset`
Allows safe config mutation and default-based recovery. Reset requires `--yes`.

### `zigrix reset config`
Restores a config subtree from `defaultConfig`. Useful when rules/templates are accidentally removed or corrupted.

### `zigrix reset state`
Deletes and recreates `.zigrix/` runtime state, then rebuilds the index. This is a recoverability tool, not a config mutation tool.

### `zigrix rule set/diff/reset`
Edits policy paths under `rules.*`, shows drift from defaults, and can restore defaults.

### `zigrix template set/diff/reset/render`
Allows direct editing and recovery of built-in templates while keeping schema validation on write.

### Task / worker / evidence / report / pipeline
These commands now cover the current local orchestration parity surface used by the Python prototype.

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
