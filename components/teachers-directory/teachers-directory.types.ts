/**
 * Types and interfaces for Teachers Directory
 */

export interface Teacher {
  id: string;
  teacherId: string;
  teacherRecordId?: string | null;
  teacherUserId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subjects: string[];
  grades: string[];
  qualifications: string[];
  experienceYears: number;
  employmentStatus: 'full-time' | 'part-time' | 'substitute' | 'inactive';
  hireDate: string;
  profilePhoto?: string;
  emergencyContact: string;
  emergencyPhone: string;
  classroomNumber?: string;
  specializations: string[];
  performanceRating: number; // 1-5
  lastPerformanceReview: string;
  salary?: number; // Only visible to principals
  bankDetails?: {
    accountNumber: string;
    bankName: string;
    branchCode: string;
  }; // Only visible to principals
  leaveBalance: number;
  schoolId: string;
  isClassTeacher: boolean;
  assignedClasses: string[];
}

export interface FilterOptions {
  subjects: string[];
  grades: string[];
  employmentStatus: string[];
  search: string;
}

export const FILTER_SUBJECTS = [
  'Mathematics',
  'English',
  'Natural Sciences',
  'Life Skills',
  'Physical Education',
];

export const EMPLOYMENT_STATUSES = [
  'full-time',
  'part-time',
  'substitute',
  'inactive',
] as const;

export const getEmploymentStatusColor = (status: string): string => {
  switch (status) {
    case 'full-time': return '#059669';
    case 'part-time': return '#EA580C';
    case 'substitute': return '#7C3AED';
    case 'inactive': return '#DC2626';
    default: return '#6B7280';
  }
};

export const createInitialFilters = (): FilterOptions => ({
  subjects: [],
  grades: [],
  employmentStatus: [],
  search: '',
});
