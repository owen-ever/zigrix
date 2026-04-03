# npm package size baseline

`zigrix` tarball gate uses `npm pack --dry-run --json --ignore-scripts`.

## Commands

```bash
npm run build
npm run build:dashboard
npm run size:report
npm run size:check
npm run size:baseline:update
```

- `size:report`: prints current pack metrics
- `size:check`: compares current metrics against `docs/quality/pack-size-baseline.json`
- `size:baseline:update`: regenerates the baseline in canonical JSON format and auto-formats it

## Policy

- Gate fields: `packageSize`, `unpackedSize`, `entryCount`
- Pack contents policy:
  - forbidden prefixes must not appear in the tarball
    - currently `dist/dashboard/node_modules/`
  - required paths must remain present in the tarball
    - currently `dist/dashboard/server.js`
- Default tolerance: `1%` (absorbs minor lockfile/tar metadata variance while keeping a hard ceiling)
- Optional override for investigation: `ZIGRIX_PACK_TOLERANCE_PERCENT=<n>`

The dashboard remains included as prebuilt output under `dist/dashboard`, but dashboard-only `node_modules` must stay out of the published tarball. Runtime dependencies are expected to resolve from the package root installation (`<pkg>/node_modules`).

## Baseline maintenance

- Do **not** hand-edit `docs/quality/pack-size-baseline.json`.
- When packaging intent changes, regenerate it with `npm run build && npm run build:dashboard && npm run size:baseline:update`.
- Baseline updates must still be reviewed in PR like any other packaging change.
