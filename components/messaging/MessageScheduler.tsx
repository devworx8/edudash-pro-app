/**
 * MessageScheduler — Schedule messages for later delivery
 * 
 * A bottom sheet / modal that lets users pick a future date+time
 * to send a message. Shows a "Scheduled" indicator on the message.
 * 
 * Common presets:
 * - Later today (6 PM)
 * - Tomorrow morning (8 AM)
 * - Monday morning (8 AM)
 * - Custom date & time
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';

interface SchedulePreset {
  label: string;
  sublabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  getDate: () => Date;
}

interface MessageSchedulerProps {
  visible: boolean;
  onClose: () => void;
  onSchedule: (scheduledAt: Date) => void;
}

function getNextWeekdayMorning(): Date {
  const d = new Date();
  const dayOfWeek = d.getDay();
  // Find next Monday
  const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 6 ? 2 : 8 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + daysUntilMonday);
  monday.setHours(8, 0, 0, 0);
  return monday;
}

export function MessageScheduler({ visible, onClose, onSchedule }: MessageSchedulerProps) {
  const { theme } = useTheme();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const presets: SchedulePreset[] = useMemo(() => {
    const now = new Date();
    const laterToday = new Date(now);
    laterToday.setHours(18, 0, 0, 0);
    if (laterToday <= now) laterToday.setDate(laterToday.getDate() + 1);

    const tomorrowMorning = new Date(now);
    tomorrowMorning.setDate(now.getDate() + 1);
    tomorrowMorning.setHours(8, 0, 0, 0);

    const tomorrowAfternoon = new Date(now);
    tomorrowAfternoon.setDate(now.getDate() + 1);
    tomorrowAfternoon.setHours(14, 0, 0, 0);

    return [
      {
        label: 'Later Today',
        sublabel: `Today at ${laterToday.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        icon: 'sunny-outline',
        getDate: () => laterToday,
      },
      {
        label: 'Tomorrow Morning',
        sublabel: `${tomorrowMorning.toLocaleDateString([], { weekday: 'short' })} at 8:00 AM`,
        icon: 'partly-sunny-outline',
        getDate: () => tomorrowMorning,
      },
      {
        label: 'Tomorrow Afternoon',
        sublabel: `${tomorrowAfternoon.toLocaleDateString([], { weekday: 'short' })} at 2:00 PM`,
        icon: 'cloud-outline',
        getDate: () => tomorrowAfternoon,
      },
      {
        label: 'Next Monday',
        sublabel: `${getNextWeekdayMorning().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} at 8:00 AM`,
        icon: 'calendar-outline',
        getDate: () => getNextWeekdayMorning(),
      },
    ];
  }, []);

  const handlePresetSelect = useCallback(
    (preset: SchedulePreset) => {
      const date = preset.getDate();
      setSelectedDate(date);
    },
    []
  );

  const handleConfirm = useCallback(() => {
    if (selectedDate) {
      onSchedule(selectedDate);
      setSelectedDate(null);
      onClose();
    }
  }, [selectedDate, onSchedule, onClose]);

  const handleCancel = useCallback(() => {
    setSelectedDate(null);
    onClose();
  }, [onClose]);

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.62)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: 'rgba(7, 12, 30, 0.98)',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: Platform.OS === 'ios' ? 34 : 24,
      maxHeight: '70%',
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.14)',
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(191, 212, 255, 0.28)',
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(125, 211, 252, 0.12)',
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
    },
    headerSubtitle: {
      fontSize: 13,
      color: theme.textSecondary,
      marginTop: 2,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(191, 212, 255, 0.12)',
    },
    presetsList: {
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    presetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginBottom: 8,
      borderRadius: 14,
      backgroundColor: 'rgba(21, 31, 58, 0.88)',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    presetItemSelected: {
      borderColor: '#7dd3fc',
      backgroundColor: 'rgba(59, 130, 246, 0.14)',
    },
    presetIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    presetIconSelected: {
      backgroundColor: 'rgba(92, 124, 255, 0.92)',
    },
    presetTextContainer: {
      flex: 1,
    },
    presetLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    presetSublabel: {
      fontSize: 13,
      color: theme.textSecondary,
      marginTop: 2,
    },
    checkmark: {
      marginLeft: 8,
    },
    footer: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      paddingTop: 16,
      gap: 12,
      alignItems: 'center',
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.06)',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(191, 212, 255, 0.12)',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    scheduleButton: {
      flex: 2,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: selectedDate ? 'rgba(255,255,255,0.16)' : 'rgba(125, 211, 252, 0.12)',
    },
    scheduleButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.onPrimary,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <View style={styles.handle} />
          
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Schedule Message</Text>
              <Text style={styles.headerSubtitle}>
                Choose when to send this message
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={handleCancel}>
              <Ionicons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.presetsList} showsVerticalScrollIndicator={false}>
            {presets.map((preset, i) => {
              const isSelected = selectedDate?.getTime() === preset.getDate().getTime();
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.presetItem, isSelected && styles.presetItemSelected]}
                  onPress={() => handlePresetSelect(preset)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.presetIcon, isSelected && styles.presetIconSelected]}>
                    <Ionicons name={preset.icon} size={22} color={isSelected ? theme.onPrimary : theme.primary} />
                  </View>
                  <View style={styles.presetTextContainer}>
                    <Text style={styles.presetLabel}>{preset.label}</Text>
                    <Text style={styles.presetSublabel}>{preset.sublabel}</Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={24} color={theme.primary} style={styles.checkmark} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.scheduleButton}
              onPress={handleConfirm}
              disabled={!selectedDate}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={
                  selectedDate
                    ? ['#5c7cff', '#7c3aed', '#08c5ff']
                    : ['rgba(92,124,255,0.36)', 'rgba(124,58,237,0.28)']
                }
                style={{ width: '100%', paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
              >
                <Ionicons name="time-outline" size={20} color={theme.onPrimary} />
                <Text style={styles.scheduleButtonText}>
                  {selectedDate ? 'Schedule' : 'Pick a time'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/**
 * ScheduledBadge — Small badge on a scheduled message in the chat
 */
interface ScheduledBadgeProps {
  scheduledAt: Date;
}

export function ScheduledBadge({ scheduledAt }: ScheduledBadgeProps) {
  const { theme } = useTheme();

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#F59E0B' + '20',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      alignSelf: 'flex-end',
      marginTop: 4,
    },
    text: {
      fontSize: 11,
      color: '#F59E0B',
      fontWeight: '600',
    },
  });

  const timeStr = scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = scheduledAt.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <View style={styles.container}>
      <Ionicons name="time-outline" size={12} color="#F59E0B" />
      <Text style={styles.text}>Scheduled · {dateStr} {timeStr}</Text>
    </View>
  );
}

export default MessageScheduler;
