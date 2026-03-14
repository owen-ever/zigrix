# Release Notes Template

## Summary
- what is this release?
- who is it for?
- why now?

## Highlights
- config / rule / template editing
- recovery (`doctor`, `reset`, `state check`)
- local orchestration runtime parity
- packaging / smoke / release readiness hardening

## Installation
```bash
./install.sh
```

## Verification
```bash
zigrix doctor
zigrix init --yes
zigrix run examples/hello-workflow.json --json
```

## Known limitations
Link `docs/known-limitations.md`.

## Next step
Mention that npm publish is now available / manual depending on release day.
