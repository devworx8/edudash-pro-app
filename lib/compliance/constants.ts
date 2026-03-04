/**
 * Bana Pele & eCares links and compliance constants
 *
 * Registration is free via DBE/eCares. EduDash Pro does not replace eCares or issue certificates.
 * See .cursor/plans/dbe-compliance-service-edudash.plan.md for full positioning.
 */

import type { ComplianceDomain, ComplianceRequirement } from './types';

/** Official DBE / eCares links for in-app use (e.g. Compliance Centre quick actions) */
export const BANA_PELE_LINKS = {
  /** DBE Bana Pele ECD Registration Drive */
  banaPeleOverview: 'https://www.education.gov.za/Programmes/ECD/BanaPeleECDRegistrationDrive.aspx',
  /** eCares user registration (apply) */
  eCaresApply: 'https://user-registration.dbecares.gov.za/',
  /** DBE contact — Registration is free; do not pay anyone for registration support. */
  dbeContactEmail: 'banapele@dbe.gov.za',
} as const;

/** Compliance domains for dashboards and navigation */
export const COMPLIANCE_DOMAINS: ComplianceDomain[] = [
  {
    id: 'premises_safety',
    label: 'Premises & Safety',
    description: 'Building, fencing, emergency exits, fire equipment, safe environment',
    stages: ['apply', 'comply'],
  },
  {
    id: 'health_hygiene',
    label: 'Health & Hygiene',
    description: 'First aid, sick child protocols, hygiene, cleaning',
    stages: ['comply'],
  },
  {
    id: 'staff_vetting',
    label: 'Staff & Vetting',
    description: 'Qualifications, police clearance, child protection checks, references',
    stages: ['apply', 'comply'],
  },
  {
    id: 'documentation',
    label: 'Documentation',
    description: 'Policies, certificates, registration documents for eCares',
    stages: ['apply', 'comply'],
  },
  {
    id: 'teaching_learning',
    label: 'Teaching & Learning',
    description: 'Curriculum alignment, observations, programme quality',
    stages: ['comply'],
  },
  {
    id: 'learner_support',
    label: 'Learner Support',
    description: 'SIAS, support plans, accommodations',
    stages: ['comply'],
  },
];

/**
 * Canonical compliance requirements derived from Partial Care (s79) and ECD Programmes (s94).
 * Used to build checklist templates and readiness views.
 */
