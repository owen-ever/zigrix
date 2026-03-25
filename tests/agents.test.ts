import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { addAgent, excludeAgent, includeAgent, listAgents, removeAgent, setAgentEnabled, setAgentRole } from '../src/agents/registry.js';
import { defaultConfig } from '../src/config/defaults.js';
import { loadConfig, writeConfigFile, writeDefaultConfig } from '../src/config/load.js';

function makeConfigWithOrchestrator() {
  // Add orch-a as orchestrator first so orchestratorId validation passes
  let config = structuredClone(defaultConfig);
  config.agents.registry['orch-a'] = {
    label: 'orch-a',
    role: 'orchestrator',
    runtime: 'openclaw',
    enabled: true,
    metadata: {},
  };
  config.agents.orchestration.participants.push('orch-a');
  config.agents.orchestration.orchestratorId = 'orch-a';
  return config;
}

describe('agent registry mutations', () => {
  it('adds, includes, excludes, edits, and removes agents', () => {
    let config = makeConfigWithOrchestrator();

    config = addAgent(config, {
      id: 'qa-main',
      role: 'qa',
      runtime: 'openclaw-session',
      include: true,
    }).config;

    expect(listAgents(config)).toHaveLength(2);
    expect(config.agents.orchestration.participants).toContain('qa-main');

    config = excludeAgent(config, 'qa-main').config;
    expect(config.agents.orchestration.participants).not.toContain('qa-main');
    expect(config.agents.orchestration.excluded).toContain('qa-main');

    config = includeAgent(config, 'qa-main').config;
    expect(config.agents.orchestration.participants).toContain('qa-main');
    expect(config.agents.orchestration.excluded).not.toContain('qa-main');

    config = setAgentEnabled(config, 'qa-main', false).config;
    expect(config.agents.registry['qa-main'].enabled).toBe(false);

    config = setAgentRole(config, 'qa-main', 'security').config;
    expect(config.agents.registry['qa-main'].role).toBe('security');

    config = removeAgent(config, 'qa-main').config;
    expect(listAgents(config)).toHaveLength(1);
  });

  it('normalizes role aliases on add', () => {
    let config = makeConfigWithOrchestrator();
    config = addAgent(config, {
      id: 'fe-main',
      role: 'front',
      runtime: 'openclaw',
      include: true,
    }).config;
    expect(config.agents.registry['fe-main'].role).toBe('frontend');
  });

  it('rejects unknown roles', () => {
    const config = makeConfigWithOrchestrator();
    expect(() => addAgent(config, {
      id: 'bad-agent',
      role: 'wizard',
      runtime: 'openclaw',
    })).toThrow(/must be one of/);
  });

  it('persists mutated config to zigrix.config.json', () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-agent-config-'));
    const configPath = writeDefaultConfig(tmpBase);
    const loaded = loadConfig({ baseDir: tmpBase });

    // First add an orchestrator so orchestratorId validation passes
    let next = addAgent(loaded.config, {
      id: 'orch-a',
      role: 'orchestrator',
      runtime: 'openclaw-session',
      include: true,
    }).config;

    next = addAgent(next, {
      id: 'front-main',
      role: 'frontend',
      runtime: 'openclaw-session',
      include: true,
    }).config;

    writeConfigFile(configPath, next);
    const reloaded = loadConfig({ baseDir: tmpBase });
    expect(reloaded.config.agents.registry['front-main'].role).toBe('frontend');
    expect(reloaded.config.agents.orchestration.participants).toContain('front-main');
  });
});
