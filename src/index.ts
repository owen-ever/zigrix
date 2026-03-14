#!/usr/bin/env node
import fs from 'node:fs';

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
import { diffValues, getValueAtPath, parseConfigInput, resetValueAtPath, setValueAtPath } from './config/mutate.js';
import { defaultConfig } from './config/defaults.js';
import { getConfigValue, loadConfig, writeConfigFile, writeDefaultConfig } from './config/load.js';
import type { ZigrixConfig } from './config/schema.js';
import { zigrixConfigJsonSchema } from './config/schema.js';
import { gatherDoctor, renderDoctorText } from './doctor.js';
import { collectEvidence, mergeEvidence } from './orchestration/evidence.js';
import { runPipeline } from './orchestration/pipeline.js';
import { renderReport } from './orchestration/report.js';
import { completeWorker, prepareWorker, registerWorker } from './orchestration/worker.js';
import { listRules, renderTemplate, validateRules, type TemplateKind } from './rules/templates.js';
import { runWorkflow, summarizeRun } from './runner/run.js';
import { loadRunRecord } from './runner/store.js';
import { ensureProjectState, resolvePaths } from './state/paths.js';
import {
  applyStalePolicy,
  createTask,
  findStaleTasks,
  listTaskEvents,
  listTasks,
  loadTask,
  rebuildIndex,
  recordTaskProgress,
  updateTaskStatus,
} from './state/tasks.js';

const STATUS_MAP: Record<string, string> = {
  start: 'IN_PROGRESS',
  finalize: 'DONE_PENDING_REPORT',
  report: 'REPORTED',
};

function printValue(value: unknown, json = false): void {
  if (json || typeof value !== 'string') {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(value);
}

function requireConfigPath(configPath: string | null, projectRoot: string): string {
  if (!configPath) {
    throw new Error(`zigrix config not found under ${projectRoot}; run 'zigrix init --yes' first`);
  }
  return configPath;
}

function persistAndPrintMutation(params: {
  configPath: string | null;
  projectRoot: string;
  nextConfig: ZigrixConfig;
  json?: boolean;
  action: string;
  agentId: string;
}): void {
  const targetPath = requireConfigPath(params.configPath, params.projectRoot);
  writeConfigFile(targetPath, params.nextConfig);
  printValue({ ok: true, action: params.action, agentId: params.agentId, configPath: targetPath }, params.json);
}

function persistConfigMutation(params: {
  configPath: string | null;
  projectRoot: string;
  nextConfig: ZigrixConfig;
  json?: boolean;
  action: string;
  path?: string;
}): void {
  const targetPath = requireConfigPath(params.configPath, params.projectRoot);
  writeConfigFile(targetPath, params.nextConfig);
  printValue({ ok: true, action: params.action, path: params.path ?? null, configPath: targetPath }, params.json);
}

function requireYes(yes?: boolean, action = 'perform this action'): void {
  if (!yes) {
    throw new Error(`refusing to ${action} without --yes`);
  }
}

function loadRuntime(options: { projectRoot?: string; config?: string }) {
  const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
  return { ...loaded, paths: resolvePaths(loaded.projectRoot, loaded.config) };
}

const program = new Command();
program
  .name('zigrix')
  .description('Zigrix Node/TypeScript orchestration CLI')
  .version('0.1.0-alpha.0');

const config = program.command('config').description('Inspect Zigrix config');
const agent = program.command('agent').description('Manage Zigrix agent registry and orchestration membership');
const rule = program.command('rule').description('Inspect and validate rule assets');
const template = program.command('template').description('Inspect and modify prompt templates');
const reset = program.command('reset').description('Restore default config sections or clean runtime state');
const task = program.command('task').description('Task operations');
const worker = program.command('worker').description('Worker lifecycle operations');
const evidence = program.command('evidence').description('Evidence collection and merge operations');
const report = program.command('report').description('User-facing reporting helpers');
const pipeline = program.command('pipeline').description('High-level orchestration helpers');

config
  .command('validate')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    printValue({ ok: true, configPath: loaded.configPath, projectRoot: loaded.projectRoot }, options.json);
  });

