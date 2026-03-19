import React from 'react';
import { router } from 'expo-router';
import { K12StudentFeatureScreen } from '@/domains/k12/components/K12StudentFeatureScreen';
import { useStudentClasses } from '@/hooks/k12/useStudentClasses';

export default function K12StudentClassesScreen() {
  const { items, loading } = useStudentClasses();

  return (
    <K12StudentFeatureScreen
      title="Classes"
      subtitle="Track periods, rooms, and teacher notes."
      heroTitle="Need help before class?"
      heroDescription="Start Tutor Mode for a quick concept preview before your next lesson."
      heroCta="Open Tutor Session"
      heroIcon="school-outline"
      heroTone="green"
      onHeroPress={() =>
        router.push('/screens/dash-assistant?mode=tutor&source=k12_student&tutorMode=diagnostic' as any)
      }
      items={items}
      loading={loading}
      emptyMessage="No classes enrolled yet. Ask your teacher to add you."
    />
  );
}
