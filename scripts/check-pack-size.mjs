#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluatePackContents,
  evaluatePackMetrics,
  evaluateRequiredPackPaths,
  formatBytes,
  parsePackOutput,
} from './lib/pack-size-gate.mjs';

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
const forbiddenPrefixes = Array.isArray(baseline.forbiddenPrefixes)
  ? baseline.forbiddenPrefixes
  : [];
const requiredPaths = Array.isArray(baseline.requiredPaths) ? baseline.requiredPaths : [];

const rawPackOutput = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: repoRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});

const actual = parsePackOutput(rawPackOutput);
const sizeResult = evaluatePackMetrics(actual, baseline.metrics, tolerancePercent);
const contentsResult = evaluatePackContents(actual.files, forbiddenPrefixes);
const requiredResult = evaluateRequiredPackPaths(actual.files, requiredPaths);

console.log('=== zigrix npm pack report ===');
console.log(`file:          ${actual.filename}`);
console.log(`packageSize:   ${formatBytes(actual.packageSize)} (${actual.packageSize})`);
console.log(`unpackedSize:  ${formatBytes(actual.unpackedSize)} (${actual.unpackedSize})`);
console.log(`entryCount:    ${actual.entryCount}`);
console.log(`tolerance:     ${tolerancePercent}%`);
console.log(
  `limits:        package=${formatBytes(sizeResult.limits.packageSize)}, unpacked=${formatBytes(sizeResult.limits.unpackedSize)}, entries=${sizeResult.limits.entryCount}`,
);
console.log(
  `forbidden:     ${forbiddenPrefixes.length > 0 ? forbiddenPrefixes.join(', ') : '(none)'}`,
);
console.log(`required:      ${requiredPaths.length > 0 ? requiredPaths.join(', ') : '(none)'}`);

if (reportOnly) {
  process.exit(0);
}

let failed = false;

if (!sizeResult.pass) {
  failed = true;
  console.error('\n❌ Pack size gate failed.');
  for (const violation of sizeResult.violations) {
    const label = violation.key.padEnd(12, ' ');
    const actualLabel = violation.key.includes('Size')
      ? formatBytes(violation.actual)
      : String(violation.actual);
    const limitLabel = violation.key.includes('Size')
      ? formatBytes(violation.limit)
      : String(violation.limit);

    console.error(`- ${label} actual=${actualLabel} limit=${limitLabel}`);
  }
}

if (!contentsResult.pass) {
  failed = true;
  console.error('\n❌ Pack contents gate failed. Forbidden paths found:');
  for (const violation of contentsResult.violations.slice(0, 20)) {
    console.error(`- ${violation}`);
  }
  if (contentsResult.violations.length > 20) {
    console.error(`- ... and ${contentsResult.violations.length - 20} more`);
  }
}

if (!requiredResult.pass) {
  failed = true;
  console.error('\n❌ Pack contents gate failed. Required paths missing:');
  for (const missingPath of requiredResult.missing) {
    console.error(`- ${missingPath}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log('\n✅ Pack size/content gate passed.');
