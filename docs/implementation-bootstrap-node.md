# Zigrix Node Bootstrap Implementation Status

_Last updated: 2026-03-14_

## What landed

A first working Node/TypeScript bootstrap now exists at the **repository root**.
The previous Python implementation has been moved under `legacy-python/` as a reference prototype.

Included in the current Node bootstrap:
- `config validate`
- `config get [path]`
- `config schema [path]`
- `init --yes`
- minimal sequential `run <workflowPath>`
- `inspect <runIdOrPath>`
- local JSON run persistence to `.zigrix/runs/`
- vitest coverage for config validation + minimal workflow execution

## Directory

```text
zigrix/
├─ src/
│  ├─ index.ts
│  ├─ config/
│  │  ├─ defaults.ts
│  │  ├─ load.ts
│  │  └─ schema.ts
│  └─ runner/
│     ├─ run.ts
│     ├─ schema.ts
│     └─ store.ts
├─ tests/
│  ├─ config.test.ts
│  └─ run.test.ts
├─ examples/
│  └─ hello-workflow.json
├─ package.json
├─ tsconfig.json
└─ legacy-python/
   ├─ src/
   ├─ tests/
   └─ pyproject.toml
```

## Why this matters

This is not full parity with the Python prototype.
It is a **Phase 1 bootstrap** that proves:
- Node CLI packaging is viable
- config-first loading/validation works
- local run persistence contract can exist independently of Python
- the repository can now treat Node as the default product path
- runtime migration can proceed incrementally with Python kept as a reference

## Not done yet

- interactive `zigrix init`
- user config + project config layered discovery beyond simple local file lookup
- env/CLI source-map explain support
- agent registry management commands
- rule/template editing commands
- runtime parity for task/worker/evidence/report/stale/pipeline
- packaging / GitHub Release flow

## Recommended next step

1. Add `config explain` + richer config layering.
2. Implement `agent list/add/include/exclude`.
3. Add template placeholder validation/render preview.
4. Start parity migration for task/evidence/report commands.
5. Replace remaining Python-first docs/workflows with Node-first ones.
