import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import type { ZigrixConfig } from '../config/schema.js';
import { saveRunRecord } from './store.js';
import { type StepRunRecord, type Workflow, type WorkflowRunRecord, workflowSchema } from './schema.js';

function nowIso(): string {
  return new Date().toISOString();
}

function runStep(step: Workflow['steps'][number], cwd: string): Promise<StepRunRecord> {
  const startedAt = new Date();
  return new Promise((resolve) => {
    const child = spawn(step.run, {
      cwd,
      env: process.env,
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const timeout = step.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, step.timeoutMs)
      : null;

    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      const finishedAt = new Date();
      resolve({
        id: step.id,
        run: step.run,
        cwd,
        status: timedOut ? 'timeout' : code === 0 ? 'success' : 'failed',
        exitCode: code,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        stdout,
        stderr,
      });
    });
  });
}

export async function runWorkflow(params: {
  config: ZigrixConfig;
  workflowPath: string;
}): Promise<{ record: WorkflowRunRecord; savedPath: string }> {
  const workflowPath = path.resolve(params.workflowPath);
  const raw = fs.readFileSync(workflowPath, 'utf8');
  const parsed = workflowSchema.parse(JSON.parse(raw)) as Workflow;
  const workflowDir = path.dirname(workflowPath);

  const startedAt = new Date();
  const runId = `run-${startedAt.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)}`;
  const steps: StepRunRecord[] = [];
  let overallStatus: 'success' | 'failed' = 'success';

  for (const step of parsed.steps) {
    const cwd = step.cwd ? path.resolve(workflowDir, step.cwd) : workflowDir;
    const result = await runStep(step, cwd);
    steps.push(result);
    if (result.status !== 'success') {
      overallStatus = 'failed';
      break;
    }
  }

  const finishedAt = new Date();
  const record: WorkflowRunRecord = {
    runId,
    workflowName: parsed.name,
    workflowPath,
    status: overallStatus,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    steps,
  };

  const savedPath = saveRunRecord(params.config, record);
  return { record, savedPath };
}

export function summarizeRun(record: WorkflowRunRecord): string {
  return [
    `runId: ${record.runId}`,
    `workflow: ${record.workflowName}`,
    `status: ${record.status}`,
    `steps: ${record.steps.length}`,
    `durationMs: ${record.durationMs}`,
  ].join('\n');
}
