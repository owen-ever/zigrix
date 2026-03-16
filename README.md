# Zigrix

Zigrix is a **multi-project parallel task orchestration CLI** for agent-assisted development workflows.

It turns ad-hoc delegation into a file-backed, inspectable flow with:
- global runtime state (`~/.zigrix/`) — tasks are not project-bound
- task dispatch and finalization with full orchestration metadata
- agent registry + participation control
- rule/template validation and recovery
- evidence merge + final report rendering
- OpenClaw integration (skill registration + PATH stabilization)
- release-friendly Node/TypeScript packaging

## Current status
- Stage: **alpha, productization in progress**
- Main implementation: **Node/TypeScript at repository root**
- Legacy reference: **Python prototype under `legacy-python/`**
- Supported first: **macOS, Linux**
- Packaging path: **GitHub Releases + install.sh**, npm publish prepared for manual follow-up

## Intended user model
- **Human operator:** install Zigrix, run `zigrix onboard`, and stop there unless recovery or advanced maintenance is needed.
- **OpenClaw agents:** use the operational Zigrix commands (`task`, `worker`, `evidence`, `report`, `pipeline`, and low-level config surfaces) after onboarding.
- **Advanced maintenance:** `zigrix configure` for reconfiguration, `zigrix reset` for recovery.

See `docs/onboarding-ownership-model.md` for the product-direction source of truth.

## Quick start

```bash
# Install and onboard (one-time human setup)
./install.sh
zigrix onboard

# Verify readiness
zigrix doctor
```

`zigrix onboard` will:
1. Create `~/.zigrix/` with default config
2. Detect OpenClaw and import agents from `openclaw.json`
3. Seed rule files from `orchestration/rules/`
4. Ensure `zigrix` is reachable from PATH (creates symlink if needed)
5. Register zigrix skill packs into OpenClaw's `~/.openclaw/skills/`

## What Zigrix can do today
- **dispatch** tasks with full orchestration metadata (replaces `dev_dispatch.py`)
- **finalize** tasks with evidence merge and execution unit checks (replaces `dev_finalize.py`)
- validate, inspect, change, diff, and reset config
- manage agent registry and orchestration membership
- validate, render, edit, diff, and reset rules/templates
- create and track tasks with append-only event history
- manage worker/evidence/report lifecycle
- detect stale tasks, verify state consistency, and recover state
- **configure** agents, rules, PATH, skills, and workspace after initial setup

## Recovery-first operations
Reset one broken template:
```bash
zigrix template reset workerPrompt --yes
```

Reset all config back to defaults:
```bash
zigrix reset config --yes
```

Reset runtime state only:
```bash
zigrix reset state --yes
```

## Documentation map
- `docs/quickstart.md`
- `docs/onboarding-ownership-model.md`
- `docs/product-decisions.md`
- `docs/cli-spec.md`
- `docs/openclaw-integration.md`
- `docs/concepts.md`
- `docs/runtime-flow.md`
- `docs/state-layout.md`
- `docs/troubleshooting.md`
- `docs/v1-scope.md`
- `docs/non-goals.md`
- `docs/install.md`
- `docs/release-process.md`
- `docs/versioning.md`
- `docs/known-limitations.md`
- `docs/npm-publish-manual.md`

## Repository layout
```text
zigrix/
├─ src/                # Node/TS main implementation
├─ tests/              # test coverage
├─ skills/             # OpenClaw skill packs
├─ examples/           # example workflows
├─ scripts/            # smoke / release helpers
├─ docs/               # product + architecture docs
├─ legacy-python/      # reference prototype only
└─ .github/            # CI + issue/PR templates
```

## Product stance
- local-first
- config-first
- recoverable by default
- OpenClaw-friendly, not OpenClaw-dependent in the core
- stability before speculative expansion

## Non-goals right now
- hosted control plane
- GUI/TUI product surface
- generalized plugin SDK
- automatic npm publish execution
- Windows-first support

## Contributing
See `CONTRIBUTING.md`.

## Support
See `SUPPORT.md`.

## Security
See `SECURITY.md`.

## License
Apache-2.0
