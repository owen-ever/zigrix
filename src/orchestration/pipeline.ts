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
  verificationMappings?: string[];
  requireQa?: boolean;
  autoReport?: boolean;
  recordFeedback?: boolean;
}): Record<string, unknown> {
  const steps: Array<Record<string, unknown>> = [];
  const task = createTask(paths, { title: params.title, description: params.description, scale: params.scale ?? 'normal', requiredAgents: params.requiredAgents ?? [] });
  const taskId = task.taskId;
  steps.push({ step: 'task_create', result: task });
  steps.push({ step: 'task_start', result: updateTaskStatus(paths, taskId, 'IN_PROGRESS') });
  const verificationMappings = new Map<string, Array<{ dod: string; test: string }>>();
  for (const raw of params.verificationMappings ?? []) {
    if (!raw.includes('=')) throw new Error(`invalid verification mapping format: ${raw} (expected agentId=dod=test)`);
    const [agentId, rest] = raw.split(/=(.*)/s, 2);
    const trimmedAgentId = agentId.trim();
    const [dod, test] = (rest ?? '').split(/=(.*)/s, 2);
    if (!trimmedAgentId || !dod?.trim() || !test?.trim()) {
      throw new Error(`invalid verification mapping format: ${raw} (expected agentId=dod=test)`);
    }
    verificationMappings.set(trimmedAgentId, [
      ...(verificationMappings.get(trimmedAgentId) ?? []),
      { dod: dod.trim(), test: test.trim() },
    ]);
  }

  for (const raw of params.evidenceSummaries ?? []) {
    if (!raw.includes('=')) throw new Error(`invalid evidence summary format: ${raw} (expected agentId=summary)`);
    const [agentId, summary] = raw.split(/=(.*)/s, 2);
    const trimmedAgentId = agentId.trim();
    steps.push({
      step: 'evidence_collect',
      agentId: trimmedAgentId,
      result: collectEvidence(paths, {
        taskId,
        agentId: trimmedAgentId,
        summary: summary.trim(),
        verificationMappings: verificationMappings.get(trimmedAgentId) ?? [],
      }),
    });
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
