'use client';

import RingtoneSettings from '@/components/settings/RingtoneSettings';
import { useRouter } from 'next/navigation';

export default function TeacherRingtonesPage() {
  const router = useRouter();

  return (
    <RingtoneSettings 
      onClose={() => router.push('/dashboard/teacher/settings')}
    />
  );
}
