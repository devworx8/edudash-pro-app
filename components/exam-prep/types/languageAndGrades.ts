// South African language codes — all 11 official languages
export type SouthAfricanLanguage =
  | 'en-ZA'
  | 'af-ZA'
  | 'zu-ZA'
  | 'xh-ZA'
  | 'nso-ZA'
  | 'tn-ZA'
  | 'st-ZA'
  | 'nr-ZA'
  | 'ss-ZA'
  | 've-ZA'
  | 'ts-ZA';

export const LANGUAGE_OPTIONS: Record<SouthAfricanLanguage, string> = {
  'en-ZA': 'English (South Africa)',
  'af-ZA': 'Afrikaans',
  'zu-ZA': 'isiZulu',
  'xh-ZA': 'isiXhosa',
  'nso-ZA': 'Sepedi (Northern Sotho)',
  'tn-ZA': 'Setswana',
  'st-ZA': 'Sesotho',
  'nr-ZA': 'isiNdebele',
  'ss-ZA': 'Siswati',
  've-ZA': 'Tshivenda',
  'ts-ZA': 'Xitsonga',
};

export interface GradeInfo {
  value: string;
  label: string;
  age: string;
}

export const GRADES: GradeInfo[] = [
  { value: 'grade_r', label: 'Grade R', age: '5-6' },
  { value: 'grade_1', label: 'Grade 1', age: '6-7' },
  { value: 'grade_2', label: 'Grade 2', age: '7-8' },
  { value: 'grade_3', label: 'Grade 3', age: '8-9' },
  { value: 'grade_4', label: 'Grade 4', age: '9-10' },
  { value: 'grade_5', label: 'Grade 5', age: '10-11' },
  { value: 'grade_6', label: 'Grade 6', age: '11-12' },
  { value: 'grade_7', label: 'Grade 7', age: '12-13' },
  { value: 'grade_8', label: 'Grade 8', age: '13-14' },
  { value: 'grade_9', label: 'Grade 9', age: '14-15' },
  { value: 'grade_10', label: 'Grade 10', age: '15-16' },
  { value: 'grade_11', label: 'Grade 11', age: '16-17' },
  { value: 'grade_12', label: 'Grade 12 (Matric)', age: '17-18' },
];

export interface ExamType {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  duration: string;
}

export const EXAM_TYPES: ExamType[] = [
  {
    id: 'practice_test',
    label: 'Practice Test',
    description: 'Full exam paper with memo',
    icon: 'document-text',
    color: '#007bff',
    duration: '60-120 min',
  },
  {
    id: 'revision_notes',
    label: 'Revision Notes',
    description: 'Topic summaries & key points',
    icon: 'book',
    color: '#ff6b35',
    duration: '30 min read',
  },
  {
    id: 'study_guide',
    label: 'Study Guide',
    description: 'Week-long study schedule',
    icon: 'calendar',
    color: '#ffc107',
    duration: '7-day plan',
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    description: 'Quick recall questions',
    icon: 'bulb',
    color: '#dc3545',
    duration: '15 min',
  },
];
