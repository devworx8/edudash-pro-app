import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
// import { assertSupabase } from '@/lib/supabase'
import { getFeatureFlagsSync } from '@/lib/featureFlags'
import { track } from '@/lib/analytics'
import { Colors } from '@/constants/Colors'
import { getCombinedUsage } from '@/lib/ai/usage'
import { useHomeworkGenerator } from '@/hooks/useHomeworkGenerator'
import { canUseFeature, getQuotaStatus } from '@/lib/ai/limits'
import { setPreferredModel } from '@/lib/ai/preferences'
import { router } from 'expo-router'
import { useSimplePullToRefresh } from '@/hooks/usePullToRefresh'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { ModelInUseIndicator } from '@/components/ai/ModelInUseIndicator'
import { ModelSelectorChips } from '@/components/ai/ModelSelectorChips'
import { toast } from '@/components/ui/ToastProvider'
import { useHomeworkHelperModels } from '@/hooks/useAIModelSelection'
import { useTheme } from '@/contexts/ThemeContext'
import { FeatureQuotaBar } from '@/components/ai/FeatureQuotaBar'
import { useAuth } from '@/contexts/AuthContext'
import { useRewardedFeature } from '@/contexts/AdsContext'
import { resolveHomeworkPipelineFromProfile } from '@/lib/homework/pipelineResolver'

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function AIHomeworkHelperScreen() {
  const { profile } = useAuth()
  const { theme } = useTheme()
  const { showAlert, alertProps } = useAlertModal()
  const { isUnlocked: isHomeworkUnlocked, offerRewardedUnlock: offerHomeworkUnlock, canShowRewardedAd } = useRewardedFeature('homework_help')
  const [question, setQuestion] = useState('Explain how to solve long division: 156 ÷ 12 step by step for a Grade 4 learner.')
  const [subject, setSubject] = useState('Mathematics')
  const { loading, generate, result } = useHomeworkGenerator()
  const [pending, setPending] = useState(false)
  const [answer, setAnswer] = useState('')
  const [usage, setUsage] = useState<{ lesson_generation: number; grading_assistance: number; homework_help: number }>({
    lesson_generation: 0,
    grading_assistance: 0,
    homework_help: 0,
  })
  const [quotaStatus, setQuotaStatus] = useState<{ used: number; limit: number; remaining: number } | null>(null)
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0)

  const flags = getFeatureFlagsSync()
  const { availableModels, selectedModel, setSelectedModel, quotas } = useHomeworkHelperModels()
  const pipelineConfig = resolveHomeworkPipelineFromProfile(profile)
  const isPreschoolPipeline = pipelineConfig.mode === 'preschool_activity_pack'
  const screenTitle = isPreschoolPipeline ? 'AI Activity Helper' : 'AI Homework Helper'
  const screenSubtitle = isPreschoolPipeline
    ? 'Preschool home activity packs from worksheets and notes'
    : 'Child-safe, step-by-step guidance'
  const AI_ENABLED = (process.env.EXPO_PUBLIC_AI_ENABLED === 'true') || (process.env.EXPO_PUBLIC_ENABLE_AI_FEATURES === 'true')
  const aiHelperEnabled = AI_ENABLED && flags.ai_homework_help !== false

  const refreshQuotaStatus = useCallback(async () => {
    try {
      const status = await getQuotaStatus('homework_help')
      const effectiveLimit = quotas.ai_requests && quotas.ai_requests > 0 ? quotas.ai_requests : status.limit
      const remaining = effectiveLimit < 0 ? Number.POSITIVE_INFINITY : Math.max(0, effectiveLimit - status.used)
      setQuotaStatus({
        used: status.used,
        limit: effectiveLimit,
        remaining,
      })
    } catch {
      // non-fatal
    }
  }, [quotas.ai_requests])

  const handleRefresh = async () => {
    try {
      setUsage(await getCombinedUsage())
      await refreshQuotaStatus()
    } catch (error) {
      console.error('Error refreshing AI homework helper data:', error)
    }
  }

  const { refreshing, onRefreshHandler } = useSimplePullToRefresh(handleRefresh, 'ai_homework_helper')

  useEffect(() => {
    getCombinedUsage().then(setUsage).catch(() => {})
    void refreshQuotaStatus()
  }, [refreshQuotaStatus])

  const onAskAI = async () => {
    setPending(true)
    if (!question.trim()) {
      toast.warn('Please enter a question or problem.')
      setPending(false)
      return
    }
    if (!aiHelperEnabled) {
      toast.warn('AI Homework Helper is not enabled in this build.')
      setPending(false)
      return
    }

    // Enforce quota before making a request
    const gate = await canUseFeature('homework_help', 1)
    if (!gate.allowed && !isHomeworkUnlocked) {
      if (canShowRewardedAd) {
        const unlocked = await offerHomeworkUnlock()
        if (!unlocked) {
          const status = await getQuotaStatus('homework_help')
          setQuotaStatus(status)
          showAlert({
            title: 'Monthly limit reached',
            message: `You have used ${status.used} of ${status.limit} homework help sessions this month. ${gate.requiresPrepay ? 'Please upgrade or purchase more to continue.' : ''}`,
            type: 'warning',
            buttons: [
              { text: 'Cancel', style: 'cancel' },
              { text: 'See plans', onPress: () => router.push('/pricing') },
            ]
          })
          setPending(false)
          return
        }
      } else {
        const status = await getQuotaStatus('homework_help')
        setQuotaStatus(status)
        showAlert({
          title: 'Monthly limit reached',
          message: `You have used ${status.used} of ${status.limit} homework help sessions this month. ${gate.requiresPrepay ? 'Please upgrade or purchase more to continue.' : ''}`,
          type: 'warning',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'See plans', onPress: () => router.push('/pricing') },
          ]
        })
        setPending(false)
        return
      }
    }

    try {
      setAnswer('')
      track('edudash.ai.helper.started', { subject })
      const response = await generate({
        question: question,
        subject: subject.trim() || (isPreschoolPipeline ? 'Early Learning' : 'Mathematics'),
        gradeLevel: pipelineConfig.defaultGradeLevel,
        difficulty: pipelineConfig.defaultDifficulty,
        model: selectedModel,
        pipelineMode: pipelineConfig.mode,
      })
      // Extract text from HomeworkResult object
      const responseText = response?.text || (typeof response === 'string' ? response : String(response || ''))
      setAnswer(responseText)
      setUsage(await getCombinedUsage())
      await refreshQuotaStatus()
      setQuotaRefreshKey((prev) => prev + 1)
      track('edudash.ai.helper.completed', { subject })
    } catch (e: any) {
      const msg = String(e?.message || 'Unknown error')
      if (msg.toLowerCase().includes('rate') || msg.includes('429')) {
        toast.warn('Rate limit reached. Please try again later.')
        track('edudash.ai.helper.rate_limited', {})
      } else {
        toast.error(`Error: ${msg}`)
        track('edudash.ai.helper.failed', { error: msg })
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <ScreenHeader 
        title={screenTitle}
        subtitle={screenSubtitle}
      />
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <ModelInUseIndicator modelId={selectedModel} label="Using" showCostDots compact />
      </View>
      <ScrollView 
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefreshHandler}
            tintColor={theme.primary}
            title="Refreshing AI data..."
          />
        }
      >

        {!aiHelperEnabled && (
          <Text style={[styles.disabledBanner, { color: theme.warning, backgroundColor: theme.warning + '20', borderColor: theme.warning }]}>AI Homework Helper is currently disabled by feature flags or build configuration.</Text>
        )}

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.pipelineChip, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Ionicons name={isPreschoolPipeline ? 'flower-outline' : 'school-outline'} size={14} color={theme.textSecondary} />
            <Text style={[styles.pipelineChipText, { color: theme.textSecondary }]}>
              {isPreschoolPipeline ? 'Preschool pipeline active' : 'K-12 pipeline active'}
            </Text>
          </View>

          {/* Model selector */}
          <ModelSelectorChips
            availableModels={availableModels}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            feature="homework_help"
            onPersist={async (modelId, feat) => { await setPreferredModel(modelId, feat as 'homework_help'); }}
            title="AI Model"
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>Subject</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
            value={subject}
            onChangeText={setSubject}
            placeholder={pipelineConfig.subjectPlaceholder}
            placeholderTextColor={theme.textSecondary}
          />

          <Text style={[styles.label, { marginTop: 12, color: theme.textSecondary }]}>Question / Problem</Text>
          <TextInput
            style={[styles.input, styles.textArea, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
            value={question}
            onChangeText={setQuestion}
            placeholder={pipelineConfig.questionPlaceholder}
            placeholderTextColor={theme.textSecondary}
            multiline
          />

          <TouchableOpacity onPress={onAskAI} disabled={loading || pending || !aiHelperEnabled} style={[styles.button, { backgroundColor: theme.primary }, (loading || pending || !aiHelperEnabled) && styles.buttonDisabled]}>
            {(loading || pending) ? <EduDashSpinner color="#fff" /> : <Text style={styles.buttonText}>Ask AI</Text>}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Response</Text>
          <Text style={[styles.usage, { color: theme.textSecondary }]}>Monthly usage (local/server): Helper {usage.homework_help}</Text>
          <FeatureQuotaBar
            feature="homework_help"
            used={quotaStatus?.used ?? usage.homework_help}
            limit={quotaStatus?.limit ?? (quotas.ai_requests || 0)}
            remaining={quotaStatus?.remaining ?? 0}
            periodLabel="month"
            refreshKey={quotaRefreshKey}
            onRefresh={refreshQuotaStatus}
          />
          {result?.__fallbackUsed && (
            <View style={[styles.fallbackChip, { borderColor: theme.border, backgroundColor: theme.accent + '20' }]}>
              <Ionicons name="information-circle" size={16} color={theme.accent} />
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginLeft: 6 }}>Fallback used</Text>
            </View>
          )}
          {answer ? (
            <Text style={[styles.answer, { color: theme.text }]} selectable>{answer}</Text>
          ) : (
            <Text style={[styles.placeholder, { color: theme.textSecondary }]}>No response yet. Enter a question and press "Ask AI".</Text>
          )}
        </View>
      </ScrollView>
      <AlertModal {...alertProps} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { padding: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 12 },
  disabledBanner: { padding: 8, borderRadius: 8, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth },
  card: { borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 12 },
  pipelineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  pipelineChipText: { fontSize: 12, fontWeight: '600' },
  label: { fontSize: 12, marginBottom: 6 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  textArea: { minHeight: 120 },
  button: { marginTop: 12, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700' },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  usage: { fontSize: 12, marginBottom: 8 },
  answer: { fontSize: 13, lineHeight: 19 },
  placeholder: { fontSize: 13 },
  fallbackChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
})
