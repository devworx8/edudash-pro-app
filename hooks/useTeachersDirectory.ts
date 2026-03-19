/**
 * Custom hook for managing teachers directory state and logic
 * Now backed by Supabase — fetches real teacher data from organization_members + profiles
 */

import { useState, useEffect, useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { offlineCacheService } from '@/lib/services/offlineCacheService';
import { removeTeacherFromSchool } from '@/lib/services/teacherRemovalService';
import {
  Teacher,
  FilterOptions,
  createInitialFilters,
} from '@/components/teachers-directory/teachers-directory.types';

export interface UseTeachersDirectoryReturn {
  // State
  teachers: Teacher[];
  filteredTeachers: Teacher[];
  loading: boolean;
  refreshing: boolean;
  isLoadingFromCache: boolean;
  filters: FilterOptions;
  showFilters: boolean;
  viewMode: 'list' | 'grid';
  selectedTeacher: Teacher | null;
  showTeacherModal: boolean;

  // Actions
  loadTeachers: (forceRefresh?: boolean) => Promise<void>;
  setFilters: React.Dispatch<React.SetStateAction<FilterOptions>>;
  setShowFilters: (show: boolean) => void;
  setViewMode: (mode: 'list' | 'grid') => void;
  clearFilters: () => void;
  getActiveFiltersCount: () => number;

  // Teacher actions
  handleCallTeacher: (phone: string) => void;
  handleEmailTeacher: (email: string) => void;
  handleEditTeacher: (teacher: Teacher) => void;
  handleDeleteTeacher: (teacher: Teacher) => void;
  toggleTeacherStatus: (teacherId: string, currentStatus: string) => void;
  setShowTeacherModal: (show: boolean) => void;

  // Permission checks
  canManageTeacher: () => boolean;
  canViewFullDetails: () => boolean;
}

export function useTeachersDirectory(): UseTeachersDirectoryReturn {
  const { user, profile } = useAuth();
  
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [filteredTeachers, setFilteredTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingFromCache, setIsLoadingFromCache] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>(createInitialFilters());
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [showTeacherModal, setShowTeacherModal] = useState(false);

  // ====================================================================
  // DATA LOADING
  // ====================================================================

  const loadTeachers = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(!forceRefresh);
      if (forceRefresh) setRefreshing(true);

      const userRole = profile?.role || 'parent';
      const schoolId = profile?.organization_id || 'school-123';

      // Try cache first
      if (!forceRefresh && user?.id) {
        setIsLoadingFromCache(true);
        const identifier = userRole === 'principal_admin' 
          ? `${schoolId}` 
          : `${schoolId}_${userRole}`;
        
        const cached = await offlineCacheService.get<Teacher[]>(
          'teacher_data_',
          identifier,
          user.id
        );
        
        if (cached) {
          setTeachers(cached);
          setIsLoadingFromCache(false);
          // Continue to fetch fresh data in background
          setTimeout(() => loadTeachers(true), 100);
          return;
        }
        setIsLoadingFromCache(false);
      }

      // Fetch teachers from Supabase: join organization_members + profiles
      const client = assertSupabase();

      const { data: members, error: membersError } = await client
        .from('organization_members')
        .select(`
          id,
          user_id,
          member_type,
          membership_status,
          joined_at,
          profile:profiles!user_id(
            id,
            first_name,
            last_name,
            email,
            phone,
            avatar_url,
            role
          )
        `)
        .eq('organization_id', schoolId)
        .in('member_type', ['teacher', 'lead_teacher', 'head_of_department'])
        .neq('membership_status', 'removed');

      if (membersError) {
        throw membersError;
      }

      // Also fetch class assignments for these teachers (including assistant via class_teachers)
      const teacherUserIds = (members || []).map((m: any) => m.user_id).filter(Boolean);
      let classAssignmentsMap = new Map<string, string[]>();
      let teacherRecordIdByUserId = new Map<string, string>();
      let teacherRecordIdByAuthUserId = new Map<string, string>();
      let teacherRecordIdByEmail = new Map<string, string>();

      if (teacherUserIds.length > 0) {
        const [{ data: classData }, { data: classTeacherRows }, { data: teacherRecords }] = await Promise.all([
          client
            .from('classes')
            .select('id, name, teacher_id')
            .in('teacher_id', teacherUserIds),
          client
            .from('class_teachers')
            .select('class_id, teacher_id')
            .in('teacher_id', teacherUserIds),
          client
            .from('teachers')
            .select('id, user_id, auth_user_id, email, is_active')
            .eq('preschool_id', schoolId)
            .eq('is_active', true),
        ]);

        // Build set of class IDs from class_teachers for name lookup
        const ctClassIds = (classTeacherRows || []).map((r: any) => r.class_id).filter(Boolean);
        let classNameMap = new Map<string, string>();
        if (ctClassIds.length > 0) {
          const { data: ctClasses } = await client
            .from('classes')
            .select('id, name')
            .in('id', ctClassIds);
          (ctClasses || []).forEach((cls: any) => {
            classNameMap.set(cls.id, cls.name || cls.id);
          });
        }

        // Add legacy classes.teacher_id assignments
        (classData || []).forEach((cls: any) => {
          const existing = classAssignmentsMap.get(cls.teacher_id) || [];
          existing.push(cls.name || cls.id);
          classAssignmentsMap.set(cls.teacher_id, existing);
        });

        // Add class_teachers join table assignments
        (classTeacherRows || []).forEach((row: any) => {
          const existing = classAssignmentsMap.get(row.teacher_id) || [];
          const className = classNameMap.get(row.class_id) || row.class_id;
          if (!existing.includes(className)) {
            existing.push(className);
          }
          classAssignmentsMap.set(row.teacher_id, existing);
        });

        (teacherRecords || []).forEach((record: any) => {
          if (record.user_id) teacherRecordIdByUserId.set(record.user_id, record.id);
          if (record.auth_user_id) teacherRecordIdByAuthUserId.set(record.auth_user_id, record.id);
          if (record.email) teacherRecordIdByEmail.set(String(record.email).toLowerCase(), record.id);
        });
      }

      // Map to Teacher interface
      const mappedTeachers: Teacher[] = (members || [])
        .filter((m: any) => m.profile)
        .map((m: any) => {
          const p = m.profile;
          const statusMap: Record<string, Teacher['employmentStatus']> = {
            active: 'full-time',
            suspended: 'inactive',
            on_leave: 'inactive',
          };

          return {
            id: m.user_id,
            teacherId: m.id, // organization_members PK
            teacherRecordId:
              teacherRecordIdByUserId.get(m.user_id) ||
              teacherRecordIdByAuthUserId.get(m.user_id) ||
              teacherRecordIdByEmail.get(String(p.email || '').toLowerCase()) ||
              null,
            teacherUserId: m.user_id,
            firstName: p.first_name || '',
            lastName: p.last_name || '',
            email: p.email || '',
            phone: p.phone || '',
            subjects: [], // Populated from teacher_subjects table if available
            grades: [],
            qualifications: [],
            experienceYears: 0,
            employmentStatus: statusMap[m.membership_status] || 'full-time',
            hireDate: m.joined_at || '',
            profilePhoto: p.avatar_url || undefined,
            emergencyContact: '',
            emergencyPhone: '',
            classroomNumber: undefined,
            specializations: [],
            performanceRating: 0,
            lastPerformanceReview: '',
            salary: undefined, // Only fetched for principal role
            bankDetails: undefined,
            leaveBalance: 0,
            schoolId: schoolId,
            isClassTeacher: classAssignmentsMap.has(m.user_id),
            assignedClasses: classAssignmentsMap.get(m.user_id) || [],
          } satisfies Teacher;
        });

      setTeachers(mappedTeachers);

      // Persist to offline cache
      if (user?.id) {
        const identifier = userRole === 'principal_admin' ? schoolId : `${schoolId}_${userRole}`;
        await offlineCacheService.set('teacher_data_', identifier, mappedTeachers, user.id);
      }

    } catch (error) {
      if (__DEV__) console.error('Failed to load teachers:', error);
      Alert.alert('Error', 'Failed to load teachers directory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, profile?.role, profile?.organization_id]);

  // ====================================================================
  // FILTERING
  // ====================================================================

  const applyFilters = useCallback(() => {
    let filtered = teachers;

    // Filter by subjects
    if (filters.subjects.length > 0) {
      filtered = filtered.filter(teacher => 
        teacher.subjects.some(subject => filters.subjects.includes(subject))
      );
    }

    // Filter by grades
    if (filters.grades.length > 0) {
      filtered = filtered.filter(teacher => 
        teacher.grades.some(grade => filters.grades.includes(grade))
      );
    }

    // Filter by employment status
    if (filters.employmentStatus.length > 0) {
      filtered = filtered.filter(teacher => 
        filters.employmentStatus.includes(teacher.employmentStatus)
      );
    }

    // Filter by search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(teacher =>
        teacher.firstName.toLowerCase().includes(searchLower) ||
        teacher.lastName.toLowerCase().includes(searchLower) ||
        teacher.teacherId.toLowerCase().includes(searchLower) ||
        teacher.email.toLowerCase().includes(searchLower) ||
        teacher.subjects.some(subject => subject.toLowerCase().includes(searchLower))
      );
    }

    // Sort by last name
    filtered.sort((a, b) => a.lastName.localeCompare(b.lastName));

    setFilteredTeachers(filtered);
  }, [teachers, filters]);

  useEffect(() => {
    loadTeachers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [teachers, filters, applyFilters]);

  const clearFilters = useCallback(() => {
    setFilters(createInitialFilters());
  }, []);

  const getActiveFiltersCount = useCallback((): number => {
    return filters.subjects.length + 
           filters.grades.length + 
           filters.employmentStatus.length + 
           (filters.search ? 1 : 0);
  }, [filters]);

  // ====================================================================
  // PERMISSION CHECKS
  // ====================================================================

  const canManageTeacher = useCallback((): boolean => {
    return ['principal', 'principal_admin', 'admin', 'super_admin'].includes(profile?.role || '');
  }, [profile?.role]);

  const canViewFullDetails = useCallback((): boolean => {
    return ['principal', 'principal_admin', 'teacher', 'admin', 'super_admin'].includes(profile?.role || '');
  }, [profile?.role]);

  // ====================================================================
  // TEACHER ACTIONS
  // ====================================================================

  const handleCallTeacher = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone}`);
  }, []);

  const handleEmailTeacher = useCallback((email: string) => {
    Linking.openURL(`mailto:${email}`);
  }, []);

  const handleEditTeacher = useCallback((teacher: Teacher) => {
    if (!canManageTeacher()) {
      Alert.alert('Access Denied', 'Only principals can edit teacher information.');
      return;
    }
    
    setSelectedTeacher(teacher);
    setShowTeacherModal(true);
  }, [canManageTeacher]);

  const handleDeleteTeacher = useCallback((teacher: Teacher) => {
    if (!canManageTeacher()) {
      Alert.alert('Access Denied', 'Only principals can archive teachers.');
      return;
    }

    const organizationId = profile?.organization_id || (profile as any)?.preschool_id;
    if (!organizationId) {
      Alert.alert('Error', 'No school found for this account.');
      return;
    }
    if (!teacher.teacherRecordId) {
      Alert.alert('Error', 'Missing teacher record.');
      return;
    }

    Alert.alert(
      'Archive Teacher',
      'Archive this teacher? They will be removed from active rosters and lose access, but historical data will stay intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeTeacherFromSchool({
                teacherRecordId: teacher.teacherRecordId,
                organizationId,
                teacherUserId: teacher.teacherUserId || teacher.id,
                reason: 'Archived via teachers directory',
              });
              setTeachers(prev => prev.filter(t => t.id !== teacher.id));
              loadTeachers(true);
            } catch (error) {
              if (__DEV__) console.error('Failed to archive teacher:', error);
              Alert.alert('Error', 'Failed to archive teacher');
            }
          },
        }
      ]
    );
  }, [canManageTeacher, loadTeachers, profile, setTeachers]);

  const toggleTeacherStatus = useCallback((teacherId: string, currentStatus: string) => {
    if (!canManageTeacher()) {
      Alert.alert('Access Denied', 'Only principals can change teacher status.');
      return;
    }

    const newStatus = currentStatus === 'inactive' ? 'full-time' : 'inactive';
    setTeachers(prev => prev.map(teacher => 
      teacher.id === teacherId 
        ? { ...teacher, employmentStatus: newStatus as Teacher['employmentStatus'] }
        : teacher
    ));
  }, [canManageTeacher]);

  return {
    // State
    teachers,
    filteredTeachers,
    loading,
    refreshing,
    isLoadingFromCache,
    filters,
    showFilters,
    viewMode,
    selectedTeacher,
    showTeacherModal,

    // Actions
    loadTeachers,
    setFilters,
    setShowFilters,
    setViewMode,
    clearFilters,
    getActiveFiltersCount,

    // Teacher actions
    handleCallTeacher,
    handleEmailTeacher,
    handleEditTeacher,
    handleDeleteTeacher,
    toggleTeacherStatus,
    setShowTeacherModal,

    // Permission checks
    canManageTeacher,
    canViewFullDetails,
  };
}
