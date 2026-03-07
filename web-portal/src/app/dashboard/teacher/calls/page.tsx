'use client';

import { TeacherShell } from '@/components/dashboard/teacher/TeacherShell';
import { TeacherComingSoon } from '@/components/dashboard/teacher/TeacherComingSoon';
import { Phone } from 'lucide-react';

export default function CallsPage() {
  return (
    <TeacherShell hideHeader>
      <TeacherComingSoon
        title="Calls"
        description="Make voice and video calls to parents directly from the dashboard. View call history, schedule callbacks, and manage your communication log."
        icon={Phone}
      />
    </TeacherShell>
  );
}
