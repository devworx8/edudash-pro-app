'use client';

import React from 'react';
import { StartLiveLesson } from './StartLiveLesson';
import { StartLiveLessonPrebuilt } from './StartLiveLessonPrebuilt';
import { JoinLiveLesson } from './JoinLiveLesson';
import { JoinLiveLessonPrebuilt } from './JoinLiveLessonPrebuilt';

/**
 * Feature flag to toggle between legacy and Daily Prebuilt live lesson components.
 * Set to true to use the new Daily Prebuilt integration (default).
 * Set to false to use the legacy custom Daily.co implementation.
 * 
 * This can be controlled via environment variable:
 * NEXT_PUBLIC_USE_DAILY_PREBUILT=true (default) | false
 */
const USE_DAILY_PREBUILT = process.env.NEXT_PUBLIC_USE_DAILY_PREBUILT !== 'false';

// Props for StartLiveLesson components
interface StartLiveLessonProps {
  preschoolId: string;
  teacherId: string;
  teacherName: string;
  subscriptionTier?: string;
}

// Props for JoinLiveLesson components
interface JoinLiveLessonProps {
  studentId?: string;
  classId?: string;
  preschoolId: string;
}

/**
 * StartLiveLessonWithToggle - Wrapper component that toggles between
 * legacy StartLiveLesson and new StartLiveLessonPrebuilt based on feature flag.
 * 
 * By default, uses the new Daily Prebuilt integration.
 */
export function StartLiveLessonWithToggle(props: StartLiveLessonProps) {
  if (USE_DAILY_PREBUILT) {
    return <StartLiveLessonPrebuilt {...props} />;
  }
  return <StartLiveLesson {...props} />;
}

/**
 * JoinLiveLessonWithToggle - Wrapper component that toggles between
 * legacy JoinLiveLesson and new JoinLiveLessonPrebuilt based on feature flag.
 * 
 * By default, uses the new Daily Prebuilt integration.
 */
export function JoinLiveLessonWithToggle(props: JoinLiveLessonProps) {
  if (USE_DAILY_PREBUILT) {
    return <JoinLiveLessonPrebuilt {...props} />;
  }
  return <JoinLiveLesson {...props} />;
}
