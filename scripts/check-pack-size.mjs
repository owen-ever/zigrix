#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluatePackMetrics, formatBytes, parsePackOutput } from './lib/pack-size-gate.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '..');
const baselinePath = path.join(repoRoot, 'docs', 'quality', 'pack-size-baseline.json');
const reportOnly = process.argv.includes('--report-only');

if (!fs.existsSync(baselinePath)) {
  console.error(`Missing baseline file: ${baselinePath}`);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const tolerancePercent = Number(
  process.env.ZIGRIX_PACK_TOLERANCE_PERCENT ?? baseline.tolerancePercent ?? 0,
);

const rawPackOutput = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: repoRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});

const actual = parsePackOutput(rawPackOutput);
const result = evaluatePackMetrics(actual, baseline.metrics, tolerancePercent);

console.log('=== zigrix npm pack size report ===');
console.log(`file:          ${actual.filename}`);
console.log(`packageSize:   ${formatBytes(actual.packageSize)} (${actual.packageSize})`);
console.log(`unpackedSize:  ${formatBytes(actual.unpackedSize)} (${actual.unpackedSize})`);
console.log(`entryCount:    ${actual.entryCount}`);
console.log(`tolerance:     ${tolerancePercent}%`);
console.log(
  `limits:        package=${formatBytes(result.limits.packageSize)}, unpacked=${formatBytes(result.limits.unpackedSize)}, entries=${result.limits.entryCount}`,
);

if (reportOnly) {
  process.exit(0);
}

if (!result.pass) {
  console.error('\n❌ Pack size gate failed.');
  for (const violation of result.violations) {
    const label = violation.key.padEnd(12, ' ');
    const actualLabel = violation.key.includes('Size')
      ? formatBytes(violation.actual)
      : String(violation.actual);
    const limitLabel = violation.key.includes('Size')
      ? formatBytes(violation.limit)
      : String(violation.limit);

    console.error(`- ${label} actual=${actualLabel} limit=${limitLabel}`);
  }
  process.exit(1);
}

console.log('\n✅ Pack size gate passed.');
