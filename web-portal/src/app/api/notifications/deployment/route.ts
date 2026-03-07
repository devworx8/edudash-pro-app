import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const MAJOR_RELEASE_TYPES = new Set(['major', 'native', 'build', 'store']);

const normalizeBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return false;
};

async function dispatchBuildUpdateNotification(input: {
  version: string;
  buildNumber?: string;
  platform: string;
  storeUrl: string;
  mandatory: boolean;
  releaseType: string;
}): Promise<{ sent: boolean; details?: unknown; reason?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { sent: false, reason: 'supabase_env_missing' };
  }

  // Build a lightweight service client for optional targeting diagnostics.
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let estimatedRecipients = 0;
  try {
    const { count } = await supabase
      .from('push_devices')
      .select('user_id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('platform', input.platform)
      .not('expo_push_token', 'is', null);
    estimatedRecipients = count || 0;
  } catch {
    // Non-blocking diagnostics only.
  }

  const dispatcherPayload = {
    event_type: 'build_update_available',
    platform: input.platform,
    version: input.version,
    build_number: input.buildNumber,
    store_url: input.storeUrl,
    mandatory: input.mandatory,
    send_immediately: true,
    include_email: false,
    custom_payload: {
      release_type: input.releaseType,
      version: input.version,
      build_number: input.buildNumber,
      store_url: input.storeUrl,
      platform: input.platform,
      mandatory: input.mandatory,
      estimated_recipients: estimatedRecipients,
    },
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/notifications-dispatcher`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body: JSON.stringify(dispatcherPayload),
  });

  const responseBody = await response.text().catch(() => '');
  if (!response.ok) {
    return {
      sent: false,
      reason: `dispatcher_http_${response.status}`,
      details: responseBody,
    };
  }

  let parsedBody: unknown = responseBody;
  try {
    parsedBody = responseBody ? JSON.parse(responseBody) : {};
  } catch {
    // leave as raw string
  }

  return { sent: true, details: parsedBody };
}

/**
 * POST /api/notifications/deployment
 * 
 * Receives deployment webhook notifications and optionally sends push notifications
 * 
 * Security: Requires DEPLOYMENT_WEBHOOK_SECRET to prevent unauthorized triggers
 * 
 * Usage:
 * 1. Set DEPLOYMENT_WEBHOOK_SECRET in Vercel env vars
 * 2. Called automatically by scripts/notify-deployment.js after build
 * 3. Or use Vercel Deploy Hooks to trigger manually
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret for security
    const authHeader = request.headers.get('authorization');
    const secret = process.env.DEPLOYMENT_WEBHOOK_SECRET;
    const currentEnvironment = process.env.NEXT_PUBLIC_ENVIRONMENT || process.env.VERCEL_ENV || 'development';

    // Only require auth if secret is configured AND in production
    // This allows builds to succeed even without the secret
    if (secret && currentEnvironment === 'production') {
      if (!authHeader || authHeader !== `Bearer ${secret}`) {
        console.warn('⚠️  Unauthorized deployment notification attempt');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    } else if (!secret) {
      console.log('ℹ️  DEPLOYMENT_WEBHOOK_SECRET not configured - accepting unauthenticated request');
    }

    // Get deployment info from request body
    const body = await request.json().catch(() => ({}));
    const version = body.version || process.env.NEXT_PUBLIC_APP_VERSION || 'latest';
    const environment = body.environment || process.env.NEXT_PUBLIC_ENVIRONMENT || 'production';
    const buildId = body.buildId || 'unknown';
    const branch = body.branch || 'main';
    const releaseType = String(body.release_type || body.releaseType || 'ota').toLowerCase();
    const platform = String(body.platform || 'android').toLowerCase();
    const mandatory = normalizeBoolean(body.mandatory);
    const notifyUsers = normalizeBoolean(body.notify_users) || normalizeBoolean(body.notifyUsers);
    const buildNumber = String(body.build_number || body.buildNumber || body.versionCode || '').trim() || undefined;
    const packageId =
      String(
        body.package_id ||
          body.packageId ||
          process.env.EXPO_PUBLIC_ANDROID_PACKAGE ||
          process.env.NEXT_PUBLIC_ANDROID_PACKAGE ||
          'com.edudashpro.app',
      ).trim();
    const playStoreMarketUrl = `market://details?id=${packageId}`;
    const playStoreHttpsUrl = `https://play.google.com/store/apps/details?id=${packageId}`;
    const storeUrl = String(body.store_url || body.storeUrl || playStoreMarketUrl).trim() || playStoreMarketUrl;
    const buildUpdatePushEnabled = process.env.BUILD_UPDATE_PUSH_ENABLED !== 'false';
    const shouldBroadcastBuildUpdate =
      buildUpdatePushEnabled &&
      environment === 'production' &&
      (notifyUsers || MAJOR_RELEASE_TYPES.has(releaseType));

    console.log('� Deployment notification received:', {
      version,
      environment,
      buildId: buildId.substring(0, 7),
      branch,
      releaseType,
      platform,
      notifyUsers,
      mandatory,
      shouldBroadcastBuildUpdate,
      buildUpdatePushEnabled,
      timestamp: new Date().toISOString(),
    });

    // TODO: Add your notification logic here:
    // - Send push notifications via Firebase (if enabled)
    // - Send to Slack/Discord webhooks
    // - Log to database for deployment history
    // - Trigger post-deployment tasks
    // - Clear caches
    // - Send team notifications

    let buildUpdateNotification: { sent: boolean; details?: unknown; reason?: string } | null = null;
    if (shouldBroadcastBuildUpdate) {
      try {
        buildUpdateNotification = await dispatchBuildUpdateNotification({
          version,
          buildNumber,
          platform,
          storeUrl,
          mandatory,
          releaseType,
        });
      } catch (notificationError) {
        buildUpdateNotification = {
          sent: false,
          reason:
            notificationError instanceof Error
              ? notificationError.message
              : 'build_update_dispatch_failed',
        };
      }
    }

    // Optional: Send to Slack/Discord
    const slackWebhook = process.env.SLACK_DEPLOYMENT_WEBHOOK;
    const discordWebhook = process.env.DISCORD_DEPLOYMENT_WEBHOOK;

    if (slackWebhook) {
      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚀 New deployment: EduDash Pro v${version} (${environment})`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*🚀 New Deployment*\n*Version:* ${version}\n*Environment:* ${environment}\n*Branch:* ${branch}\n*Build:* \`${buildId.substring(0, 7)}\``
              }
            }
          ]
        }),
      }).catch(err => console.warn('Slack notification failed:', err.message));
    }

    if (discordWebhook) {
      await fetch(discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '🚀 New Deployment',
            color: 0x00ff00,
            fields: [
              { name: 'Version', value: version, inline: true },
              { name: 'Environment', value: environment, inline: true },
              { name: 'Branch', value: branch, inline: true },
              { name: 'Build ID', value: buildId.substring(0, 7), inline: true },
            ],
            timestamp: new Date().toISOString(),
          }]
        }),
      }).catch(err => console.warn('Discord notification failed:', err.message));
    }

    return NextResponse.json({
      success: true,
      message: 'Deployment notification received and processed',
      version,
      environment,
      releaseType,
      platform,
      notifyUsers,
      buildUpdatePushEnabled,
      storeUrl,
      playStoreHttpsUrl,
      buildUpdateNotification,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Failed to process deployment notification:', error);
    
    return NextResponse.json(
      {
        error: 'Failed to process notification',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/deployment
 * 
 * Health check endpoint to verify the notification system
 */
export async function GET() {
  try {
    const firebaseConfigured = !!(
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_PRIVATE_KEY &&
      process.env.FIREBASE_CLIENT_EMAIL
    );
    
    const slackConfigured = !!process.env.SLACK_DEPLOYMENT_WEBHOOK;
    const discordConfigured = !!process.env.DISCORD_DEPLOYMENT_WEBHOOK;
    
    return NextResponse.json({
      status: 'ok',
      endpoint: 'deployment-notifications',
      timestamp: new Date().toISOString(),
      configuration: {
        firebase: firebaseConfigured,
        slack: slackConfigured,
        discord: discordConfigured,
      },
      message: firebaseConfigured
        ? 'Deployment notifications are fully configured'
        : 'Deployment webhook is active but push notifications not configured',
      requiredEnvVars: {
        firebase: [
          'FIREBASE_PROJECT_ID',
          'FIREBASE_PRIVATE_KEY',
          'FIREBASE_CLIENT_EMAIL',
        ],
        webhook: [
          'DEPLOYMENT_WEBHOOK_SECRET (recommended)',
        ],
        optional: [
          'SLACK_DEPLOYMENT_WEBHOOK',
          'DISCORD_DEPLOYMENT_WEBHOOK',
        ],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Configuration check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
