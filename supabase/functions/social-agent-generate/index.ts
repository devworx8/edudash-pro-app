import { serve } from 'https://deno.land/std@0.214.0/http/server.ts';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ALLOW_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const CategorySchema = z.enum([
  'word_of_day',
  'study_tip',
  'parent_tip',
  'value_of_week',
  'school_update',
  'custom',
]);

const RequestSchema = z.object({
  category: CategorySchema.optional(),
  context: z.string().max(4000).optional(),
  connection_id: z.string().uuid().optional(),
  scheduled_at: z.string().datetime().optional(),
  require_approval: z.boolean().optional(),
});

const OutputSchema = z.object({
  message: z.string().min(1),
  hashtags: z.array(z.string()).optional().default([]),
  category: CategorySchema.optional(),
  safety: z
    .object({
      requires_approval: z.boolean().optional(),
      reason: z.string().optional(),
    })
    .optional(),
});

function extractJsonObject(text: string): unknown | null {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  // Fast-path
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try { return JSON.parse(trimmed); } catch { /* continue */ }
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const candidate = trimmed.slice(first, last + 1);
  try { return JSON.parse(candidate); } catch { return null; }
}

async function resolveOrgAndProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  const byAuthUserId = await supabase
    .from('profiles')
    .select('id, role, organization_id, preschool_id')
    .eq('auth_user_id', userId)
    .maybeSingle();

  const profile = byAuthUserId.data?.id
    ? byAuthUserId.data
    : (
      await supabase
        .from('profiles')
        .select('id, role, organization_id, preschool_id')
        .eq('id', userId)
        .maybeSingle()
    ).data;

  const organizationId = (profile?.organization_id || profile?.preschool_id) as string | null;
  return { profile, organizationId };
}

