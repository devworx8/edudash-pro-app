import { useCallback, useEffect, useState } from 'react';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/roleUtils';
import { logger } from '@/lib/logger';
import type { AdminUser } from '@/lib/screen-styles/super-admin-admin-management.styles';
import { fetchAdminUsers } from './fetchAdminUsers';
import { type ShowAlertConfig, type FormData, INITIAL_FORM_DATA } from './types';

export function useSuperAdminAdminManagement(showAlert: (config: ShowAlertConfig) => void) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);

  const loadAdminUsers = useCallback(async () => {
    if (!isSuperAdmin(profile?.role)) {
      showAlert({ title: 'Access Denied', message: 'Super admin privileges required', type: 'error' });
      return;
    }
    setLoading(true);
    const users = await fetchAdminUsers(profile?.id || '');
    setAdminUsers(users);
    setLoading(false);
  }, [profile?.role, profile?.id, showAlert]);

  useEffect(() => {
    loadAdminUsers();
  }, [loadAdminUsers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAdminUsers();
    setRefreshing(false);
  }, [loadAdminUsers]);

  const handleCreateAdmin = async () => {
    try {
      if (!formData.email || !formData.full_name) {
        showAlert({ title: 'Validation Error', message: 'Please fill in all required fields', type: 'warning' });
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        showAlert({ title: 'Validation Error', message: 'Please enter a valid email address', type: 'warning' });
        return;
      }

      const supabase = assertSupabase();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        showAlert({ title: 'Error', message: 'You must be logged in to invite admins', type: 'error' });
        return;
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-invite`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: formData.email.toLowerCase().trim(),
            full_name: formData.full_name.trim(),
            role: formData.role,
            department: formData.department,
            send_email: true,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send invitation');
      }

      showAlert({
        title: 'Invitation Sent! 🎉',
        message: `An invitation email has been sent to ${formData.email}. They will receive a link to set up their account.`,
        buttons: [{ text: 'OK' }],
        type: 'success',
      });

      track('superadmin_admin_user_invited', {
        role: formData.role,
        department: formData.department,
        created_by: profile?.id,
        invite_id: result.invite_id || result.user_id,
      });

      setShowCreateModal(false);
      setFormData(INITIAL_FORM_DATA);
      await loadAdminUsers();
    } catch (error: any) {
      logger.error('Failed to invite admin user:', error);
      showAlert({ title: 'Error', message: error.message || 'Failed to send invitation. Please try again.', type: 'error' });
    }
  };

  const handleToggleUserStatus = (user: AdminUser) => {
    showAlert({
      title: `${user.is_active ? 'Deactivate' : 'Activate'} Admin User`,
      message: `Are you sure you want to ${user.is_active ? 'deactivate' : 'activate'} ${user.full_name}?`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: user.is_active ? 'Deactivate' : 'Activate',
          style: user.is_active ? 'destructive' : 'default',
          onPress: async () => {
            try {
              const newStatus = !user.is_active;
              const { error } = await assertSupabase()
                .from('profiles')
                .update({ is_active: newStatus })
                .eq('id', user.id);

              if (error) throw error;

              track('superadmin_admin_user_status_changed', {
                user_id: user.id,
                new_status: newStatus,
                changed_by: profile?.id,
              });
              showAlert({
                title: 'Success',
                message: `${user.full_name} has been ${user.is_active ? 'deactivated' : 'activated'}`,
                type: 'success',
              });
              await loadAdminUsers();
            } catch (error: any) {
              logger.error('Failed to toggle user status:', error);
              showAlert({ title: 'Error', message: error.message || 'Failed to update user status', type: 'error' });
            }
          },
        },
      ],
    });
  };

  const handleDeleteUser = (user: AdminUser) => {
    showAlert({
      title: 'Delete Admin User',
      message: `Are you sure you want to permanently delete ${user.full_name}? This action cannot be undone.`,
      type: 'error',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const supabase = assertSupabase();
              const { data: { session } } = await supabase.auth.getSession();

              if (!session?.access_token) {
                showAlert({ title: 'Error', message: 'You must be logged in', type: 'error' });
                return;
              }

              const response = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/superadmin-delete-user`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    confirm: true,
                    target_user_id: user.id,
                    reason: `Deleted by superadmin ${profile?.id}`,
                  }),
                }
              );

              const result = await response.json();
              if (!response.ok) throw new Error(result.error || 'Failed to delete user');

              track('superadmin_admin_user_deleted', {
                user_id: user.id,
                user_role: user.role,
                deleted_by: profile?.id,
              });
              showAlert({ title: 'Success', message: `${user.full_name} has been deleted`, type: 'success' });
              await loadAdminUsers();
            } catch (error: any) {
              logger.error('Failed to delete admin user:', error);
              showAlert({ title: 'Error', message: error.message || 'Failed to delete user', type: 'error' });
            }
          },
        },
      ],
    });
  };

  return {
    profile,
    loading,
    refreshing,
    adminUsers,
    showCreateModal,
    setShowCreateModal,
    selectedUser,
    setSelectedUser,
    showEditModal,
    setShowEditModal,
    formData,
    setFormData,
    onRefresh,
    handleCreateAdmin,
    handleToggleUserStatus,
    handleDeleteUser,
  };
}
