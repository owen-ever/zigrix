# Zigrix

Zigrix is a **local-first orchestration CLI** for repeatable agent-assisted development workflows.

It turns ad-hoc delegation into a file-backed, inspectable flow with:
- project-local runtime state (`.zigrix/`)
- task and event tracking
- agent registry + participation control
- rule/template validation and recovery
- evidence merge + final report rendering
- release-friendly Node/TypeScript packaging

## Current status
- Stage: **alpha, productization in progress**
- Main implementation: **Node/TypeScript at repository root**
- Legacy reference: **Python prototype under `legacy-python/`**
- Supported first: **macOS, Linux**
- Packaging path: **GitHub Releases + install.sh**, npm publish prepared for manual follow-up
- Publish gate: `npm run publish:check`

## Intended user model
- **Human operator:** install Zigrix, run `zigrix onboard`, and stop there unless recovery or advanced maintenance is needed.
- **OpenClaw agents:** use the operational Zigrix commands (`task`, `worker`, `evidence`, `report`, `pipeline`, and low-level config surfaces) after onboarding.
- **Advanced maintenance:** `zigrix configure` for reconfiguration, `zigrix reset` for recovery.

See `docs/onboarding-ownership-model.md` for the product-direction source of truth.

## Quick start
### Target UX
```bash
./install.sh
zigrix onboard
```

### Current alpha flow
```bash
./install.sh
zigrix doctor
zigrix init --yes
zigrix run examples/hello-workflow.json --json
```

## What Zigrix can do today
- validate, inspect, change, diff, and reset config
- manage agent registry and orchestration membership
- validate, render, edit, diff, and reset rules/templates
- create and track tasks with append-only event history
- manage worker/evidence/report lifecycle
- detect stale tasks, verify state consistency, and recover state
- run smokeable local orchestration flows

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
- `docs/concepts.md`
- `docs/runtime-flow.md`
- `docs/state-layout.md`
- `docs/troubleshooting.md`
- `docs/v1-scope.md`
- `docs/non-goals.md`
- `docs/open-source-readiness-checklist.md`
- `docs/install.md`
- `docs/release-process.md`
- `docs/versioning.md`
- `docs/known-limitations.md`
- `docs/npm-publish-manual.md`
- `docs/release-notes-template.md`
- `docs/cli-spec.md`

## Repository layout
```text
zigrix/
├─ src/                # Node/TS main implementation
├─ tests/              # test coverage
├─ examples/           # example workflows
├─ scripts/            # smoke / release helpers
├─ docs/               # product + architecture docs
├─ legacy-python/      # reference prototype only
├─ skills/             # OpenClaw skill pack
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
