import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { assertSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import { writeSuperAdminAudit } from '@/lib/audit/superAdminAudit';
import { getAvailableTiersForRole } from '@/lib/tiers';
import { formatTierLabel } from '@/lib/screen-styles/super-admin-users.styles';
import type { UserRecord } from '@/lib/screen-styles/super-admin-users.styles';
import type { ActionDeps } from './types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Resolve the auth user ID for RPC calls. */
export const getAuthUserId = (user: UserRecord): string =>
  user.auth_user_id || user.id;

// ─── Clipboard / Share ──────────────────────────────────────────────────────

export async function copyToClipboard(
  value: string,
  showAlert: ActionDeps['showAlert'],
  label = 'Value',
): Promise<void> {
  try {
    if (!Clipboard?.setStringAsync) {
      throw new Error('Clipboard not available');
    }
    await Clipboard.setStringAsync(value);
    showAlert({ title: 'Copied', message: `${label} copied to clipboard.`, type: 'success' });
  } catch (error) {
    logger.error('Clipboard error:', error);
    showAlert({ title: 'Copy failed', message: 'Clipboard is not available on this platform.', type: 'error' });
  }
}

async function shareToWhatsApp(
  message: string,
  showAlert: ActionDeps['showAlert'],
): Promise<void> {
  const encoded = encodeURIComponent(message);
  const nativeUrl = `whatsapp://send?text=${encoded}`;
  const webUrl = `https://wa.me/?text=${encoded}`;

  try {
    const canOpen = await Linking.canOpenURL(nativeUrl);
    if (canOpen) {
      await Linking.openURL(nativeUrl);
      return;
    }
  } catch (error) {
    logger.warn('WhatsApp native share failed:', error);
  }

  try {
    await Linking.openURL(webUrl);
  } catch (error) {
    logger.error('WhatsApp web share failed:', error);
    showAlert({ title: 'Share failed', message: 'Unable to open WhatsApp. Please copy the password instead.', type: 'error' });
  }
}

// ─── User Actions ───────────────────────────────────────────────────────────

export async function impersonateUser(user: UserRecord, deps: ActionDeps): Promise<void> {
  const { showAlert, profileId, setImpersonating } = deps;

  if (user.role === 'superadmin' || user.role === 'super_admin') {
    showAlert({ title: 'Error', message: 'Cannot impersonate super admin users', type: 'error' });
    return;
  }

  showAlert({
    title: 'Impersonate User',
    message: `Are you sure you want to impersonate ${user.email}? This will log you in as this user.`,
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Impersonate',
        style: 'destructive',
        onPress: async () => {
          try {
            setImpersonating(true);
            track('superadmin_user_impersonation', {
              impersonated_user_id: user.id,
              impersonated_user_email: user.email,
              impersonated_user_role: user.role,
              impersonated_school_id: user.school_id,
            });

            await writeSuperAdminAudit({
              actorProfileId: profileId,
              action: 'user_impersonation_start',
              targetId: user.id,
              targetType: 'user',
              description: `Impersonation started for ${user.email}`,
              metadata: {
                impersonated_email: user.email,
                impersonated_role: user.role,
                impersonated_school: user.school_name,
              },
            });

            showAlert({
              title: 'Impersonation Started',
              message: `You are now impersonating ${user.email}. In a production app, you would be redirected to their dashboard with full access.`,
              type: 'success',
              buttons: [
                {
                  text: 'Return to Admin',
                  onPress: () => {
                    writeSuperAdminAudit({
                      actorProfileId: profileId,
                      action: 'user_impersonation_end',
                      targetId: user.id,
                      targetType: 'user',
                      description: `Impersonation ended for ${user.email}`,
                      metadata: { duration: 'immediate_return' },
                    });
                  },
                },
              ],
            });
          } catch (error) {
            logger.error('Impersonation failed:', error);
            showAlert({ title: 'Error', message: 'Failed to impersonate user', type: 'error' });
          } finally {
            setImpersonating(false);
          }
        },
      },
    ],
  });
}

