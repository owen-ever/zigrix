# Zigrix

Zigrix is an **OpenClaw agent-oriented development orchestration CLI**.

It aims to turn ad-hoc agent delegation into a repeatable workflow with:

- project-local runtime state (`.zigrix/`)
- task/event tracking
- machine-readable JSON output
- installable CLI UX
- OpenClaw skill-pack integration
- config-first orchestration runtime

## Current status

- Stage: **alpha foundations**
- Main implementation: **Node/TypeScript at repository root**
- Legacy reference: **Python prototype under `legacy-python/`**
- Supported first: **macOS, Linux**
- Primary distribution target: **GitHub Releases + install.sh**
- Secondary distribution target: **npm publish / standalone release assets**

## Quick start (source checkout)

```bash
./install.sh
zigrix config validate --json
zigrix init --yes
zigrix run examples/hello-workflow.json --json
```

To also install OpenClaw skills from this checkout:

```bash
./install.sh --with-openclaw-skills
```

## Current implemented Node surface

- `zigrix config validate`
- `zigrix config get [path]`
- `zigrix config schema [path]`
- `zigrix init --yes`
- `zigrix agent list`
- `zigrix agent add`
- `zigrix agent remove`
- `zigrix agent include`
- `zigrix agent exclude`
- `zigrix agent enable`
- `zigrix agent disable`
- `zigrix agent set-role`
- `zigrix rule list`
- `zigrix rule get <path>`
- `zigrix rule validate`
- `zigrix rule render <templateKind> --context <json>`
- `zigrix run <workflowPath>`
- `zigrix inspect <runIdOrPath>`

## Legacy Python surface

The previous Python CLI remains under `legacy-python/` for reference and parity migration.
It is **not** the primary implementation anymore.

## Repository layout

```text
zigrix/
├─ src/                # Node/TS main implementation
├─ tests/              # Node tests
├─ examples/           # example workflows
├─ legacy-python/      # Python reference prototype
├─ skills/             # OpenClaw skill pack
├─ docs/               # product / architecture / migration docs
├─ package.json        # Node package metadata
├─ tsconfig.json       # TypeScript build config
├─ install.sh          # source-checkout installer
└─ .github/workflows/  # CI / release workflows
```

## Migration note

The repository has been intentionally flipped so that:
- **Node is the product path**
- **Python is the legacy/reference path**

This keeps packaging, CI, docs, and contributor expectations aligned with the actual target architecture.

## Key docs

- `ROADMAP.md`
- `docs/node-configurable-platform-plan-2026-03-13.md`
- `docs/node-architecture.md`
- `docs/config-schema.md`
- `docs/implementation-bootstrap-node.md`
- `docs/migration-plan-python-to-node.md`

## Goals

1. Install in minutes
2. Work consistently across macOS/Linux
3. Keep human UX and agent UX both first-class
4. Be OpenClaw-friendly without becoming OpenClaw-internal
5. Ship a real release process, not a pile of scripts

## Non-goals (for now)

- Windows-first support
- GUI/dashboard-first workflow
- OpenClaw plugin implementation as the primary product

## License

Apache-2.0
