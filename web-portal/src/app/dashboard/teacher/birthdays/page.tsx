'use client';

import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { TeacherComingSoon } from '@/components/dashboard/teacher/TeacherComingSoon';
import { Gift } from 'lucide-react';

export default function BirthdaysPage() {
  return (
    <TeacherShell hideHeader>
      <TeacherComingSoon
        title="Birthday Chart"
        description="View upcoming student birthdays, send birthday wishes, and plan classroom celebrations with auto-generated month-by-month charts."
        icon={Gift}
      />
    </TeacherShell>
  );
}
