# OpenClaw Integration

## Model

Zigrix integrates with OpenClaw as:
- a standalone CLI (`zigrix`)
- a skill pack (`skills/zigrix-*`)

It is **not** required to be an OpenClaw plugin for the first public version.

## Why pluginless first
- lower packaging complexity
- clearer product boundary
- easier independent installation and debugging
- still enough for agent usability through SKILL.md files

## Human vs agent ownership
- **Human operator:** install Zigrix, run `zigrix onboard`, verify readiness, then stop in the common case
- **OpenClaw agents:** use Zigrix operational commands after onboarding

This means the OpenClaw integration path must optimize for **agent usability after one-time operator setup**, not for frequent human CLI operation.

## Skill readiness model

Each skill declares:

```yaml
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
```

This means OpenClaw can mark the skill ready only when the Zigrix binary exists on a PATH visible to the OpenClaw gateway/runtime.

## Onboarding contract for OpenClaw environments
When OpenClaw is present, `zigrix onboard` should cover these as first-class setup steps:
1. ensure `zigrix` is reachable from the gateway-visible PATH
2. register Zigrix skills so they are loadable by OpenClaw
3. verify readiness after setup

Optional:
- append Zigrix helper context into workspace notes such as `TOOLS.md`

## Current alpha installation from source checkout

```bash
./install.sh --with-openclaw-skills
```

## Current integrated surface
- `zigrix task create/status/events/progress/stale`
- `zigrix worker prepare/register/complete`
- `zigrix evidence collect/merge`
- `zigrix report render`
- `zigrix doctor`
- `zigrix init`

These are primarily **agent-facing operational surfaces** plus current alpha setup commands.

## Current gap vs target UX
Current alpha still exposes setup mainly through `install.sh`, `zigrix doctor`, and `zigrix init`.
The intended public UX is:
- install
- `zigrix onboard`
- agent-driven usage
- `zigrix configure` / `zigrix reset` only for advanced maintenance or recovery

## Planned future integration
- richer skill set
- installer-assisted onboarding and skill updates
- optional companion plugin
