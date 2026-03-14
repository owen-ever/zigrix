# Release Process

## Goals
- tagged, reproducible releases
- explicit assets
- clear upgrade path
- no silent latest drift in installer behavior

## Planned release assets
- Node build archive (`zigrix-dist.tgz` or equivalent)
- `install.sh`
- optional skill bundle archive
- checksums

## Tag format
- alpha: `v0.1.0-alpha.1`
- beta: `v0.1.0-beta.1`
- stable: `v1.0.0`

## Release flow
1. merge release-ready changes
2. run CI on supported matrix (includes `npm pack --dry-run` + smoke)
3. `npm ci && npm run test && npm run build && npm run smoke`
4. `bash scripts/release-smoke.sh` (full 10-step e2e)
5. create Git tag
6. publish GitHub Release with assets (`zigrix-release.tgz`, `zigrix-dist.tgz`, `install.sh`, `checksums.txt`)
7. run fresh-install smoke test from release artifacts
8. update changelog/release notes

## Guardrails
- release installer should target tagged assets, not mutable branch files
- breaking command/output changes must be called out
- installer changes require fresh-install and reinstall smoke tests
- `legacy-python/` is reference-only and must not silently become the release path again
