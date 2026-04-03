export function parsePackOutput(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/\[\s*\{[\s\S]*\}\s*\]$/);
  if (!match) {
    throw new Error('Failed to parse npm pack --json output.');
  }

  const packResult = JSON.parse(match[0])[0];
  if (!packResult || typeof packResult !== 'object') {
    throw new Error('Unexpected npm pack output shape.');
  }

  const files = Array.isArray(packResult.files)
    ? packResult.files.map((file) => String(file?.path ?? '')).filter(Boolean)
    : [];

  return {
    packageSize: Number(packResult.size ?? 0),
    unpackedSize: Number(packResult.unpackedSize ?? 0),
    entryCount: files.length,
    filename: String(packResult.filename ?? ''),
    files,
  };
}

export function toBytes(value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid byte value: ${value}`);
  }

  return Math.floor(value);
}

export function computeThreshold(baselineValue, tolerancePercent) {
  const baseline = toBytes(baselineValue);
  const tolerance = Number(tolerancePercent);
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error(`Invalid tolerance percent: ${tolerancePercent}`);
  }

  return Math.floor(baseline * (1 + tolerance / 100));
}

export function evaluatePackMetrics(actual, baseline, tolerancePercent = 0) {
  const limits = {
    packageSize: computeThreshold(baseline.packageSize, tolerancePercent),
    unpackedSize: computeThreshold(baseline.unpackedSize, tolerancePercent),
    entryCount: computeThreshold(baseline.entryCount, tolerancePercent),
  };

  const violations = [];
  for (const key of ['packageSize', 'unpackedSize', 'entryCount']) {
    if (actual[key] > limits[key]) {
      violations.push({ key, actual: actual[key], limit: limits[key] });
    }
  }

  return {
    pass: violations.length === 0,
    limits,
    violations,
  };
}

export function findForbiddenPackPaths(files, forbiddenPrefixes = []) {
  return files.filter((file) => forbiddenPrefixes.some((prefix) => file.startsWith(prefix)));
}

export function evaluatePackContents(files, forbiddenPrefixes = []) {
  const violations = findForbiddenPackPaths(files, forbiddenPrefixes);
  return {
    pass: violations.length === 0,
    violations,
  };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
