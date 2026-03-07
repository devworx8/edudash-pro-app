import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyDisplayToken } from '@/lib/display/token';
import { hashTrustedTvPairToken } from '@/lib/display/trustedTv.server';
import { fetchDisplayDataServer } from '../fetchDisplayDataServer';

/**
 * GET /api/display/data?pair=...
 *    or ?org=...&token=...&class=...
 *    or ?code=JOINCODE (short code from Get TV link; resolves to org+token server-side).
 * Returns display data for the room. No session required - used by the TV.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pairTokenParam = searchParams.get('pair');
    const codeParam = searchParams.get('code');
    let org: string | null = searchParams.get('org');
    let token: string | null = searchParams.get('token');
    let classId: string | null = searchParams.get('class') || null;

    const secret =
      process.env.DISPLAY_LINK_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) {
      return NextResponse.json({ error: 'Display not configured' }, { status: 503 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (pairTokenParam && pairTokenParam.trim().length > 0) {
      const tokenHash = hashTrustedTvPairToken(pairTokenParam);
      const { data: pairRow, error: pairError } = await supabase
        .from('display_trusted_tvs')
        .select('id, org_id, class_id, expires_at, revoked_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      const nowMs = Date.now();
      const expired = !pairRow?.expires_at || new Date(pairRow.expires_at).getTime() < nowMs;
      const revoked = !!pairRow?.revoked_at;

      if (pairError || !pairRow || expired || revoked) {
        return NextResponse.json({ error: 'Invalid or expired trusted TV pairing' }, { status: 403 });
      }

      org = String(pairRow.org_id || '');
      classId = pairRow.class_id ? String(pairRow.class_id) : null;
      token = null;

      // Non-blocking heartbeat update for paired TVs.
      void supabase
        .from('display_trusted_tvs')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', pairRow.id);
    } else if (codeParam && codeParam.trim().length > 0) {
      const code = codeParam.trim().toUpperCase();
      const { data: row, error } = await supabase
        .from('display_join_codes')
        .select('org_id, token, class_id, expires_at')
        .eq('code', code)
        .maybeSingle();

      if (error || !row || new Date(row.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Invalid or expired join code' }, { status: 403 });
      }
      org = row.org_id;
      token = row.token;
      if (row.class_id) classId = row.class_id;
    }

    if (!org || !token) {
      if (pairTokenParam && pairTokenParam.trim().length > 0) {
        if (!org) {
          return NextResponse.json({ error: 'Trusted TV pairing is missing organisation context' }, { status: 403 });
        }
        const data = await fetchDisplayDataServer(supabase, org, classId);
        return NextResponse.json(data);
      }
      return NextResponse.json(
        { error: 'Missing trusted pairing, org/token, or a valid join code. Use your TV link or join code.' },
        { status: 400 }
      );
    }

    const payload = verifyDisplayToken(token, secret);
    if (!payload || payload.org !== org) {
      return NextResponse.json({ error: 'Invalid or expired display link' }, { status: 403 });
    }

    const classIdToUse = classId || payload.class || null;
    const data = await fetchDisplayDataServer(supabase, org, classIdToUse);

    return NextResponse.json(data);
  } catch (e) {
    console.error('[display/data]', e);
    return NextResponse.json({ error: 'Failed to load display data' }, { status: 500 });
  }
}
