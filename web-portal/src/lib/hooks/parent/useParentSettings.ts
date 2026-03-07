/**
 * useParentSettings — State, effects, and handlers for the parent settings page.
 *
 * Extracted per WARP (screens ≤500 lines).
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { signOutEverywhere } from '@/lib/auth/signOut';
import { changeLanguage, getCurrentLanguage } from '@/lib/i18n';

export function useParentSettings() {
  const router = useRouter();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState<string>();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Profile form state
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Language preference
  const [language, setLanguage] = useState('en-ZA');

  // Linked children
  const [linkedChildren, setLinkedChildren] = useState<any[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);

  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Avatar upload
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ── Auth init ──────────────────────────────────────────
  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push('/sign-in');
        return;
      }

      setUserEmail(session.user.email);
      setUserId(session.user.id);
      setLoading(false);
    };

    initAuth();
  }, [router, supabase]);

  // ── Load profile data ──────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    const loadProfileData = async () => {
      if (!userId) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone, avatar_url, notification_preferences')
        .eq('id', userId)
        .single();

      if (data && !error && isMounted) {
        setFullName(`${data.first_name || ''} ${data.last_name || ''}`.trim());
        setPhoneNumber(data.phone || '');
        setAvatarUrl(data.avatar_url || null);

        const prefs = data.notification_preferences || {};
        const preferredLanguage = (prefs as Record<string, unknown>).language as string || `${getCurrentLanguage()}-ZA`;
        setLanguage(preferredLanguage);
        const normalized = preferredLanguage.split('-')[0];
        if (normalized) {
          changeLanguage(normalized as 'en' | 'af' | 'zu');
        }
        setDarkMode((prefs as Record<string, unknown>).dark_mode !== false);
      }
    };

    loadProfileData();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadProfileData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId, supabase]);

  // ── Load linked children ───────────────────────────────
  useEffect(() => {
    const loadLinkedChildren = async () => {
      if (!userId) return;

      setLoadingChildren(true);
      try {
        const { data, error } = await supabase
          .from('students')
          .select('id, first_name, last_name, grade, class:classes!students_class_id_fkey(name)')
          .eq('parent_id', userId);

        if (data && !error) {
          setLinkedChildren(data);
        }
      } catch (err) {
        console.error('Failed to load children:', err);
      } finally {
        setLoadingChildren(false);
      }
    };

    loadLinkedChildren();
  }, [userId, supabase]);

  // ── Handlers ───────────────────────────────────────────
  const handleDarkModeToggle = async () => {
    const newValue = !darkMode;
    setDarkMode(newValue);

    if (newValue) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    if (userId) {
      await supabase
        .from('profiles')
        .update({
          notification_preferences: {
            language: language,
            dark_mode: newValue,
          },
        })
        .eq('id', userId);
    }
  };

  const handleLanguageChange = async (newLanguage: string) => {
    setLanguage(newLanguage);
    const normalized = newLanguage.split('-')[0];
    if (normalized) {
      await changeLanguage(normalized as 'en' | 'af' | 'zu');
    }

    if (userId) {
      await supabase
        .from('profiles')
        .update({
          notification_preferences: {
            language: newLanguage,
            dark_mode: darkMode,
          },
        })
        .eq('id', userId);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handleAvatarUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    t: (key: string, opts?: Record<string, unknown>) => string,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    if (file.size > 2 * 1024 * 1024) {
      setSaveError(t('settings.parent.errors.image_too_large', { defaultValue: 'Image must be less than 2MB' }));
      return;
    }

    if (!file.type.startsWith('image/')) {
      setSaveError(t('settings.parent.errors.image_invalid', { defaultValue: 'Please upload an image file' }));
      return;
    }

    try {
      setUploadingAvatar(true);
      setSaveError(null);

      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error('Avatar upload failed:', error);
      setSaveError(
        error.message ||
          t('settings.parent.errors.avatar_upload_failed', { defaultValue: 'Failed to upload avatar' }),
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (
    t: (key: string, opts?: Record<string, unknown>) => string,
  ) => {
    if (!userId) return;

    try {
      setSaving(true);
      setSaveError(null);

      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phoneNumber.trim(),
        })
        .eq('id', userId);

      if (error) throw error;

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error('Save failed:', error);
      setSaveError(
        error.message || t('settings.parent.errors.save_failed', { defaultValue: 'Failed to save changes' }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (
    t: (key: string, opts?: Record<string, unknown>) => string,
  ) => {
    if (newPassword !== confirmPassword) {
      setPasswordError(
        t('settings.parent.errors.password_mismatch', { defaultValue: 'Passwords do not match' }),
      );
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(
        t('settings.parent.errors.password_too_short', { defaultValue: 'Password must be at least 8 characters' }),
      );
      return;
    }

    try {
      setChangingPassword(true);
      setPasswordError(null);

      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) throw error;

      setShowPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      console.error('Password change failed:', error);
      setPasswordError(
        error.message ||
          t('settings.parent.errors.password_change_failed', { defaultValue: 'Failed to change password' }),
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOutEverywhere({ timeoutMs: 2500 });

    router.replace('/sign-in');
    if (typeof window !== 'undefined') {
      window.location.href = '/sign-in';
    }
  };

  const handleDeleteAccount = async (
    t: (key: string, opts?: Record<string, unknown>) => string,
  ) => {
    const confirmed =
      typeof window !== 'undefined'
        ? window.confirm(
            t('settings.parent.delete.confirm', {
              defaultValue:
                'Are you sure you want to permanently delete your EduDash Pro account? This action cannot be undone and will remove access immediately.',
            }),
          )
        : false;

    if (!confirmed) return;

    try {
      setDeletingAccount(true);
      setDeleteError(null);

      const { data, error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
        body: { confirm: true },
      });

      if (error || !data?.success) {
        throw error ?? new Error('Failed to delete account');
      }

      await signOutEverywhere({ timeoutMs: 2500 });

      router.replace('/sign-in?accountDeleted=1');
      if (typeof window !== 'undefined') {
        window.location.href = '/sign-in?accountDeleted=1';
      }
    } catch (err) {
      console.error('[ParentSettings] delete account failed', err);
      setDeleteError(
        t('settings.parent.delete.error', {
          defaultValue: 'We could not delete your account right now. Please try again or contact support.',
        }),
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const dismissPasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordError(null);
    setNewPassword('');
    setConfirmPassword('');
  };

  return {
    // Auth / loading
    userId,
    userEmail,
    loading,
    // Profile
    fullName,
    setFullName,
    phoneNumber,
    setPhoneNumber,
    avatarUrl,
    saving,
    saveSuccess,
    saveError,
    uploadingAvatar,
    // Dark mode / language
    darkMode,
    language,
    handleDarkModeToggle,
    handleLanguageChange,
    // Children
    linkedChildren,
    loadingChildren,
    // Password
    showPasswordModal,
    setShowPasswordModal,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    changingPassword,
    passwordError,
    dismissPasswordModal,
    // Sign out / delete
    signingOut,
    deletingAccount,
    deleteError,
    // Handlers
    handleAvatarUpload,
    handleSaveProfile,
    handlePasswordChange,
    handleSignOut,
    handleDeleteAccount,
  };
}
