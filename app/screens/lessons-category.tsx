import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import LessonsCategoryPlaceholderScreen from '@/components/lessons/LessonsCategoryPlaceholderScreen';

export default function LessonsCategoryScreen() {
  const { categoryId, categoryName } = useLocalSearchParams();
  const resolvedTitle = typeof categoryName === 'string' && categoryName.length > 0
    ? categoryName
    : 'Category';

  return (
    <LessonsCategoryPlaceholderScreen
      headerTitle={resolvedTitle}
      description="Category-specific lesson browsing is currently under development. For now, you can explore all lessons from the Lessons Hub."
      categoryId={typeof categoryId === 'string' ? categoryId : undefined}
    />
  );
}
