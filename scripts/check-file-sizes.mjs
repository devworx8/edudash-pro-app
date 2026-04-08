#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

let files = [];
try {
  files = runGit(['ls-files']).split('\n').filter(Boolean);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to enumerate tracked files via git: ${message}`);
  process.exit(1);
}

// Exclusions (auto-generated or known large types)
const exclude = [
  /^types\/supabase\.ts$/,
  /^lib\/database\.types\.ts$/,
  /\/.*\.gen\.(ts|tsx|js)$/,
  /\/.*\.d\.ts$/,
];

function isExcluded(f) { return exclude.some((re) => re.test(f)); }

function lineCount(f) {
  return fs.readFileSync(f, 'utf8').split('\n').length;
}

function limitFor(f) {
  if (/^components\/.*\.tsx$/.test(f)) return 400;
  if (/^app\/.*\.tsx$/.test(f)) return 500;
  if (/^services\/.*\.ts$/.test(f)) return 500;
  if (/^lib\/.*\.ts$/.test(f)) return 500;
  if (/^hooks\/.*\.(ts|tsx)$/.test(f)) return 200;
  if (/.*types\.(ts|tsx)$/.test(f)) return 300;
  return null; // not enforced
}

const offenders = [];
for (const f of files) {
  if (!/\.(ts|tsx)$/.test(f)) continue;
  if (isExcluded(f)) continue;
  const limit = limitFor(f);
  if (!limit) continue;
  const lines = lineCount(f);
  if (lines > limit) offenders.push({ f, lines, limit });
}

if (offenders.length) {
  console.error('File size limits exceeded:');
  offenders.forEach((o) => console.error(` - ${o.f}: ${o.lines} > ${o.limit} lines`));
  process.exit(1);
}
console.log('File size checks passed.');
