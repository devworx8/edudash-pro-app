import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '@/contexts/ThemeContext'
import { router, useLocalSearchParams } from 'expo-router'
import { AnnouncementModal, AnnouncementData } from '@/components/modals/AnnouncementModal'
import AnnouncementService from '@/lib/services/announcementService'
import { assertSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal'

export default function PrincipalAnnouncementScreen() {
  const { theme } = useTheme()
  const { profile } = useAuth()
  const { showAlert, alertProps } = useAlertModal()
  const params = useLocalSearchParams<{ title?: string; content?: string; audience?: string; priority?: string; compose?: string }>()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Auto-open modal when screen is opened
    setVisible(true)
  }, [])

  const onClose = () => {
    setVisible(false)
    router.back()
  }

  const onSend = async (announcement: AnnouncementData) => {
    try {
      const { data: auth } = await assertSupabase().auth.getUser()
      const authUserId = auth?.user?.id
      if (!authUserId) { showAlert({ title: 'Error', message: 'Not signed in' }); return }

      // Resolve teacher/user record to get preschool (school) id
      let preschoolId: string | undefined = (profile as any)?.preschool_id || (profile as any)?.organization_id;
      if (!preschoolId) {
        // profiles.id = auth_user_id
        const { data: profileRow } = await assertSupabase()
          .from('profiles')
          .select('preschool_id, organization_id')
          .eq('id', authUserId)
          .maybeSingle()
        preschoolId = profileRow?.preschool_id || profileRow?.organization_id;
      }
      if (!preschoolId) { showAlert({ title: 'Error', message: 'No school found for your profile' }); return }

      const res = await AnnouncementService.createAnnouncement(preschoolId, authUserId, announcement)
      if (!res.success) { showAlert({ title: 'Error', message: res.error || 'Failed to create announcement' }); return }
      showAlert({ title: 'Success', message: 'Announcement created', buttons: [{ text: 'OK', onPress: onClose }] })
    } catch (e: any) {
      showAlert({ title: 'Error', message: e?.message || 'Failed to create announcement' })
    }
  }

  const prefill: AnnouncementData = {
    title: (params?.title as string) || '',
    message: (params?.content as string) || '',
    audience: (() => {
      const a = String(params?.audience || '').toLowerCase()
      if (a === 'all') return ['teachers', 'parents', 'students']
      if (['teachers','parents','students', 'admin'].includes(a)) return [a]
      return ['teachers']
    })(),
    priority: (['low','normal','high','urgent'].includes(String(params?.priority || '').toLowerCase())
      ? (params?.priority as any)
      : 'normal'),
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Create Announcement</Text>
        <Text style={{ color: theme.textSecondary }}>School-wide announcement</Text>
      </View>
      <AnnouncementModal
        visible={visible}
        onClose={onClose}
        onSend={onSend}
        initialData={prefill}
        onOpenWeeklyMenu={() => {
          setVisible(false)
          router.push('/screens/principal-menu')
        }}
      />
      <AlertModal {...alertProps} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16 },
  title: { fontSize: 18, fontWeight: '700' },
})
