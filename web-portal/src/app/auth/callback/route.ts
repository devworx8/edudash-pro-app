import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { resolveIsRecoveryFlow } from '@/lib/auth/recoveryFlow';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  const isSignup = searchParams.get('signup') === 'true';
  const type = searchParams.get('type');
  const flow = searchParams.get('flow');
  const error_description = searchParams.get('error_description');
  const error_code = searchParams.get('error');

  // Handle OAuth errors
  if (error_code) {
    console.error('[Auth Callback] OAuth error:', error_code, error_description);
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(error_description || 'OAuth authentication failed')}`
    );
  }

  if (code) {
    // Create server-side Supabase client with proper cookie handling
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (error) {
            // Cookie setting can fail in some contexts
            console.error('[Auth Callback] Cookie setting error:', error);
          }
        },
      },
      auth: {
        storageKey: 'edudash-auth-session',
        flowType: 'pkce',
      },
    });

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && data.session) {
      console.log('[Auth Callback] Session established successfully');
      console.log('[Auth Callback] User:', data.user.email);
      
      // Check if this is a new user (just created)
      const isNewUser = data.user.created_at === data.user.last_sign_in_at;
      
      if (isNewUser) {
        console.log('[Auth Callback] New user detected - profile will be auto-created by trigger');
      }
      
      // Get user profile including role and preschool_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, preschool_id')
        .eq('id', data.user.id)
        .maybeSingle();

      const role = profile?.role;
      console.log('[Auth Callback] User role:', role);
      
      // Start trial for new independent users (no preschool_id) or explicit signup flows
      if ((isNewUser || isSignup) && profile && !profile.preschool_id && role === 'parent') {
        console.log(`[Auth Callback] Starting 7-day trial for ${isNewUser ? 'new' : 'signup'} independent user`);
        try {
          const { data: trialData, error: trialError } = await supabase.rpc('start_user_trial', {
            target_user_id: data.user.id,
            trial_days: 7,
            plan_tier: 'premium'
          });
          
          if (trialError) {
            console.error('[Auth Callback] Failed to start trial:', trialError);
            // Check if user already has trial
            if (!trialError.message?.includes('already has an active trial')) {
              console.error('[Auth Callback] Unexpected trial error:', trialError);
            }
          } else {
            console.log('[Auth Callback] ✅ 7-day Premium trial started for', data.user.email);
          }
        } catch (err) {
          console.error('[Auth Callback] Trial start error:', err);
          // Silent fail - don't block redirect
        }
      }

      // Role-based redirect
      const isRecovery = resolveIsRecoveryFlow({
        type,
        flow,
        recoverySentAt: (data.session.user as { recovery_sent_at?: string } | null)?.recovery_sent_at,
      });
      if (isRecovery) {
        return NextResponse.redirect(`${origin}/reset-password`);
      }

      // Role-based redirect
      // NOTE: For students/learners, redirect to generic /dashboard which will handle routing
      // Mobile app has full learner-dashboard; web version to be implemented
      const redirectPath = next 
        ? next 
        : role === 'parent' 
          ? '/dashboard/parent'
          : role === 'teacher'
            ? '/dashboard/teacher'
            : role === 'principal'
              ? '/dashboard/principal'
              : role === 'superadmin'
                ? '/admin'
                : role === 'student' || role === 'learner'
                  ? '/dashboard' // Generic dashboard handles learner routing
                  : '/dashboard';

      return NextResponse.redirect(`${origin}${redirectPath}`);
    }

    if (error) {
      console.error('[Auth Callback] Session exchange error:', error);
      return NextResponse.redirect(
        `${origin}/sign-in?error=${encodeURIComponent(error.message || 'Authentication failed')}`
      );
    }
  }

  // If there's no code and no error, redirect to sign-in
  return NextResponse.redirect(`${origin}/sign-in`);
}
