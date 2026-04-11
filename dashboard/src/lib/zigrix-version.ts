import fs from 'node:fs';
import path from 'node:path';

type PackageJson = {
  name?: unknown;
  version?: unknown;
};

function readZigrixVersion(packageJsonPath: string): string | null {
  try {
    const raw = fs.readFileSync(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as PackageJson;

    if (parsed.name !== 'zigrix') return null;
    if (typeof parsed.version !== 'string' || parsed.version.trim().length === 0) return null;

    return parsed.version.trim();
  } catch {
    return null;
  }
}

export function resolveZigrixVersion(
  startDir: string = process.cwd(),
  fallbackVersion: string = process.env.npm_package_version || 'unknown',
): string {
  let dir = path.resolve(startDir);

  while (true) {
    const version = readZigrixVersion(path.join(dir, 'package.json'));
    if (version) return version;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return fallbackVersion;
}
