'use client';

import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { TeacherComingSoon } from '@/components/dashboard/teacher/TeacherComingSoon';
import { ClipboardCheck } from 'lucide-react';

export default function AIGraderPage() {
  return (
    <TeacherShell hideHeader>
      <TeacherComingSoon
        title="AI Homework Grader"
        description="Upload student work and let AI grade it instantly. Get detailed rubric-based assessments, common mistake analysis, and personalized feedback suggestions."
        icon={ClipboardCheck}
      />
    </TeacherShell>
  );
}
