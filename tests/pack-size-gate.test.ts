import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  computeThreshold,
  evaluatePackMetrics,
  parsePackOutput,
} from '../scripts/lib/pack-size-gate.mjs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');

describe('pack-size-gate', () => {
  it('parses npm pack --json output into comparable metrics', () => {
    const raw = JSON.stringify([
      {
        filename: 'zigrix-0.1.0.tgz',
        size: 1000,
        unpackedSize: 4000,
        files: [{ path: 'a' }, { path: 'b' }],
      },
    ]);

    expect(parsePackOutput(raw)).toEqual({
      filename: 'zigrix-0.1.0.tgz',
      packageSize: 1000,
      unpackedSize: 4000,
      entryCount: 2,
    });
  });

  it('fails gate when a metric exceeds the baseline threshold', () => {
    const actual = { packageSize: 101, unpackedSize: 99, entryCount: 10 };
    const baseline = { packageSize: 100, unpackedSize: 100, entryCount: 10 };

    const result = evaluatePackMetrics(actual, baseline, 0);

    expect(result.pass).toBe(false);
    expect(result.violations).toEqual([
      {
        key: 'packageSize',
        actual: 101,
        limit: 100,
      },
    ]);
  });

  it('supports tolerance percentages for reproducible CI/local checks', () => {
    expect(computeThreshold(100, 5)).toBe(105);

    const result = evaluatePackMetrics(
      { packageSize: 104, unpackedSize: 104, entryCount: 10 },
      { packageSize: 100, unpackedSize: 100, entryCount: 10 },
      5,
    );

    expect(result.pass).toBe(true);
  });

  it('keeps baseline config file with numeric metrics', () => {
    const baselinePath = path.join(repoRoot, 'docs', 'quality', 'pack-size-baseline.json');
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as {
      tolerancePercent: number;
      metrics: {
        packageSize: number;
        unpackedSize: number;
        entryCount: number;
      };
    };

    expect(baseline.tolerancePercent).toBeGreaterThanOrEqual(0);
    expect(baseline.metrics.packageSize).toBeGreaterThan(0);
    expect(baseline.metrics.unpackedSize).toBeGreaterThan(0);
    expect(baseline.metrics.entryCount).toBeGreaterThan(0);
  });
});
