import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { addAgent } from './agents/registry.js';
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
}

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
  configPath: string;
  paths: ZigrixPaths;
  openclawDetected: boolean;
  openclawHome: string;
  agentsRegistered: string[];
  agentsSkipped: string[];
  rulesCopied: string[];
  rulesSkipped: string[];
  skillsRegistered: string[];
  skillsSkipped: string[];
  skillsFailed: string[];
  pathStabilized: PathStabilizeResult;
  warnings: string[];
  checks: {
    zigrixInPath: boolean;
    openclawSkillsDir: boolean;
  };
}

export interface RunOnboardOptions {
  yes?: boolean;
  projectDir?: string;
  silent?: boolean;
}

// ─── OpenClaw detection ───────────────────────────────────────────────────────

export function detectOpenClawHome(): string {
  return process.env.OPENCLAW_HOME
    ? path.resolve(process.env.OPENCLAW_HOME)
    : path.join(process.env.HOME ?? '~', '.openclaw');
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

// ─── Agent filtering ──────────────────────────────────────────────────────────

export function filterAgents(agents: OpenClawAgent[]): OpenClawAgent[] {
  return agents.filter((a) => a.id !== 'main');
}

// ─── Agent registration ───────────────────────────────────────────────────────

export function registerAgents(
  config: ZigrixConfig,
  agents: OpenClawAgent[],
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
    const role = agent.identity?.theme ?? 'assistant';
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

export function seedRules(
  sourceDir: string,
  targetDir: string,
): { copied: string[]; skipped: string[] } {
  const copied: string[] = [];
  const skipped: string[] = [];

  if (!fs.existsSync(sourceDir)) {
    return { copied, skipped };
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const dest = path.join(targetDir, file);
    if (fs.existsSync(dest)) {
      skipped.push(file);
    } else {
      fs.copyFileSync(path.join(sourceDir, file), dest);
      copied.push(file);
    }
  }

  return { copied, skipped };
}

// ─── PATH check and stabilization ─────────────────────────────────────────────

export function checkZigrixInPath(): boolean {
  const pathEnv = process.env.PATH ?? '';
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
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
 * Preferred user-local bin directory for symlink placement.
 * Returns the first writable directory from a priority list,
 * or falls back to ~/.local/bin (creating it if needed).
 */
export function findUserBinDir(): string {
  const home = process.env.HOME ?? '~';
  const candidates = [
    path.join(home, '.local', 'bin'),
  ];

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

/**
 * Ensure zigrix is reachable from PATH.
 * If not found, creates a wrapper script in ~/.local/bin/.
 */
export function ensureZigrixInPath(): PathStabilizeResult {
  if (checkZigrixInPath()) {
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

  // Create a wrapper script that invokes node with the correct entry
  const wrapper = `#!/usr/bin/env node\nimport('${binEntry.replace(/\\/g, '/')}');\n`;

  try {
    // Remove existing if present (stale symlink or old wrapper)
    if (fs.existsSync(symlinkPath) || fs.lstatSync(symlinkPath).isSymbolicLink()) {
      fs.unlinkSync(symlinkPath);
    }
  } catch {
    // doesn't exist, fine
  }

  try {
    // Prefer symlink to the actual CLI bin (simpler, no wrapper needed)
    fs.symlinkSync(binEntry, symlinkPath);
    fs.chmodSync(symlinkPath, 0o755);
  } catch {
    // Symlink failed, try writing a wrapper script
    try {
      fs.writeFileSync(symlinkPath, `#!/usr/bin/env node\nimport('${binEntry.replace(/\\/g, '/')}');\n`, { mode: 0o755 });
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
  const inPath = pathEnv.split(path.delimiter).some((d) => path.resolve(d) === path.resolve(userBinDir));

  let warning: string | null = null;
  if (!inPath) {
    warning = `Created zigrix at ${symlinkPath}, but ${userBinDir} is not in your PATH. Add it:\n  export PATH="${userBinDir}:$PATH"`;
  }

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
    return { registered, skipped, failed: [`Could not create ${openclawSkillsDir}: ${e instanceof Error ? e.message : String(e)}`] };
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

export async function promptAgentSelection(
  agents: OpenClawAgent[],
): Promise<OpenClawAgent[]> {
  if (agents.length === 0) return [];

  console.log('\nAvailable agents from openclaw.json:');
  agents.forEach((agent, i) => {
    const theme = agent.identity?.theme ?? 'unknown';
    const name = agent.name ?? agent.id;
    console.log(`  ${i + 1}. ${agent.id} — ${name} (${theme})`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      '\nSelect agents to register (comma-separated numbers, e.g. 1,3) or Enter for all: ',
      (answer) => {
        rl.close();
        const trimmed = answer.trim();
        if (!trimmed) {
          resolve(agents);
          return;
        }
        const indices = trimmed
          .split(',')
          .map((s) => parseInt(s.trim(), 10) - 1)
          .filter((idx) => idx >= 0 && idx < agents.length);
        resolve(indices.map((idx) => agents[idx]));
      },
    );
  });
}

// ─── Ensure config (idempotent) ───────────────────────────────────────────────

function ensureConfig(): { configPath: string; isNew: boolean } {
  const existing = loadConfig({});
  if (existing.configPath && fs.existsSync(existing.configPath)) {
    return { configPath: existing.configPath, isNew: false };
  }
  const configPath = writeDefaultConfig(undefined, false);
  return { configPath, isNew: true };
}

// ─── Main onboard function ────────────────────────────────────────────────────

export async function runOnboard(options: RunOnboardOptions): Promise<OnboardResult> {
  const warnings: string[] = [];
  const silent = options.silent ?? false;

  const log = (msg: string) => {
    if (!silent) console.log(msg);
  };

  // 1. Ensure ~/.zigrix base state (idempotent)
  const { configPath } = ensureConfig();
  const loaded = loadConfig({ configPath });
  const paths = resolvePaths(loaded.config);
  ensureBaseState(paths);
  rebuildIndex(paths);

  // 2. Detect OpenClaw
  const openclawHome = detectOpenClawHome();
  const openclawExists = fs.existsSync(openclawHome);
  let openclawConfig: OpenClawConfig | null = null;

  if (!openclawExists) {
    warnings.push(
      `OpenClaw not found at ${openclawHome}. Running in zigrix-only mode.`,
    );
    log(`⚠️  ${warnings[warnings.length - 1]}`);
  } else {
    openclawConfig = loadOpenClawConfig(openclawHome);
    if (!openclawConfig) {
      warnings.push(
        `openclaw.json not found or invalid at ${openclawHome}. Agent import skipped.`,
      );
      log(`⚠️  ${warnings[warnings.length - 1]}`);
    }
  }

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
      const result = registerAgents(loaded.config, selectedAgents);
      agentsRegistered = result.registered;
      agentsSkipped = result.skipped;

      if (agentsRegistered.length > 0) {
        writeConfigFile(configPath, result.config);
        log(`✅ Registered agents: ${agentsRegistered.join(', ')}`);
      }
      if (agentsSkipped.length > 0) {
        log(`⏭️  Already registered (skipped): ${agentsSkipped.join(', ')}`);
      }
    }
  }

  // 4. Seed rules
  const projectDir = options.projectDir ?? process.cwd();
  const rulesSourceDir = path.join(projectDir, 'orchestration', 'rules');
  const rulesTargetDir = paths.rulesDir;

  if (!fs.existsSync(rulesSourceDir)) {
    warnings.push(
      `orchestration/rules/ not found at ${rulesSourceDir}. Rules seeding skipped.`,
    );
    log(`⚠️  ${warnings[warnings.length - 1]}`);
  }

  const { copied: rulesCopied, skipped: rulesSkipped } = seedRules(rulesSourceDir, rulesTargetDir);
  if (rulesCopied.length > 0) {
    log(`✅ Rules copied: ${rulesCopied.join(', ')}`);
  }
  if (rulesSkipped.length > 0) {
    log(`⏭️  Rules already exist (skipped): ${rulesSkipped.join(', ')}`);
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

  // 6. Register OpenClaw skills (symlink skill packs)
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
    configPath,
    paths,
    openclawDetected: openclawExists,
    openclawHome,
    agentsRegistered,
    agentsSkipped,
    rulesCopied,
    rulesSkipped,
    skillsRegistered,
    skillsSkipped,
    skillsFailed,
    pathStabilized: pathResult,
    warnings,
    checks: {
      zigrixInPath: pathResult.alreadyInPath || pathResult.symlinkCreated,
      openclawSkillsDir: openclawSkillsDirExists,
    },
  };
}
