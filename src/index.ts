#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';

import {
  addAgent,
  excludeAgent,
  includeAgent,
  listAgents,
  removeAgent,
  setAgentEnabled,
  setAgentRole,
} from './agents/registry.js';
import { runConfigure } from './configure.js';
import { diffValues, getValueAtPath, parseConfigInput, resetValueAtPath, setValueAtPath } from './config/mutate.js';
import { defaultConfig, resolveAbsolutePath } from './config/defaults.js';
import { getConfigValue, loadConfig, writeConfigFile, writeDefaultConfig } from './config/load.js';
import type { ZigrixConfig } from './config/schema.js';
import { zigrixConfigJsonSchema } from './config/schema.js';
import { gatherDoctor, renderDoctorText } from './doctor.js';
import { runOnboard } from './onboard.js';
import { dispatchTask, resolveConfiguredProjectDir } from './orchestration/dispatch.js';
import { collectEvidence, mergeEvidence } from './orchestration/evidence.js';
import { finalizeTask } from './orchestration/finalize.js';
import { runPipeline } from './orchestration/pipeline.js';
import { renderReport } from './orchestration/report.js';
import { completeWorker, prepareWorker, registerWorker } from './orchestration/worker.js';
import { listRules, renderTemplate, validateRules, type TemplateKind } from './rules/templates.js';
import { runWorkflow, summarizeRun } from './runner/run.js';
import { loadRunRecord } from './runner/store.js';
import { ensureBaseState, resolvePaths } from './state/paths.js';
import {
  applyStalePolicy,
  createTask,
  findStaleTasks,
  listTaskEvents,
  listTasks,
  loadTask,
  rebuildIndex,
  recordTaskProgress,
  resolveTaskPaths,
  updateTaskStatus,
} from './state/tasks.js';
import { verifyState } from './state/verify.js';
import { runDashboard, DASHBOARD_DEFAULT_PORT } from './dashboard.js';

const STATUS_MAP: Record<string, string> = {
  start: 'IN_PROGRESS',
  report: 'REPORTED',
};

function printValue(value: unknown, json = false): void {
  if (json || typeof value !== 'string') {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(value);
}

function requireConfigPath(configPath: string): string {
  return configPath;
}

function persistAndPrintMutation(params: {
  configPath: string;
  baseDir: string;
  nextConfig: ZigrixConfig;
  json?: boolean;
  action: string;
  agentId: string;
}): void {
  const targetPath = requireConfigPath(params.configPath);
  writeConfigFile(targetPath, params.nextConfig);
  printValue({ ok: true, action: params.action, agentId: params.agentId, configPath: targetPath }, params.json);
}

function persistConfigMutation(params: {
  configPath: string;
  baseDir: string;
  nextConfig: ZigrixConfig;
  json?: boolean;
  action: string;
  path?: string;
}): void {
  const targetPath = requireConfigPath(params.configPath);
  writeConfigFile(targetPath, params.nextConfig);
  printValue({ ok: true, action: params.action, path: params.path ?? null, configPath: targetPath }, params.json);
}

function requireYes(yes?: boolean, action = 'perform this action'): void {
  if (!yes) {
    throw new Error(`refusing to ${action} without --yes`);
  }
}

function loadRuntime() {
  const loaded = loadConfig();
  return { ...loaded, paths: resolvePaths(loaded.config) };
}

function resolveAgentsStateDir(config: ZigrixConfig): string | null {
  const configuredHome = typeof config.openclaw.home === 'string' ? config.openclaw.home.trim() : '';
  const openclawHome = configuredHome || process.env.OPENCLAW_HOME || '';
  if (!openclawHome) return null;
  return path.join(openclawHome, 'agents');
}

function parseVerificationMap(raw: string): { dod: string; test: string } {
  const [dod, test] = raw.split(/=(.*)/s, 2);
  const left = dod?.trim() ?? '';
  const right = test?.trim() ?? '';
  if (!left || !right) {
    throw new Error(`invalid verification map format: ${raw} (expected dod=test)`);
  }
  return { dod: left, test: right };
}

function listRuntimePathValues(loaded: ReturnType<typeof loadRuntime>): Record<string, string | null> {
  return {
    configPath: loaded.configPath,
    'paths.baseDir': loaded.paths.baseDir,
    'paths.tasksDir': loaded.paths.tasksDir,
    'paths.evidenceDir': loaded.paths.evidenceDir,
    'paths.promptsDir': loaded.paths.promptsDir,
    'paths.eventsFile': loaded.paths.eventsFile,
    'paths.indexFile': loaded.paths.indexFile,
    'paths.runsDir': loaded.paths.runsDir,
    'paths.rulesDir': loaded.paths.rulesDir,
    'workspace.projectsBaseDir': loaded.config.workspace.projectsBaseDir,
  };
}

function resolveRuntimePathValue(loaded: ReturnType<typeof loadRuntime>, requestedKey: string): {
  requestedKey: string;
  canonicalKey: string;
  value: string | null;
} {
  const normalized = requestedKey.trim();
  const aliases: Record<string, string> = {
    configPath: 'configPath',
    baseDir: 'paths.baseDir',
    tasksDir: 'paths.tasksDir',
    evidenceDir: 'paths.evidenceDir',
    promptsDir: 'paths.promptsDir',
    eventsFile: 'paths.eventsFile',
    indexFile: 'paths.indexFile',
    runsDir: 'paths.runsDir',
    rulesDir: 'paths.rulesDir',
    projectsBaseDir: 'workspace.projectsBaseDir',
    workspaceBaseDir: 'workspace.projectsBaseDir',
    'paths.baseDir': 'paths.baseDir',
    'paths.tasksDir': 'paths.tasksDir',
    'paths.evidenceDir': 'paths.evidenceDir',
    'paths.promptsDir': 'paths.promptsDir',
    'paths.eventsFile': 'paths.eventsFile',
    'paths.indexFile': 'paths.indexFile',
    'paths.runsDir': 'paths.runsDir',
    'paths.rulesDir': 'paths.rulesDir',
    'workspace.projectsBaseDir': 'workspace.projectsBaseDir',
  };
  const canonicalKey = aliases[normalized];
  if (!canonicalKey) {
    throw new Error(`unknown path key: ${requestedKey}`);
  }
  const values = listRuntimePathValues(loaded);
  return {
    requestedKey,
    canonicalKey,
    value: values[canonicalKey] ?? null,
  };
}

const { version: pkgVersion } = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
) as { version: string };

