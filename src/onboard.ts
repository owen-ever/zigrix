import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { addAgent } from './agents/registry.js';
import {
  inferStandardAgentRole,
  STANDARD_AGENT_ROLES,
  type StandardAgentRole,
} from './agents/roles.js';
import { LEGACY_DEFAULT_GATEWAY_URL, resolveAbsolutePath } from './config/defaults.js';
import { loadConfig, writeConfigFile, writeDefaultConfig } from './config/load.js';
import type { ZigrixConfig } from './config/schema.js';
import { ensureBaseState, resolvePaths, type ZigrixPaths } from './state/paths.js';
import { rebuildIndex } from './state/tasks.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenClawAgent {
  id: string;
  name?: string;
  default?: boolean;
  identity?: {
    name?: string;
    theme?: string;
  };
}

export interface OpenClawConfig {
  agents?: {
    list?: OpenClawAgent[];
  };
  gateway?: {
    port?: number | string;
    bind?: string;
    mode?: string;
    auth?: {
      token?: string;
    };
  };
  plugins?: {
    entries?: {
      'device-pair'?: {
        config?: {
          publicUrl?: string;
        };
      };
    };
  };
}

export type AgentRoleAssignments = Record<string, StandardAgentRole>;

export interface PathStabilizeResult {
  alreadyInPath: boolean;
  symlinkCreated: boolean;
  symlinkPath: string | null;
  warning: string | null;
}

export interface SkillRegistrationResult {
  registered: string[];
  skipped: string[];
  failed: string[];
}

export interface OnboardResult {
  ok: boolean;
  action: string;
  baseDir: string;
  workspaceBaseDir: string;
  configPath: string;
  paths: ZigrixPaths;
  openclawDetected: boolean;
  openclawHome: string;
  openclawBinPath: string | null;
  openclawGatewayUrl: string | null;
  agentsRegistered: string[];
  agentsSkipped: string[];
  rulesCopied: string[];
  rulesSkipped: string[];
  skillsRegistered: string[];
  skillsSkipped: string[];
  skillsFailed: string[];
  pathStabilized: PathStabilizeResult;
  openclawPathStabilized: PathStabilizeResult;
  warnings: string[];
  checks: {
    zigrixInPath: boolean;
    openclawInPath: boolean;
    openclawSkillsDir: boolean;
  };
}

export interface RunOnboardOptions {
  yes?: boolean;
  projectDir?: string;
  projectsBaseDir?: string;
  orchestratorId?: string;
  gatewayUrl?: string;
  silent?: boolean;
}

// ─── OpenClaw detection ───────────────────────────────────────────────────────

export function detectOpenClawHome(): string {
  const fallbackHome = process.env.HOME ?? os.homedir();
  return process.env.OPENCLAW_HOME
    ? resolveAbsolutePath(process.env.OPENCLAW_HOME)
    : path.join(fallbackHome, '.openclaw');
}

export function loadOpenClawConfig(openclawHome: string): OpenClawConfig | null {
  const configPath = path.join(openclawHome, 'openclaw.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw) as OpenClawConfig;
  } catch {
    return null;
  }
}

function normalizeGatewayUrl(input?: string | null): string {
  const trimmed = input?.trim() ?? '';
  if (!trimmed) return '';
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`unsupported gateway url protocol: ${parsed.protocol}`);
  }
  return parsed.toString().replace(/\/+$/, '');
}

function coerceGatewayPort(value: unknown): number | null {
  const n =
    typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : typeof value === 'number'
        ? value
        : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 65535) return null;
  return Math.trunc(n);
}

export function resolveOpenClawGatewayUrl(openclawConfig: OpenClawConfig | null): string | null {
  if (!openclawConfig || typeof openclawConfig !== 'object') return null;

  const directUrl = (openclawConfig as { gateway?: { url?: unknown } }).gateway?.url;
  if (typeof directUrl === 'string' && directUrl.trim().length > 0) {
    return normalizeGatewayUrl(directUrl);
  }

  const port = coerceGatewayPort(openclawConfig.gateway?.port);
  if (port) {
    return `http://127.0.0.1:${port}`;
  }

  return null;
}

export function resolveOpenClawGatewayToken(openclawConfig: OpenClawConfig | null): string | null {
  const token = openclawConfig?.gateway?.auth?.token;
  return typeof token === 'string' && token.trim().length > 0 ? token : null;
}

function resolveExistingExecutablePath(candidate: string): string | null {
  try {
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink()) {
      return path.resolve(fs.realpathSync(candidate));
    }
    return fs.existsSync(candidate) ? path.resolve(candidate) : null;
  } catch {
    return null;
  }
}

function resolveGlobalPackageBin(params: { packageName: string; binName: string }): string | null {
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', timeout: 3000 }).trim();
    if (!globalRoot) return null;

    const packageRoot = path.join(globalRoot, params.packageName);
    const packageJsonPath = path.join(packageRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return null;

    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      bin?: string | Record<string, string>;
    };
    const binEntry =
      typeof pkg.bin === 'string'
        ? pkg.bin
        : pkg.bin && typeof pkg.bin === 'object'
          ? pkg.bin[params.binName]
          : null;
    if (typeof binEntry !== 'string' || binEntry.trim().length === 0) return null;

    return resolveExistingExecutablePath(path.resolve(packageRoot, binEntry));
  } catch {
    return null;
  }
}

