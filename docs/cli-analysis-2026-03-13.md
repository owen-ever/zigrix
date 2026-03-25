# Zigrix CLI Analysis Memo (Historical, superseded)

This document captured a pre-productization snapshot.
It is kept only as archival context and is **not** current product guidance.

## Current authoritative docs
- `docs/cli-spec.md`
- `docs/config-schema.md`
- `docs/architecture.md`
- `docs/state-layout.md`
- `docs/release-process.md`
- `docs/node-only-completion-note.md`

## Current contract
- Node/TypeScript is the only supported implementation.
- Legacy runtime paths and script-chain assumptions are removed.
- Runtime paths are governed by `~/.zigrix/zigrix.config.json` and its `paths.*` fields.