const program = new Command();
program
  .name('zigrix')
  .description('Zigrix — multi-project parallel task orchestration CLI')
  .version(pkgVersion);

const config = program.command('config').description('Inspect Zigrix config');
const pathCmd = program.command('path').description('Resolve runtime paths from Zigrix config');
const agent = program.command('agent').description('Manage Zigrix agent registry and orchestration membership');
const rule = program.command('rule').description('Inspect and validate rule assets');
const template = program.command('template').description('Inspect and modify prompt templates');
const reset = program.command('reset').description('Restore default config sections or clean runtime state');
const state = program.command('state').description('Inspect and verify runtime state');
const task = program.command('task').description('Task operations');
const worker = program.command('worker').description('Worker lifecycle operations');
const evidence = program.command('evidence').description('Evidence collection and merge operations');
const report = program.command('report').description('User-facing reporting helpers');
const pipeline = program.command('pipeline').description('High-level orchestration helpers');

// ─── onboard ────────────────────────────────────────────────────────────────

program
  .command('onboard')
  .description('Set up Zigrix for first use (creates config.paths.baseDir state, seeds rules, registers agents, and captures workspace defaults)')
  .option('--yes', 'non-interactive confirmation')
  .option('--json', 'JSON output')
  .option('--project-dir <path>', 'optional directory to import rule templates from (`rules/defaults` or `rules`); otherwise bundled defaults are used')
  .option('--projects-base-dir <path>', 'workspace base directory to persist in zigrix.config.json')
  .option('--orchestrator-id <agentId>', 'set orchestration orchestrator agent id')
  .option('--gateway-url <url>', 'OpenClaw gateway URL (auto-detected from openclaw.json when available)')
  .action(async (options) => {
    const result = await runOnboard({
      yes: Boolean(options.yes),
      projectDir: options.projectDir,
      projectsBaseDir: options.projectsBaseDir,
      orchestratorId: options.orchestratorId,
      gatewayUrl: options.gatewayUrl,
      silent: Boolean(options.json),
    });
    printValue(result, options.json ?? true);
  });

// ─── configure ──────────────────────────────────────────────────────────────

