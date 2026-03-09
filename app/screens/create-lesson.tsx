import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Stack, router } from 'expo-router'
import { assertSupabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { LessonGeneratorService } from '@/lib/ai/lessonGenerator'
import { useAuth } from '@/contexts/AuthContext'
import { useTranslation } from 'react-i18next'

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function CreateLessonScreen() {
  const { profile } = useAuth()
  const { t } = useTranslation('common')
  const hasActiveSeat = profile?.hasActiveSeat?.() || profile?.seat_status === 'active'
  const canCreate = hasActiveSeat || (!!profile?.hasCapability && profile.hasCapability('create_assignments' as any))
  const palette = { background: '#0b1220', text: '#FFFFFF', textSecondary: '#9CA3AF', outline: '#1f2937', surface: '#111827', primary: '#00f5ff' }
  const { showAlert, alertProps } = useAlertModal();

  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [title, setTitle] = useState(t('lessons_create.default_title', { defaultValue: 'New Lesson' }))
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('30')
  const [complexity, setComplexity] = useState<'simple' | 'moderate' | 'complex'>('moderate')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const categoriesQuery = useQuery({
    queryKey: ['lesson_categories_for_create'],
    queryFn: async () => {
      const { data, error } = await assertSupabase().from('lesson_categories').select('id,name')
      if (error) throw error
      return (data || []) as { id: string; name: string }[]
    },
    staleTime: 60_000,
  })

  const onSave = async () => {
    try {
      if (!title.trim()) { showAlert({ title: 'Title required', message: 'Please enter a lesson title.', type: 'warning' }); return }
      const catId = categoryId || categoriesQuery.data?.[0]?.id
      if (!catId) { showAlert({ title: 'No category', message: 'Please create a lesson category first.', type: 'warning' }); return }

      setSaving(true)
      const { data: auth } = await assertSupabase().auth.getUser()
      const authUserId = auth?.user?.id || ''
      // Use auth_user_id to lookup profile (NOT profiles.id!)
      const { data: profile } = await assertSupabase().from('profiles').select('id,preschool_id,organization_id').eq('auth_user_id', authUserId).maybeSingle()
      if (!profile) { showAlert({ title: 'Not signed in', message: 'No user profile.', type: 'error' }); return }
      const schoolId = profile.preschool_id || profile.organization_id;

      const res = await LessonGeneratorService.saveGeneratedLesson({
        lesson: { title, description, content: { sections: [{ title: 'Overview', content: description }] } },
        teacherId: profile.id,
        preschoolId: schoolId,
        ageGroupId: 'n/a',
        categoryId: catId,
        template: { duration: parseInt(duration) || 30, complexity },
        isPublished: true,
      })
      if (!res.success) { showAlert({ title: 'Save failed', message: res.error || 'Unknown error', type: 'error' }); return }
      showAlert({ title: 'Saved', message: `Lesson saved with id ${res.lessonId}`, type: 'success', buttons: [{ text: 'OK', onPress: () => router.back() }] })
    } catch (e: any) {
      showAlert({ title: 'Error', message: e?.message || 'Failed to save', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const categories = categoriesQuery.data || []

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ 
        title: t('lessons_create.title', { defaultValue: 'Create Lesson' }), 
        headerStyle: { backgroundColor: palette.background }, 
        headerTitleStyle: { color: '#fff' }, 
        headerTintColor: palette.primary,
        headerBackVisible: true
      }} />
      <StatusBar style="light" backgroundColor={palette.background} />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.background }}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.chip, mode === 'manual' && styles.chipActive]} onPress={() => setMode('manual')}>
              <Text style={[styles.chipText, mode === 'manual' && styles.chipTextActive]}>{t('lessons_create.mode_manual', { defaultValue: 'Manual' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, mode === 'ai' && styles.chipActive]} onPress={() => setMode('ai')}>
              <Text style={[styles.chipText, mode === 'ai' && styles.chipTextActive]}>{t('lessons_create.mode_ai', { defaultValue: 'AI' })}</Text>
            </TouchableOpacity>
          </View>

          {!canCreate ? (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
              <Text style={styles.cardTitle}>{t('lessons_create.access_restricted_title', { defaultValue: 'Access Restricted' })}</Text>
              <Text style={{ color: palette.textSecondary }}>{t('lessons_create.access_restricted_desc', { defaultValue: 'Your teacher seat is not active or you lack permission to create lessons. Please contact your administrator.' })}</Text>
            </View>
          ) : mode === 'ai' ? (
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
              <Text style={styles.cardTitle}>{t('lessons_create.ai_card_title', { defaultValue: 'AI Lesson Generator' })}</Text>
              <Text style={{ color: palette.textSecondary, marginBottom: 8 }}>{t('lessons_create.ai_card_desc', { defaultValue: 'Use the AI generator to draft a CAPS-aligned lesson.' })}</Text>
              <TouchableOpacity onPress={() => router.push('/screens/ai-lesson-generator')} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Open AI Lesson Generator</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
                <Text style={styles.cardTitle}>{t('lessons_create.section_basics', { defaultValue: 'Basics' })}</Text>
                <Text style={styles.label}>{t('lessons_create.label_title', { defaultValue: 'Title' })}</Text>
                <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={t('lessons_create.placeholder_title', { defaultValue: 'Lesson title' })} placeholderTextColor={palette.textSecondary} />
                <Text style={[styles.label, { marginTop: 10 }]}>{t('lessons_create.label_description', { defaultValue: 'Description' })}</Text>
                <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder={t('lessons_create.placeholder_description', { defaultValue: 'Brief description' })} placeholderTextColor={palette.textSecondary} multiline />
              </View>

              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
                <Text style={styles.cardTitle}>{t('lessons_create.section_category', { defaultValue: 'Category' })}</Text>
                {categoriesQuery.isLoading ? (
                  <EduDashSpinner color={palette.primary} />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {categories.map(c => (
                      <TouchableOpacity key={c.id} style={[styles.chip, categoryId === c.id && styles.chipActive]} onPress={() => setCategoryId(c.id)}>
                        <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
                <Text style={styles.cardTitle}>{t('lessons_create.section_settings', { defaultValue: 'Settings' })}</Text>
                <Text style={styles.label}>{t('lessons_create.label_duration', { defaultValue: 'Duration (minutes)' })}</Text>
                <TextInput style={styles.input} value={duration} onChangeText={setDuration} keyboardType="numeric" placeholder={t('lessons_create.placeholder_duration', { defaultValue: '30' })} placeholderTextColor={palette.textSecondary} />

                <Text style={[styles.label, { marginTop: 10 }]}>{t('lessons_create.label_complexity', { defaultValue: 'Complexity' })}</Text>
                <View style={styles.row}>
                  {(['simple','moderate','complex'] as const).map(c => (
                    <TouchableOpacity key={c} style={[styles.chip, complexity === c && styles.chipActive]} onPress={() => setComplexity(c)}>
                      <Text style={[styles.chipText, complexity === c && styles.chipTextActive]}>{t(`lessons_create.complexity_${c}`, { defaultValue: c })}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity onPress={onSave} disabled={saving} style={[styles.primaryBtn, saving && { opacity: 0.6 }]}>
                {saving ? <EduDashSpinner color="#000" /> : <Text style={styles.primaryBtnText}>{t('lessons_create.save', { defaultValue: 'Save Lesson' })}</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
        <AlertModal {...alertProps} />
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  card: { borderWidth: 1, borderColor: '#1f2937', borderRadius: 12, padding: 12, gap: 8 },
  cardTitle: { color: '#fff', fontWeight: '800' },
  label: { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },
  input: { backgroundColor: '#111827', color: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#1f2937', padding: 12 },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  chip: { borderWidth: 1, borderColor: '#1f2937', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  chipActive: { backgroundColor: '#00f5ff', borderColor: '#00f5ff' },
  chipText: { color: '#9CA3AF', fontWeight: '700' },
  chipTextActive: { color: '#000' },
  primaryBtn: { backgroundColor: '#00f5ff', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#000', fontWeight: '800' },
})
