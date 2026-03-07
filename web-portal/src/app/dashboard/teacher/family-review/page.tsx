'use client';

import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { TeacherComingSoon } from '@/components/dashboard/teacher/TeacherComingSoon';
import { Home } from 'lucide-react';

export default function FamilyReviewPage() {
  return (
    <TeacherShell hideHeader>
      <TeacherComingSoon
        title="Family Activity Review"
        description="Monitor family engagement with homework and activities. See which parents are reviewing their child's work and identify families that may need outreach."
        icon={Home}
      />
    </TeacherShell>
  );
}
