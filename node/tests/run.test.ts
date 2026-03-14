import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import { runWorkflow } from '../src/runner/run.js';

describe('runWorkflow', () => {
  it('runs a minimal sequential workflow and saves a record', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-node-'));
    const workflowPath = path.join(projectRoot, 'workflow.json');
    fs.writeFileSync(
      workflowPath,
      JSON.stringify({
        name: 'test-workflow',
        steps: [
          { id: 'one', run: 'echo first' },
          { id: 'two', run: 'echo second' },
        ],
      }),
    );

    const result = await runWorkflow({
      projectRoot,
      config: structuredClone(defaultConfig),
      workflowPath,
    });

    expect(result.record.status).toBe('success');
    expect(result.record.steps).toHaveLength(2);
    expect(fs.existsSync(result.savedPath)).toBe(true);
  });
});
