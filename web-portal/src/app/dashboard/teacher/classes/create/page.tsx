'use client';

import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { TeacherComingSoon } from '@/components/dashboard/teacher/TeacherComingSoon';
import { Users } from 'lucide-react';

export default function CreateClassPage() {
  return (
    <TeacherShell hideHeader>
      <TeacherComingSoon
        title="Create Class"
        description="Set up a new class with student roster, subject assignments, and schedule. Generate join codes for easy student enrollment."
        icon={Users}
      />
    </TeacherShell>
  );
}
