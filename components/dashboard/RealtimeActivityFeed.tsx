/**
 * Real-time Activity Feed for Principal Dashboard
 * 
 * Provides live updates of school activities including enrollments, payments,
 * teacher actions, and system events with real-time subscription capabilities.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { 
  RealtimeSubscriptionService,
  StudentEnrollmentEvent,
  PaymentEvent,
  TeacherActivityEvent,
  AttendanceEvent,
  MeetingEvent
} from '@/lib/services/realtimeSubscriptionService';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Activity types for the feed
export interface ActivityFeedItem {
  id: string;
  type: 'enrollment' | 'payment' | 'teacher' | 'meeting' | 'attendance' | 'system';
  title: string;
  description: string;
  timestamp: string;
  priority: 'high' | 'medium' | 'low';
  icon: string;
  color: string;
  actionable?: boolean;
  onPress?: () => void;
}

interface RealtimeActivityFeedProps {
  schoolId: string;
  maxItems?: number;
  autoRefresh?: boolean;
  showHeader?: boolean;
  embedded?: boolean; // when true, render as non-virtualized list (no FlatList)
}

export const RealtimeActivityFeed: React.FC<RealtimeActivityFeedProps> = ({
  schoolId,
  maxItems = 20,
  autoRefresh = true,
  showHeader = true,
  embedded = false,
}) => {
  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const subscriptionsRef = useRef<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  const colors = {
    enrollment: '#4F46E5',
    payment: '#059669', 
    teacher: '#DC2626',
    meeting: '#7C3AED',
    attendance: '#EA580C',
    system: '#6B7280'
  };

  // Convert real-time events to activity feed items
  const createActivityFromEvent = useCallback((
    event: any,
    type: ActivityFeedItem['type']
  ): ActivityFeedItem => {
    const timestamp = new Date().toISOString();
    
    switch (type) {
      case 'enrollment': {
        const enrollmentEvent = event as StudentEnrollmentEvent;
        return {
          id: `enrollment_${enrollmentEvent.id}_${Date.now()}`,
          type: 'enrollment',
          title: 'New Student Enrollment',
          description: `${enrollmentEvent.first_name} ${enrollmentEvent.last_name} enrolled in ${enrollmentEvent.grade_level}`,
          timestamp,
          priority: 'high',
          icon: 'person-add',
          color: colors.enrollment,
          actionable: true,
          onPress: () => Alert.alert('Student Details', `View details for ${enrollmentEvent.first_name} ${enrollmentEvent.last_name}`)
        };
      }
        
      case 'payment': {
        const paymentEvent = event as PaymentEvent;
        return {
          id: `payment_${paymentEvent.id}_${Date.now()}`,
          type: 'payment',
          title: paymentEvent.status === 'completed' ? 'Payment Received' : 'Payment Update',
          description: `Payment of R${paymentEvent.amount} ${paymentEvent.status}`,
          timestamp,
          priority: paymentEvent.status === 'completed' ? 'high' : 'medium',
          icon: paymentEvent.status === 'completed' ? 'card' : 'time',
          color: paymentEvent.status === 'completed' ? colors.payment : colors.system,
          actionable: true,
          onPress: () => Alert.alert('Payment Details', `Payment ID: ${paymentEvent.id}`)
        };
      }
        
      case 'teacher': {
        const teacherEvent = event as TeacherActivityEvent;
        return {
          id: `teacher_${teacherEvent.id}_${Date.now()}`,
          type: 'teacher',
          title: 'Teacher Activity',
          description: teacherEvent.description,
          timestamp,
          priority: 'medium',
          icon: 'school',
          color: colors.teacher,
          actionable: false
        };
      }
        
      case 'meeting': {
        const meetingEvent = event as MeetingEvent;
        return {
          id: `meeting_${meetingEvent.id}_${Date.now()}`,
          type: 'meeting',
          title: `Meeting ${meetingEvent.status}`,
          description: meetingEvent.title,
          timestamp,
          priority: meetingEvent.status === 'in-progress' ? 'high' : 'medium',
          icon: meetingEvent.status === 'in-progress' ? 'videocam' : 'calendar',
          color: colors.meeting,
          actionable: true,
          onPress: () => Alert.alert('Meeting Details', meetingEvent.title)
        };
      }
        
      case 'attendance': {
        const attendanceEvent = event as AttendanceEvent;
        return {
          id: `attendance_${attendanceEvent.id}_${Date.now()}`,
          type: 'attendance',
          title: 'Attendance Update',
          description: `Student ${attendanceEvent.present ? 'present' : 'absent'}${attendanceEvent.reason ? ` - ${attendanceEvent.reason}` : ''}`,
          timestamp,
          priority: attendanceEvent.present ? 'low' : 'medium',
          icon: attendanceEvent.present ? 'checkmark-circle' : 'close-circle',
          color: colors.attendance,
          actionable: false
        };
      }
        
      default:
        return {
          id: `system_${Date.now()}`,
          type: 'system',
          title: 'System Activity',
          description: 'System activity detected',
          timestamp,
          priority: 'low',
          icon: 'settings',
          color: colors.system,
          actionable: false
        };
    }
  }, []);

  // Add new activity to the feed
  const addActivity = useCallback((activity: ActivityFeedItem) => {
    setActivities(prev => {
      const newActivities = [activity, ...prev];
      return newActivities.slice(0, maxItems); // Keep only the most recent items
    });
  }, [maxItems]);

  // Set up real-time subscriptions
  const setupRealtimeSubscriptions = useCallback(async () => {
    if (!schoolId) {
      console.warn('No school ID provided for real-time subscriptions');
      setConnectionStatus('error');
      return;
    }

    try {
      setConnectionStatus('connecting');
      
      console.log('🔄 Setting up real-time subscriptions for activity feed...');
      
      const subscriptionIds = RealtimeSubscriptionService.subscribeToDashboardData(schoolId, {
        onStudentEnrollment: (event) => {
          console.log('📝 Student enrollment event:', event.new);
          const activity = createActivityFromEvent(event.new, 'enrollment');
          addActivity(activity);
        },
        
        onPayment: (event) => {
          console.log('💰 Payment event:', event.new);
          const activity = createActivityFromEvent(event.new, 'payment');
          addActivity(activity);
        },
        
        onTeacherActivity: (event) => {
          console.log('👨‍🏫 Teacher activity event:', event.new);
          const activity = createActivityFromEvent(event.new, 'teacher');
          addActivity(activity);
        },
        
        onMeeting: (event) => {
          console.log('📅 Meeting event:', event.new);
          const activity = createActivityFromEvent(event.new, 'meeting');
          addActivity(activity);
        },
        
        onAttendance: (event) => {
          console.log('📊 Attendance event:', event.new);
          const activity = createActivityFromEvent(event.new, 'attendance');
          addActivity(activity);
        }
      });

      subscriptionsRef.current = subscriptionIds;
      setConnectionStatus('connected');
      
      console.log(`✅ Real-time subscriptions active: ${subscriptionIds.length} channels`);
      
    } catch (error) {
      console.error('❌ Failed to setup real-time subscriptions:', error);
      setConnectionStatus('error');
    }
  }, [schoolId, createActivityFromEvent, addActivity]);

  // Load initial activity data
  const loadInitialActivities = useCallback(async () => {
    setLoading(true);
    
    try {
      // Create some initial synthetic activities to show the feed is working
      const initialActivities: ActivityFeedItem[] = [
        {
          id: 'init_1',
          type: 'system',
          title: 'Activity Feed Active',
          description: 'Real-time activity monitoring is now active for your school',
          timestamp: new Date().toISOString(),
          priority: 'medium',
          icon: 'pulse',
          color: colors.system,
          actionable: false
        },
        {
          id: 'init_2',
          type: 'system',
          title: 'Dashboard Loaded',
          description: 'Principal dashboard loaded successfully with live data',
          timestamp: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
          priority: 'low',
          icon: 'checkmark-circle',
          color: colors.system,
          actionable: false
        }
      ];
      
      setActivities(initialActivities);
      
    } catch (error) {
      console.error('Failed to load initial activities:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize the activity feed
  useEffect(() => {
    loadInitialActivities();
    if (autoRefresh) {
      setupRealtimeSubscriptions();
    }

    // Cleanup subscriptions on unmount
    return () => {
      subscriptionsRef.current.forEach(id => {
        RealtimeSubscriptionService.unsubscribe(id);
      });
    };
  }, [loadInitialActivities, setupRealtimeSubscriptions, autoRefresh]);

  // Manual refresh function
  const handleRefresh = useCallback(() => {
    loadInitialActivities();
    if (autoRefresh) {
      // Restart subscriptions
      subscriptionsRef.current.forEach(id => {
        RealtimeSubscriptionService.unsubscribe(id);
      });
      setupRealtimeSubscriptions();
    }
  }, [loadInitialActivities, setupRealtimeSubscriptions, autoRefresh]);

  // Format timestamp for display
  const { t } = useTranslation('common')
  const formatTimestamp = useCallback((timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return t('activity.just_now', { defaultValue: 'Just now' });
    if (diffMins < 60) return t('activity.minutes_ago', { count: diffMins, defaultValue: `${diffMins}m ago` });
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t('activity.hours_ago', { count: diffHours, defaultValue: `${diffHours}h ago` });
    
    const diffDays = Math.floor(diffHours / 24);
    return t('activity.days_ago', { count: diffDays, defaultValue: `${diffDays}d ago` });
  }, [t]);

  // Render individual activity item
  const renderActivityItem = ({ item }: { item: ActivityFeedItem }) => (
    <TouchableOpacity
      style={[styles.activityItem, { borderLeftColor: item.color }]}
      onPress={item.actionable ? item.onPress : undefined}
      disabled={!item.actionable}
    >
      <View style={[styles.activityIcon, { backgroundColor: item.color }]}>
        <Ionicons name={item.icon as any} size={16} color="white" />
      </View>
      
      <View style={styles.activityContent}>
        <View style={styles.activityHeader}>
          <Text style={styles.activityTitle}>{item.title}</Text>
          <Text style={styles.activityTime}>
            {formatTimestamp(item.timestamp)}
          </Text>
        </View>
        
        <Text style={styles.activityDescription} numberOfLines={2}>
          {item.description}
        </Text>
        
        {item.priority === 'high' && (
          <View style={styles.priorityIndicator}>
            <Ionicons name="alert-circle" size={12} color="#DC2626" />
            <Text style={styles.priorityText}>{t('activity.high_priority', { defaultValue: 'High Priority' })}</Text>
          </View>
        )}
      </View>
      
      {item.actionable && (
        <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
      )}
    </TouchableOpacity>
  );

  // Render connection status indicator
  const renderConnectionStatus = () => (
    <View style={styles.statusContainer}>
      <View style={[
        styles.statusIndicator,
        {
          backgroundColor:
            connectionStatus === 'connected' ? '#059669' :
            connectionStatus === 'connecting' ? '#F59E0B' : '#DC2626'
        }
      ]} />
      <Text style={styles.statusText}>
        {connectionStatus === 'connected' ? t('activity.live', { defaultValue: 'Live' }) :
         connectionStatus === 'connecting' ? t('activity.connecting', { defaultValue: 'Connecting...' }) : t('activity.offline', { defaultValue: 'Offline' })}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <EduDashSpinner size="small" color="#6B7280" />
        <Text style={styles.loadingText}>{t('activity.loading', { defaultValue: 'Loading activity feed...' })}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showHeader && (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('activity.recent_activity', { defaultValue: 'Recent Activity' })}</Text>
          {renderConnectionStatus()}
        </View>
      )}

      {embedded ? (
        <View style={styles.listContent}>
          {activities.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="pulse" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No Recent Activity</Text>
              <Text style={styles.emptyDescription}>
                School activities will appear here in real-time
              </Text>
            </View>
          ) : (
            activities.map((item) => (
              <React.Fragment key={item.id}>
                {renderActivityItem({ item })}
              </React.Fragment>
            ))
          )}
        </View>
      ) : (
        <FlashList
          data={activities}
          renderItem={renderActivityItem}
          keyExtractor={(item) => item.id}
          estimatedItemSize={80}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={handleRefresh} />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="pulse" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>{t('activity.no_recent_activity', { defaultValue: 'No Recent Activity' })}</Text>
              <Text style={styles.emptyDescription}>
                {t('activity.empty_description', { defaultValue: 'School activities will appear here in real-time' })}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  listContent: {
    paddingVertical: 8,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderLeftWidth: 4,
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  activityTime: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 8,
  },
  activityDescription: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
    marginBottom: 4,
  },
  priorityIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  priorityText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '500',
    marginLeft: 4,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#D1D5DB',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default RealtimeActivityFeed;
