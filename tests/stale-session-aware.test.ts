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

function runCli(args: string[], env: NodeJS.ProcessEnv): string {
  return execFileSync(nodeBin, ['dist/index.js', ...args], { cwd: repoRoot, env, encoding: 'utf8' });
}

function readTaskMeta(tmpRoot: string, taskId: string): Record<string, unknown> {
  const metaPath = path.join(tmpRoot, '.zigrix', 'tasks', `${taskId}.meta.json`);
  return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
}

function writeTaskMeta(tmpRoot: string, taskId: string, patch: Record<string, unknown>): void {
  const metaPath = path.join(tmpRoot, '.zigrix', 'tasks', `${taskId}.meta.json`);
  const current = readTaskMeta(tmpRoot, taskId);
  fs.writeFileSync(metaPath, `${JSON.stringify({ ...current, ...patch }, null, 2)}\n`, 'utf8');
}

function createInProgressTask(tmpRoot: string, env: NodeJS.ProcessEnv): string {
  runCli(['onboard', '--yes', '--json'], env);
  const createdRaw = runCli(['task', 'create', '--title', 'Stale task', '--description', 'stale detection test', '--required-agent', 'qa-main', '--json'], env);
  const created = JSON.parse(createdRaw) as { taskId: string };
  runCli(['task', 'start', created.taskId, '--json'], env);
  return created.taskId;
}

describe('session-aware stale policy', () => {
  it('blocks deleted sessions immediately with session_dead reason', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-stale-dead-'));
    const openclawHome = setupOpenClawConfig(tmpRoot);
    const env = { ...process.env, HOME: tmpRoot, OPENCLAW_HOME: openclawHome };
    const taskId = createInProgressTask(tmpRoot, env);
    const sessionId = 'dead-session-001';
    const sessionsDir = path.join(openclawHome, 'agents', 'qa-main', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, `${sessionId}.jsonl.deleted.20260410T000000Z`), '');

    writeTaskMeta(tmpRoot, taskId, {
      updatedAt: new Date().toISOString(),
      workerSessions: {
        'qa-main': {
          status: 'dispatched',
          sessionKey: `agent:qa-main:subagent:${sessionId}`,
          sessionId,
          runId: 'run-dead-001',
        },
      },
    });

    const previewRaw = runCli(['task', 'stale', '--hours', '24', '--json'], env);
    const preview = JSON.parse(previewRaw) as { count: number; tasks: Array<{ reasonCode: string; reportLine: string }> };
    expect(preview.count).toBe(1);
    expect(preview.tasks[0]?.reasonCode).toBe('session_dead');
    expect(preview.tasks[0]?.reportLine).toContain('session_dead');

    const applyRaw = runCli(['task', 'stale', '--hours', '24', '--apply', '--json'], env);
    const applied = JSON.parse(applyRaw) as { count: number; changed: Array<{ reasonCode: string; nextAction: string; resumeHint: string }> };
    expect(applied.count).toBe(1);
    expect(applied.changed[0]?.reasonCode).toBe('session_dead');
    expect(applied.changed[0]?.nextAction).toContain('respawn');
    expect(applied.changed[0]?.resumeHint).toContain('session key/sessionId');

    const meta = readTaskMeta(tmpRoot, taskId) as { status: string; staleReason: string; nextAction: string; resumeHint: string };
    expect(meta.status).toBe('BLOCKED');
    expect(meta.staleReason).toBe('session_dead');
    expect(meta.nextAction).toContain('respawn');
    expect(meta.resumeHint).toContain('session key/sessionId');
  });

  it('surfaces missing session mapping for timed-out tasks', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-stale-mapping-'));
    const openclawHome = setupOpenClawConfig(tmpRoot);
    const env = { ...process.env, HOME: tmpRoot, OPENCLAW_HOME: openclawHome };
    const taskId = createInProgressTask(tmpRoot, env);

    writeTaskMeta(tmpRoot, taskId, {
      updatedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      workerSessions: {
        'qa-main': {
          status: 'dispatched',
          sessionKey: 'unmapped-session-key',
          runId: 'run-map-001',
        },
      },
    });

    const previewRaw = runCli(['task', 'stale', '--hours', '24', '--json'], env);
    const preview = JSON.parse(previewRaw) as { count: number; tasks: Array<{ reasonCode: string; sessions: Array<{ reason: string | null }> }> };
    expect(preview.count).toBe(1);
    expect(preview.tasks[0]?.reasonCode).toBe('missing_session_mapping');
    expect(preview.tasks[0]?.sessions[0]?.reason).toBe('missing_session_mapping');
  });

  it('keeps timeout-only tasks on stale_timeout reason', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-stale-timeout-'));
    const openclawHome = setupOpenClawConfig(tmpRoot);
    const env = { ...process.env, HOME: tmpRoot, OPENCLAW_HOME: openclawHome };
    const taskId = createInProgressTask(tmpRoot, env);

    writeTaskMeta(tmpRoot, taskId, {
      updatedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      workerSessions: {},
    });

    const previewRaw = runCli(['task', 'stale', '--hours', '24', '--json'], env);
    const preview = JSON.parse(previewRaw) as { count: number; tasks: Array<{ reasonCode: string; reportLine: string }> };
    expect(preview.count).toBe(1);
    expect(preview.tasks[0]?.reasonCode).toBe('stale_timeout');
    expect(preview.tasks[0]?.reportLine).toContain('stale_timeout');
  });
});
