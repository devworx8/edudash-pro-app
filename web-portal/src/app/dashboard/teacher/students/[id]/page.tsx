'use client';

import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { TeacherComingSoon } from '@/components/dashboard/teacher/TeacherComingSoon';
import { UserCircle } from 'lucide-react';

export default function StudentDetailPage() {
  return (
    <TeacherShell hideHeader>
      <TeacherComingSoon
        title="Student Profile"
        description="View detailed student information, progress history, attendance records, submitted work, and AI-generated learning insights."
        icon={UserCircle}
      />
    </TeacherShell>
  );
}
