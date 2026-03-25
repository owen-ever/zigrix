import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  defaultConfig,
  resolveAbsolutePath,
  resolveDefaultWorkspaceDir,
  resolveZigrixHome,
  ZIGRIX_HOME,
} from './defaults.js';
import { type ZigrixConfig, zigrixConfigSchema } from './schema.js';

const CONFIG_FILENAME = 'zigrix.config.json';

export type LoadedConfig = {
  config: ZigrixConfig;
  configPath: string | null;
  baseDir: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isObject(base) || !isObject(override)) {
    return (override as T) ?? base;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    if (isObject(current) && isObject(value)) {
      merged[key] = deepMerge(current, value);
    } else {
      merged[key] = value;
    }
  }
  return merged as T;
}

function parseConfigFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function resolveConfigPath(baseDir: string, explicitPath?: string): string | null {
  if (explicitPath) {
    return resolveAbsolutePath(explicitPath);
  }

  const fullPath = path.join(baseDir, CONFIG_FILENAME);
  return fs.existsSync(fullPath) ? fullPath : null;
}

function normalizeConfigPaths(config: ZigrixConfig, baseDir: string): ZigrixConfig {
  const normalized = structuredClone(config);

  normalized.paths.baseDir = resolveAbsolutePath(normalized.paths.baseDir || baseDir);
  normalized.paths.tasksDir = resolveAbsolutePath(normalized.paths.tasksDir || path.join(normalized.paths.baseDir, 'tasks'));
  normalized.paths.evidenceDir = resolveAbsolutePath(normalized.paths.evidenceDir || path.join(normalized.paths.baseDir, 'evidence'));
  normalized.paths.promptsDir = resolveAbsolutePath(normalized.paths.promptsDir || path.join(normalized.paths.baseDir, 'prompts'));
  normalized.paths.eventsFile = resolveAbsolutePath(normalized.paths.eventsFile || path.join(normalized.paths.baseDir, 'tasks.jsonl'));
  normalized.paths.indexFile = resolveAbsolutePath(normalized.paths.indexFile || path.join(normalized.paths.baseDir, 'index.json'));
  normalized.paths.runsDir = resolveAbsolutePath(normalized.paths.runsDir || path.join(normalized.paths.baseDir, 'runs'));
  normalized.paths.rulesDir = resolveAbsolutePath(normalized.paths.rulesDir || path.join(normalized.paths.baseDir, 'rules'));

  const workspaceDir = normalized.workspace.projectsBaseDir?.trim();
  normalized.workspace.projectsBaseDir = resolveAbsolutePath(
    workspaceDir && workspaceDir.length > 0
      ? workspaceDir
      : resolveDefaultWorkspaceDir(normalized.paths.baseDir),
  );

  const openclawHome = normalized.openclaw.home?.trim();
  normalized.openclaw.home = openclawHome ? resolveAbsolutePath(openclawHome) : '';

  return normalized;
}

function applyEnvOverrides(config: ZigrixConfig): ZigrixConfig {
  const copy = structuredClone(config);
  if (process.env.ZIGRIX_OUTPUT_MODE === 'text' || process.env.ZIGRIX_OUTPUT_MODE === 'json') {
    copy.runtime.outputMode = process.env.ZIGRIX_OUTPUT_MODE;
  }
  if (process.env.ZIGRIX_JSON_INDENT) {
    const indent = Number(process.env.ZIGRIX_JSON_INDENT);
    if (!Number.isNaN(indent)) {
      copy.runtime.jsonIndent = indent;
    }
  }
  return copy;
}

export function loadConfig(options?: { baseDir?: string; configPath?: string }): LoadedConfig {
  const baseDir = resolveAbsolutePath(options?.baseDir ?? resolveZigrixHome());
  const configPath = resolveConfigPath(baseDir, options?.configPath);
  const parsed = configPath ? parseConfigFile(configPath) : {};
  const merged = deepMerge(structuredClone(defaultConfig) as unknown as ZigrixConfig, parsed);
  const withEnv = applyEnvOverrides(merged);
  const normalized = normalizeConfigPaths(withEnv, baseDir);
  const result = zigrixConfigSchema.parse(normalized);
  return { config: result, configPath, baseDir };
}

export function writeConfigFile(targetPath: string, config: ZigrixConfig): string {
  const resolvedPath = resolveAbsolutePath(targetPath);
  const normalized = normalizeConfigPaths(zigrixConfigSchema.parse(config), path.dirname(resolvedPath));
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(zigrixConfigSchema.parse(normalized), null, 2)}\n`, 'utf8');
  return resolvedPath;
}

export function writeDefaultConfig(baseDir?: string, force = false): string {
  const resolvedBase = resolveAbsolutePath(baseDir ?? ZIGRIX_HOME);
  const targetPath = path.join(resolvedBase, CONFIG_FILENAME);
  if (fs.existsSync(targetPath) && !force) {
    throw new Error(`config already exists: ${targetPath}`);
  }
  fs.mkdirSync(resolvedBase, { recursive: true });
  return writeConfigFile(targetPath, structuredClone(defaultConfig) as unknown as ZigrixConfig);
}

export function getConfigValue(config: ZigrixConfig, dottedPath?: string): unknown {
  if (!dottedPath) return config;
  return dottedPath.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, config);
}
