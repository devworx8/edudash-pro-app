import { assertSupabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────

export type InputWindowType = 'year_end_reflection' | 'annual_planning' | 'term_planning' | 'open_call';
export type SubmissionCategory = 'theme_suggestion' | 'event_request' | 'resource_need' | 'reflection' | 'assessment_preference';
export type SubmissionStatus = 'pending' | 'under_review' | 'approved' | 'modified' | 'declined';
export type SubmissionPriority = 'low' | 'normal' | 'high';

export type InputWindow = {
  id: string;
  preschool_id: string;
  created_by: string;
  title: string;
  description: string | null;
  window_type: InputWindowType;
  academic_year: number;
  target_term_id: string | null;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
  allowed_categories: SubmissionCategory[];
  created_at: string;
  updated_at: string;
};

export type TeacherSubmission = {
  id: string;
  preschool_id: string;
  window_id: string;
  submitted_by: string;
  category: SubmissionCategory;
  title: string;
  description: string | null;
  target_term_number: number | null;
  target_month: number | null;
  target_week_number: number | null;
  suggested_date: string | null;
  suggested_bucket: string | null;
  learning_objectives: string[];
  materials_needed: string[];
  estimated_cost: string | null;
  age_groups: string[];
  priority: SubmissionPriority;
  status: SubmissionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  principal_notes: string | null;
  principal_modifications: Record<string, unknown> | null;
  incorporated_into_entry_id: string | null;
  incorporated_into_theme_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (optional)
  submitter_name?: string;
};

export type SubmissionCounts = {
  pending: number;
  under_review: number;
  approved: number;
  modified: number;
  declined: number;
  total: number;
};

// ── Normalizers ──────────────────────────────────────────────

function normalizeWindow(row: Record<string, unknown>): InputWindow {
  return {
    id: String(row.id || ''),
    preschool_id: String(row.preschool_id || ''),
    created_by: String(row.created_by || ''),
    title: String(row.title || ''),
    description: row.description ? String(row.description) : null,
    window_type: String(row.window_type || 'open_call') as InputWindowType,
    academic_year: Number(row.academic_year || new Date().getFullYear()),
    target_term_id: row.target_term_id ? String(row.target_term_id) : null,
    opens_at: String(row.opens_at || ''),
    closes_at: String(row.closes_at || ''),
    is_active: Boolean(row.is_active),
    allowed_categories: Array.isArray(row.allowed_categories) ? row.allowed_categories as SubmissionCategory[] : [],
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function normalizeSubmission(row: Record<string, unknown>): TeacherSubmission {
  return {
    id: String(row.id || ''),
    preschool_id: String(row.preschool_id || ''),
    window_id: String(row.window_id || ''),
    submitted_by: String(row.submitted_by || ''),
    category: String(row.category || 'theme_suggestion') as SubmissionCategory,
    title: String(row.title || ''),
    description: row.description ? String(row.description) : null,
    target_term_number: row.target_term_number ? Number(row.target_term_number) : null,
    target_month: row.target_month ? Number(row.target_month) : null,
    target_week_number: row.target_week_number ? Number(row.target_week_number) : null,
    suggested_date: row.suggested_date ? String(row.suggested_date) : null,
    suggested_bucket: row.suggested_bucket ? String(row.suggested_bucket) : null,
    learning_objectives: Array.isArray(row.learning_objectives) ? row.learning_objectives.map(String) : [],
    materials_needed: Array.isArray(row.materials_needed) ? row.materials_needed.map(String) : [],
    estimated_cost: row.estimated_cost ? String(row.estimated_cost) : null,
    age_groups: Array.isArray(row.age_groups) ? row.age_groups.map(String) : [],
    priority: String(row.priority || 'normal') as SubmissionPriority,
    status: String(row.status || 'pending') as SubmissionStatus,
    reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    principal_notes: row.principal_notes ? String(row.principal_notes) : null,
    principal_modifications: row.principal_modifications && typeof row.principal_modifications === 'object' ? row.principal_modifications as Record<string, unknown> : null,
    incorporated_into_entry_id: row.incorporated_into_entry_id ? String(row.incorporated_into_entry_id) : null,
    incorporated_into_theme_id: row.incorporated_into_theme_id ? String(row.incorporated_into_theme_id) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

// ── Input Windows ────────────────────────────────────────────

type CreateWindowInput = {
  preschoolId: string;
  createdBy: string;
  title: string;
  description?: string;
  windowType: InputWindowType;
  academicYear: number;
  targetTermId?: string;
  opensAt: string;
  closesAt: string;
  allowedCategories?: SubmissionCategory[];
};

export async function createInputWindow(input: CreateWindowInput): Promise<InputWindow> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('year_plan_input_windows' as any)
    .insert({
      preschool_id: input.preschoolId,
      created_by: input.createdBy,
      title: input.title,
      description: input.description || null,
      window_type: input.windowType,
      academic_year: input.academicYear,
      target_term_id: input.targetTermId || null,
      opens_at: input.opensAt,
      closes_at: input.closesAt,
      allowed_categories: input.allowedCategories || ['theme_suggestion', 'event_request', 'resource_need', 'reflection', 'assessment_preference'],
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message || 'Failed to create input window');
  return normalizeWindow(data as Record<string, unknown>);
}

export async function listInputWindows(preschoolId: string, activeOnly = false): Promise<InputWindow[]> {
  const supabase = assertSupabase();
  let query = supabase
    .from('year_plan_input_windows' as any)
    .select('*')
    .eq('preschool_id', preschoolId)
    .order('opens_at', { ascending: false });

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to list input windows');
  return (data || []).map((row: Record<string, unknown>) => normalizeWindow(row));
}

export async function updateInputWindow(id: string, preschoolId: string, updates: Partial<Pick<InputWindow, 'title' | 'description' | 'opens_at' | 'closes_at' | 'is_active' | 'allowed_categories'>>): Promise<InputWindow> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('year_plan_input_windows' as any)
    .update(updates)
    .eq('id', id)
    .eq('preschool_id', preschoolId)
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message || 'Failed to update input window');
  return normalizeWindow(data as Record<string, unknown>);
}

// ── Teacher Submissions ──────────────────────────────────────

type CreateSubmissionInput = {
  preschoolId: string;
  windowId: string;
  submittedBy: string;
  category: SubmissionCategory;
  title: string;
  description?: string;
  targetTermNumber?: number;
  targetMonth?: number;
  targetWeekNumber?: number;
  suggestedDate?: string;
  suggestedBucket?: string;
  learningObjectives?: string[];
  materialsNeeded?: string[];
  estimatedCost?: string;
  ageGroups?: string[];
  priority?: SubmissionPriority;
};

export async function createSubmission(input: CreateSubmissionInput): Promise<TeacherSubmission> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('year_plan_teacher_submissions' as any)
    .insert({
      preschool_id: input.preschoolId,
      window_id: input.windowId,
      submitted_by: input.submittedBy,
      category: input.category,
      title: input.title,
      description: input.description || null,
      target_term_number: input.targetTermNumber ?? null,
      target_month: input.targetMonth ?? null,
      target_week_number: input.targetWeekNumber ?? null,
      suggested_date: input.suggestedDate || null,
      suggested_bucket: input.suggestedBucket || null,
      learning_objectives: input.learningObjectives || [],
      materials_needed: input.materialsNeeded || [],
      estimated_cost: input.estimatedCost || null,
      age_groups: input.ageGroups || [],
      priority: input.priority || 'normal',
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message || 'Failed to create submission');
  return normalizeSubmission(data as Record<string, unknown>);
}

type ListSubmissionsInput = {
  preschoolId: string;
  windowId?: string;
  teacherId?: string;
  status?: SubmissionStatus | 'all';
  category?: SubmissionCategory;
  limit?: number;
};

export async function listSubmissions(input: ListSubmissionsInput): Promise<TeacherSubmission[]> {
  const supabase = assertSupabase();
  let query = supabase
    .from('year_plan_teacher_submissions' as any)
    .select('*, submitter:profiles!year_plan_teacher_submissions_submitted_by_fkey(full_name, avatar_url)')
    .eq('preschool_id', input.preschoolId)
    .order('created_at', { ascending: false })
    .limit(input.limit || 200);

  if (input.windowId) query = query.eq('window_id', input.windowId);
  if (input.teacherId) query = query.eq('submitted_by', input.teacherId);
  if (input.status && input.status !== 'all') query = query.eq('status', input.status);
  if (input.category) query = query.eq('category', input.category);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to list submissions');
  return (data || []).map((row: Record<string, unknown>) => {
    const sub = normalizeSubmission(row);
    const submitter = row.submitter as Record<string, unknown> | null;
    if (submitter?.full_name) sub.submitter_name = String(submitter.full_name);
    return sub;
  });
}

type ReviewSubmissionInput = {
  id: string;
  preschoolId: string;
  status: SubmissionStatus;
  reviewedBy: string;
  principalNotes?: string;
  principalModifications?: Record<string, unknown>;
};

export async function reviewSubmission(input: ReviewSubmissionInput): Promise<TeacherSubmission> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('year_plan_teacher_submissions' as any)
    .update({
      status: input.status,
      reviewed_by: input.reviewedBy,
      reviewed_at: new Date().toISOString(),
      principal_notes: input.principalNotes || null,
      principal_modifications: input.principalModifications || null,
    })
    .eq('id', input.id)
    .eq('preschool_id', input.preschoolId)
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message || 'Failed to review submission');
  return normalizeSubmission(data as Record<string, unknown>);
}

// ── Incorporate into Plan ────────────────────────────────────

type IncorporateInput = {
  submissionId: string;
  preschoolId: string;
  userId: string;
  targetType: 'monthly_entry' | 'curriculum_theme';
  // For monthly_entry:
  academicYear?: number;
  monthIndex?: number;
  bucket?: string;
  // For curriculum_theme:
  termId?: string;
  weekNumber?: number;
};

export async function incorporateSubmission(input: IncorporateInput): Promise<void> {
  const supabase = assertSupabase();

  // Fetch the submission
  const { data: sub, error: fetchErr } = await supabase
    .from('year_plan_teacher_submissions' as any)
    .select('*')
    .eq('id', input.submissionId)
    .eq('preschool_id', input.preschoolId)
    .single();

  if (fetchErr || !sub) throw new Error(fetchErr?.message || 'Submission not found');
  const submission = sub as Record<string, unknown>;

  let incorporatedEntryId: string | null = null;
  let incorporatedThemeId: string | null = null;

  if (input.targetType === 'monthly_entry') {
    const { data: entry, error: entryErr } = await supabase
      .from('year_plan_monthly_entries' as any)
      .insert({
        preschool_id: input.preschoolId,
        created_by: input.userId,
        academic_year: input.academicYear || new Date().getFullYear(),
        month_index: input.monthIndex || 1,
        bucket: input.bucket || 'excursions_extras',
        title: String(submission.title || ''),
        details: submission.description ? String(submission.description) : null,
        is_published: false,
      })
      .select('id')
      .single();

    if (entryErr || !entry) throw new Error(entryErr?.message || 'Failed to create monthly entry');
    incorporatedEntryId = String((entry as Record<string, unknown>).id);
  } else {
    const objectives = Array.isArray(submission.learning_objectives)
      ? submission.learning_objectives.map(String)
      : [];
    const materials = Array.isArray(submission.materials_needed)
      ? submission.materials_needed.map(String)
      : [];

    const { data: themeRow, error: themeErr } = await supabase
      .from('curriculum_themes' as any)
      .insert({
        preschool_id: input.preschoolId,
        created_by: input.userId,
        title: String(submission.title || ''),
        description: submission.description ? String(submission.description) : null,
        term_id: input.termId || null,
        week_number: input.weekNumber || null,
        learning_objectives: objectives,
        materials_needed: materials,
        age_groups: Array.isArray(submission.age_groups) ? submission.age_groups.map(String) : [],
      })
      .select('id')
      .single();

    if (themeErr || !themeRow) throw new Error(themeErr?.message || 'Failed to create curriculum theme');
    incorporatedThemeId = String((themeRow as Record<string, unknown>).id);
  }

  // Update the submission to mark as incorporated
  const { error: updateErr } = await supabase
    .from('year_plan_teacher_submissions' as any)
    .update({
      incorporated_into_entry_id: incorporatedEntryId,
      incorporated_into_theme_id: incorporatedThemeId,
    })
    .eq('id', input.submissionId)
    .eq('preschool_id', input.preschoolId);

  if (updateErr) throw new Error(updateErr.message || 'Failed to mark submission as incorporated');
}

export async function getSubmissionCounts(preschoolId: string): Promise<SubmissionCounts> {
  const supabase = assertSupabase();
  const { data, error } = await supabase.rpc('get_year_plan_submission_counts', {
    p_preschool_id: preschoolId,
  });

  if (error) throw new Error(error.message || 'Failed to get submission counts');
  const result = data as Record<string, number> | null;
  return {
    pending: result?.pending ?? 0,
    under_review: result?.under_review ?? 0,
    approved: result?.approved ?? 0,
    modified: result?.modified ?? 0,
    declined: result?.declined ?? 0,
    total: result?.total ?? 0,
  };
}
