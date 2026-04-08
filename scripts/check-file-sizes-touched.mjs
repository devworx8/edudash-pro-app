#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

function runGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function resolveTouchedFilesAndBase() {
  const workingTree = runGit(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'])
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);

  const untracked = runGit(['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);

  const liveTouched = Array.from(new Set([...workingTree, ...untracked]));
  if (liveTouched.length > 0) {
    return {
      touchedFiles: liveTouched,
      baselineRef: 'HEAD',
    };
  }

  const latestCommitFiles = runGit(['show', '--name-only', '--pretty=', '--diff-filter=ACMR', 'HEAD'])
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);

  const baselineRef = runGit(['rev-parse', 'HEAD~1']) || 'HEAD';
  return {
    touchedFiles: Array.from(new Set(latestCommitFiles)),
    baselineRef,
  };
}

function isExcluded(filePath) {
  const exclude = [
    /^types\/supabase\.ts$/,
    /^lib\/database\.types\.ts$/,
    /\/.*\.gen\.(ts|tsx|js)$/,
    /\/.*\.d\.ts$/,
  ];
  return exclude.some((re) => re.test(filePath));
}

function limitFor(filePath) {
  if (/^components\/.*\.tsx$/.test(filePath)) return 400;
  if (/^app\/.*\.tsx$/.test(filePath)) return 500;
  if (/^services\/.*\.ts$/.test(filePath)) return 500;
  if (/^lib\/.*\.ts$/.test(filePath)) return 500;
  if (/^hooks\/.*\.(ts|tsx)$/.test(filePath)) return 200;
  if (/.*types\.(ts|tsx)$/.test(filePath)) return 300;
  return null;
}

function countLinesInWorkingTree(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8').split('\n').length;
}

function countLinesAtBase(base, filePath) {
  try {
    const blob = execFileSync('git', ['show', `${base}:${filePath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return blob.split('\n').length;
  } catch {
    return null;
  }
}

const { touchedFiles, baselineRef } = resolveTouchedFilesAndBase();
const touched = touchedFiles
  .filter((filePath) => /\.(ts|tsx)$/.test(filePath))
  .filter((filePath) => !isExcluded(filePath));

const offenders = [];
for (const filePath of touched) {
  const limit = limitFor(filePath);
  if (!limit) continue;
  const workingLines = countLinesInWorkingTree(filePath);
  if (workingLines == null) continue;
  const baseLines = countLinesAtBase(baselineRef, filePath);

  // New file: strict cap.
  if (baseLines == null) {
    if (workingLines > limit) offenders.push({ filePath, workingLines, limit, baseLines });
    continue;
  }

  // Existing oversized file: disallow growth.
  if (baseLines > limit) {
    if (workingLines > baseLines) offenders.push({ filePath, workingLines, limit, baseLines });
    continue;
  }

  // Existing compliant file: must remain compliant.
  if (workingLines > limit) offenders.push({ filePath, workingLines, limit, baseLines });
}

if (offenders.length > 0) {
  console.error('Touched-file size limits exceeded:');
  for (const offender of offenders) {
    const baseline = offender.baseLines == null ? 'new file' : String(offender.baseLines);
    console.error(` - ${offender.filePath}: ${offender.workingLines} lines (limit ${offender.limit}, base ${baseline})`);
  }
  process.exit(1);
}

console.log('Touched-file size checks passed.');
