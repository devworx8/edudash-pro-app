'use client';

import RingtoneSettings from '@/components/settings/RingtoneSettings';
import { useRouter } from 'next/navigation';

export default function ParentRingtonesPage() {
  const router = useRouter();

  return (
    <RingtoneSettings 
      onClose={() => router.push('/dashboard/parent/settings')}
    />
  );
}
