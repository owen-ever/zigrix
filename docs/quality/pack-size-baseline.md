# npm package size baseline

`zigrix` tarball gate uses `npm pack --dry-run --json --ignore-scripts`.

## Commands

```bash
npm run build
npm run build:dashboard
npm run size:report
npm run size:check
```

- `size:report`: prints current pack metrics
- `size:check`: compares current metrics against `docs/quality/pack-size-baseline.json`

## Policy

- Gate fields: `packageSize`, `unpackedSize`, `entryCount`
- Pack contents policy: forbidden prefixes must not appear in the tarball
  - currently `dist/dashboard/node_modules/`
- Default tolerance: `1%` (absorbs minor lockfile/tar metadata variance while keeping a hard ceiling)
- Optional override for investigation: `ZIGRIX_PACK_TOLERANCE_PERCENT=<n>`

The dashboard remains included as prebuilt output under `dist/dashboard`, but dashboard-only `node_modules` must stay out of the published tarball. Runtime dependencies are expected to resolve from the package root installation (`<pkg>/node_modules`).

Baseline values are updated only when packaging intent changes and must be reviewed in PR.
