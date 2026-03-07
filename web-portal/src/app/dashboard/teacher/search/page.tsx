'use client';

import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { TeacherComingSoon } from '@/components/dashboard/teacher/TeacherComingSoon';
import { Search } from 'lucide-react';

export default function TeacherSearchPage() {
  return (
    <TeacherShell hideHeader>
      <TeacherComingSoon
        title="Search"
        description="Search across students, lessons, assignments, messages, and school resources. Find anything in your classroom instantly."
        icon={Search}
      />
    </TeacherShell>
  );
}
