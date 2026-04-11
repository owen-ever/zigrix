import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  inferStandardAgentRole,
  normalizeAgentRole,
  type StandardAgentRole,
} from '../agents/roles.js';
import type { ZigrixConfig } from '../config/schema.js';
import { type ZigrixPaths } from '../state/paths.js';
import { type ZigrixTask } from '../state/tasks.js';

const ROLE_RULE_FILE: Record<StandardAgentRole, string> = {
  orchestrator: 'orchestrator-agent.md',
  qa: 'qa-agent.md',
  security: 'security-agent.md',
  frontend: 'frontend-agent.md',
  backend: 'backend-agent.md',
  system: 'system-agent.md',
};

const WORKER_COMMON_RULE_FILE = 'worker-common.md';

function bundledRulesDir(): string {
  return path.resolve(fileURLToPath(new URL('../../rules/defaults', import.meta.url)));
}

function firstReadableRulePath(paths: ZigrixPaths, fileName: string): string | null {
  const candidates = [
    path.join(paths.rulesDir, fileName),
    path.join(bundledRulesDir(), fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function loadRuleText(paths: ZigrixPaths, fileName: string): string {
  const resolved = firstReadableRulePath(paths, fileName);
  if (!resolved) {
    throw new Error(`required Zigrix rule file not found: ${fileName}`);
  }
  return fs.readFileSync(resolved, 'utf8').trim();
}

function compactBlock(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

function joinPromptBlocks(...blocks: Array<string | null | undefined>): string {
  return blocks
    .map((block) => (typeof block === 'string' ? compactBlock(block) : ''))
    .filter((block) => block.length > 0)
    .join('\n\n---\n\n');
}

function renderRoleMap(task: ZigrixTask): string {
  const entries = Object.entries(task.roleAgentMap ?? {}).filter(([, ids]) =>
    Array.isArray(ids) && ids.length > 0,
  );
  if (entries.length === 0) return '- (none)';
  return entries.map(([role, ids]) => `- ${role}: ${(ids as string[]).join(', ')}`).join('\n');
}

function resolveTaskRole(task: ZigrixTask, agentId: string): StandardAgentRole | null {
  if (typeof task.orchestratorId === 'string' && task.orchestratorId === agentId) return 'orchestrator';
  if (typeof task.qaAgentId === 'string' && task.qaAgentId === agentId) return 'qa';

  const roleMap = task.roleAgentMap;
  if (roleMap && typeof roleMap === 'object') {
    for (const [role, agentIds] of Object.entries(roleMap)) {
      if (!Array.isArray(agentIds)) continue;
      if ((agentIds as string[]).includes(agentId)) {
        const normalized = normalizeAgentRole(role);
        if (normalized) return normalized;
      }
    }
  }
  return null;
}

export function resolveAgentRole(
  config: ZigrixConfig,
  task: ZigrixTask,
  agentId: string,
): StandardAgentRole {
  const fromTask = resolveTaskRole(task, agentId);
  if (fromTask) return fromTask;

  const fromRegistry = config.agents.registry[agentId]?.role;
  if (typeof fromRegistry === 'string') {
    const normalized = normalizeAgentRole(fromRegistry);
    if (normalized) return normalized;
  }

  return inferStandardAgentRole({ agentId, theme: null });
}

export function buildSpawnLabel(taskId: string, agentId: string): string {
  return `[${agentId}] ${taskId}`;
}

export function composeOrchestratorPrompt(params: {
  paths: ZigrixPaths;
  task: ZigrixTask;
  orchestratorId: string;
  qaAgentId: string;
  promptPath: string;
  specPath: string;
  metaPath: string;
  projectDir?: string | null;
  constraints?: string;
}): string {
  const roleRule = loadRuleText(params.paths, ROLE_RULE_FILE.orchestrator);
  const overlay = [
    `## Runtime Task Overlay: ${params.task.taskId}`,
    '',
    '| Field | Value |',
    '|---|---|',
    `| taskId | ${params.task.taskId} |`,
    `| title | ${params.task.title} |`,
    `| scale | ${params.task.scale} |`,
    `| orchestratorId | ${params.orchestratorId} |`,
    `| qaAgentId | ${params.qaAgentId} |`,
    `| specPath | ${params.specPath} |`,
    `| metaPath | ${params.metaPath} |`,
    `| promptPath | ${params.promptPath} |`,
    ...(params.projectDir ? [`| projectDir | ${params.projectDir} |`] : []),
    '',
    '### Authority Boundary',
    '- 이 prompt는 Zigrix orchestrator role rule + task overlay를 합성한 canonical instruction이다.',
    '- 메인 전용 skill (`zigrix-main-agent-guide`)이나 일반 OpenClaw skill discovery를 근거 규칙으로 삼지 않는다.',
    '- 실제 runtime agentId는 아래 role mapping과 task metadata를 따른다.',
    '',
    '### Original Request',
    params.task.description,
    params.constraints ? `\n### Constraints\n${params.constraints}` : '',
    '',
    '### Runtime Role Mapping',
    renderRoleMap(params.task),
    '',
    '### Required CLI Chain',
    '1. `zigrix task start <taskId> --json`',
    '2. `zigrix task status <taskId> --json`',
    '3. 필요 워커마다 `zigrix worker prepare → sessions_spawn → zigrix worker register → zigrix worker complete`',
    '4. evidence 수집/머지 확인',
    '5. `zigrix task finalize <taskId> --json`',
    '',
    '### Worker Dispatch Contract',
    '- worker spawn 전에 반드시 `zigrix worker prepare --task-id <taskId> --agent-id <workerId> --description "..." --json` 를 호출해 worker prompt / projectDir / spawnLabel을 확보한다.',
    '- worker spawn 시 `agentId`, `label`, `cwd`, `task` 를 모두 명시한다.',
    '- spawn 후에는 prepare 응답의 `spawnLabel` / `projectDir` 와 실제 `sessionKey` / `sessionId` 를 함께 `zigrix worker register` 에 전달한다.',
  ]
    .filter(Boolean)
    .join('\n');

  return joinPromptBlocks(roleRule, overlay);
}

export function composeWorkerPrompt(params: {
  paths: ZigrixPaths;
  config: ZigrixConfig;
  task: ZigrixTask;
  agentId: string;
  description: string;
  constraints?: string;
  unitId?: string;
  workPackage?: string;
  dod?: string;
  projectDir?: string | null;
  promptPath: string;
  specPath: string;
  metaPath: string;
}): { prompt: string; role: StandardAgentRole } {
  const role = resolveAgentRole(params.config, params.task, params.agentId);
  const roleRule = loadRuleText(params.paths, ROLE_RULE_FILE[role]);
  const baseRule = role === 'orchestrator' ? '' : loadRuleText(params.paths, WORKER_COMMON_RULE_FILE);

  const overlay = [
    `## Runtime Worker Overlay: ${params.task.taskId}`,
    '',
    '| Field | Value |',
    '|---|---|',
    `| taskId | ${params.task.taskId} |`,
    `| title | ${params.task.title} |`,
    `| scale | ${params.task.scale} |`,
    `| agentId | ${params.agentId} |`,
    `| role | ${role} |`,
    `| specPath | ${params.specPath} |`,
    `| metaPath | ${params.metaPath} |`,
    `| promptPath | ${params.promptPath} |`,
    ...(params.projectDir ? [`| projectDir | ${params.projectDir} |`] : []),
    '',
    '### Authority Boundary',
    '- 이 prompt는 Zigrix role rule + task overlay를 합성한 canonical worker instruction이다.',
    '- 메인 전용 skill (`zigrix-main-agent-guide`)이나 일반 OpenClaw skill discovery를 근거 규칙으로 삼지 않는다.',
    '- role rule 안의 예시 agent 이름보다 현재 overlay의 `agentId` / `role` / `projectDir` 를 우선 적용한다.',
    '',
    '### Assignment',
    params.description,
    params.constraints ? `\n### Constraints\n${params.constraints}` : '',
    params.dod ? `\n### Definition of Done\n${params.dod}` : '',
    params.unitId || params.workPackage
      ? `\n### Execution Context\n- unitId: ${params.unitId ?? 'N/A'}\n- workPackage: ${params.workPackage ?? 'N/A'}`
      : '',
    '',
    '### Completion Chain',
    `- evidence collect: \`zigrix evidence collect --task-id ${params.task.taskId} --agent-id ${params.agentId} --summary "<result summary>"\``,
    '- 결과 보고에는 taskId / sessionKey / runId / evidence / risks 를 포함한다.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    role,
    prompt: joinPromptBlocks(baseRule, roleRule, overlay),
  };
}
