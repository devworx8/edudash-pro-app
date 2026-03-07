import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { fetchDisplayDataServer } from '../fetchDisplayDataServer';

export async function GET(request: NextRequest) {
  try {
    const sessionClient = await createClient();
    const {
      data: { session },
    } = await sessionClient.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgFromQuery = searchParams.get('org');
    const classId = searchParams.get('class') || null;

    const { data: profile } = await sessionClient
      .from('profiles')
      .select('organization_id, preschool_id')
      .or(`id.eq.${session.user.id},auth_user_id.eq.${session.user.id}`)
      .maybeSingle();

    const orgId = profile?.organization_id || profile?.preschool_id || null;
    if (!orgId) {
      return NextResponse.json({ error: 'No organization linked to your account' }, { status: 400 });
    }

    if (orgFromQuery && orgFromQuery !== orgId) {
      return NextResponse.json({ error: 'Organization mismatch' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
    }

    const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey);
    const data = await fetchDisplayDataServer(serviceClient, orgId, classId);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[display/preview]', error);
    return NextResponse.json({ error: 'Failed to load display preview data' }, { status: 500 });
  }
}
