/**
 * Teacher Contacts Types
 * Shared types for teacher contacts components
 */

export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  class_id: string;
}

export interface Parent {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  students: Student[];
}

export interface Teacher {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: string;
  classes: string[];
}

export interface TeacherContactsWidgetProps {
  preschoolId: string | undefined;
  teacherId: string | undefined;
}
