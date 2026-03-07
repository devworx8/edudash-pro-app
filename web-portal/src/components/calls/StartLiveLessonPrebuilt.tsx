'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Video, Clock, Users, Play, Loader2, X, Sparkles, Radio, Calendar, Bell, 
  Settings, MessageSquare, Monitor, Lock, Unlock, Mic, ChevronDown, ChevronUp,
  Camera, CameraOff, MicOff, Hand, Wifi, Globe, Subtitles, Image, PictureInPicture,
  Shield, Eye, Volume2, Smile, Languages, Crown, UserPlus
} from 'lucide-react';
import { DailyPrebuiltCall } from './DailyPrebuiltCall';
import { DailyPrebuiltProvider } from './DailyPrebuiltProvider';

interface Class {
  id: string;
  name: string;
  grade_level: string;
  student_count?: number;
}

// Tier-based time limits in minutes
const TIER_TIME_LIMITS: Record<string, { minutes: number; label: string; badge: string; badgeColor: string }> = {
  free: { minutes: 15, label: '15 min', badge: 'Free', badgeColor: '#6b7280' },
  starter: { minutes: 30, label: '30 min', badge: 'Starter', badgeColor: '#3b82f6' },
  basic: { minutes: 60, label: '1 hour', badge: 'Basic', badgeColor: '#8b5cf6' },
  premium: { minutes: 60, label: '1 hour', badge: 'Premium', badgeColor: '#ec4899' },
  pro: { minutes: 60, label: '1 hour', badge: 'Pro', badgeColor: '#f97316' },
  enterprise: { minutes: 0, label: 'Unlimited', badge: 'Enterprise', badgeColor: '#10b981' },
};

interface StartLiveLessonPrebuiltProps {
  preschoolId: string;
  teacherId: string;
  teacherName: string;
  subscriptionTier?: string;
}

