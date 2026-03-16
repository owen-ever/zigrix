import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import {
  checkZigrixInPath,
  detectOpenClawHome,
  filterAgents,
  loadOpenClawConfig,
  registerAgents,
  seedRules,
  type OpenClawAgent,
  type OpenClawConfig,
} from '../src/onboard.js';

// ─── detectOpenClawHome ───────────────────────────────────────────────────────

describe('detectOpenClawHome', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  it('returns ~/.openclaw by default', () => {
    delete process.env.OPENCLAW_HOME;
    const home = detectOpenClawHome();
    expect(home).toBe(path.join(os.homedir(), '.openclaw'));
  });

  it('respects OPENCLAW_HOME env override', () => {
    process.env.OPENCLAW_HOME = '/custom/openclaw';
    const home = detectOpenClawHome();
    expect(home).toBe('/custom/openclaw');
  });
});

// ─── loadOpenClawConfig ───────────────────────────────────────────────────────

describe('loadOpenClawConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-onboard-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when openclaw.json does not exist', () => {
    const result = loadOpenClawConfig(tmpDir);
    expect(result).toBeNull();
  });

  it('parses openclaw.json successfully', () => {
    const config: OpenClawConfig = {
      agents: {
        list: [
          { id: 'main', default: true },
          { id: 'back-zig', name: 'back-zig', identity: { theme: 'Backend Agent' } },
        ],
      },
    };
    fs.writeFileSync(path.join(tmpDir, 'openclaw.json'), JSON.stringify(config));
    const result = loadOpenClawConfig(tmpDir);
    expect(result).not.toBeNull();
    expect(result?.agents?.list).toHaveLength(2);
  });

  it('returns null when openclaw.json is invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'openclaw.json'), '{invalid json}');
    const result = loadOpenClawConfig(tmpDir);
    expect(result).toBeNull();
  });
});

// ─── filterAgents ─────────────────────────────────────────────────────────────

describe('filterAgents', () => {
  it('excludes main agent', () => {
    const agents: OpenClawAgent[] = [
      { id: 'main', default: true },
      { id: 'back-zig' },
      { id: 'qa-zig' },
    ];
    const result = filterAgents(agents);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(['back-zig', 'qa-zig']);
  });

  it('returns empty array when only main exists', () => {
    const result = filterAgents([{ id: 'main' }]);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(filterAgents([])).toHaveLength(0);
  });
});

// ─── registerAgents ───────────────────────────────────────────────────────────

describe('registerAgents', () => {
  it('registers agents from openclaw list', () => {
    const config = structuredClone(defaultConfig) as any;
    config.agents = {
      registry: {},
      orchestration: { participants: [], excluded: [] },
    };

    const agents: OpenClawAgent[] = [
      { id: 'back-zig', name: 'back-zig', identity: { theme: 'Backend Implementation Agent' } },
      { id: 'qa-zig', name: 'qa-zig', identity: { theme: 'QA Agent' } },
    ];

    const result = registerAgents(config, agents);
    expect(result.registered).toEqual(['back-zig', 'qa-zig']);
    expect(result.skipped).toHaveLength(0);
    expect(result.config.agents.registry['back-zig']).toBeDefined();
    expect(result.config.agents.registry['back-zig'].role).toBe('Backend Implementation Agent');
    expect(result.config.agents.registry['back-zig'].runtime).toBe('openclaw');
    expect(result.config.agents.orchestration.participants).toContain('back-zig');
  });

  it('skips already-registered agents (idempotent)', () => {
    const config = structuredClone(defaultConfig) as any;
    config.agents = {
      registry: {
        'back-zig': {
          label: 'back-zig',
          role: 'existing-role',
          runtime: 'openclaw',
          enabled: true,
          metadata: {},
        },
      },
      orchestration: { participants: ['back-zig'], excluded: [] },
    };

    const agents: OpenClawAgent[] = [
      { id: 'back-zig', name: 'back-zig' },
    ];

    const result = registerAgents(config, agents);
    expect(result.registered).toHaveLength(0);
    expect(result.skipped).toEqual(['back-zig']);
    // original role preserved
    expect(result.config.agents.registry['back-zig'].role).toBe('existing-role');
  });

  it('uses "assistant" role when identity.theme is missing', () => {
    const config = structuredClone(defaultConfig) as any;
    config.agents = {
      registry: {},
      orchestration: { participants: [], excluded: [] },
    };

    const agents: OpenClawAgent[] = [{ id: 'mystery-zig' }];
    const result = registerAgents(config, agents);
    expect(result.config.agents.registry['mystery-zig'].role).toBe('assistant');
  });
});

// ─── seedRules ────────────────────────────────────────────────────────────────

describe('seedRules', () => {
  let tmpDir: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-rules-test-'));
    sourceDir = path.join(tmpDir, 'source');
    targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(sourceDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty when source dir does not exist', () => {
    const result = seedRules(path.join(tmpDir, 'nonexistent'), targetDir);
    expect(result.copied).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('copies .md files to target dir', () => {
    fs.writeFileSync(path.join(sourceDir, 'rule1.md'), '# Rule 1');
    fs.writeFileSync(path.join(sourceDir, 'rule2.md'), '# Rule 2');
    fs.writeFileSync(path.join(sourceDir, 'ignore.txt'), 'not a rule');

    const result = seedRules(sourceDir, targetDir);
    expect(result.copied).toEqual(expect.arrayContaining(['rule1.md', 'rule2.md']));
    expect(result.copied).not.toContain('ignore.txt');
    expect(fs.existsSync(path.join(targetDir, 'rule1.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'rule2.md'))).toBe(true);
  });

  it('skips files that already exist in target (idempotent)', () => {
    fs.writeFileSync(path.join(sourceDir, 'rule1.md'), '# New Rule');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'rule1.md'), '# Old Rule');

    const result = seedRules(sourceDir, targetDir);
    expect(result.copied).toHaveLength(0);
    expect(result.skipped).toEqual(['rule1.md']);
    // original content preserved
    expect(fs.readFileSync(path.join(targetDir, 'rule1.md'), 'utf8')).toBe('# Old Rule');
  });
});

// ─── checkZigrixInPath ───────────────────────────────────────────────────────

describe('checkZigrixInPath', () => {
  let tmpDir: string;
  const originalPath = process.env.PATH;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-path-test-'));
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns true when zigrix binary exists in PATH', () => {
    fs.writeFileSync(path.join(tmpDir, 'zigrix'), '#!/bin/sh\necho zigrix', { mode: 0o755 });
    process.env.PATH = `${tmpDir}${path.delimiter}${originalPath}`;
    expect(checkZigrixInPath()).toBe(true);
  });

  it('returns false when zigrix is not in PATH', () => {
    process.env.PATH = tmpDir; // only our empty temp dir
    expect(checkZigrixInPath()).toBe(false);
  });
});
