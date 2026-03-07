/**
 * useNotificationPreferences (Web)
 *
 * Reads/writes per-category notification preferences from the
 * `notification_preferences` table (created in migration 20260208105838).
 *
 * Uses upsert so a default row is auto-created on first save.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface NotificationPrefs {
  homework_reminders: boolean;
  attendance_alerts: boolean;
  messages: boolean;
  announcements: boolean;
  weekly_reports: boolean;
  payment_reminders: boolean;
  live_class_alerts: boolean;
  milestone_celebrations: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string;
}

const DEFAULT_PREFS: NotificationPrefs = {
  homework_reminders: true,
  attendance_alerts: true,
  messages: true,
  announcements: true,
  weekly_reports: true,
  payment_reminders: true,
  live_class_alerts: true,
  milestone_celebrations: true,
  push_enabled: true,
  email_enabled: false,
  sms_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  quiet_hours_timezone: 'Africa/Johannesburg',
};

interface UseNotificationPreferencesReturn {
  prefs: NotificationPrefs;
  loading: boolean;
  saving: boolean;
  error: string | null;
  updatePref: (key: keyof NotificationPrefs, value: boolean | string | null) => void;
  savePrefs: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useNotificationPreferences(
  userId: string | undefined
): UseNotificationPreferencesReturn {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const dirtyRef = useRef(false);

  const fetchPrefs = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (data) {
        setPrefs({
          homework_reminders: data.homework_reminders,
          attendance_alerts: data.attendance_alerts,
          messages: data.messages,
          announcements: data.announcements,
          weekly_reports: data.weekly_reports,
          payment_reminders: data.payment_reminders,
          live_class_alerts: data.live_class_alerts,
          milestone_celebrations: data.milestone_celebrations,
          push_enabled: data.push_enabled,
          email_enabled: data.email_enabled,
          sms_enabled: data.sms_enabled,
          quiet_hours_start: data.quiet_hours_start,
          quiet_hours_end: data.quiet_hours_end,
          quiet_hours_timezone: data.quiet_hours_timezone || 'Africa/Johannesburg',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load preferences';
      console.error('[useNotificationPreferences]', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [userId, supabase]);

  useEffect(() => {
    fetchPrefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const updatePref = useCallback(
    (key: keyof NotificationPrefs, value: boolean | string | null) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
      dirtyRef.current = true;
    },
    []
  );

  const savePrefs = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    setError(null);

    try {
      const { error: upsertError } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' });

      if (upsertError) throw upsertError;
      dirtyRef.current = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save preferences';
      console.error('[useNotificationPreferences] Save failed:', err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [userId, supabase, prefs]);

  return { prefs, loading, saving, error, updatePref, savePrefs, refresh: fetchPrefs };
}
