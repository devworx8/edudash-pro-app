import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createDisplayToken } from '@/lib/display/token';
import { resolveTrustedTvDurationDays } from '@/lib/display/trustedTv.server';
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const JOIN_CODE_LENGTH = 6;
const EXPIRY_HOURS = 24;

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(JOIN_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += chars[bytes[i]! % chars.length];
  return code;
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key);
}

async function resolveOrgIdForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, preschool_id')
    .or(`id.eq.${userId},auth_user_id.eq.${userId}`)
    .maybeSingle();
  let org = profile?.organization_id || profile?.preschool_id || null;
  if (org) return org;

  const serviceClient = getServiceClient();
  if (!serviceClient) return null;

  const { data: serviceProfile } = await serviceClient
    .from('profiles')
    .select('organization_id, preschool_id')
    .or(`id.eq.${userId},auth_user_id.eq.${userId}`)
    .maybeSingle();
  org = serviceProfile?.organization_id || serviceProfile?.preschool_id || null;
  if (org) return org;

  const { data: teacherRow } = await serviceClient
    .from('teachers')
    .select('preschool_id')
    .or(`user_id.eq.${userId},auth_user_id.eq.${userId}`)
    .maybeSingle();
  if (teacherRow?.preschool_id) return teacherRow.preschool_id;

  const { data: orgMember } = await serviceClient
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return orgMember?.organization_id || null;
}

/**
 * GET /api/display/link
 * Returns display URL, short-lived token, and a join code so the TV can use either the link or the code.
 * Requires an authenticated session (teacher or principal).
 */
export async function GET(request: Request) {
  try {
    const cookieClient = await createClient();
    let authenticatedClient: SupabaseClient = cookieClient;
    let userId: string | null = null;
    let orgId: string | null = null;

    const {
      data: { session },
    } = await cookieClient.auth.getSession();

    if (session?.user?.id) {
      userId = session.user.id;
      orgId = await resolveOrgIdForUser(cookieClient, userId);
    } else {
      const bearerToken = getBearerToken(request);
      if (!bearerToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
      }

      const bearerClient = createServiceClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
          },
        },
      });

      const { data: bearerUserData, error: bearerUserError } = await bearerClient.auth.getUser(bearerToken);
      if (bearerUserError || !bearerUserData?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      userId = bearerUserData.user.id;
      orgId = await resolveOrgIdForUser(bearerClient, userId);
      authenticatedClient = bearerClient;
    }

    if (!userId || !orgId) {
      return NextResponse.json({ error: 'No organization linked to your account' }, { status: 400 });
    }

    const secret =
      process.env.DISPLAY_LINK_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) {
      return NextResponse.json(
        { error: 'Display link not configured. Set DISPLAY_LINK_SECRET or SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('class') || undefined;

    const token = createDisplayToken({ org: orgId, class: classId }, secret);
    const base = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || '';
    const path = classId ? `/display?org=${orgId}&class=${classId}&token=${encodeURIComponent(token)}` : `/display?org=${orgId}&token=${encodeURIComponent(token)}`;
    const url = base ? `${base.replace(/\/$/, '')}${path}` : path;

    const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000);
    let joinCode: string | null = null;

    try {
      joinCode = generateJoinCode();
      const { error: insertError } = await authenticatedClient.from('display_join_codes').insert({
        code: joinCode,
        org_id: orgId,
        token,
        class_id: classId || null,
        expires_at: expiresAt.toISOString(),
      });
      if (insertError) {
        joinCode = null;
      }
    } catch {
      joinCode = null;
    }

    return NextResponse.json({
      url,
      token,
      joinCode: joinCode ?? undefined,
      expiresIn: '24h',
      trustedPairingDays: resolveTrustedTvDurationDays(),
    });
  } catch (e) {
    console.error('[display/link]', e);
    return NextResponse.json({ error: 'Failed to generate display link' }, { status: 500 });
  }
}