function normalizeHashtags(src: string[]): string[] {
  const cleaned = (src || [])
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t.replace(/^#+/, '')}`))
    .map((t) => t.replace(/\s+/g, ''));

  // De-dupe, preserve order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of cleaned) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, 5);
}

function buildFacebookMessage(message: string, hashtags: string[]): string {
  const base = (message || '').trim();
  const tags = normalizeHashtags(hashtags);
  if (!tags.length) return base;
  return `${base}\n\n${tags.join(' ')}`.trim();
}

type AiProviderResult = { provider: 'anthropic' | 'openai'; model: string; output: z.infer<typeof OutputSchema>; rawText: string };

async function generateWithAnthropic(systemPrompt: string, userPrompt: string): Promise<AiProviderResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY');
  }
  const modelName = (Deno.env.get('SOCIAL_AGENT_MODEL') || Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001').trim();

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 900,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Anthropic error: ${resp.status} ${text}`);
  }

  const json = (() => { try { return JSON.parse(text) as any; } catch { return null; } })();
  const rawText = String(json?.content?.[0]?.text ?? '').trim();
  const parsedJson = extractJsonObject(rawText);
  const parsed = OutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error('AI output was not valid JSON for expected schema');
  }

  return { provider: 'anthropic', model: modelName, output: parsed.data, rawText };
}

async function generateWithOpenAI(systemPrompt: string, userPrompt: string): Promise<AiProviderResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY') || '';
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }
  const modelName = (Deno.env.get('SOCIAL_AGENT_MODEL') || 'gpt-4o-mini').trim();

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0.7,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`OpenAI error: ${resp.status} ${text}`);
  }

  const json = (() => { try { return JSON.parse(text) as any; } catch { return null; } })();
  const rawText = String(json?.choices?.[0]?.message?.content ?? '').trim();
  const parsedJson = extractJsonObject(rawText);
  const parsed = OutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error('AI output was not valid JSON for expected schema');
  }

  return { provider: 'openai', model: modelName, output: parsed.data, rawText };
}

async function generateSocialPost(systemPrompt: string, userPrompt: string): Promise<AiProviderResult> {
  const hasAnthropic = !!(Deno.env.get('ANTHROPIC_API_KEY') || '');
  const hasOpenAI = !!(Deno.env.get('OPENAI_API_KEY') || '');

  if (hasAnthropic) return generateWithAnthropic(systemPrompt, userPrompt);
  if (hasOpenAI) return generateWithOpenAI(systemPrompt, userPrompt);

  throw new Error('No AI provider configured (ANTHROPIC_API_KEY or OPENAI_API_KEY)');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(500, { error: 'server_misconfigured', message: 'Missing Supabase env' });
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer', '').trim();
    if (!token) {
      return jsonResponse(401, { error: 'unauthorized' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse(401, { error: 'unauthorized' });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(400, { error: 'invalid_request', details: parsed.error.flatten() });
    }

    const { profile, organizationId } = await resolveOrgAndProfile(supabase, userData.user.id);
    if (!profile || !organizationId) {
      return jsonResponse(403, { error: 'organization_required' });
    }

    const role = String(profile.role || '');
    const allowedRoles = new Set(['principal', 'principal_admin', 'admin', 'preschool_admin', 'superadmin', 'super_admin']);
    if (!allowedRoles.has(role)) {
      return jsonResponse(403, { error: 'forbidden', message: 'Principal/admin role required' });
    }

    const requestedCategory = parsed.data.category || 'study_tip';

    // Load organization context (best-effort)
    const orgRes = await supabase
      .from('organizations')
      .select('id, name, timezone, locale, branding, brand_colors')
      .eq('id', organizationId)
      .maybeSingle();
    const orgName = orgRes.data?.name || 'Your School';
    const orgTimezone = orgRes.data?.timezone || 'Africa/Johannesburg';

    // Load agent settings (best-effort)
    const settingsRes = await supabase
      .from('social_agent_settings')
      .select('brand_voice, require_approval_for_school_updates')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const brandVoice = (settingsRes.data?.brand_voice ?? {}) as Record<string, unknown>;
    const requireApprovalForSchoolUpdates = settingsRes.data?.require_approval_for_school_updates ?? true;

    // Pick connection
    let connectionId = parsed.data.connection_id || null;
    if (connectionId) {
      const connCheck = await supabase
        .from('social_connections')
        .select('id, page_id, page_name')
        .eq('id', connectionId)
        .eq('organization_id', organizationId)
        .eq('platform', 'facebook_page')
        .eq('is_active', true)
        .maybeSingle();
      if (!connCheck.data?.id) {
        return jsonResponse(400, { error: 'invalid_connection', message: 'Facebook connection not found or inactive' });
      }
    } else {
      const connPick = await supabase
        .from('social_connections')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('platform', 'facebook_page')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      connectionId = connPick.data?.id || null;
    }

    if (!connectionId) {
      return jsonResponse(400, { error: 'no_connection', message: 'Connect a Facebook Page first' });
    }

    let context = (parsed.data.context || '').trim();

    // Smart default: for school updates, pull in recent announcements and upcoming events
    // so principals don't have to copy/paste context manually.
    if (!context && requestedCategory === 'school_update') {
      const lines: string[] = [];

      try {
        const ann = await supabase
          .from('announcements')
          .select('title, content, published_at, priority')
          .eq('preschool_id', organizationId)
          .eq('is_published', true)
          .order('published_at', { ascending: false })
          .limit(3);
        if (!ann.error && ann.data?.length) {
          lines.push('Recent announcements:');
          for (const a of ann.data as any[]) {
            const snippet = String(a.content || '').replace(/\s+/g, ' ').trim().slice(0, 220);
            lines.push(`- ${String(a.title || 'Announcement').trim()}: ${snippet}`);
          }
          lines.push('');
        }
      } catch {
        // non-fatal
      }

      const todayYMD = new Date().toISOString().slice(0, 10);

      try {
        const ex = await supabase
          .from('school_excursions')
          .select('title, excursion_date, destination, status')
          .eq('preschool_id', organizationId)
          .gte('excursion_date', todayYMD)
          .order('excursion_date', { ascending: true })
          .limit(2);
        if (!ex.error && ex.data?.length) {
          lines.push('Upcoming excursions:');
          for (const e of ex.data as any[]) {
            lines.push(`- ${String(e.title || 'Excursion').trim()} on ${e.excursion_date} to ${String(e.destination || '').trim()}`);
          }
          lines.push('');
        }
      } catch {
        // non-fatal
      }

      try {
        const mt = await supabase
          .from('school_meetings')
          .select('title, meeting_date, start_time, meeting_type, location, is_virtual')
          .eq('preschool_id', organizationId)
          .gte('meeting_date', todayYMD)
          .order('meeting_date', { ascending: true })
          .limit(2);
        if (!mt.error && mt.data?.length) {
          lines.push('Upcoming meetings:');
          for (const m of mt.data as any[]) {
            const where = m.is_virtual ? 'Online' : String(m.location || '').trim() || 'On-site';
            lines.push(`- ${String(m.title || 'Meeting').trim()} on ${m.meeting_date} at ${String(m.start_time || '').slice(0, 5)} (${String(m.meeting_type || 'other')}) - ${where}`);
          }
          lines.push('');
        }
      } catch {
        // non-fatal
      }

      context = lines.join('\n').trim();
    }

    const recentRes = await supabase
      .from('social_posts')
      .select('category, created_at, content')
      .eq('organization_id', organizationId)
      .eq('platform', 'facebook_page')
      .order('created_at', { ascending: false })
      .limit(6);
    const recentPosts = (recentRes.data || [])
      .map((p: any, idx: number) => {
        const snippet = String(p.content || '').replace(/\s+/g, ' ').trim().slice(0, 280);
        return `${idx + 1}. [${p.category || 'unknown'}] ${snippet}`;
      })
      .join('\n');

    const systemPrompt = [
      'You are Dash Social Agent for a school Facebook Page.',
      '',
      'OUTPUT FORMAT: Return ONLY a JSON object (no markdown, no extra text):',
      '{',
      '  "message": "string",',
      '  "hashtags": ["#tag1", "#tag2"],',
      '  "category": "word_of_day|study_tip|parent_tip|value_of_week|school_update|custom",',
      '  "safety": { "requires_approval": boolean, "reason": "string" }',
      '}',
      '',
      'SAFETY RULES (non-negotiable):',
      '- Do NOT include any personal data about students/parents/staff (no names, no IDs, no phone numbers, no addresses).',
      '- Do NOT mention individual student performance, behavior, or attendance.',
      '- Do NOT claim specific events/results unless explicitly provided in CONTEXT.',
      '- Keep it friendly, practical, and concise. Avoid spam.',
      '- Do NOT say you are an AI.',
      '',
      `School: ${orgName}`,
      `Timezone: ${orgTimezone}`,
      `Brand voice (JSON): ${JSON.stringify(brandVoice)}`,
    ].join('\n');

    const userPrompt = [
      `Create a ${requestedCategory} post for the school Facebook Page.`,
      '',
      'Content requirements:',
      '- 1 to 3 short paragraphs.',
      '- Max 900 characters.',
      '- 0 to 3 hashtags.',
      '- South African English tone.',
      '',
      recentPosts ? `Recent posts (avoid repeating the same ideas/wording):\n${recentPosts}\n` : '',
      context ? `CONTEXT (may be empty):\n${context}` : 'CONTEXT: (none)',
      '',
      'Return the JSON now.',
    ].join('\n');

    const ai = await generateSocialPost(systemPrompt, userPrompt);
    const category = ai.output.category || requestedCategory;

    const defaultRequiresApproval =
      category === 'school_update'
        ? requireApprovalForSchoolUpdates
        : category === 'custom';

    const aiRequiresApproval =
      parsed.data.require_approval ??
      ai.output.safety?.requires_approval ??
      defaultRequiresApproval ??
      false;

    const scheduledAt = parsed.data.scheduled_at || null;
    const status = scheduledAt
      ? 'scheduled'
      : aiRequiresApproval
        ? 'pending_approval'
        : 'draft';

    const finalContent = buildFacebookMessage(ai.output.message, ai.output.hashtags || []);

    const insert = await supabase
      .from('social_posts')
      .insert({
        organization_id: organizationId,
        connection_id: connectionId,
        platform: 'facebook_page',
        category,
        status,
        content: finalContent,
        requires_approval: aiRequiresApproval,
        scheduled_at: scheduledAt,
        ai_metadata: {
          provider: ai.provider,
          model: ai.model,
          prompt_version: 'v1',
          generated_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
        },
        created_by: profile.id,
      })
      .select('*')
      .single();

    if (insert.error) {
      return jsonResponse(500, { error: 'db_error', message: insert.error.message });
    }

    return jsonResponse(200, {
      success: true,
      post: insert.data,
      ai: {
        provider: ai.provider,
        model: ai.model,
        category,
        requires_approval: aiRequiresApproval,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      error: 'social_agent_generate_error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
