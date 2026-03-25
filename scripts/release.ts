#!/usr/bin/env tsx
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

type ReleaseCliArgs = {
  versionArg?: string;
  dryRun: boolean;
  distTagOverride?: string;
  help: boolean;
};

type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  allowFailure?: boolean;
  inheritStdio?: boolean;
};

type CommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

type PackageJson = {
  name: string;
  version: string;
};

type ReleaseContext = {
  repoRoot: string;
  packageJson: PackageJson;
  version: string;
  tag: string;
  distTag: string;
  isPrerelease: boolean;
};

type NpmAuthConfig = {
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
  source: 'env' | 'file';
};

const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseReleaseArgs(argv: string[]): ReleaseCliArgs {
  const args: ReleaseCliArgs = {
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (token === '--dist-tag') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--dist-tag requires a value');
      }
      args.distTagOverride = value;
      i += 1;
      continue;
    }

    if (token.startsWith('--dist-tag=')) {
      const value = token.slice('--dist-tag='.length);
      if (!value) {
        throw new Error('--dist-tag requires a non-empty value');
      }
      args.distTagOverride = value;
      continue;
    }

    if (token.startsWith('--')) {
      throw new Error(`Unknown flag: ${token}`);
    }

    if (args.versionArg) {
      throw new Error(`Only one version argument is allowed (received: ${token})`);
    }

    args.versionArg = token;
  }

  return args;
}

export function isValidSemver(version: string): boolean {
  return SEMVER_REGEX.test(version);
}

export function inferDistTag(version: string): string {
  const prerelease = version.split('-')[1];
  if (!prerelease) {
    return 'latest';
  }

  const firstIdentifier = prerelease.split('.')[0]?.trim().toLowerCase();
  if (!firstIdentifier || /^\d+$/.test(firstIdentifier)) {
    return 'next';
  }
  return firstIdentifier;
}

export function parseNpmTokenFromEnvFile(content: string): string | undefined {
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const matched = line.match(/^(?:export\s+)?NPM_TOKEN\s*=\s*(.+)$/);
    if (!matched) {
      continue;
    }

    let value = matched[1].trim();
    if (!value) {
      continue;
    }

    const hashIndex = value.indexOf(' #');
    if (hashIndex >= 0) {
      value = value.slice(0, hashIndex).trim();
    }

    const singleQuoted = value.match(/^'(.*)'$/);
    if (singleQuoted) {
      return singleQuoted[1];
    }

    const doubleQuoted = value.match(/^"(.*)"$/);
    if (doubleQuoted) {
      return doubleQuoted[1];
    }

    return value;
  }

  return undefined;
}

function usage(): string {
  return [
    'Usage: npm run release -- [version] [--dry-run] [--dist-tag <tag>]',
    '',
    'Examples:',
    '  npm run release -- 0.1.0-alpha.16',
    '  npm run release -- 0.1.0 --dist-tag latest',
    '  npm run release -- --dry-run',
    '',
    'NPM auth sources (in priority order):',
    '  1) NPM_TOKEN environment variable',
    '  2) scripts/local/.env.npm (gitignored local file)',
  ].join('\n');
}

function runCommand(command: string, commandArgs: string[], options: CommandOptions = {}): CommandResult {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: options.inheritStdio ? 'inherit' : 'pipe',
  });

  const status = result.status ?? 1;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  if (!options.allowFailure && status !== 0) {
    const renderedCommand = [command, ...commandArgs].join(' ');
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    throw new Error(`Command failed (${status}): ${renderedCommand}${output ? `\n${output}` : ''}`);
  }

  return { status, stdout, stderr };
}

function ensureToolAvailable(command: string, probeArg = '--version'): void {
  const probe = runCommand(command, [probeArg], { allowFailure: true });
  if (probe.status !== 0) {
    throw new Error(`Required tool is not available: ${command}`);
  }
}

function loadPackageJson(repoRoot: string): PackageJson {
  const raw = fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8');
  return JSON.parse(raw) as PackageJson;
}

