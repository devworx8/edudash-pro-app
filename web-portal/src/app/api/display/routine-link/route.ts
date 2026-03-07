import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

type RoutineLinkRequest = {
  routineBlockId?: unknown;
  lessonId?: unknown;
  classId?: unknown;
};

const ALLOWED_ROLES = new Set(['teacher', 'principal', 'superadmin']);

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createServiceClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request: NextRequest) {
  try {
    const sessionClient = await createClient();
    const {
      data: { session },
    } = await sessionClient.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = (await request.json().catch(() => null)) as RoutineLinkRequest | null;
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const routineBlockId = asTrimmedString(rawBody.routineBlockId);
    const lessonId = asTrimmedString(rawBody.lessonId);
    const classId = asTrimmedString(rawBody.classId);

    if (!routineBlockId) {
      return NextResponse.json({ error: 'routineBlockId is required' }, { status: 400 });
    }

    const { data: profile } = await sessionClient
      .from('profiles')
      .select('id, role, organization_id, preschool_id')
      .or(`id.eq.${session.user.id},auth_user_id.eq.${session.user.id}`)
      .maybeSingle();

    const role = String(profile?.role || '').toLowerCase();
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const orgId = profile?.organization_id || profile?.preschool_id || null;
    if (!orgId) {
      return NextResponse.json({ error: 'No organization linked to your account' }, { status: 400 });
    }

    const serviceClient = getServiceClient();
    if (!serviceClient) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
    }

    const { data: blockRow, error: blockError } = await serviceClient
      .from('daily_program_blocks')
      .select('id, title, weekly_program_id, weekly_programs!inner(id, preschool_id, class_id)')
      .eq('id', routineBlockId)
      .maybeSingle();

    const linkedProgram = Array.isArray(blockRow?.weekly_programs)
      ? blockRow?.weekly_programs?.[0]
      : blockRow?.weekly_programs;

    if (blockError || !blockRow || !linkedProgram) {
      return NextResponse.json({ error: 'Routine block not found' }, { status: 404 });
    }

    if (String(linkedProgram.preschool_id || '') !== String(orgId)) {
      return NextResponse.json({ error: 'Routine block does not belong to your organization' }, { status: 403 });
    }

    const programClassId = asTrimmedString(linkedProgram.class_id);
    if (classId) {
      const { data: classRow, error: classError } = await serviceClient
        .from('classes')
        .select('id, preschool_id')
        .eq('id', classId)
        .maybeSingle();

      if (classError || !classRow) {
        return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      }
      if (String(classRow.preschool_id || '') !== String(orgId)) {
        return NextResponse.json({ error: 'Class does not belong to your organization' }, { status: 403 });
      }
      if (programClassId && classId !== programClassId) {
        return NextResponse.json({ error: 'Class does not match the routine program class' }, { status: 400 });
      }
    }

    if (!lessonId) {
      const { error: deleteError } = await serviceClient
        .from('daily_program_block_lesson_links')
        .delete()
        .eq('preschool_id', orgId)
        .eq('daily_program_block_id', routineBlockId);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message || 'Failed to clear routine link' }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        cleared: true,
        routineBlockId,
      });
    }

    const { data: lessonRow, error: lessonError } = await serviceClient
      .from('lessons')
      .select('id, title, preschool_id')
      .eq('id', lessonId)
      .eq('preschool_id', orgId)
      .maybeSingle();

    if (lessonError || !lessonRow) {
      return NextResponse.json({ error: 'Lesson not found in your organization' }, { status: 404 });
    }

    const linkPayload = {
      preschool_id: orgId,
      class_id: classId || programClassId || null,
      weekly_program_id: String(blockRow.weekly_program_id),
      daily_program_block_id: routineBlockId,
      lesson_id: lessonId,
      linked_by: session.user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: upsertedRows, error: upsertError } = await serviceClient
      .from('daily_program_block_lesson_links')
      .upsert(linkPayload, { onConflict: 'preschool_id,daily_program_block_id' })
      .select('id, daily_program_block_id, lesson_id, class_id, weekly_program_id')
      .limit(1);

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message || 'Failed to save routine link' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      link: upsertedRows?.[0] || {
        daily_program_block_id: routineBlockId,
        lesson_id: lessonId,
        class_id: classId || programClassId || null,
      },
      lessonTitle: lessonRow.title || null,
      source: 'manual',
    });
  } catch (error) {
    console.error('[display/routine-link]', error);
    return NextResponse.json({ error: 'Failed to save routine link' }, { status: 500 });
  }
}