function shouldReplaceStoredGatewayUrl(stored: string, detected: string | null): boolean {
  const trimmed = stored.trim();
  if (!trimmed) return Boolean(detected);
  if (!detected) return false;
  return trimmed === LEGACY_DEFAULT_GATEWAY_URL;
}

/**
 * Discover the openclaw binary path.
 * Strategy order:
 *   1. `which openclaw` — available in current PATH
 *   2. Common nvm/volta/fnm managed paths
 *   3. Well-known locations: /usr/local/bin, ~/.local/bin
 *   4. Walk node_modules/.bin from openclaw home
 *
 * Returns the resolved absolute path or null.
 */
export function resolveOpenClawBin(openclawHome?: string): string | null {
  const pickCandidate = (candidate: string | null | undefined): string | null => {
    if (!candidate) return null;
    return resolveExistingExecutablePath(candidate);
  };

  // Strategy 1: which/where
  try {
    const result = execSync('which openclaw', { encoding: 'utf8', timeout: 3000 }).trim();
    const resolved = pickCandidate(result);
    if (resolved) return resolved;
  } catch {
    // not in PATH
  }

  // Strategy 2: nvm/volta/fnm managed global bin dirs
  const home = process.env.HOME ?? '';
  const nodeVersion = process.versions.node;
  const majorMinorPatch = nodeVersion; // e.g., "25.5.0"
  const nvmCandidate = path.join(
    home,
    '.nvm',
    'versions',
    'node',
    `v${majorMinorPatch}`,
    'bin',
    'openclaw',
  );
  const nvmResolved = pickCandidate(nvmCandidate);
  if (nvmResolved) return nvmResolved;

  // Also try nvm current symlink
  const nvmCurrent = path.join(home, '.nvm', 'current', 'bin', 'openclaw');
  const nvmCurrentResolved = pickCandidate(nvmCurrent);
  if (nvmCurrentResolved) return nvmCurrentResolved;

  // Volta
  const voltaCandidate = path.join(home, '.volta', 'bin', 'openclaw');
  const voltaResolved = pickCandidate(voltaCandidate);
  if (voltaResolved) return voltaResolved;

  // fnm
  const fnmCandidate = path.join(
    home,
    '.fnm',
    'node-versions',
    `v${majorMinorPatch}`,
    'installation',
    'bin',
    'openclaw',
  );
  const fnmResolved = pickCandidate(fnmCandidate);
  if (fnmResolved) return fnmResolved;

  // Strategy 3: well-known system paths
  for (const dir of ['/usr/local/bin', path.join(home, '.local', 'bin')]) {
    const candidate = path.join(dir, 'openclaw');
    const resolved = pickCandidate(candidate);
    if (resolved) return resolved;
  }

  // Strategy 4: resolve the actual global package bin target (not the wrapper path)
  const globalPackageBin = resolveGlobalPackageBin({
    packageName: 'openclaw',
    binName: 'openclaw',
  });
  if (globalPackageBin) return globalPackageBin;

  // Strategy 5: node global bin wrapper path (npm root -g)
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', timeout: 3000 }).trim();
    if (globalRoot) {
      const candidate = path.join(path.dirname(globalRoot), 'bin', 'openclaw');
      const resolved = pickCandidate(candidate);
      if (resolved) return resolved;
    }
  } catch {
    // npm not available or timed out
  }

  // Strategy 6: from openclaw home
  if (openclawHome) {
    // Some installations place a bin reference inside the home dir
    const homeBin = path.join(openclawHome, 'bin', 'openclaw');
    const resolved = pickCandidate(homeBin);
    if (resolved) return resolved;
  }

  return null;
}

// ─── Agent filtering ──────────────────────────────────────────────────────────

export function filterAgents(agents: OpenClawAgent[]): OpenClawAgent[] {
  return agents.filter((a) => a.id !== 'main');
}

// ─── Agent registration ───────────────────────────────────────────────────────

export function registerAgents(
  config: ZigrixConfig,
  agents: OpenClawAgent[],
  roleAssignments?: AgentRoleAssignments,
): { config: ZigrixConfig; registered: string[]; skipped: string[] } {
  let current = structuredClone(config);
  const registered: string[] = [];
  const skipped: string[] = [];

  for (const agent of agents) {
    // idempotent: skip already-registered agents
    if (current.agents.registry[agent.id]) {
      skipped.push(agent.id);
      continue;
    }

    const role =
      roleAssignments?.[agent.id] ??
      inferStandardAgentRole({
        agentId: agent.id,
        theme: agent.identity?.theme ?? null,
      });

    const result = addAgent(current, {
      id: agent.id,
      role,
      runtime: 'openclaw',
      label: agent.name ?? agent.id,
      enabled: true,
      include: true,
    });
    current = result.config;
    registered.push(agent.id);
  }

  return { config: current, registered, skipped };
}

// ─── Rules seeding ────────────────────────────────────────────────────────────

/**
 * Find the bundled default rules directory shipped with the zigrix package.
 */
export function resolveBundledRulesDir(): string | null {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    let dir = path.dirname(thisFile);
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(dir, 'rules', 'defaults');
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
      dir = path.dirname(dir);
    }
  } catch {
    // ignore
  }
  return null;
}

export function resolveRuleSeedSource(projectDir?: string): {
  sourceDir: string | null;
  source: 'external' | 'bundled' | 'none';
  searched: string[];
} {
  const searched: string[] = [];

  const base = projectDir?.trim();
  if (base) {
    const resolvedBase = resolveAbsolutePath(base);
    const candidates = [
      path.join(resolvedBase, 'rules', 'defaults'),
      path.join(resolvedBase, 'rules'),
    ];
    searched.push(...candidates);
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return { sourceDir: candidate, source: 'external', searched };
      }
    }
  }

  const bundled = resolveBundledRulesDir();
  if (bundled) {
    return { sourceDir: bundled, source: 'bundled', searched };
  }

  return { sourceDir: null, source: 'none', searched };
}

