import { inferStandardAgentRole, type StandardAgentRole } from '../agents/roles.js';

import type { ZigrixTask } from '../state/tasks.js';

type TaskLike = Partial<ZigrixTask> & Record<string, unknown>;

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function listCandidatesByRoleMap(task: TaskLike, role: StandardAgentRole): string[] {
  const roleMap = task.roleAgentMap;
  if (!roleMap || typeof roleMap !== 'object') return [];
  const raw = (roleMap as Record<string, unknown>)[role];
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item)).filter((value) => value.trim().length > 0);
}

function listKnownAgentIds(task: TaskLike): string[] {
  const buckets: unknown[] = [
    task.requiredAgents,
    task.selectedAgents,
    task.baselineRequiredAgents,
    Object.keys((task.workerSessions as Record<string, unknown>) ?? {}),
  ];

  const items = buckets
    .flatMap((entry) => (Array.isArray(entry) ? entry : []))
    .map((value) => String(value))
    .filter((value) => value.trim().length > 0);

  return [...new Set(items)];
}

export function resolveRoleAgentId(task: TaskLike, role: StandardAgentRole): string | null {
  if (role === 'orchestrator') {
    const direct = toNonEmptyString(task.orchestratorId);
    if (direct && direct !== 'auto') return direct;
  }
  if (role === 'qa') {
    const direct = toNonEmptyString(task.qaAgentId);
    if (direct) return direct;
  }

  const fromRoleMap = listCandidatesByRoleMap(task, role)[0];
  if (fromRoleMap) return fromRoleMap;

  const inferred = listKnownAgentIds(task).find(
    (agentId) => inferStandardAgentRole({ agentId }) === role,
  );
  return inferred ?? null;
}

export function resolveRoleAgentIdOrLabel(task: TaskLike, role: StandardAgentRole): string {
  return resolveRoleAgentId(task, role) ?? role;
}
