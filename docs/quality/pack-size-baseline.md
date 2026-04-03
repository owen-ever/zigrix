# npm package size baseline

`zigrix` tarball size gate uses `npm pack --dry-run --json --ignore-scripts`.

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
- Default tolerance: `1%` (absorbs minor lockfile/tar metadata variance while keeping a hard ceiling)
- Optional override for investigation: `ZIGRIX_PACK_TOLERANCE_PERCENT=<n>`

Baseline values are updated only when packaging intent changes and must be reviewed in PR.