export async function suspendUser(user: UserRecord, deps: ActionDeps): Promise<void> {
  const { showAlert, fetchUsers } = deps;

  showAlert({
    title: 'Suspend User',
    message: `Are you sure you want to ${user.is_active ? 'suspend' : 'reactivate'} ${user.email}?`,
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: user.is_active ? 'Suspend' : 'Reactivate',
        style: user.is_active ? 'destructive' : 'default',
        onPress: async () => {
          try {
            if (user.is_active) {
              const { data, error } = await assertSupabase().rpc('superadmin_suspend_user', {
                target_user_id: getAuthUserId(user),
                reason: 'Administrative suspension by super admin',
              });
              if (error) throw error;
              if (!data?.success) throw new Error(data?.error || 'Failed to suspend user');
            } else {
              const { data, error } = await assertSupabase().rpc('superadmin_reactivate_user', {
                target_user_id: getAuthUserId(user),
                reason: 'Administrative reactivation by super admin',
              });
              if (error) throw error;
              if (!data?.success) throw new Error(data?.error || 'Failed to reactivate user');
            }

            track('superadmin_user_status_changed', {
              user_id: user.id, user_email: user.email,
              new_status: user.is_active ? 'suspended' : 'active',
            });
            showAlert({ title: 'Success', message: `User ${user.is_active ? 'suspended' : 'reactivated'} successfully`, type: 'success' });
            deps.closeUserModal();
            fetchUsers();
          } catch (error) {
            logger.error('Failed to update user status:', error);
            showAlert({ title: 'Error', message: 'Failed to update user status', type: 'error' });
          }
        },
      },
    ],
  });
}

export async function updateUserRole(
  user: UserRecord,
  newRole: string,
  deps: ActionDeps,
): Promise<void> {
  const { showAlert, fetchUsers } = deps;

  showAlert({
    title: 'Update User Role',
    message: `Change ${user.email}'s role from ${user.role} to ${newRole}?`,
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Update Role',
        onPress: async () => {
          try {
            const { data, error } = await assertSupabase().rpc('superadmin_update_user_role', {
              target_user_id: getAuthUserId(user),
              new_role: newRole,
              reason: 'Administrative role change by super admin',
            });
            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || 'Failed to update user role');

            track('superadmin_user_role_updated', {
              user_id: user.id, user_email: user.email,
              old_role: user.role, new_role: newRole,
            });
            showAlert({ title: 'Success', message: `User role updated to ${newRole} successfully`, type: 'success' });
            fetchUsers();
          } catch (error) {
            logger.error('Failed to update user role:', error);
            showAlert({ title: 'Error', message: 'Failed to update user role', type: 'error' });
          }
        },
      },
    ],
  });
}

export async function requestUserDeletion(user: UserRecord, deps: ActionDeps): Promise<void> {
  const { showAlert, fetchUsers } = deps;

  showAlert({
    title: 'Request User Deletion',
    message:
      `Request deletion of ${user.email}?\n\n` +
      `This will deactivate the user immediately and schedule deletion in 7 days.`,
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Request Deletion',
        style: 'destructive',
        onPress: async () => {
          try {
            const { data, error } = await assertSupabase().rpc('superadmin_request_user_deletion', {
              target_user_id: getAuthUserId(user),
              deletion_reason: 'Administrative deletion request by super admin',
            });
            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || 'Failed to request user deletion');

            track('superadmin_user_deletion_requested', {
              user_id: user.id, user_email: user.email,
              request_id: data?.request_id,
            });
            showAlert({ title: 'Success', message: 'User deletion request submitted successfully', type: 'success' });
            deps.closeUserModal();
            fetchUsers();
          } catch (error) {
            logger.error('Failed to request user deletion:', error);
            const message = error instanceof Error ? error.message : 'Failed to request user deletion';
            showAlert({ title: 'Error', message, type: 'error' });
          }
        },
      },
    ],
  });
}

export async function deleteUserNow(user: UserRecord, deps: ActionDeps): Promise<void> {
  const { showAlert, fetchUsers, profileId } = deps;
  const targetAuthId = getAuthUserId(user);

  showAlert({
    title: 'Delete User Immediately',
    message:
      `This permanently deletes ${user.email} now.\n\n` +
      `This cannot be undone and will remove the user from authentication.\n\n` +
      `Continue?`,
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Now',
        style: 'destructive',
        onPress: async () => {
          try {
            const { data, error } = await assertSupabase().functions.invoke('superadmin-delete-user', {
              body: {
                confirm: true,
                target_user_id: targetAuthId,
                reason: 'Immediate deletion by superadmin',
              },
            });
            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || 'Delete failed');

            track('superadmin_user_deleted_now', {
              user_id: user.id,
              user_email: user.email,
              target_auth_user_id: targetAuthId,
            });

            await writeSuperAdminAudit({
              actorProfileId: profileId,
              action: 'user_deleted_now',
              targetId: user.id,
              targetType: 'user',
              description: `Immediate deletion executed for ${user.email}`,
              metadata: { target_auth_user_id: targetAuthId },
            });

            showAlert({ title: 'Deleted', message: 'User deleted successfully.', type: 'success' });
            deps.closeUserModal();
            fetchUsers();
          } catch (error: any) {
            logger.error('Failed to delete user immediately:', error);
            showAlert({
              title: 'Delete Failed',
              message: error?.message || 'Failed to delete user immediately',
              type: 'error',
            });
          }
        },
      },
    ],
  });
}

