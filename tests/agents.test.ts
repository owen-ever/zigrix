import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { addAgent, excludeAgent, includeAgent, listAgents, removeAgent, setAgentEnabled, setAgentRole } from '../src/agents/registry.js';
import { defaultConfig } from '../src/config/defaults.js';
import { loadConfig, writeConfigFile, writeDefaultConfig } from '../src/config/load.js';

describe('agent registry mutations', () => {
  it('adds, includes, excludes, edits, and removes agents', () => {
    let config = structuredClone(defaultConfig);

    config = addAgent(config, {
      id: 'qa-main',
      role: 'qa',
      runtime: 'openclaw-session',
      include: true,
    }).config;

    expect(listAgents(config)).toHaveLength(1);
    expect(config.agents.orchestration.participants).toContain('qa-main');

    config = excludeAgent(config, 'qa-main').config;
    expect(config.agents.orchestration.participants).not.toContain('qa-main');
    expect(config.agents.orchestration.excluded).toContain('qa-main');

    config = includeAgent(config, 'qa-main').config;
    expect(config.agents.orchestration.participants).toContain('qa-main');
    expect(config.agents.orchestration.excluded).not.toContain('qa-main');

    config = setAgentEnabled(config, 'qa-main', false).config;
    expect(config.agents.registry['qa-main'].enabled).toBe(false);

    config = setAgentRole(config, 'qa-main', 'quality').config;
    expect(config.agents.registry['qa-main'].role).toBe('quality');

    config = removeAgent(config, 'qa-main').config;
    expect(listAgents(config)).toHaveLength(0);
  });

  it('persists mutated config to zigrix.config.json', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-agent-config-'));
    const configPath = writeDefaultConfig(projectRoot);
    const loaded = loadConfig({ projectRoot });
    const next = addAgent(loaded.config, {
      id: 'front-main',
      role: 'frontend',
      runtime: 'openclaw-session',
      include: true,
    }).config;

    writeConfigFile(configPath, next);
    const reloaded = loadConfig({ projectRoot });
    expect(reloaded.config.agents.registry['front-main'].role).toBe('frontend');
    expect(reloaded.config.agents.orchestration.participants).toContain('front-main');
  });
});
