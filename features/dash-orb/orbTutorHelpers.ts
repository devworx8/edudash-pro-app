/**
 * features/dash-orb/orbTutorHelpers.ts
 *
 * Extracted from DashOrbImpl.tsx — tutor prompt construction and
 * quick-action dispatch for education-category actions.
 */

import { calculateAge } from '@/lib/date-utils';

// ─── Age group / grade band resolution ──────────────────────

export function resolveAgeGroupFromYears(ageYears?: number | null): string | null {
  if (!ageYears && ageYears !== 0) return null;
  if (ageYears <= 5) return '3-5';
  if (ageYears <= 8) return '6-8';
  if (ageYears <= 12) return '9-12';
  if (ageYears <= 15) return '13-15';
  if (ageYears <= 18) return '16-18';
  return 'adult';
}

export function resolveGradeBand(ageGroup: string): string | null {
  switch (ageGroup) {
    case '3-5': return 'Grade R / Reception';
    case '6-8': return 'Grades 1-3';
    case '9-12': return 'Grades 4-6';
    case '13-15': return 'Grades 7-9';
    case '16-18': return 'Grades 10-12';
    case 'adult': return 'Adult learners';
    default: return null;
  }
}

// ─── Tutor prompt builder ───────────────────────────────────

export interface TutorPromptContext {
  normalizedRole: string;
  isTutorRole: boolean;
  learnerAgeYears: number | null;
  learnerGrade: string | null;
  quickActionAge: string;
  profileDateOfBirth?: string | null;
}

export function buildTutorPrompt(
  basePrompt: string,
  ctx: TutorPromptContext,
  options?: { topicHint?: string | null; requireDetails?: boolean },
): string {
  const ageYears = ['student', 'learner'].includes(ctx.normalizedRole)
    ? (ctx.profileDateOfBirth ? calculateAge(ctx.profileDateOfBirth) : null)
    : ctx.learnerAgeYears;

  const autoAgeGroup = ctx.quickActionAge === 'auto' ? resolveAgeGroupFromYears(ageYears) : null;
  const effectiveAgeGroup = ctx.quickActionAge === 'auto' ? (autoAgeGroup || 'auto') : ctx.quickActionAge;

  const ageLabel = effectiveAgeGroup === 'adult'
    ? 'adult learners'
    : effectiveAgeGroup !== 'auto'
      ? `ages ${effectiveAgeGroup}`
      : (ageYears ? `age ${ageYears}` : '');

  const gradeBand = effectiveAgeGroup !== 'auto' ? resolveGradeBand(effectiveAgeGroup) : null;
  const learnerHint = gradeBand
    ? `${gradeBand}${ageLabel ? ` (${ageLabel})` : ''}`
    : (ageLabel || '');

  const roleDirective = ctx.isTutorRole
    ? 'Audience: parent/student. Use tutoring mode. Avoid teacher/admin-only sections. If generating a lesson, make it learner-ready with examples and practice plus 2 parent tips.'
    : ctx.normalizedRole
      ? `Audience: ${ctx.normalizedRole}. Provide role-appropriate guidance.`
      : 'Audience: general.';

  const interactionRules = ctx.isTutorRole
    ? 'Diagnose → Teach → Practice loop. Start with ONE short diagnostic question and WAIT. Ask one question at a time; do not proceed until the learner answers.'
    : 'Be concise and practical. Ask 1–2 clarifying questions if needed.';

  const detailRule = options?.requireDetails
    ? 'If topic or grade is missing, ask: "Which grade and topic should I use?" and wait.'
    : '';

  return [
    'Start a NEW topic and ignore earlier context.',
    basePrompt,
    roleDirective,
    learnerHint ? `Learner profile: ${learnerHint}.` : '',
    ctx.learnerGrade ? `Learner grade: ${ctx.learnerGrade}.` : '',
    options?.topicHint ? `Topic: ${options.topicHint}.` : '',
    interactionRules,
    detailRule,
  ].filter(Boolean).join(' ');
}

// ─── Quick action → tutor base prompt ───────────────────────

export function resolveTutorBasePrompt(actionId: string, actionCommand: string, isTutorRole: boolean): string {
  if (!isTutorRole) return actionCommand;
  switch (actionId) {
    case 'gen-lesson': return 'Create a learner-friendly mini lesson (not a teacher lesson plan).';
    case 'gen-stem': return 'Design a hands-on STEM activity a parent/student can do at home.';
    case 'gen-curriculum': return 'Create a 4-week learning path for a learner with weekly goals and simple activities.';
    case 'gen-worksheet': return 'Create a short student worksheet with worked examples and answers.';
    case 'gen-digital': return 'Create a digital skills mini lesson for a learner.';
    default: return actionCommand;
  }
}

// ─── Language helper ────────────────────────────────────────

export function normalizeSupportedLanguage(lang?: string | null): 'en-ZA' | 'af-ZA' | 'zu-ZA' | null {
  if (!lang) return null;
  if (lang === 'en-ZA' || lang === 'af-ZA' || lang === 'zu-ZA') return lang;
  return null;
}
