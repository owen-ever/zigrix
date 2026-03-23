import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectOpenClawHome } from './onboard.js';

/** Default port for zigrix dashboard */
export const DASHBOARD_DEFAULT_PORT = 3838;

/**
 * Resolve the pre-built dashboard directory from dist/index.js path.
 * Convention: dist/index.js → dist/dashboard/ (sibling directory in dist/)
 *
 * path.resolve(distIndexPath, '..', 'dashboard'):
 *   - First ".." strips the filename  → <pkg>/dist/
 *   - "dashboard"                     → <pkg>/dist/dashboard/
 */
export function resolveDashboardDir(distIndexPath: string): string {
  return path.resolve(distIndexPath, '..', 'dashboard');
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
 * Read openclaw.json and extract gateway connection env vars.
 * Only sets vars that are not already present in process.env,
 * so explicit user overrides are always respected.
 */
function resolveGatewayEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  try {
    const openclawHome = detectOpenClawHome();
    const configPath = path.join(openclawHome, 'openclaw.json');
    if (!fs.existsSync(configPath)) return env;

    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const gateway = raw?.gateway;
    if (!gateway) return env;

    // OPENCLAW_GATEWAY_URL — derive from gateway.port (loopback assumed)
    if (!process.env.OPENCLAW_GATEWAY_URL && !process.env.ORCH_GATEWAY_URL) {
      const port = Number(gateway.port);
      if (port > 0) {
        env.OPENCLAW_GATEWAY_URL = `http://localhost:${port}`;
      }
    }

    // OPENCLAW_GATEWAY_TOKEN — from gateway.auth.token
    if (!process.env.OPENCLAW_GATEWAY_TOKEN && !process.env.ORCH_GATEWAY_TOKEN) {
      const token = gateway.auth?.token;
      if (typeof token === 'string' && token.length > 0) {
        env.OPENCLAW_GATEWAY_TOKEN = token;
      }
    }

    // OPENCLAW_AGENTS_DIR — agents runtime directory
    if (!process.env.OPENCLAW_AGENTS_DIR) {
      const agentsDir = path.join(openclawHome, 'agents');
      if (fs.existsSync(agentsDir)) {
        env.OPENCLAW_AGENTS_DIR = agentsDir;
      }
    }
  } catch {
    // Non-fatal: dashboard will work without gateway features
  }

  return env;
}

/**
 * Main entry point for `zigrix dashboard`.
 *
 * Runs the pre-built Next.js standalone server bundled in dist/dashboard/.
 * No runtime npm install or build step — the dashboard must be built
 * during `npm pack` / `npm run build:dashboard`.
 */
export async function runDashboard(options: RunDashboardOptions = {}): Promise<void> {
  const port = options.port ?? DASHBOARD_DEFAULT_PORT;

  // Resolve pre-built dashboard directory (dist/dashboard/).
  const selfPath = fileURLToPath(import.meta.url);
  const dashboardDir = resolveDashboardDir(selfPath);
  const serverScript = path.join(dashboardDir, 'server.js');

  if (!fs.existsSync(dashboardDir)) {
    throw new Error(
      `Dashboard not found at ${dashboardDir}. ` +
        `This is a packaging error — please report it at https://github.com/owen-ever/zigrix/issues`
    );
  }

  if (!fs.existsSync(serverScript)) {
    throw new Error(
      `Dashboard server.js not found at ${serverScript}. ` +
        `This is a packaging error — please report it.`
    );
  }

  // --- Port conflict check ---
  const busy = await isPortBusy(port);
  if (busy) {
    throw new Error(
      `Port ${port} is already in use. ` +
        `Stop the conflicting process or specify a different port with --port.`
    );
  }

  // --- Resolve OpenClaw gateway env from openclaw.json ---
  const gatewayEnv = resolveGatewayEnv();

  // --- Launch pre-built Next.js standalone server ---
  console.log(`🚀 Starting zigrix dashboard on http://localhost:${port}`);

  const child = spawn(process.execPath, [serverScript], {
    cwd: dashboardDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...gatewayEnv,
      PORT: String(port),
      HOSTNAME: '0.0.0.0',
    },
  });

  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code, signal) => {
      if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') {
        resolve();
      } else {
        reject(new Error(`Dashboard server exited with code ${code ?? signal}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start dashboard server: ${err.message}`));
    });

    // Forward SIGINT/SIGTERM to child for clean shutdown
    const forward = (sig: NodeJS.Signals) => {
      if (!child.killed) child.kill(sig);
    };
    process.once('SIGINT', () => forward('SIGINT'));
    process.once('SIGTERM', () => forward('SIGTERM'));
  });
}
