import fs from 'node:fs';
import path from 'node:path';

import { ROLE_HINTS, type StandardAgentRole } from '../agents/roles.js';
import type { ZigrixConfig } from '../config/schema.js';
import { appendEvent } from '../state/events.js';
import { type ExecutionUnit, type WorkPackage, type ZigrixTask, createTask, rebuildIndex, saveTask } from '../state/tasks.js';
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

function buildBootPrompt(task: ZigrixTask, options: { orchestratorId: string; qaAgentId: string }): string {
  return `## Orchestration Task Boot: ${task.taskId}
- **Title:** ${task.title}
- **Scale:** ${task.scale}
- **Orchestrator:** ${options.orchestratorId}

---

## ⚠️ 절대 규칙: QA 역할 워커 호출 필수

**이 태스크는 QA 역할(${options.qaAgentId}) 워커 완료가 필수다.**

---

## ⚡ 필수 첫 단계 (건너뛰기 금지)

아래 명령을 **가장 먼저** 실행하라:

\`\`\`bash
zigrix task start ${task.taskId} --json
\`\`\`

그 후 태스크 메타를 확인하라:

\`\`\`bash
zigrix task status ${task.taskId} --json
\`\`\`

워커 호출 시:
\`\`\`bash
zigrix worker prepare --task-id ${task.taskId} --agent-id <workerId> --description "..." --json
zigrix worker register --task-id ${task.taskId} --agent-id <workerId> --session-key <key> --json
zigrix worker complete --task-id ${task.taskId} --agent-id <workerId> --session-key <key> --run-id <rid> --json
\`\`\`

최종 완료:
\`\`\`bash
zigrix task finalize ${task.taskId} --json
\`\`\`
`;
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

  const task = createTask(paths, {
    title: params.title,
    description: params.description,
    scale: params.scale,
    requiredAgents: [...selection.requiredAgents],
    projectDir: params.projectDir,
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

  const promptPath = path.join(paths.promptsDir, `${task.taskId}-dispatch.md`);
  const dispatchPrompt = [
    `## Orchestration Task: ${task.taskId}`,
    '',
    '### 기본 정보',
    `- **Title:** ${task.title}`,
    `- **Scale:** ${task.scale}`,
    `- **Orchestrator:** ${selection.orchestratorId}`,
    `- **Baseline Required Agents:** ${selection.requiredAgents.join(', ')}`,
    `- **Candidate Agents:** ${selection.candidateAgents.length > 0 ? selection.candidateAgents.join(', ') : '(none)'}`,
    `- **Required Roles:** ${selection.requiredRoles.join(', ')}`,
    `- **Optional Roles:** ${selection.optionalRoles.length > 0 ? selection.optionalRoles.join(', ') : '(none)'}`,
    params.projectDir ? `- **Project Dir:** ${params.projectDir}` : '',
    '',
    '### 요청 내용',
    params.description,
    params.constraints ? `\n### 제약사항\n${params.constraints}` : '',
    '',
    '### 역할 매핑',
    ...Object.entries(selection.roleAgentMap)
      .filter(([, agentIds]) => agentIds.length > 0)
      .map(([role, agentIds]) => `- ${role}: ${agentIds.join(', ')}`),
    '',
    '### 선택 규칙',
    ...Object.entries(selection.selectionHints).map(([agentId, hint]) => `- ${agentId}: ${hint}`),
  ].filter(Boolean).join('\n');
  fs.writeFileSync(promptPath, `${dispatchPrompt}\n`, 'utf8');

  const orchestratorPrompt = buildBootPrompt(task, {
    orchestratorId: selection.orchestratorId,
    qaAgentId: selection.qaAgentId,
  });

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
      projectDir: params.projectDir ?? null,
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
    specPath: path.join(paths.tasksDir, `${task.taskId}.md`),
    metaPath: path.join(paths.tasksDir, `${task.taskId}.meta.json`),
    promptPath,
    orchestratorPrompt,
    projectDir: params.projectDir ?? null,
  };
}