function resolveReleaseContext(repoRoot: string, args: ReleaseCliArgs): ReleaseContext {
  const packageJson = loadPackageJson(repoRoot);
  const version = args.versionArg ?? packageJson.version;

  if (!isValidSemver(version)) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  if (packageJson.version !== version) {
    throw new Error(
      `package.json version mismatch: package.json=${packageJson.version}, input=${version}`
    );
  }

  const tag = `v${version}`;
  const distTag = (args.distTagOverride ?? inferDistTag(version)).trim();
  if (!distTag || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(distTag)) {
    throw new Error(`Invalid dist-tag: ${distTag || '(empty)'}`);
  }

  return {
    repoRoot,
    packageJson,
    version,
    tag,
    distTag,
    isPrerelease: version.includes('-'),
  };
}

function setupNpmAuth(repoRoot: string): NpmAuthConfig {
  const envToken = process.env.NPM_TOKEN?.trim();
  let source: 'env' | 'file' = 'env';
  let token = envToken;

  if (!token) {
    const envFilePath = path.join(repoRoot, 'scripts', 'local', '.env.npm');
    if (!fs.existsSync(envFilePath)) {
      throw new Error(
        'NPM auth not found. Set NPM_TOKEN or create scripts/local/.env.npm (gitignored).'
      );
    }

    const envFileContent = fs.readFileSync(envFilePath, 'utf8');
    token = parseNpmTokenFromEnvFile(envFileContent)?.trim();
    if (!token) {
      throw new Error('scripts/local/.env.npm exists but NPM_TOKEN is missing or empty.');
    }
    source = 'file';
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-release-'));
  const npmrcPath = path.join(tmpDir, '.npmrc');
  fs.writeFileSync(
    npmrcPath,
    ['//registry.npmjs.org/:_authToken=${NPM_TOKEN}', 'always-auth=true', ''].join('\n'),
    {
      encoding: 'utf8',
      mode: 0o600,
    }
  );

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NPM_TOKEN: token,
    NODE_AUTH_TOKEN: token,
    NPM_CONFIG_USERCONFIG: npmrcPath,
  };

  const cleanup = () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  return { env, cleanup, source };
}

