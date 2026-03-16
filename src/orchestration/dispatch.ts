import fs from 'node:fs';
import path from 'node:path';

import { appendEvent, nowIso } from '../state/events.js';
import { type ZigrixPaths, ensureBaseState } from '../state/paths.js';
import { type ExecutionUnit, type WorkPackage, type ZigrixTask, createTask, loadTask, rebuildIndex, saveTask } from '../state/tasks.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const BASELINE_REQUIRED = ['pro-zig', 'qa-zig'];
const CANDIDATE_AGENTS = ['front-zig', 'back-zig', 'sys-zig', 'sec-zig'];
const SELECTION_HINTS: Record<string, string> = {
  'front-zig': 'UI / styling / client-side integration when present',
  'back-zig': 'API / DB / server-side logic when present',
  'sys-zig': 'architecture / infra / system-wide change when present',
  'sec-zig': 'security-sensitive scope or risky changes when present',
};

// ─── Execution unit skeletons ───────────────────────────────────────────────

function defaultWorkPackages(scale: string): WorkPackage[] {
  return [
    { id: 'WP1', key: 'planning', title: 'planning', parallel: false },
    { id: 'WP2', key: 'implementation', title: 'implementation', parallel: ['normal', 'risky', 'large'].includes(scale) },
    { id: 'WP3', key: 'verification', title: 'verification', parallel: false },
    { id: 'WP4', key: 'release', title: 'release', parallel: false },
  ];
}

function defaultExecutionUnits(scale: string): ExecutionUnit[] {
  if (['normal', 'risky', 'large'].includes(scale)) {
    return [
      { id: 'U1', title: 'spec confirmation', kind: 'planning', owner: 'pro-zig', workPackage: 'planning', dependsOn: [], parallel: false, status: 'OPEN', dod: 'scope / constraints / edge cases fixed' },
      { id: 'U2', title: 'implementation planning / work package split', kind: 'planning', owner: 'pro-zig', workPackage: 'planning', dependsOn: ['U1'], parallel: false, status: 'OPEN', dod: 'execution units and work packages fixed' },
      { id: 'U3', title: 'implementation slices', kind: 'implementation', owner: 'pro-zig', workPackage: 'implementation', dependsOn: ['U2'], parallel: true, status: 'OPEN', dod: 'required work packages complete' },
      { id: 'U4', title: 'qa / regression', kind: 'verification', owner: 'qa-zig', workPackage: 'verification', dependsOn: ['U3'], parallel: false, status: 'OPEN', dod: 'qa evidence attached' },
      { id: 'U5', title: 'report / deploy / wrap-up', kind: 'reporting', owner: 'pro-zig', workPackage: 'release', dependsOn: ['U4'], parallel: false, status: 'OPEN', dod: 'final report prepared and deployment decision recorded' },
    ];
  }
  return [
    { id: 'U1', title: 'spec confirmation', kind: 'planning', owner: 'pro-zig', workPackage: 'planning', dependsOn: [], parallel: false, status: 'OPEN', dod: 'scope / constraints / edge cases fixed' },
    { id: 'U2', title: 'implementation slice', kind: 'implementation', owner: 'pro-zig', workPackage: 'implementation', dependsOn: ['U1'], parallel: false, status: 'OPEN', dod: 'main implementation slice complete' },
    { id: 'U3', title: 'qa / regression', kind: 'verification', owner: 'qa-zig', workPackage: 'verification', dependsOn: ['U2'], parallel: false, status: 'OPEN', dod: 'qa evidence attached' },
  ];
}

// ─── Boot prompt ────────────────────────────────────────────────────────────

function buildBootPrompt(task: ZigrixTask): string {
  return `## Orchestration Task Boot: ${task.taskId}
- **Title:** ${task.title}
- **Scale:** ${task.scale}

---

## ⚠️ 절대 규칙: qa-zig 호출 필수 (모든 스케일)

**scale이 simple이든 normal이든 risky든 large든, qa-zig 워커는 반드시 호출해야 한다.**

---

## ⚡ 필수 첫 단계 (건너뛰기 금지)

아래 명령을 **가장 먼저** 실행하라:

\`\`\`bash
zigrix task start ${task.taskId} --json
\`\`\`

그 후 태스크 메타를 확인하라:

\`\`\`bash
zigrix task status ${task.taskId} --json
\`\`\`

워커 호출 시:
\`\`\`bash
zigrix worker prepare --task-id ${task.taskId} --agent-id <workerId> --description "..." --json
zigrix worker register --task-id ${task.taskId} --agent-id <workerId> --session-key <key> --json
zigrix worker complete --task-id ${task.taskId} --agent-id <workerId> --session-key <key> --run-id <rid> --json
\`\`\`

최종 완료:
\`\`\`bash
zigrix task finalize ${task.taskId} --json
\`\`\`
`;
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

export function dispatchTask(paths: ZigrixPaths, params: {
  title: string;
  description: string;
  scale: string;
  projectDir?: string;
  requestedBy?: string;
  constraints?: string;
}): Record<string, unknown> {
  ensureBaseState(paths);

  // Create the task
  const task = createTask(paths, {
    title: params.title,
    description: params.description,
    scale: params.scale,
    requiredAgents: [...BASELINE_REQUIRED],
    projectDir: params.projectDir,
    requestedBy: params.requestedBy,
  });

  // Enrich with orchestration metadata
  task.selectedAgents = [...BASELINE_REQUIRED];
  task.workPackages = defaultWorkPackages(params.scale);
  task.executionUnits = defaultExecutionUnits(params.scale);
  saveTask(paths, task);

  // Write dispatch prompt
  const promptPath = path.join(paths.promptsDir, `${task.taskId}-dispatch.md`);
  const dispatchPrompt = [
    `## Orchestration Task: ${task.taskId}`,
    '',
    '### 기본 정보',
    `- **Title:** ${task.title}`,
    `- **Scale:** ${task.scale}`,
    `- **Baseline Required Agents:** ${BASELINE_REQUIRED.join(', ')}`,
    `- **Candidate Agents:** ${CANDIDATE_AGENTS.join(', ')}`,
    params.projectDir ? `- **Project Dir:** ${params.projectDir}` : '',
    '',
    '### 요청 내용',
    params.description,
    params.constraints ? `\n### 제약사항\n${params.constraints}` : '',
    '',
    '### 선택 규칙',
    ...Object.entries(SELECTION_HINTS).map(([k, v]) => `- ${k}: ${v}`),
  ].filter(Boolean).join('\n');
  fs.writeFileSync(promptPath, `${dispatchPrompt}\n`, 'utf8');

  const bootPrompt = buildBootPrompt(task);

  appendEvent(paths.eventsFile, {
    event: 'task_dispatched',
    taskId: task.taskId,
    phase: 'dispatch',
    actor: 'zigrix',
    status: 'OPEN',
    payload: {
      scale: task.scale,
      baselineRequiredAgents: BASELINE_REQUIRED,
      candidateAgents: CANDIDATE_AGENTS,
      projectDir: params.projectDir ?? null,
    },
  });
  rebuildIndex(paths);

  return {
    ok: true,
    taskId: task.taskId,
    title: task.title,
    scale: task.scale,
    baselineRequiredAgents: BASELINE_REQUIRED,
    candidateAgents: CANDIDATE_AGENTS,
    specPath: path.join(paths.tasksDir, `${task.taskId}.md`),
    metaPath: path.join(paths.tasksDir, `${task.taskId}.meta.json`),
    promptPath,
    proZigPrompt: bootPrompt,
    projectDir: params.projectDir ?? null,
  };
}
