#!/usr/bin/env node

/**
 * Post-Deployment Notification Script
 * 
 * Sends push notifications to all users when a new version is deployed
 * 
 * Usage:
 *   node scripts/notify-deployment.js
 * 
 * Environment Variables:
 *   NEXT_PUBLIC_WEB_URL - Your production URL
 *   DEPLOYMENT_WEBHOOK_SECRET - Your webhook secret
 *   npm_package_version - From package.json
 */

import https from 'node:https';
import http from 'node:http';

const webhookUrl = process.env.DEPLOYMENT_WEBHOOK_URL || 
  `${process.env.NEXT_PUBLIC_WEB_URL || 'https://edudashpro.org.za'}/api/notifications/deployment`;
const webhookSecret = process.env.DEPLOYMENT_WEBHOOK_SECRET;
const appVersion = process.env.npm_package_version || process.env.NEXT_PUBLIC_APP_VERSION || '1.0.2';
const environment = process.env.NEXT_PUBLIC_ENVIRONMENT || process.env.VERCEL_ENV || 'production';
const releaseType = String(process.env.RELEASE_TYPE || process.env.DEPLOY_RELEASE_TYPE || 'ota').toLowerCase();
const notifyUsers =
  String(process.env.DEPLOY_NOTIFY_USERS || '').toLowerCase() === 'true' ||
  String(process.env.NOTIFY_USERS || '').toLowerCase() === 'true' ||
  ['major', 'native', 'build', 'store'].includes(releaseType);
const platform = String(process.env.DEPLOY_PLATFORM || 'android').toLowerCase();
const packageId =
  process.env.EXPO_PUBLIC_ANDROID_PACKAGE ||
  process.env.NEXT_PUBLIC_ANDROID_PACKAGE ||
  'com.edudashpro.app';
const storeUrl =
  process.env.DEPLOY_STORE_URL ||
  process.env.STORE_URL ||
  `market://details?id=${packageId}`;
const mandatory =
  String(process.env.DEPLOY_MANDATORY_UPDATE || '').toLowerCase() === 'true' ||
  String(process.env.MANDATORY_UPDATE || '').toLowerCase() === 'true';
const buildNumber =
  process.env.ANDROID_VERSION_CODE ||
  process.env.EXPO_ANDROID_VERSION_CODE ||
  process.env.BUILD_NUMBER ||
  undefined;

// Skip if running locally
if (environment === 'development' && !webhookUrl.includes('vercel')) {
  console.log('⏭️  Skipping deployment notification (local environment)');
  process.exit(0);
}

if (!webhookSecret) {
  console.log('⚠️  DEPLOYMENT_WEBHOOK_SECRET not set - using anonymous mode (may fail on production)');
  console.log('   To enable authenticated notifications, set DEPLOYMENT_WEBHOOK_SECRET in Vercel env vars');
}

console.log(`🚀 Sending deployment notification to: ${webhookUrl}`);
console.log(`📦 Version: ${appVersion}`);
console.log(`🌍 Environment: ${environment}`);
console.log(`🔖 Release type: ${releaseType}`);
console.log(`📣 Notify users: ${notifyUsers}`);

const payload = JSON.stringify({
  version: appVersion,
  environment,
  timestamp: new Date().toISOString(),
  buildId: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
  branch: process.env.VERCEL_GIT_COMMIT_REF || 'main',
  release_type: releaseType,
  notify_users: notifyUsers,
  platform,
  package_id: packageId,
  store_url: storeUrl,
  mandatory,
  build_number: buildNumber,
});

const url = new URL(webhookUrl);
const protocol = url.protocol === 'https:' ? https : http;

const options = {
  hostname: url.hostname,
  port: url.port,
  path: url.pathname + url.search,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'User-Agent': 'EduDashPro-Deploy-Notifier/1.0',
    ...(webhookSecret && { 'Authorization': `Bearer ${webhookSecret}` }),
  },
  timeout: 10000,
};

const req = protocol.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const response = JSON.parse(data);
        console.log('✅ Deployment notification sent successfully!');
        console.log(`   Message: ${response.message || 'OK'}`);
        console.log(`   Version: ${response.version || appVersion}`);
        process.exit(0);
      } catch (error) {
        console.log('✅ Deployment notification sent (non-JSON response)');
        console.log(`   Response: ${data.substring(0, 100)}`);
        console.log(`   Parse error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(0);
      }
    } else {
      console.error(`❌ Failed to send deployment notification: HTTP ${res.statusCode}`);
      console.error(`   Response: ${data.substring(0, 200)}`);
      // Don't fail the build
      process.exit(0);
    }
  });
});

req.on('error', (error) => {
  console.error(`❌ Failed to send deployment notification: ${error.message}`);
  // Don't fail the build
  process.exit(0);
});

req.on('timeout', () => {
  req.destroy();
  console.error('❌ Deployment notification timed out (10s)');
  // Don't fail the build
  process.exit(0);
});

req.write(payload);
req.end();