export async function resetUserPassword(user: UserRecord, deps: ActionDeps): Promise<void> {
  const { showAlert, profileId } = deps;

  showAlert({
    title: 'Reset Password',
    message: `Send password reset email to ${user.email}?`,
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send Reset Email',
        onPress: async () => {
          try {
            const { error } = await assertSupabase().auth.resetPasswordForEmail(user.email, {
              redirectTo: 'https://www.edudashpro.org.za/landing?flow=recovery',
            });
            if (error) throw error;

            track('superadmin_password_reset_sent', { user_id: user.id, user_email: user.email });

            await writeSuperAdminAudit({
              actorProfileId: profileId,
              action: 'password_reset_sent',
              targetId: user.id,
              targetType: 'user',
              description: `Password reset requested for ${user.email}`,
              metadata: { user_email: user.email },
            });

            showAlert({ title: 'Success', message: 'Password reset email sent successfully', type: 'success' });
          } catch (error) {
            logger.error('Failed to send password reset:', error);
            showAlert({ title: 'Error', message: 'Failed to send password reset email', type: 'error' });
          }
        },
      },
    ],
  });
}

export async function createTempPassword(user: UserRecord, deps: ActionDeps): Promise<void> {
  const { showAlert, setCreatingTempPassword } = deps;

  showAlert({
    title: 'Create Temporary Password',
    message: `Generate a temporary password for ${user.email}?\n\nThe user will be forced to set a new password on next login.`,
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Generate',
        onPress: async () => {
          setCreatingTempPassword(true);
          try {
            const { data, error } = await assertSupabase().functions.invoke(
              'superadmin-set-temp-password',
              { body: { target_user_id: getAuthUserId(user) } },
            );
            if (error) throw error;
            if (!data?.temp_password) throw new Error('Temporary password not returned');

            track('superadmin_temp_password_created', { user_id: user.id, user_email: user.email });

            const shareMessage =
              `EduDash Pro temporary password\n` +
              `User: ${user.email}\n` +
              `Password: ${data.temp_password}\n\n` +
              `Please sign in and change your password immediately.`;

            showAlert({
              title: 'Temporary Password Created',
              message: `Share this password securely with the user:\n\n${data.temp_password}`,
              type: 'success',
              buttons: [
                { text: 'WhatsApp', onPress: () => shareToWhatsApp(shareMessage, showAlert) },
                { text: 'Copy', onPress: () => copyToClipboard(data.temp_password, showAlert, 'Temporary password') },
                { text: 'Done', style: 'default' },
              ],
            });
          } catch (error) {
            logger.error('Failed to create temp password:', error);
            showAlert({ title: 'Error', message: 'Failed to create temporary password. Please try again.', type: 'error' });
          } finally {
            setCreatingTempPassword(false);
          }
        },
      },
    ],
  });
}

export async function updateUserTier(
  user: UserRecord,
  newTier: string,
  deps: ActionDeps,
): Promise<void> {
  const { showAlert, setUpdatingTier, fetchUsers } = deps;

  showAlert({
    title: 'Update Subscription Tier',
    message: `Set ${user.email}'s tier to ${formatTierLabel(newTier)}?`,
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Update',
        onPress: async () => {
          setUpdatingTier(true);
          try {
            const { data, error } = await assertSupabase().functions.invoke(
              'superadmin-set-user-tier',
              { body: { target_user_id: getAuthUserId(user), subscription_tier: newTier } },
            );
            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || 'Failed to update subscription tier');

            track('superadmin_user_tier_updated', { user_id: user.id, user_email: user.email, new_tier: newTier });
            showAlert({ title: 'Success', message: `Subscription tier updated to ${formatTierLabel(newTier)}.`, type: 'success' });
            fetchUsers();
          } catch (tierError) {
            logger.error('Failed to update user tier:', tierError);
            showAlert({ title: 'Error', message: 'Failed to update subscription tier', type: 'error' });
          } finally {
            setUpdatingTier(false);
          }
        },
      },
    ],
  });
}

// ─── Pickers (non-async, just show alert with options) ──────────────────────

