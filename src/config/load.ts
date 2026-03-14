import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';

import { defaultConfig } from './defaults.js';
import { type ZigrixConfig, zigrixConfigSchema } from './schema.js';

const CONFIG_CANDIDATES = [
  'zigrix.config.json',
  'zigrix.config.yaml',
  'zigrix.config.yml',
  '.zigrixrc.json',
  '.zigrixrc.yaml',
  '.zigrixrc.yml',
] as const;

export type LoadedConfig = {
  config: ZigrixConfig;
  configPath: string | null;
  projectRoot: string;
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

function resolveConfigPath(projectRoot: string, explicitPath?: string): string | null {
  if (explicitPath) {
    return path.resolve(projectRoot, explicitPath);
  }

  for (const candidate of CONFIG_CANDIDATES) {
    const fullPath = path.join(projectRoot, candidate);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
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
  if (process.env.ZIGRIX_STATE_DIR) {
    copy.paths.stateDir = process.env.ZIGRIX_STATE_DIR;
  }
  if (process.env.ZIGRIX_RUNS_DIR) {
    copy.paths.runsDir = process.env.ZIGRIX_RUNS_DIR;
  }
  return copy;
}

export function loadConfig(options?: { projectRoot?: string; configPath?: string }): LoadedConfig {
  const projectRoot = path.resolve(options?.projectRoot ?? process.cwd());
  const configPath = resolveConfigPath(projectRoot, options?.configPath);
  const parsed = configPath ? parseConfigFile(configPath) : {};
  const merged = deepMerge(structuredClone(defaultConfig) as unknown as ZigrixConfig, parsed);
  const withEnv = applyEnvOverrides(merged);
  const result = zigrixConfigSchema.parse(withEnv);
  return { config: result, configPath, projectRoot };
}

export function writeConfigFile(targetPath: string, config: ZigrixConfig): string {
  const resolvedPath = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(zigrixConfigSchema.parse(config), null, 2)}\n`, 'utf8');
  return resolvedPath;
}

export function writeDefaultConfig(targetDir: string, force = false): string {
  const projectRoot = path.resolve(targetDir);
  const targetPath = path.join(projectRoot, 'zigrix.config.json');
  if (fs.existsSync(targetPath) && !force) {
    throw new Error(`config already exists: ${targetPath}`);
  }
  fs.mkdirSync(projectRoot, { recursive: true });
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
