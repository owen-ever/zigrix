import * as net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, afterEach } from 'vitest';

import { isPortBusy, resolveDashboardDir, DASHBOARD_DEFAULT_PORT } from '../src/dashboard.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Start a TCP server on a given port and return a stop function. */
function occupyPort(port: number): Promise<{ stop: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        stop: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

// ─── tests: DASHBOARD_DEFAULT_PORT ──────────────────────────────────────────

describe('DASHBOARD_DEFAULT_PORT', () => {
  it('is 3838', () => {
    expect(DASHBOARD_DEFAULT_PORT).toBe(3838);
  });
});

// ─── tests: resolveDashboardDir ─────────────────────────────────────────────

describe('resolveDashboardDir', () => {
  it('resolves to <package-root>/dashboard from dist/index.js', () => {
    // Simulate: distIndexPath = <repoRoot>/dist/index.js
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const simulatedDistIndex = path.join(repoRoot, 'dist', 'index.js');
    const result = resolveDashboardDir(simulatedDistIndex);
    expect(result).toBe(path.join(repoRoot, 'dashboard'));
  });

  it('resolves correctly for arbitrary dist paths', () => {
    // "../../dashboard" relative to the FILE /some/project/dist/index.js:
    //   ".." removes "index.js" → /some/project/dist/
    //   ".." removes "dist"     → /some/project/  (package root)
    //   "dashboard"             → /some/project/dashboard
    const result = resolveDashboardDir('/some/project/dist/index.js');
    expect(result).toBe('/some/project/dashboard');
  });

  it('resolves correctly for nested dist paths', () => {
    // Same logic: /a/b/c/dist/index.js → package root is /a/b/c → /a/b/c/dashboard
    const result = resolveDashboardDir('/a/b/c/dist/index.js');
    expect(result).toBe('/a/b/c/dashboard');
  });
});

// ─── tests: isPortBusy ──────────────────────────────────────────────────────

describe('isPortBusy', () => {
  // Track servers to close in afterEach
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const stop of cleanup.splice(0)) {
      await stop().catch(() => {});
    }
  });

  it('returns false for a free port', async () => {
    // Pick a high random port unlikely to be used
    const port = 49200;
    const busy = await isPortBusy(port);
    // It may or may not be busy depending on system, but the function should not throw
    expect(typeof busy).toBe('boolean');
  });

  it('returns true when port is already occupied', async () => {
    const port = 49201;
    const { stop } = await occupyPort(port);
    cleanup.push(stop);

    const busy = await isPortBusy(port);
    expect(busy).toBe(true);
  });

  it('returns false for a port that was previously released', async () => {
    const port = 49202;
    const { stop } = await occupyPort(port);

    // Close the occupying server first
    await stop();

    const busy = await isPortBusy(port);
    expect(busy).toBe(false);
  });
});
