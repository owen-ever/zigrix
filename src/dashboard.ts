import { execSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Default port for zigrix dashboard */
export const DASHBOARD_DEFAULT_PORT = 3838;

/**
 * Resolve the dashboard directory from a given dist index.js path.
 * Convention: dist/index.js → ../../dashboard (i.e. <package-root>/dashboard)
 *
 * The path "../../dashboard" is interpreted relative to the FILE dist/index.js:
 *   - First ".." removes the filename component  → <pkg>/dist/
 *   - Second ".." removes the dist directory     → <pkg>/  (package root)
 *   - "dashboard"                                → <pkg>/dashboard
 *
 * Using path.resolve(distIndexPath, '..', '..', 'dashboard') achieves exactly
 * this because path.resolve treats each ".." as stripping the last segment of
 * the current accumulated path (including the filename on the first step).
 */
export function resolveDashboardDir(distIndexPath: string): string {
  return path.resolve(distIndexPath, '..', '..', 'dashboard');
}

/**
 * Check whether a TCP port is already in use.
 * Returns true if the port is busy (another process is listening).
 */
export function isPortBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        // Unexpected error — treat as busy to be safe
        resolve(true);
      }
    });

    server.once('listening', () => {
      server.close(() => resolve(false));
    });

    server.listen(port, '127.0.0.1');
  });
}

export interface RunDashboardOptions {
  port?: number;
}

/**
 * Main entry point for `zigrix dashboard`.
 *
 * Steps:
 *  1. Resolve dashboard directory relative to this module's dist path.
 *  2. Check port availability; fail clearly on conflict.
 *  3. Auto-install if node_modules is missing.
 *  4. Auto-build if .next directory is missing.
 *  5. Spawn `next start -p <port>` in foreground and wait.
 */
export async function runDashboard(options: RunDashboardOptions = {}): Promise<void> {
  const port = options.port ?? DASHBOARD_DEFAULT_PORT;

  // Resolve dashboard directory.
  // When running from compiled dist/index.js: import.meta.url resolves to
  // file:///…/dist/index.js, so dirname is …/dist.
  // ../../dashboard therefore points to <package-root>/dashboard.
  const selfPath = fileURLToPath(import.meta.url);
  const dashboardDir = resolveDashboardDir(selfPath);

  if (!fs.existsSync(dashboardDir)) {
    throw new Error(`Dashboard directory not found: ${dashboardDir}`);
  }

  // --- Port conflict check ---
  const busy = await isPortBusy(port);
  if (busy) {
    throw new Error(
      `Port ${port} is already in use. ` +
        `Stop the conflicting process or specify a different port with --port.`
    );
  }

  // --- Auto-install dependencies ---
  const nodeModulesDir = path.join(dashboardDir, 'node_modules');
  if (!fs.existsSync(nodeModulesDir)) {
    console.log('📦 dashboard/node_modules not found — running npm install…');
    execSync('npm install', { cwd: dashboardDir, stdio: 'inherit' });
  }

  // --- Auto-build ---
  const nextBuildDir = path.join(dashboardDir, '.next');
  if (!fs.existsSync(nextBuildDir)) {
    console.log('🔨 dashboard/.next not found — running npm run build…');
    execSync('npm run build', { cwd: dashboardDir, stdio: 'inherit' });
  }

  // --- Launch Next.js in foreground ---
  console.log(`🚀 Starting zigrix dashboard on http://localhost:${port}`);

  const nextBin = path.join(dashboardDir, 'node_modules', '.bin', 'next');
  const child = spawn(nextBin, ['start', '-p', String(port)], {
    cwd: dashboardDir,
    stdio: 'inherit',
    env: { ...process.env },
  });

  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code, signal) => {
      if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') {
        resolve();
      } else {
        reject(new Error(`next start exited with code ${code ?? signal}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start next: ${err.message}`));
    });

    // Forward SIGINT/SIGTERM to child for clean shutdown
    const forward = (sig: NodeJS.Signals) => {
      if (!child.killed) child.kill(sig);
    };
    process.once('SIGINT', () => forward('SIGINT'));
    process.once('SIGTERM', () => forward('SIGTERM'));
  });
}