export function openTierPicker(user: UserRecord, deps: ActionDeps): void {
  const { showAlert } = deps;

  if (user.role === 'superadmin' || user.role === 'super_admin') {
    showAlert({ title: 'Not Allowed', message: 'Super admin tier is fixed to enterprise.', type: 'warning' });
    return;
  }

  const tiers = getAvailableTiersForRole(user.role);
  showAlert({
    title: 'Select Subscription Tier',
    message: `Choose a tier for ${user.email}:`,
    buttons: [
      ...tiers.map((tier) => ({
        text: formatTierLabel(tier),
        onPress: () => updateUserTier(user, tier, deps),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ],
  });
}

export function openRolePicker(user: UserRecord, deps: ActionDeps): void {
  const { showAlert } = deps;

  showAlert({
    title: 'Update User Role',
    message: `Select new role for ${user.email}:`,
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Admin roles…', onPress: () => openAdminSubRolePicker(user, deps) },
      { text: 'Principal', onPress: () => updateUserRole(user, 'principal', deps) },
      { text: 'Teacher', onPress: () => updateUserRole(user, 'teacher', deps) },
      { text: 'Parent', onPress: () => updateUserRole(user, 'parent', deps) },
    ],
  });
}

function openAdminSubRolePicker(user: UserRecord, deps: ActionDeps): void {
  const { showAlert } = deps;

  showAlert({
    title: 'Select Admin Role',
    message: `Choose admin role for ${user.email}:`,
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      { text: 'General Admin', onPress: () => updateUserRole(user, 'admin', deps) },
      { text: 'Content Moderator', onPress: () => updateUserRole(user, 'content_moderator', deps) },
      { text: 'Support Admin', onPress: () => updateUserRole(user, 'support_admin', deps) },
      { text: 'Billing Admin', onPress: () => updateUserRole(user, 'billing_admin', deps) },
      { text: 'System Admin', onPress: () => updateUserRole(user, 'system_admin', deps) },
    ],
  });
}

// ─── Bulk Actions ───────────────────────────────────────────────────────────

export function bulkDeleteUsers(
  users: UserRecord[],
  deps: ActionDeps,
  onComplete: () => void,
): void {
  const { showAlert, fetchUsers, profileId, setBulkDeleting } = deps;

  if (users.length === 0) {
    showAlert({ title: 'No Selection', message: 'Select users to delete first.', type: 'warning' });
    return;
  }

  const superAdmins = users.filter(u => u.role === 'superadmin' || u.role === 'super_admin');
  if (superAdmins.length > 0) {
    showAlert({ title: 'Not Allowed', message: 'Cannot bulk delete super admin accounts.', type: 'error' });
    return;
  }

  showAlert({
    title: `Delete ${users.length} Users?`,
    message:
      `This will permanently delete ${users.length} selected user(s).\n\n` +
      `This cannot be undone.\n\n` +
      `Accounts:\n${users.slice(0, 5).map(u => `• ${u.email}`).join('\n')}` +
      (users.length > 5 ? `\n…and ${users.length - 5} more` : ''),
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      {
        text: `Delete ${users.length} Users`,
        style: 'destructive',
        onPress: async () => {
          setBulkDeleting(true);
          let successCount = 0;
          let failCount = 0;

          for (const user of users) {
            try {
              const targetAuthId = getAuthUserId(user);
              const { data, error } = await assertSupabase().functions.invoke('superadmin-delete-user', {
                body: {
                  confirm: true,
                  target_user_id: targetAuthId,
                  reason: 'Bulk deletion by superadmin',
                },
              });
              if (error || !data?.success) {
                failCount++;
                logger.error(`Bulk delete failed for ${user.email}:`, error || data?.error);
              } else {
                successCount++;
              }
            } catch (err) {
              failCount++;
              logger.error(`Bulk delete exception for ${user.email}:`, err);
            }
          }

          if (successCount > 0) {
            await writeSuperAdminAudit({
              actorProfileId: profileId,
              action: 'bulk_user_deleted',
              targetId: 'bulk',
              targetType: 'user',
              description: `Bulk deleted ${successCount} users (${failCount} failed)`,
              metadata: { deleted_emails: users.filter((_, i) => i < 20).map(u => u.email) },
            });

            track('superadmin_bulk_delete', {
              success_count: successCount,
              fail_count: failCount,
              total: users.length,
            });
          }

          setBulkDeleting(false);

          const message = failCount === 0
            ? `Successfully deleted ${successCount} user(s).`
            : `Deleted ${successCount}, failed ${failCount} of ${users.length} user(s).`;
          showAlert({ title: 'Bulk Delete Complete', message, type: failCount === 0 ? 'success' : 'warning' });
          onComplete();
          fetchUsers();
        },
      },
    ],
  });
}
