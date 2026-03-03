import { assertSupabase } from '@/lib/supabase';

export type RoutineRequestType = 'daily_routine' | 'weekly_program';
export type RoutineRequestUrgency = 'low' | 'normal' | 'high' | 'critical';
export type RoutineRequestStatus = 'new' | 'in_review' | 'approved' | 'rejected' | 'completed';

export type RoutineGenerationRequest = {
  id: string;
  preschool_id: string;
  requested_by: string;
  teacher_id: string;
  request_type: RoutineRequestType;
  week_start_date: string;
  class_id: string | null;
  age_group: string | null;
  theme_title: string | null;
  objectives: string[];
  constraints: Record<string, unknown>;
  urgency: RoutineRequestUrgency;
  status: RoutineRequestStatus;
  principal_notes: string | null;
  resolution_reason: string | null;
  linked_weekly_program_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

type RoutineRequestInput = {
  preschoolId: string;
  teacherId: string;
  requestType: RoutineRequestType;
  weekStartDate: string;
  classId?: string | null;
  ageGroup?: string | null;
  themeTitle?: string | null;
  objectives?: string[];
  constraints?: Record<string, unknown>;
  urgency?: RoutineRequestUrgency;
};

type RoutineRequestUpdateInput = {
  requestId: string;
  preschoolId: string;
  status: RoutineRequestStatus;
  principalNotes?: string | null;
  resolutionReason?: string | null;
  linkedWeeklyProgramId?: string | null;
  resolvedBy?: string | null;
};

type ListRoutineRequestsInput = {
  preschoolId: string;
  status?: RoutineRequestStatus | 'all';
  teacherId?: string;
  limit?: number;
};

function normalizeRoutineRequest(row: Record<string, unknown>): RoutineGenerationRequest {
  return {
    id: String(row.id || ''),
    preschool_id: String(row.preschool_id || ''),
    requested_by: String(row.requested_by || ''),
    teacher_id: String(row.teacher_id || ''),
    request_type: String(row.request_type || 'daily_routine') as RoutineRequestType,
    week_start_date: String(row.week_start_date || ''),
    class_id: row.class_id ? String(row.class_id) : null,
    age_group: row.age_group ? String(row.age_group) : null,
    theme_title: row.theme_title ? String(row.theme_title) : null,
    objectives: Array.isArray(row.objectives) ? row.objectives.map((item) => String(item)) : [],
    constraints: row.constraints && typeof row.constraints === 'object' ? row.constraints as Record<string, unknown> : {},
    urgency: String(row.urgency || 'normal') as RoutineRequestUrgency,
    status: String(row.status || 'new') as RoutineRequestStatus,
    principal_notes: row.principal_notes ? String(row.principal_notes) : null,
    resolution_reason: row.resolution_reason ? String(row.resolution_reason) : null,
    linked_weekly_program_id: row.linked_weekly_program_id ? String(row.linked_weekly_program_id) : null,
    resolved_at: row.resolved_at ? String(row.resolved_at) : null,
    resolved_by: row.resolved_by ? String(row.resolved_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

export async function createRoutineRequest(input: RoutineRequestInput): Promise<RoutineGenerationRequest> {
  const supabase = assertSupabase();

  const payload = {
    preschool_id: input.preschoolId,
    requested_by: input.teacherId,
    teacher_id: input.teacherId,
    request_type: input.requestType,
    week_start_date: input.weekStartDate,
    class_id: input.classId || null,
    age_group: input.ageGroup || null,
    theme_title: input.themeTitle || null,
    objectives: input.objectives || [],
    constraints: input.constraints || {},
    urgency: input.urgency || 'normal',
    status: 'new',
  };

  const { data, error } = await supabase
    .from('routine_generation_requests' as any)
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create routine request');
  }

  return normalizeRoutineRequest(data as Record<string, unknown>);
}

export async function listRoutineRequests(input: ListRoutineRequestsInput): Promise<RoutineGenerationRequest[]> {
  const supabase = assertSupabase();

  let query = supabase
    .from('routine_generation_requests' as any)
    .select('*')
    .eq('preschool_id', input.preschoolId)
    .order('created_at', { ascending: false })
    .limit(input.limit || 100);

  if (input.teacherId) {
    query = query.eq('teacher_id', input.teacherId);
  }
  if (input.status && input.status !== 'all') {
    query = query.eq('status', input.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Failed to load routine requests');
  }

  return (data || []).map((row: Record<string, unknown>) => normalizeRoutineRequest(row));
}

export async function updateRoutineRequestStatus(input: RoutineRequestUpdateInput): Promise<RoutineGenerationRequest> {
  const supabase = assertSupabase();
  const isResolved = input.status === 'rejected' || input.status === 'completed';

  const updatePayload = {
    status: input.status,
    principal_notes: input.principalNotes ?? null,
    resolution_reason: input.resolutionReason ?? null,
    linked_weekly_program_id: input.linkedWeeklyProgramId ?? null,
    resolved_at: isResolved ? new Date().toISOString() : null,
    resolved_by: isResolved ? (input.resolvedBy ?? null) : null,
  };

  const { data, error } = await supabase
    .from('routine_generation_requests' as any)
    .update(updatePayload)
    .eq('id', input.requestId)
    .eq('preschool_id', input.preschoolId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update routine request');
  }

  return normalizeRoutineRequest(data as Record<string, unknown>);
}

export async function getRoutineRequestById(requestId: string, preschoolId: string): Promise<RoutineGenerationRequest | null> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('routine_generation_requests' as any)
    .select('*')
    .eq('id', requestId)
    .eq('preschool_id', preschoolId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load routine request');
  }
  if (!data) return null;
  return normalizeRoutineRequest(data as Record<string, unknown>);
}
