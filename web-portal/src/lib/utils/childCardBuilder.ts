/**
 * Child Card Builder Utility
 * Pure function to transform child data into ChildCard format
 * Extracted from useChildrenData.ts
 */

import type { ChildCard, ChildMetrics } from '@/lib/hooks/parent/types';

interface ChildData {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  class_id?: string;
  preschool_id?: string | null;
  organization_id?: string | null;
  student_id?: string | null;
  avatar_url?: string | null;
  profile_picture_url?: string | null;
  classes?: {
    id?: string;
    name?: string;
    grade_level?: string;
  } | null;
}

/**
 * Builds a ChildCard object from raw child data and metrics
 * This is a pure function with no side effects or database calls
 */
export function buildChildCardFromData(
  child: ChildData,
  metrics: ChildMetrics
): ChildCard {
  const preschoolId = child.preschool_id || child.organization_id || null;
  return {
    id: child.id,
    firstName: child.first_name,
    lastName: child.last_name,
    dateOfBirth: child.date_of_birth,
    grade: child.classes?.grade_level || 'Preschool',
    className: child.classes?.name || (child.class_id ? `Class ${String(child.class_id).slice(-4)}` : null),
    classId: child.class_id || undefined,
    preschoolId,
    organizationId: child.organization_id || null,
    preschoolName: null,
    studentCode: child.student_id || null,
    lastActivity: metrics.lastActivity,
    homeworkPending: metrics.homeworkPending,
    upcomingEvents: metrics.upcomingEvents,
    progressScore: metrics.progressScore,
    status: metrics.status,
    avatarUrl: child.avatar_url || child.profile_picture_url || null,
  };
}

/**
 * Creates default metrics for a child
 */
export function createDefaultMetrics(): ChildMetrics {
  return {
    homeworkPending: 0,
    upcomingEvents: 0,
    progressScore: 75,
    status: 'active',
    lastActivity: new Date(),
  };
}
