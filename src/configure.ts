import fs from 'node:fs';
import path from 'node:path';

import { addAgent, removeAgent } from './agents/registry.js';
import { resolveAbsolutePath } from './config/defaults.js';
import { loadConfig, writeConfigFile } from './config/load.js';
import type { ZigrixConfig } from './config/schema.js';
import {
  detectOpenClawHome,
  ensureOpenClawInPath,
  ensureZigrixInPath,
  filterAgents,
  loadOpenClawConfig,
  promptAgentSelection,
  ensureOrchestratorId,
  registerAgents,
  registerSkills,
  resolveRuleSeedSource,
  seedRules,
  type OpenClawAgent,
  type PathStabilizeResult,
  type SkillRegistrationResult,
} from './onboard.js';
import { resolvePaths, type ZigrixPaths } from './state/paths.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfigureResult {
  ok: boolean;
  action: string;
  configPath: string;
  sections: string[];
  agentsRegistered: string[];
  agentsRemoved: string[];
  agentsSkipped: string[];
  rulesCopied: string[];
  rulesSkipped: string[];
  skillsResult: SkillRegistrationResult | null;
  pathResult: PathStabilizeResult | null;
  openclawPathResult: PathStabilizeResult | null;
  workspaceChanged: boolean;
  warnings: string[];
}

export interface RunConfigureOptions {
  sections?: string[];
  yes?: boolean;
  projectDir?: string;
  projectsBaseDir?: string;
  orchestratorId?: string;
  silent?: boolean;
}

const ALL_SECTIONS = ['agents', 'rules', 'workspace', 'path', 'skills'] as const;
type Section = (typeof ALL_SECTIONS)[number];

// ─── Configure ────────────────────────────────────────────────────────────────

