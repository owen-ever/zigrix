# Node-only Completion Note

This note supersedes the old Python-to-Node migration plan.

## Current contract
- Node/TypeScript is the **only supported implementation path**.
- The old legacy prototype has been removed from the repository.
- Runtime state is controlled by `~/.zigrix/zigrix.config.json` and its `paths.*` fields.
- Current product contracts live in:
  - `docs/cli-spec.md`
  - `docs/config-schema.md`
  - `docs/architecture.md`
  - `docs/state-layout.md`
  - `docs/release-process.md`

## Historical note
Earlier planning documents discussed a temporary legacy prototype. Those discussions are no longer authoritative for shipping, packaging, or runtime behavior.
