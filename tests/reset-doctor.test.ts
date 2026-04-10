import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildDefaultConfig } from '../src/config/defaults.js';
import { loadConfig, writeDefaultConfig } from '../src/config/load.js';
import { gatherDoctor } from '../src/doctor.js';
import { resolvePaths } from '../src/state/paths.js';
import { createTask, listTasks } from '../src/state/tasks.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeBin = process.execPath;

function setupOpenClawConfig(tmpRoot: string) {
  const openclawHome = path.join(tmpRoot, '.openclaw');
  fs.mkdirSync(openclawHome, { recursive: true });
  fs.writeFileSync(
    path.join(openclawHome, 'openclaw.json'),
    JSON.stringify({
      agents: {
        list: [
          { id: 'main', default: true },
          { id: 'orch-main', name: 'orch-main', identity: { theme: 'Orchestrator Agent' } },
          { id: 'qa-main', name: 'qa-main', identity: { theme: 'QA Agent' } },
        ],
      },
    }),
  );
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
      expect(
        (payload.configConsistency as { scaleCoverage: Record<string, unknown> }).scaleCoverage
          .large,
      ).toBeDefined();
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });

  it('surfaces required-role coverage gaps in doctor output without failing readiness', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-doctor-coverage-'));
    const configHome = path.join(tmpRoot, '.zigrix');
    fs.mkdirSync(configHome, { recursive: true });

    const config = buildDefaultConfig(path.join(tmpRoot, 'state')) as any;
    config.agents = {
      registry: {
        'orch-main': {
          label: 'orch-main',
          role: 'orchestrator',
          runtime: 'openclaw',
          enabled: true,
          metadata: {},
        },
        'qa-main': {
          label: 'qa-main',
          role: 'qa',
          runtime: 'openclaw',
          enabled: true,
          metadata: {},
        },
      },
      orchestration: {
        participants: ['orch-main', 'qa-main'],
        excluded: [],
        orchestratorId: 'orch-main',
      },
    };
    fs.writeFileSync(path.join(configHome, 'zigrix.config.json'), JSON.stringify(config, null, 2));

    const originalHome = process.env.HOME;
    process.env.HOME = tmpRoot;
    try {
      const loaded = loadConfig();
      const paths = resolvePaths(loaded.config);
      const payload = gatherDoctor(loaded, paths);
      const warnings = (payload.summary as { warnings: string[] }).warnings.join(' ');
      const ready = (payload.summary as { ready: boolean }).ready;
      expect(ready).toBe(true);
      expect(warnings).toContain(
        "scale 'risky' has no eligible agents for required roles: security",
      );
      expect(warnings).toContain(
        "scale 'large' has no eligible agents for required roles: security, system",
      );
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });

  it('returns a doctor report instead of crashing on invalid config', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-doctor-invalid-'));
    const configHome = path.join(tmpRoot, '.zigrix');
    fs.mkdirSync(configHome, { recursive: true });
    fs.writeFileSync(
      path.join(configHome, 'zigrix.config.json'),
      JSON.stringify(
        {
          paths: {
            baseDir: '~/broken-home',
            tasksDir: '~/broken-home/tasks',
            evidenceDir: '~/broken-home/tasks',
            promptsDir: '~/broken-home/prompts',
            eventsFile: '~/broken-home/tasks.jsonl',
            indexFile: '~/broken-home/index.json',
            runsDir: '~/broken-home/runs',
            rulesDir: '~/broken-home/rules',
          },
        },
        null,
        2,
      ),
    );

    const env = { ...process.env, HOME: tmpRoot };
    const raw = execFileSync(nodeBin, ['dist/index.js', 'doctor', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env,
    });
    const payload = JSON.parse(raw) as { summary: { ready: boolean; warnings: string[] } };
    expect(payload.summary.ready).toBe(false);
    expect(payload.summary.warnings.join(' ')).toContain('Config load failed');
    expect(payload.summary.warnings.join(' ')).toContain('collides with tasksDir');
  });

  it('resets config/template and runtime state through CLI', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-reset-'));
    const openclawHome = setupOpenClawConfig(tmpRoot);
    const env = { ...process.env, HOME: tmpRoot, OPENCLAW_HOME: openclawHome };

    execFileSync(nodeBin, ['dist/index.js', 'onboard', '--yes'], { cwd: repoRoot, env });
    execFileSync(
      nodeBin,
      ['dist/index.js', 'template', 'set', 'workerPrompt', '--body', 'custom-body'],
      { cwd: repoRoot, env },
    );
    const changed = JSON.parse(
      execFileSync(nodeBin, ['dist/index.js', 'template', 'get', 'workerPrompt', '--json'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env,
      }),
    ) as { body: string };
    expect(changed.body).toBe('custom-body');
    execFileSync(nodeBin, ['dist/index.js', 'template', 'reset', 'workerPrompt', '--yes'], {
      cwd: repoRoot,
      env,
    });
    const resetTemplate = JSON.parse(
      execFileSync(nodeBin, ['dist/index.js', 'template', 'get', 'workerPrompt', '--json'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env,
      }),
    ) as { body: string };
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
