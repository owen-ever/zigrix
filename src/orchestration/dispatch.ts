import fs from 'node:fs';
import path from 'node:path';

import { ROLE_HINTS, type StandardAgentRole } from '../agents/roles.js';
import { resolveAbsolutePath } from '../config/defaults.js';
import type { ZigrixConfig } from '../config/schema.js';
import { composeOrchestratorPrompt, buildSpawnLabel } from './prompt-compose.js';
import { appendEvent } from '../state/events.js';
import { type ExecutionUnit, type WorkPackage, createTask, rebuildIndex, resolveTaskPaths, saveTask } from '../state/tasks.js';
import { type ZigrixPaths, ensureBaseState } from '../state/paths.js';

const BASELINE_REQUIRED_ROLES: StandardAgentRole[] = ['orchestrator', 'qa'];
const CANDIDATE_ROLE_ORDER: StandardAgentRole[] = ['frontend', 'backend', 'system', 'security'];

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function listEligibleAgentsByRole(config: ZigrixConfig): Map<StandardAgentRole, string[]> {
  const byRole = new Map<StandardAgentRole, string[]>();
  const participants = new Set(config.agents.orchestration.participants);
  const excluded = new Set(config.agents.orchestration.excluded);
  const participantMode = participants.size > 0;

  for (const [agentId, agent] of Object.entries(config.agents.registry).sort(([a], [b]) => a.localeCompare(b))) {
    if (!agent.enabled) continue;
    if (excluded.has(agentId)) continue;
    if (participantMode && !participants.has(agentId)) continue;

    const role = agent.role;
    const row = byRole.get(role) ?? [];
    row.push(agentId);
    byRole.set(role, row);
  }

  return byRole;
}

function pickRequiredAgentByRole(params: {
  role: StandardAgentRole;
  roleAgents: string[];
  orchestratorId: string;
}): string {
  if (params.role === 'orchestrator') {
    if (params.roleAgents.length === 0) {
      throw new Error('dispatch validation failed: no eligible agent for required role "orchestrator"');
    }
    if (!params.roleAgents.includes(params.orchestratorId)) {
      throw new Error(
        `dispatch validation failed: configured orchestratorId '${params.orchestratorId}' is not eligible (available: ${params.roleAgents.join(', ')})`,
      );
    }
    return params.orchestratorId;
  }

  const picked = params.roleAgents[0];
  if (!picked) {
    throw new Error(`dispatch validation failed: no eligible agent for required role "${params.role}"`);
  }
  return picked;
}

function resolveAgentSelection(config: ZigrixConfig, scale: string): {
  requiredRoles: StandardAgentRole[];
  optionalRoles: StandardAgentRole[];
  requiredAgents: string[];
  candidateAgents: string[];
  roleAgentMap: Record<string, string[]>;
  selectionHints: Record<string, string>;
  orchestratorId: string;
  qaAgentId: string;
} {
  const scalePolicy = config.rules.scales[scale];
  if (!scalePolicy) {
    throw new Error(`unknown scale: ${scale}`);
  }

  const requiredRoles = unique([...BASELINE_REQUIRED_ROLES, ...scalePolicy.requiredRoles]);
  const optionalRoles = unique(scalePolicy.optionalRoles.filter((role) => !requiredRoles.includes(role)));
  const eligibleByRole = listEligibleAgentsByRole(config);

  const requiredAgents: string[] = [];
  const roleAgentMap: Record<string, string[]> = {};

  for (const role of requiredRoles) {
    const roleAgents = eligibleByRole.get(role) ?? [];
    roleAgentMap[role] = [...roleAgents];
    const picked = pickRequiredAgentByRole({
      role,
      roleAgents,
      orchestratorId: config.agents.orchestration.orchestratorId,
    });
    requiredAgents.push(picked);
  }

  const candidateRoles = unique([...optionalRoles, ...CANDIDATE_ROLE_ORDER.filter((role) => !requiredRoles.includes(role))]);
  const candidateAgents: string[] = [];
  for (const role of candidateRoles) {
    const roleAgents = eligibleByRole.get(role) ?? [];
    roleAgentMap[role] = [...roleAgents];
    for (const agentId of roleAgents) {
      if (requiredAgents.includes(agentId)) continue;
      if (!candidateAgents.includes(agentId)) candidateAgents.push(agentId);
    }
  }

  const selectionHints: Record<string, string> = {};
  for (const [role, agentIds] of Object.entries(roleAgentMap)) {
    const hint = ROLE_HINTS[role as StandardAgentRole] ?? 'role-based selection';
    for (const agentId of agentIds) {
      selectionHints[agentId] = `${hint} (role: ${role})`;
    }
  }

  const qaAgentId = requiredAgents.find((agentId) => {
    const role = config.agents.registry[agentId]?.role;
    return role === 'qa';
  });
  if (!qaAgentId) {
    throw new Error('dispatch validation failed: no selected QA agent');
  }

  return {
    requiredRoles,
    optionalRoles,
    requiredAgents,
    candidateAgents,
    roleAgentMap,
    selectionHints,
    orchestratorId: config.agents.orchestration.orchestratorId,
    qaAgentId,
  };
}

