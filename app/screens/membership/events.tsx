/**
 * Events Calendar Screen
 * Organization events, meetings, and member calendar management
 */
import React, { useState, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Dimensions,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { DashboardWallpaperBackground } from '@/components/membership/dashboard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Types
interface OrganizationEvent {
  id: string;
  title: string;
  description: string;
  event_type: 'meeting' | 'workshop' | 'training' | 'social' | 'deadline' | 'webinar';
  location: string;
  is_virtual: boolean;
  virtual_link?: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  region_id?: string;
  region_name?: string;
  max_attendees?: number;
  current_attendees: number;
  is_mandatory: boolean;
  requires_registration: boolean;
  registration_deadline?: string;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  created_by_name: string;
}

// Mock Events
const EVENTS: OrganizationEvent[] = [
  {
    id: '1',
    title: 'National Leadership Summit 2025',
    description: 'Annual gathering of all regional managers and facilitators to discuss strategy and growth.',
    event_type: 'meeting',
    location: 'Johannesburg Convention Centre',
    is_virtual: false,
    start_date: '2025-01-15T09:00:00',
    end_date: '2025-01-15T17:00:00',
    all_day: false,
    max_attendees: 200,
    current_attendees: 156,
    is_mandatory: true,
    requires_registration: true,
    registration_deadline: '2025-01-10',
    status: 'upcoming',
    created_by_name: 'National Admin',
  },
  {
    id: '2',
    title: 'Facilitator Training Workshop',
    description: 'Essential skills training for new facilitators joining EduPro.',
    event_type: 'training',
    location: 'Online',
    is_virtual: true,
    virtual_link: 'https://zoom.us/j/123456789',
    start_date: '2025-01-08T14:00:00',
    end_date: '2025-01-08T16:00:00',
    all_day: false,
    region_id: 'r1',
    region_name: 'Gauteng',
    max_attendees: 50,
    current_attendees: 34,
    is_mandatory: false,
    requires_registration: true,
    status: 'upcoming',
    created_by_name: 'Training Lead',
  },
  {
    id: '3',
    title: 'Year-End Social Gathering',
    description: 'Celebrate the achievements of 2024 with fellow members.',
    event_type: 'social',
    location: 'Cape Town Waterfront',
    is_virtual: false,
    start_date: '2024-12-28T18:00:00',
    end_date: '2024-12-28T22:00:00',
    all_day: false,
    region_id: 'r2',
    region_name: 'Western Cape',
    current_attendees: 89,
    is_mandatory: false,
    requires_registration: false,
    status: 'upcoming',
    created_by_name: 'WC Regional Manager',
  },
  {
    id: '4',
    title: 'Membership Fee Payment Deadline',
    description: 'Last day to pay 2025 membership fees without late penalty.',
    event_type: 'deadline',
    location: '',
    is_virtual: false,
    start_date: '2025-01-31T23:59:00',
    end_date: '2025-01-31T23:59:00',
    all_day: true,
    current_attendees: 0,
    is_mandatory: true,
    requires_registration: false,
    status: 'upcoming',
    created_by_name: 'Finance Team',
  },
  {
    id: '5',
    title: 'Digital Marketing Webinar',
    description: 'Learn how to promote EduPro effectively on social media.',
    event_type: 'webinar',
    location: 'Online',
    is_virtual: true,
    virtual_link: 'https://teams.microsoft.com/l/meetup-join/...',
    start_date: '2025-01-20T10:00:00',
    end_date: '2025-01-20T11:30:00',
    all_day: false,
    max_attendees: 100,
    current_attendees: 67,
    is_mandatory: false,
    requires_registration: true,
    status: 'upcoming',
    created_by_name: 'Marketing Team',
  },
];

const EVENT_TYPE_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  meeting: { icon: 'people-outline', color: '#3B82F6', label: 'Meeting' },
  workshop: { icon: 'construct-outline', color: '#10B981', label: 'Workshop' },
  training: { icon: 'school-outline', color: '#8B5CF6', label: 'Training' },
  social: { icon: 'happy-outline', color: '#F59E0B', label: 'Social' },
  deadline: { icon: 'alarm-outline', color: '#EF4444', label: 'Deadline' },
  webinar: { icon: 'videocam-outline', color: '#06B6D4', label: 'Webinar' },
};

