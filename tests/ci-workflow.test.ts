import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');

describe('ci workflow contracts', () => {
  it('runs lint/type/format/test/build/size/audit across a node matrix', () => {
    const workflowPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
    const raw = fs.readFileSync(workflowPath, 'utf8');
    const workflow = parse(raw) as {
      jobs: {
        quality: {
          strategy: { matrix: { 'node-version': string[] } };
          steps: Array<{ name?: string; run?: string }>;
        };
      };
    };

    const job = workflow.jobs.quality;
    expect(job.strategy.matrix['node-version']).toEqual(['22', '24']);

    const runCommands = job.steps.map((step) => step.run).filter(Boolean) as string[];

    expect(runCommands).toContain('npm run lint:all');
    expect(runCommands).toContain('npm run typecheck:all');
    expect(runCommands).toContain('npm run format:check:all');
    expect(runCommands).toContain('npm run test');
    expect(runCommands).toContain('npm run build');
    expect(runCommands).toContain('npm run audit:prod');
  });
});
