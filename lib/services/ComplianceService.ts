/**
 * ComplianceService — Bana Pele / DBE compliance companion
 *
 * Online-only readiness: overview, tasks, checklists, documents.
 * Certification remains with DBE/eCares. See .cursor/plans/dbe-compliance-service-edudash.plan.md
 */

import { assertSupabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { ComplianceDomainId, ComplianceDocumentStatus } from '@/lib/compliance';
import { COMPLIANCE_DOMAINS } from '@/lib/compliance';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplianceOverview {
  domains: { id: ComplianceDomainId; label: string; status: 'ok' | 'warning' | 'pending'; outstandingCount: number }[];
  documentsValidPercent: number;
  documentsExpiringSoonCount: number;
  documentsExpiredCount: number;
  checklistsCompletedThisMonth: number;
  checklistsDueCount: number;
}

export interface ComplianceTask {
  id: string;
  type: 'checklist' | 'document';
  title: string;
  domain?: ComplianceDomainId;
  dueDate?: string;
  assignedTo?: string;
  completed?: boolean;
}

export interface ComplianceChecklistTemplate {
  id: string;
  preschool_id: string | null;
  domain: string;
  name: string;
  description: string | null;
  checklist_type: string;
  criteria: Record<string, unknown>[];
  is_active: boolean;
}

export interface ComplianceChecklistRecord {
  id: string;
  preschool_id: string;
  template_id: string;
  checklist_date: string;
  checklist_type: string;
  responses: Record<string, unknown>;
  notes: string | null;
  completed_by: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceDocumentRow {
  id: string;
  preschool_id: string;
  category: string;
  name: string;
  required: boolean;
  storage_path: string | null;
  uploaded_at: string | null;
  uploaded_by: string | null;
  expiry_date: string | null;
  status: ComplianceDocumentStatus;
  linked_teacher_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/**
 * Aggregate compliance status across domains, documents, and checklists for a preschool.
 */
export async function getComplianceOverview(preschoolId: string): Promise<ComplianceOverview> {
  const supabase = assertSupabase();

  const [docsRes, recordsRes] = await Promise.all([
    supabase.from('compliance_documents').select('id, status, required, expiry_date').eq('preschool_id', preschoolId),
    supabase
      .from('compliance_checklist_records')
      .select('id')
      .eq('preschool_id', preschoolId)
      .gte('checklist_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)),
  ]);

  const documents = (docsRes.data ?? []) as { id: string; status: string; required: boolean; expiry_date: string | null }[];
  const records = (recordsRes.data ?? []) as { id: string }[];

  const requiredCount = documents.filter((d) => d.required).length;
  const validRequired = documents.filter((d) => d.required && (d.status === 'valid' || d.status === 'expiring_soon')).length;
  const documentsValidPercent = requiredCount > 0 ? Math.round((validRequired / requiredCount) * 100) : 100;
  const documentsExpiringSoonCount = documents.filter((d) => d.status === 'expiring_soon').length;
  const documentsExpiredCount = documents.filter((d) => d.status === 'expired').length;

  const checklistsCompletedThisMonth = records.length;
  // Placeholder: could query templates and compare to records to get "due" count
  const checklistsDueCount = 0;

  const domains = COMPLIANCE_DOMAINS.map((d) => {
    let status: 'ok' | 'warning' | 'pending' = 'pending';
    const outstandingCount = 0; // Could be derived from requirements vs completed checklists per domain
    if (outstandingCount === 0) status = 'ok';
    else if (outstandingCount > 0) status = 'warning';
    return { id: d.id, label: d.label, status, outstandingCount };
  });

  return {
    domains,
    documentsValidPercent,
    documentsExpiringSoonCount,
    documentsExpiredCount,
    checklistsCompletedThisMonth,
    checklistsDueCount,
  };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * Get assigned compliance tasks for a user (checklists assigned to them, documents to upload/renew).
 */
export async function getComplianceTasks(preschoolId: string, userId: string): Promise<ComplianceTask[]> {
  const supabase = assertSupabase();

  const [recordsRes, docsRes] = await Promise.all([
    supabase
      .from('compliance_checklist_records')
      .select('id, template_id, checklist_date, checklist_type')
      .eq('preschool_id', preschoolId)
      .eq('assigned_to', userId)
      .order('checklist_date', { ascending: false })
      .limit(20),
    supabase
      .from('compliance_documents')
      .select('id, name, category, status, expiry_date')
      .eq('preschool_id', preschoolId)
      .in('status', ['pending', 'expired', 'expiring_soon'])
      .limit(20),
  ]);

  const tasks: ComplianceTask[] = [];

  (recordsRes.data ?? []).forEach((r: { id: string; checklist_date: string; checklist_type: string }) => {
    tasks.push({
      id: r.id,
      type: 'checklist',
      title: `${r.checklist_type} checklist`,
      dueDate: r.checklist_date,
      completed: true, // already a record
    });
  });

  (docsRes.data ?? []).forEach((d: { id: string; name: string; category: string; status: string; expiry_date: string | null }) => {
    tasks.push({
      id: d.id,
      type: 'document',
      title: d.name || d.category,
      dueDate: d.expiry_date ?? undefined,
      completed: d.status === 'valid',
    });
  });

  return tasks;
}

// ---------------------------------------------------------------------------
// Checklist recording
// ---------------------------------------------------------------------------

/**
 * Record or update a compliance checklist response.
 */
export async function recordChecklistResponse(
  preschoolId: string,
  templateId: string,
  checklistDate: string,
  checklistType: string,
  responses: Record<string, unknown>,
  completedBy: string,
  notes?: string | null,
  assignedTo?: string | null
): Promise<ComplianceChecklistRecord> {
  const supabase = assertSupabase();

  const { data, error } = await supabase
    .from('compliance_checklist_records')
    .upsert(
      {
        preschool_id: preschoolId,
        template_id: templateId,
        checklist_date: checklistDate,
        checklist_type: checklistType,
        responses,
        notes: notes ?? null,
        completed_by: completedBy,
        assigned_to: assignedTo ?? null,
      },
      { onConflict: 'preschool_id,template_id,checklist_date' }
    )
    .select()
    .single();

  if (error) {
    logger.error('ComplianceService', 'recordChecklistResponse', error);
    throw new Error(`Failed to save checklist: ${error.message}`);
  }
  return data as ComplianceChecklistRecord;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * Get required and optional documents for a preschool.
 */
export async function getRequiredDocuments(preschoolId: string): Promise<ComplianceDocumentRow[]> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('compliance_documents')
    .select('*')
    .eq('preschool_id', preschoolId)
    .order('category')
    .order('name');

  if (error) {
    logger.error('ComplianceService', 'getRequiredDocuments', error);
    throw new Error(`Failed to load documents: ${error.message}`);
  }
  return (data ?? []) as ComplianceDocumentRow[];
}

/**
 * Update document status and optional metadata (e.g. after upload).
 */
export async function updateDocumentStatus(
  documentId: string,
  status: ComplianceDocumentStatus,
  meta?: { storage_path?: string; uploaded_by?: string; expiry_date?: string | null }
): Promise<ComplianceDocumentRow> {
  const supabase = assertSupabase();

  const updates: Record<string, unknown> = { status };
  if (meta?.storage_path !== undefined) updates.storage_path = meta.storage_path;
  if (meta?.uploaded_by !== undefined) updates.uploaded_by = meta.uploaded_by;
  if (meta?.expiry_date !== undefined) updates.expiry_date = meta.expiry_date;
  if (meta?.uploaded_by || meta?.storage_path) updates.uploaded_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('compliance_documents')
    .update(updates)
    .eq('id', documentId)
    .select()
    .single();

  if (error) {
    logger.error('ComplianceService', 'updateDocumentStatus', error);
    throw new Error(`Failed to update document: ${error.message}`);
  }
  return data as ComplianceDocumentRow;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Get compliance checklist templates for a preschool (including system templates where preschool_id is null).
 */
export async function getComplianceTemplates(preschoolId: string): Promise<ComplianceChecklistTemplate[]> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('compliance_checklist_templates')
    .select('*')
    .or(`preschool_id.is.null,preschool_id.eq.${preschoolId}`)
    .eq('is_active', true)
    .order('domain')
    .order('checklist_type');

  if (error) {
    logger.error('ComplianceService', 'getComplianceTemplates', error);
    throw new Error(`Failed to load templates: ${error.message}`);
  }
  return (data ?? []) as ComplianceChecklistTemplate[];
}

// ---------------------------------------------------------------------------
// Bridge to existing data (for overview / reports)
// ---------------------------------------------------------------------------

/**
 * Derive staff vetting status from hiring/teacher docs. Stub: returns empty until wired to AIVettingService / teacher docs.
 */
export async function deriveStaffVettingStatusFromHiring(
  _preschoolId: string
): Promise<{ total: number; withClearance: number; withReferences: number }> {
  // TODO: query teachers for preschool, join to vetting checklist / teacher docs (police clearance, references)
  return { total: 0, withClearance: 0, withReferences: 0 };
}

/**
 * Derive learner support coverage from learner_support_records. Stub: returns zero until wired.
 */
export async function deriveLearnerSupportCoverage(_preschoolId: string): Promise<{
  learnersWithSupport: number;
  totalLearners: number;
  activePlans: number;
}> {
  // TODO: count students, count learner_support_records with status active
  return { learnersWithSupport: 0, totalLearners: 0, activePlans: 0 };
}
