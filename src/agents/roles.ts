export const STANDARD_AGENT_ROLES = [
  'orchestrator',
  'qa',
  'security',
  'frontend',
  'backend',
  'system',
] as const;

export type StandardAgentRole = (typeof STANDARD_AGENT_ROLES)[number];

const ROLE_ALIAS_MAP: Record<string, StandardAgentRole> = {
  orchestrator: 'orchestrator',
  orchestration: 'orchestrator',
  orchestrate: 'orchestrator',
  pro: 'orchestrator',

  qa: 'qa',
  quality: 'qa',
  qualityassurance: 'qa',
  test: 'qa',
  testing: 'qa',

  security: 'security',
  sec: 'security',

  frontend: 'frontend',
  front: 'frontend',
  ui: 'frontend',
  client: 'frontend',

  backend: 'backend',
  back: 'backend',
  server: 'backend',
  api: 'backend',

  system: 'system',
  sys: 'system',
  infra: 'system',
  infrastructure: 'system',
  architecture: 'system',
};

export const ROLE_HINTS: Record<StandardAgentRole, string> = {
  orchestrator: 'coordination / orchestration / execution planning',
  qa: 'quality assurance / regression / verification',
  security: 'security-sensitive scope or risky changes',
  frontend: 'UI / styling / client-side integration when present',
  backend: 'API / DB / server-side logic when present',
  system: 'system architecture / technical decision / platform-wide changes',
};

export function normalizeAgentRole(value: string): StandardAgentRole | null {
  const normalized = value.trim().toLowerCase().replace(/[^a-z]/g, '');
  return ROLE_ALIAS_MAP[normalized] ?? null;
}

export function assertStandardAgentRole(value: string, context = 'role'): StandardAgentRole {
  const normalized = normalizeAgentRole(value);
  if (!normalized) {
    throw new Error(`${context} must be one of: ${STANDARD_AGENT_ROLES.join(', ')}`);
  }
  return normalized;
}

function inferRoleFromHints(agentIdOrTheme: string): StandardAgentRole | null {
  const normalized = agentIdOrTheme.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes('qa') || normalized.includes('test')) return 'qa';
  if (normalized.includes('sec')) return 'security';
  if (normalized.includes('front') || normalized.includes('ui')) return 'frontend';
  if (normalized.includes('back') || normalized.includes('api') || normalized.includes('server')) return 'backend';
  if (normalized.includes('sys') || normalized.includes('infra') || normalized.includes('arch')) return 'system';
  if (normalized.includes('pro') || normalized.includes('orch') || normalized.includes('coord')) return 'orchestrator';

  return null;
}

export function inferStandardAgentRole(params: { agentId: string; theme?: string | null }): StandardAgentRole {
  const fromTheme = params.theme ? inferRoleFromHints(params.theme) : null;
  if (fromTheme) return fromTheme;

  const fromId = inferRoleFromHints(params.agentId);
  if (fromId) return fromId;

  return 'system';
}

export function listStandardRolesText(): string {
  return STANDARD_AGENT_ROLES.join(', ');
}
