import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  buildDefaultConfig,
  CONFIG_FILENAME,
  expandTilde,
  resolveAbsolutePath,
  resolveCanonicalConfigHome,
  resolveCanonicalConfigPath,
  resolveDefaultWorkspaceDir,
} from './defaults.js';
import { type ZigrixConfig, zigrixConfigSchema } from './schema.js';

export type LoadedConfig = {
  config: ZigrixConfig;
  configPath: string;
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

function resolveConfigPath(explicitPath?: string): string {
  if (explicitPath) {
    return resolveAbsolutePath(explicitPath);
  }
  return resolveCanonicalConfigPath();
}

function resolvePathLike(value: unknown, baseDir: string, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const expanded = expandTilde(trimmed);
  if (path.isAbsolute(expanded)) return path.resolve(expanded);
  return path.resolve(baseDir, expanded);
}

function normalizeConfigPaths(config: ZigrixConfig): ZigrixConfig {
  const copy = structuredClone(config);

  const configHome = resolveCanonicalConfigHome();
  const resolvedBaseDir = resolvePathLike(copy.paths.baseDir, configHome, configHome);
  copy.paths.baseDir = resolvedBaseDir;
  copy.paths.tasksDir = resolvePathLike(copy.paths.tasksDir, resolvedBaseDir, path.join(resolvedBaseDir, 'tasks'));
  copy.paths.evidenceDir = resolvePathLike(copy.paths.evidenceDir, resolvedBaseDir, path.join(resolvedBaseDir, 'evidence'));
  copy.paths.promptsDir = resolvePathLike(copy.paths.promptsDir, resolvedBaseDir, path.join(resolvedBaseDir, 'prompts'));
  copy.paths.eventsFile = resolvePathLike(copy.paths.eventsFile, resolvedBaseDir, path.join(resolvedBaseDir, 'tasks.jsonl'));
  copy.paths.indexFile = resolvePathLike(copy.paths.indexFile, resolvedBaseDir, path.join(resolvedBaseDir, 'index.json'));
  copy.paths.runsDir = resolvePathLike(copy.paths.runsDir, resolvedBaseDir, path.join(resolvedBaseDir, 'runs'));
  copy.paths.rulesDir = resolvePathLike(copy.paths.rulesDir, resolvedBaseDir, path.join(resolvedBaseDir, 'rules'));

  const configuredWorkspace = typeof copy.workspace.projectsBaseDir === 'string'
    ? copy.workspace.projectsBaseDir.trim()
    : '';
  copy.workspace.projectsBaseDir = configuredWorkspace.length > 0
    ? resolvePathLike(configuredWorkspace, resolvedBaseDir, resolveDefaultWorkspaceDir(resolvedBaseDir))
    : resolveDefaultWorkspaceDir(resolvedBaseDir);

  if (typeof copy.openclaw.home === 'string' && copy.openclaw.home.trim().length > 0) {
    copy.openclaw.home = resolveAbsolutePath(copy.openclaw.home);
  }
  if (typeof copy.openclaw.binPath === 'string' && copy.openclaw.binPath.trim().length > 0) {
    copy.openclaw.binPath = resolveAbsolutePath(copy.openclaw.binPath);
  }

  return copy;
}

function resolveBaseDirHint(parsed: unknown, fallback: string): string {
  if (isObject(parsed) && isObject(parsed.paths) && typeof parsed.paths.baseDir === 'string') {
    const configured = parsed.paths.baseDir.trim();
    if (configured.length > 0) {
      const expanded = expandTilde(configured);
      return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(fallback, expanded);
    }
  }
  return fallback;
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

export function normalizeConfig(input: ZigrixConfig): ZigrixConfig {
  const normalized = normalizeConfigPaths(input);
  return zigrixConfigSchema.parse(normalized);
}

export function loadConfig(options?: { configPath?: string }): LoadedConfig {
  const configPath = resolveConfigPath(options?.configPath);
  const parsed = fs.existsSync(configPath) ? parseConfigFile(configPath) : {};
  const defaultBaseDir = resolveBaseDirHint(parsed, resolveCanonicalConfigHome());
  const defaults = buildDefaultConfig(defaultBaseDir) as unknown as ZigrixConfig;
  const merged = deepMerge(structuredClone(defaults), parsed);
  const withEnv = applyEnvOverrides(merged);
  const result = normalizeConfig(withEnv);
  return { config: result, configPath, baseDir: result.paths.baseDir };
}

export function writeConfigFile(targetPath: string, config: ZigrixConfig): string {
  const resolvedPath = resolveAbsolutePath(targetPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const normalized = normalizeConfig(config);
  fs.writeFileSync(resolvedPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return resolvedPath;
}

export function writeDefaultConfig(force = false): string {
  const configHome = resolveCanonicalConfigHome();
  const targetPath = resolveCanonicalConfigPath();
  if (fs.existsSync(targetPath) && !force) {
    throw new Error(`config already exists: ${targetPath}`);
  }
  fs.mkdirSync(configHome, { recursive: true });
  return writeConfigFile(targetPath, buildDefaultConfig(configHome) as unknown as ZigrixConfig);
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

export { CONFIG_FILENAME };
