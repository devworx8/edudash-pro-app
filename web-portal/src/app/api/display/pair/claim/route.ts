import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyDisplayToken } from '@/lib/display/token';
import {
  createTrustedTvPairToken,
  hashTrustedTvPairToken,
  resolveTrustedTvDurationDays,
  trustedTvExpiryIso,
} from '@/lib/display/trustedTv.server';

type PairClaimRequest = {
  code?: string | null;
  org?: string | null;
  token?: string | null;
  class?: string | null;
  deviceName?: string | null;
};

function sanitizeText(value: unknown, maxLen: number): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLen);
}

/**
 * POST /api/display/pair/claim
 * Claims a persistent trusted-TV pairing token.
 *
 * Input:
 * - { code } (from short join-code flow), OR
 * - { org, token, class? } (from existing 24h TV link flow)
 */
export async function POST(request: NextRequest) {
  try {
    const secret =
      process.env.DISPLAY_LINK_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) {
      return NextResponse.json({ error: 'Display pairing is not configured' }, { status: 503 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let body: PairClaimRequest = {};
    try {
      body = (await request.json()) as PairClaimRequest;
    } catch {
      body = {};
    }

    const code = sanitizeText(body.code, 16)?.toUpperCase() || null;
    let orgId: string | null = sanitizeText(body.org, 80);
    let token = sanitizeText(body.token, 1200);
    let classId = sanitizeText(body.class, 80);
    const deviceName = sanitizeText(body.deviceName, 80);

    let pairSource: 'code' | 'token' = 'token';

    if (code) {
      pairSource = 'code';
      const { data: codeRow, error: codeError } = await supabase
        .from('display_join_codes')
        .select('org_id, token, class_id, expires_at')
        .eq('code', code)
        .maybeSingle();

      if (codeError || !codeRow || new Date(codeRow.expires_at).getTime() < Date.now()) {
        return NextResponse.json({ error: 'Invalid or expired join code' }, { status: 403 });
      }

      orgId = String(codeRow.org_id || '');
      token = String(codeRow.token || '');
      classId = codeRow.class_id ? String(codeRow.class_id) : null;
    }

    if (!orgId || !token) {
      return NextResponse.json(
        { error: 'Provide a valid join code, or a valid org/token pair.' },
        { status: 400 },
      );
    }

    const payload = verifyDisplayToken(token, secret);
    if (!payload || payload.org !== orgId) {
      return NextResponse.json({ error: 'Invalid or expired display link' }, { status: 403 });
    }

    const effectiveClassId = classId || payload.class || null;
    const expiresInDays = resolveTrustedTvDurationDays();
    const expiresAt = trustedTvExpiryIso(expiresInDays);
    const userAgent = sanitizeText(request.headers.get('user-agent'), 240);

    let pairToken = '';
    let insertErrorMessage = '';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      pairToken = createTrustedTvPairToken();
      const tokenHash = hashTrustedTvPairToken(pairToken);
      const tokenHint = pairToken.slice(0, 10);

      const { error: insertError } = await supabase
        .from('display_trusted_tvs')
        .insert({
          org_id: orgId,
          class_id: effectiveClassId,
          token_hash: tokenHash,
          token_hint: tokenHint,
          pair_source: pairSource,
          paired_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          expires_at: expiresAt,
          device_name: deviceName,
          user_agent: userAgent,
        });

      if (!insertError) {
        return NextResponse.json({
          pairToken,
          orgId,
          classId: effectiveClassId,
          expiresAt,
          expiresInDays,
        });
      }

      insertErrorMessage = insertError.message || 'Failed to create trusted TV pairing';
    }

    return NextResponse.json({ error: insertErrorMessage }, { status: 500 });
  } catch (e) {
    console.error('[display/pair/claim]', e);
    return NextResponse.json({ error: 'Failed to claim trusted TV pairing' }, { status: 500 });
  }
}
