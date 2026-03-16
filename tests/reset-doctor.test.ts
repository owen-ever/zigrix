import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import { zigrixConfigSchema } from '../src/config/schema.js';
import { loadConfig, writeDefaultConfig } from '../src/config/load.js';
import { gatherDoctor } from '../src/doctor.js';
import { resolvePaths } from '../src/state/paths.js';
import { createTask, listTasks } from '../src/state/tasks.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeBin = process.execPath;

describe('doctor and reset flows', () => {
  it('reports doctor summary for initialized base dir', () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-doctor-'));
    const configPath = writeDefaultConfig(tmpBase);
    const loaded = loadConfig({ baseDir: tmpBase, configPath });
    const paths = resolvePaths(loaded.config);
    const payload = gatherDoctor(loaded, paths);
    expect((payload.summary as { ready: boolean }).ready).toBe(true);
  });

  it('resets config/template and runtime state through CLI', () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-reset-'));
    const env = { ...process.env, ZIGRIX_HOME: tmpBase };

    execFileSync(nodeBin, ['dist/index.js', 'onboard', '--yes'], { cwd: repoRoot, env });
    execFileSync(nodeBin, ['dist/index.js', 'template', 'set', 'workerPrompt', '--body', 'custom-body'], { cwd: repoRoot, env });
    const changed = JSON.parse(execFileSync(nodeBin, ['dist/index.js', 'template', 'get', 'workerPrompt', '--json'], { cwd: repoRoot, encoding: 'utf8', env })) as { body: string };
    expect(changed.body).toBe('custom-body');
    execFileSync(nodeBin, ['dist/index.js', 'template', 'reset', 'workerPrompt', '--yes'], { cwd: repoRoot, env });
    const resetTemplate = JSON.parse(execFileSync(nodeBin, ['dist/index.js', 'template', 'get', 'workerPrompt', '--json'], { cwd: repoRoot, encoding: 'utf8', env })) as { body: string };
    expect(resetTemplate.body).not.toBe('custom-body');

    const loaded = loadConfig({ baseDir: tmpBase });
    const paths = resolvePaths(loaded.config);
    createTask(paths, { title: 'reset me', description: 'state reset' });
    expect(listTasks(paths)).toHaveLength(1);
    execFileSync(nodeBin, ['dist/index.js', 'reset', 'state', '--yes'], { cwd: repoRoot, env });
    expect(listTasks(paths)).toHaveLength(0);
  });
});