function assertGitReleasePreflight(ctx: ReleaseContext): void {
  const branch = runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: ctx.repoRoot,
  }).stdout.trim();

  if (branch !== 'main') {
    throw new Error(`Release must run from main branch (current: ${branch})`);
  }

  const dirty = runCommand('git', ['status', '--porcelain'], {
    cwd: ctx.repoRoot,
  }).stdout.trim();

  if (dirty) {
    throw new Error('Working tree is not clean. Commit or stash changes before release.');
  }

  runCommand('git', ['fetch', 'origin', '--tags'], {
    cwd: ctx.repoRoot,
    inheritStdio: true,
  });

  const localTag = runCommand('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${ctx.tag}`], {
    cwd: ctx.repoRoot,
    allowFailure: true,
  });
  if (localTag.status === 0) {
    throw new Error(`Local tag already exists: ${ctx.tag}`);
  }

  const remoteTag = runCommand(
    'git',
    ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${ctx.tag}`],
    {
      cwd: ctx.repoRoot,
      allowFailure: true,
    }
  );
  if (remoteTag.status === 0) {
    throw new Error(`Remote tag already exists: ${ctx.tag}`);
  }
}

function assertPublishPreflight(ctx: ReleaseContext, env: NodeJS.ProcessEnv): void {
  runCommand('gh', ['auth', 'status'], {
    cwd: ctx.repoRoot,
    env,
    inheritStdio: true,
  });

  runCommand('npm', ['whoami'], {
    cwd: ctx.repoRoot,
    env,
    inheritStdio: true,
  });

  const existingVersion = runCommand('npm', ['view', `${ctx.packageJson.name}@${ctx.version}`, 'version'], {
    cwd: ctx.repoRoot,
    env,
    allowFailure: true,
  });

  if (existingVersion.status === 0 && existingVersion.stdout.trim() === ctx.version) {
    throw new Error(`Version already published on npm: ${ctx.packageJson.name}@${ctx.version}`);
  }

  console.log('--- npm run publish:check ---');
  runCommand('npm', ['run', 'publish:check'], {
    cwd: ctx.repoRoot,
    env,
    inheritStdio: true,
  });
}

function upsertGithubRelease(ctx: ReleaseContext): void {
  const releaseExists =
    runCommand('gh', ['release', 'view', ctx.tag, '--json', 'tagName'], {
      cwd: ctx.repoRoot,
      allowFailure: true,
    }).status === 0;

  if (releaseExists) {
    const args = ['release', 'edit', ctx.tag, '--title', ctx.tag];
    if (ctx.isPrerelease) {
      args.push('--prerelease');
    } else {
      args.push('--latest');
    }

    runCommand('gh', args, {
      cwd: ctx.repoRoot,
      inheritStdio: true,
    });
    return;
  }

  const createArgs = [
    'release',
    'create',
    ctx.tag,
    '--verify-tag',
    '--title',
    ctx.tag,
    '--generate-notes',
  ];

  if (ctx.isPrerelease) {
    createArgs.push('--prerelease', '--latest=false');
  } else {
    createArgs.push('--latest');
  }

  runCommand('gh', createArgs, {
    cwd: ctx.repoRoot,
    inheritStdio: true,
  });
}

function verifyDistTags(ctx: ReleaseContext, env: NodeJS.ProcessEnv): void {
  const publishedVersion = runCommand('npm', ['view', `${ctx.packageJson.name}@${ctx.version}`, 'version'], {
    cwd: ctx.repoRoot,
    env,
  }).stdout.trim();

  if (publishedVersion !== ctx.version) {
    throw new Error(
      `Published version mismatch. Expected ${ctx.version}, received ${publishedVersion || '(empty)'}`
    );
  }

  const distTagsRaw = runCommand('npm', ['view', ctx.packageJson.name, 'dist-tags', '--json'], {
    cwd: ctx.repoRoot,
    env,
  }).stdout.trim();

  let distTags: Record<string, string>;
  try {
    distTags = JSON.parse(distTagsRaw) as Record<string, string>;
  } catch (error) {
    throw new Error(`Unable to parse dist-tags JSON: ${distTagsRaw}`);
  }

  if (distTags[ctx.distTag] !== ctx.version) {
    throw new Error(
      `dist-tag verification failed: ${ctx.distTag}=${distTags[ctx.distTag] ?? '(missing)'}, expected ${ctx.version}`
    );
  }

  const latest = distTags.latest;
  if (ctx.distTag === 'latest' && latest !== ctx.version) {
    throw new Error(`latest dist-tag mismatch: latest=${latest ?? '(missing)'}, expected ${ctx.version}`);
  }

  if (ctx.distTag !== 'latest' && latest === ctx.version) {
    throw new Error(
      `latest dist-tag drift detected: prerelease ${ctx.version} should not become latest`
    );
  }

  console.log('--- dist-tag verification ---');
  console.log(`verified ${ctx.packageJson.name}@${ctx.version}`);
  console.log(`verified ${ctx.distTag} -> ${ctx.version}`);
  console.log(`latest -> ${latest ?? '(missing)'}`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseReleaseArgs(argv);
  if (parsed.help) {
    console.log(usage());
    return;
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  ensureToolAvailable('git');
  ensureToolAvailable('npm');
  ensureToolAvailable('gh');

  const ctx = resolveReleaseContext(repoRoot, parsed);

  const npmAuth = setupNpmAuth(repoRoot);
  const { env } = npmAuth;

  try {
    console.log(`=== Zigrix release ${ctx.version} (${parsed.dryRun ? 'dry-run' : 'publish'}) ===`);
    console.log(`tag=${ctx.tag} dist-tag=${ctx.distTag}`);
    console.log(`npm auth source=${npmAuth.source}`);

    assertGitReleasePreflight(ctx);
    assertPublishPreflight(ctx, env);

    if (parsed.dryRun) {
      console.log('Dry-run complete: all preflight checks passed.');
      return;
    }

    console.log('--- git tag + push ---');
    runCommand('git', ['tag', '-a', ctx.tag, '-m', `release: ${ctx.tag}`], {
      cwd: ctx.repoRoot,
      inheritStdio: true,
    });
    runCommand('git', ['push', 'origin', ctx.tag], {
      cwd: ctx.repoRoot,
      inheritStdio: true,
    });

    console.log('--- npm publish ---');
    runCommand('npm', ['publish', '--access', 'public', '--tag', ctx.distTag], {
      cwd: ctx.repoRoot,
      env,
      inheritStdio: true,
    });

    console.log('--- GitHub release upsert ---');
    upsertGithubRelease(ctx);

    verifyDistTags(ctx, env);

    console.log(`=== Release ${ctx.version} complete ===`);
  } finally {
    npmAuth.cleanup();
  }
}

const isDirectExecution = (() => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
})();

if (isDirectExecution) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exitCode = 1;
  });
}