export function resolveConfiguredProjectDir(config: ZigrixConfig, explicitProjectDir?: string): string | undefined {
  const explicit = explicitProjectDir?.trim();
  if (explicit) {
    return resolveAbsolutePath(explicit);
  }

  const configured = config.workspace.projectsBaseDir?.trim();
  if (configured && configured.length > 0) {
    return resolveAbsolutePath(configured);
  }

  return undefined;
}

function defaultWorkPackages(scale: string): WorkPackage[] {
  return [
    { id: 'WP1', key: 'planning', title: 'planning', parallel: false },
    { id: 'WP2', key: 'implementation', title: 'implementation', parallel: ['normal', 'risky', 'large'].includes(scale) },
    { id: 'WP3', key: 'verification', title: 'verification', parallel: false },
    { id: 'WP4', key: 'release', title: 'release', parallel: false },
  ];
}

function defaultExecutionUnits(scale: string, owners: { orchestratorId: string; qaAgentId: string }): ExecutionUnit[] {
  if (['normal', 'risky', 'large'].includes(scale)) {
    return [
      { id: 'U1', title: 'spec confirmation', kind: 'planning', owner: owners.orchestratorId, workPackage: 'planning', dependsOn: [], parallel: false, status: 'OPEN', dod: 'scope / constraints / edge cases fixed' },
      { id: 'U2', title: 'implementation planning / work package split', kind: 'planning', owner: owners.orchestratorId, workPackage: 'planning', dependsOn: ['U1'], parallel: false, status: 'OPEN', dod: 'execution units and work packages fixed' },
      { id: 'U3', title: 'implementation slices', kind: 'implementation', owner: owners.orchestratorId, workPackage: 'implementation', dependsOn: ['U2'], parallel: true, status: 'OPEN', dod: 'required work packages complete' },
      { id: 'U4', title: 'qa / regression', kind: 'verification', owner: owners.qaAgentId, workPackage: 'verification', dependsOn: ['U3'], parallel: false, status: 'OPEN', dod: 'qa evidence attached' },
      { id: 'U5', title: 'report / deploy / wrap-up', kind: 'reporting', owner: owners.orchestratorId, workPackage: 'release', dependsOn: ['U4'], parallel: false, status: 'OPEN', dod: 'final report prepared and deployment decision recorded' },
    ];
  }
  return [
    { id: 'U1', title: 'spec confirmation', kind: 'planning', owner: owners.orchestratorId, workPackage: 'planning', dependsOn: [], parallel: false, status: 'OPEN', dod: 'scope / constraints / edge cases fixed' },
    { id: 'U2', title: 'implementation slice', kind: 'implementation', owner: owners.orchestratorId, workPackage: 'implementation', dependsOn: ['U1'], parallel: false, status: 'OPEN', dod: 'main implementation slice complete' },
    { id: 'U3', title: 'qa / regression', kind: 'verification', owner: owners.qaAgentId, workPackage: 'verification', dependsOn: ['U2'], parallel: false, status: 'OPEN', dod: 'qa evidence attached' },
  ];
}

