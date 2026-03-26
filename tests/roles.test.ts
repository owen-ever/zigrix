import { describe, expect, it } from 'vitest';

import {
  assertStandardAgentRole,
  inferStandardAgentRole,
  normalizeAgentRole,
  STANDARD_AGENT_ROLES,
} from '../src/agents/roles.js';

describe('normalizeAgentRole', () => {
  it('normalizes exact standard role names', () => {
    expect(normalizeAgentRole('orchestrator')).toBe('orchestrator');
    expect(normalizeAgentRole('qa')).toBe('qa');
    expect(normalizeAgentRole('security')).toBe('security');
    expect(normalizeAgentRole('frontend')).toBe('frontend');
    expect(normalizeAgentRole('backend')).toBe('backend');
    expect(normalizeAgentRole('system')).toBe('system');
  });

  it('normalizes common aliases', () => {
    expect(normalizeAgentRole('front')).toBe('frontend');
    expect(normalizeAgentRole('back')).toBe('backend');
    expect(normalizeAgentRole('sec')).toBe('security');
    expect(normalizeAgentRole('infra')).toBe('system');
    expect(normalizeAgentRole('infrastructure')).toBe('system');
    expect(normalizeAgentRole('architecture')).toBe('system');
    expect(normalizeAgentRole('sys')).toBe('system');
    expect(normalizeAgentRole('pro')).toBe('orchestrator');
    expect(normalizeAgentRole('test')).toBe('qa');
    expect(normalizeAgentRole('testing')).toBe('qa');
    expect(normalizeAgentRole('quality')).toBe('qa');
    expect(normalizeAgentRole('ui')).toBe('frontend');
    expect(normalizeAgentRole('client')).toBe('frontend');
    expect(normalizeAgentRole('server')).toBe('backend');
    expect(normalizeAgentRole('api')).toBe('backend');
  });

  it('is case-insensitive and strips non-alpha', () => {
    expect(normalizeAgentRole('Frontend')).toBe('frontend');
    expect(normalizeAgentRole('BACKEND')).toBe('backend');
    expect(normalizeAgentRole('Q-A')).toBe('qa');
    expect(normalizeAgentRole(' sys ')).toBe('system');
  });

  it('returns null for unknown roles', () => {
    expect(normalizeAgentRole('wizard')).toBeNull();
    expect(normalizeAgentRole('')).toBeNull();
    expect(normalizeAgentRole('unknown')).toBeNull();
  });
});

describe('assertStandardAgentRole', () => {
  it('returns normalized role for valid input', () => {
    expect(assertStandardAgentRole('infra')).toBe('system');
  });

  it('throws for invalid role', () => {
    expect(() => assertStandardAgentRole('wizard')).toThrow(/must be one of/);
  });
});

describe('inferStandardAgentRole', () => {
  it('infers from agent theme', () => {
    expect(inferStandardAgentRole({ agentId: 'x', theme: 'QA Agent' })).toBe('qa');
    expect(inferStandardAgentRole({ agentId: 'x', theme: 'Frontend Agent' })).toBe('frontend');
    expect(inferStandardAgentRole({ agentId: 'x', theme: 'Backend Implementation Agent' })).toBe('backend');
    expect(inferStandardAgentRole({ agentId: 'x', theme: 'Security Audit Agent' })).toBe('security');
    expect(inferStandardAgentRole({ agentId: 'x', theme: 'Orchestrator Agent' })).toBe('orchestrator');
    expect(inferStandardAgentRole({ agentId: 'x', theme: 'System Architecture Agent' })).toBe('system');
  });

  it('infers from agent id when theme is absent', () => {
    expect(inferStandardAgentRole({ agentId: 'qa-main' })).toBe('qa');
    expect(inferStandardAgentRole({ agentId: 'frontend-main' })).toBe('frontend');
    expect(inferStandardAgentRole({ agentId: 'backend-main' })).toBe('backend');
    expect(inferStandardAgentRole({ agentId: 'security-main' })).toBe('security');
    expect(inferStandardAgentRole({ agentId: 'orch-main' })).toBe('orchestrator');
    expect(inferStandardAgentRole({ agentId: 'system-main' })).toBe('system');
  });

  it('falls back to "system" for unrecognizable agents', () => {
    expect(inferStandardAgentRole({ agentId: 'mystery-agent' })).toBe('system');
    expect(inferStandardAgentRole({ agentId: 'custom', theme: 'Random Agent' })).toBe('system');
  });

  it('prefers theme over agent id', () => {
    expect(inferStandardAgentRole({ agentId: 'qa-main', theme: 'Frontend Agent' })).toBe('frontend');
  });
});

describe('STANDARD_AGENT_ROLES', () => {
  it('contains all 6 standard roles', () => {
    expect(STANDARD_AGENT_ROLES).toHaveLength(6);
    expect(STANDARD_AGENT_ROLES).toContain('orchestrator');
    expect(STANDARD_AGENT_ROLES).toContain('qa');
    expect(STANDARD_AGENT_ROLES).toContain('security');
    expect(STANDARD_AGENT_ROLES).toContain('frontend');
    expect(STANDARD_AGENT_ROLES).toContain('backend');
    expect(STANDARD_AGENT_ROLES).toContain('system');
  });
});
