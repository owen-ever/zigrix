# Concepts

## Project-local orchestration
Zigrix keeps its runtime data inside a project-local `.zigrix/` directory. That makes the tool easy to inspect, backup, diff, and reset.

## Config-first
Behavior is controlled through `zigrix.config.json` rather than hidden hardcoded policy. Defaults exist, but the product assumes operators will inspect and occasionally modify config, rules, and templates.

## Registry vs participants
- `agents.registry`: every known agent
- `agents.orchestration.participants`: agents actively eligible for orchestration
- `agents.orchestration.excluded`: registry members intentionally excluded

This separation lets operators register future agents without immediately including them in active orchestration.

## Rules vs templates
- `rules.*` express policy
- `templates.*` express renderable prompt/report text

Rules decide what should happen. Templates decide how text gets rendered.

## Recoverability
Operators will make mistakes. Zigrix treats reset/recovery as a core product surface, not an afterthought.

## OpenClaw-friendly, not OpenClaw-dependent
The current product works well alongside OpenClaw, but its local file-backed core is intentionally usable without mandatory OpenClaw runtime coupling.
