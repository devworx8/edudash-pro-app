/**
 * Types for Class & Teacher Management
 * Extracted from app/screens/class-teacher-management.tsx
 */

export interface ClassInfo {
  id: string;
  name: string;
  grade_level: string;
  capacity: number;
  current_enrollment: number;
  room_number?: string;
  teacher_id?: string;
  teacher_name?: string;
  is_active: boolean;
}

export interface Teacher {
  id: string;
  teacher_record_id?: string;
  user_id?: string;
  full_name: string;
  email: string;
  phone?: string;
  specialization: string;
  role: 'teacher' | 'admin' | 'principal_admin';
  status: 'active' | 'inactive' | 'on_leave';
  hire_date: string;
  classes_assigned: number;
  students_count: number;
}

export interface ClassFormData {
  name: string;
  grade_level: string;
  capacity: number;
  room_number: string;
  teacher_id: string;
}

export type ActiveTab = 'classes' | 'teachers';

export interface ClassTeacherState {
  classes: ClassInfo[];
  teachers: Teacher[];
  loading: boolean;
  refreshing: boolean;
  showClassModal: boolean;
  showTeacherAssignment: boolean;
  selectedClass: ClassInfo | null;
  activeTab: ActiveTab;
  classForm: ClassFormData;
  roleUpdateTeacherId: string | null;
}

export interface ClassTeacherActions {
  loadData: () => Promise<void>;
  handleCreateClass: () => Promise<void>;
  handleAssignTeacher: () => Promise<void>;
  handleRemoveTeacher: (classInfo: ClassInfo) => void;
  handleDeleteTeacher: (teacher: Teacher) => void;
  handleSetTeacherRole: (teacher: Teacher, role: 'teacher' | 'admin') => Promise<void>;
  handleToggleClassStatus: (classInfo: ClassInfo) => Promise<void>;
  setShowClassModal: (show: boolean) => void;
  setShowTeacherAssignment: (show: boolean) => void;
  setSelectedClass: (classInfo: ClassInfo | null) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setClassForm: React.Dispatch<React.SetStateAction<ClassFormData>>;
  onRefresh: () => void;
}

export interface UseClassTeacherManagementResult extends ClassTeacherState, ClassTeacherActions {
  activeTeachers: Teacher[];
  activeClasses: ClassInfo[];
}
