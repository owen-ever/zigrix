import fs from 'node:fs';
import path from 'node:path';

import type { ZigrixConfig } from '../config/schema.js';
import { appendEvent } from '../state/events.js';
import { type ZigrixPaths, ensureBaseState } from '../state/paths.js';
import { loadTask, resolveTaskPaths, saveTask, type ZigrixTask } from '../state/tasks.js';
import { buildSpawnLabel, composeWorkerPrompt } from './prompt-compose.js';

export const DEFAULT_REQUIRED_ROLES = ['orchestrator', 'qa'] as const;

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function roleFallback(
  task: Partial<ZigrixTask> & Record<string, unknown>,
  role: (typeof DEFAULT_REQUIRED_ROLES)[number],
): string | null {
  const roleMap = task.roleAgentMap;
  if (roleMap && typeof roleMap === 'object') {
    const mapped = (roleMap as Record<string, unknown>)[role];
    if (Array.isArray(mapped) && mapped.length > 0) {
      const first = firstNonEmpty(mapped[0]);
      if (first) return first;
    }
  }
  return null;
}

function resolveDefaultRequiredAgents(
  task: Partial<ZigrixTask> & Record<string, unknown>,
): string[] {
  const resolvedByRole: Record<(typeof DEFAULT_REQUIRED_ROLES)[number], string | null> = {
    orchestrator: firstNonEmpty(task.orchestratorId) ?? roleFallback(task, 'orchestrator'),
    qa: firstNonEmpty(task.qaAgentId) ?? roleFallback(task, 'qa'),
  };

  const resolved = DEFAULT_REQUIRED_ROLES
    .map((role) => resolvedByRole[role])
    .filter((item): item is string => Boolean(item && item.length > 0));

  return [...new Set(resolved)];
}

export function resolveRequiredAgents(
  task: Partial<ZigrixTask> & Record<string, unknown>,
): string[] {
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

function normalizePathValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return path.resolve(value.trim());
}

function parseSessionKey(sessionKey: string): { agentId: string; sessionId: string } | null {
  const matched = sessionKey.match(/^agent:([^:]+):subagent:([^:\s]+)$/);
  if (!matched) return null;
  return { agentId: matched[1], sessionId: matched[2] };
}

export function prepareWorker(
  paths: ZigrixPaths,
  config: ZigrixConfig,
  params: {
    taskId: string;
    agentId: string;
    description: string;
    constraints?: string;
    unitId?: string;
    workPackage?: string;
    dod?: string;
    projectDir?: string;
  },
): Record<string, unknown> | null {
  ensureBaseState(paths);
  const task = loadTask(paths, params.taskId);
  if (!task) return null;

  const taskPaths = resolveTaskPaths(paths, params.taskId);
  const promptPath = path.join(paths.promptsDir, `${params.taskId}-${params.agentId}.md`);
  const projectDir = normalizePathValue(params.projectDir ?? task.projectDir ?? null);
  const spawnLabel = buildSpawnLabel(params.taskId, params.agentId);

  const composed = composeWorkerPrompt({
    paths,
    config,
    task,
    agentId: params.agentId,
    description: params.description,
    constraints: params.constraints,
    unitId: params.unitId,
    workPackage: params.workPackage,
    dod: params.dod,
    projectDir,
    promptPath,
    specPath: taskPaths.specPath,
    metaPath: taskPaths.metaPath,
  });

  fs.writeFileSync(promptPath, `${composed.prompt}\n`, 'utf8');

  task.workerSessions[params.agentId] = {
    ...(task.workerSessions[params.agentId] as Record<string, unknown> ?? {}),
    status: 'prepared',
    role: composed.role,
    unitId: params.unitId,
    workPackage: params.workPackage,
    promptPath,
    expectedLabel: spawnLabel,
    projectDir,
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
    payload: {
      agentId: params.agentId,
      role: composed.role,
      description: params.description,
      constraints: params.constraints ?? '',
      dod: params.dod ?? '',
      promptPath,
      spawnLabel,
      projectDir,
    },
  });

  return {
    ok: true,
    taskId: params.taskId,
    agentId: params.agentId,
    role: composed.role,
    promptPath,
    prompt: composed.prompt,
    unitId: params.unitId,
    workPackage: params.workPackage,
    projectDir,
    spawnLabel,
    ...taskPaths,
  };
}

