'use client';

import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { TeacherComingSoon } from '@/components/dashboard/teacher/TeacherComingSoon';
import { Star } from 'lucide-react';

export default function ReputationPage() {
  return (
    <TeacherShell hideHeader>
      <TeacherComingSoon
        title="My Reputation"
        description="Track your teaching reputation score based on parent feedback, lesson completion rates, student progress, and engagement metrics."
        icon={Star}
      />
    </TeacherShell>
  );
}