program
  .command('configure')
  .description('Reconfigure agents, rules, PATH, skills, or workspace settings')
  .option('--section <section>', 'reconfigure specific section (agents|rules|workspace|path|skills), repeatable', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--projects-base-dir <path>', 'set projects base directory')
  .option('--project-dir <path>', 'optional directory to import rule templates from (`rules/defaults` or `rules`); otherwise bundled defaults are used')
  .option('--orchestrator-id <agentId>', 'set orchestration orchestrator agent id')
  .option('--yes', 'non-interactive confirmation')
  .option('--json', 'JSON output')
  .action(async (options) => {
    const result = await runConfigure({
      sections: options.section.length > 0 ? options.section : undefined,
      yes: Boolean(options.yes),
      projectDir: options.projectDir,
      projectsBaseDir: options.projectsBaseDir,
      orchestratorId: options.orchestratorId,
      silent: Boolean(options.json),
    });
    printValue(result, options.json ?? true);
  });

// ─── init (deprecated) ─────────────────────────────────────────────────────

program
  .command('init')
  .description('[DEPRECATED] Use "zigrix onboard" instead')
  .option('--yes', 'non-interactive confirmation')
  .option('--json', 'JSON output')
  .action((options) => {
    console.error('⚠️  "zigrix init" is deprecated. Use "zigrix onboard" instead.');
    const configPath = writeDefaultConfig(Boolean(options.yes));
    const loaded = loadRuntime();
    ensureBaseState(loaded.paths);
    rebuildIndex(loaded.paths);
    printValue({ ok: true, path: configPath, deprecated: true, useInstead: 'zigrix onboard' }, options.json);
  });

// ─── doctor ─────────────────────────────────────────────────────────────────

program
  .command('doctor')
  .description('Inspect environment, config, and runtime readiness')
  .option('--json')
  .action((options) => {
    const loaded = loadRuntime();
    const payload = gatherDoctor(loaded, loaded.paths);
    if (options.json) {
      printValue(payload, true);
      return;
    }
    console.log(renderDoctorText(payload));
  });

// ─── path ───────────────────────────────────────────────────────────────────

pathCmd
  .command('get <key>')
  .description('Resolve one runtime path by key or alias (for example: tasksDir, paths.tasksDir, workspace.projectsBaseDir)')
  .option('--json', 'JSON output')
  .action((key, options) => {
    const loaded = loadRuntime();
    const resolved = resolveRuntimePathValue(loaded, key);
    if (options.json) {
      printValue({ ok: true, ...resolved }, true);
      return;
    }
    printValue(resolved.value, false);
  });

pathCmd
  .command('list')
  .description('List resolved runtime paths')
  .option('--json', 'JSON output')
  .action((options) => {
    const loaded = loadRuntime();
    const values = listRuntimePathValues(loaded);
    if (options.json) {
      printValue({ ok: true, values }, true);
      return;
    }
    for (const [key, value] of Object.entries(values)) {
      console.log(`${key}=${value ?? ''}`);
    }
  });

// ─── config ─────────────────────────────────────────────────────────────────

config
  .command('validate')
  .option('--json', 'JSON output')
  .action((options) => {
    const loaded = loadConfig();
    printValue({ ok: true, configPath: loaded.configPath, baseDir: loaded.baseDir }, options.json);
  });

config
  .command('get [path]')
  .option('--json', 'JSON output')
  .action((dottedPath, options) => {
    const loaded = loadConfig();
    printValue(getConfigValue(loaded.config, dottedPath) ?? null, true);
  });

config
  .command('schema [path]')
  .option('--json', 'JSON output')
  .action((dottedPath, options) => {
    const value = dottedPath
      ? dottedPath.split('.').reduce((acc: unknown, key: string) => {
          if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
            return (acc as Record<string, unknown>)[key];
          }
          return null;
        }, zigrixConfigJsonSchema as unknown)
      : zigrixConfigJsonSchema;
    printValue(value, options.json ?? true);
  });

config
  .command('set <path>')
  .requiredOption('--value <jsonOrString>')
  .option('--json', 'JSON output')
  .action((dottedPath, options) => {
    const loaded = loadConfig();
    const nextConfig = setValueAtPath(loaded.config as unknown as Record<string, unknown>, dottedPath, parseConfigInput(options.value)) as unknown as ZigrixConfig;
    persistConfigMutation({
      configPath: loaded.configPath,
      baseDir: loaded.baseDir,
      nextConfig,
      json: options.json,
      action: 'config.set',
      path: dottedPath,
    });
  });

config
  .command('diff <path>')
  .option('--json', 'JSON output')
  .action((dottedPath, options) => {
    const loaded = loadConfig();
    printValue(diffValues(getValueAtPath(loaded.config, dottedPath), getValueAtPath(defaultConfig, dottedPath)), true);
  });

