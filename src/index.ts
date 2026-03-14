#!/usr/bin/env node
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
import { getConfigValue, loadConfig, writeConfigFile, writeDefaultConfig } from './config/load.js';
import { zigrixConfigJsonSchema } from './config/schema.js';
import { listRules, renderTemplate, validateRules } from './rules/templates.js';
import { runWorkflow, summarizeRun } from './runner/run.js';
import { loadRunRecord } from './runner/store.js';

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
  nextConfig: Parameters<typeof writeConfigFile>[1];
  json?: boolean;
  action: string;
  agentId: string;
}): void {
  const targetPath = requireConfigPath(params.configPath, params.projectRoot);
  writeConfigFile(targetPath, params.nextConfig);
  printValue({ ok: true, action: params.action, agentId: params.agentId, configPath: targetPath }, params.json);
}

const program = new Command();
program
  .name('zigrix')
  .description('Zigrix Node/TypeScript orchestration CLI')
  .version('0.1.0-alpha.0');

const config = program.command('config').description('Inspect Zigrix config');

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
    const value = getConfigValue(loaded.config, dottedPath);
    printValue(value ?? null, options.json);
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

program
  .command('init')
  .description('Write default zigrix.config.json')
  .option('--project-root <path>', 'target project root', '.')
  .option('--force', 'overwrite existing config')
  .option('--yes', 'non-interactive confirmation')
  .option('--json', 'JSON output')
  .action((options) => {
    if (!options.yes) {
      throw new Error('interactive init not implemented yet; use --yes for bootstrap mode');
    }
    const targetPath = writeDefaultConfig(options.projectRoot, Boolean(options.force));
    printValue({ ok: true, path: targetPath }, options.json);
  });

const agent = program.command('agent').description('Manage Zigrix agent registry and orchestration membership');
const rule = program.command('rule').description('Inspect and validate rule/template assets');

agent
  .command('list')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const agents = listAgents(loaded.config);
    printValue(agents, true);
  });

agent
  .command('add')
  .requiredOption('--id <agentId>', 'agent id / registry key')
  .requiredOption('--role <role>', 'agent role')
  .requiredOption('--runtime <runtime>', 'agent runtime type')
  .option('--label <label>', 'display label')
  .option('--include', 'also add agent to active participants')
  .option('--disabled', 'create the agent in disabled state')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = addAgent(loaded.config, {
      id: options.id,
      role: options.role,
      runtime: options.runtime,
      label: options.label,
      enabled: !options.disabled,
      include: Boolean(options.include),
    });
    persistAndPrintMutation({
      configPath: loaded.configPath,
      projectRoot: loaded.projectRoot,
      nextConfig: result.config,
      json: options.json,
      action: 'agent.add',
      agentId: result.agentId,
    });
  });

agent
  .command('remove')
  .argument('<agentId>', 'agent id')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((agentId, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = removeAgent(loaded.config, agentId);
    persistAndPrintMutation({
      configPath: loaded.configPath,
      projectRoot: loaded.projectRoot,
      nextConfig: result.config,
      json: options.json,
      action: 'agent.remove',
      agentId: result.agentId,
    });
  });

agent
  .command('include')
  .argument('<agentId>', 'agent id')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((agentId, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = includeAgent(loaded.config, agentId);
    persistAndPrintMutation({
      configPath: loaded.configPath,
      projectRoot: loaded.projectRoot,
      nextConfig: result.config,
      json: options.json,
      action: 'agent.include',
      agentId: result.agentId,
    });
  });

agent
  .command('exclude')
  .argument('<agentId>', 'agent id')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((agentId, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = excludeAgent(loaded.config, agentId);
    persistAndPrintMutation({
      configPath: loaded.configPath,
      projectRoot: loaded.projectRoot,
      nextConfig: result.config,
      json: options.json,
      action: 'agent.exclude',
      agentId: result.agentId,
    });
  });

agent
  .command('enable')
  .argument('<agentId>', 'agent id')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((agentId, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = setAgentEnabled(loaded.config, agentId, true);
    persistAndPrintMutation({
      configPath: loaded.configPath,
      projectRoot: loaded.projectRoot,
      nextConfig: result.config,
      json: options.json,
      action: 'agent.enable',
      agentId: result.agentId,
    });
  });

agent
  .command('disable')
  .argument('<agentId>', 'agent id')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((agentId, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = setAgentEnabled(loaded.config, agentId, false);
    persistAndPrintMutation({
      configPath: loaded.configPath,
      projectRoot: loaded.projectRoot,
      nextConfig: result.config,
      json: options.json,
      action: 'agent.disable',
      agentId: result.agentId,
    });
  });

agent
  .command('set-role')
  .argument('<agentId>', 'agent id')
  .requiredOption('--role <role>', 'new role')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((agentId, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = setAgentRole(loaded.config, agentId, options.role);
    persistAndPrintMutation({
      configPath: loaded.configPath,
      projectRoot: loaded.projectRoot,
      nextConfig: result.config,
      json: options.json,
      action: 'agent.set-role',
      agentId: result.agentId,
    });
  });

rule
  .command('list')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    printValue(listRules(loaded.config), true);
  });

rule
  .command('get <path>')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((dottedPath, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    printValue(getConfigValue(loaded.config, dottedPath) ?? null, true);
  });

rule
  .command('validate')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    printValue(validateRules(loaded.config), true);
  });

rule
  .command('render <templateKind>')
  .requiredOption('--context <json>', 'inline JSON context object')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((templateKind, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const template = getConfigValue(loaded.config, `templates.${templateKind}`) as { body?: string } | undefined;
    if (!template?.body) {
      throw new Error(`template not found: ${templateKind}`);
    }
    const context = JSON.parse(options.context) as Record<string, unknown>;
    const rendered = renderTemplate(templateKind, template.body, context);
    printValue({ ok: true, templateKind, rendered }, true);
  });

program
  .command('run <workflowPath>')
  .description('Run a minimal sequential workflow file')
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action(async (workflowPath, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const result = await runWorkflow({
      projectRoot: loaded.projectRoot,
      config: loaded.config,
      workflowPath,
    });
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
  .option('--config <path>', 'explicit config path')
  .option('--project-root <path>', 'project root override')
  .option('--json', 'JSON output')
  .action((runIdOrPath, options) => {
    const loaded = loadConfig({ projectRoot: options.projectRoot, configPath: options.config });
    const record = loadRunRecord(loaded.projectRoot, loaded.config, runIdOrPath);
    printValue(record, true);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
