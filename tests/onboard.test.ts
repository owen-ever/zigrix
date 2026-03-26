import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import {
  checkZigrixInPath,
  detectOpenClawHome,
  ensureOrchestratorId,
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
          { id: 'backend-main', name: 'backend-main', identity: { theme: 'Backend Agent' } },
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
      { id: 'backend-main' },
      { id: 'qa-main' },
    ];
    const result = filterAgents(agents);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(['backend-main', 'qa-main']);
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
  it('registers agents from openclaw list with inferred roles', () => {
    const config = structuredClone(defaultConfig) as any;
    config.agents = {
      registry: {},
      orchestration: { participants: [], excluded: [], orchestratorId: 'orch-main' },
    };

    const agents: OpenClawAgent[] = [
      { id: 'backend-main', name: 'backend-main', identity: { theme: 'Backend Implementation Agent' } },
      { id: 'qa-main', name: 'qa-main', identity: { theme: 'QA Agent' } },
    ];

    const result = registerAgents(config, agents);
    expect(result.registered).toEqual(['backend-main', 'qa-main']);
    expect(result.skipped).toHaveLength(0);
    expect(result.config.agents.registry['backend-main']).toBeDefined();
    expect(result.config.agents.registry['backend-main'].role).toBe('backend');
    expect(result.config.agents.registry['backend-main'].runtime).toBe('openclaw');
    expect(result.config.agents.orchestration.participants).toContain('backend-main');
    expect(result.config.agents.registry['qa-main'].role).toBe('qa');
  });

  it('skips already-registered agents (idempotent)', () => {
    const config = structuredClone(defaultConfig) as any;
    config.agents = {
      registry: {
        'backend-main': {
          label: 'backend-main',
          role: 'backend',
          runtime: 'openclaw',
          enabled: true,
          metadata: {},
        },
      },
      orchestration: { participants: ['backend-main'], excluded: [], orchestratorId: 'orch-main' },
    };

    const agents: OpenClawAgent[] = [
      { id: 'backend-main', name: 'backend-main' },
    ];

    const result = registerAgents(config, agents);
    expect(result.registered).toHaveLength(0);
    expect(result.skipped).toEqual(['backend-main']);
    // original role preserved
    expect(result.config.agents.registry['backend-main'].role).toBe('backend');
  });

  it('infers "system" role when identity.theme is missing and agentId has no hints', () => {
    const config = structuredClone(defaultConfig) as any;
    config.agents = {
      registry: {},
      orchestration: { participants: [], excluded: [], orchestratorId: 'orch-main' },
    };

    const agents: OpenClawAgent[] = [{ id: 'mystery-agent' }];
    const result = registerAgents(config, agents);
    expect(result.config.agents.registry['mystery-agent'].role).toBe('system');
  });

  it('accepts explicit role assignments', () => {
    const config = structuredClone(defaultConfig) as any;
    config.agents = {
      registry: {},
      orchestration: { participants: [], excluded: [], orchestratorId: 'orch-main' },
    };

    const agents: OpenClawAgent[] = [
      { id: 'custom-agent', name: 'custom-agent' },
    ];
    const result = registerAgents(config, agents, { 'custom-agent': 'security' });
    expect(result.config.agents.registry['custom-agent'].role).toBe('security');
  });
});

// ─── ensureOrchestratorId ──────────────────────────────────────────────────────

describe('ensureOrchestratorId', () => {
  it('keeps existing orchestratorId when eligible', () => {
    const config = structuredClone(defaultConfig) as any;
    config.agents = {
      registry: {
        'orch-main': { label: 'orch-main', role: 'orchestrator', runtime: 'openclaw', enabled: true, metadata: {} },
      },
      orchestration: { participants: ['orch-main'], excluded: [], orchestratorId: 'orch-main' },
    };
    const result = ensureOrchestratorId(config);
    expect(result.changed).toBe(false);
    expect(result.config.agents.orchestration.orchestratorId).toBe('orch-main');
  });

  it('auto-selects first eligible orchestrator when current is invalid', () => {
    const config = structuredClone(defaultConfig) as any;
    config.agents = {
      registry: {
        'orch-candidate': { label: 'orch-candidate', role: 'orchestrator', runtime: 'openclaw', enabled: true, metadata: {} },
      },
      orchestration: { participants: ['orch-candidate'], excluded: [], orchestratorId: 'ghost-agent' },
    };
    const result = ensureOrchestratorId(config);
    expect(result.changed).toBe(true);
    expect(result.config.agents.orchestration.orchestratorId).toBe('orch-candidate');
  });

  it('warns when no eligible orchestrator found', () => {
    const config = structuredClone(defaultConfig) as any;
    config.agents = {
      registry: {
        'qa-main': { label: 'qa-main', role: 'qa', runtime: 'openclaw', enabled: true, metadata: {} },
      },
      orchestration: { participants: ['qa-main'], excluded: [], orchestratorId: 'orch-main' },
    };
    const result = ensureOrchestratorId(config);
    expect(result.changed).toBe(false);
    expect(result.warning).toMatch(/no eligible orchestrator/);
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

  it('falls back to bundled defaults when source dir does not exist', () => {
    const result = seedRules(path.join(tmpDir, 'nonexistent'), targetDir);
    // Should seed from bundled rules/defaults/ if available
    if (result.source === 'bundled') {
      expect(result.copied.length).toBeGreaterThan(0);
    } else {
      // No bundled rules found (e.g. CI without rules dir)
      expect(result.copied).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    }
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

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-path-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns true when zigrix binary exists in stable paths', () => {
    fs.writeFileSync(path.join(tmpDir, 'zigrix'), '#!/bin/sh\necho zigrix', { mode: 0o755 });
    expect(checkZigrixInPath({ _overrideStablePaths: [tmpDir] })).toBe(true);
  });

  it('returns false when zigrix is not in stable paths', () => {
    // tmpDir is empty — no zigrix binary
    expect(checkZigrixInPath({ _overrideStablePaths: [tmpDir] })).toBe(false);
  });

  it('returns false when zigrix is in PATH but not in stable paths (nvm scenario)', () => {
    // Create a fake nvm-style dir with zigrix in it
    const nvmBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-nvm-test-'));
    try {
      fs.writeFileSync(path.join(nvmBinDir, 'zigrix'), '#!/bin/sh\necho zigrix', { mode: 0o755 });
      // Even though zigrix is accessible via PATH (nvm dir), stable paths don't include nvmBinDir
      // checkZigrixInPath should return false — only stable paths are checked
      expect(checkZigrixInPath({ _overrideStablePaths: [tmpDir] })).toBe(false);
    } finally {
      fs.rmSync(nvmBinDir, { recursive: true, force: true });
    }
  });
});
