'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Video, Clock, Users, Play, Loader2, X, Sparkles, Radio, Calendar, Bell } from 'lucide-react';
import { useGroupCall, GroupCallProvider } from './GroupCallProvider';
import { ClassLessonCall } from './ClassLessonCall';

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
  enterprise: { minutes: 0, label: 'Unlimited', badge: 'Enterprise', badgeColor: '#10b981' }, // 0 = unlimited (24hr max)
};

interface StartLiveLessonProps {
  preschoolId: string;
  teacherId: string;
  teacherName: string;
  subscriptionTier?: string;
}

function StartLiveLessonInner({ preschoolId, teacherId, teacherName, subscriptionTier = 'starter' }: StartLiveLessonProps) {
  const supabase = createClient();
  const { createRoom, isInCall } = useGroupCall();
  
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
  const [customDuration, setCustomDuration] = useState<number>(0); // 0 means use max

  // Get time limit based on tier
  const tierConfig = TIER_TIME_LIMITS[subscriptionTier.toLowerCase()] || TIER_TIME_LIMITS.starter;
  const maxDurationMinutes = tierConfig.minutes || 1440; // 24hr if unlimited
  
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
    // Always add max option if not already included
    if (!options.find(o => o.value === maxDurationMinutes)) {
      options.push({ value: maxDurationMinutes, label: tierConfig.label });
    }
    return options.sort((a, b) => a.value - b.value);
  }, [maxDurationMinutes, tierConfig.label]);
  
  // Effective duration (custom or max)
  const effectiveDuration = customDuration > 0 ? Math.min(customDuration, maxDurationMinutes) : maxDurationMinutes;

  // Check for existing live calls on mount and periodically
  useEffect(() => {
    const checkExistingCall = async () => {
      try {
        // First, clean up any expired calls (calls past their scheduled_end)
        // Wrap in try-catch to handle network errors gracefully
        const now = new Date().toISOString();
        try {
          await supabase
            .from('video_calls')
            .update({ status: 'ended', actual_end: now })
            .eq('teacher_id', teacherId)
            .eq('status', 'live')
            .lt('scheduled_end', now);
        } catch (cleanupErr) {
          // Ignore cleanup errors - not critical
          console.warn('[StartLiveLesson] Cleanup failed (non-critical):', cleanupErr);
        }

        // Then check for any active live calls (use maybeSingle to handle 0 rows gracefully)
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

        // Ignore PGRST116 error (no rows) - that's expected when there's no active call
        if (error && error.code !== 'PGRST116') {
          console.error('[StartLiveLesson] Error checking for existing call:', error);
          return; // Don't update state on error
        }

        if (liveCall && liveCall.meeting_url) {
          // Double-check the call hasn't expired
          if (liveCall.scheduled_end && new Date(liveCall.scheduled_end) < new Date()) {
            // This call has expired, mark it as ended (in background, don't await)
            supabase
              .from('video_calls')
              .update({ status: 'ended', actual_end: now })
              .eq('id', liveCall.id)
              .then(() => console.log('[StartLiveLesson] Marked expired call as ended'))
              .catch((err: unknown) => console.warn('[StartLiveLesson] Failed to mark call as ended:', err));
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
        // Network error or other issue - just log and continue
        console.warn('[StartLiveLesson] Error in checkExistingCall:', err);
      }
    };

    checkExistingCall();
    
    // Re-check every 30 seconds in case call was ended elsewhere
    const interval = setInterval(checkExistingCall, 30000);
    return () => clearInterval(interval);
  }, [supabase, teacherId]);

  // Fetch teacher's classes
  useEffect(() => {
    const fetchClasses = async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, grade_level')
        .eq('teacher_id', teacherId)
        .eq('active', true);

      if (data) {
        // Get student counts
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

  // Start live lesson
  const handleStartLesson = async () => {
    if (!selectedClass || !lessonTitle.trim()) {
      setError('Please select a class and enter a lesson title');
      return;
    }

    // Validate scheduled time if scheduling
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
      const room = await createRoom({
        name: lessonTitle,
        classId: selectedClass,
        preschoolId,
        maxParticipants: 50,
        enableRecording: subscriptionTier.toLowerCase() !== 'free' && subscriptionTier.toLowerCase() !== 'starter',
        expiryMinutes: effectiveDuration,
      });

      if (room) {
        const selectedClassName = classes.find(c => c.id === selectedClass)?.name || '';
        
        if (isScheduled) {
          // Schedule the lesson and notify parents
          await scheduleLesson(room.url, selectedClass, lessonTitle, new Date(`${scheduledDate}T${scheduledTime}`));
          setShowModal(false);
          setLessonTitle('');
          setScheduledDate('');
          setScheduledTime('');
          setIsScheduled(false);
          // Show success message (you could add a toast here)
          alert(`Lesson scheduled! Parents will be notified ${sendReminders ? 'with reminders' : ''}.`);
        } else {
          // Start immediately - send notifications to parents
          await notifyClassParents(selectedClass, lessonTitle, room.url, 'starting');

          setActiveLesson({
            url: room.url,
            title: lessonTitle,
            className: selectedClassName,
          });
          setShowModal(false);
        }
      } else {
        setError('Failed to create lesson room');
      }
    } catch (err) {
      console.error('Error starting lesson:', err);
      setError('Failed to start lesson');
    } finally {
      setIsCreating(false);
    }
  };

  // Schedule a lesson for later
  const scheduleLesson = async (roomUrl: string, classId: string, title: string, scheduledTime: Date) => {
    try {
      // Store scheduled lesson in database
      const { data, error } = await supabase.from('scheduled_lessons').insert({
        class_id: classId,
        preschool_id: preschoolId,
        teacher_id: teacherId,
        title,
        room_url: roomUrl,
        scheduled_at: scheduledTime.toISOString(),
        send_reminders: sendReminders,
        status: 'scheduled',
        duration_minutes: effectiveDuration,
      }).select().single();

      if (error) {
        console.error('Error storing scheduled lesson:', error);
        // Fall back to video_calls table if scheduled_lessons doesn't exist
        await supabase.from('video_calls').update({
          status: 'scheduled',
          scheduled_start: scheduledTime.toISOString(),
        }).eq('meeting_url', roomUrl);
      }

      // Notify parents about the scheduled lesson
      await notifyClassParents(classId, title, roomUrl, 'scheduled', scheduledTime);
    } catch (err) {
      console.error('Error scheduling lesson:', err);
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
      // Get students in this class and their parent IDs
      const { data: students } = await supabase
        .from('students')
        .select('parent_id')
        .eq('class_id', classId);

      if (!students?.length) return;

      const parentIds = [...new Set(students.map((s: { parent_id: string | null }) => s.parent_id).filter(Boolean))] as string[];

      // Format notification content based on type
      const isScheduled = type === 'scheduled';
      const notificationTitle = isScheduled 
        ? '📅 Lesson Scheduled'
        : '🎥 Live Lesson Starting';
      const notificationBody = isScheduled && scheduledTime
        ? `${teacherName} scheduled: ${title} for ${scheduledTime.toLocaleDateString()} at ${scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : `${teacherName} is starting: ${title}`;

      // Send push notification to each parent
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
            requireInteraction: !isScheduled, // Only require interaction for live lessons
            data: {
              url: `/dashboard/parent/live-lesson?room=${encodeURIComponent(roomUrl)}&title=${encodeURIComponent(title)}`,
              type: isScheduled ? 'scheduled-lesson' : 'live-lesson',
              roomUrl,
              teacherName,
              scheduledAt: scheduledTime?.toISOString(),
            },
          }),
        });
      }

      // Also insert into database for in-app notification center
      const notifications = parentIds.map(parentId => ({
        user_id: parentId,
        title: notificationTitle,
        message: notificationBody,
        type: isScheduled ? 'scheduled-lesson' : 'live-lesson',
        data: { roomUrl, classId, teacherName, scheduledAt: scheduledTime?.toISOString() },
        read: false,
      }));

      await supabase.from('in_app_notifications').insert(notifications);
    } catch (err) {
      console.error('Error notifying parents:', err);
    }
  };

  // End lesson - also clears the existing call state
  const handleEndLesson = async () => {
    // If there was an existing call being shown, ensure it's marked as ended
    if (existingCall) {
      try {
        await supabase
          .from('video_calls')
          .update({ 
            status: 'ended',
            actual_end: new Date().toISOString()
          })
          .eq('id', existingCall.id);
        console.log('[StartLiveLesson] Marked existing call as ended:', existingCall.id);
      } catch (err) {
        console.error('Error updating call status:', err);
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

  // Show active lesson call
  if (activeLesson) {
    return (
      <ClassLessonCall
        roomUrl={activeLesson.url}
        lessonTitle={activeLesson.title}
        className={activeLesson.className}
        teacherName={teacherName}
        isTeacher={true}
        onLeave={handleEndLesson}
      />
    );
  }

  return (
    <>
      {/* Beautiful Live Lesson Card Widget */}
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
        <div style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 150,
          height: 150,
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '50%',
        }} />
        <div style={{
          position: 'absolute',
          bottom: -20,
          left: -20,
          width: 100,
          height: 100,
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '50%',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Video style={{ width: 24, height: 24, color: 'white' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'white' }}>
                  Live Lessons
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 14, color: 'rgba(255, 255, 255, 0.8)' }}>
                  Broadcast to your class in real-time
                </p>
              </div>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: tierConfig.badgeColor,
              borderRadius: 20,
            }}>
              <Sparkles style={{ width: 14, height: 14, color: 'white' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{tierConfig.badge}</span>
            </div>
          </div>

          {/* Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
            marginBottom: 20,
          }}>
            <div style={{
              padding: '14px 16px',
              background: 'rgba(255, 255, 255, 0.12)',
              borderRadius: 12,
              backdropFilter: 'blur(10px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users style={{ width: 18, height: 18, color: 'rgba(255, 255, 255, 0.9)' }} />
                <span style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>
                  {classes.length}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
                Classes Available
              </p>
            </div>
            <div style={{
              padding: '14px 16px',
              background: 'rgba(255, 255, 255, 0.12)',
              borderRadius: 12,
              backdropFilter: 'blur(10px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock style={{ width: 18, height: 18, color: 'rgba(255, 255, 255, 0.9)' }} />
                <span style={{ fontSize: 24, fontWeight: 700, color: 'white' }}>{tierConfig.label}</span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
                Max Duration
              </p>
            </div>
          </div>

          {/* Features list */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 20,
          }}>
            {['Screen Share', 'Recording', 'Chat', 'Hand Raise'].map((feature) => (
              <span key={feature} style={{
                padding: '6px 12px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 20,
                fontSize: 12,
                color: 'rgba(255, 255, 255, 0.9)',
                fontWeight: 500,
              }}>
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
            onMouseEnter={(e) => {
              if (classes.length > 0) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.15)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.1)';
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
            animation: 'pulse-border 2s ease-in-out infinite',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Video style={{ width: 20, height: 20, color: 'white' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
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
                }}>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#fef08a',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }} />
                  Active Call
                </span>
              </div>
              <h4 style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, color: 'white' }}>
                {existingCall.title}
              </h4>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'rgba(255, 255, 255, 0.85)' }}>
                {existingCall.className} • Started {new Date(existingCall.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
        <div style={{
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
        }}>
          <div style={{
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
          }}>
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
              padding: '20px 20px 28px',
              position: 'relative',
              flexShrink: 0,
            }}>
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
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Video style={{ width: 24, height: 24, color: 'white' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'white' }}>
                    Start Live Lesson
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255, 255, 255, 0.85)' }}>
                    Parents will be notified instantly
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Body - Scrollable */}
            <div style={{ 
              padding: '20px', 
              overflowY: 'auto', 
              flex: 1,
              WebkitOverflowScrolling: 'touch',
            }}>
              {error && (
                <div style={{
                  marginBottom: 16,
                  padding: '12px 16px',
                  background: 'rgba(220, 38, 38, 0.2)',
                  border: '1px solid rgba(220, 38, 38, 0.4)',
                  borderRadius: 12,
                  color: '#fca5a5',
                  fontSize: 14,
                }}>
                  {error}
                </div>
              )}

              {/* Lesson Title */}
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#a1a1aa',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
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
                  onFocus={(e) => e.target.style.borderColor = '#7c3aed'}
                  onBlur={(e) => e.target.style.borderColor = '#3f3f46'}
                />
              </div>

              {/* Select Class */}
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#a1a1aa',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
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
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  padding: '10px 14px',
                  background: isScheduled ? 'rgba(124, 58, 237, 0.2)' : '#27272a',
                  border: `2px solid ${isScheduled ? '#7c3aed' : '#3f3f46'}`,
                  borderRadius: 12,
                  transition: 'all 0.2s',
                }}>
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    style={{ display: 'none' }}
                  />
                  <div style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: isScheduled ? '#7c3aed' : 'transparent',
                    border: `2px solid ${isScheduled ? '#7c3aed' : '#52525b'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {isScheduled && <Calendar style={{ width: 12, height: 12, color: 'white' }} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#fafafa' }}>Schedule for Later</span>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#a1a1aa' }}>
                      Set a specific date and time
                    </p>
                  </div>
                </label>
              </div>

              {/* Scheduling Fields */}
              {isScheduled && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#a1a1aa',
                        marginBottom: 4,
                      }}>
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
                      <label style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#a1a1aa',
                        marginBottom: 4,
                      }}>
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
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    padding: '8px 12px',
                    background: '#27272a',
                    borderRadius: 10,
                  }}>
                    <input
                      type="checkbox"
                      checked={sendReminders}
                      onChange={(e) => setSendReminders(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      background: sendReminders ? '#7c3aed' : 'transparent',
                      border: `2px solid ${sendReminders ? '#7c3aed' : '#52525b'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {sendReminders && <Bell style={{ width: 10, height: 10, color: 'white' }} />}
                    </div>
                    <span style={{ fontSize: 13, color: '#d4d4d8' }}>Send reminders to parents</span>
                  </label>
                </div>
              )}

              {/* Duration Selector */}
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#a1a1aa',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Lesson Duration
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(65px, 1fr))',
                  gap: 6,
                }}>
                  {durationOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCustomDuration(option.value)}
                      style={{
                        padding: '8px 6px',
                        border: `2px solid ${(customDuration === option.value || (customDuration === 0 && option.value === maxDurationMinutes)) ? '#7c3aed' : '#3f3f46'}`,
                        borderRadius: 10,
                        background: (customDuration === option.value || (customDuration === 0 && option.value === maxDurationMinutes)) ? 'rgba(124, 58, 237, 0.2)' : '#27272a',
                        fontSize: 12,
                        fontWeight: 600,
                        color: (customDuration === option.value || (customDuration === 0 && option.value === maxDurationMinutes)) ? '#a78bfa' : '#a1a1aa',
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
                <div style={{
                  padding: 14,
                  background: '#27272a',
                  borderRadius: 12,
                  marginBottom: 16,
                  border: '1px solid #3f3f46',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Users style={{ width: 14, height: 14, color: '#7c3aed' }} />
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#fafafa' }}>
                          {classes.find(c => c.id === selectedClass)?.student_count || 0}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: '#a1a1aa' }}>Students</span>
                    </div>
                    <div style={{ width: 1, height: 28, background: '#3f3f46' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Clock style={{ width: 14, height: 14, color: '#7c3aed' }} />
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#fafafa' }}>
                          {durationOptions.find(o => o.value === effectiveDuration)?.label || tierConfig.label}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: '#a1a1aa' }}>Duration</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tier Upgrade Hint for limited plans */}
              {(subscriptionTier.toLowerCase() === 'free' || subscriptionTier.toLowerCase() === 'starter') && (
                <div style={{
                  padding: '10px 12px',
                  background: 'rgba(124, 58, 237, 0.15)',
                  borderRadius: 10,
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
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
        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 8px 24px rgba(220, 38, 38, 0.3); }
          50% { box-shadow: 0 8px 32px rgba(220, 38, 38, 0.5), 0 0 0 4px rgba(220, 38, 38, 0.2); }
        }
      `}</style>
    </>
  );
}

// Wrapper with provider
export function StartLiveLesson(props: StartLiveLessonProps) {
  return (
    <GroupCallProvider>
      <StartLiveLessonInner {...props} />
    </GroupCallProvider>
  );
}