export const COMPLIANCE_REQUIREMENTS: ComplianceRequirement[] = [
  // Premises & Safety
  { id: 'prem_fencing', domain: 'premises_safety', label: 'Secure fencing / boundary', criterionType: 'yes_no', stage: 'comply', appSource: 'compliance_checklist', sortOrder: 10 },
  { id: 'prem_indoor_space', domain: 'premises_safety', label: 'Adequate indoor space per child', criterionType: 'yes_no', stage: 'comply', sortOrder: 20 },
  { id: 'prem_outdoor_space', domain: 'premises_safety', label: 'Safe outdoor play area', criterionType: 'yes_no', stage: 'comply', sortOrder: 30 },
  { id: 'prem_emergency_exits', domain: 'premises_safety', label: 'Clear emergency exits and evacuation', criterionType: 'yes_no', stage: 'comply', sortOrder: 40 },
  { id: 'prem_fire_equipment', domain: 'premises_safety', label: 'Fire extinguishers / equipment in place', criterionType: 'yes_no', stage: 'comply', appSource: 'compliance_documents', sortOrder: 50 },
  { id: 'prem_hazards', domain: 'premises_safety', label: 'No obvious hazards (electrical, sharp, etc.)', criterionType: 'yes_no', stage: 'comply', sortOrder: 60 },
  // Health & Hygiene
  { id: 'health_first_aid', domain: 'health_hygiene', label: 'First aid kit stocked and accessible', criterionType: 'yes_no', stage: 'comply', sortOrder: 10 },
  { id: 'health_sick_child', domain: 'health_hygiene', label: 'Sick child policy and isolation procedure', criterionType: 'yes_no', stage: 'comply', sortOrder: 20 },
  { id: 'health_toilets_clean', domain: 'health_hygiene', label: 'Toilets and handwashing facilities clean', criterionType: 'yes_no', stage: 'comply', appSource: 'cleaning_roster', sortOrder: 30 },
  { id: 'health_hygiene_routine', domain: 'health_hygiene', label: 'Daily hygiene routine (cleaning, sanitising)', criterionType: 'yes_no', stage: 'comply', appSource: 'cleaning_roster', sortOrder: 40 },
  // Staff & Vetting
  { id: 'staff_qualifications', domain: 'staff_vetting', label: 'Staff qualifications verified (SACE/SAQA where applicable)', criterionType: 'yes_no', stage: 'comply', appSource: 'teacher_docs', sortOrder: 10 },
  { id: 'staff_police_clearance', domain: 'staff_vetting', label: 'Police clearance certificate (within validity)', criterionType: 'yes_no', stage: 'comply', appSource: 'teacher_docs', sortOrder: 20 },
  { id: 'staff_child_protection', domain: 'staff_vetting', label: 'Child protection screening (NRSO/NCPR)', criterionType: 'yes_no', stage: 'comply', appSource: 'vetting', sortOrder: 30 },
  { id: 'staff_references', domain: 'staff_vetting', label: 'At least 2 references contacted', criterionType: 'yes_no', stage: 'comply', appSource: 'vetting', sortOrder: 40 },
  { id: 'staff_ratios', domain: 'staff_vetting', label: 'Adult-to-child ratios met', criterionType: 'yes_no', stage: 'comply', sortOrder: 50 },
  // Documentation
  { id: 'doc_registration', domain: 'documentation', label: 'Registration / application documents ready for eCares', criterionType: 'document', stage: 'apply', appSource: 'compliance_documents', sortOrder: 10 },
  { id: 'doc_policies', domain: 'documentation', label: 'Required policies in place (admissions, fees, emergency, etc.)', criterionType: 'document', stage: 'apply', appSource: 'compliance_documents', sortOrder: 20 },
  { id: 'doc_fire_certificate', domain: 'documentation', label: 'Fire safety certificate (where required)', criterionType: 'document', stage: 'comply', appSource: 'compliance_documents', sortOrder: 30 },
  { id: 'doc_health_clearance', domain: 'documentation', label: 'Health clearance / environmental health (where required)', criterionType: 'document', stage: 'comply', appSource: 'compliance_documents', sortOrder: 40 },
  { id: 'doc_zoning', domain: 'documentation', label: 'Zoning / land use approval (where required)', criterionType: 'document', stage: 'comply', appSource: 'compliance_documents', sortOrder: 50 },
  // Teaching & Learning
  { id: 'teach_programme', domain: 'teaching_learning', label: 'ECD programme / curriculum in place', criterionType: 'yes_no', stage: 'comply', appSource: 'observation_checklists', sortOrder: 10 },
  { id: 'teach_observations', domain: 'teaching_learning', label: 'Learner observations recorded (e.g. per CAPS strands)', criterionType: 'yes_no', stage: 'comply', appSource: 'observation_checklist_records', sortOrder: 20 },
  { id: 'teach_supervision', domain: 'teaching_learning', label: 'Adequate supervision at all times', criterionType: 'yes_no', stage: 'comply', sortOrder: 30 },
  // Learner Support
  { id: 'support_identified', domain: 'learner_support', label: 'Learners with additional needs identified', criterionType: 'yes_no', stage: 'comply', appSource: 'learner_support_records', sortOrder: 10 },
  { id: 'support_plans', domain: 'learner_support', label: 'Support plans / accommodations where needed', criterionType: 'yes_no', stage: 'comply', appSource: 'learner_support_records', sortOrder: 20 },
];
