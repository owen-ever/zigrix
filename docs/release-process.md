# Release Process

## Goals
- tagged, reproducible releases
- explicit assets
- clear upgrade path
- no silent latest drift in installer behavior

## Planned release assets
- wheel
- sdist
- `install.sh`
- optional skill bundle archive
- checksums

## Tag format
- alpha: `v0.1.0-alpha.1`
- beta: `v0.1.0-beta.1`
- stable: `v1.0.0`

## Release flow
1. merge release-ready changes
2. run CI on supported matrix
3. build distributions
4. create Git tag
5. publish GitHub Release with assets
6. run fresh-install smoke test from release artifacts
7. update changelog/release notes

## Guardrails
- release installer should target tagged assets, not mutable branch files
- breaking command/output changes must be called out
- installer changes require fresh-install and reinstall smoke tests
