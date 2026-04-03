import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  computeThreshold,
  evaluatePackContents,
  evaluatePackMetrics,
  evaluateRequiredPackPaths,
  findForbiddenPackPaths,
  findMissingRequiredPackPaths,
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
      files: ['a', 'b'],
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

  it('flags forbidden pack paths such as dist/dashboard/node_modules', () => {
    const files = [
      'dist/index.js',
      'dist/dashboard/server.js',
      'dist/dashboard/node_modules/next/package.json',
    ];

    expect(findForbiddenPackPaths(files, ['dist/dashboard/node_modules/'])).toEqual([
      'dist/dashboard/node_modules/next/package.json',
    ]);
    expect(evaluatePackContents(files, ['dist/dashboard/node_modules/']).pass).toBe(false);
  });

  it('requires essential pack paths such as dist/dashboard/server.js', () => {
    const files = ['dist/index.js', 'dist/dashboard/server.js'];

    expect(findMissingRequiredPackPaths(files, ['dist/dashboard/server.js'])).toEqual([]);
    expect(evaluateRequiredPackPaths(files, ['dist/dashboard/server.js']).pass).toBe(true);
    expect(
      evaluateRequiredPackPaths(['dist/index.js'], ['dist/dashboard/server.js']).missing,
    ).toEqual(['dist/dashboard/server.js']);
  });

  it('keeps baseline config file canonical and automation-friendly', () => {
    const baselinePath = path.join(repoRoot, 'docs', 'quality', 'pack-size-baseline.json');
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as {
      generatedAt?: string;
      description: string;
      tolerancePercent: number;
      forbiddenPrefixes: string[];
      requiredPaths: string[];
      metrics: {
        packageSize: number;
        unpackedSize: number;
        entryCount: number;
      };
    };

    expect(baseline.generatedAt).toBeUndefined();
    expect(baseline.description).toContain('npm pack --dry-run --json --ignore-scripts');
    expect(baseline.tolerancePercent).toBeGreaterThanOrEqual(0);
    expect(baseline.forbiddenPrefixes).toContain('dist/dashboard/node_modules/');
    expect(baseline.requiredPaths).toContain('dist/dashboard/server.js');
    expect(baseline.metrics.packageSize).toBeGreaterThan(0);
    expect(baseline.metrics.unpackedSize).toBeGreaterThan(0);
    expect(baseline.metrics.entryCount).toBeGreaterThan(0);
  });
});
