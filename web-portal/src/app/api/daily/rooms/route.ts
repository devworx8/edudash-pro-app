import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_API_URL = 'https://api.daily.co/v1';

interface CreateRoomRequest {
  name: string;
  classId?: string;
  preschoolId?: string; // Optional for P2P calls
  isPrivate?: boolean;
  expiryMinutes?: number;
  maxParticipants?: number;
  enableRecording?: boolean;
  enableScreenShare?: boolean;
  enableChat?: boolean;
  isP2P?: boolean; // Flag for peer-to-peer calls
}

// Tier-based time limits (in minutes) - enforced server-side
const TIER_MAX_DURATION: Record<string, number> = {
  free: 15,
  starter: 30,
  basic: 60,
  premium: 60,
  pro: 60,
  enterprise: 1440, // 24 hours (effectively unlimited)
};

// Create a new Daily.co room for class lessons
export async function POST(request: NextRequest) {
  try {
    // Check if Daily API key is configured
    if (!DAILY_API_KEY) {
      console.error('[Daily Rooms] DAILY_API_KEY is not configured. Please add your Daily.co API key to the environment variables.');
      return NextResponse.json({ 
        error: 'Video service not configured',
        message: 'Video calls are not available. Please contact your administrator to configure the video service.',
        code: 'DAILY_API_KEY_MISSING'
      }, { status: 503 });
    }

    const supabase = await createClient();
    
    // Use getUser() instead of getSession() for secure server-side auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('[Daily Rooms] Auth error:', authError.message);
      return NextResponse.json({ error: 'Authentication failed', details: authError.message }, { status: 401 });
    }

    if (!user) {
      console.log('[Daily Rooms] No authenticated user found');
      return NextResponse.json({ error: 'Not authenticated. Please sign in.' }, { status: 401 });
    }

    console.log('[Daily Rooms] Authenticated user:', user.id, user.email);

    // Verify user role - allow teachers, principals, superadmins, AND parents (for P2P calls)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, preschool_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[Daily Rooms] Profile error:', profileError);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }

    // Allow parents to create rooms for P2P calls
    const allowedRoles = ['teacher', 'principal', 'superadmin', 'parent'];
    if (!profile || !allowedRoles.includes(profile.role)) {
      console.log('[Daily Rooms] User role not authorized:', profile?.role);
      return NextResponse.json({ error: 'Not authorized to create call rooms' }, { status: 403 });
    }

    const body: CreateRoomRequest = await request.json();
    const {
      name,
      classId,
      preschoolId,
      isPrivate = true,
      expiryMinutes: requestedMinutes = 60,
      maxParticipants = 50,
      enableRecording = false,
      enableScreenShare = true,
      enableChat = true,
      isP2P = false,
    } = body;

    // Get the school's subscription tier to enforce time limits
    // For P2P calls without preschoolId, use default tier
    let subscriptionTier = 'starter';
    if (preschoolId) {
      const { data: school } = await supabase
        .from('preschools')
        .select('subscription_tier')
        .eq('id', preschoolId)
        .single();
      
      if (school?.subscription_tier) {
        subscriptionTier = String(school.subscription_tier).toLowerCase();
      }
    }

    // Enforce tier-based time limits (server-side validation)
    const maxAllowed = TIER_MAX_DURATION[subscriptionTier] || TIER_MAX_DURATION.starter;
    const expiryMinutes = Math.min(requestedMinutes, maxAllowed);
    
    console.log(`[Daily Rooms] Tier: ${subscriptionTier}, Requested: ${requestedMinutes}min, Allowed: ${maxAllowed}min, Using: ${expiryMinutes}min`);

    // Generate unique room name
    const roomName = isP2P 
      ? `edudash-p2p-${Date.now()}`
      : `edudash-${preschoolId?.slice(0, 8) || 'unknown'}-${Date.now()}`;

    // Create room via Daily.co API
    const dailyResponse = await fetch(`${DAILY_API_URL}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: roomName,
        privacy: isPrivate ? 'private' : 'public',
        properties: {
          max_participants: maxParticipants,
          enable_screenshare: enableScreenShare,
          enable_chat: enableChat,
          enable_knocking: isPrivate,
          enable_recording: enableRecording ? 'cloud' : undefined,
          exp: Math.floor(Date.now() / 1000) + (expiryMinutes * 60),
          eject_at_room_exp: true,
          // Customize for education
          start_video_off: false,
          start_audio_off: true, // Students join muted
          owner_only_broadcast: false,
          enable_prejoin_ui: false, // We'll use our own
          enable_network_ui: true,
          enable_pip_ui: true,
          lang: 'en',
        },
      }),
    });

    if (!dailyResponse.ok) {
      const errorData = await dailyResponse.json().catch(() => ({}));
      console.error('[Daily Rooms] Daily.co room creation failed:', {
        status: dailyResponse.status,
        statusText: dailyResponse.statusText,
        error: errorData,
      });
      
      // Provide more specific error messages based on Daily.co response
      let errorMessage = 'Failed to create room';
      if (dailyResponse.status === 401) {
        errorMessage = 'Daily.co API key is invalid. Please check your DAILY_API_KEY environment variable.';
      } else if (dailyResponse.status === 403) {
        errorMessage = 'Daily.co API access denied. Please verify your API key permissions.';
      } else if (dailyResponse.status === 429) {
        errorMessage = 'Too many requests. Please try again in a few moments.';
      } else if (errorData?.info) {
        errorMessage = errorData.info;
      } else if (errorData?.error) {
        errorMessage = errorData.error;
      }
      
      return NextResponse.json({ 
        error: errorMessage
      }, { status: dailyResponse.status || 500 });
    }

    const room = await dailyResponse.json();

    // Store room in database ONLY for class lessons (not P2P calls)
    let lessonRoom = null;
    if (!isP2P && preschoolId) {
      const { data, error: dbError } = await supabase
        .from('video_calls')
        .insert({
          title: name,
          class_id: classId || null,
          preschool_id: preschoolId,
          teacher_id: user.id,
          meeting_id: room.name,
          meeting_url: room.url,
          status: 'live', // Teacher is starting now, so it's live
          scheduled_start: new Date().toISOString(),
          scheduled_end: new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
          max_participants: maxParticipants,
          recording_enabled: enableRecording,
        })
        .select()
        .single();

      if (dbError) {
        console.error('Failed to store room in database:', dbError);
        // Still return the room URL even if DB fails
      } else {
        lessonRoom = data;
      }
    }

    // Send push notifications to participants
    // If classId is provided, notify all parents of students in that class
    // Otherwise, this is a P2P call (check if recipient info is in the request)
    try {
      if (classId) {
        // Get all students in the class
        const { data: students } = await supabase
          .from('students')
          .select('parent_id, guardian_id, first_name')
          .eq('class_id', classId)
          .eq('preschool_id', preschoolId);

        if (students && students.length > 0) {
          // Collect unique parent/guardian IDs
          const parentIds = new Set<string>();
          students.forEach(student => {
            if (student.parent_id) parentIds.add(student.parent_id);
            if (student.guardian_id) parentIds.add(student.guardian_id);
          });

          // Get caller name
          const callerName = profile?.role === 'teacher' 
            ? `Teacher ${user.email?.split('@')[0] || 'Teacher'}`
            : user.email?.split('@')[0] || 'Someone';

          // Send push notification to all parents via our notification API
          if (parentIds.size > 0) {
            await fetch(`${request.nextUrl.origin}/api/notifications/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userIds: Array.from(parentIds),
                title: `Live Lesson Starting`,
                body: `${callerName} is starting a live lesson in ${name}`,
                type: 'live-lesson',
                url: room.url,
                requireInteraction: true,
                data: {
                  roomUrl: room.url,
                  roomName: room.name,
                  callId: lessonRoom?.id || room.name,
                  classId,
                },
              }),
            });
            console.log(`[Daily Rooms] Sent notifications to ${parentIds.size} parents`);
          }
        }
      }
    } catch (notifError) {
      console.error('[Daily Rooms] Failed to send notifications:', notifError);
      // Don't fail the room creation if notifications fail
    }

    return NextResponse.json({
      success: true,
      room: {
        id: lessonRoom?.id || room.name,
        name: room.name,
        url: room.url,
        expiresAt: new Date(room.config?.exp * 1000 || Date.now() + expiryMinutes * 60 * 1000).toISOString(),
      },
    });
  } catch (error) {
    console.error('[Daily Rooms] Error creating Daily room:', error);
    return NextResponse.json({ 
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// List active rooms for a preschool
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Use getUser() instead of getSession() for secure server-side auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Daily Rooms GET] Auth error:', authError?.message);
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const preschoolId = searchParams.get('preschoolId');
    const classId = searchParams.get('classId');

    let query = supabase
      .from('video_calls')
      .select(`
        *,
        classes:classes!video_calls_class_id_fkey (name, grade_level),
        teacher:profiles!video_calls_teacher_id_fkey (first_name, last_name)
      `)
      .in('status', ['scheduled', 'live'])
      .order('scheduled_start', { ascending: true });

    if (preschoolId) {
      query = query.eq('preschool_id', preschoolId);
    }

    if (classId) {
      query = query.eq('class_id', classId);
    }

    const { data: rooms, error } = await query;

    if (error) {
      console.error('[Daily Rooms GET] Error fetching rooms:', error);
      return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 });
    }

    return NextResponse.json({ rooms });
  } catch (error) {
    console.error('[Daily Rooms GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
