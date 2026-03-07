import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_API_URL = 'https://api.daily.co/v1';

interface TokenRequest {
  roomName: string;
  userName?: string;
  isOwner?: boolean;
  /** Only mute when explicitly requested by the client */
  startAudioOff?: boolean;
  /** Back-compat for older clients */
  start_audio_off?: boolean;
}

// Generate a meeting token for a participant
export async function POST(request: NextRequest) {
  try {
    if (!DAILY_API_KEY) {
      console.error('[Daily Token] DAILY_API_KEY is not configured. Please add your Daily.co API key to the environment variables.');
      return NextResponse.json({ 
        error: 'Video service not configured',
        message: 'Video calls are not available. Please contact your administrator to configure the video service.',
        code: 'DAILY_API_KEY_MISSING'
      }, { status: 503 });
    }

    const supabase = await createClient();
    
    // Use getUser() instead of getSession() for secure server-side auth
    // getSession() is not secure as it doesn't verify with Supabase Auth server
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('[Daily Token] Auth error:', authError.message);
      return NextResponse.json({ error: 'Authentication failed', details: authError.message }, { status: 401 });
    }

    if (!user) {
      console.error('[Daily Token] No authenticated user');
      return NextResponse.json({ error: 'Not authenticated. Please sign in again.' }, { status: 401 });
    }

    console.log('[Daily Token] Authenticated user:', user.id, user.email);

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('first_name, last_name, role, preschool_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[Daily Token] Profile fetch error:', profileError);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }

    if (!profile) {
      console.error('[Daily Token] Profile not found for user:', user.id);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const body: TokenRequest = await request.json();
    const { roomName, userName, isOwner } = body;
    const startAudioOff = body.startAudioOff ?? body.start_audio_off ?? false;

    if (!roomName) {
      return NextResponse.json({ error: 'Room name is required' }, { status: 400 });
    }

    // Determine if user should be owner (teachers are owners of their rooms)
    const shouldBeOwner = isOwner || ['teacher', 'principal', 'superadmin'].includes(profile.role);
    const displayName = userName || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Participant';

    console.log('[Daily Token] Creating token for room:', roomName, 'user:', displayName, 'isOwner:', shouldBeOwner);

    // Create meeting token via Daily.co API
    const dailyResponse = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: displayName,
          user_id: user.id,
          is_owner: shouldBeOwner,
          enable_screenshare: true,
          enable_recording: shouldBeOwner ? 'cloud' : undefined,
          start_video_off: false,
          start_audio_off: startAudioOff === true, // Only mute when explicitly requested
          exp: Math.floor(Date.now() / 1000) + 3600 * 3, // 3 hour token
        },
      }),
    });

    if (!dailyResponse.ok) {
      const errorData = await dailyResponse.json();
      console.error('[Daily Token] Daily.co token creation failed:', errorData);
      return NextResponse.json({ 
        error: 'Failed to create meeting token',
        details: errorData.error || errorData.info || 'Unknown error'
      }, { status: 500 });
    }

    const { token } = await dailyResponse.json();
    console.log('[Daily Token] Token created successfully for user:', user.id);

    return NextResponse.json({
      success: true,
      token,
      isOwner: shouldBeOwner,
      userName: displayName,
    });
  } catch (error) {
    console.error('[Daily Token] Error creating Daily token:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
