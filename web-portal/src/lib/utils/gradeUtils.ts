import { calculateAgeOnDate, parseDateOnly } from './dateUtils';

export const getGradeNumber = (gradeString?: string): number => {
  if (!gradeString) return 0;
  const normalized = gradeString.toLowerCase();
  const ageMarkers = [
    'year',
    'years',
    'yrs',
    'age',
    'preschool',
    'pre-school',
    'prek',
    'pre-k',
    'toddler',
    'nursery',
    'playgroup',
  ];

  if (ageMarkers.some((marker) => normalized.includes(marker))) {
    return 0;
  }

  if (normalized.trim() === 'r' || /\bgrade\s*r\b/.test(normalized)) {
    return 0;
  }

  const match = normalized.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

export const isExamEligibleGrade = (gradeString?: string): boolean => {
  return getGradeNumber(gradeString) >= 4;
};

export const isExamEligibleChild = (gradeString?: string, dateOfBirth?: string): boolean => {
  const gradeEligible = getGradeNumber(gradeString) >= 4;
  if (!gradeEligible) return false;
  if (!dateOfBirth) return true;
  const dob = parseDateOnly(dateOfBirth);
  if (!dob) return true;
  return calculateAgeOnDate(dateOfBirth, new Date()) >= 6;
};