config
  .command('get [path]')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((dottedPath, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
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
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((dottedPath, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const nextConfig = setValueAtPath(loaded.config as unknown as Record<string, unknown>, dottedPath, parseConfigInput(options.value)) as unknown as ZigrixConfig;
    persistConfigMutation({
      configPath: loaded.configPath,
      projectRoot: loaded.projectRoot,
      nextConfig,
      json: options.json,
      action: 'config.set',
      path: dottedPath,
    });
  });

config
  .command('diff <path>')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((dottedPath, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    printValue(diffValues(getValueAtPath(loaded.config, dottedPath), getValueAtPath(defaultConfig, dottedPath)), true);
  });

config
  .command('reset')
  .option('--path <path>', 'dotted config path to restore from defaults', 'all')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--yes', 'confirm destructive reset')
  .option('--json', 'JSON output')
  .action((options) => {
    requireYes(options.yes, 'reset config');
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const nextConfig = resetValueAtPath(loaded.config, options.path);
    persistConfigMutation({
      configPath: loaded.configPath,
      projectRoot: loaded.projectRoot,
      nextConfig,
      json: options.json,
      action: 'config.reset',
      path: options.path,
    });
  });

program
  .command('init')
  .description('Write default zigrix.config.json')
  .option('--project-root <path>', 'target project root', '.')
  .option('--force', 'overwrite existing config')
  .option('--yes', 'non-interactive confirmation')
  .option('--json', 'JSON output')
  .action((options) => {
    requireYes(options.yes, 'initialize Zigrix');
    const targetPath = writeDefaultConfig(options.projectRoot, Boolean(options.force));
    const loaded = loadRuntime({ projectRoot: options.projectRoot, config: targetPath });
    rebuildIndex(loaded.paths);
    printValue({ ok: true, path: targetPath, projectState: loaded.paths.projectState }, options.json);
  });

program
  .command('doctor')
  .description('Inspect environment, config, and runtime readiness')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const loaded = loadRuntime({ projectRoot: options.projectRoot, config: options.config });
    const payload = gatherDoctor(loaded, loaded.paths);
    if (options.json) {
      printValue(payload, true);
      return;
    }
    console.log(renderDoctorText(payload));
  });

agent
  .command('list')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => printValue(listAgents(loadConfig({ projectRoot: options.projectRoot, configPath: options.config }).config), true));

agent
  .command('add')
  .requiredOption('--id <agentId>')
  .requiredOption('--role <role>')
  .requiredOption('--runtime <runtime>')
  .option('--label <label>')
  .option('--include')
  .option('--disabled')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = addAgent(loaded.config, { id: options.id, role: options.role, runtime: options.runtime, label: options.label, enabled: !options.disabled, include: Boolean(options.include) });
    persistAndPrintMutation({ configPath: loaded.configPath, projectRoot: loaded.projectRoot, nextConfig: result.config, json: options.json, action: 'agent.add', agentId: result.agentId });
  });

agent
  .command('remove <agentId>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((agentId, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = removeAgent(loaded.config, agentId);
    persistAndPrintMutation({ configPath: loaded.configPath, projectRoot: loaded.projectRoot, nextConfig: result.config, json: options.json, action: 'agent.remove', agentId: result.agentId });
  });

agent
  .command('include <agentId>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((agentId, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = includeAgent(loaded.config, agentId);
    persistAndPrintMutation({ configPath: loaded.configPath, projectRoot: loaded.projectRoot, nextConfig: result.config, json: options.json, action: 'agent.include', agentId: result.agentId });
  });

agent
  .command('exclude <agentId>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((agentId, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = excludeAgent(loaded.config, agentId);
    persistAndPrintMutation({ configPath: loaded.configPath, projectRoot: loaded.projectRoot, nextConfig: result.config, json: options.json, action: 'agent.exclude', agentId: result.agentId });
  });

