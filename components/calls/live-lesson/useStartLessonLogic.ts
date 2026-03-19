/**
 * Start Live Lesson Logic Hook
 * Manages state and API calls for starting live lessons
 */

import { useState, useEffect, useMemo } from 'react';
import { Alert, Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { fetchTeacherClassIds } from '@/lib/dashboard/fetchTeacherClassIds';
import type { AdvancedSettings } from './AdvancedLessonSettings';

interface Class {
  id: string;
  name: string;
  grade_level: string;
  student_count?: number;
}

interface ExistingCall {
  id: string;
  meetingUrl: string;
  title: string;
  className: string;
  classId: string | null;
  startedAt: string;
}

// Default advanced settings
const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  isPrivateRoom: true,
  enableKnocking: true,
  enablePrejoinUI: true,
  camerasOnStart: true,
  microphonesOnStart: false,
  enableScreenShare: true,
  enableBreakoutRooms: false,
  chatMode: 'advanced',
  enableEmojiReactions: true,
  enablePeopleUI: true,
  enableBackgroundEffects: true,
  enablePictureInPicture: true,
  enableHandRaising: true,
  enableNetworkUI: true,
  enableNoiseCancellation: true,
  enableLiveCaptions: false,
  recordingMode: 'off',
  ownerOnlyBroadcast: false,
  maxParticipants: 50,
};

const TIER_TIME_LIMITS: Record<string, { minutes: number; label: string; badge: string; badgeColor: string }> = {
  free: { minutes: 15, label: '15 min', badge: 'Free', badgeColor: '#6b7280' },
  starter: { minutes: 30, label: '30 min', badge: 'Starter', badgeColor: '#3b82f6' },
  school_starter: { minutes: 30, label: '30 min', badge: 'School Starter', badgeColor: '#3b82f6' },
  basic: { minutes: 60, label: '1 hour', badge: 'Basic', badgeColor: '#8b5cf6' },
  premium: { minutes: 60, label: '1 hour', badge: 'Premium', badgeColor: '#ec4899' },
  school_premium: { minutes: 90, label: '1.5 hours', badge: 'School Premium', badgeColor: '#ec4899' },
  pro: { minutes: 60, label: '1 hour', badge: 'Pro', badgeColor: '#f97316' },
  school_pro: { minutes: 120, label: '2 hours', badge: 'School Pro', badgeColor: '#f97316' },
  enterprise: { minutes: 0, label: 'Unlimited', badge: 'Enterprise', badgeColor: '#10b981' },
  school_enterprise: { minutes: 0, label: 'Unlimited', badge: 'School Enterprise', badgeColor: '#10b981' },
};