// Calendar helpers
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 
                'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function EventsScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  };

  // Get calendar days for current month
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const days: { date: Date; isCurrentMonth: boolean; hasEvents: boolean }[] = [];
    
    // Add previous month days
    for (let i = 0; i < firstDay.getDay(); i++) {
      const date = new Date(year, month, -i);
      days.unshift({ date, isCurrentMonth: false, hasEvents: false });
    }
    
    // Add current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month, i);
      const hasEvents = EVENTS.some(event => {
        const eventDate = new Date(event.start_date);
        return eventDate.getDate() === i && 
               eventDate.getMonth() === month && 
               eventDate.getFullYear() === year;
      });
      days.push({ date, isCurrentMonth: true, hasEvents });
    }
    
    // Add next month days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({ date, isCurrentMonth: false, hasEvents: false });
    }
    
    return days;
  }, [currentDate]);

  // Get events for selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return EVENTS;
    
    return EVENTS.filter(event => {
      const eventDate = new Date(event.start_date);
      return eventDate.getDate() === selectedDate.getDate() &&
             eventDate.getMonth() === selectedDate.getMonth() &&
             eventDate.getFullYear() === selectedDate.getFullYear();
    });
  }, [selectedDate]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return EVENTS
      .filter(e => new Date(e.start_date) >= now)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }, []);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      return newDate;
    });
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const isSelected = (date: Date): boolean => {
    if (!selectedDate) return false;
    return date.getDate() === selectedDate.getDate() &&
           date.getMonth() === selectedDate.getMonth() &&
           date.getFullYear() === selectedDate.getFullYear();
  };

  const renderEventCard = ({ item: event }: { item: OrganizationEvent }) => {
    const config = EVENT_TYPE_CONFIG[event.event_type];
    const eventDate = new Date(event.start_date);
    
    return (
      <TouchableOpacity 
        style={[styles.eventCard, { backgroundColor: theme.card }]}
        onPress={() => router.push(`/screens/membership/event-detail?id=${event.id}`)}
      >
        {event.is_mandatory && (
          <View style={[styles.mandatoryBadge, { backgroundColor: '#EF444420' }]}>
            <Text style={styles.mandatoryText}>Required</Text>
          </View>
        )}
        
        <View style={styles.eventMain}>
          <View style={styles.eventDateCol}>
            <Text style={[styles.eventMonth, { color: config.color }]}>
              {MONTHS[eventDate.getMonth()].substring(0, 3).toUpperCase()}
            </Text>
            <Text style={[styles.eventDay, { color: theme.text }]}>
              {eventDate.getDate()}
            </Text>
            <Text style={[styles.eventWeekday, { color: theme.textSecondary }]}>
              {DAYS[eventDate.getDay()]}
            </Text>
          </View>
          
          <View style={styles.eventInfo}>
            <View style={styles.eventHeader}>
              <View style={[styles.eventTypeTag, { backgroundColor: config.color + '20' }]}>
                <Ionicons name={config.icon} size={12} color={config.color} />
                <Text style={[styles.eventTypeText, { color: config.color }]}>{config.label}</Text>
              </View>
              {event.is_virtual && (
                <View style={[styles.virtualTag, { backgroundColor: theme.surface }]}>
                  <Ionicons name="wifi-outline" size={12} color={theme.textSecondary} />
                  <Text style={[styles.virtualText, { color: theme.textSecondary }]}>Online</Text>
                </View>
              )}
            </View>
            
            <Text style={[styles.eventTitle, { color: theme.text }]} numberOfLines={2}>
              {event.title}
            </Text>
            
            <View style={styles.eventMeta}>
              {!event.all_day && (
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={14} color={theme.textSecondary} />
                  <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                    {formatTime(event.start_date)} - {formatTime(event.end_date)}
                  </Text>
                </View>
              )}
              
              {event.location && (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={14} color={theme.textSecondary} />
                  <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
                    {event.location}
                  </Text>
                </View>
              )}
            </View>
            
            {event.requires_registration && event.max_attendees && (
              <View style={styles.attendeesRow}>
                <View style={styles.attendeesInfo}>
                  <Ionicons name="people-outline" size={14} color={theme.textSecondary} />
                  <Text style={[styles.attendeesText, { color: theme.textSecondary }]}>
                    {event.current_attendees}/{event.max_attendees} registered
                  </Text>
                </View>
                <View style={[styles.attendeesBar, { backgroundColor: theme.border }]}>
                  <View 
                    style={[
                      styles.attendeesFill, 
                      { 
                        backgroundColor: config.color,
                        width: `${Math.min((event.current_attendees / event.max_attendees) * 100, 100)}%`
                      }
                    ]} 
                  />
                </View>
              </View>
            )}
          </View>
        </View>
        
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <DashboardWallpaperBackground>
      <Stack.Screen
        options={{
          title: 'Events & Calendar',
          headerRight: () => (
            <View style={styles.headerButtons}>
              <TouchableOpacity 
                style={styles.headerButton}
                onPress={() => setViewMode(viewMode === 'calendar' ? 'list' : 'calendar')}
              >
                <Ionicons 
                  name={viewMode === 'calendar' ? 'list-outline' : 'calendar-outline'} 
                  size={24} 
                  color={theme.primary} 
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerButton}>
                <Ionicons name="add-outline" size={24} color={theme.primary} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <View style={[styles.calendarContainer, { backgroundColor: theme.card }]}>
            {/* Month Navigation */}
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={() => navigateMonth('prev')} style={styles.monthNavBtn}>
                <Ionicons name="chevron-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.monthTitle, { color: theme.text }]}>
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </Text>
              <TouchableOpacity onPress={() => navigateMonth('next')} style={styles.monthNavBtn}>
                <Ionicons name="chevron-forward" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            
            {/* Weekday Headers */}
            <View style={styles.weekdayRow}>
              {DAYS.map(day => (
                <View key={day} style={styles.weekdayCell}>
                  <Text style={[styles.weekdayText, { color: theme.textSecondary }]}>{day}</Text>
                </View>
              ))}
            </View>
            
            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {calendarDays.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dayCell,
                    isToday(item.date) && [styles.todayCell, { borderColor: theme.primary }],
                    isSelected(item.date) && [styles.selectedCell, { backgroundColor: theme.primary }],
                  ]}
                  onPress={() => setSelectedDate(item.date)}
                >
                  <Text style={[
                    styles.dayText,
                    { color: item.isCurrentMonth ? theme.text : theme.textSecondary },
                    isSelected(item.date) && { color: '#fff' },
                  ]}>
                    {item.date.getDate()}
                  </Text>
                  {item.hasEvents && !isSelected(item.date) && (
                    <View style={[styles.eventDot, { backgroundColor: theme.primary }]} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Upcoming Events Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {selectedDate 
                ? `Events on ${formatDate(selectedDate.toISOString())}`
                : 'Upcoming Events'}
            </Text>
            {selectedDate && (
              <TouchableOpacity onPress={() => setSelectedDate(null)}>
                <Text style={[styles.clearBtn, { color: theme.primary }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {(selectedDate ? selectedDateEvents : upcomingEvents).length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: theme.card }]}>
              <Ionicons name="calendar-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No events</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                {selectedDate ? 'No events scheduled for this date' : 'No upcoming events'}
              </Text>
            </View>
          ) : (
            (selectedDate ? selectedDateEvents : upcomingEvents).map(event => (
              <View key={event.id}>
                {renderEventCard({ item: event })}
              </View>
            ))
          )}
        </View>

        {/* Event Type Legend */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Event Types</Text>
          <View style={styles.legendGrid}>
            {Object.entries(EVENT_TYPE_CONFIG).map(([key, config]) => (
              <View key={key} style={[styles.legendItem, { backgroundColor: theme.card }]}>
                <View style={[styles.legendIcon, { backgroundColor: config.color + '20' }]}>
                  <Ionicons name={config.icon} size={16} color={config.color} />
                </View>
                <Text style={[styles.legendText, { color: theme.text }]}>{config.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={() => {/* Create new event */}}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
      </DashboardWallpaperBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
    marginRight: 16,
  },
  headerButton: {},
  content: {
    flex: 1,
  },
  
  // Calendar
  calendarContainer: {
    margin: 16,
    borderRadius: 16,
    padding: 16,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthNavBtn: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: (SCREEN_WIDTH - 64) / 7,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  todayCell: {
    borderWidth: 2,
  },
  selectedCell: {
    borderRadius: 8,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
  },
  
  // Section
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  clearBtn: {
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Event Card
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    position: 'relative',
  },
  mandatoryBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mandatoryText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#EF4444',
  },
  eventMain: {
    flex: 1,
    flexDirection: 'row',
    gap: 14,
  },
  eventDateCol: {
    width: 48,
    alignItems: 'center',
  },
  eventMonth: {
    fontSize: 10,
    fontWeight: '700',
  },
  eventDay: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28,
  },
  eventWeekday: {
    fontSize: 11,
  },
  eventInfo: {
    flex: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  eventTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  eventTypeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  virtualTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  virtualText: {
    fontSize: 10,
    fontWeight: '600',
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  eventMeta: {
    gap: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    flex: 1,
  },
  attendeesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  attendeesInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  attendeesText: {
    fontSize: 11,
  },
  attendeesBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  attendeesFill: {
    height: 4,
    borderRadius: 2,
  },
  
  // Empty State
  emptyState: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  
  // Legend
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
  },
  legendIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendText: {
    fontSize: 12,
    fontWeight: '500',
  },
  
  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
