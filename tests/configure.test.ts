import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runConfigure } from '../src/configure.js';
import { loadConfig, writeConfigFile, writeDefaultConfig } from '../src/config/load.js';
import { defaultConfig } from '../src/config/defaults.js';
import type { ZigrixConfig } from '../src/config/schema.js';

describe('configure', () => {
  let tmpDir: string;
  let zigrixHome: string;
  let openclawHome: string;
  let configPath: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-configure-test-'));
    zigrixHome = path.join(tmpDir, '.zigrix');
    openclawHome = path.join(tmpDir, '.openclaw');

    process.env.HOME = tmpDir;
    process.env.OPENCLAW_HOME = openclawHome;

    // Create default config in the canonical temp zigrix home
    configPath = writeDefaultConfig(true);
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    delete process.env.OPENCLAW_HOME;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws when zigrix is not initialized', async () => {
    fs.rmSync(zigrixHome, { recursive: true, force: true });
    await expect(runConfigure({ silent: true, yes: true })).rejects.toThrow(/not initialized/);
  });

  it('runs all sections without errors in --yes mode', async () => {
    const result = await runConfigure({ silent: true, yes: true });
    expect(result.ok).toBe(true);
    expect(result.action).toBe('configure');
    expect(result.sections).toEqual(['agents', 'rules', 'workspace', 'path', 'skills']);
  });

  it('reconfigures only specified sections', async () => {
    const result = await runConfigure({
      sections: ['path'],
      silent: true,
      yes: true,
    });
    expect(result.ok).toBe(true);
    expect(result.sections).toEqual(['path']);
    expect(result.pathResult).not.toBeNull();
    // Skills should not have been touched
    expect(result.skillsResult).toBeNull();
  });

  it('sets projects base dir when provided', async () => {
    const newBase = path.join(tmpDir, 'my-projects');
    const result = await runConfigure({
      sections: ['workspace'],
      projectsBaseDir: newBase,
      silent: true,
      yes: true,
    });
    expect(result.ok).toBe(true);
    expect(result.workspaceChanged).toBe(true);

    // Verify it was persisted
    const reloaded = loadConfig();
    expect(reloaded.config.workspace.projectsBaseDir).toBe(path.resolve(newBase));
  });

  it('configure is idempotent', async () => {
    const first = await runConfigure({ silent: true, yes: true });
    const second = await runConfigure({ silent: true, yes: true });
    expect(second.ok).toBe(true);
    expect(second.agentsRegistered).toHaveLength(0);
  });

  it('registers agents from openclaw config', async () => {
    // Create a fake openclaw.json with agents (must include an orchestrator role for orchestratorId validation)
    fs.mkdirSync(openclawHome, { recursive: true });
    fs.writeFileSync(path.join(openclawHome, 'openclaw.json'), JSON.stringify({
      agents: {
        list: [
          { id: 'main', default: true },
          { id: 'orch-main', name: 'orch-main', identity: { theme: 'Orchestrator Agent' } },
          { id: 'frontend-main', name: 'frontend-main', identity: { theme: 'Frontend Agent' } },
          { id: 'qa-main', name: 'qa-main', identity: { theme: 'QA Agent' } },
        ],
      },
    }));

    const result = await runConfigure({
      sections: ['agents'],
      silent: true,
      yes: true,
    });
    expect(result.ok).toBe(true);
    expect(result.agentsRegistered).toContain('frontend-main');
    expect(result.agentsRegistered).toContain('qa-main');
    expect(result.agentsRegistered).toContain('orch-main');
    // main should not be registered
    expect(result.agentsRegistered).not.toContain('main');
  });
});
