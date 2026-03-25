import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildDefaultConfig } from '../src/config/defaults.js';
import { loadConfig, writeConfigFile } from '../src/config/load.js';

async function withHome<T>(homeDir: string, fn: () => T | Promise<T>): Promise<T> {
  const originalHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    return await fn();
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
}

describe('config path source-of-truth behavior', () => {
  it('re-derives default paths from paths.baseDir when only baseDir is overridden', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-config-sot-'));
    const configHome = path.join(tmpRoot, '.zigrix');
    fs.mkdirSync(configHome, { recursive: true });

    await withHome(tmpRoot, () => {
      const configPath = path.join(configHome, 'zigrix.config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        paths: {
          baseDir: '~/zigrix-custom-home',
        },
      }, null, 2));

      const loaded = loadConfig();
      expect(loaded.config.paths.baseDir).toBe(path.join(tmpRoot, 'zigrix-custom-home'));
      expect(loaded.config.paths.tasksDir).toBe(path.join(loaded.config.paths.baseDir, 'tasks'));
      expect(loaded.config.paths.evidenceDir).toBe(path.join(loaded.config.paths.baseDir, 'evidence'));
      expect(loaded.config.workspace.projectsBaseDir).toBe(path.join(loaded.config.paths.baseDir, 'workspace'));
    });
  });

  it('stores normalized absolute paths when writing config', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-config-write-'));
    const baseDir = path.join(tmpRoot, 'state');
    const configPath = path.join(tmpRoot, '.zigrix', 'zigrix.config.json');

    withHome(tmpRoot, () => {
      const draft = buildDefaultConfig(baseDir);
      const next = {
        ...draft,
        paths: {
          ...draft.paths,
          tasksDir: './tasks-relative',
        },
        workspace: {
          projectsBaseDir: '~/zigrix-projects',
        },
      };

      writeConfigFile(configPath, next as any);
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, any>;

      expect(saved.paths.tasksDir).toBe(path.resolve(baseDir, 'tasks-relative'));
      expect(saved.workspace.projectsBaseDir).toBe(path.join(tmpRoot, 'zigrix-projects'));
    });
  });

  it('dashboard auth follows paths.baseDir from zigrix.config.json', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-dashboard-auth-sot-'));
    const configHome = path.join(tmpRoot, '.zigrix');
    const dataHome = path.join(tmpRoot, 'runtime-home');
    fs.mkdirSync(configHome, { recursive: true });
    fs.mkdirSync(dataHome, { recursive: true });

    await withHome(tmpRoot, async () => {
      const config = buildDefaultConfig(dataHome);
      fs.writeFileSync(path.join(configHome, 'zigrix.config.json'), JSON.stringify(config, null, 2));

      const { setupAdmin, getDashboardConfig } = await import('../dashboard/src/lib/auth.js');
      await setupAdmin('admin', 'password123');

      expect(fs.existsSync(path.join(dataHome, 'dashboard.json'))).toBe(true);
      expect(fs.existsSync(path.join(configHome, 'dashboard.json'))).toBe(false);
      expect(getDashboardConfig().admins[0]?.username).toBe('admin');
    });
  });

  it('dashboard store follows paths from zigrix.config.json', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-dashboard-sot-'));
    const configHome = path.join(tmpRoot, '.zigrix');
    const dataHome = path.join(tmpRoot, 'runtime-home');
    fs.mkdirSync(configHome, { recursive: true });
    fs.mkdirSync(path.join(dataHome, 'tasks'), { recursive: true });
    fs.mkdirSync(path.join(dataHome, 'evidence'), { recursive: true });

    const config = buildDefaultConfig(dataHome);
    fs.writeFileSync(path.join(configHome, 'zigrix.config.json'), JSON.stringify(config, null, 2));

    const taskId = 'DEV-20260325-001';
    fs.writeFileSync(path.join(dataHome, 'index.json'), JSON.stringify({
      updatedAt: '2026-03-25T00:00:00.000Z',
      activeTasks: {
        [taskId]: { status: 'REPORTED', updatedAt: '2026-03-25T00:00:00.000Z' },
      },
      statusBuckets: {
        REPORTED: [{ taskId }],
      },
    }, null, 2));
    fs.writeFileSync(path.join(dataHome, 'tasks.jsonl'), JSON.stringify({
      ts: '2026-03-25T00:00:00.000Z',
      event: 'reported',
      taskId,
      status: 'REPORTED',
      title: 'Path SoT task',
    }) + '\n');
    fs.writeFileSync(path.join(dataHome, 'tasks', `${taskId}.meta.json`), JSON.stringify({
      taskId,
      title: 'Path SoT task',
      status: 'REPORTED',
      scale: 'normal',
    }, null, 2));

    await withHome(tmpRoot, async () => {
      const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
      const store = createZigrixStore({
        zigrixHome: configHome,
        invokeTool: async () => ({ ok: true }),
      });

      const overview = store.loadOverview();
      expect(overview.activeTasks.some((task) => task.taskId === taskId)).toBe(true);
    });
  });
});
