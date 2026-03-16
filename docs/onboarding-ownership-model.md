# Onboarding & Ownership Model

## Status
Accepted product direction as of 2026-03-16.

## Core principle
Zigrix is not meant to be a CLI that the human operator uses every day.

The intended split is:
- **Human operator:** install Zigrix, run `zigrix onboard`, confirm the environment is ready, then stop.
- **OpenClaw agents:** use Zigrix operational commands for orchestration work.

## Canonical public flow

```text
install (npm install zigrix or ./install.sh)
  -> zigrix onboard
  -> done
```

Advanced / exceptional paths:
- `zigrix configure` — re-open configuration for advanced changes or operator maintenance
- `zigrix reset` — recover from bad state or restore defaults

## Responsibility split

### Human operator responsibilities
- install Zigrix
- run `zigrix onboard`
- provide initial choices when required
  - workspace / project root
  - orchestration participant agents
  - rule preset / defaults
  - OpenClaw integration consent when applicable

### OpenClaw agent responsibilities
- create and manage tasks
- prepare/register/complete worker assignments
- collect and merge evidence
- render reports
- inspect and mutate low-level config/rules/templates when needed
- use recovery commands during maintenance or troubleshooting

## Onboard requirements
When OpenClaw is detected, `zigrix onboard` must treat these as first-class setup steps:
1. ensure the `zigrix` binary is reachable from the OpenClaw gateway-visible PATH
2. register Zigrix skill-pack content so OpenClaw agents can load it
3. verify readiness after setup

Optional:
- append Zigrix context/help text into workspace notes such as `TOOLS.md`

## Command-surface intent
- `zigrix onboard` is the primary human-facing entrypoint after install
- `zigrix configure` is an advanced / maintenance surface, not the main happy path
- `zigrix reset` is a recovery surface
- low-level command groups (`config`, `agent`, `rule`, `template`, `task`, `worker`, `evidence`, `report`, `pipeline`) primarily serve agents and advanced operators

## Migration note
`zigrix init` remains available as a deprecated compatibility command.
The practical setup path is now:
- install
- `zigrix onboard`
- agent-driven usage
- `zigrix configure` / `zigrix reset` only for exceptional maintenance

Remaining gap:
- interactive agent picker is currently numeric input, not space-to-toggle UI.
