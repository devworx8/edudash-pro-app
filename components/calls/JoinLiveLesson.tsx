/**
 * Join Live Lesson (React Native)
 * 
 * Component for students/parents to join ongoing live lessons.
 * Displays live lessons and allows joining with Daily.co React Native SDK.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import { VideoCallInterface } from './VideoCallInterface';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Lazy getter to avoid accessing supabase at module load time
const getSupabase = () => assertSupabase();

interface LiveLesson {
  id: string;
  title: string;
  meeting_url: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  teacher: { first_name: string; last_name: string } | null;
  classes: { name: string; grade_level: string } | null;
}

interface JoinLiveLessonProps {
  studentId?: string;
  classId?: string;
  preschoolId: string;
  /** Parent/student name for display in the call */
  userName?: string;
}

export function JoinLiveLesson({
  studentId,
  classId,
  preschoolId,
  userName = 'Parent',
}: JoinLiveLessonProps) {
  const [liveLessons, setLiveLessons] = useState<LiveLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  
  // Video call state
  const [activeLesson, setActiveLesson] = useState<LiveLesson | null>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);

  // Fetch live lessons
  const fetchLiveLessons = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const now = new Date().toISOString();

    try {
      // Clean up expired calls
      await getSupabase()
        .from('video_calls')
        .update({ status: 'ended', actual_end: now })
        .eq('preschool_id', preschoolId)
        .eq('status', 'live')
        .lt('scheduled_end', now);

      // Fetch live lessons
      // Use explicit FK hint for PostgREST: profiles!video_calls_teacher_id_fkey
      let query = getSupabase()
        .from('video_calls')
        .select(`
          id,
          title,
          meeting_url,
          status,
          scheduled_start,
          scheduled_end,
          teacher:profiles!video_calls_teacher_id_fkey (first_name, last_name),
          classes:classes!video_calls_class_id_fkey (name, grade_level)
        `)
        .eq('preschool_id', preschoolId)
        .eq('status', 'live')
        .gt('scheduled_end', now)
        .order('scheduled_start', { ascending: true });

      if (classId) {
        query = query.eq('class_id', classId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[JoinLiveLesson] Error fetching lessons:', error);
      } else {
        setLiveLessons((data as unknown as LiveLesson[]) || []);
      }
    } catch (err) {
      console.error('[JoinLiveLesson] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [preschoolId, classId]);

  // Initial fetch + realtime subscription
  useEffect(() => {
    fetchLiveLessons(false);

    // Set up realtime subscription for live lessons
    // Only refresh when status or meeting_url changes (lesson starts/ends)
    const channel = getSupabase()
      .channel(`live-lessons-${preschoolId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'video_calls',
          filter: `preschool_id=eq.${preschoolId}`,
        },
        (payload) => {
          console.log('[JoinLiveLesson] New lesson created:', payload);
          fetchLiveLessons(false);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_calls',
          filter: `preschool_id=eq.${preschoolId}`,
        },
        (payload) => {
          // Only refresh if status changed to live/ended or meeting_url was set
          const newStatus = (payload.new as any)?.status;
          const oldStatus = (payload.old as any)?.status;
          const newUrl = (payload.new as any)?.meeting_url;
          const oldUrl = (payload.old as any)?.meeting_url;
          
          if (newStatus !== oldStatus || newUrl !== oldUrl) {
            console.log('[JoinLiveLesson] Lesson status changed:', oldStatus, '->', newStatus);
            fetchLiveLessons(false);
          }
        }
      )
      .subscribe();

    // Poll every 60 seconds as fallback (reduced from 10s to avoid excessive refreshes)
    const pollInterval = setInterval(() => fetchLiveLessons(false), 60000);

    return () => {
      getSupabase().removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [preschoolId, fetchLiveLessons]);

  // Join lesson
  const handleJoinLesson = useCallback((lesson: LiveLesson) => {
    setJoiningId(lesson.id);

    // Validate meeting URL
    if (!lesson.meeting_url) {
      Alert.alert(
        'Cannot Join',
        'This lesson does not have a valid meeting link. Please ask the teacher to restart the lesson.',
        [{ text: 'OK', onPress: () => setJoiningId(null) }]
      );
      return;
    }

    console.log('[JoinLiveLesson] Joining lesson:', lesson.title, 'URL:', lesson.meeting_url);
    
    // Set active lesson and open video call
    setActiveLesson(lesson);
    setIsCallOpen(true);
    setJoiningId(null);
  }, []);

  // Handle call close
  const handleCallClose = useCallback(() => {
    setIsCallOpen(false);
    setActiveLesson(null);
    // Refresh lessons to check if still live
    fetchLiveLessons(false);
  }, [fetchLiveLessons]);

  // Render lesson item
  const renderLesson = useCallback(({ item }: { item: LiveLesson }) => {
    const teacherName = item.teacher
      ? `${item.teacher.first_name} ${item.teacher.last_name}`.trim()
      : 'Teacher';
    const className = item.classes?.name || 'Class';
    const gradeLevel = item.classes?.grade_level;
    const startTime = new Date(item.scheduled_start).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const isJoining = joiningId === item.id;

    return (
      <View style={styles.lessonCard}>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>

        <Text style={styles.lessonTitle}>{item.title}</Text>

        <View style={styles.infoRow}>
          <Ionicons name="person-outline" size={16} color="#6b7280" />
          <Text style={styles.infoText}>{teacherName}</Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="book-outline" size={16} color="#6b7280" />
          <Text style={styles.infoText}>
            {className} {gradeLevel ? `(${gradeLevel})` : ''}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={16} color="#6b7280" />
          <Text style={styles.infoText}>Started at {startTime}</Text>
        </View>

        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => handleJoinLesson(item)}
          disabled={isJoining}
        >
          {isJoining ? (
            <EduDashSpinner color="white" size="small" />
          ) : (
            <>
              <Ionicons name="videocam" size={20} color="white" />
              <Text style={styles.joinButtonText}>Join Lesson</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }, [joiningId, handleJoinLesson]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <EduDashSpinner size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading live lessons...</Text>
      </View>
    );
  }

  if (liveLessons.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="videocam-off-outline" size={64} color="#d1d5db" />
        <Text style={styles.emptyTitle}>No Live Lessons</Text>
        <Text style={styles.emptyText}>
          There are no live lessons at the moment. Check back later or ask your
          teacher to start a lesson.
        </Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => fetchLiveLessons(true)}
        >
          <Ionicons name="refresh" size={20} color="#3b82f6" />
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Live Lessons</Text>
        <Text style={styles.headerSubtitle}>
          {liveLessons.length} lesson{liveLessons.length !== 1 ? 's' : ''} in
          progress
        </Text>
      </View>

      <View style={styles.listContent}>
        {(liveLessons ?? []).map((item, index) => (
          <React.Fragment key={item.id}>
            {renderLesson({ item })}
          </React.Fragment>
        ))}
      </View>

      {/* Video Call Interface - Shows when joining a lesson */}
      {activeLesson && (
        <VideoCallInterface
          isOpen={isCallOpen}
          onClose={handleCallClose}
          roomName={activeLesson.title}
          userName={userName}
          isOwner={false} // Parents are not owners
          meetingUrl={activeLesson.meeting_url}
          role="parent" // Role-based controls
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    padding: 20,
    paddingBottom: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
  },
  lessonCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ef4444',
    letterSpacing: 1,
  },
  lessonTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
});
