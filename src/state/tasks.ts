import fs from 'node:fs';
import path from 'node:path';

import { appendEvent, loadEvents, nowIso } from './events.js';
import { type ZigrixPaths, ensureProjectState } from './paths.js';

export type ZigrixTask = {
  taskId: string;
  title: string;
  description: string;
  scale: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  requiredAgents: string[];
  workerSessions: Record<string, unknown>;
};

const TASK_ID_RE = /^TASK-(\d{8})-(\d{3})$/;

function taskPath(paths: ZigrixPaths, taskId: string): string {
  return path.join(paths.tasksDir, `${taskId}.json`);
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function nextTaskId(paths: ZigrixPaths): string {
  ensureProjectState(paths);
  const today = nowIso().slice(0, 10).replaceAll('-', '');
  const prefix = `TASK-${today}-`;
  let maxN = 0;
  for (const name of fs.readdirSync(paths.tasksDir)) {
    if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
    const match = TASK_ID_RE.exec(path.basename(name, '.json'));
    if (match) maxN = Math.max(maxN, Number(match[2]));
  }
  return `${prefix}${String(maxN + 1).padStart(3, '0')}`;
}

export function saveTask(paths: ZigrixPaths, task: ZigrixTask): ZigrixTask {
  ensureProjectState(paths);
  task.updatedAt = nowIso();
  fs.writeFileSync(taskPath(paths, task.taskId), `${JSON.stringify(task, null, 2)}\n`, 'utf8');
  rebuildIndex(paths);
  return task;
}

export function loadTask(paths: ZigrixPaths, taskId: string): ZigrixTask | null {
  const data = readJson(taskPath(paths, taskId));
  return data as ZigrixTask | null;
}

export function listTasks(paths: ZigrixPaths): ZigrixTask[] {
  ensureProjectState(paths);
  return fs.readdirSync(paths.tasksDir)
    .filter((name) => name.startsWith('TASK-') && name.endsWith('.json'))
    .sort()
    .flatMap((name) => {
      const data = readJson(path.join(paths.tasksDir, name));
      return data ? [data as ZigrixTask] : [];
    });
}

export function listTaskEvents(paths: ZigrixPaths, taskId?: string): Array<Record<string, unknown>> {
  const rows = loadEvents(paths.eventsFile);
  return taskId ? rows.filter((row) => String(row.taskId ?? '') === taskId) : rows;
}

export function createTask(paths: ZigrixPaths, params: { title: string; description: string; scale?: string; requiredAgents?: string[] }): ZigrixTask {
  const task: ZigrixTask = {
    taskId: nextTaskId(paths),
    title: params.title,
    description: params.description,
    scale: params.scale ?? 'normal',
    status: 'OPEN',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    requiredAgents: [...(params.requiredAgents ?? [])],
    workerSessions: {},
  };
  saveTask(paths, task);
  appendEvent(paths.eventsFile, {
    event: 'task_created',
    taskId: task.taskId,
    status: 'OPEN',
    title: task.title,
    scale: task.scale,
    payload: { requiredAgents: task.requiredAgents },
  });
  rebuildIndex(paths);
  return task;
}

export function updateTaskStatus(paths: ZigrixPaths, taskId: string, status: string): ZigrixTask | null {
  const task = loadTask(paths, taskId);
  if (!task) return null;
  task.status = status;
  saveTask(paths, task);
  appendEvent(paths.eventsFile, { event: 'task_status_changed', taskId, status });
  rebuildIndex(paths);
  return task;
}

export function recordTaskProgress(paths: ZigrixPaths, params: { taskId: string; actor: string; message: string; unitId?: string; workPackage?: string }): Record<string, unknown> | null {
  const task = loadTask(paths, params.taskId);
  if (!task) return null;
  saveTask(paths, task);
  const event = appendEvent(paths.eventsFile, {
    event: 'progress_report',
    taskId: params.taskId,
    phase: 'execution',
    actor: params.actor,
    payload: {
      message: params.message,
      unitId: params.unitId,
      workPackage: params.workPackage,
    },
  });
  rebuildIndex(paths);
  return event;
}

export function findStaleTasks(paths: ZigrixPaths, hours = 24): ZigrixTask[] {
  const cutoff = Date.now() - hours * 3600 * 1000;
  return listTasks(paths).filter((task) => task.status === 'IN_PROGRESS' && Date.parse(task.updatedAt) < cutoff);
}

export function applyStalePolicy(paths: ZigrixPaths, hours = 24, reason = 'stale_timeout'): Record<string, unknown> {
  const staleTasks = findStaleTasks(paths, hours);
  const changed = staleTasks.map((task) => {
    task.status = 'BLOCKED';
    saveTask(paths, task);
    const event = appendEvent(paths.eventsFile, {
      event: 'task_blocked',
      taskId: task.taskId,
      phase: 'recovery',
      actor: 'zigrix',
      status: 'BLOCKED',
      payload: { reason, previousStatus: 'IN_PROGRESS', hoursThreshold: hours },
    });
    return { taskId: task.taskId, event };
  });
  rebuildIndex(paths);
  return { ok: true, hours, reason, count: changed.length, changed };
}

export function rebuildIndex(paths: ZigrixPaths): Record<string, unknown> {
  ensureProjectState(paths);
  const tasks = listTasks(paths);
  const events = loadEvents(paths.eventsFile);
  const activeStatuses = new Set(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE_PENDING_REPORT']);
  const statusBuckets: Record<string, string[]> = {};
  const taskSummaries: Record<string, Record<string, unknown>> = {};
  const activeTasks: Record<string, Record<string, unknown>> = {};

  for (const task of tasks) {
    statusBuckets[task.status] ??= [];
    statusBuckets[task.status].push(task.taskId);
    const summary = {
      title: task.title,
      status: task.status,
      scale: task.scale,
      requiredAgents: task.requiredAgents,
      updatedAt: task.updatedAt,
    };
    taskSummaries[task.taskId] = summary;
    if (activeStatuses.has(task.status)) activeTasks[task.taskId] = summary;
  }

  const index = {
    version: '0.1',
    updatedAt: nowIso(),
    counts: { tasks: tasks.length, events: events.length },
    statusBuckets,
    activeTasks,
    taskSummaries,
  };
  fs.writeFileSync(paths.indexFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return index;
}
