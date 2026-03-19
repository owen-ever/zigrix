<h1 align="center">Zigrix</h1>

<p align="center">
  <strong>OpenClaw-first orchestration CLI for tracked, multi-agent execution.</strong>
</p>

<p align="center">
  Zigrix turns ad-hoc agent delegation into a tracked, inspectable workflow<br>
  with specialist routing, evidence collection, final reporting, and a built-in dashboard.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/zigrix"><img src="https://img.shields.io/npm/v/zigrix?color=cb3837" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node >=22">
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/OpenClaw-first-6f42c1" alt="OpenClaw-first">
  <img src="https://img.shields.io/badge/stage-alpha-orange" alt="Alpha">
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#why-zigrix">Why Zigrix</a> ·
  <a href="#what-zigrix-does">What It Does</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="docs/openclaw-integration.md">OpenClaw Integration</a> ·
  <a href="#documentation">Docs</a>
</p>

---

## Why Zigrix

Most agent workflows break down at the same point:

- work gets delegated in chat, but **not tracked**
- follow-up lives in memory, not in **runtime state**
- specialist routing is **inconsistent**
- results arrive without **evidence** or a reliable **final report**

Zigrix gives that work a control surface — visible, recoverable, and inspectable from dispatch to finalization.

---

## What Zigrix does

| Capability | Description |
|---|---|
| **Task dispatch** | Tracked tasks with full orchestration metadata |
| **Specialist routing** | Role-based dispatch maps work to standard roles (`orchestrator`, `qa`, `security`, `frontend`, `backend`, `system`) |
| **Evidence collection** | Workers contribute evidence before finalization |
| **Final reporting** | Inspectable reports with execution unit checks |
| **Built-in dashboard** | Web UI for runtime visibility (`zigrix dashboard`) |
| **OpenClaw integration** | Agent import, skill registration, PATH stabilization |
| **Recovery-first** | Reset, re-seed, re-onboard — recoverable by default |

**Best with OpenClaw. Still usable as a standalone orchestration CLI.**

---

## Quick Start

### Step 1 — Install

```bash
npm install -g zigrix
```

### Step 2 — Onboard

```bash
zigrix onboard
```

### Step 3 — Verify

```bash
zigrix doctor
zigrix dashboard
```

That's it. `onboard` handles config, agent import, skill registration, and PATH setup.

> **From source?** Clone this repo, run `./install.sh`, then `zigrix onboard`.
> See [docs/install.md](docs/install.md) for details.

### Prerequisites

- **Node.js 22+** — verify with `node --version`
- **macOS or Linux** — Windows is not yet supported

If you use **nvm**, make sure the correct version is active before installing:

```bash
nvm use 22
node --version   # confirm v22+
```

---

## Core Workflow

A typical Zigrix flow:

```text
Human installs → zigrix onboard → runtime ready

  zigrix task dispatch --title "..." --description "..." --scale normal
    → specialist agents contribute evidence
    → zigrix task finalize merges evidence + checks execution units
    → reportable result

  zigrix dashboard
    → inspect task state, progress, and reports
```

### Key commands

```bash
# Dispatch a new task (role-based selection)
zigrix task dispatch --title "Implement auth module" --description "..." --scale normal --json

# Check runtime health
zigrix doctor

# Launch dashboard
zigrix dashboard --port 3838

# Reconfigure after changes
zigrix configure --section agents
zigrix configure --section skills

# Recovery
zigrix template reset workerPrompt --yes
zigrix reset config --yes
zigrix reset state --yes
```

### Standard roles and orchestrator selection

Zigrix dispatch uses a closed set of normalized roles:

- `orchestrator`
- `qa`
- `security`
- `frontend`
- `backend`
- `system`

At dispatch time, Zigrix resolves `requiredRoles` / `optionalRoles` from scale rules and maps them to enabled agents in the registry.

- `agents.orchestration.orchestratorId` selects the orchestrator owner agent
- if multiple orchestrator-role agents exist, `orchestratorId` is the source of truth
- dispatch output includes orchestration fields such as `orchestratorId`, `qaAgentId`, `baselineRequiredAgents`, `candidateAgents`, `roleAgentMap`, and `orchestratorPrompt`

---

## What `zigrix onboard` does

`onboard` prepares the runtime for actual orchestration work:

1. Creates `~/.zigrix/` with default config
2. Seeds rule files from bundled templates
3. Stabilizes PATH reachability
4. Detects OpenClaw when present
5. Imports agents from `openclaw.json`
6. Registers Zigrix skill packs into `~/.openclaw/skills/`

