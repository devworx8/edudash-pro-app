import { useCallback, useEffect, useState } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { isPlatformStaff } from '@/lib/roleUtils';
import { logger } from '@/lib/logger';
import type { UserRecord, UserFilters } from '@/lib/screen-styles/super-admin-users.styles';
import type { ShowAlertFn, ActionDeps, UseSuperAdminUsersReturn } from './types';
import * as actions from './userActions';

export type { UseSuperAdminUsersReturn } from './types';

export function useSuperAdminUsers(showAlert: ShowAlertFn): UseSuperAdminUsersReturn {
  const { profile } = useAuth();

  // ─── State ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserRecord[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [creatingTempPassword, setCreatingTempPassword] = useState(false);
  const [updatingTier, setUpdatingTier] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [filters, setFilters] = useState<UserFilters>({
    role: 'all', status: 'all', school: '', schoolId: '', search: '',
  });

  // ─── Fetch all users ────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    if (!isPlatformStaff(profile?.role)) {
      showAlert({ title: 'Access Denied', message: 'Super admin privileges required' });
      return;
    }

    try {
      setLoading(true);

      const { data: usersData, error: usersError } = await assertSupabase()
        .from('profiles')
        .select(`
          id, email, first_name, last_name, role, auth_user_id,
          preschool_id, organization_id, is_active, created_at,
          last_login_at, subscription_tier, avatar_url
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (usersError) {
        logger.error('Users fetch error:', usersError);
        showAlert({ title: 'Error', message: 'Failed to load users: ' + usersError.message, type: 'error' });
        return;
      }

      // Build preschool name map
      const preschoolIds = [...new Set(
        usersData?.filter(u => u.preschool_id).map(u => u.preschool_id) || [],
      )];
      let preschoolMap: Record<string, string> = {};

      if (preschoolIds.length > 0) {
        const { data: preschools } = await assertSupabase()
          .from('preschools')
          .select('id, name')
          .in('id', preschoolIds);
        if (preschools) {
          preschoolMap = Object.fromEntries(preschools.map(p => [p.id, p.name]));
        }
      }

      if (usersData) {
        // Fetch real-time presence for accurate "last seen"
        const userIds = usersData.map((u: any) => u.id).filter(Boolean);
        let presenceMap: Record<string, string | null> = {};
        if (userIds.length > 0) {
          const { data: presenceData } = await assertSupabase()
            .from('user_presence')
            .select('user_id, last_seen_at, status')
            .in('user_id', userIds);
          if (presenceData) {
            presenceMap = Object.fromEntries(
              presenceData.map((p: any) => [p.user_id, p.last_seen_at]),
            );
          }
        }

        const records: UserRecord[] = usersData.map((u: any) => ({
          id: u.id,
          auth_user_id: u.auth_user_id || null,
          email: u.email || '',
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
          role: u.role || 'parent',
          school_id: u.preschool_id || u.organization_id,
          school_name: u.preschool_id ? preschoolMap[u.preschool_id] : null,
          created_at: u.created_at,
          last_sign_in_at: presenceMap[u.id] || u.last_login_at,
          is_active: u.is_active !== false,
          avatar_url: u.avatar_url,
          subscription_tier: u.subscription_tier || null,
        }));
        setUsers(records);
        setTotalUsers(records.length);
      }
    } catch (error) {
      logger.error('Failed to fetch users:', error);
      showAlert({ title: 'Error', message: 'Failed to load users', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [profile?.role]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ─── Filter effect ──────────────────────────────────────────────────────
  useEffect(() => {
    let filtered = users;
    if (filters.role !== 'all') {
      filtered = filtered.filter(u => u.role === filters.role);
    }
    if (filters.status !== 'all') {
      filtered = filtered.filter(u =>
        filters.status === 'active' ? u.is_active : !u.is_active,
      );
    }
    if (filters.school) {
      filtered = filtered.filter(u =>
        u.school_name?.toLowerCase()?.includes(filters.school.toLowerCase()),
      );
    }
    if (filters.schoolId) {
      filtered = filtered.filter(u => u.school_id === filters.schoolId);
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      filtered = filtered.filter(u =>
        u.email.toLowerCase().includes(s) ||
        u.name?.toLowerCase()?.includes(s) ||
        u.school_name?.toLowerCase()?.includes(s),
      );
    }
    setFilteredUsers(filtered);
  }, [users, filters]);

  // ─── Bulk selection helpers ─────────────────────────────────────────────
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const toggleUserSelection = useCallback((userId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(filteredUsers.map(u => u.id)));
  }, [filteredUsers]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ─── Action dependencies ──────────────────────────────────────────────
  const deps: ActionDeps = {
    showAlert,
    profileId: profile?.id,
    fetchUsers,
    closeUserModal: () => { setShowUserModal(false); setSelectedUser(null); },
    setImpersonating,
    setCreatingTempPassword,
    setUpdatingTier,
    setBulkDeleting,
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  }, [fetchUsers]);

  // ─── Return ─────────────────────────────────────────────────────────────
  return {
    hasAccess: !!profile && isPlatformStaff(profile.role),
    users,
    filteredUsers,
    totalUsers,
    loading,
    refreshing,
    impersonating,
    creatingTempPassword,
    updatingTier,
    showFilters,
    setShowFilters,
    showUserModal,
    setShowUserModal,
    selectedUser,
    setSelectedUser,
    filters,
    setFilters,
    onRefresh,
    impersonateUser: (user) => actions.impersonateUser(user, deps),
    suspendUser: (user) => actions.suspendUser(user, deps),
    updateUserRole: (user, role) => actions.updateUserRole(user, role, deps),
    requestUserDeletion: (user) => actions.requestUserDeletion(user, deps),
    deleteUserNow: (user) => actions.deleteUserNow(user, deps),
    resetUserPassword: (user) => actions.resetUserPassword(user, deps),
    createTempPassword: (user) => actions.createTempPassword(user, deps),
    openTierPicker: (user) => actions.openTierPicker(user, deps),
    openRolePicker: (user) => actions.openRolePicker(user, deps),
    selectionMode,
    selectedIds,
    toggleSelectionMode,
    toggleUserSelection,
    selectAllFiltered,
    clearSelection,
    bulkDeleting,
    bulkDeleteSelected: () => {
      const usersToDelete = users.filter(u => selectedIds.has(u.id));
      actions.bulkDeleteUsers(usersToDelete, deps, () => {
        setSelectedIds(new Set());
        setSelectionMode(false);
      });
    },
  };
}
