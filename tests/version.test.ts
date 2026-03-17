import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeBin = process.execPath;

describe('version', () => {
  it('--version output matches package.json version', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')
    ) as { version: string };

    const output = execFileSync(nodeBin, ['dist/index.js', '--version'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();

    expect(output).toBe(pkg.version);
  });
});
