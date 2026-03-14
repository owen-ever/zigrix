import fs from 'node:fs';
import path from 'node:path';

import type { ZigrixConfig } from '../config/schema.js';

export type ZigrixPaths = {
  projectRoot: string;
  projectState: string;
  tasksDir: string;
  promptsDir: string;
  evidenceDir: string;
  eventsFile: string;
  indexFile: string;
  runsDir: string;
};

export function resolvePaths(projectRoot: string, config: ZigrixConfig): ZigrixPaths {
  const root = path.resolve(projectRoot);
  const stateDir = path.resolve(root, config.paths.stateDir);
  return {
    projectRoot: root,
    projectState: stateDir,
    tasksDir: path.resolve(root, config.paths.tasksDir),
    promptsDir: path.resolve(root, config.paths.promptsDir),
    evidenceDir: path.resolve(root, config.paths.evidenceDir),
    eventsFile: path.resolve(root, config.paths.eventsFile),
    indexFile: path.resolve(root, config.paths.indexFile),
    runsDir: path.resolve(root, config.paths.runsDir),
  };
}

export function ensureProjectState(paths: ZigrixPaths): void {
  fs.mkdirSync(paths.projectState, { recursive: true });
  fs.mkdirSync(paths.tasksDir, { recursive: true });
  fs.mkdirSync(paths.promptsDir, { recursive: true });
  fs.mkdirSync(paths.evidenceDir, { recursive: true });
  fs.mkdirSync(paths.runsDir, { recursive: true });
}
