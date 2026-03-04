/**
 * Bana Pele / DBE compliance types
 *
 * Aligned with Children's Act 2005:
 * - Norms and Standards for Partial Care (Section 79)
 * - Norms and Standards for ECD Programmes (Section 94)
 *
 * Used for readiness checklists, dashboards, and export packs.
 * Certification remains with DBE/eCares; this is preparatory tooling only.
 */

/** Bana Pele registration stages (APPLY → COMPLY → COMPLETE) */
export type BanaPeleStage = 'apply' | 'comply' | 'complete';

/** High-level compliance domains for dashboards and checklists */
export type ComplianceDomainId =
  | 'premises_safety'
  | 'health_hygiene'
  | 'staff_vetting'
  | 'documentation'
  | 'teaching_learning'
  | 'learner_support';

export interface ComplianceDomain {
  id: ComplianceDomainId;
  label: string;
  description: string;
  /** Which Bana Pele stage(s) this domain is most relevant for */
  stages: BanaPeleStage[];
}

/** Criterion type for checklist items */
export type ComplianceCriterionType = 'yes_no' | 'scale_1_5' | 'text' | 'date' | 'document';

export interface ComplianceRequirement {
  id: string;
  domain: ComplianceDomainId;
  label: string;
  description?: string;
  /** Checklist criterion type when used in a template */
  criterionType: ComplianceCriterionType;
  /** Relevant for APPLY (documents/basic info) or COMPLY (site-visit checks) */
  stage: BanaPeleStage;
  /** Optional: map to existing EduDash entity (e.g. cleaning_roster, teacher_docs) */
  appSource?: string;
  required?: boolean;
  sortOrder: number;
}

/** Document category for compliance document registry */
export type ComplianceDocumentCategory =
  | 'registration_certificate'
  | 'fire_certificate'
  | 'zoning_approval'
  | 'health_clearance'
  | 'policies'
  | 'staff_files'
  | 'floor_plan'
  | 'other';

/** Status for a compliance document */
export type ComplianceDocumentStatus = 'pending' | 'valid' | 'expiring_soon' | 'expired';

/** Checklist record type (frequency) */
export type ComplianceChecklistType = 'daily' | 'weekly' | 'monthly' | 'registration_audit';
