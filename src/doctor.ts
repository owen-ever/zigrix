import fs from 'node:fs';
import path from 'node:path';

import type { LoadedConfig } from './config/load.js';
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

  const payload = {
    node: {
      executable: process.execPath,
      version: process.versions.node,
      ok: Number(process.versions.node.split('.')[0]) >= 22,
    },
    paths: {
      projectRoot: loaded.projectRoot,
      configPath: loaded.configPath,
      projectState: paths.projectState,
      tasksDir: paths.tasksDir,
      promptsDir: paths.promptsDir,
      evidenceDir: paths.evidenceDir,
      runsDir: paths.runsDir,
    },
    files: {
      configExists: loaded.configPath ? fs.existsSync(loaded.configPath) : false,
      projectStateExists: fs.existsSync(paths.projectState),
      indexExists: fs.existsSync(paths.indexFile),
      eventsExists: fs.existsSync(paths.eventsFile),
    },
    writeAccess: {
      projectRoot: existsWritable(loaded.projectRoot),
      configPath: loaded.configPath ? existsWritable(loaded.configPath) : existsWritable(path.join(loaded.projectRoot, 'zigrix.config.json')),
      stateParent: existsWritable(paths.projectState),
    },
    binaries: {
      node: process.execPath,
      npm: process.env.npm_execpath ?? null,
      openclaw: null,
    },
    openclaw: {
      home: openclawHome,
      exists: fs.existsSync(openclawHome),
      skillsDir: openclawSkillsDir,
      skillsDirExists: fs.existsSync(openclawSkillsDir),
    },
  };

  if (!payload.node.ok) warnings.push('Node.js 22+ is required.');
  if (!payload.files.configExists) warnings.push('zigrix.config.json not found. Run `zigrix init --yes`.');
  if (!payload.writeAccess.projectRoot) warnings.push('Project root is not writable.');
  if (!payload.openclaw.exists) warnings.push('~/.openclaw not found. OpenClaw integration remains optional.');

  return {
    ...payload,
    summary: {
      ready: payload.node.ok && payload.writeAccess.projectRoot,
      warnings,
    },
  };
}

export function renderDoctorText(payload: Record<string, any>): string {
  const lines = [
    'Zigrix Doctor',
    `- Node: ${payload.node.version} (${payload.node.ok ? 'ok' : 'too old'})`,
    `- Project root: ${payload.paths.projectRoot}`,
    `- Config: ${payload.paths.configPath ?? 'missing'}`,
    `- Project state: ${payload.paths.projectState} (${payload.files.projectStateExists ? 'present' : 'missing'})`,
    `- OpenClaw home: ${payload.openclaw.home} (${payload.openclaw.exists ? 'present' : 'missing'})`,
    `- Ready: ${payload.summary.ready ? 'yes' : 'no'}`,
  ];
  for (const warning of payload.summary.warnings as string[]) {
    lines.push(`- Warning: ${warning}`);
  }
  return lines.join('\n');
}
