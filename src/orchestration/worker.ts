import fs from 'node:fs';
import path from 'node:path';

import { appendEvent } from '../state/events.js';
import { type ZigrixPaths, ensureBaseState } from '../state/paths.js';
import { loadTask, saveTask, type ZigrixTask } from '../state/tasks.js';

export const DEFAULT_REQUIRED_AGENTS = ['orchestrator', 'qa'] as const;

const DEFAULT_ORCHESTRATOR_ID = 'pro-zig';
const DEFAULT_QA_AGENT_ID = 'qa-zig';

function resolveDefaultRequiredAgents(task: Partial<ZigrixTask> & Record<string, unknown>): string[] {
  const orchestratorId = typeof task.orchestratorId === 'string' && task.orchestratorId.trim().length > 0
    ? task.orchestratorId
    : DEFAULT_ORCHESTRATOR_ID;
  const qaAgentId = typeof task.qaAgentId === 'string' && task.qaAgentId.trim().length > 0
    ? task.qaAgentId
    : DEFAULT_QA_AGENT_ID;

  const resolvedByRole: Record<(typeof DEFAULT_REQUIRED_AGENTS)[number], string> = {
    orchestrator: orchestratorId,
    qa: qaAgentId,
  };

  return [...new Set(DEFAULT_REQUIRED_AGENTS.map((role) => resolvedByRole[role]))];
}

export function resolveRequiredAgents(task: Partial<ZigrixTask> & Record<string, unknown>): string[] {
  for (const key of ['requiredAgents', 'selectedAgents', 'baselineRequiredAgents']) {
    const value = task[key];
    if (Array.isArray(value) && value.length > 0) {
      return value.map(String);
    }
  }
  const workers = task.workerSessions;
  if (workers && typeof workers === 'object' && Object.keys(workers).length > 0) {
    return Object.keys(workers).sort();
  }
  return resolveDefaultRequiredAgents(task);
}

function renderPrompt(params: {
  task: ZigrixTask;
  agentId: string;
  description: string;
  constraints?: string;
  unitId?: string;
  workPackage?: string;
  dod?: string;
  projectDir?: string;
}): string {
  const sections = [
    `## Worker Assignment: ${params.task.taskId}`,
    '',
    '| Field | Value |',
    '|---|---|',
    `| taskId | ${params.task.taskId} |`,
    `| title | ${params.task.title} |`,
    `| scale | ${params.task.scale} |`,
    `| role | ${params.agentId} |`,
    ...(params.projectDir ? [`| projectDir | ${params.projectDir} |`] : []),
    '',
    '### Assignment',
    params.description,
  ];
  if (params.constraints) sections.push('', '### Constraints', params.constraints);
  if (params.dod) sections.push('', '### Definition of Done', params.dod);
  if (params.unitId || params.workPackage) {
    sections.push('', '### Execution Context', `- unitId: ${params.unitId ?? 'N/A'}`, `- workPackage: ${params.workPackage ?? 'N/A'}`);
  }
  sections.push('', '### Completion', '작업 완료 후 결과와 근거를 명확히 보고하라.');
  return sections.join('\n');
}

export function prepareWorker(paths: ZigrixPaths, params: {
  taskId: string;
  agentId: string;
  description: string;
  constraints?: string;
  unitId?: string;
  workPackage?: string;
  dod?: string;
  projectDir?: string;
}): Record<string, unknown> | null {
  ensureBaseState(paths);
  const task = loadTask(paths, params.taskId);
  if (!task) return null;
  const projectDir = params.projectDir ?? task.projectDir;
  const prompt = renderPrompt({ task, ...params, projectDir });
  const promptPath = path.join(paths.promptsDir, `${params.taskId}-${params.agentId}.md`);
  fs.writeFileSync(promptPath, `${prompt}\n`, 'utf8');
  task.workerSessions[params.agentId] = {
    status: 'prepared',
    unitId: params.unitId,
    workPackage: params.workPackage,
    promptPath,
  };
  const required = task.requiredAgents.length > 0 ? task.requiredAgents : resolveRequiredAgents(task);
  if (!required.includes(params.agentId)) required.push(params.agentId);
  task.requiredAgents = required;
  saveTask(paths, task);
  appendEvent(paths.eventsFile, {
    event: 'worker_prepared',
    taskId: params.taskId,
    phase: 'execution',
    actor: 'zigrix',
    targetAgent: params.agentId,
    status: 'IN_PROGRESS',
    unitId: params.unitId,
    workPackage: params.workPackage,
    payload: { agentId: params.agentId, description: params.description, constraints: params.constraints ?? '', dod: params.dod ?? '', promptPath },
  });
  return { ok: true, taskId: params.taskId, agentId: params.agentId, promptPath, prompt, unitId: params.unitId, workPackage: params.workPackage };
}

