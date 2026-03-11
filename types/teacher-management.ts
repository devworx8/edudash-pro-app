/**
 * Teacher Management Types
 * 
 * Shared types for teacher management screens and components.
 */

import { TeacherDocument, TeacherDocType } from '@/lib/services/TeacherDocumentsService';

export interface Teacher {
  id: string; // primary key from teachers table
  teacherUserId: string; // public.users.id (seat RPC expects this)
  authUserId: string | null; // auth.users.id (nullable)
  profileId?: string | null; // public.profiles.id (role updates)
  schoolRole?: 'teacher' | 'admin' | 'principal_admin';
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  idNumber: string;
  dateOfBirth?: string;
  gender?: string;
  status: TeacherStatus;
  contractType: ContractType;
  positionTitle?: string;
  department?: string;
  classes: string[];
  subjects: string[];
  qualifications: string[];
  studentCount?: number;
  hireDate: string;
  contractEndDate?: string;
  notes?: string;
  emergencyContact: EmergencyContact;
  salary: SalaryInfo;
  performance: PerformanceInfo;
  documents: Record<string, TeacherDocument>;
  attendance: AttendanceInfo;
  workload: WorkloadInfo;
}

export type TeacherStatus = 'active' | 'inactive' | 'pending' | 'probation' | 'suspended' | 'on_leave' | 'terminated';

export type ContractType = 'permanent' | 'temporary' | 'substitute' | 'probationary' | 'intern' | 'volunteer';

export type TeacherManagementView = 'overview' | 'hiring' | 'applications' | 'performance' | 'payroll' | 'profile';

export type CandidateStatus = 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface SalaryInfo {
  basic: number;
  allowances: number;
  deductions: number;
  net: number;
  payScale: string;
}

export interface PerformanceInfo {
  rating: number; // 1-5
  lastReviewDate: string;
  strengths: string[];
  improvementAreas: string[];
  goals: string[];
}

export interface AttendanceInfo {
  daysPresent: number;
  daysAbsent: number;
  lateArrivals: number;
  leaveBalance: number;
}

export interface WorkloadInfo {
  teachingHours: number;
  adminDuties: string[];
  extraCurricular: string[];
}

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  appliedFor: string;
  applicationDate: string;
  status: CandidateStatus;
  qualifications: string[];
  experience: number;
  expectedSalary: number;
  availableFrom: string;
  notes: string;
}

export interface AvailableTeacher {
  id: string;
  candidateProfileId?: string;
  name: string;
  email: string;
  phone?: string;
  home_city?: string | null;
  home_postal_code?: string | null;
  distance_km?: number;
  rating_average?: number | null;
  rating_count?: number | null;
}

export interface TeacherInvite {
  id: string;
  email: string;
  token?: string;
  status?: string;
  created_at: string;
  invited_by?: string | null;
  expires_at?: string;
  accepted_by?: string | null;
  accepted_at?: string | null;
}

// Helper functions
export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'active': return '#059669';
    case 'inactive': return '#6B7280';
    case 'pending': return '#EA580C';
    case 'probation': return '#F59E0B';
    case 'suspended': return '#DC2626';
    case 'on_leave': return '#8B5CF6';
    case 'terminated': return '#991B1B';
    default: return '#6B7280';
  }
};

export const getCandidateStatusColor = (status: string): string => {
  switch (status) {
    case 'applied': return '#6B7280';
    case 'screening': return '#F59E0B';
    case 'interview': return '#3B82F6';
    case 'offer': return '#059669';
    case 'hired': return '#10B981';
    case 'rejected': return '#DC2626';
    default: return '#6B7280';
  }
};

export const getViewIcon = (view: TeacherManagementView): string => {
  switch (view) {
    case 'overview': return 'grid-outline';
    case 'hiring': return 'person-add-outline';
    case 'applications': return 'document-text-outline';
    case 'performance': return 'analytics-outline';
    case 'payroll': return 'card-outline';
    case 'profile': return 'person-outline';
    default: return 'grid-outline';
  }
};
