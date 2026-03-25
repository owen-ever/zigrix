# CLI Specification

> Zigrix is a multi-project parallel task orchestration CLI.
> Runtime paths come from `zigrix.config.json` (`paths.*`). Default base is `~/.zigrix` via `ZIGRIX_HOME`.

## Design goals
- predictable command groups
- low surprise text UX
- strict `--json` support for automation
- global state in `paths.baseDir` from `zigrix.config.json` (default concept: `~/.zigrix`)
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

## Current command tree

```text
zigrix
├─ onboard [--orchestrator-id <agentId>] [--yes] [--json]
├─ configure [--section <section>] [--projects-base-dir <path>] [--project-dir <path>] [--orchestrator-id <agentId>] [--yes] [--json]
├─ init (DEPRECATED → use onboard)
├─ doctor [--json]
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
│  ├─ dispatch --title --description --scale [--project-dir] [--requested-by] [--constraints]
│  ├─ create --title --description [--scale] [--required-agent] [--project-dir] [--requested-by] [--prefix]
│  ├─ list
│  ├─ status <taskId>
│  ├─ events [taskId]
│  ├─ progress --task-id --actor --message [--unit-id] [--work-package]
│  ├─ stale [--hours] [--apply] [--reason]
│  ├─ start <taskId>
│  ├─ finalize <taskId> [--auto-report] [--sec-issues] [--qa-issues]
│  └─ report <taskId>
├─ worker
│  ├─ prepare --task-id --agent-id --description [--constraints] [--unit-id] [--work-package] [--dod] [--project-dir]
│  ├─ register --task-id --agent-id --session-key [--run-id] [--session-id] [--unit-id] [--work-package] [--reason]
│  └─ complete --task-id --agent-id --session-key --run-id [--result] [--session-id] [--unit-id] [--work-package]
├─ evidence
│  ├─ collect --task-id --agent-id [--run-id] [--transcript] [--summary] [--tool-result] [--notes]
│  └─ merge --task-id [--required-agent] [--require-qa]
├─ report
│  └─ render --task-id [--record-events]
├─ pipeline
│  └─ run --title --description [--scale] [--required-agent] [--evidence-summary] [--require-qa] [--auto-report] [--record-feedback]
├─ run <workflowPath>
├─ inspect <runIdOrPath>
└─ dashboard [--port <n>]
```

## Key commands

### `zigrix onboard`
Creates `paths.baseDir` from `zigrix.config.json` (default `~/.zigrix`), writes default config, seeds directories, stabilizes PATH (symlink if needed), registers skill packs into OpenClaw, and initializes role-based agent/orchestrator defaults. Primary human entrypoint.

### `zigrix configure`
Reconfigures one or more sections after initial onboarding. Sections: `agents`, `rules`, `workspace`, `path`, `skills`. Supports `--section <name>` for targeted reconfiguration. Use `--projects-base-dir <path>` to set the workspace base directory and `--orchestrator-id <agentId>` to override orchestrator ownership.

### `zigrix task dispatch`
Replaces `dev_dispatch.py`. Creates task with full orchestration metadata (workPackages, executionUnits, selectionHints), resolves required/optional roles to enabled agents, generates `orchestratorPrompt` for the configured `orchestratorId`, and writes dispatch prompt file.

### `zigrix task finalize`
Replaces `dev_finalize.py`. Merges evidence, checks execution unit completeness, auto-closes completed units, optionally auto-reports. Handles sec/qa issue flags.

### `zigrix task create`
Lower-level manual task creation without dispatch-time role resolution. Use `task dispatch` for the standard orchestration flow.

### `zigrix doctor`
Inspects Node version, config, base dir, rules dir, OpenClaw readiness.

### `zigrix dashboard`
Starts the bundled Next.js standalone dashboard in the foreground.
- default port: `3838`
- explicit port: `zigrix dashboard --port <n>`
- stop: `Ctrl+C`
- port conflicts fail fast with an explicit error (no auto-port hopping)

## Global flags
- `--json` — emit machine-readable JSON
- `--base-dir <path>` — override Zigrix base directory
- `--version` — print version and exit

## Task storage model
- `<taskId>.meta.json` — machine-readable metadata (source of truth)
- `<taskId>.md` — human-readable spec (auto-generated on create, editable)
- Legacy `<taskId>.json` — read with fallback for backward compat

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
