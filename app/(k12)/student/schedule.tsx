import React from 'react';
import { router } from 'expo-router';
import { K12StudentFeatureScreen } from '@/domains/k12/components/K12StudentFeatureScreen';
import { useStudentSchedule } from '@/hooks/k12/useStudentSchedule';

export default function K12StudentScheduleScreen() {
  const { items, loading } = useStudentSchedule();

  return (
    <K12StudentFeatureScreen
      title="Schedule"
      subtitle="Daily timetable and upcoming periods."
      heroTitle="Prepare for your next period"
      heroDescription="Run a 5-minute Tutor warmup before class starts."
      heroCta="Start 5-Min Warmup"
      heroIcon="time-outline"
      heroTone="green"
      onHeroPress={() =>
        router.push('/screens/dash-assistant?mode=tutor&source=k12_student&tutorMode=practice' as any)
      }
      items={items}
      loading={loading}
      emptyMessage="No schedule set up yet. Ask your school to add the timetable."
    />
  );
}
