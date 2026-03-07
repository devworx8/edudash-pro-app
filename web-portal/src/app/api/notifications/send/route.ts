import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Dynamic import for web-push to handle server-side only
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let webpush: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  webpush = require('web-push');
} catch (e) {
  console.warn('web-push not available');
}

// Configure VAPID keys
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = 'mailto:support@edudashpro.org.za';

// Initialize web-push
if (VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export type NotificationType = 'call' | 'message' | 'announcement' | 'homework' | 'general';

interface SendNotificationRequest {
  userId?: string;
  userIds?: string[];
  preschoolId?: string;
  topic?: string;
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
  type?: NotificationType;
  requireInteraction?: boolean;
  data?: Record<string, any>;
}

/**
 * POST /api/notifications/send
 * 
 * Send push notifications to specific users, a preschool, or a topic
 */
export async function POST(request: NextRequest) {
  try {
    if (!VAPID_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'Push notifications not configured (missing VAPID_PRIVATE_KEY)' },
        { status: 500 }
      );
    }

    const body: SendNotificationRequest = await request.json();
    console.log('[Send API] Request received:', JSON.stringify(body, null, 2));
    
    const { userId, userIds, preschoolId, topic, title, body: notifBody, icon, url, tag, type, requireInteraction, data } = body;

    if (!title || !notifBody) {
      console.error('[Send API] Missing title or body');
      return NextResponse.json(
        { error: 'Title and body are required' },
        { status: 400 }
      );
    }

    // Create server-side Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Build query for subscriptions
    let query = supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .eq('is_active', true);

    if (userId) {
      console.log('[Send API] Filtering by userId:', userId);
      query = query.eq('user_id', userId);
    } else if (userIds && userIds.length > 0) {
      console.log('[Send API] Filtering by userIds:', userIds);
      query = query.in('user_id', userIds);
    } else if (preschoolId) {
      console.log('[Send API] Filtering by preschoolId:', preschoolId);
      query = query.eq('preschool_id', preschoolId);
    } else if (topic) {
      console.log('[Send API] Filtering by topic:', topic);
      query = query.contains('topics', [topic]);
    } else {
      console.error('[Send API] No target specified');
      return NextResponse.json(
        { error: 'Must specify userId, userIds, preschoolId, or topic' },
        { status: 400 }
      );
    }

    const { data: subscriptions, error: fetchError } = await query;

    if (fetchError) {
      console.error('[Send API] Failed to fetch subscriptions:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch subscriptions' },
        { status: 500 }
      );
    }

    console.log('[Send API] Found subscriptions:', subscriptions?.length || 0);

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'No subscriptions found',
      });
    }

    // Prepare notification payload
    const payload = JSON.stringify({
      title,
      body: notifBody,
      icon: icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag || `notif-${Date.now()}`,
      requireInteraction: requireInteraction || false,
      data: {
        url: url || '/dashboard',
        type: type || 'general',
        ...data,
      },
    });

    // Send to all subscriptions
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload
          );
          return { success: true, userId: sub.user_id };
        } catch (err: any) {
          // If subscription is invalid, remove it
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint);
          }
          return { success: false, userId: sub.user_id, error: err.message };
        }
      })
    );

    const sent = results.filter((r) => r.status === 'fulfilled' && (r.value as any).success).length;
    const failed = results.filter((r) => r.status === 'rejected' || !(r.value as any)?.success).length;

    // Log notification event
    await supabase.from('notification_logs').insert({
      type: type || 'general',
      title,
      body: notifBody,
      sent_count: sent,
      failed_count: failed,
      target_type: userId ? 'user' : userIds ? 'users' : preschoolId ? 'preschool' : 'topic',
      target_value: userId || preschoolId || topic || null,
    });

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: subscriptions.length,
    });
  } catch (error) {
    console.error('Send notification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
