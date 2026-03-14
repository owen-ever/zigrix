# Contributing

Thanks for considering a contribution.

## Principles

- Fix root causes, not cosmetic workarounds.
- Preserve machine-readable CLI contracts.
- Prefer fewer, clearer commands over sprawling surface area.
- Keep OpenClaw integration strong but optional.
- Treat **Node/TypeScript** as the main implementation path.
- Treat `legacy-python/` as reference-only unless a migration/parity task explicitly needs it.

## Development setup

```bash
npm install
npm run test
npm run build
```

Useful local checks:

```bash
node dist/index.js config validate --json
node dist/index.js init --yes --project-root .scratch/demo --json
node dist/index.js run examples/hello-workflow.json --json
```

## Before opening a PR

- Run tests
- Run build
- Update docs when command behavior changes
- Document breaking changes clearly
- Keep installer changes idempotent and reversible

## PR scope guidelines

Good early PRs:
- config schema improvements
- CLI contract improvements
- runtime migration slices from `legacy-python/`
- installer safety improvements
- OpenClaw skill updates aligned with implemented commands

Avoid mixing these in one PR unless tightly related:
- command contract changes
- installer changes
- release workflow changes
- skill-pack changes
- large migration + packaging changes together

## Design changes

For breaking or structural changes, update the relevant docs first:
- `docs/product-decisions.md`
- `docs/cli-spec.md`
- `docs/node-architecture.md`
- `docs/release-process.md`
- `ROADMAP.md`
