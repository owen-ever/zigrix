import fs from 'node:fs';
import path from 'node:path';

import { STANDARD_AGENT_ROLES, type StandardAgentRole } from './agents/roles.js';
import { resolveCanonicalConfigHome, resolveCanonicalConfigPath } from './config/defaults.js';
import type { LoadedConfig } from './config/load.js';
import { STANDARD_SCALES, type ZigrixConfig } from './config/schema.js';
import type { ZigrixPaths } from './state/paths.js';

const BASELINE_REQUIRED_ROLES: StandardAgentRole[] = ['orchestrator', 'qa'];

type ScaleCoverage = {
  requiredRoles: string[];
  eligibleByRole: Record<string, string[]>;
  missingEligibleRoles: string[];
};

type ConfigConsistencyPayload = {
  ok: boolean;
  issues: string[];
  warnings: string[];
  pathConflicts: string[];
  missingStandardScales: string[];
  orchestrator: {
    id: string;
    presentInRegistry: boolean;
    enabled: boolean;
    participantMode: boolean;
    inParticipants: boolean;
    excluded: boolean;
    eligible: boolean;
  };
  scaleCoverage: Record<string, ScaleCoverage>;
};

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function existsWritable(targetPath: string): boolean {
  try {
    return fs.existsSync(targetPath)
      ? fs.accessSync(targetPath, fs.constants.W_OK) === undefined
      : fs.accessSync(path.dirname(targetPath), fs.constants.W_OK) === undefined;
  } catch {
    return false;
  }
}

function detectOpenClawHome(): string {
  return process.env.OPENCLAW_HOME
    ? path.resolve(process.env.OPENCLAW_HOME)
    : path.join(process.env.HOME ?? '~', '.openclaw');
}

function resolveEligibleAgentsByRole(config: ZigrixConfig): Record<string, string[]> {
  const participants = new Set(config.agents.orchestration.participants);
  const excluded = new Set(config.agents.orchestration.excluded);
  const participantMode = participants.size > 0;
  const byRole: Record<string, string[]> = Object.fromEntries(
    STANDARD_AGENT_ROLES.map((role) => [role, []]),
  );

  for (const [agentId, agent] of Object.entries(config.agents.registry).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!agent.enabled) continue;
    if (excluded.has(agentId)) continue;
    if (participantMode && !participants.has(agentId)) continue;
    byRole[agent.role] = [...(byRole[agent.role] ?? []), agentId];
  }

  return byRole;
}

function collectPathConflicts(paths: ZigrixPaths): string[] {
  const issues: string[] = [];
  const entries = [
    ['tasksDir', paths.tasksDir],
    ['evidenceDir', paths.evidenceDir],
    ['promptsDir', paths.promptsDir],
    ['runsDir', paths.runsDir],
    ['rulesDir', paths.rulesDir],
    ['eventsFile', paths.eventsFile],
    ['indexFile', paths.indexFile],
  ] as const;

  const seen = new Map<string, string>();
  for (const [name, rawPath] of entries) {
    const normalized = path.resolve(rawPath);
    const previous = seen.get(normalized);
    if (previous) {
      issues.push(`${name} collides with ${previous}`);
      continue;
    }
    seen.set(normalized, name);
  }

  return issues;
}