agent
  .command('enable <agentId>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((agentId, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = setAgentEnabled(loaded.config, agentId, true);
    persistAndPrintMutation({ configPath: loaded.configPath, projectRoot: loaded.projectRoot, nextConfig: result.config, json: options.json, action: 'agent.enable', agentId: result.agentId });
  });

agent
  .command('disable <agentId>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((agentId, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = setAgentEnabled(loaded.config, agentId, false);
    persistAndPrintMutation({ configPath: loaded.configPath, projectRoot: loaded.projectRoot, nextConfig: result.config, json: options.json, action: 'agent.disable', agentId: result.agentId });
  });

agent
  .command('set-role <agentId>')
  .requiredOption('--role <role>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((agentId, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = setAgentRole(loaded.config, agentId, options.role);
    persistAndPrintMutation({ configPath: loaded.configPath, projectRoot: loaded.projectRoot, nextConfig: result.config, json: options.json, action: 'agent.set-role', agentId: result.agentId });
  });

rule
  .command('list')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => printValue(listRules(loadConfig({ projectRoot: options.projectRoot, configPath: options.config }).config), true));

rule
  .command('get <path>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((dottedPath, options) => printValue(getConfigValue(loadConfig({ projectRoot: options.projectRoot, configPath: options.config }).config, dottedPath) ?? null, true));

rule
  .command('validate')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => printValue(validateRules(loadConfig({ projectRoot: options.projectRoot, configPath: options.config }).config), true));

rule
  .command('render <templateKind>')
  .requiredOption('--context <json>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((templateKind: string, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const template = getConfigValue(loaded.config, `templates.${templateKind}`) as { body?: string } | undefined;
    if (!template?.body) throw new Error(`template not found: ${templateKind}`);
    const rendered = renderTemplate(templateKind as TemplateKind, template.body, JSON.parse(options.context) as Record<string, unknown>);
    printValue({ ok: true, templateKind, rendered }, true);
  });

rule
  .command('set <path>')
  .requiredOption('--value <jsonOrString>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((dottedPath, options) => {
    if (!dottedPath.startsWith('rules.')) throw new Error('rule path must start with rules.');
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const nextConfig = setValueAtPath(loaded.config as unknown as Record<string, unknown>, dottedPath, parseConfigInput(options.value)) as unknown as ZigrixConfig;
    persistConfigMutation({ configPath: loaded.configPath, projectRoot: loaded.projectRoot, nextConfig, json: options.json, action: 'rule.set', path: dottedPath });
  });

rule
  .command('diff <path>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((dottedPath, options) => {
    if (!dottedPath.startsWith('rules.')) throw new Error('rule path must start with rules.');
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    printValue(diffValues(getValueAtPath(loaded.config, dottedPath), getValueAtPath(defaultConfig, dottedPath)), true);
  });

rule
  .command('reset')
  .requiredOption('--path <path>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--yes')
  .option('--json')
  .action((options) => {
    if (!options.path.startsWith('rules.')) throw new Error('rule path must start with rules.');
    requireYes(options.yes, 'reset rule config');
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const nextConfig = resetValueAtPath(loaded.config, options.path);
    persistConfigMutation({ configPath: loaded.configPath, projectRoot: loaded.projectRoot, nextConfig, json: options.json, action: 'rule.reset', path: options.path });
  });

template
  .command('list')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    printValue(Object.keys(loaded.config.templates).map((name) => ({ name, path: `templates.${name}` })), true);
  });

template
  .command('get <name>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((name, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    printValue(getValueAtPath(loaded.config, `templates.${name}`) ?? null, true);
  });

template
  .command('set <name>')
  .requiredOption('--body <body>')
  .option('--format <format>', 'markdown|text')
  .option('--version <version>')
  .option('--placeholders <jsonArray>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((name, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
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
    persistConfigMutation({ configPath: loaded.configPath, projectRoot: loaded.projectRoot, nextConfig, json: options.json, action: 'template.set', path: `templates.${name}` });
  });

template
  .command('diff <name>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((name, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    printValue(diffValues(getValueAtPath(loaded.config, `templates.${name}`), getValueAtPath(defaultConfig, `templates.${name}`)), true);
  });

