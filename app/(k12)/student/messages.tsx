import React from 'react';
import { router } from 'expo-router';
import { K12StudentFeatureScreen } from '@/domains/k12/components/K12StudentFeatureScreen';
import { useStudentMessages } from '@/hooks/k12/useStudentMessages';

export default function K12StudentMessagesScreen() {
  const { items, loading } = useStudentMessages();

  return (
    <K12StudentFeatureScreen
      title="Messages"
      subtitle="Stay connected with teachers and school updates."
      heroTitle="Need to ask a teacher quickly?"
      heroDescription="Start a guided Dash chat and prepare a clear question before sending."
      heroCta="Open Dash Chat"
      heroIcon="chatbubbles-outline"
      heroTone="purple"
      onHeroPress={() =>
        router.push('/screens/dash-assistant?source=k12_student&mode=tutor&tutorMode=explain' as any)
      }
      items={items}
      loading={loading}
      emptyMessage="No messages yet."
    />
  );
}
