/**
 * K-12 Parent Dashboard Orchestration Hook
 *
 * Combines useK12ParentData + child switching + urgency computation
 * into a single hook consumed by the thin dashboard shell.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useK12ParentData } from '@/domains/k12/hooks/useK12ParentData';
import { useParentProgress } from '@/hooks/useLessonProgress';
import { calculateAge } from '@/lib/date-utils';
import type { Child } from '@/domains/k12/components/K12ParentChildCard';
import { useActiveChild } from '@/contexts/ActiveChildContext';

export interface UrgentItem {
  id: string;
  type: 'homework_due' | 'fee_overdue' | 'unread_message' | 'attendance_absent';
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  actionRoute: string;
}

export interface DashboardSummary {
  totalChildren: number;
  pendingTasks: number;
  attendanceRate: number;
  activeChildName: string | null;
  activeChildGrade: string | null;
  activeChildClassName: string | null;
  activeChildAttendance: number;
  activeChildPendingTasks: number;
  activeChildAvgGrade: string | null;
}

export interface LearningCompletion {
  id: string;
  child: string;
  completionRate: number;
  averageScore: number | null;
  averageStars: number | null;
}

const normalizeGradeLabel = (value?: string | null): string | null => {
  if (!value) return null;
  return value.replace(/^\s*grade\s+grade\s+/i, 'Grade ').replace(/\s+/g, ' ').trim();
};

function getGradeNumber(value?: string | null): number {
  if (!value) return 0;
  const normalized = value.toLowerCase();
  if (normalized.includes('grade r') || normalized.trim() === 'r') return 0;
  const match = normalized.match(/\d{1,2}/);
  return match ? Number(match[0]) : 0;
}

export function toUuidOrUndefined(value?: string | null): string | undefined {
  const normalized = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalized,
  )
    ? normalized
    : undefined;
}

export function useK12ParentDashboard(
  profileId: string | undefined,
  userId: string | undefined,
  organizationId: string | undefined,
) {
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const { setActiveChildId: setGlobalActiveChildId, activeChildId: globalActiveChildId, isHydrated } = useActiveChild();

  const {
    children,
    recentUpdates,
    upcomingEvents,
    dataLoading,
    fetchChildrenData,
  } = useK12ParentData(profileId, organizationId);

  const { childrenProgress } = useParentProgress(userId);

  const effectiveActiveChildId = activeChildId || globalActiveChildId || null;
  const activeChildIndex = useMemo(() => {
    if (children.length === 0) return 0;
    if (!effectiveActiveChildId) return 0;
    const idx = children.findIndex((child) => child.id === effectiveActiveChildId);
    return idx >= 0 ? idx : 0;
  }, [children, effectiveActiveChildId]);

  const activeChild: Child | null = useMemo(() => {
    if (children.length === 0) return null;
    return children[activeChildIndex] ?? null;
  }, [children, activeChildIndex]);

  // When children load, restore selection from the global context (AsyncStorage-backed)
  useEffect(() => {
    if (!isHydrated || children.length === 0) return;
    if (globalActiveChildId && children.some((child) => child.id === globalActiveChildId)) {
      setActiveChildId(globalActiveChildId);
      return;
    }
    if (activeChildId && children.some((child) => child.id === activeChildId)) {
      return;
    }
    // No stored selection — persist the default (index 0)
    if (children[0]?.id) {
      setActiveChildId(children[0].id);
      setGlobalActiveChildId(children[0].id);
    }
  }, [isHydrated, children, globalActiveChildId, activeChildId, setGlobalActiveChildId]);

  const switchChild = useCallback((index: number) => {
    const id = children[index]?.id;
    if (id) {
      setActiveChildId(id);
      setGlobalActiveChildId(id);
    }
  }, [children, setGlobalActiveChildId]);

  const dashboardSummary: DashboardSummary = useMemo(() => {
    const totalChildren = children.length;
    const pendingTasks = children.reduce(
      (sum, child) => sum + Number(child.pendingAssignments || 0),
      0,
    );
    const attendanceRate =
      totalChildren > 0
        ? Math.round(
            children.reduce((sum, child) => sum + Number(child.attendance || 0), 0) /
              totalChildren,
          )
        : 0;

    return {
      totalChildren,
      pendingTasks,
      attendanceRate,
      activeChildName: activeChild?.name ?? null,
      activeChildGrade: normalizeGradeLabel(activeChild?.grade),
      activeChildClassName: activeChild?.className ?? null,
      activeChildAttendance: Number(activeChild?.attendance || 0),
      activeChildPendingTasks: Number(activeChild?.pendingAssignments || 0),
      activeChildAvgGrade: activeChild?.avgGrade ?? null,
    };
  }, [children, activeChild]);

  const urgentItems: UrgentItem[] = useMemo(() => {
    const items: UrgentItem[] = [];

    children.forEach((child) => {
      if (Number(child.pendingAssignments || 0) > 0) {
        items.push({
          id: `hw-${child.id}`,
          type: 'homework_due',
          title: `${child.name.split(' ')[0]} has homework due`,
          subtitle: `${child.pendingAssignments} pending assignment${Number(child.pendingAssignments) !== 1 ? 's' : ''}`,
          icon: 'document-text',
          color: '#F59E0B',
          actionRoute: 'homework',
        });
      }

      if (Number(child.attendance || 0) < 80 && Number(child.attendance || 0) > 0) {
        items.push({
          id: `att-${child.id}`,
          type: 'attendance_absent',
          title: `${child.name.split(' ')[0]}'s attendance is low`,
          subtitle: `${child.attendance}% — below 80% threshold`,
          icon: 'calendar-outline',
          color: '#EF4444',
          actionRoute: 'attendance',
        });
      }
    });

    return items.slice(0, 3);
  }, [children]);

  const hasExamEligibleChild = useMemo(() => {
    if (!children || children.length === 0) return false;
    return children.some((child) => {
      const gradeNum = getGradeNumber(child.grade);
      if (gradeNum < 4) return false;
      const ageYears = calculateAge(child.dateOfBirth);
      return ageYears === null || ageYears >= 6;
    });
  }, [children]);

  const recentLearningCompletions: LearningCompletion[] = useMemo(() => {
    return childrenProgress
      .filter((item) => item.completedAssignments > 0)
      .slice(0, 3)
      .map((item) => ({
        id: item.studentId,
        child: item.studentName,
        completionRate: item.completionRate,
        averageScore: item.averageScore,
        averageStars: item.averageStars,
      }));
  }, [childrenProgress]);

  return {
    children,
    activeChild,
    activeChildIndex,
    switchChild,
    dashboardSummary,
    urgentItems,
    recentUpdates,
    upcomingEvents,
    recentLearningCompletions,
    dataLoading,
    fetchChildrenData,
    hasExamEligibleChild,
    getGradeNumber,
  };
}
