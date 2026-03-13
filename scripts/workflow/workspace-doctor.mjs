#!/usr/bin/env node

import { describeBuildProfile, describeRuntime, readWorkspaceContext } from './context.mjs';

const context = readWorkspaceContext();
const runtime = describeRuntime(context.runtimeVersion);
const profiles = Object.keys(context.easConfig.build ?? {});
const isClean = context.status.length === 0;
const buildProfiles = context.easConfig.build ?? {};
const developmentProfile = describeBuildProfile(buildProfiles.development);
const previewProfile = describeBuildProfile(buildProfiles.preview);
const productionProfile = describeBuildProfile(buildProfiles.production);

console.log('Workspace doctor');
console.log(`Repo root: ${context.repoRoot}`);
console.log(`Branch: ${context.branch}`);
console.log(`Commit: ${context.commit}`);
console.log(`Working tree: ${isClean ? 'clean' : 'dirty'}`);
console.log(
  `App version: ${context.appVersion} (Android ${context.androidVersionCode}), runtime: ${runtime.label}`,
);
console.log(
  `Architecture: Expo new architecture ${context.newArchEnabled ? 'enabled' : 'disabled'}`,
);
console.log(`EAS appVersionSource: ${context.appVersionSource}`);
console.log(
  `Distribution: development=${developmentProfile.channel}/${developmentProfile.distribution}, preview=${previewProfile.channel}/${previewProfile.distribution}, production=${productionProfile.channel}/${productionProfile.distribution}`,
);
console.log(`EAS build profiles: ${profiles.join(', ')}`);
console.log('');
console.log('Worktrees:');

for (const worktree of context.worktrees) {
  const marker = worktree.worktree === context.repoRoot ? '*' : '-';
  const branch = worktree.branch ? worktree.branch.replace('refs/heads/', '') : 'detached';
  console.log(`  ${marker} ${worktree.worktree} [${branch}]`);
}

console.log('');
console.log('Recommended workflow');
console.log('1. Do all normal work in /home/edp/Desktop/dashpro on development.');
console.log('2. Keep development clean before preview builds, production builds, or OTAs.');
console.log('3. Run a preview build first for remote QA, then a dev build for native validation.');
console.log('4. Ship production AABs only after preview validation succeeds.');
console.log('5. Publish OTAs only for JS-safe fixes, and only from development.');
console.log(
  `6. Keep runtimeVersion ${runtime.label} until the next native store build is live on devices, then switch to appVersion policy.`,
);
