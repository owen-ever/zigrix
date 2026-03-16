import fs from 'node:fs';
import path from 'node:path';

import { appendEvent, loadEvents, nowIso } from './events.js';
import { type ZigrixPaths, ensureBaseState } from './paths.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type WorkPackage = {
  id: string;
  key: string;
  title: string;
  parallel: boolean;
};

export type ExecutionUnit = {
  id: string;
  title: string;
  kind: string;
  owner: string;
  workPackage: string;
  dependsOn: string[];
  parallel: boolean;
  status: string;
  dod: string;
};

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
  projectDir?: string;
  requestedBy?: string;
  selectedAgents?: string[];
  workPackages?: WorkPackage[];
  executionUnits?: ExecutionUnit[];
  orchestratorSessionKey?: string;
  orchestratorSessionId?: string;
};

// ─── Paths ──────────────────────────────────────────────────────────────────

const TASK_ID_RE = /^(DEV|TEST|TASK)-(\d{8})-(\d{3})$/;

function metaPath(paths: ZigrixPaths, taskId: string): string {
  return path.join(paths.tasksDir, `${taskId}.meta.json`);
}

function specPath(paths: ZigrixPaths, taskId: string): string {
  return path.join(paths.tasksDir, `${taskId}.md`);
}

/** Legacy flat JSON path (backward compat read) */
function legacyPath(paths: ZigrixPaths, taskId: string): string {
  return path.join(paths.tasksDir, `${taskId}.json`);
}

// ─── Read helpers ───────────────────────────────────────────────────────────

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Task ID generation ─────────────────────────────────────────────────────

export function nextTaskId(paths: ZigrixPaths, prefix = 'DEV'): string {
  ensureBaseState(paths);
  const today = nowIso().slice(0, 10).replaceAll('-', '');
  const idPrefix = `${prefix}-${today}-`;
  let maxN = 0;
  for (const name of fs.readdirSync(paths.tasksDir)) {
    const base = name.replace(/\.(meta\.json|json|md)$/, '');
    const match = TASK_ID_RE.exec(base);
    if (match && base.startsWith(idPrefix)) {
      maxN = Math.max(maxN, Number(match[3]));
    }
  }
  return `${idPrefix}${String(maxN + 1).padStart(3, '0')}`;
}

// ─── Spec template ──────────────────────────────────────────────────────────

function renderSpecMd(task: ZigrixTask): string {
  return [
    '# Task Spec',
    '',
    '## 0) Task Metadata',
    `- Task ID: \`${task.taskId}\``,
    `- Title: ${task.title}`,
    `- Scale: \`${task.scale}\``,
    `- Status: \`${task.status}\``,
    `- Created: ${task.createdAt}`,
    task.requestedBy ? `- Requested by: ${task.requestedBy}` : null,
    task.projectDir ? `- Project dir: ${task.projectDir}` : null,
    `- Meta: \`${task.taskId}.meta.json\``,
    '',
    '## Spec Rule',
    '- `normal|risky|large`: 이 문서 작성/갱신 완료 전 작업 진행 금지',
    '- `simple`: 요약형 허용, 문서 파일은 반드시 생성',
    '- 사람용 문서. 기계용 정보는 `.meta.json` 우선.',
    '',
    '## 1) Scope',
    '### In-Scope',
    task.description,
    '',
    '### Out-of-Scope',
    '- (TBD)',
    '',
    '## 2) Orchestration Plan',
    `- Required agents: ${task.requiredAgents.join(', ') || '(none)'}`,
    task.selectedAgents?.length ? `- Selected agents: ${task.selectedAgents.join(', ')}` : null,
    '',
    '## 3) Notes',
    '- (TBD)',
    '',
  ].filter((line) => line !== null).join('\n');
}

// ─── Save / Load ────────────────────────────────────────────────────────────

export function saveTask(paths: ZigrixPaths, task: ZigrixTask): ZigrixTask {
  ensureBaseState(paths);
  task.updatedAt = nowIso();

  // Write meta.json (machine data)
  fs.writeFileSync(metaPath(paths, task.taskId), `${JSON.stringify(task, null, 2)}\n`, 'utf8');

  // Write .md spec if it doesn't exist yet (don't overwrite human edits)
  const mdPath = specPath(paths, task.taskId);
  if (!fs.existsSync(mdPath)) {
    fs.writeFileSync(mdPath, renderSpecMd(task), 'utf8');
  }

  rebuildIndex(paths);
  return task;
}

