import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * POST /api/notifications/subscribe
 * 
 * Subscribe a user to push notifications and specific topics
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[Subscribe API] Request body:', JSON.stringify(body, null, 2));
    
    const { subscription, topics, userId } = body;

    // Validate subscription object
    if (!subscription || typeof subscription !== 'object') {
      console.error('[Subscribe API] Invalid subscription object:', subscription);
      return NextResponse.json(
        { error: 'Subscription object required' },
        { status: 400 }
      );
    }

    if (!subscription.endpoint) {
      console.error('[Subscribe API] Missing endpoint');
      return NextResponse.json(
        { error: 'Subscription endpoint required' },
        { status: 400 }
      );
    }

    if (!subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      console.error('[Subscribe API] Missing subscription keys');
      return NextResponse.json(
        { error: 'Subscription keys (p256dh, auth) required' },
        { status: 400 }
      );
    }

    // Create server-side Supabase client with service role key (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Try to get user from session if not provided
    let effectiveUserId = userId;
    
    if (!effectiveUserId) {
      try {
        // Get auth header from request
        const authHeader = request.headers.get('authorization');
        
        if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const { data: { user } } = await supabase.auth.getUser(token);
          if (user) {
            effectiveUserId = user.id;
            console.log('[Subscribe API] Got user from Authorization header:', effectiveUserId);
          }
        }
        
        // Fallback: Try to get from cookies
        if (!effectiveUserId) {
          const cookieStore = await cookies();
          const accessToken = cookieStore.get('sb-access-token')?.value ||
                             cookieStore.get('sb-lvvvjywrmpcqrpvuptdi-auth-token')?.value;
          
          if (accessToken) {
            try {
              // Try to parse the cookie value if it's JSON
              const tokenData = accessToken.startsWith('{') ? JSON.parse(accessToken) : { access_token: accessToken };
              const token = tokenData.access_token || tokenData;
              
              const { data: { user } } = await supabase.auth.getUser(token);
              if (user) {
                effectiveUserId = user.id;
                console.log('[Subscribe API] Got user from session cookie:', effectiveUserId);
              }
            } catch (parseError) {
              console.warn('[Subscribe API] Could not parse auth token:', parseError);
            }
          }
        }
      } catch (err) {
        console.warn('[Subscribe API] Could not get user from session:', err);
      }
    }

    // Check if this is a system subscription (updates topic without user)
    const isSystemSubscription = !effectiveUserId && topics?.includes('updates');
    
    if (isSystemSubscription) {
      // Allow NULL user_id for updates/deployment notifications
      effectiveUserId = null;
      console.log('[Subscribe API] Creating system subscription for deployment notifications');
    } else if (!effectiveUserId) {
      // For non-system subscriptions, user must be logged in
      console.error('[Subscribe API] No user ID available for user subscription');
      return NextResponse.json(
        { error: 'User must be logged in to subscribe to notifications' },
        { status: 401 }
      );
    }

    console.log('[Subscribe API] Storing subscription:', {
      userId: effectiveUserId,
      endpoint: subscription.endpoint.substring(0, 50) + '...',
      hasKeys: !!(subscription.keys?.p256dh && subscription.keys?.auth)
    });

    // Store subscription in database
    // Use endpoint as unique key since same device can have different users
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: effectiveUserId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      topics: topics || ['test', 'updates'],
      is_active: true,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'endpoint',
      ignoreDuplicates: false,
    });

    if (error) {
      console.error('[Subscribe API] Failed to store subscription:', error);
      return NextResponse.json(
        { error: `Failed to store subscription: ${error.message}` },
        { status: 500 }
      );
    }

    console.log('[Subscribe API] Subscription stored successfully');

    return NextResponse.json({
      success: true,
      message: 'Subscribed to notifications',
      topics: topics || ['test', 'updates'],
    });
  } catch (error) {
    console.error('[Subscribe API] Subscription error:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown'}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications/subscribe
 * 
 * Unsubscribe from push notifications
 */
export async function DELETE(request: NextRequest) {
  try {
    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint required' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) {
      console.error('Failed to delete subscription:', error);
      return NextResponse.json(
        { error: 'Failed to unsubscribe' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Unsubscribed from notifications',
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
