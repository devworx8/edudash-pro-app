import { Ionicons } from '@expo/vector-icons';

import type { SouthAfricanLanguage } from '@/components/exam-prep/types';
import type { ExamFallbackPolicy, ExamQualityMode } from '@/components/exam-prep/types';

export type WizardStep = 'grade' | 'subject' | 'type' | 'review';
export type SubjectCategory = 'all' | 'core' | 'languages' | 'sciences' | 'social';
export type IoniconName = keyof typeof Ionicons.glyphMap;

export type ContextEntityIds = {
  childName?: string;
  studentId?: string;
  classId?: string;
  schoolId?: string;
};

export type ExamRouteParams = {
  grade: string;
  subject: string;
  examType: string;
  language: SouthAfricanLanguage;
  useTeacherContext: '0' | '1';
  fallbackPolicy?: ExamFallbackPolicy;
  qualityMode?: ExamQualityMode;
  draftId?: string;
} & ContextEntityIds;

export const SUBJECT_CATEGORY_OPTIONS: Array<{ id: SubjectCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'core', label: 'Core' },
  { id: 'languages', label: 'Languages' },
  { id: 'sciences', label: 'Sciences' },
  { id: 'social', label: 'Social' },
];

export function getSubjectCategory(subject: string): SubjectCategory {
  const s = subject.toLowerCase();

  if (
    s.includes('language') ||
    s.includes('english') ||
    s.includes('afrikaans') ||
    s.includes('isizulu') ||
    s.includes('isixhosa') ||
    s.includes('sepedi')
  ) {
    return 'languages';
  }

  if (
    s.includes('science') ||
    s.includes('technology') ||
    s.includes('computer') ||
    s.includes('physical') ||
    s.includes('life sciences')
  ) {
    return 'sciences';
  }

  if (
    s.includes('history') ||
    s.includes('geography') ||
    s.includes('economic') ||
    s.includes('business') ||
    s.includes('accounting') ||
    s.includes('tourism')
  ) {
    return 'social';
  }

  if (s.includes('math') || s.includes('life skills') || s.includes('life orientation')) {
    return 'core';
  }

  return 'all';
}

export function getSubjectIcon(subject: string): IoniconName {
  const s = subject.toLowerCase();
  if (s.includes('math')) return 'calculator';
  if (s.includes('english') || s.includes('language')) return 'book';
  if (s.includes('science')) return 'flask';
  if (s.includes('history')) return 'time';
  if (s.includes('geography')) return 'globe';
  if (s.includes('life')) return 'heart';
  if (s.includes('economic') || s.includes('business') || s.includes('accounting')) return 'cash';
  if (s.includes('technology') || s.includes('computer')) return 'laptop';
  if (s.includes('art') || s.includes('creative')) return 'color-palette';
  return 'book-outline';
}

export function toSafeParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function buildExamRouteParams(input: {
  grade: string;
  subject: string;
  examType: string;
  language: SouthAfricanLanguage;
  useTeacherContext: boolean;
  fallbackPolicy?: ExamFallbackPolicy;
  qualityMode?: ExamQualityMode;
  draftId?: string;
  contextIds: ContextEntityIds;
}): ExamRouteParams {
  const params: ExamRouteParams = {
    grade: input.grade,
    subject: input.subject,
    examType: input.examType,
    language: input.language,
    useTeacherContext: input.useTeacherContext ? '1' : '0',
  };

  if (input.draftId) params.draftId = input.draftId;
  if (input.fallbackPolicy) params.fallbackPolicy = input.fallbackPolicy;
  if (input.qualityMode) params.qualityMode = input.qualityMode;
  if (input.contextIds.childName) params.childName = input.contextIds.childName;
  if (input.contextIds.studentId) params.studentId = input.contextIds.studentId;
  if (input.contextIds.classId) params.classId = input.contextIds.classId;
  if (input.contextIds.schoolId) params.schoolId = input.contextIds.schoolId;

  return params;
}

export function resolveIoniconName(icon: string): IoniconName {
  if (Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, icon)) {
    return icon as IoniconName;
  }
  return 'book-outline';
}

export function buildExamGenerationHref(params: ExamRouteParams): string {
  const query = (Object.entries(params) as Array<[string, string | undefined]>)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return query.length > 0 ? `/screens/exam-generation?${query}` : '/screens/exam-generation';
}
