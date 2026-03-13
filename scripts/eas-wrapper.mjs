import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import process from 'process';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EAS_NPM_PACKAGE = 'eas-cli@18.0.1';

const projectMap = await import(path.join(__dirname, 'eas-projects.js'));
const { EAS_PROJECTS, resolveEasProjectConfig } = projectMap.default || projectMap;

const args = process.argv.slice(2);
const isBuild = args[0] === 'build';
const profile = getProfileArg(args);
const targetEnvironment = getEnvironmentArg(args) || inferEnvironmentFromProfile(profile);

loadEnvFiles(targetEnvironment);

const isNonInteractive =
  args.includes('--non-interactive') ||
  process.env.CI === 'true' ||
  process.env.CI === '1' ||
  process.env.EAS_NO_PROJECT_PROMPT === '1';

const { list, byId } = buildProjectList(EAS_PROJECTS);
const currentConfig = getCurrentConfig({ byId, projects: EAS_PROJECTS, resolver: resolveEasProjectConfig });

let selectedConfig = null;

const forcedConfig = isBuild ? getForcedConfig(profile, EAS_PROJECTS, byId) : null;

if (forcedConfig) {
  selectedConfig = forcedConfig;
} else if (isBuild && !isNonInteractive) {
  selectedConfig = await promptForProject({ list, byId, currentConfig, projects: EAS_PROJECTS });
}

const env = { ...process.env };
if (targetEnvironment) {
  env.EAS_ENVIRONMENT = targetEnvironment;
}
if (selectedConfig) {
  env.EAS_PROJECT_ID = selectedConfig.id;
  env.EAS_PROJECT_OWNER = selectedConfig.owner;
  env.EAS_PROJECT_SLUG = selectedConfig.slug;
  writeEnvFile(selectedConfig);
  const modeLabel = forcedConfig ? 'forced' : 'selected';
  console.log(
    `[eas-wrapper] Using EAS project (${modeLabel}): ${selectedConfig.owner}/${selectedConfig.slug} (${selectedConfig.id})`
  );
}

