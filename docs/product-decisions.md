# Product Decisions

## Status
Accepted unless superseded here.

## D-001 Product identity
- Decision: Zigrix is a **multi-project parallel task orchestration CLI** for OpenClaw agent environments.
- Why: keeps scope focused on the real operational model: multiple tasks across different projects running in parallel, managed centrally.

## D-002 Implementation language
- Decision: the primary implementation is **Node/TypeScript at the repository root**.
- Why: that is the live product path today.
- Note: `legacy-python/` and `orchestration/scripts/*.py` are the migration source. Zigrix CLI replaces them.

## D-003 Primary distribution
- Decision: first-class distribution is **GitHub Releases + install.sh**.
- Why: lowest-friction path while the onboarding/install surface is still changing.

## D-004 Secondary distribution
- Decision: support **`npm install zigrix`** after the release and onboarding flow stabilizes.
- Why: it matches the Node implementation and the desired public install surface.

## D-005 OpenClaw integration model
- Decision: ship **pluginless skill pack** first.
- Why: keeps Zigrix as a real standalone CLI while still being directly usable by OpenClaw agents.

## D-006 Support matrix
- Decision: support **macOS and Linux first**.
- Why: strongest immediate fit for the intended operator environment.

## D-007 Runtime state layout
- Decision:
  - Global base: `~/.zigrix/` (configurable via `ZIGRIX_HOME`)
  - Tasks: `~/.zigrix/tasks/<taskId>.meta.json` + `<taskId>.md`
  - Events: `~/.zigrix/tasks.jsonl`
  - Evidence: `~/.zigrix/evidence/`
  - Rules: `~/.zigrix/rules/`
  - Index: `~/.zigrix/index.json` (derived projection)
- Why: Zigrix manages multiple projects in parallel. Tasks are NOT project-bound. A global state directory is the correct model.

## D-008 Runtime version floor
- Decision: require **Node.js 22+**.
- Why: matches the current package/runtime contract.

## D-009 Output contract
- Decision: every automation-relevant command must support `--json`.
- Why: Zigrix is meant for both humans and agents, but especially for agent automation.

## D-010 Installer behavior
- Decision: installer must be idempotent, version-aware, and non-destructive by default.
- Why: CLI trust is installation trust.

## D-011 Human vs agent ownership model
- Decision: the **human operator path ends at install + `zigrix onboard`** in the common case.
- Why: Zigrix is intended to be configured once by the operator and then used day-to-day by OpenClaw agents.

## D-012 Public command-surface target
- Decision: the intended public flow is:
  - install: `npm install zigrix` or `./install.sh`
  - onboarding: `zigrix onboard`
  - advanced reconfiguration: `zigrix configure`
  - recovery: `zigrix reset`
- Why: this separates first-run UX from low-level operational commands.

## D-013 OpenClaw onboarding contract
- Decision: when OpenClaw is present, onboarding must cover:
  - gateway-visible PATH access to `zigrix`
  - Zigrix skill registration for OpenClaw
  - readiness verification after setup
- Why: install alone is not enough for agent usability in an OpenClaw environment.

## D-014 Optional workspace-context assist
- Decision: writing helper context into workspace notes (for example `TOOLS.md`) is optional and should remain an explicit/add-on path.
- Why: it helps agents, but it is not a blocker for functional Zigrix onboarding.

## D-015 License direction
- Decision: current default is **Apache-2.0**, pending dependency/license confirmation.
- Why: clearer patent posture and better enterprise comfort than MIT for this category.

## D-016 Task storage model
- Decision: tasks use a **sidecar model**: `<taskId>.meta.json` (machine data) + `<taskId>.md` (human spec).
- Why: aligns with `orchestration/MIGRATION-STRATEGY.md`. Machine data is JSON-parseable; human spec is editable markdown.
- Compatibility: legacy `<taskId>.json` files are read with fallback.

## D-017 Task ID format
- Decision: default prefix is `DEV-` (format: `DEV-YYYYMMDD-NNN`). Supports `TEST-` and legacy `TASK-` prefixes.
- Why: aligns with the orchestration convention already in production use.
