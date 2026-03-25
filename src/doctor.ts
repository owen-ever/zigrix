import fs from 'node:fs';
import path from 'node:path';

import type { LoadedConfig } from './config/load.js';
import type { ZigrixConfig } from './config/schema.js';
import type { ZigrixPaths } from './state/paths.js';

function existsWritable(targetPath: string): boolean {
  try {
    return fs.existsSync(targetPath) ? fs.accessSync(targetPath, fs.constants.W_OK) === undefined : fs.accessSync(path.dirname(targetPath), fs.constants.W_OK) === undefined;
  } catch {
    return false;
  }
}

function detectOpenClawHome(): string {
  return process.env.OPENCLAW_HOME ? path.resolve(process.env.OPENCLAW_HOME) : path.join(process.env.HOME ?? '~', '.openclaw');
}

export function gatherDoctor(loaded: LoadedConfig, paths: ZigrixPaths): Record<string, unknown> {
  const openclawHome = detectOpenClawHome();
  const openclawSkillsDir = path.join(openclawHome, 'skills');
  const warnings: string[] = [];

  const rulesDir = paths.rulesDir;
  const ruleFiles = fs.existsSync(rulesDir)
    ? fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md')).sort()
    : [];

  // Non-login shell PATH reachability check
  const nonLoginShellPaths = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const zigrixInNonLoginPath = nonLoginShellPaths.some((dir) => {
    try {
      return fs.existsSync(path.join(dir, 'zigrix'));
    } catch {
      return false;
    }
  });
  const zigrixNonLoginLocation = nonLoginShellPaths.find((dir) => {
    try {
      return fs.existsSync(path.join(dir, 'zigrix'));
    } catch {
      return false;
    }
  }) ?? null;

  const openclawInNonLoginPath = nonLoginShellPaths.some((dir) => {
    try {
      return fs.existsSync(path.join(dir, 'openclaw'));
    } catch {
      return false;
    }
  });
  const openclawNonLoginLocation = nonLoginShellPaths.find((dir) => {
    try {
      return fs.existsSync(path.join(dir, 'openclaw'));
    } catch {
      return false;
    }
  }) ?? null;

  const payload = {
    node: {
      executable: process.execPath,
      version: process.versions.node,
      ok: Number(process.versions.node.split('.')[0]) >= 22,
    },
    paths: {
      baseDir: loaded.baseDir,
      configPath: loaded.configPath,
      tasksDir: paths.tasksDir,
      promptsDir: paths.promptsDir,
      evidenceDir: paths.evidenceDir,
      runsDir: paths.runsDir,
      rulesDir: paths.rulesDir,
    },
    files: {
      configExists: loaded.configPath ? fs.existsSync(loaded.configPath) : false,
      baseDirExists: fs.existsSync(paths.baseDir),
      indexExists: fs.existsSync(paths.indexFile),
      eventsExists: fs.existsSync(paths.eventsFile),
    },
    rules: {
      dir: rulesDir,
      exists: fs.existsSync(rulesDir),
      files: ruleFiles,
      count: ruleFiles.length,
    },
    writeAccess: {
      baseDir: existsWritable(paths.baseDir),
      configPath: loaded.configPath ? existsWritable(loaded.configPath) : existsWritable(path.join(paths.baseDir, 'zigrix.config.json')),
    },
    binaries: {
      node: process.execPath,
      npm: process.env.npm_execpath ?? null,
      openclaw: (loaded.config as ZigrixConfig).openclaw?.binPath ?? null,
    },
    openclaw: {
      home: openclawHome,
      exists: fs.existsSync(openclawHome),
      skillsDir: openclawSkillsDir,
      skillsDirExists: fs.existsSync(openclawSkillsDir),
    },
    pathReach: {
      nonLoginShellPaths,
      zigrixInNonLoginPath,
      zigrixNonLoginLocation,
      openclawInNonLoginPath,
      openclawNonLoginLocation,
    },
  };

  if (!payload.node.ok) warnings.push('Node.js 22+ is required.');
  if (!payload.files.configExists) warnings.push('zigrix.config.json not found. Run `zigrix onboard`.');
  if (!payload.files.baseDirExists) warnings.push(`${paths.baseDir} not found. Run \`zigrix onboard\`.`);
  if (!payload.writeAccess.baseDir) warnings.push('Base directory is not writable.');
  if (!payload.openclaw.exists) warnings.push(`${openclawHome} not found. OpenClaw integration remains optional.`);
  if (payload.rules.count === 0) warnings.push('No rule files found in rules directory. Seed from orchestration/rules/.');
  if (!payload.pathReach.zigrixInNonLoginPath) {
    warnings.push(
      'zigrix is not reachable from non-login shell PATH (checked: /usr/local/bin, /usr/bin). ' +
      'Run `zigrix onboard` or manually: sudo ln -sfn $(which zigrix) /usr/local/bin/zigrix',
    );
  }
  if (!payload.pathReach.openclawInNonLoginPath) {
    warnings.push(
      'openclaw is not reachable from non-login shell PATH (checked: /usr/local/bin, /usr/bin). ' +
      'Run `zigrix onboard` or manually: sudo ln -sfn $(which openclaw) /usr/local/bin/openclaw',
    );
  }

  return {
    ...payload,
    summary: {
      ready: payload.node.ok && payload.writeAccess.baseDir && payload.files.configExists,
      warnings,
    },
  };
}

export function renderDoctorText(payload: Record<string, any>): string {
  const lines = [
    'Zigrix Doctor',
    `- Node: ${payload.node.version} (${payload.node.ok ? 'ok' : 'too old'})`,
    `- Base dir: ${payload.paths.baseDir}`,
    `- Config: ${payload.paths.configPath ?? 'missing'}`,
    `- Rules dir: ${payload.rules.dir} (${payload.rules.count} files)`,
    `- OpenClaw home: ${payload.openclaw.home} (${payload.openclaw.exists ? 'present' : 'missing'})`,
    `- Non-login PATH reach (zigrix): ${payload.pathReach.zigrixInNonLoginPath ? `yes (${payload.pathReach.zigrixNonLoginLocation})` : 'no'}`,
    `- Non-login PATH reach (openclaw): ${payload.pathReach.openclawInNonLoginPath ? `yes (${payload.pathReach.openclawNonLoginLocation})` : 'no'}`,
    `- Ready: ${payload.summary.ready ? 'yes' : 'no'}`,
  ];
  for (const warning of payload.summary.warnings as string[]) {
    lines.push(`- Warning: ${warning}`);
  }
  return lines.join('\n');
}
