import fs from 'node:fs';

import type { ZigrixConfig } from '../config/schema.js';

export type ZigrixPaths = {
  baseDir: string;
  tasksDir: string;
  promptsDir: string;
  evidenceDir: string;
  eventsFile: string;
  indexFile: string;
  runsDir: string;
  rulesDir: string;
};

export function resolvePaths(config: ZigrixConfig): ZigrixPaths {
  return {
    baseDir: config.paths.baseDir,
    tasksDir: config.paths.tasksDir,
    promptsDir: config.paths.promptsDir,
    evidenceDir: config.paths.evidenceDir,
    eventsFile: config.paths.eventsFile,
    indexFile: config.paths.indexFile,
    runsDir: config.paths.runsDir,
    rulesDir: config.paths.rulesDir,
  };
}

export function ensureBaseState(paths: ZigrixPaths): void {
  fs.mkdirSync(paths.baseDir, { recursive: true });
  fs.mkdirSync(paths.tasksDir, { recursive: true });
  fs.mkdirSync(paths.promptsDir, { recursive: true });
  fs.mkdirSync(paths.evidenceDir, { recursive: true });
  fs.mkdirSync(paths.runsDir, { recursive: true });
  fs.mkdirSync(paths.rulesDir, { recursive: true });
}

/** @deprecated Use ensureBaseState */
export const ensureProjectState = ensureBaseState;
