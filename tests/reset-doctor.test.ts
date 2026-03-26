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

function setupOpenClawConfig(tmpRoot: string) {
  const openclawHome = path.join(tmpRoot, '.openclaw');
  fs.mkdirSync(openclawHome, { recursive: true });
  fs.writeFileSync(path.join(openclawHome, 'openclaw.json'), JSON.stringify({
    agents: {
      list: [
        { id: 'main', default: true },
        { id: 'orch-main', name: 'orch-main', identity: { theme: 'Orchestrator Agent' } },
        { id: 'qa-main', name: 'qa-main', identity: { theme: 'QA Agent' } },
      ],
    },
  }));
  return openclawHome;
}

describe('doctor and reset flows', () => {
  it('reports doctor summary for initialized base dir', () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-doctor-'));
    const originalHome = process.env.HOME;
    process.env.HOME = tmpBase;
    try {
      writeDefaultConfig(true);
      const loaded = loadConfig();
      const paths = resolvePaths(loaded.config);
      const payload = gatherDoctor(loaded, paths);
      expect((payload.summary as { ready: boolean }).ready).toBe(true);
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });

  it('resets config/template and runtime state through CLI', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-reset-'));
    const openclawHome = setupOpenClawConfig(tmpRoot);
    const env = { ...process.env, HOME: tmpRoot, OPENCLAW_HOME: openclawHome };

    execFileSync(nodeBin, ['dist/index.js', 'onboard', '--yes'], { cwd: repoRoot, env });
    execFileSync(nodeBin, ['dist/index.js', 'template', 'set', 'workerPrompt', '--body', 'custom-body'], { cwd: repoRoot, env });
    const changed = JSON.parse(execFileSync(nodeBin, ['dist/index.js', 'template', 'get', 'workerPrompt', '--json'], { cwd: repoRoot, encoding: 'utf8', env })) as { body: string };
    expect(changed.body).toBe('custom-body');
    execFileSync(nodeBin, ['dist/index.js', 'template', 'reset', 'workerPrompt', '--yes'], { cwd: repoRoot, env });
    const resetTemplate = JSON.parse(execFileSync(nodeBin, ['dist/index.js', 'template', 'get', 'workerPrompt', '--json'], { cwd: repoRoot, encoding: 'utf8', env })) as { body: string };
    expect(resetTemplate.body).not.toBe('custom-body');

    const originalHome = process.env.HOME;
    process.env.HOME = tmpRoot;
    try {
      const loaded = loadConfig();
      const paths = resolvePaths(loaded.config);
      createTask(paths, { title: 'reset me', description: 'state reset' });
      expect(listTasks(paths)).toHaveLength(1);
      execFileSync(nodeBin, ['dist/index.js', 'reset', 'state', '--yes'], { cwd: repoRoot, env });
      expect(listTasks(paths)).toHaveLength(0);
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });
});
