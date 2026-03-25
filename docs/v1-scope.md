# Zigrix v1 Scope

_Last updated: 2026-03-16_

## Goal
Ship Zigrix as an open-source ready Node/TypeScript CLI for local, file-backed multi-project parallel task orchestration without depending on a personal workspace layout.

## v1 Must Have
- Node/TypeScript root implementation
- global config in `~/.zigrix/zigrix.config.json` (runtime paths contract: `zigrix.config.json`)
- `zigrix onboard` as primary human entrypoint
- `zigrix configure` for section-targeted reconfiguration
- agent registry / participation management
- rule + template validation/render/edit/reset
- task lifecycle management (dispatch, finalize, create, status, events, progress, stale)
- worker prepare/register/complete
- evidence collect/merge
- final report render
- stale detection / recovery
- pipeline run for local end-to-end flow
- doctor diagnostics
- bundled web dashboard launch command (`zigrix dashboard`, default port 3838)
- safe reset for config/template/state recovery
- PATH stabilization + OpenClaw skill auto-registration
- install / build / smoke / release docs
- CI + release asset generation path

## v1 Product Definition
Zigrix v1 is considered ready when a new user can:
1. install from source checkout or release asset
2. run `zigrix onboard`
3. run `zigrix doctor` and see a passing readiness report
4. dispatch and progress tasks across multiple projects
5. modify rules/templates safely
6. recover from mistakes via reset
7. follow docs without private workspace assumptions

## v1 Stability Priorities
1. state integrity over feature breadth
2. recoverability over clever mutation UX
3. machine-readable output stability
4. local-first execution
5. OpenClaw-friendly but not OpenClaw-dependent core behavior

## Deferred to Post-v1
- live agent spawning / dispatch runtime integration
- plugin SDK
- interactive TUI/editor
- remote service backend
- npm publish automation
- advanced migration engine
