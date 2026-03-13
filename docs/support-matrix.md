# Support Matrix

## Current target

| Area | Status | Notes |
|---|---|---|
| macOS | target | primary dev and smoke-test platform |
| Linux | target | first-class supported platform |
| Windows | later | explicitly not first-wave |
| Python 3.10 | supported | minimum supported version |
| Python 3.11 | supported | recommended |
| Python 3.12 | supported | expected to work |
| OpenClaw installed | optional | required only for skill-pack integration |
| OpenClaw absent | supported | core CLI should still work |

## Release guarantees by stage

| Stage | Install path | Guarantees |
|---|---|---|
| alpha | source / install.sh | best effort, rapid iteration |
| beta | GitHub Release assets | stable golden path expected |
| v1.0 | GitHub Release assets | documented install/upgrade/uninstall and smoke-tested release |

## Out of scope for first public release
- Windows native installer polish
- Homebrew tap
- OpenClaw companion plugin
- standalone binary packaging

## Required external assumptions
- writable project directory
- Python 3.10+
- shell environment capable of running `install.sh`

## OpenClaw-specific notes
- skill-pack integration assumes access to `~/.openclaw/skills/` or equivalent configured home
- core Zigrix commands must not require OpenClaw internals to be present
