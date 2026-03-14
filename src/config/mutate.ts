import { defaultConfig } from './defaults.js';
import type { ZigrixConfig } from './schema.js';
import { zigrixConfigSchema } from './schema.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function parseConfigInput(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function getValueAtPath(value: unknown, dottedPath?: string): unknown {
  if (!dottedPath) return value;
  return dottedPath.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

export function setValueAtPath<T extends Record<string, unknown>>(target: T, dottedPath: string, nextValue: unknown): T {
  const root = clone(target) as Record<string, unknown>;
  const keys = dottedPath.split('.').filter(Boolean);
  if (keys.length === 0) {
    return clone(nextValue) as T;
  }

  let cursor: Record<string, unknown> = root;
  for (const key of keys.slice(0, -1)) {
    const current = cursor[key];
    if (!isObject(current)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys.at(-1) as string] = clone(nextValue);
  return root as T;
}

export function resetValueAtPath(config: ZigrixConfig, dottedPath?: string): ZigrixConfig {
  const defaults = clone(defaultConfig) as unknown as ZigrixConfig;
  if (!dottedPath || dottedPath === 'all') {
    return zigrixConfigSchema.parse(defaults);
  }
  const defaultValue = getValueAtPath(defaults, dottedPath);
  if (defaultValue === undefined) {
    throw new Error(`default path not found: ${dottedPath}`);
  }
  return zigrixConfigSchema.parse(setValueAtPath(config as unknown as Record<string, unknown>, dottedPath, defaultValue));
}

export function diffValues(current: unknown, baseline: unknown): { changed: boolean; current: unknown; baseline: unknown } {
  return {
    changed: JSON.stringify(current) !== JSON.stringify(baseline),
    current,
    baseline,
  };
}