config
  .command('reset')
  .option('--path <path>', 'dotted config path to restore from defaults', 'all')
  .option('--yes', 'confirm destructive reset')
  .option('--json', 'JSON output')
  .action((options) => {
    requireYes(options.yes, 'reset config');
    const loaded = loadConfig();
    const nextConfig = resetValueAtPath(loaded.config, options.path);
    persistConfigMutation({
      configPath: loaded.configPath,
      baseDir: loaded.baseDir,
      nextConfig,
      json: options.json,
      action: 'config.reset',
      path: options.path,
    });
  });

// ─── agent ──────────────────────────────────────────────────────────────────

agent
  .command('list')
  .option('--json')
  .action((options) => printValue(listAgents(loadConfig().config), true));

agent
  .command('add')
  .requiredOption('--id <agentId>')
  .requiredOption('--role <role>')
  .requiredOption('--runtime <runtime>')
  .option('--label <label>')
  .option('--include')
  .option('--disabled')
  .option('--json')
  .action((options) => {
    const loaded = loadConfig();
    const result = addAgent(loaded.config, { id: options.id, role: options.role, runtime: options.runtime, label: options.label, enabled: !options.disabled, include: Boolean(options.include) });
    persistAndPrintMutation({ configPath: loaded.configPath, baseDir: loaded.baseDir, nextConfig: result.config, json: options.json, action: 'agent.add', agentId: result.agentId });
  });

agent
  .command('remove <agentId>')
  .option('--json')
  .action((agentId, options) => {
    const loaded = loadConfig();
    const result = removeAgent(loaded.config, agentId);
    persistAndPrintMutation({ configPath: loaded.configPath, baseDir: loaded.baseDir, nextConfig: result.config, json: options.json, action: 'agent.remove', agentId: result.agentId });
  });

agent
  .command('include <agentId>')
  .option('--json')
  .action((agentId, options) => {
    const loaded = loadConfig();
    const result = includeAgent(loaded.config, agentId);
    persistAndPrintMutation({ configPath: loaded.configPath, baseDir: loaded.baseDir, nextConfig: result.config, json: options.json, action: 'agent.include', agentId: result.agentId });
  });

agent
  .command('exclude <agentId>')
  .option('--json')
  .action((agentId, options) => {
    const loaded = loadConfig();
    const result = excludeAgent(loaded.config, agentId);
    persistAndPrintMutation({ configPath: loaded.configPath, baseDir: loaded.baseDir, nextConfig: result.config, json: options.json, action: 'agent.exclude', agentId: result.agentId });
  });

agent
  .command('enable <agentId>')
  .option('--json')
  .action((agentId, options) => {
    const loaded = loadConfig();
    const result = setAgentEnabled(loaded.config, agentId, true);
    persistAndPrintMutation({ configPath: loaded.configPath, baseDir: loaded.baseDir, nextConfig: result.config, json: options.json, action: 'agent.enable', agentId: result.agentId });
  });

agent
  .command('disable <agentId>')
  .option('--json')
  .action((agentId, options) => {
    const loaded = loadConfig();
    const result = setAgentEnabled(loaded.config, agentId, false);
    persistAndPrintMutation({ configPath: loaded.configPath, baseDir: loaded.baseDir, nextConfig: result.config, json: options.json, action: 'agent.disable', agentId: result.agentId });
  });

agent
  .command('set-role <agentId>')
  .requiredOption('--role <role>')
  .option('--json')
  .action((agentId, options) => {
    const loaded = loadConfig();
    const result = setAgentRole(loaded.config, agentId, options.role);
    persistAndPrintMutation({ configPath: loaded.configPath, baseDir: loaded.baseDir, nextConfig: result.config, json: options.json, action: 'agent.set-role', agentId: result.agentId });
  });

// ─── rule ───────────────────────────────────────────────────────────────────

rule
  .command('list')
  .option('--json')
  .action((options) => printValue(listRules(loadConfig().config), true));

rule
  .command('get <path>')
  .option('--json')
  .action((dottedPath, options) => printValue(getConfigValue(loadConfig().config, dottedPath) ?? null, true));

rule
  .command('validate')
  .option('--json')
  .action((options) => printValue(validateRules(loadConfig().config), true));

rule
  .command('render <templateKind>')
  .requiredOption('--context <json>')
  .option('--json')
  .action((templateKind: string, options) => {
    const loaded = loadConfig();
    const tpl = getConfigValue(loaded.config, `templates.${templateKind}`) as { body?: string } | undefined;
    if (!tpl?.body) throw new Error(`template not found: ${templateKind}`);
    const rendered = renderTemplate(templateKind as TemplateKind, tpl.body, JSON.parse(options.context) as Record<string, unknown>);
    printValue({ ok: true, templateKind, rendered }, true);
  });

