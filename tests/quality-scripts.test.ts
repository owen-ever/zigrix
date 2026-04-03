import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

describe('quality script contracts', () => {
  it('defines lint/format/typecheck scripts consistently in root and dashboard', () => {
    const rootPkg = readJson<{ scripts: Record<string, string> }>(
      path.join(repoRoot, 'package.json'),
    );
    const dashboardPkg = readJson<{ scripts: Record<string, string> }>(
      path.join(repoRoot, 'dashboard', 'package.json'),
    );

    expect(rootPkg.scripts.lint).toBeTruthy();
    expect(rootPkg.scripts['lint:dashboard']).toContain('dashboard run lint');
    expect(rootPkg.scripts['lint:all']).toContain('lint:dashboard');

    expect(rootPkg.scripts['format:check']).toBeTruthy();
    expect(rootPkg.scripts['format:check:dashboard']).toContain('dashboard run format:check');
    expect(rootPkg.scripts['format:check:all']).toContain('format:check:dashboard');

    expect(rootPkg.scripts.typecheck).toBeTruthy();
    expect(rootPkg.scripts['typecheck:dashboard']).toContain('dashboard run typecheck');
    expect(rootPkg.scripts['typecheck:all']).toContain('typecheck:dashboard');

    expect(dashboardPkg.scripts.lint).toBeTruthy();
    expect(dashboardPkg.scripts.format).toBeTruthy();
    expect(dashboardPkg.scripts['format:check']).toBeTruthy();
    expect(dashboardPkg.scripts.typecheck).toBeTruthy();
  });
});
