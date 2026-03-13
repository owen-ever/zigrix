# Changelog

All notable changes to Zigrix will be documented in this file.

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
