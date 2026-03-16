# CLI Specification

> Note: repository root is now the Node/TypeScript implementation path. The previous Python CLI lives under `legacy-python/` for reference/parity migration only.

## Design goals
- predictable command groups
- low surprise text UX
- strict `--json` support for automation
- project-local state by default
- recoverable mutation flows
- clear split between human onboarding and agent operations

## Product-direction command model
The intended public flow is:

```text
install
  -> zigrix onboard
  -> done
```

Advanced / exceptional flows:
- `zigrix configure`
- `zigrix reset`

Meaning:
- the human operator should usually only install Zigrix and run `zigrix onboard`
- after onboarding, OpenClaw agents should use the low-level operational commands
- `configure` and `reset` are maintenance/recovery entrypoints, not the main happy path

## Current alpha command tree

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
├─ state
│  └─ check
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

## Planned migration direction
- `zigrix onboard` becomes the primary human-facing entrypoint after install
- `zigrix configure` becomes the advanced reconfiguration entrypoint
- `zigrix reset` remains the recovery entrypoint
- `zigrix init` should eventually become a deprecated alias or an internal compatibility bridge
- low-level groups (`config`, `agent`, `rule`, `template`, `task`, `worker`, `evidence`, `report`, `pipeline`) remain available for agents and advanced operators

## Global flags
- `--json` — emit machine-readable JSON
- `--project-root <path>` — operate on a specific project root
- `--version` — print version and exit

## Implemented commands

### `zigrix init`
Creates `.zigrix/` runtime directories in the target project and writes default config when needed.
Current alpha setup still depends on it, but it is not the intended long-term primary onboarding verb.

### `zigrix doctor`
Inspects Node version, config presence, write access, state directory, and partial OpenClaw readiness.
Future onboarding work should expand it into a stronger readiness checker.

### `zigrix config set/diff/reset`
Allows safe config mutation and default-based recovery. Reset requires `--yes`.
These are primarily advanced/operator or agent-facing surfaces.

### `zigrix reset config`
Restores a config subtree from `defaultConfig`. Useful when rules/templates are accidentally removed or corrupted.

### `zigrix reset state`
Deletes and recreates `.zigrix/` runtime state, then rebuilds the index. This is a recoverability tool, not a first-run config tool.

### `zigrix state check`
Verifies task/evidence/merged-state consistency so release smoke and operators can detect drift before it becomes a user-facing problem.

### `zigrix rule set/diff/reset`
Edits policy paths under `rules.*`, shows drift from defaults, and can restore defaults.

### `zigrix template set/diff/reset/render`
Allows direct editing and recovery of built-in templates while keeping schema validation on write.

### Task / worker / evidence / report / pipeline
These commands cover the local orchestration surface and are primarily intended for agent-driven usage after onboarding.

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
