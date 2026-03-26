# Support Matrix

## Current target

| Area | Status | Notes |
|---|---|---|
| macOS | target | primary dev and smoke-test platform |
| Linux | target | first-class supported platform |
| Windows | later | explicitly not first-wave |
| Node.js 22+ | supported | current runtime floor |
| OpenClaw installed | preferred | canonical operator environment |
| OpenClaw absent | supported | core CLI can still work, but this is not the primary user story |

## Release guarantees by stage

| Stage | Install path | Guarantees |
|---|---|---|
| `0.x` prerelease | source / install.sh or preview release artifacts | best effort, rapid iteration |
| `0.x` release | GitHub Release assets + npm | default install path exists, but command/output compatibility may still evolve before `1.0.0` |
| `1.x+` | GitHub Release assets + npm | documented install/onboard/upgrade/uninstall and smoke-tested release with stronger compatibility expectations |

## Intended ownership model
- human operator: install Zigrix and run `zigrix onboard`
- OpenClaw agents: perform routine Zigrix operations afterwards
- `configure` / `reset`: maintenance and recovery paths

## Out of scope for first public release
- Windows native installer polish
- Homebrew tap
- OpenClaw companion plugin
- standalone binary packaging

## Required external assumptions
- writable project directory
- Node.js 22+
- shell environment capable of running `install.sh`

## OpenClaw-specific notes
- canonical onboarding should make `zigrix` reachable from the OpenClaw gateway-visible PATH
- canonical onboarding should register the Zigrix skill-pack for OpenClaw
- core Zigrix commands should still avoid hard dependency on OpenClaw internals
