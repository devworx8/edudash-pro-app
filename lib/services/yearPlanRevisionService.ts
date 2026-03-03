import type { GeneratedTerm, GeneratedYearPlan, YearPlanMonthlyEntry } from '@/components/principal/ai-planner/types';
import { assertSupabase } from '@/lib/supabase';

export type YearPlanRevisionStatus = 'draft' | 'published' | 'archived';

export type YearPlanRevision = {
  id: string;
  preschool_id: string;
  academic_year: number;
  version_no: number;
  status: YearPlanRevisionStatus;
  created_by: string;
  published_at: string | null;
  republished_from_revision_id: string | null;
  changelog: string | null;
  plan_payload: GeneratedYearPlan;
  created_at: string;
  updated_at: string;
};

type CreateYearPlanRevisionInput = {
  preschoolId: string;
  createdBy: string;
  academicYear: number;
  planPayload: GeneratedYearPlan;
  status?: YearPlanRevisionStatus;
  changelog?: string | null;
  republishedFromRevisionId?: string | null;
};

type UpdateYearPlanRevisionInput = {
  revisionId: string;
  preschoolId: string;
  status?: YearPlanRevisionStatus;
  changelog?: string | null;
  publishedAt?: string | null;
};

type RevisionListInput = {
  preschoolId: string;
  academicYear?: number;
  limit?: number;
};

type RevisionEntryInsert = {
  revision_id: string;
  entry_kind: 'term' | 'theme' | 'monthly_entry';
  entry_order: number;
  entry_month: number | null;
  entry_term_number: number | null;
  entry_payload: Record<string, unknown>;
};

function normalizeRevision(row: Record<string, unknown>): YearPlanRevision {
  const payload = row.plan_payload as GeneratedYearPlan;
  return {
    id: String(row.id || ''),
    preschool_id: String(row.preschool_id || ''),
    academic_year: Number(row.academic_year) || new Date().getFullYear(),
    version_no: Number(row.version_no) || 1,
    status: String(row.status || 'draft') as YearPlanRevisionStatus,
    created_by: String(row.created_by || ''),
    published_at: row.published_at ? String(row.published_at) : null,
    republished_from_revision_id: row.republished_from_revision_id ? String(row.republished_from_revision_id) : null,
    changelog: row.changelog ? String(row.changelog) : null,
    plan_payload: payload,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function toRevisionEntries(revisionId: string, plan: GeneratedYearPlan): RevisionEntryInsert[] {
  const entries: RevisionEntryInsert[] = [];
  let order = 1;

  for (const term of plan.terms || []) {
    const safeTerm = term as GeneratedTerm;
    entries.push({
      revision_id: revisionId,
      entry_kind: 'term',
      entry_order: order++,
      entry_month: null,
      entry_term_number: safeTerm.termNumber || null,
      entry_payload: {
        termNumber: safeTerm.termNumber,
        name: safeTerm.name,
        startDate: safeTerm.startDate,
        endDate: safeTerm.endDate,
      },
    });

    for (const theme of safeTerm.weeklyThemes || []) {
      entries.push({
        revision_id: revisionId,
        entry_kind: 'theme',
        entry_order: order++,
        entry_month: null,
        entry_term_number: safeTerm.termNumber || null,
        entry_payload: {
          termNumber: safeTerm.termNumber,
          week: theme.week,
          theme: theme.theme,
          description: theme.description,
          activities: theme.activities || [],
        },
      });
    }
  }

  for (const monthly of plan.monthlyEntries || []) {
    const safeMonthly = monthly as YearPlanMonthlyEntry;
    entries.push({
      revision_id: revisionId,
      entry_kind: 'monthly_entry',
      entry_order: order++,
      entry_month: safeMonthly.monthIndex || null,
      entry_term_number: null,
      entry_payload: {
        monthIndex: safeMonthly.monthIndex,
        bucket: safeMonthly.bucket,
        subtype: safeMonthly.subtype || null,
        title: safeMonthly.title,
        details: safeMonthly.details || null,
        startDate: safeMonthly.startDate || null,
        endDate: safeMonthly.endDate || null,
      },
    });
  }

  return entries;
}

async function getNextRevisionVersion(preschoolId: string, academicYear: number): Promise<number> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('year_plan_revisions' as any)
    .select('version_no')
    .eq('preschool_id', preschoolId)
    .eq('academic_year', academicYear)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load year-plan versions');
  }

  return Number(data?.version_no || 0) + 1;
}

export async function createYearPlanRevision(input: CreateYearPlanRevisionInput): Promise<YearPlanRevision> {
  const supabase = assertSupabase();
  const versionNo = await getNextRevisionVersion(input.preschoolId, input.academicYear);

  const { data, error } = await supabase
    .from('year_plan_revisions' as any)
    .insert({
      preschool_id: input.preschoolId,
      academic_year: input.academicYear,
      version_no: versionNo,
      status: input.status || 'draft',
      created_by: input.createdBy,
      published_at: input.status === 'published' ? new Date().toISOString() : null,
      republished_from_revision_id: input.republishedFromRevisionId || null,
      changelog: input.changelog || null,
      plan_payload: input.planPayload as any,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create year-plan revision');
  }

  const revision = normalizeRevision(data as Record<string, unknown>);
  const entries = toRevisionEntries(revision.id, revision.plan_payload);
  if (entries.length > 0) {
    const { error: entriesError } = await supabase
      .from('year_plan_revision_entries' as any)
      .insert(entries as any[]);
    if (entriesError) {
      throw new Error(entriesError.message || 'Failed to save year-plan revision entries');
    }
  }

  return revision;
}

export async function listYearPlanRevisions(input: RevisionListInput): Promise<YearPlanRevision[]> {
  const supabase = assertSupabase();

  let query = supabase
    .from('year_plan_revisions' as any)
    .select('*')
    .eq('preschool_id', input.preschoolId)
    .order('academic_year', { ascending: false })
    .order('version_no', { ascending: false })
    .limit(input.limit || 50);

  if (typeof input.academicYear === 'number') {
    query = query.eq('academic_year', input.academicYear);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Failed to load year-plan revisions');
  }

  return (data || []).map((row: Record<string, unknown>) => normalizeRevision(row));
}

export async function getYearPlanRevisionById(revisionId: string, preschoolId: string): Promise<YearPlanRevision | null> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('year_plan_revisions' as any)
    .select('*')
    .eq('id', revisionId)
    .eq('preschool_id', preschoolId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load year-plan revision');
  }
  if (!data) return null;
  return normalizeRevision(data as Record<string, unknown>);
}

export async function updateYearPlanRevision(input: UpdateYearPlanRevisionInput): Promise<YearPlanRevision> {
  const supabase = assertSupabase();
  const updatePayload: Record<string, unknown> = {};

  if (input.status) updatePayload.status = input.status;
  if (input.changelog !== undefined) updatePayload.changelog = input.changelog;
  if (input.publishedAt !== undefined) updatePayload.published_at = input.publishedAt;

  const { data, error } = await supabase
    .from('year_plan_revisions' as any)
    .update(updatePayload)
    .eq('id', input.revisionId)
    .eq('preschool_id', input.preschoolId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update year-plan revision');
  }

  return normalizeRevision(data as Record<string, unknown>);
}
