# Product Decisions

## Status
Accepted unless superseded here.

## D-001 Product identity
- Decision: Zigrix is an **OpenClaw agent-oriented development orchestration CLI**.
- Why: keeps scope narrow and aligned with existing orchestration assets.

## D-002 Implementation language
- Decision: keep Python as the core implementation language.
- Why: current orchestration logic is already Python-heavy and easiest to migrate without waste.

## D-003 Primary distribution
- Decision: first-class distribution is **GitHub Releases + install.sh**.
- Why: lowest friction path before PyPI maturity and naming concerns are resolved.

## D-004 Secondary distribution
- Decision: add **PyPI / pipx / uv tool install** after release pipeline stabilizes.
- Why: good consumer UX, but not the first dependency for launch.

## D-005 OpenClaw integration model
- Decision: ship **pluginless skill pack** first.
- Why: keeps Zigrix as a real standalone CLI while still being immediately useful to OpenClaw agents.

## D-006 Support matrix
- Decision: support **macOS and Linux first**.
- Why: strongest immediate fit for the existing environment and the least packaging drag.

## D-007 Runtime state layout
- Decision:
  - config: `~/.config/zigrix/`
  - data: `~/.local/share/zigrix/`
  - cache: `~/.cache/zigrix/`
  - project state: `<repo>/.zigrix/`
- Why: portable, XDG-aligned, and clearly separated from source.

## D-008 Python version floor
- Decision: require **Python 3.10+**.
- Why: good compromise between compatibility and modern stdlib features.

## D-009 Output contract
- Decision: every automation-relevant command must support `--json`.
- Why: Zigrix is meant for both humans and agents.

## D-010 Installer behavior
- Decision: installer must be idempotent, version-aware, and non-destructive by default.
- Why: CLI trust is installation trust.

## D-011 License direction
- Decision: current default is **Apache-2.0**, pending dependency/license confirmation.
- Why: clearer patent posture and better enterprise comfort than MIT for this category.