export function seedRules(
  sourceDir: string,
  targetDir: string,
): { copied: string[]; skipped: string[]; source: string } {
  const copied: string[] = [];
  const skipped: string[] = [];

  // Try external source first, fall back to bundled defaults
  let effectiveSource = sourceDir;
  if (!fs.existsSync(sourceDir)) {
    const bundled = resolveBundledRulesDir();
    if (bundled) {
      effectiveSource = bundled;
    } else {
      return { copied, skipped, source: 'none' };
    }
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const files = fs.readdirSync(effectiveSource).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const dest = path.join(targetDir, file);
    if (fs.existsSync(dest)) {
      skipped.push(file);
    } else {
      fs.copyFileSync(path.join(effectiveSource, file), dest);
      copied.push(file);
    }
  }

  return { copied, skipped, source: effectiveSource === sourceDir ? 'external' : 'bundled' };
}

// ─── PATH check and stabilization ─────────────────────────────────────────────

export const STABLE_SHELL_PATHS = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

export function checkZigrixInPath(opts?: { _overrideStablePaths?: string[] }): boolean {
  const dirs = opts?._overrideStablePaths ?? STABLE_SHELL_PATHS;
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);
      if (
        entries.includes('zigrix') ||
        entries.includes('zigrix.cmd') ||
        entries.includes('zigrix.exe')
      ) {
        return true;
      }
    } catch {
      // skip unreadable dirs
    }
  }
  return false;
}

/**
 * Resolve the path to the zigrix CLI entry point (dist/index.js).
 * Works whether installed via npm link, npm install -g, or local checkout.
 */
export function resolveZigrixBin(): string | null {
  // Strategy 1: __dirname-based (works when running from dist/)
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const distDir = path.dirname(thisFile);
    const candidate = path.join(distDir, 'index.js');
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    // not an ESM context or import.meta.url unavailable
  }

  // Strategy 2: walk up from this file to find package.json → bin
  try {
    const thisFile = fileURLToPath(import.meta.url);
    let dir = path.dirname(thisFile);
    for (let i = 0; i < 5; i++) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.bin?.zigrix) {
          const binPath = path.resolve(dir, pkg.bin.zigrix);
          if (fs.existsSync(binPath)) return binPath;
        }
        break;
      }
      dir = path.dirname(dir);
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Resolve a system-level bin directory that is writable and accessible
 * from non-login shells (e.g., /usr/local/bin).
 * Returns the first writable candidate, or null if none are writable.
 */
export function findSystemBinDir(): string | null {
  const candidates = ['/usr/local/bin', '/usr/bin'];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) {
        fs.accessSync(dir, fs.constants.W_OK);
        return dir;
      }
    } catch {
      // not writable or inaccessible
    }
  }
  return null;
}

/**
 * Preferred user-local bin directory for symlink placement.
 * Returns the first writable directory from a priority list,
 * or falls back to ~/.local/bin (creating it if needed).
 */
export function findUserBinDir(): string {
  const home = process.env.HOME ?? '~';
  const candidates = [path.join(home, '.local', 'bin')];

  // Also check PATH dirs that are user-writable
  const pathEnv = process.env.PATH ?? '';
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    if (!dir.startsWith(home)) continue;
    try {
      if (fs.existsSync(dir)) {
        fs.accessSync(dir, fs.constants.W_OK);
        return dir;
      }
    } catch {
      // not writable
    }
  }

  return candidates[0];
}

function pathTargetsSameLocation(sourcePath: string, targetPath: string): boolean {
  return path.resolve(sourcePath) === path.resolve(targetPath);
}

/**
 * Ensure zigrix is reachable from PATH.
 * Priority:
 *   1. /usr/local/bin — stable path, accessible from non-login shells (OpenClaw agents, exec)
 *   2. ~/.local/bin   — user-local fallback; may not be in PATH, shows warning if so
 *
 * @param opts._overrideSystemBinDir - Override system bin dir selection (for testing)
 * @param opts._overrideStablePaths  - Override stable paths list (for testing)
 */
