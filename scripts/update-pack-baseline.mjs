#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePackOutput } from './lib/pack-size-gate.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '..');
const baselinePath = path.join(repoRoot, 'docs', 'quality', 'pack-size-baseline.json');

const existing = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  : {};

const tolerancePercent = Number(existing.tolerancePercent ?? 1);
const forbiddenPrefixes = Array.isArray(existing.forbiddenPrefixes)
  ? existing.forbiddenPrefixes
  : ['dist/dashboard/node_modules/'];
const requiredPaths = Array.isArray(existing.requiredPaths)
  ? existing.requiredPaths
  : ['dist/dashboard/server.js'];
const description =
  typeof existing.description === 'string' && existing.description.length > 0
    ? existing.description
    : 'npm pack --dry-run --json --ignore-scripts baseline for zigrix package';

const rawPackOutput = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: repoRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});

const actual = parsePackOutput(rawPackOutput);
const baseline = {
  description,
  tolerancePercent,
  forbiddenPrefixes,
  requiredPaths,
  metrics: {
    packageSize: actual.packageSize,
    unpackedSize: actual.unpackedSize,
    entryCount: actual.entryCount,
  },
};

fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
console.log(`Updated ${path.relative(repoRoot, baselinePath)}`);
console.log(JSON.stringify(baseline, null, 2));
