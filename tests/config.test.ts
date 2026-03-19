import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import { getConfigValue } from '../src/config/load.js';
import { zigrixConfigSchema } from '../src/config/schema.js';

describe('zigrix config schema', () => {
  it('accepts default config', () => {
    const parsed = zigrixConfigSchema.parse(defaultConfig);
    expect(parsed.paths.baseDir).toContain('.zigrix');
    expect(parsed.rules.stale.defaultHours).toBe(24);
    expect(parsed.workspace.projectsBaseDir).toBe('');
  });

  it('rejects participant/excluded overlap', () => {
    expect(() => zigrixConfigSchema.parse({
      ...defaultConfig,
      agents: {
        registry: {
          'qa-main': { label: 'qa-main', role: 'qa', runtime: 'openclaw', enabled: true, metadata: {} },
        },
        orchestration: {
          participants: ['qa-main'],
          excluded: ['qa-main'],
          orchestratorId: 'pro-zig',
        },
      },
    })).toThrow(/cannot be both participant and excluded/);
  });

  it('rejects unknown orchestration members', () => {
    expect(() => zigrixConfigSchema.parse({
      ...defaultConfig,
      agents: {
        registry: {},
        orchestration: {
          participants: ['ghost-agent'],
          excluded: [],
          orchestratorId: 'pro-zig',
        },
      },
    })).toThrow(/must exist in registry/);
  });

  it('reads nested dotted paths', () => {
    expect(getConfigValue(zigrixConfigSchema.parse(defaultConfig), 'rules.completion.requireQa')).toBe(true);
    expect(getConfigValue(zigrixConfigSchema.parse(defaultConfig), 'missing.path')).toBeUndefined();
  });

  it('rejects unknown orchestratorId when an orchestrator role agent exists', () => {
    expect(() => zigrixConfigSchema.parse({
      ...defaultConfig,
      agents: {
        registry: {
          'real-orch': { label: 'real-orch', role: 'orchestrator', runtime: 'openclaw', enabled: true, metadata: {} },
          'qa-main': { label: 'qa-main', role: 'qa', runtime: 'openclaw', enabled: true, metadata: {} },
        },
        orchestration: {
          participants: [],
          excluded: [],
          orchestratorId: 'ghost-zig',
        },
      },
    })).toThrow(/orchestratorId .* must exist in registry/);
  });

  it('allows non-matching orchestratorId when no orchestrator role agent exists yet', () => {
    // During bootstrap, orchestratorId might be set before the agent is registered
    const parsed = zigrixConfigSchema.parse({
      ...defaultConfig,
      agents: {
        registry: {
          'qa-main': { label: 'qa-main', role: 'qa', runtime: 'openclaw', enabled: true, metadata: {} },
        },
        orchestration: {
          participants: [],
          excluded: [],
          orchestratorId: 'pro-zig',
        },
      },
    });
    expect(parsed.agents.orchestration.orchestratorId).toBe('pro-zig');
  });

  it('rejects excluded orchestratorId', () => {
    expect(() => zigrixConfigSchema.parse({
      ...defaultConfig,
      agents: {
        registry: {
          'pro-zig': { label: 'pro-zig', role: 'orchestrator', runtime: 'openclaw', enabled: true, metadata: {} },
        },
        orchestration: {
          participants: [],
          excluded: ['pro-zig'],
          orchestratorId: 'pro-zig',
        },
      },
    })).toThrow(/orchestratorId .* cannot be excluded/);
  });
});
