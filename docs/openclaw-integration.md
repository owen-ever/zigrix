# OpenClaw Integration

## Model

Zigrix integrates with OpenClaw as:
- a standalone CLI (`zigrix`)
- bundled OpenClaw skills (`skills/oz`, `skills/zigrix-*`)

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

Bundled skills include:
- `oz` — public OpenClaw chat entrypoint (`/oz` + semantic natural-language delegation into Zigrix)
- operational packs (`zigrix-task-*`, `zigrix-worker`, `zigrix-evidence`, `zigrix-report`, `zigrix-doctor`)
- the orchestration guide pack (`zigrix-main-agent-guide`)

## Onboarding contract for OpenClaw environments

When OpenClaw is present, `zigrix onboard` automatically covers:

1. **PATH stabilization** — ensures `zigrix` is reachable from the gateway-visible PATH. If not found, creates a symlink in `~/.local/bin/` and warns if that directory isn't in PATH.
2. **Skill registration** — symlinks all bundled OpenClaw skills (`skills/oz`, `skills/zigrix-*`) into `~/.openclaw/skills/`. Idempotent: skips existing symlinks that already point to the correct source.
3. **Agent import** — reads `openclaw.json`, filters out `main`, normalizes imported roles to Zigrix standard roles, and sets/validates `agents.orchestration.orchestratorId`.
4. **Readiness verification** — `zigrix doctor` reports OpenClaw detection status, skill dir presence, PATH reachability, and rule file counts.

Optional:
- append Zigrix helper context into workspace notes such as `TOOLS.md`

## Chat-side entrypoint after onboarding

After `zigrix onboard`, OpenClaw should have an `oz` skill available under `~/.openclaw/skills/oz`.

Expected user-facing behavior:
- `/oz ...` → force Zigrix delegation
- plain-language handoff requests (for example “이거 맡겨”, “delegate this”, “route this through Zigrix”) → semantic routing into Zigrix when the user is asking for delegation rather than direct execution

Both surfaces should enter the same canonical handoff chain:
1. `zigrix task dispatch --json`
2. use returned `orchestratorPrompt` to spawn the orchestrator session

## Current integrated surface (agent-facing)

### Task orchestration
- `zigrix task dispatch` — creates task with full orchestration metadata, resolves roles to agents, and emits `orchestratorPrompt` for the configured orchestrator
- `zigrix task finalize` — merges evidence, checks execution units, auto-reports
- `zigrix task create/status/list/events/progress/stale/start/report`

### Worker lifecycle
- `zigrix worker prepare/register/complete`

### Evidence and reporting
- `zigrix evidence collect/merge`
- `zigrix report render`

### Pipeline
- `zigrix pipeline run` — high-level create → evidence → merge → report flow

### Setup and maintenance
- `zigrix onboard` — first-time setup (human-facing)
- `zigrix configure` — reconfigure agents, rules, workspace, PATH, skills
- `zigrix doctor` — environment and readiness inspection
- `zigrix dashboard --port <n>` — launch bundled dashboard (default 3838)
- `zigrix reset config/state` — recovery

## Reconfiguration

`zigrix configure` supports section-targeted reconfiguration:

```bash
# Reconfigure everything
zigrix configure

# Only re-register skills
zigrix configure --section skills

# Only re-stabilize PATH
zigrix configure --section path

# Re-import agents from openclaw.json
zigrix configure --section agents

# Set projects base directory
zigrix configure --section workspace --projects-base-dir ~/projects
```

## Installation

### From source checkout
```bash
./install.sh --with-openclaw-skills
zigrix onboard
```

### Target public flow
```bash
npm install -g zigrix
zigrix onboard
```

## Planned future integration
- richer skill set (dispatch, finalize skills)
- installer-assisted skill updates
- optional companion plugin
- dashboard lifecycle UX enhancements (daemon mode, status command)