template
  .command('reset <name>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--yes')
  .option('--json')
  .action((name, options) => {
    requireYes(options.yes, 'reset template config');
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const nextConfig = resetValueAtPath(loaded.config, `templates.${name}`);
    persistConfigMutation({ configPath: loaded.configPath, projectRoot: loaded.projectRoot, nextConfig, json: options.json, action: 'template.reset', path: `templates.${name}` });
  });

template
  .command('render <name>')
  .requiredOption('--context <json>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((name, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const item = getValueAtPath(loaded.config, `templates.${name}`) as { body?: string } | undefined;
    if (!item?.body) throw new Error(`template not found: ${name}`);
    printValue({ ok: true, name, rendered: renderTemplate(name as TemplateKind, item.body, JSON.parse(options.context) as Record<string, unknown>) }, true);
  });

reset
  .command('config')
  .option('--path <path>', 'dotted config path to restore from defaults', 'all')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--yes')
  .option('--json')
  .action((options) => {
    requireYes(options.yes, 'reset config');
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const nextConfig = resetValueAtPath(loaded.config, options.path);
    persistConfigMutation({ configPath: loaded.configPath, projectRoot: loaded.projectRoot, nextConfig, json: options.json, action: 'reset.config', path: options.path });
  });

reset
  .command('state')
  .option('--project-root <path>')
  .option('--config <path>')
  .option('--yes')
  .option('--json')
  .action((options) => {
    requireYes(options.yes, 'reset runtime state');
    const loaded = loadRuntime({ projectRoot: options.projectRoot, config: options.config });
    fs.rmSync(loaded.paths.projectState, { recursive: true, force: true });
    ensureProjectState(loaded.paths);
    const index = rebuildIndex(loaded.paths);
    printValue({ ok: true, action: 'reset.state', projectState: loaded.paths.projectState, index }, true);
  });

program
  .command('index-rebuild')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const loaded = loadRuntime({ projectRoot: options.projectRoot, config: options.config });
    printValue(rebuildIndex(loaded.paths), true);
  });

task
  .command('create')
  .requiredOption('--title <title>')
  .requiredOption('--description <description>')
  .option('--scale <scale>', 'simple|normal|risky|large', 'normal')
  .option('--required-agent <agent>', 'repeatable', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const loaded = loadRuntime({ projectRoot: options.projectRoot, config: options.config });
    const created = createTask(loaded.paths, { title: options.title, description: options.description, scale: options.scale, requiredAgents: options.requiredAgent });
    printValue(created, true);
  });

task
  .command('list')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => printValue(listTasks(loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths), true));

task
  .command('status <taskId>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((taskId, options) => {
    const payload = loadTask(loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths, taskId);
    if (!payload) throw new Error(`task not found: ${taskId}`);
    printValue(payload, true);
  });

task
  .command('events [taskId]')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((taskId, options) => printValue(listTaskEvents(loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths, taskId), true));

task
  .command('progress')
  .requiredOption('--task-id <taskId>')
  .requiredOption('--actor <actor>')
  .requiredOption('--message <message>')
  .option('--unit-id <unitId>')
  .option('--work-package <workPackage>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const payload = recordTaskProgress(loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths, { taskId: options.taskId, actor: options.actor, message: options.message, unitId: options.unitId, workPackage: options.workPackage });
    if (!payload) throw new Error(`task not found: ${options.taskId}`);
    printValue(payload, true);
  });

task
  .command('stale')
  .option('--hours <hours>', 'stale threshold hours', '24')
  .option('--apply')
  .option('--reason <reason>', 'block reason', 'stale_timeout')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const paths = loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths;
    const hours = Number(options.hours);
    const payload = options.apply ? applyStalePolicy(paths, hours, options.reason) : { ok: true, hours, count: findStaleTasks(paths, hours).length, tasks: findStaleTasks(paths, hours) };
    printValue(payload, true);
  });