const { command, commandArgs, source } = resolveEasCommand(args);
console.log(`[eas-wrapper] Using EAS CLI from: ${source}`);
const result = spawnSync(command, commandArgs, { stdio: 'inherit', env });
if (result.error) {
  console.error(`[eas-wrapper] Failed to execute EAS CLI: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

function buildProjectList(projects) {
  const byIdMap = new Map();
  const unique = [];

  for (const [alias, config] of Object.entries(projects)) {
    const existing = byIdMap.get(config.id);
    if (existing) {
      existing.aliases.push(alias);
      continue;
    }
    const entry = {
      alias,
      aliases: [alias],
      config,
    };
    byIdMap.set(config.id, entry);
    unique.push(entry);
  }

  return { list: unique, byId: byIdMap };
}

function getProfileArg(argv) {
  const index = argv.findIndex((arg) => arg === '--profile' || arg.startsWith('--profile='));
  if (index === -1) return '';
  const token = argv[index];
  if (token.includes('=')) {
    return token.split('=')[1] || '';
  }
  return argv[index + 1] || '';
}

function getEnvironmentArg(argv) {
  const index = argv.findIndex((arg) => arg === '--environment' || arg.startsWith('--environment='));
  if (index === -1) return '';
  const token = argv[index];
  if (token.includes('=')) {
    return token.split('=')[1] || '';
  }
  return argv[index + 1] || '';
}

function inferEnvironmentFromProfile(profileName) {
  const normalized = String(profileName || '').trim().toLowerCase();
  if (!normalized) return '';
  if (['production', 'production-apk', 'playstore'].includes(normalized)) {
    return 'production';
  }
  if (normalized === 'preview') {
    return 'preview';
  }
  if (['development', 'development-apk'].includes(normalized)) {
    return 'development';
  }
  return '';
}

function shouldPreferManagedEnv(environmentName) {
  return ['production', 'preview'].includes(String(environmentName || '').trim().toLowerCase());
}

function loadEnvFiles(environmentName) {
  if (shouldPreferManagedEnv(environmentName)) {
    console.log(`[eas-wrapper] Preferring managed ${environmentName} env; skipping .env and .env.local`);
  } else {
    dotenv.config({ path: '.env' });
    dotenv.config({ path: '.env.local', override: true });
  }
  dotenv.config({ path: '.env.eas', override: true });
}

function getForcedConfig(profileName, projects, byId) {
  if (!profileName) return null;
  const normalized = profileName.trim().toLowerCase();
  const forceMap = {
    playstore: 'playstore',
    'playstore-apk': 'playstore',
    'production-apk': 'playstore',
  };
  const alias = forceMap[normalized];
  if (!alias) return null;
  if (projects[alias]) return projects[alias];
  if (byId.has(alias)) return byId.get(alias).config;
  return null;
}

function getCurrentConfig({ byId, projects, resolver }) {
  const current = process.env.EAS_PROJECT_ID;
  if (!current) return null;
  if (projects[current]) return projects[current];
  if (byId.has(current)) return byId.get(current).config;
  if (resolver) {
    const resolved = resolver(current);
    if (resolved?.id) {
      return { id: resolved.id, owner: resolved.owner, slug: resolved.slug };
    }
  }
  return null;
}

function resolveInput(input, { byId, projects }) {
  if (projects[input]) return projects[input];
  if (byId.has(input)) return byId.get(input).config;
  return null;
}

function printProjectList(list) {
  console.log('');
  console.log('Select EAS project for this build:');
  list.forEach((entry, index) => {
    console.log(
      `${index + 1}) ${entry.alias}  owner=${entry.config.owner} slug=${entry.config.slug} id=${entry.config.id}`
    );
    if (entry.aliases.length > 1) {
      console.log(`   aliases: ${entry.aliases.join(', ')}`);
    }
  });
  console.log(`${list.length + 1}) custom`);
  console.log('');
}

async function promptForProject({ list, byId, currentConfig, projects }) {
  printProjectList(list);

  const currentLabel = currentConfig
    ? `${currentConfig.owner}/${currentConfig.slug} (${currentConfig.id})`
    : 'none';

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const raw = (await rl.question(`Choose number/alias/id [current: ${currentLabel}]: `)).trim();

    if (!raw) {
      if (currentConfig) return currentConfig;
      return list[0]?.config || null;
    }

    if (/^\d+$/.test(raw)) {
      const index = Number.parseInt(raw, 10) - 1;
      if (index === list.length) {
        return await promptForCustomProject(rl, currentConfig);
      }
      return list[index]?.config || null;
    }

    if (raw.toLowerCase() === 'custom') {
      return await promptForCustomProject(rl, currentConfig);
    }

    const resolved = resolveInput(raw, { byId, projects });
    if (!resolved) {
      console.error(`Unknown project selection: ${raw}`);
      return null;
    }
    return resolved;
  } finally {
    rl.close();
  }
}

async function promptForCustomProject(rl, fallback) {
  const ask = async (label, defaultValue) => {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const value = (await rl.question(`${label}${suffix}: `)).trim();
    return value || defaultValue || '';
  };

  const id = await ask('Project ID', fallback?.id || '');
  const owner = await ask('Owner', fallback?.owner || '');
  const slug = await ask('Slug', fallback?.slug || '');

  if (!id || !owner || !slug) {
    console.error('Custom project requires id, owner, and slug.');
    return null;
  }

  return { id, owner, slug };
}

function writeEnvFile(values) {
  const lines = [
    `EAS_PROJECT_ID=${values.id}`,
    `EAS_PROJECT_OWNER=${values.owner}`,
    `EAS_PROJECT_SLUG=${values.slug}`,
  ];
  try {
    fs.writeFileSync(path.join(process.cwd(), '.env.eas'), `${lines.join('\n')}\n`, 'utf8');
  } catch (error) {
    console.warn('[eas-wrapper] Unable to write .env.eas. Continuing without persisting selection.');
  }
}

function resolveEasCommand(passthroughArgs) {
  const easBinName = process.platform === 'win32' ? 'eas.cmd' : 'eas';

  const npmBin = getGlobalNpmBin();
  if (npmBin) {
    const globalEasPath = path.join(npmBin, easBinName);
    if (fs.existsSync(globalEasPath)) {
      return {
        command: globalEasPath,
        commandArgs: passthroughArgs,
        source: `npm global bin (${globalEasPath})`,
      };
    }
  }

  const localEasPath = path.join(process.cwd(), 'node_modules', '.bin', easBinName);
  if (fs.existsSync(localEasPath)) {
    return {
      command: localEasPath,
      commandArgs: passthroughArgs,
      source: `project local bin (${localEasPath})`,
    };
  }

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return {
    command: npxCmd,
    commandArgs: ['--yes', '--package', EAS_NPM_PACKAGE, 'eas', ...passthroughArgs],
    source: `npx --package ${EAS_NPM_PACKAGE}`,
  };
}

function getGlobalNpmBin() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const legacyResult = spawnSync(npmCmd, ['bin', '-g'], { encoding: 'utf8' });
  if (!legacyResult.error && legacyResult.status === 0) {
    const legacyOutput = (legacyResult.stdout || '').trim();
    if (legacyOutput) {
      return legacyOutput;
    }
  }

  const prefixResult = spawnSync(npmCmd, ['config', 'get', 'prefix'], { encoding: 'utf8' });
  if (prefixResult.error || prefixResult.status !== 0) {
    return null;
  }

  const prefix = (prefixResult.stdout || '').trim();
  if (!prefix) {
    return null;
  }

  return process.platform === 'win32' ? prefix : path.join(prefix, 'bin');
}
