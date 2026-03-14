#!/usr/bin/env node
import { Command } from 'commander';

import { getConfigValue, loadConfig, writeDefaultConfig } from './config/load.js';
import { zigrixConfigJsonSchema } from './config/schema.js';
import { runWorkflow, summarizeRun } from './runner/run.js';
import { loadRunRecord } from './runner/store.js';

function printValue(value: unknown, json = false): void {
  if (json || typeof value !== 'string') {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(value);
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
