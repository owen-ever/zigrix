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

function verifyTask(paths: ZigrixPaths, task: ZigrixTask): Record<string, unknown> {
  const issues: string[] = [];
  const evidenceDir = path.join(paths.evidenceDir, task.taskId);
  const mergedPath = path.join(evidenceDir, '_merged.json');
  const merged = safeReadJson(mergedPath);
  const presentEvidenceAgents = fs.existsSync(evidenceDir)
    ? fs.readdirSync(evidenceDir).filter((name) => name.endsWith('.json') && name !== '_merged.json').map((name) => path.basename(name, '.json')).sort()
    : [];
  const requiredAgents = Array.isArray(task.requiredAgents) ? task.requiredAgents.map(String) : [];
  const workerAgents = Object.keys(task.workerSessions ?? {}).sort();

  for (const agentId of requiredAgents) {
    if (!workerAgents.includes(agentId) && !presentEvidenceAgents.includes(agentId)) {
      issues.push(`required agent '${agentId}' has neither worker session nor evidence`);
    }
  }

  if (merged) {
    const mergedPresent = Array.isArray(merged.presentAgents) ? merged.presentAgents.map(String).sort() : [];
    const mergedMissing = Array.isArray(merged.missingAgents) ? merged.missingAgents.map(String).sort() : [];
    const computedMissing = requiredAgents.filter((agentId) => !presentEvidenceAgents.includes(agentId)).sort();
    if (JSON.stringify(mergedPresent) !== JSON.stringify(presentEvidenceAgents)) {
      issues.push('merged presentAgents does not match evidence files');
    }
    if (JSON.stringify(mergedMissing) !== JSON.stringify(computedMissing)) {
      issues.push('merged missingAgents does not match requiredAgents/evidence files');
    }
    if (task.status === 'REPORTED' && merged.complete !== true) {
      issues.push('task is REPORTED but merged evidence is incomplete');
    }
  } else if (task.status === 'REPORTED') {
    issues.push('task is REPORTED but merged evidence is missing');
  }

  return {
    taskId: task.taskId,
    status: task.status,
    requiredAgents,
    workerAgents,
    presentEvidenceAgents,
    mergedExists: Boolean(merged),
    ok: issues.length === 0,
    issues,
  };
}

export function verifyState(paths: ZigrixPaths): Record<string, unknown> {
  const tasks = listTasks(paths);
  const checks = tasks.map((task) => verifyTask(paths, task));
  const failures = checks.filter((item) => item.ok === false);
  return {
    ok: failures.length === 0,
    taskCount: tasks.length,
    failedCount: failures.length,
    checks,
  };
}