export async function runConfigure(options: RunConfigureOptions): Promise<ConfigureResult> {
  const warnings: string[] = [];
  const silent = options.silent ?? false;
  const log = (msg: string) => { if (!silent) console.log(msg); };

  const loaded = loadConfig();
  if (!loaded.configPath || !fs.existsSync(loaded.configPath)) {
    throw new Error('zigrix not initialized. Run `zigrix onboard` first.');
  }

  let config = structuredClone(loaded.config) as ZigrixConfig;
  const configPath = loaded.configPath;
  const paths = resolvePaths(config);

  const sections: Section[] = options.sections && options.sections.length > 0
    ? (options.sections as Section[])
    : [...ALL_SECTIONS];

  let agentsRegistered: string[] = [];
  let agentsRemoved: string[] = [];
  let agentsSkipped: string[] = [];
  let rulesCopied: string[] = [];
  let rulesSkipped: string[] = [];
  let skillsResult: SkillRegistrationResult | null = null;
  let pathResult: PathStabilizeResult | null = null;
  let openclawPathResult: PathStabilizeResult | null = null;
  let workspaceChanged = false;
  let configDirty = false;

  // ─── agents ───────────────────────────────────────────────────────────
  if (sections.includes('agents')) {
    const openclawHome = detectOpenClawHome();
    const openclawConfig = loadOpenClawConfig(openclawHome);

    if (openclawConfig) {
      const allAgents = filterAgents(openclawConfig.agents?.list ?? []);

      let selectedAgents: OpenClawAgent[];
      if (options.yes) {
        selectedAgents = allAgents;
      } else {
        log('\n── Agent Configuration ──');
        selectedAgents = await promptAgentSelection(allAgents);
      }

      if (selectedAgents.length > 0) {
        const result = registerAgents(config, selectedAgents);
        config = result.config;
        agentsRegistered = result.registered;
        agentsSkipped = result.skipped;
        if (result.registered.length > 0) configDirty = true;
      }

      // Remove agents not in selection (unless --yes which means "keep all")
      if (!options.yes && allAgents.length > 0) {
        const selectedIds = new Set(selectedAgents.map((a) => a.id));
        for (const agent of allAgents) {
          if (!selectedIds.has(agent.id) && config.agents.registry[agent.id]) {
            const result = removeAgent(config, agent.id);
            config = result.config;
            agentsRemoved.push(agent.id);
            configDirty = true;
          }
        }
      }

      if (agentsRegistered.length > 0) log(`✅ Registered: ${agentsRegistered.join(', ')}`);
      if (agentsRemoved.length > 0) log(`🗑️  Removed: ${agentsRemoved.join(', ')}`);
      if (agentsSkipped.length > 0) log(`⏭️  Unchanged: ${agentsSkipped.join(', ')}`);
    } else {
      warnings.push('OpenClaw config not found — agent reconfiguration skipped.');
      log(`⚠️  ${warnings[warnings.length - 1]}`);
    }
  }

  // ─── orchestrator ────────────────────────────────────────────────────
  if (sections.includes('agents') || options.orchestratorId) {
    const orchResult = ensureOrchestratorId(config, options.orchestratorId);
    config = orchResult.config;
    if (orchResult.changed) {
      configDirty = true;
      log(`✅ Orchestrator set to: ${config.agents.orchestration.orchestratorId}`);
    }
    if (orchResult.warning) {
      warnings.push(orchResult.warning);
      log(`⚠️  ${orchResult.warning}`);
    }
  }

  // ─── workspace ────────────────────────────────────────────────────────
  if (sections.includes('workspace') && options.projectsBaseDir) {
    const resolved = resolveAbsolutePath(options.projectsBaseDir);
    if (config.workspace.projectsBaseDir !== resolved) {
      config.workspace.projectsBaseDir = resolved;
      configDirty = true;
      workspaceChanged = true;
      log(`✅ Projects base dir set to: ${resolved}`);
    }
  }

  // ─── rules ────────────────────────────────────────────────────────────
  if (sections.includes('rules')) {
    const ruleSeed = resolveRuleSeedSource(options.projectDir);

    if (ruleSeed.sourceDir) {
      if (options.projectDir && ruleSeed.source === 'bundled') {
        log(`ℹ️  No external rule templates found under ${options.projectDir}; using bundled defaults.`);
      }
      const result = seedRules(ruleSeed.sourceDir, paths.rulesDir);
      rulesCopied = result.copied;
      rulesSkipped = result.skipped;
      if (rulesCopied.length > 0) log(`✅ Rules added: ${rulesCopied.join(', ')}`);
      if (rulesSkipped.length > 0) log(`⏭️  Rules unchanged: ${rulesSkipped.join(', ')}`);
    } else {
      log('ℹ️  No bundled rule templates available — rule seeding skipped.');
    }
  }

  // ─── path ─────────────────────────────────────────────────────────────
  if (sections.includes('path')) {
    pathResult = ensureZigrixInPath();
    if (pathResult.symlinkCreated) {
      log(`✅ zigrix symlinked to ${pathResult.symlinkPath}`);
    } else if (pathResult.alreadyInPath) {
      log('✅ zigrix already in PATH');
    }
    if (pathResult.warning) {
      warnings.push(pathResult.warning);
      log(`⚠️  ${pathResult.warning}`);
    }

    openclawPathResult = ensureOpenClawInPath();
    if (openclawPathResult.symlinkCreated) {
      log(`✅ openclaw symlinked to ${openclawPathResult.symlinkPath}`);
    } else if (openclawPathResult.alreadyInPath) {
      log('✅ openclaw already in PATH');
    }
    if (openclawPathResult.warning) {
      warnings.push(openclawPathResult.warning);
      log(`⚠️  ${openclawPathResult.warning}`);
    }
  }

  // ─── skills ───────────────────────────────────────────────────────────
  if (sections.includes('skills')) {
    const openclawHome = detectOpenClawHome();
    if (fs.existsSync(openclawHome)) {
      skillsResult = registerSkills(openclawHome);
      if (skillsResult.registered.length > 0) {
        log(`✅ Skills registered: ${skillsResult.registered.join(', ')}`);
      }
      if (skillsResult.skipped.length > 0) {
        log(`⏭️  Skills unchanged: ${skillsResult.skipped.join(', ')}`);
      }
      for (const f of skillsResult.failed) {
        warnings.push(`Skill failed: ${f}`);
        log(`⚠️  ${warnings[warnings.length - 1]}`);
      }
    } else {
      log('ℹ️  OpenClaw not detected — skill registration skipped.');
    }
  }

  // ─── persist ──────────────────────────────────────────────────────────
  if (configDirty) {
    writeConfigFile(configPath, config);
  }

  return {
    ok: true,
    action: 'configure',
    configPath,
    sections,
    agentsRegistered,
    agentsRemoved,
    agentsSkipped,
    rulesCopied,
    rulesSkipped,
    skillsResult,
    pathResult,
    openclawPathResult,
    workspaceChanged,
    warnings,
  };
}
