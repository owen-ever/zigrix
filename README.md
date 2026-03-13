# Zigrix

Zigrix is an **OpenClaw agent-oriented development orchestration CLI**.

It aims to turn ad-hoc agent delegation into a repeatable workflow with:

- project-local runtime state (`.zigrix/`)
- task/event tracking
- machine-readable JSON output
- installable CLI UX
- OpenClaw skill-pack integration

## Current status

- Stage: **alpha foundations**
- Supported first: **macOS, Linux**
- Python: **3.10+**
- Primary distribution target: **GitHub Releases + install.sh**
- Secondary distribution target: **PyPI / pipx / uv** (later)

## Quick start (source checkout)

```bash
./install.sh
zigrix doctor
zigrix init
zigrix task create --title "First task" --description "Boot Zigrix project state"
zigrix task list
```

To also install OpenClaw skills from this checkout:

```bash
./install.sh --with-openclaw-skills
```

## Command examples

```bash
zigrix version
zigrix doctor --json
zigrix init
zigrix task create --title "Implement installer" --description "Define install flow" --scale normal
zigrix task start TASK-20260313-001
zigrix task status TASK-20260313-001 --json
zigrix task finalize TASK-20260313-001
zigrix index-rebuild
```

## Current command surface

- `zigrix init`
- `zigrix doctor`
- `zigrix task create`
- `zigrix task list`
- `zigrix task status`
- `zigrix task start`
- `zigrix task finalize`
- `zigrix task report`
- `zigrix index-rebuild`

See:
- `docs/cli-spec.md`
- `docs/architecture.md`
- `docs/openclaw-integration.md`
- `ROADMAP.md`

## Repository layout

```text
zigrix/
├─ src/zigrix/          # CLI package
├─ skills/              # OpenClaw skill pack
├─ tests/               # smoke / unit tests
├─ docs/                # product and architecture docs
├─ install.sh           # local/release bootstrap installer
└─ .github/workflows/   # CI / release workflows
```

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
