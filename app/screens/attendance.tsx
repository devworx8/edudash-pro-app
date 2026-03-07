import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'
import { assertSupabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import ThemedStatusBar from '@/components/ui/ThemedStatusBar'
import { Stack, router } from 'expo-router'
import { track } from '@/lib/analytics'
import { useSimplePullToRefresh } from '@/hooks/usePullToRefresh'
import { useTheme } from '@/contexts/ThemeContext'
import { useTeacherSchool } from '@/hooks/useTeacherSchool'
import { useAuth, usePermissions } from '@/contexts/AuthContext'
import { AlertModal, type AlertButton } from '@/components/ui/AlertModal'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { format } from 'date-fns'

// Alert modal state interface
import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface AlertState {
  visible: boolean;
title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  buttons: AlertButton[];
}

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export default function AttendanceScreen() {
  const { profile, loading: authLoading, profileLoading } = useAuth()
  const permissions = usePermissions()
  const hasActiveSeat = profile?.hasActiveSeat?.() || profile?.seat_status === 'active'
  const canManageClasses = hasActiveSeat || (!!profile?.hasCapability && profile.hasCapability('manage_classes' as any))
  const { theme } = useTheme()
  const palette = { background: theme.background, text: theme.text, textSecondary: theme.textSecondary, outline: theme.border, surface: theme.surface, primary: theme.primary }
  
  // Alert modal state
  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

  const showAlert = (title: string, message: string, type: AlertState['type'] = 'info', buttons: AlertButton[] = [{ text: 'OK', style: 'default' }]) => {
    setAlertState({ visible: true, title, message, type, buttons });
  };

  const hideAlert = () => {
    setAlertState(prev => ({ ...prev, visible: false }));
  };

  // RBAC Guard: Teachers, principals, and admins can access this screen
  const normalizedRole = String(profile?.role || '').trim().toLowerCase()
  const isTeacher = permissions?.hasRole
    ? permissions.hasRole('teacher')
    : normalizedRole === 'teacher'
  const isPrincipal = permissions?.hasRoleOrHigher
    ? permissions.hasRoleOrHigher('principal_admin')
    : (
      normalizedRole === 'principal' ||
      normalizedRole === 'principal_admin' ||
      normalizedRole === 'admin' ||
      normalizedRole === 'super_admin' ||
      normalizedRole === 'superadmin' ||
      normalizedRole === 'platform_admin'
    )
  const canAccessAttendance = isTeacher || isPrincipal

  // Redirect non-authorized users
  const hasRedirectedRef = useRef(false)
  useEffect(() => {
    if (hasRedirectedRef.current) return
    if (!authLoading && !profileLoading && profile) {
      if (!canAccessAttendance) {
        hasRedirectedRef.current = true
        track('edudash.attendance.access_denied', {
          user_id: profile.id,
          role: profile.role,
        })
        showAlert(
          'Access Denied',
          'Only teachers and principals can access attendance management.',
          'error',
          [{ text: 'OK', onPress: () => router.back() }]
        )
      }
    }
  }, [authLoading, profileLoading, profile, canAccessAttendance])

  // Get teacher's school ID
  const { schoolId, schoolName, loading: schoolLoading } = useTeacherSchool()

  const [classId, setClassId] = useState<string | null>(null)
  const [attendanceDate, setAttendanceDate] = useState<string>('')
  const [dateValue, setDateValue] = useState<Date>(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  // Status map: 'present' | 'absent' | 'late' | 'excused'
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const todayDate = new Date()
    const todayKey = todayDate.toISOString().slice(0, 10)
    setAttendanceDate(todayKey)
    setDateValue(todayDate)
  }, [])

  // Refresh function to refetch classes and students data
  const handleRefresh = async () => {
    try {
      await classesQuery.refetch()
      if (classId) {
        await studentsQuery.refetch()
      }
    } catch {
      // silently ignore refresh errors
    }
  }

  const { refreshing, onRefreshHandler } = useSimplePullToRefresh(handleRefresh, 'attendance')

  // Fetch classes filtered by teacher's school
  // Teachers only see their own classes, principals see all
  const classesQuery = useQuery({
    queryKey: ['teacher_classes_for_attendance', schoolId, profile?.id, isPrincipal],
    queryFn: async () => {
      if (!schoolId) return []
      let query = assertSupabase()
        .from('classes')
        .select('id, name, grade_level')
        .eq('preschool_id', schoolId)
        .eq('active', true)
      
      // If teacher (not principal), only show their assigned classes
      if (isTeacher && !isPrincipal && profile?.id) {
        query = query.eq('teacher_id', profile.id)
      }
      
      const { data, error } = await query.order('name')
      if (error) throw error
      return (data || []) as { id: string; name: string; grade_level?: string }[]
    },
    enabled: !!schoolId,
    staleTime: 60_000,
  })

  // Fetch students filtered by class (which is already school-scoped)
  const studentsQuery = useQuery({
    queryKey: ['students_for_attendance', classId, schoolId, attendanceDate],
    queryFn: async () => {
      if (!schoolId) return []
      let q = assertSupabase()
        .from('students')
        .select('id,first_name,last_name,class_id,is_active')
        .eq('preschool_id', schoolId)
        .eq('is_active', true)
      if (classId) q = q.eq('class_id', classId)
      const { data, error } = await q.order('first_name')
      if (error) throw error
      
      // Deduplicate by student ID (safeguard against data issues)
      const seenIds = new Set<string>()
      const uniqueArr = (data || []).filter((s: { id: string }) => {
        if (seenIds.has(s.id)) return false
        seenIds.add(s.id)
        return true
      }) as { id: string; first_name: string; last_name: string; class_id: string | null; is_active: boolean | null }[]
      
      // Default all to present
      const next: Record<string, AttendanceStatus> = {}
      for (const s of uniqueArr) next[s.id] = 'present'
      
      // If we have a date, load any existing attendance to prefill
      if (attendanceDate && uniqueArr.length > 0) {
        const studentIds = uniqueArr.map(s => s.id)
        const { data: attendanceRows, error: attendanceError } = await assertSupabase()
          .from('attendance')
          .select('student_id,status')
          .eq('attendance_date', attendanceDate)
          .or(`organization_id.eq.${schoolId},organization_id.is.null`)
          .in('student_id', studentIds)
        
        if (!attendanceError && attendanceRows?.length) {
          attendanceRows.forEach(row => {
            if (row?.student_id && row?.status) {
              next[row.student_id] = row.status as AttendanceStatus
            }
          })
        }
      }
      
      setStatusMap(next)
      return uniqueArr
    },
    enabled: !!classId && !!schoolId && !!attendanceDate,
  })

  const cycleStatus = (sid: string) => {
    setStatusMap(prev => {
      const current = prev[sid] || 'present'
      // Cycle: present -> late -> absent -> excused -> present
      const order: AttendanceStatus[] = ['present', 'late', 'absent', 'excused']
      const nextIdx = (order.indexOf(current) + 1) % order.length
      return { ...prev, [sid]: order[nextIdx] }
    })
  }

  const markAll = (value: 'present' | 'absent' | 'late' | 'excused') => {
    setStatusMap(prev => {
      const next: Record<string, AttendanceStatus> = {}
      Object.keys(prev).forEach(k => { next[k] = value })
      return next
    })
  }

  const onSubmit = async () => {
    if (!classId) { showAlert('Select class', 'Please select a class first.', 'warning'); return }
    if (!attendanceDate) { showAlert('Select date', 'Please select an attendance date.', 'warning'); return }
    const todayKey = new Date().toISOString().slice(0, 10)
    if (attendanceDate > todayKey) {
      showAlert('Invalid date', 'Attendance cannot be recorded for a future date.', 'warning')
      return
    }
    const students = studentsQuery.data || []
    const entries = students.map(s => ({ student_id: s.id, status: statusMap[s.id] || 'present' }))
    const presentCount = entries.filter(e => e.status === 'present').length
    const lateCount = entries.filter(e => e.status === 'late').length
    const absentCount = entries.filter(e => e.status === 'absent').length

    setSubmitting(true)
    try {
      // Insert attendance records
      const { data: auth } = await assertSupabase().auth.getUser()
      const authUserId = auth?.user?.id || null
      
      const studentIds = entries.map(e => e.student_id)
      
      // Remove any existing records for this date (to allow edits for past dates)
      if (studentIds.length > 0) {
        const { error: deleteError } = await assertSupabase()
          .from('attendance')
          .delete()
          .in('student_id', studentIds)
          .eq('attendance_date', attendanceDate)
          .or(`organization_id.eq.${schoolId},organization_id.is.null`)
        
        if (deleteError) {
          throw deleteError
        }
      }
      
      const attendanceRows: {
        student_id: string;
        status: AttendanceStatus;
        attendance_date: string;
        recorded_by: string | null;
        organization_id?: string;
      }[] = entries.map(e => ({
        student_id: e.student_id,
        status: e.status,
        attendance_date: attendanceDate,
        recorded_by: authUserId,
        organization_id: schoolId || undefined,
      }))
      
      const { error: insertError } = await assertSupabase()
        .from('attendance')
        .insert(attendanceRows)
      
      if (insertError) {
        throw insertError
      }
      
      // Send push notifications to parents
      try {
        const { data: sessionData } = await assertSupabase().auth.getSession()
        if (sessionData?.session?.access_token) {
          const notifyPromises = entries.map(entry => {
            const event_type = entry.status === 'present'
              ? 'attendance_recorded'
              : entry.status === 'late'
                ? 'attendance_late'
                : 'attendance_absent'
            
            return assertSupabase().functions.invoke('notifications-dispatcher', {
              body: {
                event_type,
                student_id: entry.student_id,
                preschool_id: schoolId,
                attendance_date: attendanceDate,
                attendance_status: entry.status,
                send_immediately: true,
              },
              headers: {
                Authorization: `Bearer ${sessionData.session.access_token}`,
              },
            })
          })
          
          if (notifyPromises.length > 0) {
            await Promise.all(notifyPromises)
          }
        }
      } catch {
        // Don't fail attendance submission if notification fails
      }

      track('edudash.attendance.submit', { classId, presentCount, lateCount, absentCount, total: entries.length, date: attendanceDate })
      showAlert('Attendance recorded', `Marked ${presentCount} present, ${lateCount} late, ${absentCount} absent for ${attendanceDate}.`, 'success', [
        { text: 'View History', onPress: () => router.push('/screens/attendance-history') },
        { text: 'Done', onPress: () => router.back() },
      ])
    } catch (e: any) {
      showAlert('Failed', e?.message || 'Could not submit attendance.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const classes = classesQuery.data || []
  const students = studentsQuery.data || []
  const formattedDate = attendanceDate ? format(new Date(`${attendanceDate}T00:00:00`), 'PPP') : 'Select date'

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ 
        title: 'Take Attendance', 
        headerStyle: { backgroundColor: palette.background }, 
        headerTitleStyle: { color: '#fff' }, 
        headerTintColor: palette.primary,
        headerBackVisible: true
      }} />
      <ThemedStatusBar />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.background }}>
        <ScrollView 
          contentContainerStyle={styles.container}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefreshHandler}
              tintColor="#00f5ff"
              title="Refreshing attendance data..."
            />
          }
        >
          {!canManageClasses && (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
              <Text style={styles.cardTitle}>Access Restricted</Text>
              <Text style={{ color: palette.textSecondary }}>Your seat is not active to manage attendance. Please contact your administrator.</Text>
            </View>
          )}
          
          {schoolLoading ? (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
              <EduDashSpinner color={palette.primary} />
              <Text style={{ color: palette.textSecondary, textAlign: 'center', marginTop: 8 }}>Loading school information...</Text>
            </View>
          ) : !schoolId ? (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
              <Text style={styles.cardTitle}>No School Assigned</Text>
              <Text style={{ color: palette.textSecondary }}>You are not assigned to any school. Please contact your administrator.</Text>
            </View>
          ) : (
            <>
              {schoolName && (
                <Text style={[styles.subtitle, { marginBottom: 4 }]}>{schoolName}</Text>
              )}
              <View style={styles.dateRow}>
                <Text style={styles.subtitle}>Date: {formattedDate}</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={18} color={palette.primary} />
                  <Text style={[styles.dateButtonText, { color: palette.primary }]}>Change</Text>
                </TouchableOpacity>
              </View>
              {showDatePicker && (
                <DateTimePicker
                  value={dateValue}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  maximumDate={new Date()}
                  onChange={(_, selectedDate) => {
                    if (Platform.OS !== 'ios') {
                      setShowDatePicker(false)
                    }
                    if (selectedDate) {
                      const nextKey = selectedDate.toISOString().slice(0, 10)
                      setAttendanceDate(nextKey)
                      setDateValue(selectedDate)
                    }
                  }}
                />
              )}

          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
            <Text style={styles.cardTitle}>Class</Text>
            {classesQuery.isLoading ? (
              <EduDashSpinner color={palette.primary} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {classes.map(c => (
                  <TouchableOpacity key={c.id} style={[styles.chip, classId === c.id && styles.chipActive]} onPress={() => setClassId(c.id)}>
                    <Text style={[styles.chipText, classId === c.id && styles.chipTextActive]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {classId && (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>Students</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <TouchableOpacity onPress={() => markAll('present')} style={[styles.smallBtn, { backgroundColor: '#16a34a' }]}>
                    <Text style={styles.smallBtnText}>All present</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => markAll('late')} style={[styles.smallBtn, { backgroundColor: '#f59e0b' }]}>
                    <Text style={styles.smallBtnText}>All late</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => markAll('absent')} style={[styles.smallBtn, { backgroundColor: '#ef4444' }]}>
                    <Text style={styles.smallBtnText}>All absent</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <Text style={styles.hint}>Tap a student to cycle: Present → Late → Absent</Text>

              {studentsQuery.isLoading ? (
                <EduDashSpinner color={palette.primary} />
              ) : (
                <View style={{ gap: 8 }}>
                  {students.length === 0 ? (
                    <Text style={styles.empty}>No students found in this class.</Text>
                  ) : (
                    students.map(s => {
                      const status = statusMap[s.id] || 'present'
                      const badgeStyle = status === 'present' ? styles.badgePresent : status === 'late' ? styles.badgeLate : styles.badgeAbsent
                      const statusLabel = status.charAt(0).toUpperCase() + status.slice(1)
                      return (
                        <TouchableOpacity key={s.id} style={[styles.studentRow, { borderColor: palette.outline }]} onPress={() => cycleStatus(s.id)}>
                          <Text style={styles.studentName}>{s.first_name} {s.last_name}</Text>
                          <View style={[styles.badge, badgeStyle]}>
                            <Text style={styles.badgeText}>{statusLabel}</Text>
                          </View>
                        </TouchableOpacity>
                      )
                    })
                  )}
                </View>
              )}
            </View>
          )}

          <View style={{ gap: 12 }}>
            <TouchableOpacity onPress={onSubmit} disabled={!classId || submitting || !schoolId} style={[styles.submitBtn, (!classId || submitting || !schoolId) && styles.dim]}>
              {submitting ? <EduDashSpinner color="#000" /> : <Text style={styles.submitText}>Submit Attendance</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={() => router.push('/screens/attendance-history')} 
              style={[styles.historyBtn, { backgroundColor: palette.surface, borderColor: palette.primary }]}
            >
              <Text style={[styles.historyText, { color: palette.primary }]}>View Attendance History</Text>
            </TouchableOpacity>
          </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      <AlertModal
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        buttons={alertState.buttons}
        onClose={hideAlert}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  subtitle: { color: '#9CA3AF' },
  card: { borderWidth: 1, borderColor: '#1f2937', borderRadius: 12, padding: 12, gap: 8 },
  cardTitle: { color: '#fff', fontWeight: '800' },
  chip: { borderWidth: 1, borderColor: '#1f2937', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8 },
  chipActive: { backgroundColor: '#00f5ff', borderColor: '#00f5ff' },
  chipText: { color: '#9CA3AF', fontWeight: '700' },
  chipTextActive: { color: '#000' },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  smallBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  hint: { color: '#9CA3AF', fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  studentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, padding: 10 },
  studentName: { color: '#fff', flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, minWidth: 70, alignItems: 'center' },
  badgePresent: { backgroundColor: '#16a34a' },
  badgeLate: { backgroundColor: '#f59e0b' },
  badgeAbsent: { backgroundColor: '#ef4444' },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  empty: { color: '#9CA3AF' },
  submitBtn: { backgroundColor: '#00f5ff', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  submitText: { color: '#000', fontWeight: '800' },
  historyBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 2 },
  historyText: { fontWeight: '700' },
  dim: { opacity: 0.6 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  dateButtonText: { fontWeight: '700' },
})