for (const [name, status] of Object.entries(STATUS_MAP)) {
  task
    .command(`${name} <taskId>`)
    .option('--config <path>')
    .option('--project-root <path>')
    .option('--json')
    .action((taskId, options) => {
      const payload = updateTaskStatus(loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths, taskId, status);
      if (!payload) throw new Error(`task not found: ${taskId}`);
      printValue(payload, true);
    });
}

worker
  .command('prepare')
  .requiredOption('--task-id <taskId>')
  .requiredOption('--agent-id <agentId>')
  .requiredOption('--description <description>')
  .option('--constraints <constraints>')
  .option('--unit-id <unitId>')
  .option('--work-package <workPackage>')
  .option('--dod <dod>')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const payload = prepareWorker(loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths, { taskId: options.taskId, agentId: options.agentId, description: options.description, constraints: options.constraints, unitId: options.unitId, workPackage: options.workPackage, dod: options.dod });
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
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const payload = registerWorker(loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths, { taskId: options.taskId, agentId: options.agentId, sessionKey: options.sessionKey, runId: options.runId, sessionId: options.sessionId, unitId: options.unitId, workPackage: options.workPackage, reason: options.reason });
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
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const payload = completeWorker(loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths, { taskId: options.taskId, agentId: options.agentId, sessionKey: options.sessionKey, runId: options.runId, sessionId: options.sessionId, result: options.result, unitId: options.unitId, workPackage: options.workPackage });
    if (!payload) throw new Error(`task not found: ${options.taskId}`);
    printValue(payload, true);
  });

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
  .option('--limit <limit>', 'transcript line limit', '40')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const payload = collectEvidence(loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths, { taskId: options.taskId, agentId: options.agentId, runId: options.runId, unitId: options.unitId, sessionKey: options.sessionKey, sessionId: options.sessionId, transcript: options.transcript, summary: options.summary, toolResults: options.toolResult, notes: options.notes, limit: Number(options.limit) });
    if (!payload) throw new Error(`task not found: ${options.taskId}`);
    printValue(payload, true);
  });

evidence
  .command('merge')
  .requiredOption('--task-id <taskId>')
  .option('--required-agent <agent>', 'repeatable', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--require-qa')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const payload = mergeEvidence(loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths, { taskId: options.taskId, requiredAgents: options.requiredAgent, requireQa: Boolean(options.requireQa) });
    if (!payload) throw new Error(`task not found: ${options.taskId}`);
    printValue(payload, true);
  });

report
  .command('render')
  .requiredOption('--task-id <taskId>')
  .option('--record-events')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const payload = renderReport(loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths, { taskId: options.taskId, recordEvents: Boolean(options.recordEvents) });
    if (!payload) throw new Error(`task not found: ${options.taskId}`);
    printValue(payload, true);
  });

pipeline
  .command('run')
  .requiredOption('--title <title>')
  .requiredOption('--description <description>')
  .option('--scale <scale>', 'simple|normal|risky|large', 'normal')
  .option('--required-agent <agent>', 'repeatable', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--evidence-summary <agentEqSummary>', 'repeatable', (value: string, prev: string[] = []) => [...prev, value], [])
  .option('--require-qa')
  .option('--auto-report')
  .option('--record-feedback')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((options) => {
    const payload = runPipeline(loadRuntime({ projectRoot: options.projectRoot, config: options.config }).paths, { title: options.title, description: options.description, scale: options.scale, requiredAgents: options.requiredAgent, evidenceSummaries: options.evidenceSummary, requireQa: Boolean(options.requireQa), autoReport: Boolean(options.autoReport), recordFeedback: Boolean(options.recordFeedback) });
    printValue(payload, true);
  });

program
  .command('run <workflowPath>')
  .description('Run a minimal sequential workflow file')
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action(async (workflowPath, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = await runWorkflow({ projectRoot: loaded.projectRoot, config: loaded.config, workflowPath });
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
  .option('--config <path>')
  .option('--project-root <path>')
  .option('--json')
  .action((runIdOrPath, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    printValue(loadRunRecord(loaded.projectRoot, loaded.config, runIdOrPath), true);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
