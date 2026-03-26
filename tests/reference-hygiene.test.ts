import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedExtensions = new Set(['.md', '.ts', '.tsx', '.js', '.json', '.sh']);
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', '.next', 'coverage', '.scratch']);
const ignoredFiles = new Set(['tests/reference-hygiene.test.ts']);
const blockedPatterns: Array<{ label: string; regex: RegExp }> = [
  { label: 'owner absolute path leak', regex: /\/Users\/janos\// },
  { label: 'legacy orchestration rules path', regex: /orchestration\/rules\// },
  { label: 'legacy workspace orchestration path', regex: /workspace\/orchestration/ },
  { label: 'openclaw workspace runtime path leak', regex: /<OPENCLAW_HOME>\/workspace/ },
  { label: 'external personal policy path leak', regex: /public-knowledge\/policies/ },
  { label: 'legacy zig agent ids', regex: /\b(pro-zig|qa-zig|front-zig|back-zig|sec-zig|sys-zig)\b/ },
  { label: 'legacy python subtree reference', regex: /legacy-python/ },
  { label: 'legacy orchestration helper reference', regex: /\b(dev_start\.py|dev_finalize\.py|orch_prepare_worker\.py|orch_register_worker\.py|orch_complete_worker\.py)\b/ },
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (allowedExtensions.has(path.extname(entry.name))) {
      const rel = path.relative(repoRoot, full);
      if (!ignoredFiles.has(rel)) acc.push(full);
    }
  }
  return acc;
}

describe('reference hygiene', () => {
  it('does not ship stale local/private path contracts in source, rules, docs, or tests', () => {
    const files = walk(repoRoot);
    const hits: string[] = [];

    for (const file of files) {
      const rel = path.relative(repoRoot, file);
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split(/\r?\n/);

      lines.forEach((line, idx) => {
        for (const pattern of blockedPatterns) {
          if (pattern.regex.test(line)) {
            hits.push(`${rel}:${idx + 1} [${pattern.label}] ${line.trim()}`);
          }
        }
      });
    }

    expect(hits).toEqual([]);
  });
});
