import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function expandTilde(input: string): string {
  if (!input) return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function toAbsolute(input: string, baseDir: string): string {
  const expanded = expandTilde(input);
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(baseDir, expanded);
}

export function getCanonicalConfigHome(): string {
  return path.join(os.homedir(), '.zigrix');
}

export function getCanonicalConfigPath(configHome = getCanonicalConfigHome()): string {
  return path.join(configHome, 'zigrix.config.json');
}

export function readCanonicalConfigSnapshot<T extends object>(configHome = getCanonicalConfigHome()): T | null {
  const configPath = getCanonicalConfigPath(configHome);
  try {
    if (!fs.existsSync(configPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export function resolveConfiguredBaseDir(configuredBaseDir?: string): string {
  const configHome = getCanonicalConfigHome();
  if (typeof configuredBaseDir === 'string' && configuredBaseDir.trim().length > 0) {
    return toAbsolute(configuredBaseDir, configHome);
  }
  return configHome;
}
