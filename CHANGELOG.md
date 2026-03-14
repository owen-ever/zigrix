# Changelog

All notable changes to Zigrix will be documented in this file.

## [Unreleased]

### Changed
- Promoted the Node/TypeScript implementation to the repository root
- Moved the previous Python CLI into `legacy-python/` as a reference prototype
- Switched installer, CI, release workflow, and contributor guidance to Node-first defaults

### Added
- Agent registry and orchestration membership commands:
  - `zigrix agent list`
  - `zigrix agent add/remove`
  - `zigrix agent include/exclude`
  - `zigrix agent enable/disable`
  - `zigrix agent set-role`
- Registry validation that blocks unknown participants/excluded members
- Rule/template commands:
  - `zigrix rule list`
  - `zigrix rule get <path>`
  - `zigrix rule validate`
  - `zigrix rule render <templateKind> --context <json>`
- Template placeholder validation and render support for built-in templates
- Node parity migration for task/worker/evidence/report/pipeline/index-rebuild commands
- Node state/event/task persistence modules aligned with the legacy Python flow
- Release hardening: `npm pack`, smoke script, CI dry-run pack, `files` boundary, `prebuild` clean
- Doctor diagnostics plus safe reset flows for config/template/state recovery
- Config/rule/template mutation surface (`set` / `diff` / `reset`) for Node CLI
- Runtime consistency verification via `zigrix state check`
- Manual npm publish runbook, SUPPORT doc, and one-command `publish:check` gate

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
- Project-local runtime state layout under `.zigrix/`
- Source-checkout installer `install.sh`
- Initial OpenClaw skill pack skeleton
- CI and release workflow drafts
- Product, architecture, support, and CLI specification docs