rule
  .command('set <path>')
  .requiredOption('--value <jsonOrString>')
  .option('--json')
  .action((dottedPath, options) => {
    if (!dottedPath.startsWith('rules.')) throw new Error('rule path must start with rules.');
    const loaded = loadConfig();
    const nextConfig = setValueAtPath(loaded.config as unknown as Record<string, unknown>, dottedPath, parseConfigInput(options.value)) as unknown as ZigrixConfig;
    persistConfigMutation({ configPath: loaded.configPath, baseDir: loaded.baseDir, nextConfig, json: options.json, action: 'rule.set', path: dottedPath });
  });

rule
  .command('diff <path>')
  .option('--json')
  .action((dottedPath, options) => {
    if (!dottedPath.startsWith('rules.')) throw new Error('rule path must start with rules.');
    const loaded = loadConfig();
    printValue(diffValues(getValueAtPath(loaded.config, dottedPath), getValueAtPath(defaultConfig, dottedPath)), true);
  });

rule
  .command('reset')
  .requiredOption('--path <path>')
  .option('--yes')
  .option('--json')
  .action((options) => {
    if (!options.path.startsWith('rules.')) throw new Error('rule path must start with rules.');
    requireYes(options.yes, 'reset rule config');
    const loaded = loadConfig();
    const nextConfig = resetValueAtPath(loaded.config, options.path);
    persistConfigMutation({ configPath: loaded.configPath, baseDir: loaded.baseDir, nextConfig, json: options.json, action: 'rule.reset', path: options.path });
  });

// ─── template ───────────────────────────────────────────────────────────────

template
  .command('list')
  .option('--json')
  .action((options) => {
    const loaded = loadConfig();
    printValue(Object.keys(loaded.config.templates).map((name) => ({ name, path: `templates.${name}` })), true);
  });

template
  .command('get <name>')
  .option('--json')
  .action((name, options) => {
    const loaded = loadConfig();
    printValue(getValueAtPath(loaded.config, `templates.${name}`) ?? null, true);
  });

template
  .command('set <name>')
  .requiredOption('--body <body>')
  .option('--format <format>', 'markdown|text')
  .option('--version <version>')
  .option('--placeholders <jsonArray>')
  .option('--json')
  .action((name, options) => {
    const loaded = loadConfig();
    const current = getValueAtPath(loaded.config, `templates.${name}`) as Record<string, unknown> | undefined;
    if (!current) throw new Error(`template not found: ${name}`);
    const nextTemplate = {
      ...current,
      body: options.body,
      ...(options.format ? { format: options.format } : {}),
      ...(options.version ? { version: Number(options.version) } : {}),
      ...(options.placeholders ? { placeholders: parseConfigInput(options.placeholders) } : {}),
    };
    const nextConfig = setValueAtPath(loaded.config as unknown as Record<string, unknown>, `templates.${name}`, nextTemplate) as unknown as ZigrixConfig;
    persistConfigMutation({ configPath: loaded.configPath, baseDir: loaded.baseDir, nextConfig, json: options.json, action: 'template.set', path: `templates.${name}` });
  });

template
  .command('diff <name>')
  .option('--json')
  .action((name, options) => {
    const loaded = loadConfig();
    printValue(diffValues(getValueAtPath(loaded.config, `templates.${name}`), getValueAtPath(defaultConfig, `templates.${name}`)), true);
  });

template
  .command('reset <name>')
  .option('--yes')
  .option('--json')
  .action((name, options) => {
    requireYes(options.yes, 'reset template config');
    const loaded = loadConfig();
    const nextConfig = resetValueAtPath(loaded.config, `templates.${name}`);
    persistConfigMutation({ configPath: loaded.configPath, baseDir: loaded.baseDir, nextConfig, json: options.json, action: 'template.reset', path: `templates.${name}` });
  });

template
  .command('render <name>')
  .requiredOption('--context <json>')
  .option('--json')
  .action((name, options) => {
    const loaded = loadConfig();
    const item = getValueAtPath(loaded.config, `templates.${name}`) as { body?: string } | undefined;
    if (!item?.body) throw new Error(`template not found: ${name}`);
    printValue({ ok: true, name, rendered: renderTemplate(name as TemplateKind, item.body, JSON.parse(options.context) as Record<string, unknown>) }, true);
  });

// ─── reset ──────────────────────────────────────────────────────────────────

