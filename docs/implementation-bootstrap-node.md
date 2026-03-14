# Zigrix Node Bootstrap Implementation Status

_Last updated: 2026-03-14_

## What landed

A first working Node/TypeScript bootstrap now exists under `node/`.

Included in this bootstrap:
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
node/
├─ package.json
├─ tsconfig.json
├─ README.md
├─ examples/
│  └─ hello-workflow.json
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
└─ tests/
   ├─ config.test.ts
   └─ run.test.ts
```

## Why this matters

This is not full parity with the Python prototype.
It is a **Phase 1 bootstrap** that proves:
- Node CLI packaging is viable
- config-first loading/validation works
- local run persistence contract can exist independently of Python
- a future runtime migration can proceed incrementally

## Not done yet

- interactive `zigrix init`
- user config + project config layered discovery beyond simple local file lookup
- env/CLI source-map explain support
- agent registry management commands
- rule/template editing commands
- runtime parity for task/worker/evidence/report/stale/pipeline
- packaging / GitHub Release flow

## Recommended next step

1. Promote `node/` bootstrap into the canonical migration track.
2. Add `config explain` + richer config layering.
3. Implement `agent list/add/include/exclude`.
4. Add template placeholder validation/render preview.
5. Start parity migration for task/evidence/report commands.