function collectConfigConsistency(
  config: ZigrixConfig,
  paths: ZigrixPaths,
): ConfigConsistencyPayload {
  const issues = collectPathConflicts(paths);
  const warnings: string[] = [];
  const missingStandardScales = STANDARD_SCALES.filter((scale) => !(scale in config.rules.scales));
  const eligibleByRole = resolveEligibleAgentsByRole(config);
  const participantMode = config.agents.orchestration.participants.length > 0;
  const orchestratorId = config.agents.orchestration.orchestratorId;
  const orchestratorAgent = config.agents.registry[orchestratorId];
  const orchestratorPresent = Boolean(orchestratorAgent);
  const orchestratorEnabled = orchestratorAgent?.enabled !== false;
  const inParticipants = config.agents.orchestration.participants.includes(orchestratorId);
  const excluded = config.agents.orchestration.excluded.includes(orchestratorId);
  const orchestratorEligible =
    orchestratorPresent && orchestratorEnabled && !excluded && (!participantMode || inParticipants);

  for (const scale of missingStandardScales) {
    issues.push(`rules.scales is missing '${scale}'`);
  }

  if (orchestratorPresent && !orchestratorEnabled) {
    issues.push(`orchestratorId '${orchestratorId}' points to a disabled agent`);
  }
  if (orchestratorPresent && excluded) {
    issues.push(`orchestratorId '${orchestratorId}' is excluded from orchestration`);
  }
  if (participantMode && orchestratorPresent && !inParticipants) {
    issues.push(
      `orchestratorId '${orchestratorId}' is not included in participants while participant mode is active`,
    );
  }

  const scaleCoverage: Record<string, ScaleCoverage> = {};
  for (const scale of STANDARD_SCALES) {
    const policy = config.rules.scales[scale];
    if (!policy) continue;

    const requiredRoles = unique([...BASELINE_REQUIRED_ROLES, ...policy.requiredRoles]);
    const missingEligibleRoles = requiredRoles.filter(
      (role) => (eligibleByRole[role] ?? []).length === 0,
    );
    scaleCoverage[scale] = {
      requiredRoles,
      eligibleByRole: Object.fromEntries(
        requiredRoles.map((role) => [role, [...(eligibleByRole[role] ?? [])]]),
      ),
      missingEligibleRoles,
    };

    if (missingEligibleRoles.length > 0) {
      warnings.push(
        `scale '${scale}' has no eligible agents for required roles: ${missingEligibleRoles.join(', ')}`,
      );
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    pathConflicts: collectPathConflicts(paths),
    missingStandardScales,
    orchestrator: {
      id: orchestratorId,
      presentInRegistry: orchestratorPresent,
      enabled: orchestratorEnabled,
      participantMode,
      inParticipants,
      excluded,
      eligible: orchestratorEligible,
    },
    scaleCoverage,
  };
}

function buildBasePayload(params: { configPath: string; baseDir: string; openclawHome: string }) {
  const openclawSkillsDir = path.join(params.openclawHome, 'skills');
  const nonLoginShellPaths = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const zigrixNonLoginLocation =
    nonLoginShellPaths.find((dir) => {
      try {
        return fs.existsSync(path.join(dir, 'zigrix'));
      } catch {
        return false;
      }
    }) ?? null;
  const openclawNonLoginLocation =
    nonLoginShellPaths.find((dir) => {
      try {
        return fs.existsSync(path.join(dir, 'openclaw'));
      } catch {
        return false;
      }
    }) ?? null;

  return {
    node: {
      executable: process.execPath,
      version: process.versions.node,
      ok: Number(process.versions.node.split('.')[0]) >= 22,
    },
    paths: {
      baseDir: params.baseDir,
      configPath: params.configPath,
      tasksDir: null,
      promptsDir: null,
      evidenceDir: null,
      runsDir: null,
      rulesDir: null,
    },
    files: {
      configExists: fs.existsSync(params.configPath),
      baseDirExists: fs.existsSync(params.baseDir),
      indexExists: false,
      eventsExists: false,
    },
    rules: {
      dir: null,
      exists: false,
      files: [],
      count: 0,
    },
    writeAccess: {
      baseDir: existsWritable(params.baseDir),
      configPath: existsWritable(params.configPath),
    },
    binaries: {
      node: process.execPath,
      npm: process.env.npm_execpath ?? null,
      openclaw: null,
    },
    openclaw: {
      home: params.openclawHome,
      exists: fs.existsSync(params.openclawHome),
      skillsDir: openclawSkillsDir,
      skillsDirExists: fs.existsSync(openclawSkillsDir),
    },
    pathReach: {
      nonLoginShellPaths,
      zigrixInNonLoginPath: zigrixNonLoginLocation !== null,
      zigrixNonLoginLocation,
      openclawInNonLoginPath: openclawNonLoginLocation !== null,
      openclawNonLoginLocation,
    },
  };
}

export function gatherDoctor(loaded: LoadedConfig, paths: ZigrixPaths): Record<string, unknown> {
  const openclawHome = detectOpenClawHome();
  const rulesDir = paths.rulesDir;
  const ruleFiles = fs.existsSync(rulesDir)
    ? fs
        .readdirSync(rulesDir)
        .filter((f) => f.endsWith('.md'))
        .sort()
    : [];
  const basePayload = buildBasePayload({
    configPath: loaded.configPath,
    baseDir: loaded.baseDir,
    openclawHome,
  });
  const warnings: string[] = [];
  const configConsistency = collectConfigConsistency(loaded.config as ZigrixConfig, paths);

  const payload = {
    ...basePayload,
    paths: {
      ...basePayload.paths,
      tasksDir: paths.tasksDir,
      promptsDir: paths.promptsDir,
      evidenceDir: paths.evidenceDir,
      runsDir: paths.runsDir,
      rulesDir: paths.rulesDir,
    },
    files: {
      ...basePayload.files,
      indexExists: fs.existsSync(paths.indexFile),
      eventsExists: fs.existsSync(paths.eventsFile),
    },
    rules: {
      dir: rulesDir,
      exists: fs.existsSync(rulesDir),
      files: ruleFiles,
      count: ruleFiles.length,
    },
    binaries: {
      ...basePayload.binaries,
      openclaw: (loaded.config as ZigrixConfig).openclaw?.binPath ?? null,
    },
    configConsistency,
  };

  if (!payload.node.ok) warnings.push('Node.js 22+ is required.');
  if (!payload.files.configExists)
    warnings.push('zigrix.config.json not found. Run `zigrix onboard`.');
  if (!payload.files.baseDirExists)
    warnings.push(`${paths.baseDir} not found. Run \`zigrix onboard\`.`);
  if (!payload.writeAccess.baseDir) warnings.push('Base directory is not writable.');
  if (!payload.openclaw.exists)
    warnings.push(`${openclawHome} not found. OpenClaw integration remains optional.`);
  if (payload.rules.count === 0) {
    warnings.push(
      'No rule files found in rules directory. Seed bundled defaults with `zigrix onboard` or `zigrix configure --section rules`.',
    );
  }
  if (!payload.pathReach.zigrixInNonLoginPath) {
    warnings.push(
      'zigrix is not reachable from non-login shell PATH (checked: /usr/local/bin, /usr/bin). ' +
        'Run `zigrix onboard` or manually: sudo ln -sfn $(which zigrix) /usr/local/bin/zigrix',
    );
  }
  if (!payload.pathReach.openclawInNonLoginPath) {
    warnings.push(
      'openclaw is not reachable from non-login shell PATH (checked: /usr/local/bin, /usr/bin). ' +
        'Run `zigrix onboard` or manually: sudo ln -sfn $(which openclaw) /usr/local/bin/openclaw',
    );
  }
  if (
    typeof payload.binaries.openclaw === 'string' &&
    payload.binaries.openclaw.length > 0 &&
    !fs.existsSync(payload.binaries.openclaw)
  ) {
    warnings.push(`Configured openclaw.binPath does not exist: ${payload.binaries.openclaw}`);
  }
  warnings.push(...configConsistency.issues.map((issue) => `Config issue: ${issue}`));
  warnings.push(...configConsistency.warnings.map((warning) => `Config warning: ${warning}`));

  return {
    ...payload,
    summary: {
      ready:
        payload.node.ok &&
        payload.writeAccess.baseDir &&
        payload.files.configExists &&
        payload.configConsistency.ok,
      warnings,
    },
  };
}

export function gatherDoctorFailure(
  error: unknown,
  options?: { configPath?: string },
): Record<string, unknown> {
  const configPath = options?.configPath ?? resolveCanonicalConfigPath();
  const baseDir = resolveCanonicalConfigHome();
  const openclawHome = detectOpenClawHome();
  const message = error instanceof Error ? error.message : String(error);
  const payload = buildBasePayload({ configPath, baseDir, openclawHome });

  return {
    ...payload,
    configConsistency: {
      ok: false,
      issues: [`Config load failed: ${message}`],
      warnings: [],
      pathConflicts: [],
      missingStandardScales: [...STANDARD_SCALES],
      orchestrator: {
        id: 'unknown',
        presentInRegistry: false,
        enabled: false,
        participantMode: false,
        inParticipants: false,
        excluded: false,
        eligible: false,
      },
      scaleCoverage: {},
    },
    summary: {
      ready: false,
      warnings: [`Config load failed: ${message}`],
    },
  };
}

export function renderDoctorText(payload: Record<string, any>): string {
  const lines = [
    'Zigrix Doctor',
    `- Node: ${payload.node?.version ?? 'unknown'} (${payload.node?.ok ? 'ok' : 'too old'})`,
    `- Base dir: ${payload.paths?.baseDir ?? 'missing'}`,
    `- Config: ${payload.paths?.configPath ?? 'missing'}`,
    `- Rules dir: ${payload.rules?.dir ?? 'missing'} (${payload.rules?.count ?? 0} files)`,
    `- OpenClaw home: ${payload.openclaw?.home ?? 'missing'} (${payload.openclaw?.exists ? 'present' : 'missing'})`,
    `- Non-login PATH reach (zigrix): ${payload.pathReach?.zigrixInNonLoginPath ? `yes (${payload.pathReach?.zigrixNonLoginLocation})` : 'no'}`,
    `- Non-login PATH reach (openclaw): ${payload.pathReach?.openclawInNonLoginPath ? `yes (${payload.pathReach?.openclawNonLoginLocation})` : 'no'}`,
    `- Config consistency: ${payload.configConsistency?.ok ? 'ok' : 'issues found'}`,
    `- Ready: ${payload.summary?.ready ? 'yes' : 'no'}`,
  ];
  for (const warning of (payload.summary?.warnings ?? []) as string[]) {
    lines.push(`- Warning: ${warning}`);
  }
  return lines.join('\n');
}
