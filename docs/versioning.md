# Versioning Policy

## Current stage
Zigrix is in alpha. Command and JSON contracts should still stabilize quickly, but they are not considered immutable yet.

## Tags
- alpha: `v0.x.y-alpha.n`
- beta: `v0.x.y-beta.n`
- stable: `v1.0.0`

## Rules
- breaking command or JSON output changes must be documented in `CHANGELOG.md`
- release assets must match the tagged source state
- the installer must not silently drift away from tagged assets
- npm publish is manual until the package boundary and maintainer workflow are fully proven
