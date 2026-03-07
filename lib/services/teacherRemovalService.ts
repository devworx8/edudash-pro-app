import { assertSupabase } from '@/lib/supabase';

/**
 * Archive a teacher from a school via Edge Function.
 *
 * Uses the server-side `remove-teacher` Edge Function which runs
 * with service-role privileges and performs archive-safe cleanup.
 */
export async function removeTeacherFromSchool(params: {
  teacherRecordId: string;
  organizationId: string;
  teacherUserId?: string | null;
  reason?: string | null;
}): Promise<void> {
  const { teacherRecordId, organizationId, teacherUserId, reason } = params;
  if (!teacherRecordId || !organizationId) {
    throw new Error('Missing teacher or organization');
  }

  const supabase = assertSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('You must be signed in to remove a teacher');
  }

  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/remove-teacher`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    },
    body: JSON.stringify({
      teacher_record_id: teacherRecordId,
      organization_id: organizationId,
      teacher_user_id: teacherUserId || null,
      reason: reason || null,
    }),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    throw new Error(result.error || `Failed to remove teacher (${response.status})`);
  }
}

/**
 * Archive a directly-added teacher who has no auth account.
 */
export async function removeTeacherDirect(params: {
  teacherRecordId: string;
  organizationId: string;
  reason?: string;
  archivedBy?: string | null;
}): Promise<void> {
  const { teacherRecordId, organizationId, reason, archivedBy } = params;
  if (!teacherRecordId || !organizationId) {
    throw new Error('Missing teacher record or organization');
  }

  const supabase = assertSupabase();
  const { error } = await supabase
    .from('teachers')
    .update({
      is_active: false,
      employment_status: 'archived',
      archived_at: new Date().toISOString(),
      archived_by: archivedBy || null,
      archive_reason: reason?.trim() || 'Archived by principal',
    })
    .eq('id', teacherRecordId)
    .eq('preschool_id', organizationId);

  if (error) {
    throw new Error(error.message || 'Failed to deactivate teacher record');
  }
}