reset
  .command('config')
  .option('--path <path>', 'dotted config path to restore from defaults', 'all')
  .option('--yes')
  .option('--json')
  .action((options) => {
    requireYes(options.yes, 'reset config');
    const loaded = loadConfig();
    const nextConfig = resetValueAtPath(loaded.config, options.path);
    persistConfigMutation({ configPath: loaded.configPath, baseDir: loaded.baseDir, nextConfig, json: options.json, action: 'reset.config', path: options.path });
  });

reset
  .command('state')
  .option('--yes')
  .option('--json')
  .action((options) => {
    requireYes(options.yes, 'reset runtime state');
    const loaded = loadRuntime();
    // Remove task data but preserve config and rules
    for (const dir of [loaded.paths.tasksDir, loaded.paths.evidenceDir, loaded.paths.promptsDir, loaded.paths.runsDir]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.rmSync(loaded.paths.eventsFile, { force: true });
    fs.rmSync(loaded.paths.indexFile, { force: true });
    ensureBaseState(loaded.paths);
    const index = rebuildIndex(loaded.paths);
    printValue({ ok: true, action: 'reset.state', baseDir: loaded.paths.baseDir, index }, true);
  });

// ─── state ──────────────────────────────────────────────────────────────────

state
  .command('check')
  .option('--json')
  .action((options) => {
    const loaded = loadRuntime();
    printValue(verifyState(loaded.paths), true);
  });

program
  .command('index-rebuild')
  .option('--json')
  .action((options) => {
    const loaded = loadRuntime();
    printValue(rebuildIndex(loaded.paths), true);
  });

// ─── task ───────────────────────────────────────────────────────────────────

task
  .command('dispatch')
  .description('Create a task with full orchestration metadata and boot prompt')
  .requiredOption('--title <title>')
  .requiredOption('--description <description>')
  .requiredOption('--scale <scale>', 'simple|normal|risky|large')
  .option('--project-dir <path>', 'target project directory')
  .option('--requested-by <name>', 'who requested this task')
  .option('--constraints <constraints>', 'task constraints')
  .option('--json')
  .action((options) => {
    const loaded = loadRuntime();
    const result = dispatchTask(loaded.paths, loaded.config, {
      title: options.title,
      description: options.description,
      scale: options.scale,
      projectDir: options.projectDir,
      requestedBy: options.requestedBy,
      constraints: options.constraints,
    });
    printValue(result, true);
  });

task
  .command('create')
  .requiredOption('--title <title>')
  .requiredOption('--description <description>')
  .option('--scale <scale>', 'simple|normal|risky|large', 'normal')
  .option('--required-agent <agent>', 'repeatable', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--project-dir <path>', 'target project directory for this task')
  .option('--requested-by <name>', 'who requested this task')
  .option('--prefix <prefix>', 'task ID prefix (DEV|TEST)', 'DEV')
  .option('--json')
  .action((options) => {
    const loaded = loadRuntime();
    const projectDir = options.projectDir
      ? resolveAbsolutePath(options.projectDir)
      : resolveConfiguredProjectDir(loaded.config);
    const created = createTask(loaded.paths, {
      title: options.title,
      description: options.description,
      scale: options.scale,
      requiredAgents: options.requiredAgent,
      projectDir,
      requestedBy: options.requestedBy,
      prefix: options.prefix,
    });
    printValue({
      ...created,
      ...resolveTaskPaths(loaded.paths, created.taskId),
    }, true);
  });

task
  .command('list')
  .option('--json')
  .action((options) => printValue(listTasks(loadRuntime().paths), true));

task
  .command('status <taskId>')
  .option('--json')
  .action((taskId, options) => {
    const loaded = loadRuntime();
    const payload = loadTask(loaded.paths, taskId);
    if (!payload) throw new Error(`task not found: ${taskId}`);
    printValue({
      ...payload,
      ...resolveTaskPaths(loaded.paths, taskId),
    }, true);
  });

task
  .command('events [taskId]')
  .option('--json')
  .action((taskId, options) => printValue(listTaskEvents(loadRuntime().paths, taskId), true));

task
  .command('progress')
  .requiredOption('--task-id <taskId>')
  .requiredOption('--actor <actor>')
  .requiredOption('--message <message>')
  .option('--unit-id <unitId>')
  .option('--work-package <workPackage>')
  .option('--json')
  .action((options) => {
    const payload = recordTaskProgress(loadRuntime().paths, { taskId: options.taskId, actor: options.actor, message: options.message, unitId: options.unitId, workPackage: options.workPackage });
    if (!payload) throw new Error(`task not found: ${options.taskId}`);
    printValue(payload, true);
  });

task
  .command('stale')
  .option('--hours <hours>', 'stale threshold hours', '24')
  .option('--apply')
  .option('--reason <reason>', 'block reason', 'stale_timeout')
  .option('--json')
  .action((options) => {
    const loaded = loadRuntime();
    const hours = Number(options.hours);
    const agentsStateDir = resolveAgentsStateDir(loaded.config);
    const preview = findStaleTasks(loaded.paths, hours, { agentsStateDir, fallbackReason: options.reason });
    const payload = options.apply
      ? applyStalePolicy(loaded.paths, hours, options.reason, { agentsStateDir })
      : { ok: true, hours, requestedReason: options.reason, count: preview.length, tasks: preview };
    printValue(payload, true);
  });

for (const [name, status] of Object.entries(STATUS_MAP)) {
  task
    .command(`${name} <taskId>`)
    .option('--json')
    .action((taskId, options) => {
      const payload = updateTaskStatus(loadRuntime().paths, taskId, status);
      if (!payload) throw new Error(`task not found: ${taskId}`);
      printValue(payload, true);
    });
}

task
  .command('finalize <taskId>')
  .description('Finalize a task: merge evidence, check units, and auto-report by default')
  .option('--no-auto-report', 'skip auto-transition to REPORTED (default: auto-report enabled)')
  .option('--sec-issues', 'flag security issues (blocks auto-report)')
  .option('--qa-issues', 'flag QA issues (blocks auto-report)')
  .option('--json')
  .action((taskId, options) => {
    const loaded = loadRuntime();
    const result = finalizeTask(loaded.paths, {
      taskId,
      autoReport: options.autoReport !== false,
      secIssues: Boolean(options.secIssues),
      qaIssues: Boolean(options.qaIssues),
    });
    if (!result) throw new Error(`task not found: ${taskId}`);
    printValue(result, true);
  });

// ─── worker ─────────────────────────────────────────────────────────────────

worker
  .command('prepare')
  .requiredOption('--task-id <taskId>')
  .requiredOption('--agent-id <agentId>')
  .requiredOption('--description <description>')
  .option('--constraints <constraints>')
  .option('--unit-id <unitId>')
  .option('--work-package <workPackage>')
  .option('--dod <dod>')
  .option('--project-dir <path>', 'working directory for this worker')
  .option('--json')
  .action((options) => {
    const payload = prepareWorker(loadRuntime().paths, { taskId: options.taskId, agentId: options.agentId, description: options.description, constraints: options.constraints, unitId: options.unitId, workPackage: options.workPackage, dod: options.dod, projectDir: options.projectDir });
    if (!payload) throw new Error(`task not found: ${options.taskId}`);
    printValue(payload, true);
  });

worker
  .command('register')
  .requiredOption('--task-id <taskId>')
  .requiredOption('--agent-id <agentId>')
  .requiredOption('--session-key <sessionKey>')
  .option('--run-id <runId>')
  .option('--session-id <sessionId>')
  .option('--unit-id <unitId>')
  .option('--work-package <workPackage>')
  .option('--reason <reason>')
  .option('--json')
  .action((options) => {
    const payload = registerWorker(loadRuntime().paths, { taskId: options.taskId, agentId: options.agentId, sessionKey: options.sessionKey, runId: options.runId, sessionId: options.sessionId, unitId: options.unitId, workPackage: options.workPackage, reason: options.reason });
    if (!payload) throw new Error(`task not found: ${options.taskId}`);
    printValue(payload, true);
  });

worker
  .command('complete')
  .requiredOption('--task-id <taskId>')
  .requiredOption('--agent-id <agentId>')
  .requiredOption('--session-key <sessionKey>')
  .requiredOption('--run-id <runId>')
  .option('--session-id <sessionId>')
  .option('--result <result>', 'done|blocked|skipped', 'done')
  .option('--unit-id <unitId>')
  .option('--work-package <workPackage>')
  .option('--json')
  .action((options) => {
    const payload = completeWorker(loadRuntime().paths, { taskId: options.taskId, agentId: options.agentId, sessionKey: options.sessionKey, runId: options.runId, sessionId: options.sessionId, result: options.result, unitId: options.unitId, workPackage: options.workPackage });
    if (!payload) throw new Error(`task not found: ${options.taskId}`);
    printValue(payload, true);
  });

// ─── evidence ───────────────────────────────────────────────────────────────

evidence
  .command('collect')
  .requiredOption('--task-id <taskId>')
  .requiredOption('--agent-id <agentId>')
  .option('--run-id <runId>')
  .option('--unit-id <unitId>')
  .option('--session-key <sessionKey>')
  .option('--session-id <sessionId>')
  .option('--transcript <transcript>')
  .option('--summary <summary>')
  .option('--tool-result <toolResult>', 'repeatable', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--notes <notes>')
  .option('--dod-item <dodItem>', 'repeatable', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--test-case <testCase>', 'repeatable', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--verification-map <mapping>', 'repeatable dod=test mapping', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--limit <limit>', 'transcript line limit', '40')
  .option('--json')
  .action((options) => {
    const payload = collectEvidence(loadRuntime().paths, {
      taskId: options.taskId,
      agentId: options.agentId,
      runId: options.runId,
      unitId: options.unitId,
      sessionKey: options.sessionKey,
      sessionId: options.sessionId,
      transcript: options.transcript,
      summary: options.summary,
      toolResults: options.toolResult,
      notes: options.notes,
      dodItems: options.dodItem,
      testCases: options.testCase,
      verificationMappings: (options.verificationMap ?? []).map((item: string) => parseVerificationMap(item)),
      limit: Number(options.limit),
    });
    if (!payload) throw new Error(`task not found: ${options.taskId}`);
    printValue(payload, true);
  });

evidence
  .command('merge')
  .requiredOption('--task-id <taskId>')
  .option('--required-agent <agent>', 'repeatable', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--require-qa')
  .option('--json')
  .action((options) => {
    const payload = mergeEvidence(loadRuntime().paths, { taskId: options.taskId, requiredAgents: options.requiredAgent, requireQa: Boolean(options.requireQa) });
    if (!payload) throw new Error(`task not found: ${options.taskId}`);
    printValue(payload, true);
  });

// ─── report ─────────────────────────────────────────────────────────────────

report
  .command('render')
  .requiredOption('--task-id <taskId>')
  .option('--record-events')
  .option('--json')
  .action((options) => {
    const payload = renderReport(loadRuntime().paths, { taskId: options.taskId, recordEvents: Boolean(options.recordEvents) });
    if (!payload) throw new Error(`task not found: ${options.taskId}`);
    printValue(payload, true);
  });

// ─── pipeline ───────────────────────────────────────────────────────────────

pipeline
  .command('run')
  .requiredOption('--title <title>')
  .requiredOption('--description <description>')
  .option('--scale <scale>', 'simple|normal|risky|large', 'normal')
  .option('--required-agent <agent>', 'repeatable', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--evidence-summary <agentEqSummary>', 'repeatable', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--verification-map <agentEqDodEqTest>', 'repeatable agentId=dod=test', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--require-qa')
  .option('--auto-report')
  .option('--record-feedback')
  .option('--json')
  .action((options) => {
    const payload = runPipeline(loadRuntime().paths, {
      title: options.title,
      description: options.description,
      scale: options.scale,
      requiredAgents: options.requiredAgent,
      evidenceSummaries: options.evidenceSummary,
      verificationMappings: options.verificationMap,
      requireQa: Boolean(options.requireQa),
      autoReport: Boolean(options.autoReport),
      recordFeedback: Boolean(options.recordFeedback),
    });
    printValue(payload, true);
  });

// ─── run / inspect ──────────────────────────────────────────────────────────

program
  .command('run <workflowPath>')
  .description('Run a minimal sequential workflow file')
  .option('--json')
  .action(async (workflowPath, options) => {
    const loaded = loadConfig();
    const result = await runWorkflow({ config: loaded.config, workflowPath });
    if (options.json) {
      printValue({ ...result.record, savedPath: result.savedPath }, true);
      return;
    }
    console.log(summarizeRun(result.record));
    console.log(`saved: ${result.savedPath}`);
  });

program
  .command('inspect <runIdOrPath>')
  .description('Inspect a saved run record')
  .option('--json')
  .action((runIdOrPath, options) => {
    const loaded = loadConfig();
    printValue(loadRunRecord(loaded.config, runIdOrPath), true);
  });

// ─── dashboard ──────────────────────────────────────────────────────────────

program
  .command('dashboard')
  .description('Start the zigrix web dashboard (Next.js) in the foreground')
  .option('--port <n>', `TCP port to listen on (default: ${DASHBOARD_DEFAULT_PORT})`, String(DASHBOARD_DEFAULT_PORT))
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`Invalid port: ${options.port}`);
      process.exitCode = 1;
      return;
    }
    await runDashboard({ port });
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
