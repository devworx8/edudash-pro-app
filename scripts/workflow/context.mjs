import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function run(command) {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function safeRun(command) {
  try {
    return run(command);
  } catch {
    return '';
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(relativePath), 'utf8'));
}

function parseWorktrees(raw) {
  const blocks = raw
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const entry = {};
    for (const line of block.split('\n')) {
      const [key, ...rest] = line.split(' ');
      entry[key] = rest.join(' ');
    }
    return entry;
  });
}

export function readWorkspaceContext() {
  const repoRoot = run('git rev-parse --show-toplevel');
  process.chdir(repoRoot);

  const appConfig = readJson('app.json').expo ?? {};
  const easConfig = readJson('eas.json');
  const packageJson = readJson('package.json');
  const worktreesRaw = safeRun('git worktree list --porcelain');

  return {
    repoRoot,
    branch: run('git rev-parse --abbrev-ref HEAD'),
    commit: run('git rev-parse --short HEAD'),
    status: safeRun('git status --porcelain'),
    worktrees: parseWorktrees(worktreesRaw),
    appVersion: appConfig.version ?? 'unknown',
    runtimeVersion: appConfig.runtimeVersion ?? 'unknown',
    androidVersionCode: appConfig.android?.versionCode ?? 'unknown',
    easConfig,
    packageJson,
  };
}

export function describeRuntime(runtimeVersion) {
  if (typeof runtimeVersion === 'string') {
    return {
      label: runtimeVersion,
      mode: 'static',
    };
  }

  if (
    runtimeVersion &&
    typeof runtimeVersion === 'object' &&
    typeof runtimeVersion.policy === 'string'
  ) {
    return {
      label: runtimeVersion.policy,
      mode: 'policy',
    };
  }

  return {
    label: 'unknown',
    mode: 'unknown',
  };
}
