#!/usr/bin/env node

import { describeRuntime, readWorkspaceContext } from './context.mjs';

const mode = process.argv[2];

const modes = {
  ota: {
    label: 'production OTA publish',
    requireClean: true,
    allowedBranches: ['development'],
    strictBranch: true,
  },
  'prod-build': {
    label: 'production Android build',
    requireClean: true,
    allowedBranches: ['development'],
    strictBranch: true,
  },
  'playstore-build': {
    label: 'Play Store AAB build',
    requireClean: true,
    allowedBranches: ['development'],
    strictBranch: true,
  },
  'preview-build': {
    label: 'preview Android build',
    requireClean: true,
    allowedBranches: ['development'],
    strictBranch: false,
  },
  'dev-build': {
    label: 'development Android build',
    requireClean: true,
    allowedBranches: ['development'],
    strictBranch: false,
  },
};

if (!mode || !modes[mode]) {
  console.error(
    `Usage: node scripts/workflow/release-guard.mjs <${Object.keys(modes).join('|')}>`,
  );
  process.exit(1);
}

const config = modes[mode];
const context = readWorkspaceContext();
const runtime = describeRuntime(context.runtimeVersion);
const allowDirty = process.env.RELEASE_GUARD_ALLOW_DIRTY === '1';
const allowAnyBranch = process.env.RELEASE_GUARD_ALLOW_ANY_BRANCH === '1';
const isClean = context.status.length === 0;
const isAllowedBranch = config.allowedBranches.includes(context.branch);
const extraWorktrees = context.worktrees
  .map((entry) => entry.worktree)
  .filter((worktree) => worktree && worktree !== context.repoRoot);

const failures = [];
const warnings = [];

if (config.requireClean && !isClean && !allowDirty) {
  failures.push(
    'Working tree is dirty. Commit or stash changes before running release/build commands.',
  );
}

if (!isAllowedBranch) {
  const message = `Current branch is "${context.branch}". Expected ${config.allowedBranches.join(
    ' or ',
  )} for ${config.label}.`;
  if (config.strictBranch && !allowAnyBranch) {
    failures.push(message);
  } else {
    warnings.push(message);
  }
}

if (extraWorktrees.length > 0) {
  warnings.push(
    `Additional worktrees detected: ${extraWorktrees.join(', ')}. Release from the main repo root only.`,
  );
}

if (runtime.mode === 'static') {
  warnings.push(
    `runtimeVersion is still static (${runtime.label}). This is safe for now, but move to appVersion policy after the next binary.`,
  );
}

console.log(`Release guard: ${config.label}`);
console.log(`Repo: ${context.repoRoot}`);
console.log(`Branch: ${context.branch} @ ${context.commit}`);
console.log(
  `App version: ${context.appVersion} (Android ${context.androidVersionCode}), runtime: ${runtime.label}`,
);

for (const warning of warnings) {
  console.warn(`WARNING: ${warning}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`BLOCKED: ${failure}`);
  }
  console.error(
    'Set RELEASE_GUARD_ALLOW_DIRTY=1 or RELEASE_GUARD_ALLOW_ANY_BRANCH=1 only for deliberate emergencies.',
  );
  process.exit(1);
}

console.log('Release guard passed.');
