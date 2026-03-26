import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeBin = process.execPath;

function setupOpenClawConfig(tmpBase: string) {
  const openclawHome = path.join(tmpBase, '.openclaw');
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

describe('path resolution CLI', () => {
  it('resolves runtime paths by alias and canonical key', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-path-cli-'));
    const openclawHome = setupOpenClawConfig(tmpRoot);
    const projectsBaseDir = path.join(tmpRoot, 'workspace-projects');
    const env = { ...process.env, HOME: tmpRoot, OPENCLAW_HOME: openclawHome };

    execFileSync(nodeBin, ['dist/index.js', 'onboard', '--yes', '--projects-base-dir', projectsBaseDir, '--json'], { cwd: repoRoot, env });

    const tasksDirRaw = execFileSync(nodeBin, ['dist/index.js', 'path', 'get', 'tasksDir', '--json'], { cwd: repoRoot, env, encoding: 'utf8' });
    const tasksDir = JSON.parse(tasksDirRaw) as { canonicalKey: string; value: string };
    expect(tasksDir.canonicalKey).toBe('paths.tasksDir');
    expect(tasksDir.value).toBe(path.join(tmpRoot, '.zigrix', 'tasks'));

    const workspaceRaw = execFileSync(nodeBin, ['dist/index.js', 'path', 'get', 'workspace.projectsBaseDir', '--json'], { cwd: repoRoot, env, encoding: 'utf8' });
    const workspace = JSON.parse(workspaceRaw) as { canonicalKey: string; value: string };
    expect(workspace.canonicalKey).toBe('workspace.projectsBaseDir');
    expect(workspace.value).toBe(path.resolve(projectsBaseDir));

    const allRaw = execFileSync(nodeBin, ['dist/index.js', 'path', 'list', '--json'], { cwd: repoRoot, env, encoding: 'utf8' });
    const all = JSON.parse(allRaw) as { values: Record<string, string> };
    expect(all.values['paths.tasksDir']).toBe(path.join(tmpRoot, '.zigrix', 'tasks'));
    expect(all.values['workspace.projectsBaseDir']).toBe(path.resolve(projectsBaseDir));
  });

  it('returns resolved task and prompt paths in CLI JSON outputs', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-task-paths-'));
    const openclawHome = setupOpenClawConfig(tmpRoot);
    const env = { ...process.env, HOME: tmpRoot, OPENCLAW_HOME: openclawHome };

    execFileSync(nodeBin, ['dist/index.js', 'onboard', '--yes', '--json'], { cwd: repoRoot, env });

    const createdRaw = execFileSync(nodeBin, ['dist/index.js', 'task', 'create', '--title', 'Path-aware task', '--description', 'check resolved path outputs', '--required-agent', 'qa-main', '--json'], { cwd: repoRoot, env, encoding: 'utf8' });
    const created = JSON.parse(createdRaw) as { taskId: string; projectDir: string; specPath: string; metaPath: string };
    expect(fs.existsSync(created.specPath)).toBe(true);
    expect(fs.existsSync(created.metaPath)).toBe(true);
    expect(created.projectDir).toBe(path.join(tmpRoot, '.zigrix', 'workspace'));

    const statusRaw = execFileSync(nodeBin, ['dist/index.js', 'task', 'status', created.taskId, '--json'], { cwd: repoRoot, env, encoding: 'utf8' });
    const status = JSON.parse(statusRaw) as { specPath: string; metaPath: string };
    expect(status.specPath).toBe(created.specPath);
    expect(status.metaPath).toBe(created.metaPath);

    const preparedRaw = execFileSync(nodeBin, ['dist/index.js', 'worker', 'prepare', '--task-id', created.taskId, '--agent-id', 'qa-main', '--description', 'Run QA checks', '--json'], { cwd: repoRoot, env, encoding: 'utf8' });
    const prepared = JSON.parse(preparedRaw) as { promptPath: string; specPath: string; metaPath: string; projectDir: string };
    expect(fs.existsSync(prepared.promptPath)).toBe(true);
    expect(prepared.specPath).toBe(created.specPath);
    expect(prepared.metaPath).toBe(created.metaPath);
    expect(prepared.projectDir).toBe(created.projectDir);
  });
});