function StartLiveLessonPrebuiltInner({
  preschoolId,
  teacherId,
  teacherName,
  subscriptionTier = 'starter',
}: StartLiveLessonPrebuiltProps) {
  const supabase = createClient();

  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeLesson, setActiveLesson] = useState<{
    url: string;
    title: string;
    className: string;
    meetingId?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Existing live call that teacher can rejoin
  const [existingCall, setExistingCall] = useState<{
    id: string;
    meetingUrl: string;
    title: string;
    className: string;
    classId: string;
    startedAt: string;
  } | null>(null);
  const [isRejoining, setIsRejoining] = useState(false);

  // Scheduling state
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [sendReminders, setSendReminders] = useState(true);

  // Custom duration state
  const [customDuration, setCustomDuration] = useState<number>(0);

  // Advanced room options (like Daily dashboard)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  
  // Privacy & Access
  const [isPrivateRoom, setIsPrivateRoom] = useState(true);
  const [enableKnocking, setEnableKnocking] = useState(true);
  const [enablePrejoinUI, setEnablePrejoinUI] = useState(true);
  
  // Audio/Video Settings
  const [camerasOnStart, setCamerasOnStart] = useState(true);
  const [microphonesOnStart, setMicrophonesOnStart] = useState(false);
  
  // Features
  const [enableScreenShare, setEnableScreenShare] = useState(true);
  const [enableBreakoutRooms, setEnableBreakoutRooms] = useState(false);
  const [chatMode, setChatMode] = useState<'off' | 'basic' | 'advanced'>('advanced');
  const [enableEmojiReactions, setEnableEmojiReactions] = useState(true);
  
  // UI Features
  const [enablePeopleUI, setEnablePeopleUI] = useState(true);
  const [enableBackgroundEffects, setEnableBackgroundEffects] = useState(true);
  const [enablePictureInPicture, setEnablePictureInPicture] = useState(true);
  const [enableHandRaising, setEnableHandRaising] = useState(true);
  const [enableNetworkUI, setEnableNetworkUI] = useState(true);
  const [enableNoiseCancellation, setEnableNoiseCancellation] = useState(true);
  const [enableLiveCaptions, setEnableLiveCaptions] = useState(false);
  
  // Recording
  const [recordingMode, setRecordingMode] = useState<'off' | 'local' | 'cloud'>('off');
  
  // Owner Only Broadcast - Only meeting owners can screen share, record and use camera/mic
  const [ownerOnlyBroadcast, setOwnerOnlyBroadcast] = useState(false);
  
  // Co-host (Additional Teacher)
  const [coHostEmail, setCoHostEmail] = useState('');
  const [coHosts, setCoHosts] = useState<string[]>([]);
  
  // Language
  const [roomLanguage, setRoomLanguage] = useState('en');
  
  // Max participants
  const [maxParticipants, setMaxParticipants] = useState(50);

  // Get time limit based on tier
  const tierConfig = TIER_TIME_LIMITS[subscriptionTier.toLowerCase()] || TIER_TIME_LIMITS.starter;
  const maxDurationMinutes = tierConfig.minutes || 1440;

  // Available duration options based on tier
  const durationOptions = React.useMemo(() => {
    const options: { value: number; label: string }[] = [];
    if (maxDurationMinutes >= 15) options.push({ value: 15, label: '15 min' });
    if (maxDurationMinutes >= 30) options.push({ value: 30, label: '30 min' });
    if (maxDurationMinutes >= 45) options.push({ value: 45, label: '45 min' });
    if (maxDurationMinutes >= 60) options.push({ value: 60, label: '1 hour' });
    if (maxDurationMinutes >= 90) options.push({ value: 90, label: '1.5 hours' });
    if (maxDurationMinutes >= 120) options.push({ value: 120, label: '2 hours' });
    if (maxDurationMinutes >= 180) options.push({ value: 180, label: '3 hours' });
    if (maxDurationMinutes >= 1440) options.push({ value: 1440, label: 'All day' });
    if (!options.find((o) => o.value === maxDurationMinutes)) {
      options.push({ value: maxDurationMinutes, label: tierConfig.label });
    }
    return options.sort((a, b) => a.value - b.value);
  }, [maxDurationMinutes, tierConfig.label]);

  // Effective duration
  const effectiveDuration = customDuration > 0 ? Math.min(customDuration, maxDurationMinutes) : maxDurationMinutes;

  // Check for existing live calls on mount
  useEffect(() => {
    const checkExistingCall = async () => {
      try {
        const now = new Date().toISOString();
        try {
          await supabase
            .from('video_calls')
            .update({ status: 'ended', actual_end: now })
            .eq('teacher_id', teacherId)
            .eq('status', 'live')
            .lt('scheduled_end', now);
        } catch (cleanupErr) {
          console.warn('[StartLiveLessonPrebuilt] Cleanup failed (non-critical):', cleanupErr);
        }

        const { data: liveCall, error } = await supabase
          .from('video_calls')
          .select(`
            id,
            meeting_id,
            meeting_url,
            title,
            class_id,
            actual_start,
            scheduled_end,
            classes:class_id (name)
          `)
          .eq('teacher_id', teacherId)
          .eq('status', 'live')
          .order('actual_start', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('[StartLiveLessonPrebuilt] Error checking for existing call:', error);
          return;
        }

        if (liveCall && liveCall.meeting_url) {
          if (liveCall.scheduled_end && new Date(liveCall.scheduled_end) < new Date()) {
            supabase
              .from('video_calls')
              .update({ status: 'ended', actual_end: now })
              .eq('id', liveCall.id)
              .then(() => console.log('[StartLiveLessonPrebuilt] Marked expired call as ended'))
              .catch((err: unknown) => console.warn('[StartLiveLessonPrebuilt] Failed to mark call as ended:', err));
            setExistingCall(null);
            return;
          }

          setExistingCall({
            id: liveCall.id,
            meetingUrl: liveCall.meeting_url,
            title: liveCall.title || 'Live Lesson',
            className: (liveCall.classes as { name: string } | null)?.name || 'Class',
            classId: liveCall.class_id,
            startedAt: liveCall.actual_start,
          });
        } else {
          setExistingCall(null);
        }
      } catch (err) {
        console.warn('[StartLiveLessonPrebuilt] Error in checkExistingCall:', err);
      }
    };

    checkExistingCall();
    const interval = setInterval(checkExistingCall, 30000);
    return () => clearInterval(interval);
  }, [supabase, teacherId]);

  // Fetch teacher's classes
  useEffect(() => {
    const fetchClasses = async () => {
      const { data } = await supabase
        .from('classes')
        .select('id, name, grade_level')
        .eq('teacher_id', teacherId)
        .eq('active', true);

      if (data) {
        const classesWithCounts = await Promise.all(
          data.map(async (cls: { id: string; name: string; grade_level: string }) => {
            const { count } = await supabase
              .from('students')
              .select('*', { count: 'exact', head: true })
              .eq('class_id', cls.id);
            return { ...cls, student_count: count || 0 };
          })
        );
        setClasses(classesWithCounts);
        if (classesWithCounts.length > 0) {
          setSelectedClass(classesWithCounts[0].id);
        }
      }
    };

    fetchClasses();
  }, [supabase, teacherId]);

  // Create room via API
  const createRoom = async (options: {
    name: string;
    classId?: string;
    preschoolId: string;
    maxParticipants?: number;
    enableRecording?: boolean;
    expiryMinutes?: number;
    // Privacy & Access
    isPrivate?: boolean;
    enableKnocking?: boolean;
    enablePrejoinUI?: boolean;
    // Audio/Video
    camerasOnStart?: boolean;
    microphonesOnStart?: boolean;
    // Features
    enableScreenShare?: boolean;
    enableBreakoutRooms?: boolean;
    enableChat?: boolean;
    enableAdvancedChat?: boolean;
    enableEmojiReactions?: boolean;
    // UI Features
    enablePeopleUI?: boolean;
    enableBackgroundEffects?: boolean;
    enablePictureInPicture?: boolean;
    enableHandRaising?: boolean;
    enableNetworkUI?: boolean;
    enableNoiseCancellation?: boolean;
    enableLiveCaptions?: boolean;
    // Recording mode
    recordingMode?: 'off' | 'local' | 'cloud';
    // Owner Controls
    ownerOnlyBroadcast?: boolean;
    coHosts?: string[];
    // Language
    language?: string;
  }) => {
    try {
      const response = await fetch('/api/daily/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.code === 'DAILY_API_KEY_MISSING' || response.status === 503) {
          setError('Video calls are not available. Please contact your administrator.');
        } else if (response.status === 401) {
          setError('Please sign in to create a call room.');
        } else if (response.status === 403) {
          setError('You do not have permission to create call rooms.');
        } else {
          setError(errorData.message || errorData.error || 'Failed to create room. Please try again.');
        }
        return null;
      }

      const data = await response.json();
      return data.room;
    } catch (err) {
      console.error('[StartLiveLessonPrebuilt] Error creating room:', err);
      setError('Network error. Please try again.');
      return null;
    }
  };

  // Start live lesson
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
      // Recording requires premium tier or higher
      const canRecord = !['free', 'starter'].includes(subscriptionTier.toLowerCase()) && recordingMode !== 'off';
      
      const room = await createRoom({
        name: lessonTitle,
        classId: selectedClass,
        preschoolId,
        maxParticipants,
        // Privacy & Access
        isPrivate: isPrivateRoom,
        enableKnocking,
        enablePrejoinUI,
        // Audio/Video
        camerasOnStart,
        microphonesOnStart,
        // Features
        enableScreenShare,
        enableBreakoutRooms,
        enableChat: chatMode !== 'off',
        enableAdvancedChat: chatMode === 'advanced',
        enableEmojiReactions,
        // UI Features
        enablePeopleUI,
        enableBackgroundEffects,
        enablePictureInPicture,
        enableHandRaising,
        enableNetworkUI,
        enableNoiseCancellation,
        enableLiveCaptions,
        // Recording
        enableRecording: canRecord,
        recordingMode: canRecord ? recordingMode : 'off',
        // Owner Controls
        ownerOnlyBroadcast,
        coHosts,
        // Language
        language: roomLanguage,
        // Duration
        expiryMinutes: effectiveDuration,
      });

      if (room) {
        const selectedClassName = classes.find((c) => c.id === selectedClass)?.name || '';

        if (isScheduled) {
          await scheduleLesson(room.url, selectedClass, lessonTitle, new Date(`${scheduledDate}T${scheduledTime}`));
          setShowModal(false);
          setLessonTitle('');
          setScheduledDate('');
          setScheduledTime('');
          setIsScheduled(false);
          alert(`Lesson scheduled! Parents will be notified ${sendReminders ? 'with reminders' : ''}.`);
        } else {
          await notifyClassParents(selectedClass, lessonTitle, room.url, 'starting');

          setActiveLesson({
            url: room.url,
            title: lessonTitle,
            className: selectedClassName,
          });
          setShowModal(false);
        }
      }
    } catch (err) {
      console.error('[StartLiveLessonPrebuilt] Error starting lesson:', err);
      setError('Failed to start lesson');
    } finally {
      setIsCreating(false);
    }
  };

  // Schedule a lesson for later
  const scheduleLesson = async (roomUrl: string, classId: string, title: string, scheduledTime: Date) => {
    try {
      const { error } = await supabase.from('scheduled_lessons').insert({
        class_id: classId,
        preschool_id: preschoolId,
        teacher_id: teacherId,
        title,
        room_url: roomUrl,
        scheduled_at: scheduledTime.toISOString(),
        send_reminders: sendReminders,
        status: 'scheduled',
        duration_minutes: effectiveDuration,
      });

      if (error) {
        console.error('[StartLiveLessonPrebuilt] Error storing scheduled lesson:', error);
        await supabase.from('video_calls').update({
          status: 'scheduled',
          scheduled_start: scheduledTime.toISOString(),
        }).eq('meeting_url', roomUrl);
      }

      await notifyClassParents(classId, title, roomUrl, 'scheduled', scheduledTime);
    } catch (err) {
      console.error('[StartLiveLessonPrebuilt] Error scheduling lesson:', err);
    }
  };

  // Notify parents in the class
  const notifyClassParents = async (
    classId: string,
    title: string,
    roomUrl: string,
    type: 'starting' | 'scheduled' = 'starting',
    scheduledTime?: Date
  ) => {
    try {
      const { data: students } = await supabase
        .from('students')
        .select('parent_id')
        .eq('class_id', classId);

      if (!students?.length) return;

      const parentIds = [...new Set(students.map((s: { parent_id: string | null }) => s.parent_id).filter(Boolean))] as string[];

      const isScheduledNotification = type === 'scheduled';
      const notificationTitle = isScheduledNotification ? '📅 Lesson Scheduled' : '🎥 Live Lesson Starting';
      const notificationBody = isScheduledNotification && scheduledTime
        ? `${teacherName} scheduled: ${title} for ${scheduledTime.toLocaleDateString()} at ${scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : `${teacherName} is starting: ${title}`;

      for (const parentId of parentIds) {
        await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            userId: parentId,
            title: notificationTitle,
            body: notificationBody,
            tag: `live-lesson-${classId}`,
            type: 'call',
            requireInteraction: !isScheduledNotification,
            data: {
              url: `/dashboard/parent/live-lesson?room=${encodeURIComponent(roomUrl)}&title=${encodeURIComponent(title)}`,
              type: isScheduledNotification ? 'scheduled-lesson' : 'live-lesson',
              roomUrl,
              teacherName,
              scheduledAt: scheduledTime?.toISOString(),
            },
          }),
        });
      }

      const notifications = parentIds.map((parentId) => ({
        user_id: parentId,
        title: notificationTitle,
        message: notificationBody,
        type: isScheduledNotification ? 'scheduled-lesson' : 'live-lesson',
        data: { roomUrl, classId, teacherName, scheduledAt: scheduledTime?.toISOString() },
        read: false,
      }));

      await supabase.from('in_app_notifications').insert(notifications);
    } catch (err) {
      console.error('[StartLiveLessonPrebuilt] Error notifying parents:', err);
    }
  };

  // End lesson
  const handleEndLesson = async () => {
    if (existingCall) {
      try {
        await supabase
          .from('video_calls')
          .update({
            status: 'ended',
            actual_end: new Date().toISOString(),
          })
          .eq('id', existingCall.id);
      } catch (err) {
        console.error('[StartLiveLessonPrebuilt] Error updating call status:', err);
      }
    }
    setActiveLesson(null);
    setExistingCall(null);
    setLessonTitle('');
  };

  // Rejoin an existing live call
  const handleRejoinCall = async () => {
    if (!existingCall) return;

    setIsRejoining(true);
    try {
      setActiveLesson({
        url: existingCall.meetingUrl,
        title: existingCall.title,
        className: existingCall.className,
        meetingId: existingCall.id,
      });
    } finally {
      setIsRejoining(false);
    }
  };

  // Show active lesson call with Daily Prebuilt
  if (activeLesson) {
    return (
      <DailyPrebuiltCall
        roomUrl={activeLesson.url}
        callType="video"
        title={activeLesson.title}
        className={activeLesson.className}
        teacherName={teacherName}
        isTeacher={true}
        onLeave={handleEndLesson}
      />
    );
  }

  return (
    <>
      {/* Live Lesson Card Widget */}
      <div
        style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 50%, #f97316 100%)',
          borderRadius: 20,
          padding: 24,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 10px 40px rgba(124, 58, 237, 0.3)',
        }}
      >
        {/* Decorative elements */}
        <div
          style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 150,
            height: 150,
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -20,
            left: -20,
            width: 100,
            height: 100,
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '50%',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: 'rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(10px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Video style={{ width: 24, height: 24, color: 'white' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'white' }}>Live Lessons</h3>
                <p style={{ margin: '4px 0 0', fontSize: 14, color: 'rgba(255, 255, 255, 0.8)' }}>
                  Broadcast to your class in real-time
                </p>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: tierConfig.badgeColor,
                borderRadius: 20,
              }}
            >
              <Sparkles style={{ width: 14, height: 14, color: 'white' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{tierConfig.badge}</span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
            <div
              style={{
                padding: '14px 16px',
                background: 'rgba(255, 255, 255, 0.12)',
                borderRadius: 12,
                backdropFilter: 'blur(10px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users style={{ width: 18, height: 18, color: 'rgba(255, 255, 255, 0.9)' }} />
                <span style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>{classes.length}</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>Classes Available</p>
            </div>
            <div
              style={{
                padding: '14px 16px',
                background: 'rgba(255, 255, 255, 0.12)',
                borderRadius: 12,
                backdropFilter: 'blur(10px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock style={{ width: 18, height: 18, color: 'rgba(255, 255, 255, 0.9)' }} />
                <span style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>{tierConfig.label}</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>Max Duration</p>
            </div>
          </div>

          {/* Features list */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {['Screen Share', 'Recording', 'Chat', 'HD Video'].map((feature) => (
              <span
                key={feature}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 20,
                  fontSize: 12,
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontWeight: 500,
                }}
              >
                {feature}
              </span>
            ))}
          </div>

          {/* Start Button */}
          <button
            onClick={() => setShowModal(true)}
            disabled={classes.length === 0}
            style={{
              width: '100%',
              padding: '16px 24px',
              background: 'white',
              border: 'none',
              borderRadius: 14,
              fontSize: 16,
              fontWeight: 700,
              color: '#7c3aed',
              cursor: classes.length === 0 ? 'not-allowed' : 'pointer',
              opacity: classes.length === 0 ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
            }}
          >
            <Radio style={{ width: 20, height: 20 }} />
            {classes.length === 0 ? 'No Classes Assigned' : 'Start Live Lesson'}
          </button>
        </div>
      </div>

      {/* Rejoin Active Call Banner */}
      {existingCall && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)',
            borderRadius: 16,
            boxShadow: '0 8px 24px rgba(220, 38, 38, 0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Video style={{ width: 20, height: 20, color: 'white' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'white',
                    textTransform: 'uppercase',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#fef08a',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }}
                  />
                  Active Call
                </span>
              </div>
              <h4 style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, color: 'white' }}>{existingCall.title}</h4>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'rgba(255, 255, 255, 0.85)' }}>
                {existingCall.className} • Started{' '}
                {new Date(existingCall.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <button
            onClick={handleRejoinCall}
            disabled={isRejoining}
            style={{
              width: '100%',
              padding: '14px 20px',
              background: 'white',
              border: 'none',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              color: '#dc2626',
              cursor: isRejoining ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            }}
          >
            {isRejoining ? (
              <>
                <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />
                Rejoining...
              </>
            ) : (
              <>
                <Play style={{ width: 18, height: 18 }} />
                Rejoin Call
              </>
            )}
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            style={{
              background: '#1a1a2e',
              borderRadius: 24,
              maxWidth: 440,
              width: '100%',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              margin: 'auto 0',
              maxHeight: 'calc(100vh - 32px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
                padding: '20px 20px 28px',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setShowModal(false)}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'white',
                }}
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Video style={{ width: 24, height: 24, color: 'white' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'white' }}>Start Live Lesson</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255, 255, 255, 0.85)' }}>
                    Parents will be notified instantly
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div
              style={{
                padding: '20px',
                overflowY: 'auto',
                flex: 1,
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {error && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '12px 16px',
                    background: 'rgba(220, 38, 38, 0.2)',
                    border: '1px solid rgba(220, 38, 38, 0.4)',
                    borderRadius: 12,
                    color: '#fca5a5',
                    fontSize: 14,
                  }}
                >
                  {error}
                </div>
              )}

              {/* Lesson Title */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#a1a1aa',
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Lesson Title
                </label>
                <input
                  type="text"
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  placeholder="e.g., Math - Counting to 10"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '2px solid #3f3f46',
                    borderRadius: 12,
                    fontSize: 15,
                    background: '#27272a',
                    color: '#fafafa',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Select Class */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#a1a1aa',
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Select Class
                </label>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '2px solid #3f3f46',
                    borderRadius: 12,
                    fontSize: 15,
                    background: '#27272a',
                    color: '#fafafa',
                    outline: 'none',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id} style={{ background: '#27272a', color: '#fafafa' }}>
                      {cls.name} ({cls.grade_level || 'All Ages'}) - {cls.student_count} students
                    </option>
                  ))}
                </select>
              </div>

              {/* Schedule Toggle */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    padding: '10px 14px',
                    background: isScheduled ? 'rgba(124, 58, 237, 0.2)' : '#27272a',
                    border: `2px solid ${isScheduled ? '#7c3aed' : '#3f3f46'}`,
                    borderRadius: 12,
                    transition: 'all 0.2s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    style={{ display: 'none' }}
                  />
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: isScheduled ? '#7c3aed' : 'transparent',
                      border: `2px solid ${isScheduled ? '#7c3aed' : '#52525b'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isScheduled && <Calendar style={{ width: 12, height: 12, color: 'white' }} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#fafafa' }}>Schedule for Later</span>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#a1a1aa' }}>Set a specific date and time</p>
                  </div>
                </label>
              </div>

              {/* Scheduling Fields */}
              {isScheduled && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#a1a1aa',
                          marginBottom: 4,
                        }}
                      >
                        Date
                      </label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '2px solid #3f3f46',
                          borderRadius: 10,
                          fontSize: 14,
                          background: '#27272a',
                          color: '#fafafa',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#a1a1aa',
                          marginBottom: 4,
                        }}
                      >
                        Time
                      </label>
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '2px solid #3f3f46',
                          borderRadius: 10,
                          fontSize: 14,
                          background: '#27272a',
                          color: '#fafafa',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {/* Send Reminders Toggle */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      padding: '8px 12px',
                      background: '#27272a',
                      borderRadius: 10,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={sendReminders}
                      onChange={(e) => setSendReminders(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: sendReminders ? '#7c3aed' : 'transparent',
                        border: `2px solid ${sendReminders ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {sendReminders && <Bell style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <span style={{ fontSize: 13, color: '#d4d4d8' }}>Send reminders to parents</span>
                  </label>
                </div>
              )}

              {/* Duration Selector */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#a1a1aa',
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Lesson Duration
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(65px, 1fr))', gap: 6 }}>
                  {durationOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCustomDuration(option.value)}
                      style={{
                        padding: '8px 6px',
                        border: `2px solid ${
                          customDuration === option.value || (customDuration === 0 && option.value === maxDurationMinutes)
                            ? '#7c3aed'
                            : '#3f3f46'
                        }`,
                        borderRadius: 10,
                        background:
                          customDuration === option.value || (customDuration === 0 && option.value === maxDurationMinutes)
                            ? 'rgba(124, 58, 237, 0.2)'
                            : '#27272a',
                        fontSize: 12,
                        fontWeight: 600,
                        color:
                          customDuration === option.value || (customDuration === 0 && option.value === maxDurationMinutes)
                            ? '#a78bfa'
                            : '#a1a1aa',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'center',
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 11, color: '#71717a' }}>
                  Your {tierConfig.badge} plan allows up to {tierConfig.label}
                </p>
              </div>

              {/* Class Info Card */}
              {selectedClass && (
                <div
                  style={{
                    padding: 14,
                    background: '#27272a',
                    borderRadius: 12,
                    marginBottom: 16,
                    border: '1px solid #3f3f46',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Users style={{ width: 14, height: 14, color: '#7c3aed' }} />
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#fafafa' }}>
                          {classes.find((c) => c.id === selectedClass)?.student_count || 0}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: '#a1a1aa' }}>Students</span>
                    </div>
                    <div style={{ width: 1, height: 28, background: '#3f3f46' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Clock style={{ width: 14, height: 14, color: '#7c3aed' }} />
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#fafafa' }}>
                          {durationOptions.find((o) => o.value === effectiveDuration)?.label || tierConfig.label}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: '#a1a1aa' }}>Duration</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Advanced Room Options Toggle */}
              <button
                type="button"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  border: '2px solid #3f3f46',
                  borderRadius: 12,
                  background: showAdvancedOptions ? 'rgba(124, 58, 237, 0.1)' : '#27272a',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#d4d4d8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Settings style={{ width: 16, height: 16, color: '#7c3aed' }} />
                  <span>Advanced Room Options</span>
                </div>
                {showAdvancedOptions ? (
                  <ChevronUp style={{ width: 16, height: 16, color: '#a1a1aa' }} />
                ) : (
                  <ChevronDown style={{ width: 16, height: 16, color: '#a1a1aa' }} />
                )}
              </button>

              {/* Advanced Options Panel */}
              {showAdvancedOptions && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: 14,
                    background: '#27272a',
                    borderRadius: 12,
                    border: '1px solid #3f3f46',
                    maxHeight: '300px',
                    overflowY: 'auto',
                  }}
                >
                  {/* PRIVACY & ACCESS SECTION */}
                  <p style={{ margin: '0 0 12px', fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Privacy & Access
                  </p>
                  
                  {/* Privacy Toggle */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: isPrivateRoom ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isPrivateRoom}
                      onChange={(e) => setIsPrivateRoom(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: isPrivateRoom ? '#7c3aed' : 'transparent',
                        border: `2px solid ${isPrivateRoom ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isPrivateRoom ? (
                        <Lock style={{ width: 10, height: 10, color: 'white' }} />
                      ) : (
                        <Unlock style={{ width: 10, height: 10, color: 'white' }} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>{isPrivateRoom ? 'Private' : 'Public'}</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>
                        {isPrivateRoom ? 'Requires a token to join' : 'Anyone with the link can join'}
                      </p>
                    </div>
                  </label>

                  {/* Prejoin UI Toggle */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: enablePrejoinUI ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enablePrejoinUI}
                      onChange={(e) => setEnablePrejoinUI(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: enablePrejoinUI ? '#7c3aed' : 'transparent',
                        border: `2px solid ${enablePrejoinUI ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {enablePrejoinUI && <Eye style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Prejoin UI</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>Configure camera/mic before joining</p>
                    </div>
                  </label>

                  {/* Knocking Toggle (for private rooms) */}
                  {isPrivateRoom && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        padding: '10px 12px',
                        background: enableKnocking ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={enableKnocking}
                        onChange={(e) => setEnableKnocking(e.target.checked)}
                        style={{ display: 'none' }}
                      />
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 5,
                          background: enableKnocking ? '#7c3aed' : 'transparent',
                          border: `2px solid ${enableKnocking ? '#7c3aed' : '#52525b'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {enableKnocking && <Shield style={{ width: 10, height: 10, color: 'white' }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Knocking</span>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>Users can request access to join</p>
                      </div>
                    </label>
                  )}

                  {/* AUDIO/VIDEO ON START */}
                  <p style={{ margin: '16px 0 12px', fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Audio/Video on Start
                  </p>

                  {/* Cameras on Start */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: camerasOnStart ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={camerasOnStart}
                      onChange={(e) => setCamerasOnStart(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: camerasOnStart ? '#7c3aed' : 'transparent',
                        border: `2px solid ${camerasOnStart ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {camerasOnStart ? (
                        <Camera style={{ width: 10, height: 10, color: 'white' }} />
                      ) : (
                        <CameraOff style={{ width: 10, height: 10, color: '#52525b' }} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Cameras on Start</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>
                        Cameras will be {camerasOnStart ? 'on' : 'off'} when joining
                      </p>
                    </div>
                  </label>

                  {/* Microphones on Start */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: microphonesOnStart ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={microphonesOnStart}
                      onChange={(e) => setMicrophonesOnStart(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: microphonesOnStart ? '#7c3aed' : 'transparent',
                        border: `2px solid ${microphonesOnStart ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {microphonesOnStart ? (
                        <Mic style={{ width: 10, height: 10, color: 'white' }} />
                      ) : (
                        <MicOff style={{ width: 10, height: 10, color: '#52525b' }} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Microphones on Start</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>
                        Microphones will be {microphonesOnStart ? 'on' : 'off'} when joining
                      </p>
                    </div>
                  </label>

                  {/* FEATURES SECTION */}
                  <p style={{ margin: '16px 0 12px', fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Features
                  </p>

                  {/* Screen Sharing Toggle */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: enableScreenShare ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enableScreenShare}
                      onChange={(e) => setEnableScreenShare(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: enableScreenShare ? '#7c3aed' : 'transparent',
                        border: `2px solid ${enableScreenShare ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {enableScreenShare && <Monitor style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Screen Sharing</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>Participants can share their screens</p>
                    </div>
                  </label>

                  {/* Breakout Rooms (Beta) */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: enableBreakoutRooms ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enableBreakoutRooms}
                      onChange={(e) => setEnableBreakoutRooms(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: enableBreakoutRooms ? '#7c3aed' : 'transparent',
                        border: `2px solid ${enableBreakoutRooms ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {enableBreakoutRooms && <Users style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Breakout Rooms</span>
                        <span style={{ fontSize: 9, padding: '2px 6px', background: '#7c3aed', borderRadius: 4, color: 'white', fontWeight: 600 }}>BETA</span>
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>Create smaller private groups</p>
                    </div>
                  </label>

                  {/* Text Chat Mode */}
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#fafafa', marginBottom: 6 }}>
                      Text Chat
                    </label>
                    <p style={{ margin: '0 0 8px', fontSize: 11, color: '#71717a' }}>Advanced chat includes emoji picker, reactions, and Giphy</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        { value: 'off', label: 'Off' },
                        { value: 'basic', label: 'Basic' },
                        { value: 'advanced', label: 'Advanced' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setChatMode(opt.value as 'off' | 'basic' | 'advanced')}
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            border: `2px solid ${chatMode === opt.value ? '#7c3aed' : '#3f3f46'}`,
                            borderRadius: 8,
                            background: chatMode === opt.value ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                            fontSize: 12,
                            fontWeight: 600,
                            color: chatMode === opt.value ? '#a78bfa' : '#a1a1aa',
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Emoji Reactions */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: enableEmojiReactions ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enableEmojiReactions}
                      onChange={(e) => setEnableEmojiReactions(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: enableEmojiReactions ? '#7c3aed' : 'transparent',
                        border: `2px solid ${enableEmojiReactions ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {enableEmojiReactions && <Smile style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Emoji Reactions</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>Send emojis for non-verbal feedback</p>
                    </div>
                  </label>

                  {/* UI FEATURES SECTION */}
                  <p style={{ margin: '16px 0 12px', fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    UI Features
                  </p>

                  {/* People UI */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: enablePeopleUI ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enablePeopleUI}
                      onChange={(e) => setEnablePeopleUI(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: enablePeopleUI ? '#7c3aed' : 'transparent',
                        border: `2px solid ${enablePeopleUI ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {enablePeopleUI && <Users style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>People UI</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>View list of all participants</p>
                    </div>
                  </label>

                  {/* Background Effects */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: enableBackgroundEffects ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enableBackgroundEffects}
                      onChange={(e) => setEnableBackgroundEffects(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: enableBackgroundEffects ? '#7c3aed' : 'transparent',
                        border: `2px solid ${enableBackgroundEffects ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {enableBackgroundEffects && <Image style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Background Effects</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>Enable virtual backgrounds</p>
                    </div>
                  </label>

                  {/* Picture in Picture */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: enablePictureInPicture ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enablePictureInPicture}
                      onChange={(e) => setEnablePictureInPicture(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: enablePictureInPicture ? '#7c3aed' : 'transparent',
                        border: `2px solid ${enablePictureInPicture ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {enablePictureInPicture && <PictureInPicture style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Picture in Picture UI</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>Always on top floating view</p>
                    </div>
                  </label>

                  {/* Hand Raising */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: enableHandRaising ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enableHandRaising}
                      onChange={(e) => setEnableHandRaising(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: enableHandRaising ? '#7c3aed' : 'transparent',
                        border: `2px solid ${enableHandRaising ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {enableHandRaising && <Hand style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Hand Raising</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>Request to speak during meeting</p>
                    </div>
                  </label>

                  {/* Network UI */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: enableNetworkUI ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enableNetworkUI}
                      onChange={(e) => setEnableNetworkUI(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: enableNetworkUI ? '#7c3aed' : 'transparent',
                        border: `2px solid ${enableNetworkUI ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {enableNetworkUI && <Wifi style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Network UI</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>View network stats during call</p>
                    </div>
                  </label>

                  {/* Noise Cancellation */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: enableNoiseCancellation ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enableNoiseCancellation}
                      onChange={(e) => setEnableNoiseCancellation(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: enableNoiseCancellation ? '#7c3aed' : 'transparent',
                        border: `2px solid ${enableNoiseCancellation ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {enableNoiseCancellation && <Volume2 style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Noise Cancellation UI</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>Enable noise cancellation controls</p>
                    </div>
                  </label>

                  {/* Live Captions */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: enableLiveCaptions ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enableLiveCaptions}
                      onChange={(e) => setEnableLiveCaptions(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: enableLiveCaptions ? '#7c3aed' : 'transparent',
                        border: `2px solid ${enableLiveCaptions ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {enableLiveCaptions && <Subtitles style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Live Captions UI</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>Show live captions (requires transcription)</p>
                    </div>
                  </label>

                  {/* RECORDING SECTION */}
                  <p style={{ margin: '16px 0 12px', fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Recording
                  </p>

                  {/* Recording Mode */}
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ margin: '0 0 8px', fontSize: 11, color: '#71717a' }}>
                      {['free', 'starter'].includes(subscriptionTier.toLowerCase()) 
                        ? 'Recording requires Premium plan or higher'
                        : 'Any participant can start recording'}
                    </p>
                    <div style={{ display: 'flex', gap: 6, opacity: ['free', 'starter'].includes(subscriptionTier.toLowerCase()) ? 0.5 : 1 }}>
                      {[
                        { value: 'off', label: 'Off' },
                        { value: 'local', label: 'Local' },
                        { value: 'cloud', label: 'Cloud' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => !['free', 'starter'].includes(subscriptionTier.toLowerCase()) && setRecordingMode(opt.value as 'off' | 'local' | 'cloud')}
                          disabled={['free', 'starter'].includes(subscriptionTier.toLowerCase())}
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            border: `2px solid ${recordingMode === opt.value ? '#7c3aed' : '#3f3f46'}`,
                            borderRadius: 8,
                            background: recordingMode === opt.value ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                            fontSize: 12,
                            fontWeight: 600,
                            color: recordingMode === opt.value ? '#a78bfa' : '#a1a1aa',
                            cursor: ['free', 'starter'].includes(subscriptionTier.toLowerCase()) ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* OWNER ONLY BROADCAST SECTION */}
                  <p style={{ margin: '16px 0 12px', fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Owner Controls
                  </p>

                  {/* Owner Only Broadcast Toggle */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: ownerOnlyBroadcast ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={ownerOnlyBroadcast}
                      onChange={(e) => setOwnerOnlyBroadcast(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: ownerOnlyBroadcast ? '#7c3aed' : 'transparent',
                        border: `2px solid ${ownerOnlyBroadcast ? '#7c3aed' : '#52525b'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {ownerOnlyBroadcast && <Crown style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#fafafa' }}>Owner Only Broadcast</span>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#71717a' }}>
                        Only owners can screen share, record & use camera/mic
                      </p>
                    </div>
                  </label>

                  {/* CO-HOST SECTION */}
                  <p style={{ margin: '16px 0 12px', fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Co-Host (Additional Teacher)
                  </p>

                  {/* Add Co-Host Input */}
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ margin: '0 0 8px', fontSize: 11, color: '#71717a' }}>
                      Add another teacher as a co-host with owner permissions
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="email"
                        value={coHostEmail}
                        onChange={(e) => setCoHostEmail(e.target.value)}
                        placeholder="Teacher email address"
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          border: '2px solid #3f3f46',
                          borderRadius: 8,
                          fontSize: 13,
                          background: '#1a1a2e',
                          color: '#fafafa',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (coHostEmail.trim() && coHostEmail.includes('@') && !coHosts.includes(coHostEmail.trim())) {
                            setCoHosts([...coHosts, coHostEmail.trim()]);
                            setCoHostEmail('');
                          }
                        }}
                        disabled={!coHostEmail.trim() || !coHostEmail.includes('@')}
                        style={{
                          padding: '10px 14px',
                          border: 'none',
                          borderRadius: 8,
                          background: coHostEmail.trim() && coHostEmail.includes('@') ? '#7c3aed' : '#3f3f46',
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'white',
                          cursor: coHostEmail.trim() && coHostEmail.includes('@') ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <UserPlus style={{ width: 14, height: 14 }} />
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Co-Hosts List */}
                  {coHosts.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {coHosts.map((email, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: 'rgba(124, 58, 237, 0.1)',
                            borderRadius: 8,
                            marginBottom: 6,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                background: '#7c3aed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Crown style={{ width: 14, height: 14, color: 'white' }} />
                            </div>
                            <div>
                              <span style={{ fontSize: 12, fontWeight: 500, color: '#fafafa' }}>{email}</span>
                              <p style={{ margin: 0, fontSize: 10, color: '#71717a' }}>Co-Host</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCoHosts(coHosts.filter((_, i) => i !== index))}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              border: 'none',
                              background: 'rgba(220, 38, 38, 0.2)',
                              color: '#fca5a5',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <X style={{ width: 12, height: 12 }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* LANGUAGE SECTION */}
                  <p style={{ margin: '16px 0 12px', fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Language
                  </p>

                  {/* Language Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <Languages style={{ width: 18, height: 18, color: '#7c3aed' }} />
                    <select
                      value={roomLanguage}
                      onChange={(e) => setRoomLanguage(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        border: '2px solid #3f3f46',
                        borderRadius: 8,
                        fontSize: 13,
                        background: '#1a1a2e',
                        color: '#fafafa',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="en">English (default)</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="pt">Portuguese</option>
                      <option value="it">Italian</option>
                      <option value="ja">Japanese</option>
                      <option value="ko">Korean</option>
                      <option value="zh">Chinese</option>
                      <option value="ar">Arabic</option>
                      <option value="hi">Hindi</option>
                      <option value="nl">Dutch</option>
                    </select>
                  </div>

                  {/* MAX PARTICIPANTS */}
                  <p style={{ margin: '16px 0 12px', fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Max Participants
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[10, 25, 50, 100].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setMaxParticipants(num)}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          border: `2px solid ${maxParticipants === num ? '#7c3aed' : '#3f3f46'}`,
                          borderRadius: 8,
                          background: maxParticipants === num ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                          fontSize: 12,
                          fontWeight: 600,
                          color: maxParticipants === num ? '#a78bfa' : '#a1a1aa',
                          cursor: 'pointer',
                        }}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tier Upgrade Hint */}
              {(subscriptionTier.toLowerCase() === 'free' || subscriptionTier.toLowerCase() === 'starter') && (
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(124, 58, 237, 0.15)',
                    borderRadius: 10,
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Sparkles style={{ width: 16, height: 16, color: '#a78bfa', flexShrink: 0 }} />
                  <p style={{ margin: 0, fontSize: 12, color: '#c4b5fd' }}>
                    Upgrade to Premium for longer lessons and recording
                  </p>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    border: '2px solid #3f3f46',
                    borderRadius: 12,
                    background: 'transparent',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#a1a1aa',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartLesson}
                  disabled={isCreating || !lessonTitle.trim() || !selectedClass}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    border: 'none',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'white',
                    cursor: isCreating || !lessonTitle.trim() || !selectedClass ? 'not-allowed' : 'pointer',
                    opacity: isCreating || !lessonTitle.trim() || !selectedClass ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {isCreating ? (
                    <>
                      <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                      {isScheduled ? 'Scheduling...' : 'Starting...'}
                    </>
                  ) : (
                    <>
                      {isScheduled ? <Calendar style={{ width: 16, height: 16 }} /> : <Play style={{ width: 16, height: 16 }} />}
                      {isScheduled ? 'Schedule' : 'Go Live'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
}

// Wrapper with provider
export function StartLiveLessonPrebuilt(props: StartLiveLessonPrebuiltProps) {
  return (
    <DailyPrebuiltProvider>
      <StartLiveLessonPrebuiltInner {...props} />
    </DailyPrebuiltProvider>
  );
}
