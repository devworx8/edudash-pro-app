'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LearnerLifecycleSettingsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/principal/learner-activity-control');
  }, [router]);

  return (
    <div className="section">
      <p style={{ color: 'var(--muted)' }}>Opening learner lifecycle controls...</p>
    </div>
  );
}
