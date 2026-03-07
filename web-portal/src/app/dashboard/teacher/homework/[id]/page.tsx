'use client';

import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { TeacherComingSoon } from '@/components/dashboard/teacher/TeacherComingSoon';
import { FileText } from 'lucide-react';

export default function HomeworkDetailPage() {
  return (
    <TeacherShell hideHeader>
      <TeacherComingSoon
        title="Homework Detail"
        description="View homework submissions, grade student work, provide feedback, and track completion rates across your class."
        icon={FileText}
      />
    </TeacherShell>
  );
}
