import { resolveSchoolTypeFromProfile, type ResolvedSchoolType } from '@/lib/schoolTypeResolver';

export type HomeworkPipelineMode = 'preschool_activity_pack' | 'k12_exam_prep';

export interface HomeworkPipelineConfig {
  mode: HomeworkPipelineMode;
  schoolType: ResolvedSchoolType;
  subjectPlaceholder: string;
  questionPlaceholder: string;
  defaultGradeLevel: number;
  defaultDifficulty: 'easy' | 'medium' | 'hard';
}

export function resolveHomeworkPipelineFromProfile(profile: any): HomeworkPipelineConfig {
  const schoolType = resolveSchoolTypeFromProfile(profile);
  if (schoolType === 'k12_school') {
    return {
      mode: 'k12_exam_prep',
      schoolType,
      subjectPlaceholder: 'e.g., Mathematics',
      questionPlaceholder: 'Paste or type the question here',
      defaultGradeLevel: 4,
      defaultDifficulty: 'medium',
    };
  }

  return {
    mode: 'preschool_activity_pack',
    schoolType,
    subjectPlaceholder: 'e.g., Life Skills / Theme of the week',
    questionPlaceholder: 'Paste worksheet/homework instructions and Dash will turn them into parent-friendly activities',
    defaultGradeLevel: 0,
    defaultDifficulty: 'easy',
  };
}
