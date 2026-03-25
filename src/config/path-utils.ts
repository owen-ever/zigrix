import os from 'node:os';
import path from 'node:path';

export function resolveHomeDir(): string {
  return os.homedir();
}

export function expandUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  const home = resolveHomeDir();
  if (trimmed === '~') return home;
  if (trimmed.startsWith('~/')) return path.join(home, trimmed.slice(2));

  return path.resolve(trimmed);
}

export function resolveDefaultZigrixHome(): string {
  const fromEnv = process.env.ZIGRIX_HOME;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return expandUserPath(fromEnv);
  }
  return path.join(resolveHomeDir(), '.zigrix');
}

export function resolveDefaultWorkspaceBaseDir(): string {
  return path.join(resolveDefaultZigrixHome(), 'workspace');
}
