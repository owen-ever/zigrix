import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';

import { defaultConfig, ZIGRIX_HOME } from './defaults.js';
import { expandUserPath } from './path-utils.js';
import { type ZigrixConfig, zigrixConfigSchema } from './schema.js';

const CONFIG_CANDIDATES = [
  'zigrix.config.json',
  'zigrix.config.yaml',
  'zigrix.config.yml',
] as const;

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
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    return YAML.parse(raw);
  }
  return JSON.parse(raw);
}

function resolveConfigPath(baseDir: string, explicitPath?: string): string | null {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }

  for (const candidate of CONFIG_CANDIDATES) {
    const fullPath = path.join(baseDir, candidate);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

function normalizePathFields(config: ZigrixConfig): ZigrixConfig {
  const copy = structuredClone(config);

  copy.paths.baseDir = expandUserPath(copy.paths.baseDir);
  copy.paths.tasksDir = expandUserPath(copy.paths.tasksDir);
  copy.paths.evidenceDir = expandUserPath(copy.paths.evidenceDir);
  copy.paths.promptsDir = expandUserPath(copy.paths.promptsDir);
  copy.paths.eventsFile = expandUserPath(copy.paths.eventsFile);
  copy.paths.indexFile = expandUserPath(copy.paths.indexFile);
  copy.paths.runsDir = expandUserPath(copy.paths.runsDir);
  copy.paths.rulesDir = expandUserPath(copy.paths.rulesDir);

  if (copy.workspace.projectsBaseDir) {
    copy.workspace.projectsBaseDir = expandUserPath(copy.workspace.projectsBaseDir);
  }

  if (copy.openclaw.home) {
    copy.openclaw.home = expandUserPath(copy.openclaw.home);
  }

  return copy;
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
  const baseDir = path.resolve(options?.baseDir ?? ZIGRIX_HOME);
  const configPath = resolveConfigPath(baseDir, options?.configPath);
  const parsed = configPath ? parseConfigFile(configPath) : {};
  const merged = deepMerge(structuredClone(defaultConfig) as unknown as ZigrixConfig, parsed);
  const normalized = normalizePathFields(merged);
  const withEnv = applyEnvOverrides(normalized);
  const result = zigrixConfigSchema.parse(withEnv);
  return { config: result, configPath, baseDir };
}

export function writeConfigFile(targetPath: string, config: ZigrixConfig): string {
  const resolvedPath = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(zigrixConfigSchema.parse(config), null, 2)}\n`, 'utf8');
  return resolvedPath;
}

export function writeDefaultConfig(baseDir?: string, force = false): string {
  const resolvedBase = path.resolve(baseDir ?? ZIGRIX_HOME);
  const targetPath = path.join(resolvedBase, 'zigrix.config.json');
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
