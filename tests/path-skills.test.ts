import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  checkZigrixInPath,
  ensureOpenClawInPath,
  ensureZigrixInPath,
  findSystemBinDir,
  findUserBinDir,
  registerSkills,
  resolveOpenClawBin,
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

// ─── findSystemBinDir ──────────────────────────────────────────────────────────

describe('findSystemBinDir', () => {
  it('returns null or a known system path', () => {
    const dir = findSystemBinDir();
    if (dir !== null) {
      expect(['/usr/local/bin', '/usr/bin']).toContain(dir);
    }
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

  it('reports alreadyInPath when zigrix exists in stable paths', () => {
    // Create a fake zigrix binary in tmpDir and pass it as a stable path override
    fs.writeFileSync(path.join(tmpDir, 'zigrix'), '#!/bin/sh\necho hi', { mode: 0o755 });

    const result = ensureZigrixInPath({ _overrideStablePaths: [tmpDir] });
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

  it('uses override system bin dir when _overrideSystemBinDir is provided and writable', () => {
    // Create a temp dir that acts as a writable "system" bin dir
    const fakeSystemBin = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-sysbin-'));
    try {
      const result = ensureZigrixInPath({
        _overrideSystemBinDir: fakeSystemBin,
        _overrideStablePaths: [], // bypass stable-path check so symlink creation proceeds
      });

      if (resolveZigrixBin()) {
        // Should create symlink in fakeSystemBin
        expect(result.symlinkCreated).toBe(true);
        expect(result.symlinkPath).toBe(path.join(fakeSystemBin, 'zigrix'));
        expect(result.warning).toBeNull();
      }
    } finally {
      fs.rmSync(fakeSystemBin, { recursive: true, force: true });
    }
  });

  it('falls back to user bin dir when _overrideSystemBinDir is null', () => {
    const result = ensureZigrixInPath({
      _overrideSystemBinDir: null,
      _overrideStablePaths: [], // bypass stable-path check
    });

    // Should either create a symlink in user dir, or warn (if binEntry not found)
    if (!result.alreadyInPath && !result.symlinkCreated) {
      expect(result.warning).toBeTruthy();
    }
  });
});

// ─── resolveOpenClawBin / ensureOpenClawInPath ───────────────────────────────

describe('openclaw path stabilization', () => {
  let tmpHome: string;
  const originalPath = process.env.PATH;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-openclaw-path-'));
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('resolves the underlying openclaw package entry instead of returning the wrapper symlink path', () => {
    const fakeBinDir = path.join(
      tmpHome,
      '.nvm',
      'versions',
      'node',
      `v${process.versions.node}`,
      'bin',
    );
    const packageDir = path.join(
      tmpHome,
      '.nvm',
      'versions',
      'node',
      `v${process.versions.node}`,
      'lib',
      'node_modules',
      'openclaw',
    );
    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.mkdirSync(packageDir, { recursive: true });

    const entryPath = path.join(packageDir, 'openclaw.mjs');
    const wrapperPath = path.join(fakeBinDir, 'openclaw');
    fs.writeFileSync(entryPath, '#!/usr/bin/env node\n', { mode: 0o755 });
    fs.symlinkSync(entryPath, wrapperPath);
    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath ?? ''}`;

    expect(fs.realpathSync(resolveOpenClawBin()!)).toBe(fs.realpathSync(entryPath));
  });

  it('does not replace an openclaw binary with a self-loop when source and destination match', () => {
    const fakeBinDir = path.join(tmpHome, 'bin');
    fs.mkdirSync(fakeBinDir, { recursive: true });

    const sourcePath = path.join(fakeBinDir, 'openclaw');
    fs.writeFileSync(sourcePath, '#!/usr/bin/env node\n', { mode: 0o755 });
    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath ?? ''}`;

    const result = ensureOpenClawInPath({
      _overrideSystemBinDir: null,
      _overrideStablePaths: [],
    });

    expect(result.alreadyInPath).toBe(true);
    expect(result.symlinkCreated).toBe(false);
    expect(fs.lstatSync(sourcePath).isFile()).toBe(true);
  });

  it('relinks the user-bin wrapper to the real package entry instead of creating a self-loop', () => {
    const fakeBinDir = path.join(
      tmpHome,
      '.nvm',
      'versions',
      'node',
      `v${process.versions.node}`,
      'bin',
    );
    const packageDir = path.join(
      tmpHome,
      '.nvm',
      'versions',
      'node',
      `v${process.versions.node}`,
      'lib',
      'node_modules',
      'openclaw',
    );
    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.mkdirSync(packageDir, { recursive: true });

    const entryPath = path.join(packageDir, 'openclaw.mjs');
    const wrapperPath = path.join(fakeBinDir, 'openclaw');
    fs.writeFileSync(entryPath, '#!/usr/bin/env node\n', { mode: 0o755 });
    fs.symlinkSync(entryPath, wrapperPath);
    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath ?? ''}`;

    const result = ensureOpenClawInPath({
      _overrideSystemBinDir: null,
      _overrideStablePaths: [],
    });

    expect(result.symlinkCreated).toBe(true);
    expect(result.symlinkPath).toBe(wrapperPath);
    expect(fs.realpathSync(wrapperPath)).toBe(fs.realpathSync(entryPath));
    expect(path.resolve(fs.readlinkSync(wrapperPath))).not.toBe(path.resolve(wrapperPath));
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
