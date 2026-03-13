# Contributing

Thanks for considering a contribution.

## Principles

- Fix root causes, not cosmetic workarounds.
- Preserve machine-readable CLI contracts.
- Prefer fewer, clearer commands over sprawling surface area.
- Keep OpenClaw integration strong but optional.

## Development setup

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -U pip
pip install .
python3 -m unittest discover -s tests -v
```

## Before opening a PR

- Run tests
- Update docs when command behavior changes
- Document breaking changes clearly
- Keep installer changes idempotent and reversible

## PR scope guidelines

Good early PRs:
- portability fixes
- docs clarity
- CLI contract improvements
- installer safety improvements
- OpenClaw skill updates aligned with implemented commands

Avoid mixing these in one PR unless tightly related:
- command contract changes
- installer changes
- release workflow changes
- skill-pack changes

## Design changes

For breaking or structural changes, update the relevant docs first:
- `docs/product-decisions.md`
- `docs/cli-spec.md`
- `docs/architecture.md`
- `docs/release-process.md`
