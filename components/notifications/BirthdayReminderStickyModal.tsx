import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { ModalLayer } from '@/components/ui/ModalLayer';

type ReminderRow = {
  id: string;
  title: string | null;
  message: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type StickyBirthdayReminder = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  studentName?: string;
  birthdayDate?: string;
  daysUntil?: number;
};

const SWIPE_HORIZONTAL_PADDING = 8;
const SWIPE_THUMB_SIZE = 56;

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
};

const asBool = (value: unknown): boolean => {
  return value === true || value === 'true';
};

async function fetchPendingBirthdayReminders(userId: string): Promise<StickyBirthdayReminder[]> {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, created_at, metadata')
    .eq('user_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return ((data || []) as ReminderRow[])
    .map((row) => {
      const metadata = asObject(row.metadata);
      const eventType = asString(metadata.event_type) || '';
      const dataPayload = asObject(metadata.data);

      if (!eventType.startsWith('birthday_reminder_')) return null;
      if (!asBool(metadata.requires_swipe_ack)) return null;
      if (asString(metadata.acknowledged_at)) return null;

      return {
        id: row.id,
        title: row.title || 'Birthday reminder',
        message: row.message || 'Upcoming birthday reminder',
        createdAt: row.created_at,
        metadata,
        studentName: asString(dataPayload.student_name),
        birthdayDate: asString(dataPayload.birthday_date),
        daysUntil: asNumber(metadata.reminder_offset_days) ?? asNumber(dataPayload.days_until),
      } as StickyBirthdayReminder;
    })
    .filter((row): row is StickyBirthdayReminder => row !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function BirthdayReminderStickyModal() {
  const { theme, isDark } = useTheme();
  const successColor = theme.success || '#10B981';
  const warningColor = theme.warning || '#F59E0B';
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const sliderX = useRef(new Animated.Value(0)).current;
  const [acknowledging, setAcknowledging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sliderWidth, setSliderWidth] = useState(300);

  const { data: reminders = [] } = useQuery({
    queryKey: ['sticky-birthday-reminders', user?.id],
    queryFn: () => fetchPendingBirthdayReminders(user!.id),
    enabled: !!user?.id,
    staleTime: 15000,
    refetchInterval: 60000,
  });

  const activeReminder = reminders[0] ?? null;

  useEffect(() => {
    sliderX.setValue(0);
    setAcknowledging(false);
    setErrorMessage(null);
  }, [activeReminder?.id, sliderX]);

  const maxTranslate = Math.max(
    0,
    sliderWidth - SWIPE_THUMB_SIZE - SWIPE_HORIZONTAL_PADDING * 2,
  );

  const acknowledgeReminder = useCallback(async () => {
    if (!user?.id || !activeReminder || acknowledging) return;

    setAcknowledging(true);
    setErrorMessage(null);
    const supabase = assertSupabase();
    const now = new Date().toISOString();
    const nextMetadata = {
      ...activeReminder.metadata,
      acknowledged_at: now,
      acknowledged_via: 'swipe',
      requires_swipe_ack: false,
      sticky_popup: false,
    };

    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: now,
        metadata: nextMetadata,
      })
      .eq('id', activeReminder.id)
      .eq('user_id', user.id);

    if (error) {
      setErrorMessage('Could not confirm reminder. Please swipe again.');
      setAcknowledging(false);
      Animated.spring(sliderX, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
        speed: 18,
      }).start();
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['sticky-birthday-reminders', user.id] });
    queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setAcknowledging(false);
  }, [activeReminder, acknowledging, queryClient, sliderX, user?.id]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !acknowledging,
        onMoveShouldSetPanResponder: (_, gesture) =>
          !acknowledging && Math.abs(gesture.dx) > 4,
        onPanResponderMove: (_, gesture) => {
          if (acknowledging) return;
          const next = Math.max(0, Math.min(maxTranslate, gesture.dx));
          sliderX.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          if (acknowledging) return;
          const threshold = maxTranslate * 0.78;
          if (gesture.dx >= threshold) {
            Animated.timing(sliderX, {
              toValue: maxTranslate,
              duration: 130,
              useNativeDriver: true,
            }).start(() => {
              void acknowledgeReminder();
            });
            return;
          }
          Animated.spring(sliderX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 18,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(sliderX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 18,
          }).start();
        },
      }),
    [acknowledging, acknowledgeReminder, maxTranslate, sliderX],
  );

  const reminderDayLabel = useMemo(() => {
    if (!activeReminder?.daysUntil && activeReminder?.daysUntil !== 0) return null;
    const days = activeReminder.daysUntil;
    if (days === 1) return 'Tomorrow';
    if (days === 0) return 'Today';
    return `In ${days} days`;
  }, [activeReminder?.daysUntil]);

  return (
    <ModalLayer
      visible={Boolean(activeReminder)}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Intentionally non-dismissible; swipe acknowledgment is required.
      }}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(insets.top, 18),
            paddingBottom: Math.max(insets.bottom, 18),
          },
        ]}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.cardBackground || theme.surface,
              borderColor: theme.border,
              shadowColor: isDark ? '#000' : '#0F172A',
            },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: `${theme.primary}22` }]}>
            <Ionicons name="gift-outline" size={36} color={theme.primary} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>{activeReminder?.title || 'Birthday reminder'}</Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>
            {activeReminder?.message || 'Upcoming birthday reminder'}
          </Text>

          {(activeReminder?.studentName || activeReminder?.birthdayDate || reminderDayLabel) && (
            <View style={styles.metaRow}>
              {activeReminder?.studentName ? (
                <View style={[styles.badge, { backgroundColor: `${theme.primary}1F` }]}>
                  <Text style={[styles.badgeText, { color: theme.primary }]}>{activeReminder.studentName}</Text>
                </View>
              ) : null}
              {activeReminder?.birthdayDate ? (
                <View style={[styles.badge, { backgroundColor: `${successColor}1F` }]}>
                  <Text style={[styles.badgeText, { color: successColor }]}>{activeReminder.birthdayDate}</Text>
                </View>
              ) : null}
              {reminderDayLabel ? (
                <View style={[styles.badge, { backgroundColor: `${warningColor}24` }]}>
                  <Text style={[styles.badgeText, { color: warningColor }]}>{reminderDayLabel}</Text>
                </View>
              ) : null}
            </View>
          )}

          <View
            style={[
              styles.swipeTrack,
              {
                backgroundColor: theme.surfaceVariant || `${theme.background}AA`,
                borderColor: theme.border,
              },
            ]}
            onLayout={(event) => {
              setSliderWidth(event.nativeEvent.layout.width);
            }}
          >
            <Text style={[styles.swipeText, { color: theme.textSecondary }]}>
              {acknowledging ? 'Confirming reminder...' : 'Swipe right to acknowledge'}
            </Text>

            <Animated.View
              style={[
                styles.swipeThumb,
                {
                  backgroundColor: theme.primary,
                  transform: [{ translateX: sliderX }],
                },
              ]}
              {...panResponder.panHandlers}
            >
              {acknowledging ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
              )}
            </Animated.View>
          </View>

          <Text style={[styles.helperText, { color: theme.textSecondary }]}>
            This reminder stays on screen until you swipe to confirm.
          </Text>

          {errorMessage ? <Text style={[styles.errorText, { color: theme.error || '#EF4444' }]}>{errorMessage}</Text> : null}
        </View>
      </View>
    </ModalLayer>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 28,
    elevation: 18,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  swipeTrack: {
    borderRadius: 999,
    height: 72,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: SWIPE_HORIZONTAL_PADDING,
    marginTop: 8,
  },
  swipeText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 70,
  },
  swipeThumb: {
    position: 'absolute',
    left: SWIPE_HORIZONTAL_PADDING,
    width: SWIPE_THUMB_SIZE,
    height: SWIPE_THUMB_SIZE,
    borderRadius: SWIPE_THUMB_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 7,
  },
  helperText: {
    marginTop: 12,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.9,
  },
  errorText: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default BirthdayReminderStickyModal;
