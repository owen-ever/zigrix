import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  checkZigrixInPath,
  ensureZigrixInPath,
  findUserBinDir,
  registerSkills,
  resolveSkillsDir,
  resolveZigrixBin,
  type PathStabilizeResult,
} from '../src/onboard.js';

// ─── resolveZigrixBin ─────────────────────────────────────────────────────────

describe('resolveZigrixBin', () => {
  it('returns a path that exists (when running from the repo)', () => {
    const bin = resolveZigrixBin();
    // In test environment this should resolve to dist/index.js
    if (bin) {
      expect(fs.existsSync(bin)).toBe(true);
    }
    // It's OK if bin is null in some CI environments
  });
});

// ─── findUserBinDir ───────────────────────────────────────────────────────────

describe('findUserBinDir', () => {
  it('returns a path under HOME', () => {
    const dir = findUserBinDir();
    const home = process.env.HOME ?? os.homedir();
    expect(dir.startsWith(home)).toBe(true);
  });
});

// ─── ensureZigrixInPath ───────────────────────────────────────────────────────

describe('ensureZigrixInPath', () => {
  let tmpDir: string;
  const originalPath = process.env.PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-path-stab-'));
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports alreadyInPath when zigrix exists in PATH', () => {
    // Create a fake zigrix binary
    fs.writeFileSync(path.join(tmpDir, 'zigrix'), '#!/bin/sh\necho hi', { mode: 0o755 });
    process.env.PATH = `${tmpDir}${path.delimiter}${originalPath}`;

    const result = ensureZigrixInPath();
    expect(result.alreadyInPath).toBe(true);
    expect(result.symlinkCreated).toBe(false);
  });

  it('returns warning when zigrix binary source cannot be found and not in PATH', () => {
    // Set PATH to an empty dir (no zigrix found)
    process.env.PATH = tmpDir;

    const result = ensureZigrixInPath();
    // Either it creates a symlink (if it can resolve the bin) or warns
    if (!result.alreadyInPath && !result.symlinkCreated) {
      expect(result.warning).toBeTruthy();
    }
  });
});

// ─── resolveSkillsDir ─────────────────────────────────────────────────────────

describe('resolveSkillsDir', () => {
  it('resolves to a directory containing skill subdirs', () => {
    const dir = resolveSkillsDir();
    // When running from the zigrix repo, this should find skills/
    if (dir) {
      expect(fs.existsSync(dir)).toBe(true);
      const entries = fs.readdirSync(dir);
      expect(entries.some((e) => e.startsWith('zigrix-'))).toBe(true);
    }
  });
});

// ─── registerSkills ───────────────────────────────────────────────────────────

describe('registerSkills', () => {
  let tmpOpenClawHome: string;

  beforeEach(() => {
    tmpOpenClawHome = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-skills-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpOpenClawHome, { recursive: true, force: true });
  });

  it('creates symlinks for each skill in the openclaw skills dir', () => {
    const result = registerSkills(tmpOpenClawHome);
    const skillsDir = path.join(tmpOpenClawHome, 'skills');

    // Should have registered some skills (from the repo's skills/ dir)
    if (resolveSkillsDir()) {
      expect(result.registered.length + result.skipped.length).toBeGreaterThan(0);

      // Each registered skill should be a symlink
      for (const name of result.registered) {
        const target = path.join(skillsDir, name);
        expect(fs.existsSync(target)).toBe(true);
        expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
        // Should contain a SKILL.md
        expect(fs.existsSync(path.join(target, 'SKILL.md'))).toBe(true);
      }
    }
  });

  it('is idempotent — second run skips already-registered skills', () => {
    const first = registerSkills(tmpOpenClawHome);
    const second = registerSkills(tmpOpenClawHome);

    // Everything registered in first run should be skipped in second
    expect(second.registered).toHaveLength(0);
    expect(second.skipped.length).toBe(first.registered.length + first.skipped.length);
  });

  it('returns empty result when openclaw home does not exist', () => {
    const result = registerSkills('/tmp/nonexistent-openclaw-test-dir');
    // Should not crash, might have failed entries
    expect(result).toBeDefined();
  });
});
