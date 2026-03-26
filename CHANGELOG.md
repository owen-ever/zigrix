# Changelog

All notable changes to Zigrix will be documented in this file.

## [0.1.0-alpha.10] — 2026-03-20

### Fixed
- `zigrix task finalize` now defaults to auto-report (`--no-auto-report` to opt out), fixing DONE_PENDING_REPORT stuck state
- Worker prompt template now includes evidence collect step after unit completion, preventing orchestrator from proxy-generating worker evidence
- `zigrix onboard` discovers OpenClaw binary path and persists it to config, resolving dashboard "OpenClaw 연동 필요" in non-login shells

## [Unreleased]

### Breaking Changes
- **Global state model**: Zigrix now uses fixed global state under `~/.zigrix/` instead of per-project `.zigrix/`. Tasks are not project-bound.
- **`zigrix init` deprecated**: Use `zigrix onboard` instead. `init` remains as compatibility command.

### Added
- `zigrix onboard` — primary human entrypoint: creates `~/.zigrix/`, detects OpenClaw, imports agents (interactive checkbox with space-to-toggle), seeds rules, stabilizes PATH (creates symlink if needed), auto-registers skill packs into `~/.openclaw/skills/`
- `zigrix dashboard` — starts bundled Next.js standalone dashboard in foreground mode (default port `3838`, `--port <n>` override)
- `zigrix configure` — section-targeted reconfiguration (agents, rules, workspace, path, skills)
- `zigrix task dispatch` — full orchestration dispatch with work packages, execution units, selection hints, and boot prompt generation
- `zigrix task finalize` — evidence merge, execution unit completeness check, auto-close completed units, optional auto-report
- Task sidecar storage model: `<taskId>.meta.json` (machine) + `<taskId>.md` (human)
- Task ID format: `DEV-YYYYMMDD-NNN` (supports `TEST-` and legacy `TASK-` prefixes)
- Legacy event normalization: `timestamp` → `ts`, top-level `agentId`/`reason` → `payload`
- `@inquirer/prompts` checkbox for interactive agent selection during onboard
- `workspace.projectsBaseDir` config field for new project base directory
- `paths.rulesDir` config field for rule file storage
- Dependency: `@inquirer/prompts` (interactive terminal prompts)

### Changed
- Dropped the alpha suffix for the next release line and moved Zigrix to plain pre-`1.0.0` semver (`0.1.0`)
- Promoted the Node/TypeScript implementation to the repository root
- Removed the previous legacy prototype and aligned the repo to a single Node/TypeScript implementation path
- Switched installer, CI, release workflow, and contributor guidance to Node-first defaults
- All documentation updated from per-project `.zigrix/` to global `~/.zigrix/` model
- Release smoke script updated for onboard/global-base CLI surface
- Dashboard packaging moved to bundled `dist/dashboard` runtime for global installs (`zigrix dashboard` executes prebuilt `server.js`)
- CI/Release workflows now run `npm run build:dashboard` before `npm pack`
- `install.sh` now includes `npm run build:dashboard` so source installs can run dashboard immediately
- Documentation aligned with current dashboard behavior (implemented, foreground model, default port 3838)
- `package.json` `files` now includes `skills/` for npm distribution
- Skill packs updated to reference global state model

### Added (from initial Node migration)
- Agent registry and orchestration membership commands
- Registry validation that blocks unknown participants/excluded members
- Rule/template commands with validation, render, diff, and reset
- Template placeholder validation and render support
- Node parity migration for task/worker/evidence/report/pipeline/index-rebuild commands
- Doctor diagnostics plus safe reset flows for config/template/state recovery
- Config/rule/template mutation surface (`set` / `diff` / `reset`)
- Runtime consistency verification via `zigrix state check`
- Manual npm publish runbook, SUPPORT doc, and one-command `publish:check` gate

## [0.1.0-alpha.8] - 2026-03-17

### Fixed
- Hardened first-run dashboard setup access policy for the dashboard first-run flow.
- Tightened setup guardrails to allow only safe first-run/private-network initialization paths.

### Release
- Published `zigrix@0.1.0-alpha.8` to npm.
- Published `v0.1.0-alpha.8` GitHub release with release notes.

## [0.1.0a0] - 2026-03-13

### Added
- Initial public-facing repository structure
- `pyproject.toml` package metadata
- Working CLI foundation with:
  - `zigrix version`
  - `zigrix doctor`
  - `zigrix init`
  - `zigrix task create/list/status/events/progress/stale/start/finalize/report`
  - `zigrix worker prepare/register/complete`
  - `zigrix evidence collect/merge`
  - `zigrix report render`
  - `zigrix pipeline run`
  - `zigrix index-rebuild`
- Global runtime state layout under `~/.zigrix/`
- Source-checkout installer `install.sh`
- Initial OpenClaw skill pack skeleton
- CI and release workflow drafts
- Product, architecture, support, and CLI specification docs
