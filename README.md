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
zigrix task create --title "Implement installer" --description "Define install flow" --scale normal --required-agent pro-zig --required-agent qa-zig
zigrix task progress --task-id TASK-20260313-001 --actor pro-zig --message "Kickoff complete" --json
zigrix worker prepare --task-id TASK-20260313-001 --agent-id qa-zig --description "Run QA checks" --json
zigrix worker register --task-id TASK-20260313-001 --agent-id qa-zig --session-key agent:test:qa --run-id run-001 --json
zigrix evidence collect --task-id TASK-20260313-001 --agent-id qa-zig --summary "QA passed" --json
zigrix evidence merge --task-id TASK-20260313-001 --require-qa --json
zigrix report render --task-id TASK-20260313-001 --record-events --json
zigrix task stale --hours 24 --json
zigrix task events TASK-20260313-001 --json
zigrix index-rebuild
```

## Current command surface

- `zigrix init`
- `zigrix doctor`
- `zigrix version`
- `zigrix task create`
- `zigrix task list`
- `zigrix task status`
- `zigrix task events`
- `zigrix task progress`
- `zigrix task stale`
- `zigrix task start`
- `zigrix task finalize`
- `zigrix task report`
- `zigrix worker prepare`
- `zigrix worker register`
- `zigrix worker complete`
- `zigrix evidence collect`
- `zigrix evidence merge`
- `zigrix report render`
- `zigrix pipeline run`
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
