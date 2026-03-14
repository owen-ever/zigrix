import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import { getConfigValue } from '../src/config/load.js';
import { zigrixConfigSchema } from '../src/config/schema.js';

describe('zigrix config schema', () => {
  it('accepts default config', () => {
    const parsed = zigrixConfigSchema.parse(defaultConfig);
    expect(parsed.paths.stateDir).toBe('.zigrix');
    expect(parsed.rules.stale.defaultHours).toBe(24);
  });

  it('rejects participant/excluded overlap', () => {
    expect(() => zigrixConfigSchema.parse({
      ...defaultConfig,
      agents: {
        registry: {},
        orchestration: {
          participants: ['qa-main'],
          excluded: ['qa-main'],
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
        },
      },
    })).toThrow(/must exist in registry/);
  });

  it('reads nested dotted paths', () => {
    expect(getConfigValue(zigrixConfigSchema.parse(defaultConfig), 'rules.completion.requireQa')).toBe(true);
    expect(getConfigValue(zigrixConfigSchema.parse(defaultConfig), 'missing.path')).toBeUndefined();
  });
});