If OpenClaw is not present, Zigrix still initializes its own runtime and remains usable in standalone mode.

---

## OpenClaw Integration

Zigrix is **OpenClaw-first** in intended use.

When OpenClaw is available, Zigrix:

- **imports agent definitions** from `openclaw.json` — filters `main`, normalizes agent roles, and sets/validates `orchestratorId`
- **registers skill packs** — symlinks `skills/zigrix-*` into `~/.openclaw/skills/`
- **stabilizes CLI visibility** — ensures `zigrix` is reachable from the OpenClaw gateway-visible PATH
- **inspects readiness** — `zigrix doctor` reports OpenClaw detection, skill dir presence, and PATH reachability

The intended operator experience is strongest when OpenClaw is part of the stack.

See [docs/openclaw-integration.md](docs/openclaw-integration.md) for the full integration spec.

---

## Built-in Dashboard

Zigrix ships with a bundled web dashboard for runtime visibility.

```bash
zigrix dashboard --port 3838
```

Use it to inspect:
- active task state and orchestration progress
- agent participation and evidence flow
- finalization and report status

<!-- TODO: dashboard screenshot -->

---

## Intended User Model

| Role | What they do |
|---|---|
| **Human operator** | Install, run `zigrix onboard`, verify with `zigrix doctor`, then stop |
| **OpenClaw agents** | Use operational commands: `task dispatch`, `task finalize`, `worker`, `evidence`, `report` |
| **Advanced maintenance** | `zigrix configure` for reconfiguration, `zigrix reset` for recovery |

See [docs/onboarding-ownership-model.md](docs/onboarding-ownership-model.md) for the ownership model.

---

## Product Stance

Zigrix is:

- **local-first** — runtime state lives in `~/.zigrix/`, not a cloud service
- **runtime-visible** — tasks, evidence, and reports are inspectable, not hidden
- **recoverable by default** — reset templates, config, or state independently
- **OpenClaw-first** — best with OpenClaw, still usable standalone
- **operator-friendly** — `onboard` + `doctor` + `dashboard` cover the human path

### Non-goals right now

- hosted control plane or multi-user UI
- generalized plugin SDK
- Windows-first support
- speculative expansion before core workflow is stable

---

## Repository Layout

```text
zigrix/
├─ src/                # Node/TypeScript implementation
├─ tests/              # test suite
├─ skills/             # OpenClaw skill packs
├─ dashboard/          # bundled Next.js dashboard
├─ rules/              # default rule/template files
├─ examples/           # example workflows
├─ scripts/            # smoke / release helpers
├─ docs/               # product + architecture docs
├─ legacy-python/      # reference prototype (not active)
└─ install.sh          # source-based install script
```

---

## Documentation

| Doc | What it covers |
|---|---|
| [Quick Start](docs/quickstart.md) | First-time setup walk-through |
| [Install](docs/install.md) | Install paths, prerequisites, nvm notes |
| [OpenClaw Integration](docs/openclaw-integration.md) | Agent import, skill registration, PATH |
| [Config Schema](docs/config-schema.md) | Config contract including role model and `orchestratorId` |
| [Orchestrator/Role Guide](docs/orchestrator-role-guide.md) | Role normalization, dispatch mapping, and orchestrator selection |
| [Architecture](docs/architecture.md) | System design and runtime layout |
| [CLI Spec](docs/cli-spec.md) | Full command reference |
| [Runtime Flow](docs/runtime-flow.md) | Task lifecycle from dispatch to report |
| [State Layout](docs/state-layout.md) | `~/.zigrix/` directory structure |
| [Concepts](docs/concepts.md) | Core abstractions and terminology |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and recovery |
| [Main Agent Skill Guide](skills/zigrix-main-agent-guide/SKILL.md) | Dispatch → orchestrator spawn → worker/evidence/finalize chain |
| [Product Decisions](docs/product-decisions.md) | Why things are the way they are |

---

## Current Status

- **Stage:** alpha — productization in progress
- **Implementation:** Node/TypeScript (repository root)
- **Published:** [`zigrix` on npm](https://www.npmjs.com/package/zigrix)
- **Supported platforms:** macOS, Linux
- **Legacy:** Python prototype under `legacy-python/` (reference only)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

See [SUPPORT.md](SUPPORT.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

Apache-2.0
