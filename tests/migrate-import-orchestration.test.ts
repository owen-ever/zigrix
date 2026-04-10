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
  return execFileSync(nodeBin, ['dist/index.js', ...args], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
}

function createLegacyFixture(tmpRoot: string): { legacyDir: string; taskId: string } {
  const legacyDir = path.join(tmpRoot, 'legacy-orchestration');
  const taskId = 'DEV-20260410-777';
  const tasksDir = path.join(legacyDir, 'tasks');
  const evidenceTaskDir = path.join(legacyDir, 'evidence', taskId);
  const promptsDir = path.join(legacyDir, 'prompts');

  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(evidenceTaskDir, { recursive: true });
  fs.mkdirSync(promptsDir, { recursive: true });

  fs.writeFileSync(path.join(tasksDir, `${taskId}.md`), [
    '# Task Spec',
    '',
    '## 0) Task Metadata',
    `- Task ID: \`${taskId}\``,
    '- Title: Legacy import task',
    '- Requested by: migration-test',
    '- Created at (KST): 2026-04-10T01:00:00+09:00',
    '- Current Status: `REPORTED`',
    '- Scale: `normal`',
    '',
    '## 1) Scope',
    '### In-Scope',
    '- verify migration import path',
    '',
    '### Out-of-Scope',
    '- none',
    '',
    '## 2) Orchestration Plan',
    '- Orchestrator: `orch-main`',
    '- Required agents: qa-main',
    '',
  ].join('\n'));

  fs.writeFileSync(path.join(evidenceTaskDir, 'qa-main.json'), `${JSON.stringify({
    ts: '2026-04-10T01:03:00+09:00',
    taskId,
    agentId: 'qa-main',
    runId: 'run-qa-001',
    sessionKey: 'agent:qa-main:subagent:qa-session-001',
    sessionId: 'qa-session-id-001',
    transcriptPath: null,
    evidence: {
      summary: 'legacy qa evidence',
    },
  }, null, 2)}\n`);

  fs.writeFileSync(path.join(promptsDir, `${taskId}-dispatch.md`), '# legacy prompt\n');

  const events = [
    {
      timestamp: '2026-04-10T01:00:00+09:00',
      event: 'task_created',
      taskId,
      phase: 'planning',
      status: 'OPEN',
      scale: 'normal',
    },
    {
      ts: '2026-04-10T01:01:00+09:00',
      event: 'task_started',
      taskId,
      phase: 'execution',
      actor: 'orch-main',
      status: 'IN_PROGRESS',
      sessionKey: 'agent:orch-main:subagent:orch-session-001',
      sessionId: 'orch-session-id-001',
    },
    {
      ts: '2026-04-10T01:02:00+09:00',
      event: 'worker_dispatched',
      taskId,
      phase: 'execution',
      actor: 'zigrix',
      targetAgent: 'qa-main',
      status: 'IN_PROGRESS',
      sessionKey: 'agent:qa-main:subagent:qa-session-001',
      sessionId: 'qa-session-id-001',
      payload: { agentId: 'qa-main', runId: 'run-qa-001' },
    },
    {
      ts: '2026-04-10T01:03:00+09:00',
      event: 'worker_done',
      taskId,
      phase: 'execution',
      actor: 'qa-main',
      targetAgent: 'qa-main',
      status: 'IN_PROGRESS',
      sessionKey: 'agent:qa-main:subagent:qa-session-001',
      sessionId: 'qa-session-id-001',
      runId: 'run-qa-001',
      payload: { result: 'done', runId: 'run-qa-001' },
    },
    {
      ts: '2026-04-10T01:04:00+09:00',
      event: 'evidence_collected',
      taskId,
      phase: 'verification',
      actor: 'qa-main',
      status: 'IN_PROGRESS',
      sessionKey: 'agent:qa-main:subagent:qa-session-001',
      runId: 'run-qa-001',
      payload: {
        agentId: 'qa-main',
        evidencePath: `orchestration/evidence/${taskId}/qa-main.json`,
      },
    },
    {
      ts: '2026-04-10T01:05:00+09:00',
      event: 'reported',
      taskId,
      phase: 'reporting',
      actor: 'zigrix',
      status: 'REPORTED',
    },
  ];

  fs.writeFileSync(path.join(legacyDir, 'tasks.jsonl'), `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);

  fs.writeFileSync(path.join(legacyDir, 'index.json'), `${JSON.stringify({
    version: '2.0',
    updatedAt: '2026-04-10T01:05:00+09:00',
    counts: { tasks: 1, events: events.length },
    statusBuckets: {
      OPEN: [],
      IN_PROGRESS: [],
      BLOCKED: [],
      DONE_PENDING_REPORT: [],
      REPORTED: [taskId],
    },
    activeTasks: {},
    taskSummaries: {
      [taskId]: {
        title: 'Legacy import task',
        status: 'REPORTED',
      },
    },
  }, null, 2)}\n`);

  return { legacyDir, taskId };
}

describe('migration import command', () => {
  it('imports legacy orchestration state and emits parity report', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-migrate-import-'));
    const openclawHome = setupOpenClawConfig(tmpRoot);
    const env = { ...process.env, HOME: tmpRoot, OPENCLAW_HOME: openclawHome };

    runCli(['onboard', '--yes', '--json'], env);
    const { legacyDir, taskId } = createLegacyFixture(tmpRoot);

    const importRaw = runCli(['migrate', 'import-orchestration', '--from', legacyDir, '--yes', '--json'], env);
    const result = JSON.parse(importRaw) as {
      ok: boolean;
      importedTaskIds: string[];
      synthesizedMetaTasks: string[];
      parity: Record<string, boolean>;
      reportPath: string;
    };

    expect(result.ok).toBe(true);
    expect(result.importedTaskIds).toContain(taskId);
    expect(result.synthesizedMetaTasks).toContain(taskId);
    expect(result.parity.tasks).toBe(true);
    expect(result.parity.events).toBe(true);
    expect(result.parity.statusBuckets).toBe(true);
    expect(fs.existsSync(result.reportPath)).toBe(true);

    const statusRaw = runCli(['task', 'status', taskId, '--json'], env);
    const status = JSON.parse(statusRaw) as { status: string };
    expect(status.status).toBe('REPORTED');

    const mergedPath = path.join(tmpRoot, '.zigrix', 'evidence', taskId, '_merged.json');
    const merged = JSON.parse(fs.readFileSync(mergedPath, 'utf8')) as {
      qaVerification: { complete: boolean; importedLegacy: boolean };
    };
    expect(merged.qaVerification.complete).toBe(true);
    expect(merged.qaVerification.importedLegacy).toBe(true);

    const checkRaw = runCli(['state', 'check', '--json'], env);
    const check = JSON.parse(checkRaw) as { ok: boolean };
    expect(check.ok).toBe(true);
  });

  it('supports state import alias for legacy migration', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-state-import-'));
    const openclawHome = setupOpenClawConfig(tmpRoot);
    const env = { ...process.env, HOME: tmpRoot, OPENCLAW_HOME: openclawHome };

    runCli(['onboard', '--yes', '--json'], env);
    const { legacyDir, taskId } = createLegacyFixture(tmpRoot);

    const importRaw = runCli(['state', 'import', '--from', legacyDir, '--yes', '--json'], env);
    const result = JSON.parse(importRaw) as { ok: boolean; importedTaskIds: string[] };
    expect(result.ok).toBe(true);
    expect(result.importedTaskIds).toContain(taskId);
  });

  it('refuses import when destination runtime state is not empty', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-migrate-refuse-'));
    const openclawHome = setupOpenClawConfig(tmpRoot);
    const env = { ...process.env, HOME: tmpRoot, OPENCLAW_HOME: openclawHome };

    runCli(['onboard', '--yes', '--json'], env);
    runCli(['task', 'create', '--title', 'existing', '--description', 'existing state', '--required-agent', 'qa-main', '--json'], env);
    const { legacyDir } = createLegacyFixture(tmpRoot);

    let failed = false;
    try {
      runCli(['migrate', 'import-orchestration', '--from', legacyDir, '--yes', '--json'], env);
    } catch (error) {
      failed = true;
      const stderr = (error as { stderr?: string }).stderr ?? '';
      expect(stderr).toContain('refusing to import into non-empty runtime state');
    }

    expect(failed).toBe(true);
  });
});
