import path from 'node:path';
import os from 'node:os';

export const CONFIG_FILENAME = 'zigrix.config.json';
export const LEGACY_DEFAULT_GATEWAY_URL = 'http://127.0.0.1:18789';

export function expandTilde(input: string): string {
  const homeDir = os.homedir();
  if (!input) return homeDir;
  if (input === '~') return homeDir;
  if (input.startsWith('~/')) return path.join(homeDir, input.slice(2));
  return input;
}

export function resolveAbsolutePath(input: string): string {
  return path.resolve(expandTilde(input));
}

export function resolveCanonicalConfigHome(): string {
  return path.join(os.homedir(), '.zigrix');
}

export function resolveCanonicalConfigPath(): string {
  return path.join(resolveCanonicalConfigHome(), CONFIG_FILENAME);
}

export function resolveDefaultWorkspaceDir(baseDir = resolveCanonicalConfigHome()): string {
  return path.join(baseDir, 'workspace');
}

export function buildDefaultConfig(baseDir = resolveCanonicalConfigHome()) {
  return {
    paths: {
      baseDir,
      tasksDir: path.join(baseDir, 'tasks'),
      evidenceDir: path.join(baseDir, 'evidence'),
      promptsDir: path.join(baseDir, 'prompts'),
      eventsFile: path.join(baseDir, 'tasks.jsonl'),
      indexFile: path.join(baseDir, 'index.json'),
      runsDir: path.join(baseDir, 'runs'),
      rulesDir: path.join(baseDir, 'rules'),
    },
    workspace: {
      projectsBaseDir: resolveDefaultWorkspaceDir(baseDir),
    },
    agents: {
      registry: {},
      orchestration: {
        participants: [],
        excluded: [],
        orchestratorId: 'orchestrator',
      },
    },
    rules: {
      scales: {
        simple: { requiredRoles: ['orchestrator'], optionalRoles: ['qa'] },
        normal: { requiredRoles: ['orchestrator', 'qa'], optionalRoles: ['frontend', 'backend'] },
        risky: { requiredRoles: ['orchestrator', 'qa', 'security'], optionalRoles: ['frontend', 'backend', 'system'] },
      },
      completion: {
        requireQa: true,
        requireEvidence: true,
        requireUserReport: true,
      },
      stale: {
        defaultHours: 24,
      },
    },
    templates: {
      workerPrompt: {
        format: 'markdown',
        version: 2,
        placeholders: ['taskId', 'title', 'scale', 'agentId', 'description'],
        body: '## Worker Assignment: {{taskId}}\n- title: {{title}}\n- scale: {{scale}}\n- agent: {{agentId}}\n- description: {{description}}\n\n### Completion\n작업 완료 후 반드시 증적을 먼저 수집하라:\n```bash\nzigrix evidence collect --task-id {{taskId}} --agent-id {{agentId}} --summary "<결과 요약>"\n```\n⚠️ 증적 없이 완료하면 finalize에서 incomplete 판정된다.',
      },
      finalReport: {
        format: 'markdown',
        version: 1,
        placeholders: ['taskId', 'title', 'status', 'summary'],
        body: '## Final Report: {{taskId}}\n- title: {{title}}\n- status: {{status}}\n- summary: {{summary}}',
      },
    },
    openclaw: {
      home: '',
      binPath: null,
      gatewayUrl: '',
    },
    runtime: {
      outputMode: 'text',
      jsonIndent: 2,
    },
  } as const;
}

export const defaultConfig = buildDefaultConfig();

export type DefaultConfig = ReturnType<typeof buildDefaultConfig>;