export function registerWorker(paths: ZigrixPaths, params: {
  taskId: string;
  agentId: string;
  sessionKey: string;
  runId?: string;
  sessionId?: string;
  unitId?: string;
  workPackage?: string;
  reason?: string;
}): Record<string, unknown> | null {
  const task = loadTask(paths, params.taskId);
  if (!task) return null;
  task.workerSessions[params.agentId] = {
    ...(task.workerSessions[params.agentId] as Record<string, unknown> ?? {}),
    status: 'dispatched',
    sessionKey: params.sessionKey,
    runId: params.runId ?? '',
    sessionId: params.sessionId ?? null,
    unitId: params.unitId,
    workPackage: params.workPackage,
    reason: params.reason ?? '',
  };
  const required = task.requiredAgents.length > 0 ? task.requiredAgents : resolveRequiredAgents(task);
  if (!required.includes(params.agentId)) required.push(params.agentId);
  task.requiredAgents = required;
  saveTask(paths, task);
  appendEvent(paths.eventsFile, {
    event: 'worker_dispatched', taskId: params.taskId, phase: 'execution', actor: 'zigrix', targetAgent: params.agentId, status: 'IN_PROGRESS',
    sessionKey: params.sessionKey, sessionId: params.sessionId ?? null, unitId: params.unitId, workPackage: params.workPackage,
    payload: { agentId: params.agentId, runId: params.runId ?? '', reason: params.reason ?? '' },
  });
  return { ok: true, taskId: params.taskId, agentId: params.agentId, sessionKey: params.sessionKey, runId: params.runId ?? '', sessionId: params.sessionId ?? null, unitId: params.unitId, workPackage: params.workPackage, status: 'dispatched' };
}

export function completeWorker(paths: ZigrixPaths, params: {
  taskId: string;
  agentId: string;
  sessionKey: string;
  runId: string;
  result?: 'done' | 'blocked' | 'skipped';
  sessionId?: string;
  unitId?: string;
  workPackage?: string;
}): Record<string, unknown> | null {
  const task = loadTask(paths, params.taskId);
  if (!task) return null;
  const prev = (task.workerSessions[params.agentId] as Record<string, unknown>) ?? {};
  task.workerSessions[params.agentId] = {
    ...prev,
    status: params.result ?? 'done',
    sessionKey: params.sessionKey,
    runId: params.runId,
    sessionId: params.sessionId ?? prev.sessionId ?? null,
    unitId: params.unitId ?? prev.unitId,
    workPackage: params.workPackage ?? prev.workPackage,
  };
  saveTask(paths, task);
  appendEvent(paths.eventsFile, {
    event: 'worker_done', taskId: params.taskId, phase: 'execution', actor: params.agentId, targetAgent: params.agentId,
    status: (params.result ?? 'done') === 'blocked' ? 'BLOCKED' : 'IN_PROGRESS', sessionKey: params.sessionKey, sessionId: params.sessionId ?? null,
    unitId: params.unitId ?? prev.unitId, workPackage: params.workPackage ?? prev.workPackage,
    payload: { result: params.result ?? 'done', runId: params.runId },
  });
  const evidenceDir = path.join(paths.evidenceDir, params.taskId);
  const presentAgents = fs.existsSync(evidenceDir)
    ? fs.readdirSync(evidenceDir).filter((file) => file.endsWith('.json') && file !== '_merged.json').map((file) => path.basename(file, '.json')).sort()
    : [];
  const required = resolveRequiredAgents(task);
  const missingAgents = required.filter((agentId) => !presentAgents.includes(agentId));
  return { ok: true, taskId: params.taskId, agentId: params.agentId, result: params.result ?? 'done', requiredAgents: required, presentEvidenceAgents: presentAgents, missingEvidenceAgents: missingAgents, allEvidenceCollected: missingAgents.length === 0 };
}
