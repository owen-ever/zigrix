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

## Skill readiness model

Each skill declares:

```yaml
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
```

This means OpenClaw can mark the skill ready only when the Zigrix binary exists on PATH.

## Installation from source checkout

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

## Planned future integration
- richer skill set
- optional companion plugin
- installer-assisted skill updates
