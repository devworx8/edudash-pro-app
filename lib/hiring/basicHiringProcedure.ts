/**
 * Basic Hiring Procedure Checklist
 *
 * Standard steps for school hiring flow, aligned with recruitment best practice:
 * advertise → collect CVs → shortlist → interviews → verify qualifications →
 * police clearance → references → probation → written contract.
 * Used in Hiring Hub and Teacher Management to guide principals.
 */

export interface HiringProcedureStep {
  order: number;
  label: string;
  /** Where in the app this step is done (route or feature name) */
  appLocation: string;
  /** Route to navigate when user taps (optional) */
  route?: string;
}

export const BASIC_HIRING_PROCEDURE_STEPS: HiringProcedureStep[] = [
  { order: 1, label: 'Advertise the post', appLocation: 'Job Postings', route: '/screens/job-posting-create' },
  { order: 2, label: 'Collect CVs', appLocation: 'Applications / Bulk CV Import', route: '/screens/hiring-hub' },
  { order: 3, label: 'Shortlist candidates', appLocation: 'Applicant Pipeline → Shortlisted', route: '/screens/hiring-hub' },
  { order: 4, label: 'Conduct structured interviews', appLocation: 'Application Review / Interview scheduling', route: '/screens/application-review' },
  { order: 5, label: 'Verify qualifications', appLocation: 'Vetting checklist (SACE, SAQA, teaching qual)', route: '/screens/application-review' },
  { order: 6, label: 'Check police clearance', appLocation: 'Vetting checklist → Police clearance', route: '/screens/application-review' },
  { order: 7, label: 'Contact at least 2 references', appLocation: 'Vetting checklist → Reference 1 & 2', route: '/screens/application-review' },
  { order: 8, label: '3-month probation period', appLocation: 'Offer letter terms / Teacher status', route: '/screens/offer-letter' },
  { order: 9, label: 'Issue written contract', appLocation: 'Teacher documents → Contracts upload', route: '/screens/teacher-management' },
];