export function loadTask(paths: ZigrixPaths, taskId: string): ZigrixTask | null {
  // Prefer .meta.json, fall back to legacy .json
  const meta = readJson(metaPath(paths, taskId));
  if (meta) return meta as ZigrixTask;
  const legacy = readJson(legacyPath(paths, taskId));
  return legacy as ZigrixTask | null;
}

export function listTasks(paths: ZigrixPaths): ZigrixTask[] {
  ensureBaseState(paths);
  const seen = new Set<string>();
  const tasks: ZigrixTask[] = [];

  for (const name of fs.readdirSync(paths.tasksDir).sort()) {
    let taskId: string | null = null;

    if (name.endsWith('.meta.json')) {
      taskId = name.replace(/\.meta\.json$/, '');
    } else if (name.endsWith('.json') && !name.endsWith('.meta.json')) {
      taskId = name.replace(/\.json$/, '');
    }

    if (!taskId || seen.has(taskId)) continue;
    if (!TASK_ID_RE.test(taskId)) continue;

    const data = loadTask(paths, taskId);
    if (data) {
      seen.add(taskId);
      tasks.push(data);
    }
  }

  return tasks;
}

// ─── Events ─────────────────────────────────────────────────────────────────

export function listTaskEvents(paths: ZigrixPaths, taskId?: string): Array<Record<string, unknown>> {
  const rows = loadEvents(paths.eventsFile);
  return taskId ? rows.filter((row) => String(row.taskId ?? '') === taskId) : rows;
}

// ─── Create ─────────────────────────────────────────────────────────────────

export function createTask(paths: ZigrixPaths, params: {
  title: string;
  description: string;
  scale?: string;
  requiredAgents?: string[];
  projectDir?: string;
  requestedBy?: string;
  prefix?: string;
}): ZigrixTask {
  const task: ZigrixTask = {
    taskId: nextTaskId(paths, params.prefix ?? 'DEV'),
    title: params.title,
    description: params.description,
    scale: params.scale ?? 'normal',
    status: 'OPEN',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    requiredAgents: [...(params.requiredAgents ?? [])],
    workerSessions: {},
    ...(params.projectDir ? { projectDir: params.projectDir } : {}),
    ...(params.requestedBy ? { requestedBy: params.requestedBy } : {}),
  };
  saveTask(paths, task);
  appendEvent(paths.eventsFile, {
    event: 'task_created',
    taskId: task.taskId,
    status: 'OPEN',
    title: task.title,
    scale: task.scale,
    payload: { requiredAgents: task.requiredAgents, projectDir: params.projectDir ?? null },
  });
  rebuildIndex(paths);
  return task;
}

// ─── Status transitions ─────────────────────────────────────────────────────

export function updateTaskStatus(paths: ZigrixPaths, taskId: string, status: string): ZigrixTask | null {
  const task = loadTask(paths, taskId);
  if (!task) return null;
  task.status = status;
  saveTask(paths, task);
  appendEvent(paths.eventsFile, { event: 'task_status_changed', taskId, status });
  rebuildIndex(paths);
  return task;
}

export function recordTaskProgress(paths: ZigrixPaths, params: {
  taskId: string;
  actor: string;
  message: string;
  unitId?: string;
  workPackage?: string;
}): Record<string, unknown> | null {
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

// ─── Stale policy ───────────────────────────────────────────────────────────

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

// ─── Index ──────────────────────────────────────────────────────────────────

export function rebuildIndex(paths: ZigrixPaths): Record<string, unknown> {
  ensureBaseState(paths);
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
      projectDir: task.projectDir ?? null,
      updatedAt: task.updatedAt,
    };
    taskSummaries[task.taskId] = summary;
    if (activeStatuses.has(task.status)) activeTasks[task.taskId] = summary;
  }

  const index = {
    version: '2.0',
    updatedAt: nowIso(),
    policy: {
      sourceOfTruth: 'tasks.jsonl',
      projection: 'index.json',
      qaRequiredForAllScales: true,
    },
    counts: { tasks: tasks.length, events: events.length },
    statusBuckets,
    activeTasks,
    taskSummaries,
  };
  fs.writeFileSync(paths.indexFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return index;
}