export function dispatchTask(paths: ZigrixPaths, config: ZigrixConfig, params: {
  title: string;
  description: string;
  scale: string;
  projectDir?: string;
  requestedBy?: string;
  constraints?: string;
}): Record<string, unknown> {
  ensureBaseState(paths);

  const selection = resolveAgentSelection(config, params.scale);
  const projectDir = resolveConfiguredProjectDir(config, params.projectDir);

  const task = createTask(paths, {
    title: params.title,
    description: params.description,
    scale: params.scale,
    requiredAgents: [...selection.requiredAgents],
    projectDir,
    requestedBy: params.requestedBy,
  });

  task.selectedAgents = [...selection.requiredAgents];
  task.workPackages = defaultWorkPackages(params.scale);
  task.executionUnits = defaultExecutionUnits(params.scale, {
    orchestratorId: selection.orchestratorId,
    qaAgentId: selection.qaAgentId,
  });
  task.baselineRequiredAgents = [...selection.requiredAgents];
  task.candidateAgents = [...selection.candidateAgents];
  task.requiredRoles = [...selection.requiredRoles];
  task.optionalRoles = [...selection.optionalRoles];
  task.roleAgentMap = selection.roleAgentMap;
  task.orchestratorId = selection.orchestratorId;
  task.qaAgentId = selection.qaAgentId;
  saveTask(paths, task);

  const taskPaths = resolveTaskPaths(paths, task.taskId);
  const promptPath = path.join(paths.promptsDir, `${task.taskId}-dispatch.md`);
  const orchestratorLabel = buildSpawnLabel(task.taskId, selection.orchestratorId);
  const orchestratorPrompt = composeOrchestratorPrompt({
    paths,
    task,
    orchestratorId: selection.orchestratorId,
    qaAgentId: selection.qaAgentId,
    promptPath,
    specPath: taskPaths.specPath,
    metaPath: taskPaths.metaPath,
    projectDir: projectDir ?? null,
    constraints: params.constraints,
  });
  fs.writeFileSync(promptPath, `${orchestratorPrompt}\n`, 'utf8');

  appendEvent(paths.eventsFile, {
    event: 'task_dispatched',
    taskId: task.taskId,
    phase: 'dispatch',
    actor: 'zigrix',
    status: 'OPEN',
    payload: {
      scale: task.scale,
      orchestratorId: selection.orchestratorId,
      baselineRequiredAgents: selection.requiredAgents,
      candidateAgents: selection.candidateAgents,
      requiredRoles: selection.requiredRoles,
      optionalRoles: selection.optionalRoles,
      roleAgentMap: selection.roleAgentMap,
      projectDir: projectDir ?? null,
    },
  });
  rebuildIndex(paths);

  return {
    ok: true,
    taskId: task.taskId,
    title: task.title,
    scale: task.scale,
    orchestratorId: selection.orchestratorId,
    qaAgentId: selection.qaAgentId,
    baselineRequiredAgents: selection.requiredAgents,
    candidateAgents: selection.candidateAgents,
    requiredRoles: selection.requiredRoles,
    optionalRoles: selection.optionalRoles,
    roleAgentMap: selection.roleAgentMap,
    specPath: taskPaths.specPath,
    metaPath: taskPaths.metaPath,
    promptPath,
    orchestratorPrompt,
    orchestratorLabel,
    projectDir: projectDir ?? null,
  };
}