export function useStartLessonLogic(
  preschoolId: string,
  teacherId: string,
  teacherName: string,
  subscriptionTier: string
) {
  console.log('[useStartLessonLogic] Props received:', {
    preschoolId,
    teacherId,
    teacherName,
    subscriptionTier,
  });

  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [existingCall, setExistingCall] = useState<ExistingCall | null>(null);
  const [isRejoining, setIsRejoining] = useState(false);
  
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [sendReminders, setSendReminders] = useState(true);
  const [customDuration, setCustomDuration] = useState<number>(0);
  
  // Advanced settings state
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettings>(DEFAULT_ADVANCED_SETTINGS);

  const tierConfig = TIER_TIME_LIMITS[subscriptionTier.toLowerCase()] || TIER_TIME_LIMITS.starter;
  console.log('[useStartLessonLogic] Tier calculation:', {
    input: subscriptionTier,
    lowercase: subscriptionTier.toLowerCase(),
    foundConfig: !!TIER_TIME_LIMITS[subscriptionTier.toLowerCase()],
    tierConfig,
  });
  const maxDurationMinutes = tierConfig.minutes || 1440;
  
  const durationOptions = useMemo(() => {
    const options: { value: number; label: string }[] = [];
    if (maxDurationMinutes >= 15) options.push({ value: 15, label: '15 min' });
    if (maxDurationMinutes >= 30) options.push({ value: 30, label: '30 min' });
    if (maxDurationMinutes >= 45) options.push({ value: 45, label: '45 min' });
    if (maxDurationMinutes >= 60) options.push({ value: 60, label: '1 hour' });
    if (maxDurationMinutes >= 90) options.push({ value: 90, label: '1.5 hours' });
    if (maxDurationMinutes >= 120) options.push({ value: 120, label: '2 hours' });
    if (maxDurationMinutes >= 180) options.push({ value: 180, label: '3 hours' });
    if (maxDurationMinutes >= 1440) options.push({ value: 1440, label: 'All day' });
    if (!options.find(o => o.value === maxDurationMinutes)) {
      options.push({ value: maxDurationMinutes, label: tierConfig.label });
    }
    return options.sort((a, b) => a.value - b.value);
  }, [maxDurationMinutes, tierConfig.label]);
  
  const effectiveDuration = customDuration > 0 ? Math.min(customDuration, maxDurationMinutes) : maxDurationMinutes;

  // Check for existing calls
  useEffect(() => {
    const checkExistingCall = async () => {
      const now = new Date().toISOString();
      try {
        await supabase
          .from('video_calls')
          .update({ status: 'ended', actual_end: now })
          .eq('teacher_id', teacherId)
          .eq('status', 'live')
          .lt('scheduled_end', now);

        const { data: liveCall } = await supabase
          .from('video_calls')
          .select(`
            id, meeting_id, meeting_url, title, class_id, actual_start, scheduled_end,
            classes:class_id (name)
          `)
          .eq('teacher_id', teacherId)
          .eq('status', 'live')
          .order('actual_start', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (liveCall?.meeting_url) {
          if (liveCall.scheduled_end && new Date(liveCall.scheduled_end) < new Date()) {
            await supabase
              .from('video_calls')
              .update({ status: 'ended', actual_end: now })
              .eq('id', liveCall.id);
            setExistingCall(null);
          } else {
            setExistingCall({
              id: liveCall.id,
              meetingUrl: liveCall.meeting_url,
              title: liveCall.title || 'Live Lesson',
              className: (liveCall.classes as any)?.name || 'Class',
              classId: liveCall.class_id,
              startedAt: liveCall.actual_start,
            });
          }
        }
      } catch (err) {
        console.warn('[useStartLessonLogic] Error checking existing call:', err);
      }
    };

    checkExistingCall();
    const interval = setInterval(checkExistingCall, 30000);
    return () => clearInterval(interval);
  }, [teacherId]);

  // Fetch classes
  useEffect(() => {
    const fetchClasses = async () => {
      console.log('[useStartLessonLogic] Fetching classes for teacherId:', teacherId);
      // Use class_teachers + legacy merge to include assistant teacher assignments
      const classIds = await fetchTeacherClassIds(teacherId);
      if (classIds.length === 0) {
        console.log('[useStartLessonLogic] No class IDs found for teacher');
        setClasses([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('classes')
        .select('id, name, grade_level')
        .in('id', classIds)
        .eq('active', true)
        .order('name');

      console.log('[useStartLessonLogic] Classes query result:', {
        count: data?.length || 0,
        error: error?.message,
        data: data?.map(c => ({ id: c.id, name: c.name }))
      });

      if (data) {
        const classesWithCounts = await Promise.all(
          data.map(async (cls) => {
            const { count } = await supabase
              .from('students')
              .select('*', { count: 'exact', head: true })
              .eq('class_id', cls.id);
            return { ...cls, student_count: count || 0 };
          })
        );
        console.log('[useStartLessonLogic] Classes with counts:', classesWithCounts);
        setClasses(classesWithCounts);
        if (classesWithCounts.length > 0) {
          setSelectedClass(classesWithCounts[0].id);
        }
      }
      setLoading(false);
    };

    fetchClasses();
  }, [teacherId]);

  const handleStartLesson = async () => {
    if (!selectedClass || !lessonTitle.trim()) {
      setError('Please select a class and enter a lesson title');
      return;
    }

    if (isScheduled) {
      if (!scheduledDate || !scheduledTime) {
        setError('Please select both date and time for the scheduled lesson');
        return;
      }
      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      if (scheduledDateTime <= new Date()) {
        setError('Scheduled time must be in the future');
        return;
      }
    }

    setIsCreating(true);
    setError(null);

    try {
      // Generate a unique room name to avoid conflicts
      const roomName = `lesson-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      
      const { data: roomData, error: roomError } = await supabase.functions.invoke('daily-rooms', {
        body: {
          name: roomName,
          isPrivate: false, // Public for class lessons
          expiryMinutes: effectiveDuration + 15, // Add buffer time
          maxParticipants: 50,
        },
      });

      // Handle specific error cases
      if (roomError) {
        console.error('[LiveLesson] Room creation error:', roomError);
        throw new Error(roomError.message || 'Failed to create meeting room. Please try again.');
      }
      
      // Check for room data - could be nested in 'room' object
      const room = roomData?.room || roomData;
      if (!room?.url) {
        console.error('[LiveLesson] No room URL in response:', roomData);
        throw new Error('Meeting room created but URL not returned. Please try again.');
      }

      const scheduledStart = isScheduled 
        ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
        : new Date().toISOString();

      const scheduledEnd = new Date(new Date(scheduledStart).getTime() + effectiveDuration * 60000).toISOString();

      await supabase
        .from('video_calls')
        .insert({
          teacher_id: teacherId,
          class_id: selectedClass,
          preschool_id: preschoolId,
          title: lessonTitle,
          meeting_url: room.url,
          meeting_id: room.name || roomName,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          status: isScheduled ? 'scheduled' : 'live',
          actual_start: isScheduled ? null : new Date().toISOString(),
        });

      if (sendReminders || !isScheduled) {
        const selectedClassData = classes.find(c => c.id === selectedClass);
        await supabase.functions.invoke('notify-parents-live-lesson', {
          body: {
            classId: selectedClass,
            className: selectedClassData?.name || 'Class',
            lessonTitle,
            teacherName,
            meetingUrl: room.url,
            scheduledStart,
            isScheduled,
          },
        });
      }

      if (isScheduled) {
        Alert.alert('Lesson Scheduled', `Your lesson has been scheduled for ${scheduledDate} at ${scheduledTime}.`);
        setShowModal(false);
        setLessonTitle('');
        setScheduledDate('');
        setScheduledTime('');
        setIsScheduled(false);
      } else {
        Alert.alert('Success', 'Live lesson started! Opening meeting...', [
          { text: 'OK', onPress: () => Linking.openURL(room.url) },
        ]);
        setShowModal(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start lesson');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRejoinCall = () => {
    if (!existingCall) return;
    setIsRejoining(true);
    Linking.openURL(existingCall.meetingUrl).finally(() => setIsRejoining(false));
  };

  const handleEndExistingCall = async () => {
    if (!existingCall) return;
    
    Alert.alert(
      'End Lesson',
      'Are you sure you want to end this live lesson?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase
                .from('video_calls')
                .update({ status: 'ended', actual_end: new Date().toISOString() })
                .eq('id', existingCall.id);
              setExistingCall(null);
              Alert.alert('Success', 'Live lesson ended');
            } catch (err) {
              Alert.alert('Error', 'Failed to end lesson');
            }
          },
        },
      ]
    );
  };

  return {
    classes,
    selectedClass,
    setSelectedClass,
    lessonTitle,
    setLessonTitle,
    isCreating,
    showModal,
    setShowModal,
    loading,
    error,
    setError,
    existingCall,
    isRejoining,
    isScheduled,
    setIsScheduled,
    scheduledDate,
    setScheduledDate,
    scheduledTime,
    setScheduledTime,
    sendReminders,
    setSendReminders,
    customDuration,
    setCustomDuration,
    durationOptions,
    maxDurationMinutes,
    tierConfig,
    effectiveDuration,
    advancedSettings,
    setAdvancedSettings,
    handleStartLesson,
    handleRejoinCall,
    handleEndExistingCall,
  };
}
