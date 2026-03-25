# Release Process

## Goals
- tagged, reproducible releases
- explicit assets
- clear upgrade path
- no silent latest drift in installer behavior

## Planned release assets
- npm package tarball (`zigrix-release.tgz`)
- Node build archive (`zigrix-dist.tgz`)
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
3. set npm auth via `NPM_TOKEN` env or `scripts/local/.env.npm` (gitignored)
4. run `npm run release -- <version>`
   - preflight: version/tag validation, `publish:check`, npm/gh auth checks
   - publish: git tag push, npm publish, GitHub release create/update
   - verify: package version + dist-tags (`latest` drift guard)
   - prerelease default: stays on prerelease dist-tags (alpha/beta/rc), not `latest`
   - explicit latest promotion (optional): `npm run release -- <version> --latest`
     - promotes npm `latest` dist-tag
     - marks GitHub release as latest
5. run fresh-install smoke test from release artifacts
6. update changelog/release notes

## Guardrails
- release installer should target tagged assets, not mutable branch files
- breaking command/output changes must be called out
- installer changes require fresh-install and reinstall smoke tests
- Legacy follow-up paths are deprecated and must not re-enter release/runtime contracts
