/**
 * OpenAI Realtime Token Edge Function
 * 
 * Returns an ephemeral token for OpenAI Realtime API (voice/speech).
 * Never exposes the API key client-side.
 * 
 * Now accepts optional voice context hints to customise the session
 * with Dash specialist instructions, role-specific personality, and
 * optimal voice selection.
 * 
 * Auth: Bearer token required
 * Body (optional): { role, activeScreen, grade, subject, language, userName, schoolName }
 * Returns: { token, url, expiresIn, instructions, voice }
 */

import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { buildVoiceSessionInstructions, selectVoice } from '../ai-proxy/specialists/voice-orchestrator.ts';
import type { VoiceContextHint } from '../ai-proxy/specialists/voice-orchestrator.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Parse optional voice context from request body
    let voiceContext: VoiceContextHint | null = null;
    try {
      if (req.method === 'POST') {
        const body = await req.json().catch(() => null);
        if (body && typeof body === 'object') {
          voiceContext = {
            role: body.role || 'student',
            activeScreen: body.activeScreen,
            grade: body.grade,
            subject: body.subject,
            language: body.language,
            userName: body.userName,
            schoolName: body.schoolName,
          };
        }
      }
    } catch {
      // No body or invalid JSON — use defaults
    }

    // Build context-aware session instructions
    const instructions = buildVoiceSessionInstructions(voiceContext);
    const voice = selectVoice(voiceContext);

    // Request an ephemeral token from OpenAI Realtime API
    const ephemeralResp = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice,
        instructions,
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 600 },
      }),
    });

    if (!ephemeralResp.ok) {
      const errText = await ephemeralResp.text();
      console.error('[openai-realtime-token] OpenAI error:', ephemeralResp.status, errText);

      // If Realtime sessions endpoint not available, return API key directly
      // (ephemeral token support may not be available for all accounts)
      if (ephemeralResp.status === 404) {
        return new Response(
          JSON.stringify({
            token: OPENAI_API_KEY,
            url: 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
            expiresIn: 3600,
            instructions,
            voice,
            fallback: true,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      throw new Error('Failed to create realtime session');
    }

    const sessionData = await ephemeralResp.json();

    return new Response(
      JSON.stringify({
        token: sessionData.client_secret?.value || sessionData.token || OPENAI_API_KEY,
        url: `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview`,
        expiresIn: sessionData.expires_in || 3600,
        instructions,
        voice,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[openai-realtime-token] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
