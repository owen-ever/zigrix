# Contributing

Thanks for considering a contribution.

## Principles
- fix root causes, not cosmetic workarounds
- preserve machine-readable CLI contracts
- keep destructive operations explicit and recoverable
- prefer fewer, clearer commands over sprawling surface area
- treat **Node/TypeScript** as the main implementation path
- treat `legacy-python/` as reference-only unless parity work explicitly requires it

## Development setup
```bash
npm install
npm run test
npm run build
npm run smoke
```

For packaging/runtime changes, also run:
```bash
bash scripts/release-smoke.sh
```

## Local verification checklist
```bash
node dist/index.js doctor
node dist/index.js init --yes --project-root .scratch/demo --json
node dist/index.js run examples/hello-workflow.json --json
```

## Before opening a PR
- run tests
- run build
- run smoke when CLI surface changed
- run release smoke when packaging/runtime surface changed
- update docs when command behavior changes
- document breaking changes clearly in `CHANGELOG.md`
- keep installer changes idempotent and reversible

## PR scope guidance
Good focused PRs:
- config schema improvements
- recovery/reset behavior improvements
- runtime migration slices from `legacy-python/`
- docs/quickstart/troubleshooting fixes
- installer or release-safety improvements

Avoid mixing unrelated categories in one PR unless tightly coupled:
- command contract changes
- installer changes
- release workflow changes
- skill-pack changes
- large migration + packaging changes together

## Design changes
For structural changes, update the relevant docs first:
- `docs/cli-spec.md`
- `docs/runtime-flow.md`
- `docs/state-layout.md`
- `docs/release-process.md`
- `docs/v1-scope.md`
- `ROADMAP.md`
