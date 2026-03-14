import { z } from 'zod';

export const workflowSchema = z.object({
  name: z.string().min(1),
  steps: z.array(z.object({
    id: z.string().min(1),
    run: z.string().min(1),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().positive().max(3_600_000).optional(),
  })).min(1),
});

export type Workflow = z.infer<typeof workflowSchema>;

export type StepRunRecord = {
  id: string;
  run: string;
  cwd: string;
  status: 'success' | 'failed' | 'timeout';
  exitCode: number | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stdout: string;
  stderr: string;
};

export type WorkflowRunRecord = {
  runId: string;
  workflowName: string;
  workflowPath: string;
  status: 'success' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: StepRunRecord[];
};
