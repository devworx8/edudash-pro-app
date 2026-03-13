#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import process from 'process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env.eas', override: true });

const argMap = parseArgs(process.argv.slice(2));
const dryRun = argMap.has('dry-run');
const releaseType = argMap.get('release-type') || process.env.OTA_NOTIFY_RELEASE_TYPE || 'ota';
const explicitPlatforms = argMap.get('platforms') || process.env.OTA_NOTIFY_PLATFORMS;
const platforms = (explicitPlatforms || 'android,ios')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter((value) => value === 'android' || value === 'ios' || value === 'web');

if (process.env.OTA_NOTIFY_ENABLED === 'false') {
  console.log('[ota-notify] Skipping (OTA_NOTIFY_ENABLED=false)');
  process.exit(0);
}

if (platforms.length === 0) {
  console.error('[ota-notify] No valid platforms provided. Use android, ios, and/or web.');
  process.exit(1);
}

const rootPkg = safeReadJson(path.join(process.cwd(), 'package.json'));
const appConfig = safeReadJson(path.join(process.cwd(), 'app.json'));
const expoConfig = appConfig?.expo ?? null;
const appVersion =
  argMap.get('version') ||
  expoConfig?.version ||
  process.env.npm_package_version ||
  process.env.EXPO_PUBLIC_APP_VERSION ||
  process.env.NEXT_PUBLIC_APP_VERSION ||
  rootPkg?.version ||
  'latest';

const buildNumber =
  argMap.get('build-number') ||
  expoConfig?.android?.versionCode ||
  process.env.ANDROID_VERSION_CODE ||
  process.env.EXPO_ANDROID_VERSION_CODE ||
  process.env.BUILD_NUMBER ||
  undefined;

const expoProjectId =
  argMap.get('expo-project-id') ||
  process.env.EAS_PROJECT_ID ||
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
  '';

const mandatory = normalizeBoolean(argMap.get('mandatory') || process.env.OTA_NOTIFY_MANDATORY_UPDATE);
const packageId =
  process.env.EXPO_PUBLIC_ANDROID_PACKAGE ||
  process.env.NEXT_PUBLIC_ANDROID_PACKAGE ||
  'com.edudashpro.app';
const androidStoreUrl = process.env.OTA_NOTIFY_ANDROID_STORE_URL || `market://details?id=${packageId}`;
const iosStoreUrl =
  process.env.OTA_NOTIFY_IOS_STORE_URL ||
  process.env.OTA_NOTIFY_STORE_URL ||
  'https://apps.apple.com';

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dispatcherTimeoutMs = normalizeTimeoutMs(
  argMap.get('timeout-ms') || process.env.OTA_NOTIFY_TIMEOUT_MS
);

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[ota-notify] Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const dispatcherUrl = `${supabaseUrl}/functions/v1/notifications-dispatcher`;

async function main() {
  console.log('[ota-notify] Dispatching OTA update push notifications');
  console.log(
    `[ota-notify] version=${appVersion} release_type=${releaseType} mandatory=${mandatory} platforms=${platforms.join(',')}` +
      (expoProjectId ? ` project_id=${expoProjectId}` : ' project_id=unset')
  );

  let hasError = false;

  for (const platform of platforms) {
    const payload = {
      event_type: 'build_update_available',
      platform,
      version: appVersion,
      build_number: buildNumber,
      store_url: platform === 'ios' ? iosStoreUrl : androidStoreUrl,
      mandatory,
      send_immediately: true,
      include_email: false,
      custom_payload: {
        release_type: releaseType,
        source: 'ota-script',
        ...(expoProjectId ? { expo_project_id: expoProjectId } : {}),
      },
    };

    if (dryRun) {
      console.log(`[ota-notify] dry-run payload (${platform}):`, JSON.stringify(payload));
      continue;
    }

    try {
      const response = await fetch(dispatcherUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        signal: AbortSignal.timeout(dispatcherTimeoutMs),
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      if (!response.ok) {
        hasError = true;
        console.error(`[ota-notify] ${platform} dispatch failed (HTTP ${response.status}): ${responseText}`);
        continue;
      }

      console.log(`[ota-notify] ${platform} dispatch ok: ${responseText.slice(0, 400)}`);
    } catch (error) {
      hasError = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ota-notify] ${platform} dispatch error: ${message}`);
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

await main();

function parseArgs(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    if (!body) continue;
    if (body.includes('=')) {
      const [key, ...rest] = body.split('=');
      map.set(key, rest.join('='));
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      map.set(body, next);
      i += 1;
    } else {
      map.set(body, 'true');
    }
  }
  return map;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function normalizeTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30000;
  }
  return parsed;
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}
