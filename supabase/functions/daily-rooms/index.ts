/**
 * Daily.co Room Creation Edge Function
 * 
 * Creates Daily.co video call rooms for mobile app calls.
 * Mirrors functionality from web/src/app/api/daily/rooms/route.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.12';

const DAILY_API_KEY = Deno.env.get('DAILY_API_KEY');
const DAILY_API_URL = 'https://api.daily.co/v1';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface CreateRoomRequest {
  name: string;
  classId?: string;
  preschoolId?: string;
  isPrivate?: boolean;
  expiryMinutes?: number;
  maxParticipants?: number;
  enableRecording?: boolean;
  enableScreenShare?: boolean;
  enableChat?: boolean;
  isP2P?: boolean;
}

// Tier-based time limits (in minutes)
const TIER_MAX_DURATION: Record<string, number> = {
  free: 15,
  school_starter: 30,
  school_premium: 60,
  school_pro: 60,
  school_enterprise: 1440,
  // Legacy names (fallback until all DB records are migrated)
  starter: 30,
  basic: 60,
  premium: 60,
  pro: 60,
  enterprise: 1440,
};

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Health check endpoint
  const url = new URL(req.url);
  if (url.pathname.endsWith('/health')) {
    return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Check if Daily API key is configured
    if (!DAILY_API_KEY) {
      console.error('[Daily Rooms] DAILY_API_KEY is not configured');
      return new Response(
        JSON.stringify({
          error: 'Video service not configured',
          message: 'Video calls are not available. Please contact your administrator.',
          code: 'DAILY_API_KEY_MISSING',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get authorization token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Create Supabase client with user token
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify the user token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[Daily Rooms] Auth error:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Authentication failed', details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Daily Rooms] Authenticated user:', user.id, user.email);

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, preschool_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[Daily Rooms] Profile error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Allow parents to create rooms for P2P calls
    const allowedRoles = ['teacher', 'principal', 'superadmin', 'parent'];
    if (!profile || !allowedRoles.includes(profile.role)) {
      console.log('[Daily Rooms] User role not authorized:', profile?.role);
      return new Response(
        JSON.stringify({ error: 'Not authorized to create call rooms' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: CreateRoomRequest = await req.json();
    const {
      name,
      preschoolId,
      isPrivate = true,
      expiryMinutes: requestedMinutes = 60,
      maxParticipants = 50,
      enableRecording = false,
      enableScreenShare = true,
      enableChat = true,
      isP2P = false,
    } = body;

    // Get school's subscription tier for time limits
    let subscriptionTier = 'school_starter';
    const schoolId = preschoolId || profile.preschool_id;
    
    if (schoolId) {
      const { data: school } = await supabase
        .from('preschools')
        .select('subscription_tier')
        .eq('id', schoolId)
        .single();
      
      if (school?.subscription_tier) {
        subscriptionTier = school.subscription_tier;
      }
    }

    // Calculate actual duration based on tier
    const tierMax = TIER_MAX_DURATION[subscriptionTier] || TIER_MAX_DURATION.school_starter;
    const actualMinutes = isP2P ? Math.min(requestedMinutes, tierMax) : Math.min(requestedMinutes, tierMax);
    const expiryTime = Math.floor(Date.now() / 1000) + actualMinutes * 60;

    console.log('[Daily Rooms] Creating room:', {
      name,
      tier: subscriptionTier,
      requestedMinutes,
      actualMinutes,
      isP2P,
    });

    // Create room via Daily.co API
    const roomProperties: Record<string, unknown> = {
      name: `${name}-${Date.now()}`, // Ensure unique name
      privacy: isPrivate ? 'private' : 'public',
      properties: {
        max_participants: maxParticipants,
        exp: expiryTime,
        enable_screenshare: enableScreenShare,
        enable_chat: enableChat,
        enable_knocking: isPrivate,
        start_video_off: false,
        start_audio_off: false,
        enable_recording: enableRecording ? 'cloud' : undefined,
        owner_only_broadcast: false,
        eject_at_room_exp: true,
        // Krisp noise cancellation — critical for school environments
        enable_noise_cancellation_ui: true,
        // Enable network quality monitoring for call quality indicators
        enable_network_ui: true,
      },
    };

    const dailyResponse = await fetch(`${DAILY_API_URL}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify(roomProperties),
    });

    if (!dailyResponse.ok) {
      const errorData = await dailyResponse.json();
      console.error('[Daily Rooms] Daily.co room creation failed:', errorData);
      return new Response(
        JSON.stringify({
          error: 'Failed to create room',
          details: errorData.error || errorData.info || 'Unknown error',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const room = await dailyResponse.json();
    console.log('[Daily Rooms] Room created:', room.name, room.url);

    return new Response(
      JSON.stringify({
        success: true,
        room: {
          name: room.name,
          url: room.url,
          expiryMinutes: actualMinutes,
          maxParticipants,
          tier: subscriptionTier,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Daily Rooms] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