export function ensureZigrixInPath(opts?: {
  _overrideSystemBinDir?: string | null;
  _overrideStablePaths?: string[];
}): PathStabilizeResult {
  if (checkZigrixInPath({ _overrideStablePaths: opts?._overrideStablePaths })) {
    return { alreadyInPath: true, symlinkCreated: false, symlinkPath: null, warning: null };
  }

  const binEntry = resolveZigrixBin();
  if (!binEntry) {
    return {
      alreadyInPath: false,
      symlinkCreated: false,
      symlinkPath: null,
      warning: 'Could not locate zigrix entry point. Ensure zigrix is installed via npm.',
    };
  }

  // ── Strategy 1: system bin dir (accessible from non-login shells) ──────────
  const systemBinDir =
    opts !== undefined && '_overrideSystemBinDir' in opts
      ? opts._overrideSystemBinDir
      : findSystemBinDir();

  if (systemBinDir) {
    const symlinkPath = path.join(systemBinDir, 'zigrix');
    if (pathTargetsSameLocation(binEntry, symlinkPath)) {
      return { alreadyInPath: true, symlinkCreated: false, symlinkPath: null, warning: null };
    }
    try {
      // Remove stale entry if present
      try {
        if (fs.existsSync(symlinkPath) || fs.lstatSync(symlinkPath).isSymbolicLink()) {
          fs.unlinkSync(symlinkPath);
        }
      } catch {
        // doesn't exist — fine
      }
      fs.symlinkSync(binEntry, symlinkPath);
      fs.chmodSync(symlinkPath, 0o755);
      return { alreadyInPath: false, symlinkCreated: true, symlinkPath, warning: null };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EACCES') {
        return {
          alreadyInPath: false,
          symlinkCreated: false,
          symlinkPath: null,
          warning: `Cannot write to ${systemBinDir} (permission denied). Run:\n  sudo ln -sfn $(which zigrix) ${symlinkPath}`,
        };
      }
      // Fall through to user bin dir
    }
  }

  // ── Strategy 2: user-local bin dir ────────────────────────────────────────
  const userBinDir = findUserBinDir();
  try {
    fs.mkdirSync(userBinDir, { recursive: true });
  } catch {
    return {
      alreadyInPath: false,
      symlinkCreated: false,
      symlinkPath: null,
      warning: `Could not create ${userBinDir}. Create it manually and add to PATH.`,
    };
  }

  const symlinkPath = path.join(userBinDir, 'zigrix');
  if (pathTargetsSameLocation(binEntry, symlinkPath)) {
    return { alreadyInPath: true, symlinkCreated: false, symlinkPath: null, warning: null };
  }

  try {
    // Remove existing if present (stale symlink or old wrapper)
    if (fs.existsSync(symlinkPath) || fs.lstatSync(symlinkPath).isSymbolicLink()) {
      fs.unlinkSync(symlinkPath);
    }
  } catch {
    // doesn't exist, fine
  }

  try {
    fs.symlinkSync(binEntry, symlinkPath);
    fs.chmodSync(symlinkPath, 0o755);
  } catch {
    // Symlink failed, try writing a wrapper script
    try {
      fs.writeFileSync(
        symlinkPath,
        `#!/usr/bin/env node\nimport('${binEntry.replace(/\\/g, '/')}');\n`,
        { mode: 0o755 },
      );
    } catch (e) {
      return {
        alreadyInPath: false,
        symlinkCreated: false,
        symlinkPath: null,
        warning: `Failed to create symlink or wrapper at ${symlinkPath}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // Check if userBinDir is actually in PATH
  const pathEnv = process.env.PATH ?? '';
  const inPath = pathEnv
    .split(path.delimiter)
    .some((d) => path.resolve(d) === path.resolve(userBinDir));

  const warning: string | null = inPath
    ? null
    : `Created zigrix at ${symlinkPath}, but ${userBinDir} is not in your PATH. Add it:\n  export PATH="${userBinDir}:$PATH"`;

  return { alreadyInPath: false, symlinkCreated: true, symlinkPath, warning };
}

// ─── OpenClaw PATH check and stabilization ────────────────────────────────────

export function checkOpenClawInPath(opts?: { _overrideStablePaths?: string[] }): boolean {
  const dirs = opts?._overrideStablePaths ?? STABLE_SHELL_PATHS;
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);
      if (entries.includes('openclaw')) {
        return true;
      }
    } catch {
      // skip unreadable dirs
    }
  }
  return false;
}

/**
 * Ensure openclaw is reachable from PATH.
 * Same strategy as ensureZigrixInPath():
 *   1. /usr/local/bin — stable path, accessible from non-login shells
 *   2. ~/.local/bin   — user-local fallback
 *
 * @param opts._overrideSystemBinDir - Override system bin dir selection (for testing)
 * @param opts._overrideStablePaths  - Override stable paths list (for testing)
 */
export function ensureOpenClawInPath(opts?: {
  _overrideSystemBinDir?: string | null;
  _overrideStablePaths?: string[];
}): PathStabilizeResult {
  if (checkOpenClawInPath({ _overrideStablePaths: opts?._overrideStablePaths })) {
    return { alreadyInPath: true, symlinkCreated: false, symlinkPath: null, warning: null };
  }

  const binPath = resolveOpenClawBin();
  if (!binPath) {
    return {
      alreadyInPath: false,
      symlinkCreated: false,
      symlinkPath: null,
      warning: 'Could not locate openclaw binary. Ensure openclaw is installed via npm.',
    };
  }

  // ── Strategy 1: system bin dir (accessible from non-login shells) ──────────
  const systemBinDir =
    opts !== undefined && '_overrideSystemBinDir' in opts
      ? opts._overrideSystemBinDir
      : findSystemBinDir();

  if (systemBinDir) {
    const symlinkPath = path.join(systemBinDir, 'openclaw');
    if (pathTargetsSameLocation(binPath, symlinkPath)) {
      return { alreadyInPath: true, symlinkCreated: false, symlinkPath: null, warning: null };
    }
    try {
      // Remove stale entry if present
      try {
        if (fs.existsSync(symlinkPath) || fs.lstatSync(symlinkPath).isSymbolicLink()) {
          fs.unlinkSync(symlinkPath);
        }
      } catch {
        // doesn't exist — fine
      }
      fs.symlinkSync(binPath, symlinkPath);
      fs.chmodSync(symlinkPath, 0o755);
      return { alreadyInPath: false, symlinkCreated: true, symlinkPath, warning: null };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EACCES') {
        return {
          alreadyInPath: false,
          symlinkCreated: false,
          symlinkPath: null,
          warning: `Cannot write to ${systemBinDir} (permission denied). Run:\n  sudo ln -sfn ${binPath} ${symlinkPath}`,
        };
      }
      // Fall through to user bin dir
    }
  }

  // ── Strategy 2: user-local bin dir ────────────────────────────────────────
  const userBinDir = findUserBinDir();
  try {
    fs.mkdirSync(userBinDir, { recursive: true });
  } catch {
    return {
      alreadyInPath: false,
      symlinkCreated: false,
      symlinkPath: null,
      warning: `Could not create ${userBinDir}. Create it manually and add to PATH.`,
    };
  }

  const symlinkPath = path.join(userBinDir, 'openclaw');
  if (pathTargetsSameLocation(binPath, symlinkPath)) {
    return { alreadyInPath: true, symlinkCreated: false, symlinkPath: null, warning: null };
  }

  try {
    // Remove existing if present (stale symlink)
    if (fs.existsSync(symlinkPath) || fs.lstatSync(symlinkPath).isSymbolicLink()) {
      fs.unlinkSync(symlinkPath);
    }
  } catch {
    // doesn't exist, fine
  }

  try {
    fs.symlinkSync(binPath, symlinkPath);
    fs.chmodSync(symlinkPath, 0o755);
  } catch (e) {
    return {
      alreadyInPath: false,
      symlinkCreated: false,
      symlinkPath: null,
      warning: `Failed to create symlink at ${symlinkPath}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Check if userBinDir is actually in PATH
  const pathEnv = process.env.PATH ?? '';
  const inPath = pathEnv
    .split(path.delimiter)
    .some((d) => path.resolve(d) === path.resolve(userBinDir));

  const warning: string | null = inPath
    ? null
    : `Created openclaw at ${symlinkPath}, but ${userBinDir} is not in your PATH. Add it:\n  export PATH="${userBinDir}:$PATH"`;

  return { alreadyInPath: false, symlinkCreated: true, symlinkPath, warning };
}

// ─── OpenClaw skill registration ──────────────────────────────────────────────

/**
 * Find the skills/ directory bundled with this zigrix package.
 */
export function resolveSkillsDir(): string | null {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    let dir = path.dirname(thisFile);
    // Walk up to find the package root (where skills/ lives)
    for (let i = 0; i < 5; i++) {
      const skillsCandidate = path.join(dir, 'skills');
      const pkgCandidate = path.join(dir, 'package.json');
      if (fs.existsSync(pkgCandidate) && fs.existsSync(skillsCandidate)) {
        return skillsCandidate;
      }
      dir = path.dirname(dir);
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Register zigrix skill packs into OpenClaw's skills directory.
 * Creates symlinks from ~/.openclaw/skills/<skill-name> → zigrix/skills/<skill-name>.
 * Idempotent: skips skills that already exist (unless they point elsewhere).
 */
export function registerSkills(openclawHome: string): SkillRegistrationResult {
  const registered: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  const skillsSource = resolveSkillsDir();
  if (!skillsSource) {
    return { registered, skipped, failed: ['Could not locate zigrix skills directory'] };
  }

  const openclawSkillsDir = path.join(openclawHome, 'skills');
  try {
    fs.mkdirSync(openclawSkillsDir, { recursive: true });
  } catch (e) {
    return {
      registered,
      skipped,
      failed: [
        `Could not create ${openclawSkillsDir}: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  let skillDirs: string[];
  try {
    skillDirs = fs.readdirSync(skillsSource).filter((name) => {
      const full = path.join(skillsSource, name);
      return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'SKILL.md'));
    });
  } catch {
    return { registered, skipped, failed: [`Could not read skills directory at ${skillsSource}`] };
  }

  for (const skillName of skillDirs) {
    const source = path.join(skillsSource, skillName);
    const target = path.join(openclawSkillsDir, skillName);

    try {
      // Check if already exists
      if (fs.existsSync(target)) {
        // Check if it's already pointing to our source
        try {
          const existing = fs.readlinkSync(target);
          if (path.resolve(existing) === path.resolve(source)) {
            skipped.push(skillName);
            continue;
          }
        } catch {
          // Not a symlink — skip (user may have their own copy)
          skipped.push(skillName);
          continue;
        }
        // Points elsewhere — update it
        fs.unlinkSync(target);
      }

      fs.symlinkSync(source, target);
      registered.push(skillName);
    } catch (e) {
      failed.push(`${skillName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { registered, skipped, failed };
}

// ─── Interactive agent selection ──────────────────────────────────────────────

/**
 * Interactive agent picker using @inquirer/prompts checkbox.
 * Space to toggle, Enter to confirm. All agents pre-selected by default.
 */
export async function promptAgentSelection(agents: OpenClawAgent[]): Promise<OpenClawAgent[]> {
  if (agents.length === 0) return [];

  try {
    const { checkbox } = await import('@inquirer/prompts');

    const choices = agents.map((agent) => {
      const theme = agent.identity?.theme ?? 'unknown';
      const name = agent.name ?? agent.id;
      return {
        name: `${agent.id} — ${name} (${theme})`,
        value: agent.id,
        checked: true,
      };
    });

    const selected = await checkbox({
      message: 'Select agents to register (space to toggle, enter to confirm):',
      choices,
    });

    const selectedSet = new Set(selected);
    return agents.filter((a) => selectedSet.has(a.id));
  } catch {
    // Fallback: if inquirer is unavailable or stdin is not a TTY, select all
    console.log('ℹ️  Non-interactive mode — selecting all agents.');
    return agents;
  }
}

export async function promptAgentRoleAssignments(
  agents: OpenClawAgent[],
): Promise<AgentRoleAssignments> {
  const defaults: AgentRoleAssignments = Object.fromEntries(
    agents.map((agent) => [
      agent.id,
      inferStandardAgentRole({ agentId: agent.id, theme: agent.identity?.theme ?? null }),
    ]),
  ) as AgentRoleAssignments;

  if (agents.length === 0) return defaults;

  try {
    const { checkbox } = await import('@inquirer/prompts');
    const assignments: AgentRoleAssignments = {};

    for (const agent of agents) {
      const suggested = defaults[agent.id];
      let selected: string[] = [];
      while (selected.length !== 1) {
        selected = await checkbox({
          message: `Assign role for ${agent.id} (space toggle + enter confirm, choose exactly one):`,
          choices: STANDARD_AGENT_ROLES.map((role) => ({
            name: `${role}${role === suggested ? ' (suggested)' : ''}`,
            value: role,
            checked: role === suggested,
          })),
        });
        if (selected.length !== 1) {
          console.log(`⚠️  Select exactly one role for ${agent.id}.`);
        }
      }
      assignments[agent.id] = selected[0] as StandardAgentRole;
    }

    return assignments;
  } catch {
    console.log('ℹ️  Non-interactive mode — inferring roles from agent ids/themes.');
    return defaults;
  }
}

export async function promptWorkspaceBaseDir(defaultPath: string): Promise<string> {
  try {
    const { input } = await import('@inquirer/prompts');
    const answer = await input({
      message: 'Workspace directory',
      default: defaultPath,
      validate: (value: string) => {
        if (!value || value.trim().length === 0) return 'Workspace directory is required';
        return true;
      },
    });
    return resolveAbsolutePath((answer || defaultPath).trim());
  } catch {
    console.log('ℹ️  Non-interactive mode — using configured workspace directory.');
    return resolveAbsolutePath(defaultPath);
  }
}

export async function promptGatewayUrl(defaultValue: string): Promise<string> {
  try {
    const { input } = await import('@inquirer/prompts');
    const answer = await input({
      message: 'OpenClaw gateway URL (leave blank to skip)',
      default: defaultValue,
      validate: (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return true;
        try {
          normalizeGatewayUrl(trimmed);
          return true;
        } catch (error) {
          return (error as Error).message;
        }
      },
    });
    return normalizeGatewayUrl((answer || defaultValue).trim());
  } catch {
    console.log('ℹ️  Non-interactive mode — skipping gateway URL prompt.');
    return normalizeGatewayUrl(defaultValue);
  }
}

export function ensureOrchestratorId(
  config: ZigrixConfig,
  preferredId?: string,
): {
  config: ZigrixConfig;
  changed: boolean;
  warning?: string;
} {
  const next = structuredClone(config);
  const participants = new Set(next.agents.orchestration.participants);
  const excluded = new Set(next.agents.orchestration.excluded);
  const participantMode = participants.size > 0;

  const eligible = Object.entries(next.agents.registry)
    .filter(([agentId, agent]) => {
      if (!agent.enabled) return false;
      if (agent.role !== 'orchestrator') return false;
      if (excluded.has(agentId)) return false;
      if (participantMode && !participants.has(agentId)) return false;
      return true;
    })
    .map(([agentId]) => agentId)
    .sort();

  const requested = preferredId?.trim();
  const current = next.agents.orchestration.orchestratorId;

  if (requested) {
    if (!eligible.includes(requested)) {
      return {
        config: next,
        changed: false,
        warning: `requested orchestrator '${requested}' is not eligible (eligible: ${eligible.join(', ') || 'none'})`,
      };
    }
    const changed = current !== requested;
    next.agents.orchestration.orchestratorId = requested;
    return { config: next, changed };
  }

  if (eligible.includes(current)) {
    return { config: next, changed: false };
  }

  const fallback = eligible[0];
  if (!fallback) {
    return {
      config: next,
      changed: false,
      warning:
        'no eligible orchestrator role agent found. set one with --orchestrator-id after assigning roles.',
    };
  }

  next.agents.orchestration.orchestratorId = fallback;
  return { config: next, changed: true };
}

// ─── Ensure config (idempotent) ───────────────────────────────────────────────

function ensureConfig(): { configPath: string; isNew: boolean } {
  const existing = loadConfig({});
  if (existing.configPath && fs.existsSync(existing.configPath)) {
    return { configPath: existing.configPath, isNew: false };
  }
  const configPath = writeDefaultConfig(false);
  return { configPath, isNew: true };
}

// ─── Main onboard function ────────────────────────────────────────────────────

export async function runOnboard(options: RunOnboardOptions): Promise<OnboardResult> {
  const warnings: string[] = [];
  const silent = options.silent ?? false;

  const log = (msg: string) => {
    if (!silent) console.log(msg);
  };

  // 1. Ensure config.paths.baseDir state (idempotent)
  const { configPath } = ensureConfig();
  const loaded = loadConfig({ configPath });
  let nextConfig = structuredClone(loaded.config);

  const configuredWorkspace =
    nextConfig.workspace.projectsBaseDir?.trim() ||
    path.join(nextConfig.paths.baseDir, 'workspace');
  const desiredWorkspace = options.projectsBaseDir
    ? resolveAbsolutePath(options.projectsBaseDir)
    : options.yes
      ? resolveAbsolutePath(configuredWorkspace)
      : await promptWorkspaceBaseDir(configuredWorkspace);

  if (nextConfig.workspace.projectsBaseDir !== desiredWorkspace) {
    nextConfig.workspace.projectsBaseDir = desiredWorkspace;
    writeConfigFile(configPath, nextConfig);
    log(`✅ Workspace base dir set to: ${desiredWorkspace}`);
  }

  const paths = resolvePaths(nextConfig);
  ensureBaseState(paths);
  rebuildIndex(paths);

  // 2. Detect OpenClaw
  const openclawHome = detectOpenClawHome();
  const openclawExists = fs.existsSync(openclawHome);
  let openclawConfig: OpenClawConfig | null = null;

  if (!openclawExists) {
    warnings.push(`OpenClaw not found at ${openclawHome}. Running in zigrix-only mode.`);
    log(`⚠️  ${warnings[warnings.length - 1]}`);
  } else {
    openclawConfig = loadOpenClawConfig(openclawHome);
    if (!openclawConfig) {
      warnings.push(`openclaw.json not found or invalid at ${openclawHome}. Agent import skipped.`);
      log(`⚠️  ${warnings[warnings.length - 1]}`);
    }
  }

  const storedGatewayUrl = nextConfig.openclaw.gatewayUrl?.trim() ?? '';
  const detectedGatewayUrl = resolveOpenClawGatewayUrl(openclawConfig);
  const resolvedGatewayUrl = (() => {
    if (typeof options.gatewayUrl === 'string' && options.gatewayUrl.trim().length > 0) {
      return normalizeGatewayUrl(options.gatewayUrl);
    }
    if (storedGatewayUrl && !shouldReplaceStoredGatewayUrl(storedGatewayUrl, detectedGatewayUrl)) {
      return normalizeGatewayUrl(storedGatewayUrl);
    }
    if (detectedGatewayUrl) {
      return detectedGatewayUrl;
    }
    if (openclawExists && !options.yes) {
      return '';
    }
    return storedGatewayUrl ? normalizeGatewayUrl(storedGatewayUrl) : '';
  })();

  // 3. Agent selection and registration
  let agentsRegistered: string[] = [];
  let agentsSkipped: string[] = [];

  if (openclawConfig) {
    const allAgents = filterAgents(openclawConfig.agents?.list ?? []);

    let selectedAgents: OpenClawAgent[];
    if (options.yes) {
      selectedAgents = allAgents;
      if (allAgents.length > 0) {
        log(`ℹ️  Auto-selecting all ${allAgents.length} agent(s) (--yes mode).`);
      }
    } else {
      selectedAgents = await promptAgentSelection(allAgents);
    }

    if (selectedAgents.length > 0) {
      const roleAssignments = options.yes
        ? (Object.fromEntries(
            selectedAgents.map((agent) => [
              agent.id,
              inferStandardAgentRole({ agentId: agent.id, theme: agent.identity?.theme ?? null }),
            ]),
          ) as AgentRoleAssignments)
        : await promptAgentRoleAssignments(selectedAgents);

      const result = registerAgents(nextConfig, selectedAgents, roleAssignments);
      nextConfig = result.config;
      agentsRegistered = result.registered;
      agentsSkipped = result.skipped;

      if (agentsRegistered.length > 0) {
        log(`✅ Registered agents: ${agentsRegistered.join(', ')}`);
      }
      if (agentsSkipped.length > 0) {
        log(`⏭️  Already registered (skipped): ${agentsSkipped.join(', ')}`);
      }
    }

    const orchResult = ensureOrchestratorId(nextConfig, options.orchestratorId);
    nextConfig = orchResult.config;
    if (orchResult.warning) {
      warnings.push(orchResult.warning);
      log(`⚠️  ${orchResult.warning}`);
    }

    if (agentsRegistered.length > 0 || orchResult.changed) {
      writeConfigFile(configPath, nextConfig);
      if (orchResult.changed) {
        log(`✅ Orchestrator set to: ${nextConfig.agents.orchestration.orchestratorId}`);
      }
    }
  }

  if (!openclawConfig && options.orchestratorId) {
    const orchResult = ensureOrchestratorId(nextConfig, options.orchestratorId);
    if (orchResult.warning) {
      warnings.push(orchResult.warning);
      log(`⚠️  ${orchResult.warning}`);
    }
    if (orchResult.changed) {
      writeConfigFile(configPath, orchResult.config);
      log(`✅ Orchestrator set to: ${orchResult.config.agents.orchestration.orchestratorId}`);
    }
  }

  // 4. Seed rules
  const rulesTargetDir = paths.rulesDir;
  const ruleSeed = resolveRuleSeedSource(options.projectDir);
  let rulesCopied: string[] = [];
  let rulesSkipped: string[] = [];

  if (!ruleSeed.sourceDir) {
    warnings.push('No bundled rule templates available. Rules seeding skipped.');
    log(`⚠️  ${warnings[warnings.length - 1]}`);
  } else {
    if (options.projectDir && ruleSeed.source === 'bundled') {
      log(
        `ℹ️  No external rule templates found under ${options.projectDir}; using bundled defaults.`,
      );
    }

    ({ copied: rulesCopied, skipped: rulesSkipped } = seedRules(
      ruleSeed.sourceDir,
      rulesTargetDir,
    ));
    if (rulesCopied.length > 0) {
      log(`✅ Rules copied: ${rulesCopied.join(', ')}`);
    }
    if (rulesSkipped.length > 0) {
      log(`⏭️  Rules already exist (skipped): ${rulesSkipped.join(', ')}`);
    }
  }

  // 5. Stabilize PATH — ensure zigrix is reachable
  const pathResult = ensureZigrixInPath();
  if (pathResult.symlinkCreated) {
    log(`✅ zigrix symlinked to ${pathResult.symlinkPath}`);
  } else if (pathResult.alreadyInPath) {
    log('✅ zigrix already in PATH');
  }
  if (pathResult.warning) {
    warnings.push(pathResult.warning);
    log(`⚠️  ${pathResult.warning}`);
  }

  // 6. Detect and persist openclaw binary path
  let openclawBinPath: string | null = null;
  if (openclawExists) {
    openclawBinPath = resolveOpenClawBin(openclawHome);
    if (openclawBinPath) {
      log(`✅ OpenClaw binary found: ${openclawBinPath}`);
    } else {
      warnings.push('openclaw binary not found. Dashboard conversation features may be limited.');
      log(`⚠️  ${warnings[warnings.length - 1]}`);
    }

    // Persist openclaw integration config (home, binPath, gatewayUrl)
    const currentConfig = loadConfig({ configPath }).config;

    // Gateway URL: explicit flag > autodiscovery > interactive prompt > stored value
    let finalGatewayUrl = resolvedGatewayUrl;
    if (!finalGatewayUrl && openclawExists && !options.yes) {
      const suggested = detectedGatewayUrl || '';
      finalGatewayUrl = await promptGatewayUrl(suggested);
    }
    if (finalGatewayUrl) {
      log(`✅ OpenClaw gateway URL: ${finalGatewayUrl}`);
    } else if (openclawExists) {
      warnings.push(
        'OpenClaw gateway URL not configured. Dashboard gateway features may be limited. Set later with `zigrix configure --section openclaw` or `zigrix onboard --gateway-url <url>`.',
      );
      log(`⚠️  ${warnings[warnings.length - 1]}`);
    }

    const needsUpdate =
      currentConfig.openclaw.home !== openclawHome ||
      currentConfig.openclaw.binPath !== openclawBinPath ||
      currentConfig.openclaw.gatewayUrl !== (finalGatewayUrl || '');
    if (needsUpdate) {
      currentConfig.openclaw.home = openclawHome;
      currentConfig.openclaw.binPath = openclawBinPath;
      currentConfig.openclaw.gatewayUrl = finalGatewayUrl || '';
      writeConfigFile(configPath, currentConfig);
      log(
        `✅ OpenClaw config persisted (home: ${openclawHome}, bin: ${openclawBinPath ?? 'not found'}, gateway: ${finalGatewayUrl || 'not set'})`,
      );
    }
  }

  // 7. Stabilize PATH — ensure openclaw is reachable from non-login shells
  let openclawPathResult: PathStabilizeResult = {
    alreadyInPath: false,
    symlinkCreated: false,
    symlinkPath: null,
    warning: null,
  };
  if (openclawBinPath) {
    openclawPathResult = ensureOpenClawInPath();
    if (openclawPathResult.symlinkCreated) {
      log(`✅ openclaw symlinked to ${openclawPathResult.symlinkPath}`);
    } else if (openclawPathResult.alreadyInPath) {
      log('✅ openclaw already in PATH');
    }
    if (openclawPathResult.warning) {
      warnings.push(openclawPathResult.warning);
      log(`⚠️  ${openclawPathResult.warning}`);
    }
  }

  // 8. Register OpenClaw skills (symlink skill packs)
  let skillsRegistered: string[] = [];
  let skillsSkipped: string[] = [];
  let skillsFailed: string[] = [];
  const openclawSkillsDir = path.join(openclawHome, 'skills');

  if (openclawExists) {
    const skillResult = registerSkills(openclawHome);
    skillsRegistered = skillResult.registered;
    skillsSkipped = skillResult.skipped;
    skillsFailed = skillResult.failed;

    if (skillsRegistered.length > 0) {
      log(`✅ Skills registered: ${skillsRegistered.join(', ')}`);
    }
    if (skillsSkipped.length > 0) {
      log(`⏭️  Skills already registered (skipped): ${skillsSkipped.join(', ')}`);
    }
    if (skillsFailed.length > 0) {
      for (const f of skillsFailed) {
        warnings.push(`Skill registration failed: ${f}`);
        log(`⚠️  ${warnings[warnings.length - 1]}`);
      }
    }
  } else {
    log('ℹ️  OpenClaw not detected — skill registration skipped.');
  }

  const openclawSkillsDirExists = fs.existsSync(openclawSkillsDir);

  return {
    ok: true,
    action: 'onboard',
    baseDir: paths.baseDir,
    workspaceBaseDir: nextConfig.workspace.projectsBaseDir,
    configPath,
    paths,
    openclawDetected: openclawExists,
    openclawHome,
    openclawBinPath,
    openclawGatewayUrl: resolvedGatewayUrl || null,
    agentsRegistered,
    agentsSkipped,
    rulesCopied,
    rulesSkipped,
    skillsRegistered,
    skillsSkipped,
    skillsFailed,
    pathStabilized: pathResult,
    openclawPathStabilized: openclawPathResult,
    warnings,
    checks: {
      zigrixInPath: pathResult.alreadyInPath || pathResult.symlinkCreated,
      openclawInPath: openclawPathResult.alreadyInPath || openclawPathResult.symlinkCreated,
      openclawSkillsDir: openclawSkillsDirExists,
    },
  };
}
