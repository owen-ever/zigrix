import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import { extractPlaceholders, renderTemplate, validateRules, validateTemplate } from '../src/rules/templates.js';

describe('rule/template validation', () => {
  it('extracts placeholders and validates known template placeholders', () => {
    expect(extractPlaceholders('hello {{taskId}} {{ agentId }}')).toEqual(['taskId', 'agentId']);
    const result = validateTemplate('workerPrompt', defaultConfig.templates.workerPrompt.body);
    expect(result.ok).toBe(true);
    expect(result.unknown).toEqual([]);
  });

  it('fails on unknown placeholders', () => {
    const result = validateTemplate('finalReport', 'done {{taskId}} {{mystery}}');
    expect(result.ok).toBe(false);
    expect(result.unknown).toContain('mystery');
  });

  it('renders templates with context values', () => {
    const rendered = renderTemplate('finalReport', 'Task {{taskId}} => {{status}}', {
      taskId: 'TASK-001',
      status: 'REPORTED',
    });
    expect(rendered).toBe('Task TASK-001 => REPORTED');
  });

  it('validates rule roles against known roles', () => {
    const config = structuredClone(defaultConfig) as typeof defaultConfig & { rules: typeof defaultConfig.rules };
    config.rules.scales.simple.requiredRoles = ['ghost-role'];
    const result = validateRules(config as never);
    expect(result.ok).toBe(false);
    expect(result.invalidRoles).toContain('ghost-role');
  });
});
