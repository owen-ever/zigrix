import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import { diffValues, parseConfigInput, resetValueAtPath, setValueAtPath } from '../src/config/mutate.js';

describe('config mutation helpers', () => {
  it('sets nested config values with json parsing support', () => {
    const next = setValueAtPath(structuredClone(defaultConfig) as Record<string, unknown>, 'rules.completion.requireQa', parseConfigInput('false'));
    expect((next.rules as { completion: { requireQa: boolean } }).completion.requireQa).toBe(false);
  });

  it('resets template body back to defaults', () => {
    const changed = setValueAtPath(structuredClone(defaultConfig) as Record<string, unknown>, 'templates.workerPrompt.body', 'broken template') as never;
    const reset = resetValueAtPath(changed, 'templates.workerPrompt');
    expect(reset.templates.workerPrompt.body).toBe(defaultConfig.templates.workerPrompt.body);
  });

  it('computes changed diff against baseline', () => {
    const payload = diffValues({ a: 1 }, { a: 2 });
    expect(payload.changed).toBe(true);
  });
});
