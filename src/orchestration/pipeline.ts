import { collectEvidence, mergeEvidence } from './evidence.js';
import { renderReport } from './report.js';
import { type ZigrixPaths } from '../state/paths.js';
import { createTask, updateTaskStatus } from '../state/tasks.js';

export function runPipeline(paths: ZigrixPaths, params: {
  title: string;
  description: string;
  scale?: string;
  requiredAgents?: string[];
  evidenceSummaries?: string[];
  requireQa?: boolean;
  autoReport?: boolean;
  recordFeedback?: boolean;
}): Record<string, unknown> {
  const steps: Array<Record<string, unknown>> = [];
  const task = createTask(paths, { title: params.title, description: params.description, scale: params.scale ?? 'normal', requiredAgents: params.requiredAgents ?? [] });
  const taskId = task.taskId;
  steps.push({ step: 'task_create', result: task });
  steps.push({ step: 'task_start', result: updateTaskStatus(paths, taskId, 'IN_PROGRESS') });
  for (const raw of params.evidenceSummaries ?? []) {
    if (!raw.includes('=')) throw new Error(`invalid evidence summary format: ${raw} (expected agentId=summary)`);
    const [agentId, summary] = raw.split(/=(.*)/s, 2);
    steps.push({ step: 'evidence_collect', agentId: agentId.trim(), result: collectEvidence(paths, { taskId, agentId: agentId.trim(), summary: summary.trim() }) });
  }
  const merged = mergeEvidence(paths, { taskId, requiredAgents: params.requiredAgents, requireQa: params.requireQa });
  steps.push({ step: 'evidence_merge', result: merged });
  if (merged?.complete) {
    steps.push({ step: 'task_finalize', result: updateTaskStatus(paths, taskId, 'DONE_PENDING_REPORT') });
    if (params.autoReport) {
      steps.push({ step: 'report_render', result: renderReport(paths, { taskId, recordEvents: params.recordFeedback }) });
      steps.push({ step: 'task_report', result: updateTaskStatus(paths, taskId, 'REPORTED') });
    }
  }
  return { ok: true, taskId, complete: Boolean(merged?.complete), missingAgents: Array.isArray(merged?.missingAgents) ? merged.missingAgents : [], steps };
}
