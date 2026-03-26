# Versioning Policy

## Current stage
Zigrix now uses plain semver releases in the pre-`1.0.0` range. `0.1.0` means the alpha label is removed, but command and JSON contracts may still evolve until `1.0.0`.

## Tags
- release: `v0.x.y`
- prerelease: `v0.x.y-beta.n` or `v0.x.y-rc.n`
- stable major: `v1.0.0`

## Rules
- breaking command or JSON output changes must be documented in `CHANGELOG.md`
- release assets must match the tagged source state
- the installer must not silently drift away from tagged assets
- npm publish is manual until the package boundary and maintainer workflow are fully proven
