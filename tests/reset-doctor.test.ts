import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadConfig, writeDefaultConfig } from '../src/config/load.js';
import { gatherDoctor } from '../src/doctor.js';
import { resolvePaths } from '../src/state/paths.js';
import { createTask, listTasks } from '../src/state/tasks.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeBin = process.execPath;

describe('doctor and reset flows', () => {
  it('reports doctor summary for initialized project', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-doctor-'));
    const configPath = writeDefaultConfig(projectRoot);
    const loaded = loadConfig({ projectRoot, configPath });
    const payload = gatherDoctor(loaded, resolvePaths(loaded.projectRoot, loaded.config));
    expect((payload.summary as { ready: boolean }).ready).toBe(true);
  });

  it('resets config/template and runtime state through CLI', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-reset-'));
    execFileSync(nodeBin, ['dist/index.js', 'init', '--yes', '--project-root', projectRoot], { cwd: repoRoot });
    execFileSync(nodeBin, ['dist/index.js', 'template', 'set', 'workerPrompt', '--body', 'custom-body', '--project-root', projectRoot], { cwd: repoRoot });
    const changed = JSON.parse(execFileSync(nodeBin, ['dist/index.js', 'template', 'get', 'workerPrompt', '--project-root', projectRoot, '--json'], { cwd: repoRoot, encoding: 'utf8' })) as { body: string };
    expect(changed.body).toBe('custom-body');
    execFileSync(nodeBin, ['dist/index.js', 'template', 'reset', 'workerPrompt', '--yes', '--project-root', projectRoot], { cwd: repoRoot });
    const resetTemplate = JSON.parse(execFileSync(nodeBin, ['dist/index.js', 'template', 'get', 'workerPrompt', '--project-root', projectRoot, '--json'], { cwd: repoRoot, encoding: 'utf8' })) as { body: string };
    expect(resetTemplate.body).not.toBe('custom-body');

    const loaded = loadConfig({ projectRoot });
    const paths = resolvePaths(projectRoot, loaded.config);
    createTask(paths, { title: 'reset me', description: 'state reset' });
    expect(listTasks(paths)).toHaveLength(1);
    execFileSync(nodeBin, ['dist/index.js', 'reset', 'state', '--yes', '--project-root', projectRoot], { cwd: repoRoot });
    expect(listTasks(paths)).toHaveLength(0);
  });
});
