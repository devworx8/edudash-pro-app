/**
 * useBirthdayPlanner Hook
 * 
 * React hook for birthday planner functionality in EduDash Pro.
 * Provides birthday data, preferences management, and loading states.
 */

import { useState, useEffect, useCallback } from 'react';
import { BirthdayPlannerService } from '@/services/BirthdayPlannerService';
import { logger } from '@/lib/logger';
import type {
  StudentBirthday,
  BirthdayCelebrationPreferences,
  UpcomingBirthdaysResponse,
  BirthdayCalendarEvent,
} from '@/services/BirthdayPlannerService';

// Re-export types for convenience
export type {
  StudentBirthday,
  BirthdayCelebrationPreferences,
  UpcomingBirthdaysResponse,
  BirthdayCalendarEvent,
};

interface UseBirthdayPlannerOptions {
  preschoolId?: string | null;
  classId?: string | null;
  studentId?: string | null;
  daysAhead?: number;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
}

interface UseBirthdayPlannerReturn {
  // Data
  birthdays: UpcomingBirthdaysResponse | null;
  classBirthdays: StudentBirthday[];
  studentBirthday: StudentBirthday | null;
  calendarEvents: BirthdayCalendarEvent[];
  
  // State
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  
  // Actions
  refresh: () => Promise<void>;
  loadClassBirthdays: (classId: string, daysAhead?: number) => Promise<void>;
  loadStudentBirthday: (studentId: string) => Promise<void>;
  loadCalendarEvents: (year: number, month: number) => Promise<void>;
  savePreferences: (
    studentId: string,
    preferences: Partial<BirthdayCelebrationPreferences>
  ) => Promise<{ success: boolean; error?: string }>;
  
  // Computed
  todaysBirthdays: StudentBirthday[];
  upcomingCount: number;
  hasBirthdaysToday: boolean;
}

export function useBirthdayPlanner(options: UseBirthdayPlannerOptions = {}): UseBirthdayPlannerReturn {
  const {
    preschoolId,
    classId,
    studentId,
    daysAhead = 90,
    autoRefresh = false,
    refreshInterval = 60000 * 60, // 1 hour default
  } = options;

  // State
  const [birthdays, setBirthdays] = useState<UpcomingBirthdaysResponse | null>(null);
  const [classBirthdays, setClassBirthdays] = useState<StudentBirthday[]>([]);
  const [studentBirthday, setStudentBirthday] = useState<StudentBirthday | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<BirthdayCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load preschool birthdays
  const loadBirthdays = useCallback(async () => {
    if (!preschoolId) return;
    
    try {
      const data = await BirthdayPlannerService.getUpcomingBirthdays(preschoolId, daysAhead);
      setBirthdays(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load birthdays');
    }
  }, [preschoolId, daysAhead]);

  // Load class birthdays
  const loadClassBirthdays = useCallback(async (targetClassId: string, days: number = 30) => {
    try {
      setLoading(true);
      const data = await BirthdayPlannerService.getClassBirthdays(targetClassId, days);
      setClassBirthdays(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load class birthdays');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load student birthday
  const loadStudentBirthday = useCallback(async (targetStudentId: string) => {
    try {
      setLoading(true);
      const data = await BirthdayPlannerService.getStudentBirthday(targetStudentId);
      setStudentBirthday(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load student birthday');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load calendar events
  const loadCalendarEvents = useCallback(async (year: number, month: number) => {
    if (!preschoolId) return;
    
    try {
      const events = await BirthdayPlannerService.getBirthdayCalendarEvents(preschoolId, year, month);
      setCalendarEvents(events);
    } catch (err: any) {
      logger.error('[useBirthdayPlanner] Error loading calendar events:', err);
    }
  }, [preschoolId]);

  // Save preferences
  const savePreferences = useCallback(async (
    targetStudentId: string,
    preferences: Partial<BirthdayCelebrationPreferences>
  ) => {
    const result = await BirthdayPlannerService.saveCelebrationPreferences(targetStudentId, preferences);
    
    // Refresh data after save
    if (result.success) {
      if (targetStudentId === studentId) {
        await loadStudentBirthday(targetStudentId);
      }
      if (preschoolId) {
        await loadBirthdays();
      }
    }
    
    return result;
  }, [studentId, preschoolId, loadStudentBirthday, loadBirthdays]);

  // Refresh function
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadBirthdays();
      if (classId) {
        await loadClassBirthdays(classId);
      }
      if (studentId) {
        await loadStudentBirthday(studentId);
      }
    } finally {
      setRefreshing(false);
    }
  }, [loadBirthdays, classId, loadClassBirthdays, studentId, loadStudentBirthday]);

  // Initial load
  useEffect(() => {
    if (preschoolId) {
      setLoading(true);
      loadBirthdays().finally(() => setLoading(false));
    }
  }, [preschoolId, loadBirthdays]);

  // Load class birthdays if classId provided
  useEffect(() => {
    if (classId) {
      loadClassBirthdays(classId);
    }
  }, [classId, loadClassBirthdays]);

  // Load student birthday if studentId provided
  useEffect(() => {
    if (studentId) {
      loadStudentBirthday(studentId);
    }
  }, [studentId, loadStudentBirthday]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !preschoolId) return;
    
    const interval = setInterval(() => {
      loadBirthdays();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, preschoolId, loadBirthdays]);

  // Computed values
  const todaysBirthdays = birthdays?.today || [];
  const upcomingCount = (birthdays?.today.length || 0) +
    (birthdays?.thisWeek.length || 0) +
    (birthdays?.thisMonth.length || 0);
  const hasBirthdaysToday = todaysBirthdays.length > 0;

  return {
    // Data
    birthdays,
    classBirthdays,
    studentBirthday,
    calendarEvents,
    
    // State
    loading,
    refreshing,
    error,
    
    // Actions
    refresh,
    loadClassBirthdays,
    loadStudentBirthday,
    loadCalendarEvents,
    savePreferences,
    
    // Computed
    todaysBirthdays,
    upcomingCount,
    hasBirthdaysToday,
  };
}

export default useBirthdayPlanner;
