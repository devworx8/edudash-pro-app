/**
 * Types for the TV / Room Display feature.
 * Room-safe, read-only content for display on a shared screen.
 */

export interface DisplayRoutineBlock {
  id: string;
  title: string;
  blockType: string;
  startTime: string | null;
  endTime: string | null;
  linkedLesson?: DisplayLessonWithDetails | null;
  lessonLinkSource?: 'manual' | 'auto' | null;
}

export interface DisplayTodayRoutine {
  weeklyProgramId: string;
  classId?: string | null;
  title: string | null;
  summary: string | null;
  dayOfWeek: number;
  blocks: DisplayRoutineBlock[];
}

export interface DisplayScheduledLesson {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  room_url: string | null;
  status: string;
  lesson_id?: string | null;
}

export interface LessonStepDisplay {
  title: string;
  duration: string;
  description: string;
}

export interface LessonMediaDisplay {
  thumbnail_url?: string | null;
  resources: Array<{ title: string; type?: string; url?: string }>;
}

export interface DisplayLessonWithDetails extends DisplayScheduledLesson {
  steps?: LessonStepDisplay[];
  media?: LessonMediaDisplay;
}

export interface DisplayMenuDay {
  date: string;
  breakfast: string[];
  lunch: string[];
  snack: string[];
}

export interface DisplayAnnouncement {
  id: string;
  title: string;
  body_preview: string;
  published_at: string | null;
}

export interface DisplayInsight {
  title: string;
  bullets: string[];
}

export interface DisplayData {
  routine: DisplayTodayRoutine | null;
  themeLabel: string | null;
  lessons: DisplayLessonWithDetails[];
  menuToday: DisplayMenuDay | null;
  announcements: DisplayAnnouncement[];
  insights: DisplayInsight | null;
  dateLabel: string;
  dayName: string;
}
