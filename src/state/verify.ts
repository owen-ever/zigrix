import fs from 'node:fs';
import path from 'node:path';

import { type ZigrixPaths } from './paths.js';
import { listTasks, type ZigrixTask } from './tasks.js';

function safeReadJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sortedStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).sort() : [];
}

function sameStringArray(left: string[], right: string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function verifyTask(paths: ZigrixPaths, task: ZigrixTask): Record<string, unknown> {
  const issues: string[] = [];
  const evidenceDir = path.join(paths.evidenceDir, task.taskId);
  const mergedPath = path.join(evidenceDir, '_merged.json');
  const merged = safeReadJson(mergedPath);
  const presentEvidenceAgents = fs.existsSync(evidenceDir)
    ? fs.readdirSync(evidenceDir).filter((name) => name.endsWith('.json') && name !== '_merged.json').map((name) => path.basename(name, '.json')).sort()
    : [];
  const requiredAgents = Array.isArray(task.requiredAgents) ? task.requiredAgents.map(String).sort() : [];
  const workerAgents = Object.keys(task.workerSessions ?? {}).sort();
  const requiredRoles = Array.isArray(task.requiredRoles) ? task.requiredRoles.map(String).sort() : [];
  const roleAgentMap = task.roleAgentMap && typeof task.roleAgentMap === 'object'
    ? task.roleAgentMap as Record<string, unknown>
    : {};

  for (const agentId of requiredAgents) {
    if (!workerAgents.includes(agentId) && !presentEvidenceAgents.includes(agentId)) {
      issues.push(`required agent '${agentId}' has neither worker session nor evidence`);
    }
  }

  for (const role of requiredRoles) {
    const mappedAgents = Array.isArray(roleAgentMap[role]) ? roleAgentMap[role].map(String).filter(Boolean) : [];
    if (mappedAgents.length === 0) {
      issues.push(`required role '${role}' has no mapped agent in roleAgentMap`);
      continue;
    }
    const hasActiveArtifact = mappedAgents.some((agentId) =>
      requiredAgents.includes(agentId) || workerAgents.includes(agentId) || presentEvidenceAgents.includes(agentId));
    if (!hasActiveArtifact) {
      issues.push(`required role '${role}' has no required agent, worker session, or evidence`);
    }
  }

  if (merged) {
    const mergedPresent = sortedStrings(merged.presentAgents);
    const mergedMissing = sortedStrings(merged.missingAgents);
    const computedMissing = requiredAgents.filter((agentId) => !presentEvidenceAgents.includes(agentId)).sort();
    if (!sameStringArray(mergedPresent, presentEvidenceAgents)) {
      issues.push('merged presentAgents does not match evidence files');
    }
    if (!sameStringArray(mergedMissing, computedMissing)) {
      issues.push('merged missingAgents does not match requiredAgents/evidence files');
    }

    const qaVerification = merged.qaVerification;
    const qaVerificationComplete = Boolean(
      qaVerification &&
      typeof qaVerification === 'object' &&
      !Array.isArray(qaVerification) &&
      (qaVerification as Record<string, unknown>).complete === true,
    );

    if (['DONE_PENDING_REPORT', 'REPORTED'].includes(task.status) && merged.complete !== true) {
      issues.push(`task is ${task.status} but merged evidence is incomplete`);
    }
    if (['DONE_PENDING_REPORT', 'REPORTED'].includes(task.status) && merged.qaPresent === true && !qaVerificationComplete) {
      issues.push('task reached reporting state without DoD↔test verification mapping for QA evidence');
    }
  } else if (['DONE_PENDING_REPORT', 'REPORTED'].includes(task.status)) {
    issues.push(`task is ${task.status} but merged evidence is missing`);
  }

  return {
    taskId: task.taskId,
    status: task.status,
    requiredAgents,
    requiredRoles,
    workerAgents,
    presentEvidenceAgents,
    mergedExists: Boolean(merged),
    ok: issues.length === 0,
    issues,
  };
}

function verifyIndex(paths: ZigrixPaths, tasks: ZigrixTask[]): Record<string, unknown> {
  const issues: string[] = [];
  const index = safeReadJson(paths.indexFile);
  if (!index) {
    issues.push('index.json is missing or unreadable');
    return { ok: false, issues };
  }

  const counts = index.counts && typeof index.counts === 'object' ? index.counts as Record<string, unknown> : {};
  const statusBuckets = index.statusBuckets && typeof index.statusBuckets === 'object'
    ? index.statusBuckets as Record<string, unknown>
    : {};
  const taskSummaries = index.taskSummaries && typeof index.taskSummaries === 'object'
    ? index.taskSummaries as Record<string, unknown>
    : {};
  const activeTasks = index.activeTasks && typeof index.activeTasks === 'object'
    ? index.activeTasks as Record<string, unknown>
    : {};

  if (Number(counts.tasks ?? -1) !== tasks.length) {
    issues.push(`index counts.tasks mismatch: expected ${tasks.length}, got ${String(counts.tasks ?? 'missing')}`);
  }

  const expectedBuckets = new Map<string, string[]>();
  for (const task of tasks) {
    expectedBuckets.set(task.status, [...(expectedBuckets.get(task.status) ?? []), task.taskId]);

    const summary = taskSummaries[task.taskId];
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
      issues.push(`taskSummaries missing entry for ${task.taskId}`);
      continue;
    }
    if ((summary as Record<string, unknown>).status !== task.status) {
      issues.push(`taskSummaries status mismatch for ${task.taskId}`);
    }
  }

  for (const [status, taskIds] of expectedBuckets.entries()) {
    const indexed = sortedStrings(statusBuckets[status]);
    if (!sameStringArray(indexed, taskIds)) {
      issues.push(`statusBuckets mismatch for ${status}`);
    }
  }

  const expectedActiveStatuses = new Set(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE_PENDING_REPORT']);
  const expectedActiveTaskIds = tasks.filter((task) => expectedActiveStatuses.has(task.status)).map((task) => task.taskId).sort();
  const indexedActiveTaskIds = Object.keys(activeTasks).sort();
  if (!sameStringArray(indexedActiveTaskIds, expectedActiveTaskIds)) {
    issues.push('activeTasks mismatch with task statuses');
  }

  return { ok: issues.length === 0, issues };
}

export function verifyState(paths: ZigrixPaths): Record<string, unknown> {
  const tasks = listTasks(paths);
  const checks = tasks.map((task) => verifyTask(paths, task));
  const failures = checks.filter((item) => item.ok === false);
  const indexCheck = verifyIndex(paths, tasks);
  return {
    ok: failures.length === 0 && indexCheck.ok === true,
    taskCount: tasks.length,
    failedCount: failures.length + (indexCheck.ok === true ? 0 : 1),
    checks,
    index: indexCheck,
  };
}