export function registerWorker(
  paths: ZigrixPaths,
  params: {
    taskId: string;
    agentId: string;
    sessionKey: string;
    runId?: string;
    sessionId?: string;
    unitId?: string;
    workPackage?: string;
    reason?: string;
    label?: string;
    projectDir?: string;
  },
): Record<string, unknown> | null {
  const task = loadTask(paths, params.taskId);
  if (!task) return null;

  const parsedKey = parseSessionKey(params.sessionKey);
  if (parsedKey && parsedKey.agentId !== params.agentId) {
    throw new Error(
      `worker register validation failed: sessionKey belongs to '${parsedKey.agentId}', expected '${params.agentId}'`,
    );
  }

  const previous = (task.workerSessions[params.agentId] as Record<string, unknown>) ?? {};
  const expectedLabel = firstNonEmpty(previous.expectedLabel) ?? buildSpawnLabel(params.taskId, params.agentId);
  const providedLabel = firstNonEmpty(params.label);
  if (!providedLabel) {
    throw new Error('worker register validation failed: label is required (use spawnLabel from worker prepare).');
  }
  if (providedLabel !== expectedLabel) {
    throw new Error(
      `worker register validation failed: label mismatch (expected '${expectedLabel}', got '${providedLabel}')`,
    );
  }

  const expectedProjectDir = normalizePathValue(
    firstNonEmpty(previous.projectDir, task.projectDir),
  );
  const providedProjectDir = normalizePathValue(params.projectDir);
  if (expectedProjectDir && !providedProjectDir) {
    throw new Error('worker register validation failed: projectDir is required for this task.');
  }
  if (expectedProjectDir && providedProjectDir && expectedProjectDir !== providedProjectDir) {
    throw new Error(
      `worker register validation failed: projectDir mismatch (expected '${expectedProjectDir}', got '${providedProjectDir}')`,
    );
  }

  const resolvedSessionId = params.sessionId || parsedKey?.sessionId || null;
  const resolvedProjectDir = providedProjectDir ?? expectedProjectDir;

  task.workerSessions[params.agentId] = {
    ...previous,
    status: 'dispatched',
    sessionKey: params.sessionKey,
    runId: params.runId ?? '',
    sessionId: resolvedSessionId,
    unitId: params.unitId,
    workPackage: params.workPackage,
    reason: params.reason ?? '',
    label: providedLabel,
    expectedLabel,
    projectDir: resolvedProjectDir,
  };

  const required = task.requiredAgents.length > 0 ? task.requiredAgents : resolveRequiredAgents(task);
  if (!required.includes(params.agentId)) required.push(params.agentId);
  task.requiredAgents = required;
  saveTask(paths, task);

  appendEvent(paths.eventsFile, {
    event: 'worker_dispatched',
    taskId: params.taskId,
    phase: 'execution',
    actor: 'zigrix',
    targetAgent: params.agentId,
    status: 'IN_PROGRESS',
    sessionKey: params.sessionKey,
    sessionId: resolvedSessionId,
    unitId: params.unitId,
    workPackage: params.workPackage,
    payload: {
      agentId: params.agentId,
      runId: params.runId ?? '',
      reason: params.reason ?? '',
      label: providedLabel,
      projectDir: resolvedProjectDir,
    },
  });

  return {
    ok: true,
    taskId: params.taskId,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    runId: params.runId ?? '',
    sessionId: resolvedSessionId,
    unitId: params.unitId,
    workPackage: params.workPackage,
    label: providedLabel,
    projectDir: resolvedProjectDir,
    status: 'dispatched',
  };
}

export function completeWorker(
  paths: ZigrixPaths,
  params: {
    taskId: string;
    agentId: string;
    sessionKey: string;
    runId: string;
    result?: 'done' | 'blocked' | 'skipped';
    sessionId?: string;
    unitId?: string;
    workPackage?: string;
  },
): Record<string, unknown> | null {
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
    event: 'worker_done',
    taskId: params.taskId,
    phase: 'execution',
    actor: params.agentId,
    targetAgent: params.agentId,
    status: (params.result ?? 'done') === 'blocked' ? 'BLOCKED' : 'IN_PROGRESS',
    sessionKey: params.sessionKey,
    sessionId: params.sessionId ?? null,
    unitId: params.unitId ?? prev.unitId,
    workPackage: params.workPackage ?? prev.workPackage,
    payload: { result: params.result ?? 'done', runId: params.runId },
  });

  const evidenceDir = path.join(paths.evidenceDir, params.taskId);
  const presentAgents = fs.existsSync(evidenceDir)
    ? fs
        .readdirSync(evidenceDir)
        .filter((file) => file.endsWith('.json') && file !== '_merged.json')
        .map((file) => path.basename(file, '.json'))
        .sort()
    : [];

  const required = resolveRequiredAgents(task);
  const missingAgents = required.filter((agentId) => !presentAgents.includes(agentId));
  return {
    ok: true,
    taskId: params.taskId,
    agentId: params.agentId,
    result: params.result ?? 'done',
    requiredAgents: required,
    presentEvidenceAgents: presentAgents,
    missingEvidenceAgents: missingAgents,
    allEvidenceCollected: missingAgents.length === 0,
  };
}
