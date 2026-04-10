import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillPath = path.join(repoRoot, 'skills', 'oz', 'SKILL.md');

describe('oz skill', () => {
  it('exists as a bundled OpenClaw skill', () => {
    expect(fs.existsSync(skillPath)).toBe(true);
  });

  it('documents /oz and semantic delegation routing', () => {
    const raw = fs.readFileSync(skillPath, 'utf8');
    expect(raw).toContain('name: oz');
    expect(raw).toContain('/oz');
    expect(raw).toContain('semantically');
    expect(raw).toContain('zigrix task dispatch');
  });
});
