import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DayWeekToggleProps {
  mode: 'day' | 'week';
  onModeChange: (mode: 'day' | 'week') => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  canNavigatePrevious: boolean;
  canNavigateNext: boolean;
}

export const DayWeekToggle: React.FC<DayWeekToggleProps> = ({
  mode,
  onModeChange,
  selectedDate,
  onDateChange,
  canNavigatePrevious,
  canNavigateNext,
}) => {
  const formatDate = (date: Date): string => {
    if (mode === 'day') {
      return date.toLocaleDateString('en-ZA', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
    } else {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay() + 1); // Monday
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 4); // Friday

      const formatRange = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
      return `${formatRange(startOfWeek)} - ${formatRange(endOfWeek)}`;
    }
  };

  const handlePrevious = () => {
    const newDate = new Date(selectedDate);
    if (mode === 'day') {
      newDate.setDate(selectedDate.getDate() - 1);
    } else {
      newDate.setDate(selectedDate.getDate() - 7);
    }
    onDateChange(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(selectedDate);
    if (mode === 'day') {
      newDate.setDate(selectedDate.getDate() + 1);
    } else {
      newDate.setDate(selectedDate.getDate() + 7);
    }
    onDateChange(newDate);
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  const isToday = () => {
    const today = new Date();
    if (mode === 'day') {
      return (
        selectedDate.getDate() === today.getDate() &&
        selectedDate.getMonth() === today.getMonth() &&
        selectedDate.getFullYear() === today.getFullYear()
      );
    } else {
      const selectedWeek = getWeekNumber(selectedDate);
      const currentWeek = getWeekNumber(today);
      return selectedWeek === currentWeek && selectedDate.getFullYear() === today.getFullYear();
    }
  };

  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  };

  return (
    <View style={styles.container}>
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, mode === 'day' && styles.toggleButtonActive]}
          onPress={() => onModeChange('day')}
        >
          <Ionicons
            name="calendar"
            size={18}
            color={mode === 'day' ? '#FFF' : '#666'}
          />
          <Text style={[styles.toggleText, mode === 'day' && styles.toggleTextActive]}>
            Day
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, mode === 'week' && styles.toggleButtonActive]}
          onPress={() => onModeChange('week')}
        >
          <Ionicons
            name="calendar-outline"
            size={18}
            color={mode === 'week' ? '#FFF' : '#666'}
          />
          <Text style={[styles.toggleText, mode === 'week' && styles.toggleTextActive]}>
            Week
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.navigationContainer}>
        <TouchableOpacity
          style={[styles.navButton, !canNavigatePrevious && styles.navButtonDisabled]}
          onPress={handlePrevious}
          disabled={!canNavigatePrevious}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={canNavigatePrevious ? '#1976D2' : '#CCC'}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.dateDisplay} onPress={handleToday}>
          <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
          {!isToday() && (
            <View style={styles.todayBadge}>
              <Text style={styles.todayText}>Today</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, !canNavigateNext && styles.navButtonDisabled]}
          onPress={handleNext}
          disabled={!canNavigateNext}
        >
          <Ionicons
            name="chevron-forward"
            size={24}
            color={canNavigateNext ? '#1976D2' : '#CCC'}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 4,
    marginBottom: 12,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: '#1976D2',
  },
  toggleText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  toggleTextActive: {
    color: '#FFF',
  },
  navigationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    padding: 8,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  dateDisplay: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  todayBadge: {
    marginLeft: 8,
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  todayText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '500',
  },
});

export default DayWeekToggle;