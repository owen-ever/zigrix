import { assertStandardAgentRole } from './roles.js';
import { type ZigrixConfig, zigrixConfigSchema } from '../config/schema.js';

export type AgentMutationResult = {
  config: ZigrixConfig;
  changed: boolean;
  agentId: string;
};

function assertAgentExists(config: ZigrixConfig, agentId: string): void {
  if (!config.agents.registry[agentId]) {
    throw new Error(`agent not found: ${agentId}`);
  }
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function normalizeOrchestratorId(config: ZigrixConfig): void {
  const current = config.agents.orchestration.orchestratorId;
  if (config.agents.registry[current]) return;

  const candidates = Object.entries(config.agents.registry)
    .filter(([, agent]) => agent.role === 'orchestrator')
    .map(([agentId]) => agentId)
    .sort();

  if (candidates.length > 0) {
    config.agents.orchestration.orchestratorId = candidates[0];
  }
}

export function listAgents(config: ZigrixConfig): Array<{
  id: string;
  label: string;
  role: string;
  runtime: string;
  enabled: boolean;
  participant: boolean;
  excluded: boolean;
}> {
  return Object.entries(config.agents.registry)
    .map(([id, agent]) => ({
      id,
      label: agent.label,
      role: agent.role,
      runtime: agent.runtime,
      enabled: agent.enabled,
      participant: config.agents.orchestration.participants.includes(id),
      excluded: config.agents.orchestration.excluded.includes(id),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function addAgent(config: ZigrixConfig, params: {
  id: string;
  role: string;
  runtime: string;
  label?: string;
  enabled?: boolean;
  include?: boolean;
}): AgentMutationResult {
  if (config.agents.registry[params.id]) {
    throw new Error(`agent already exists: ${params.id}`);
  }

  const normalizedRole = assertStandardAgentRole(params.role, 'agent role');

  const next = structuredClone(config);
  next.agents.registry[params.id] = {
    label: params.label ?? params.id,
    role: normalizedRole,
    runtime: params.runtime,
    enabled: params.enabled ?? true,
    metadata: {},
  };

  if (params.include) {
    next.agents.orchestration.participants = unique([...next.agents.orchestration.participants, params.id]);
    next.agents.orchestration.excluded = next.agents.orchestration.excluded.filter((item) => item !== params.id);
  }

  normalizeOrchestratorId(next);

  return {
    config: zigrixConfigSchema.parse(next),
    changed: true,
    agentId: params.id,
  };
}

export function removeAgent(config: ZigrixConfig, agentId: string): AgentMutationResult {
  assertAgentExists(config, agentId);
  const next = structuredClone(config);
  delete next.agents.registry[agentId];
  next.agents.orchestration.participants = next.agents.orchestration.participants.filter((item) => item !== agentId);
  next.agents.orchestration.excluded = next.agents.orchestration.excluded.filter((item) => item !== agentId);
  normalizeOrchestratorId(next);
  return {
    config: zigrixConfigSchema.parse(next),
    changed: true,
    agentId,
  };
}

export function includeAgent(config: ZigrixConfig, agentId: string): AgentMutationResult {
  assertAgentExists(config, agentId);
  const next = structuredClone(config);
  next.agents.orchestration.participants = unique([...next.agents.orchestration.participants, agentId]);
  next.agents.orchestration.excluded = next.agents.orchestration.excluded.filter((item) => item !== agentId);
  return {
    config: zigrixConfigSchema.parse(next),
    changed: true,
    agentId,
  };
}

export function excludeAgent(config: ZigrixConfig, agentId: string): AgentMutationResult {
  assertAgentExists(config, agentId);
  const next = structuredClone(config);
  next.agents.orchestration.excluded = unique([...next.agents.orchestration.excluded, agentId]);
  next.agents.orchestration.participants = next.agents.orchestration.participants.filter((item) => item !== agentId);
  return {
    config: zigrixConfigSchema.parse(next),
    changed: true,
    agentId,
  };
}

export function setAgentEnabled(config: ZigrixConfig, agentId: string, enabled: boolean): AgentMutationResult {
  assertAgentExists(config, agentId);
  const next = structuredClone(config);
  next.agents.registry[agentId].enabled = enabled;
  return {
    config: zigrixConfigSchema.parse(next),
    changed: true,
    agentId,
  };
}

export function setAgentRole(config: ZigrixConfig, agentId: string, role: string): AgentMutationResult {
  assertAgentExists(config, agentId);
  const normalizedRole = assertStandardAgentRole(role, 'agent role');
  const next = structuredClone(config);
  next.agents.registry[agentId].role = normalizedRole;
  return {
    config: zigrixConfigSchema.parse(next),
    changed: true,
    agentId,
  };
}
