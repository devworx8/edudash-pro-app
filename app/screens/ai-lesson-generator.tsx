/**
 * AI Lesson Generator Screen
 * Creates AI-powered lesson plans using Anthropic Claude models.
 * @module app/screens/ai-lesson-generator
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { navigateToUpgrade } from '@/lib/upgrade/upgradeRoutes';
import { assertSupabase } from '@/lib/supabase';
import { LessonGeneratorService } from '@/lib/ai/lessonGenerator';
import { setPreferredModel } from '@/lib/ai/preferences';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { useSimplePullToRefresh } from '@/hooks/usePullToRefresh';
import { useLessonGeneratorModels, useTierInfo } from '@/hooks/useAIModelSelection';
import { useAILessonGeneration } from '@/hooks/useAILessonGeneration';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/ToastProvider';
import { EducationalPDFService } from '@/lib/services/EducationalPDFService';
import { LessonGenerationFullscreen, QuotaBar } from '@/components/ai-lesson-generator';
import { ModelInUseIndicator } from '@/components/ai/ModelInUseIndicator';
import { ModelSelectorChips } from '@/components/ai/ModelSelectorChips';
import { parseLessonPlanResponse } from '@/lib/ai/parseLessonPlan';
import type { LessonPlanV2 } from '@/lib/ai/lessonPlanSchema';
import { clampPercent } from '@/lib/progress/clampPercent';
import {
  buildQuickLessonThemeHint,
  loadQuickLessonThemeContext,
  summarizeQuickLessonContext,
  type QuickLessonThemeContext,
} from '@/lib/lesson-planning/quickLessonThemeContext';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
type LanguageCode = 'en' | 'es' | 'fr' | 'pt' | 'de' | 'af' | 'zu' | 'st';
type LessonSectionCard = {
  title: string;
  body: string;
};
function parseLessonSections(raw: string): LessonSectionCard[] {
  const text = String(raw || '').trim();
  if (!text) return [];
  const lines = text.split('\n');
  const sections: LessonSectionCard[] = [];
  let currentTitle = 'Overview';
  let buffer: string[] = [];
  const pushSection = () => {
    const body = buffer.join('\n').trim();
    if (!body) return;
    sections.push({ title: currentTitle, body });
    buffer = [];
  };
  lines.forEach((line) => {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      pushSection();
      currentTitle = headingMatch[1].trim();
      return;
    }
    buffer.push(line);
  });
  pushSection();
  return sections.length > 0 ? sections : [{ title: 'Lesson', body: text }];
}
export default function AILessonGeneratorScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const palette = useMemo(() => ({
    bg: theme.background, text: theme.text, textSec: theme.textSecondary,
    outline: theme.border, surface: theme.surface, primary: theme.primary, accent: theme.accent,
  }), [theme]);
  // Form state
  const [topic, setTopic] = useState('Fractions');
  const [subject, setSubject] = useState('Mathematics');
  const [gradeLevel, setGradeLevel] = useState('3');
  const [duration, setDuration] = useState('45');
  const [objectives, setObjectives] = useState('Understand proper fractions; Compare simple fractions');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [saving, setSaving] = useState(false);
  const [resultViewMode, setResultViewMode] = useState<'cards' | 'raw'>('cards');
  const [quickLessonContext, setQuickLessonContext] = useState<QuickLessonThemeContext | null>(null);
  const [quickLessonContextLoading, setQuickLessonContextLoading] = useState(false);
  const [explicitRoutineContext, setExplicitRoutineContext] = useState('');
  const [showFullscreenLesson, setShowFullscreenLesson] = useState(false);
  const quickDefaultsApplied = useRef(false);
  const flags = getFeatureFlagsSync();
  const progressContractEnabled = flags.progress_contract_v1 !== false;
  const lessonFullscreenEnabled = flags.lesson_fullscreen_v1 !== false;
  // Search params for prefill
  const searchParams = useLocalSearchParams<{
    topic?: string;
    subject?: string;
    gradeLevel?: string;
    duration?: string;
    objectives?: string;
    model?: string;
    language?: string;
    mode?: string;
    routineContext?: string;
  }>();
  const modeParam = Array.isArray(searchParams?.mode) ? searchParams.mode[0] : searchParams?.mode;
  const isQuickMode = modeParam === 'quick';
  const schoolId = profile?.organization_id || profile?.preschool_id || null;
  // Hooks
  const { generated, setGenerated, pending, progress, progressPhase, progressMessage, errorMsg, lastPayload, usage, quotaStatus, isQuotaExhausted, onGenerate, onCancel, refreshUsage } = useAILessonGeneration();
  const { availableModels, selectedModel, setSelectedModel, isLoading: modelsLoading } = useLessonGeneratorModels();
  const { tierInfo } = useTierInfo();
  const generatedContentText = useMemo(() => {
    if (typeof generated?.content === 'string' && generated.content.trim()) {
      return generated.content.trim();
    }
    if (generated?.content && typeof generated.content === 'object') {
      return JSON.stringify(generated.content, null, 2);
    }
    return String(generated?.description || '').trim();
  }, [generated?.content, generated?.description]);
  const parsedLessonPlan: LessonPlanV2 | null = useMemo(() => {
    if (!generatedContentText) return null;
    try {
      return parseLessonPlanResponse(generatedContentText);
    } catch {
      return null;
    }
  }, [generatedContentText]);
  const safeProgress = clampPercent(progress, {
    source: 'app/screens/ai-lesson-generator.progress',
  });
  const showInlineProgress = pending && !lessonFullscreenEnabled;
  const showInlineGenerated = !!generatedContentText && !lessonFullscreenEnabled;
  const categoriesQuery = useQuery({
    queryKey: ['lesson_categories'],
    queryFn: async () => {
      const { data, error } = await assertSupabase().from('lesson_categories').select('id,name');
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    staleTime: 60_000,
  });
  const handleRefresh = useCallback(async () => {
    await refreshUsage();
    await categoriesQuery.refetch();
  }, [refreshUsage, categoriesQuery]);
  const { refreshing, onRefreshHandler } = useSimplePullToRefresh(handleRefresh, 'ai_lesson_generator');
  // Apply prefill from search params
  useEffect(() => {
    const t = (searchParams?.topic || '').trim();
    const s = (searchParams?.subject || '').trim();
    const g = (searchParams?.gradeLevel || '').trim();
    const d = (searchParams?.duration || '').trim();
    const o = (searchParams?.objectives || '').trim();
    const m = (searchParams?.model || '').trim();
    const lang = (searchParams?.language || '').trim().toLowerCase();
    const routineCtx = (searchParams?.routineContext || '').trim();
    if (t) setTopic(t);
    if (s) setSubject(s);
    if (g && /^\d+$/.test(g)) setGradeLevel(g);
    if (d && /^\d+$/.test(d)) setDuration(d);
    if (o) setObjectives(o);
    if (routineCtx) setExplicitRoutineContext(routineCtx);
    if (lang && ['en', 'es', 'fr', 'pt', 'de', 'af', 'zu', 'st'].includes(lang)) setLanguage(lang as LanguageCode);
    if (m && [
      'claude-3-haiku-20240307',
      'claude-3-5-haiku-20241022',
      'claude-3-5-sonnet-20241022',
      'claude-3-7-sonnet-20250219',
      'claude-sonnet-4-20250514',
      'claude-sonnet-4-5-20250514',
    ].includes(m)) {
      setSelectedModel(m as typeof selectedModel);
    }
  }, [searchParams, setSelectedModel]);
  useEffect(() => {
    if (!isQuickMode || quickDefaultsApplied.current) return;
    setDuration('20');
    setObjectives((prev) => {
      if (prev?.trim()) return prev;
      return 'Fast lesson warm-up; One core practice activity; Quick exit check';
    });
    quickDefaultsApplied.current = true;
  }, [isQuickMode]);
  useEffect(() => {
    if (!schoolId || !user?.id) return;
    let cancelled = false;
    const loadContext = async () => {
      setQuickLessonContextLoading(true);
      const context = await loadQuickLessonThemeContext({
        supabase: assertSupabase(),
        preschoolId: schoolId,
        teacherId: user.id,
      });
      if (!cancelled) {
        setQuickLessonContext(context);
        setQuickLessonContextLoading(false);
      }
    };
    void loadContext();
    return () => {
      cancelled = true;
    };
  }, [schoolId, user?.id]);
  const buildDashPrompt = useCallback(() => {
    const objs = (objectives || '').split(';').map(s => s.trim()).filter(Boolean);
    const langSuffix = language && language !== 'en' ? `\nPlease respond in ${language}.` : '';
    const quickHint = isQuickMode
      ? '\nThis is QUICK MODE: keep prep minimal, use common classroom materials, and deliver in compact timed steps.'
      : '';
    const planningHint = buildQuickLessonThemeHint(quickLessonContext);
    const routineHint = explicitRoutineContext
      ? `\nRoutine Execution Context (must align to timings/flow):\n${explicitRoutineContext}`
      : '';
    return `Generate a ${Number(duration) || 45} minute lesson plan for Grade ${Number(gradeLevel) || 3} in ${subject} on "${topic}". Learning objectives: ${objs.join('; ') || 'derive objectives'}. Provide objectives, warm-up, activities, assessment, and closure.${quickHint}${planningHint ? `\nPlanning Alignment Context:\n${planningHint}` : ''}${routineHint}.${langSuffix}`;
  }, [topic, subject, gradeLevel, duration, objectives, language, isQuickMode, quickLessonContext, explicitRoutineContext]);
  const onOpenWithDash = useCallback(() => {
    const initialMessage = buildDashPrompt();
    try { const { safeRouter } = require('@/lib/navigation/safeRouter'); safeRouter.push({ pathname: '/screens/dash-assistant', params: { initialMessage } }); }
    catch { router.push({ pathname: '/screens/dash-assistant', params: { initialMessage } }); }
  }, [buildDashPrompt]);
  const onExportPDF = useCallback(async () => {
    const content = generatedContentText;
    if (!content) { Alert.alert('Export PDF', 'Generate a lesson first.'); return; }
    try { await EducationalPDFService.generateTextPDF(`${subject}: ${topic}`, content); toast.success('PDF generated'); }
    catch { toast.error('Failed to generate PDF'); }
  }, [subject, topic, generatedContentText]);
  const handleGenerate = useCallback(() => {
    if (isQuotaExhausted) { navigateToUpgrade({ source: 'lesson_generator' }); return; }
    if (lessonFullscreenEnabled) {
      setShowFullscreenLesson(true);
    }
    onGenerate({
      topic,
      subject,
      gradeLevel,
      duration,
      objectives,
      language,
      selectedModel,
      planningContext: [
        buildQuickLessonThemeHint(quickLessonContext),
        explicitRoutineContext ? `Routine execution context:\n${explicitRoutineContext}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    });
  }, [
    isQuotaExhausted,
    onGenerate,
    topic,
    subject,
    gradeLevel,
    duration,
    objectives,
    language,
    selectedModel,
    quickLessonContext,
    explicitRoutineContext,
    lessonFullscreenEnabled,
  ]);
  useEffect(() => {
    if (!lessonFullscreenEnabled) return;
    if (pending) setShowFullscreenLesson(true);
  }, [lessonFullscreenEnabled, pending]);
  useEffect(() => {
    if (!lessonFullscreenEnabled) return;
    if (generatedContentText) setShowFullscreenLesson(true);
  }, [generatedContentText, lessonFullscreenEnabled]);
  const onSave = useCallback(async () => {
    try {
      setSaving(true);
      const { data: auth } = await assertSupabase().auth.getUser();
      // Use auth_user_id to lookup profile (NOT profiles.id!)
      const { data: profile } = await assertSupabase().from('profiles').select('id,preschool_id,organization_id').eq('auth_user_id', auth?.user?.id || '').maybeSingle();
      if (!profile) { toast.error('Not signed in'); return; }
      const schoolId = profile.preschool_id || profile.organization_id;
      // Get or create a default category if none exists
      let categoryId = categoriesQuery.data?.[0]?.id;
      if (!categoryId) {
        // Try to create a default category
        const { data: newCat, error: catError } = await assertSupabase()
          .from('lesson_categories')
          .insert({ name: 'General', description: 'General lessons' })
          .select('id')
          .single();
        if (catError) {
          console.error('[AILessonGen] Failed to create category:', catError);
          toast.warn('Could not create lesson category. Please contact support.');
          return;
        }
        categoryId = newCat.id;
      }
      const res = await LessonGeneratorService.saveGeneratedLesson({ 
        lesson: generated, 
        teacherId: profile.id, 
        preschoolId: schoolId || profile.id, // Fallback to teacher ID if no school
        ageGroupId: 'n/a', 
        categoryId, 
        template: { duration: parseInt(duration) || 30, complexity: 'moderate' }, 
        isPublished: true 
      });
      if (!res.success) { toast.error(`Save failed: ${res.error || 'Unknown error'}`); return; }
      toast.success(`Lesson saved! View in My Lessons`);
      // Optionally navigate to Browse Lessons
      Alert.alert(
        'Lesson Saved!',
        'Your lesson has been saved. Would you like to browse your lessons?',
        [
          { text: 'Stay Here', style: 'cancel' },
          { text: 'Browse Lessons', onPress: () => router.push('/screens/teacher-lessons') }
        ]
      );
    } catch (e: unknown) { toast.error(`Save error: ${e instanceof Error ? e.message : 'Failed'}`); }
    finally { setSaving(false); }
  }, [categoriesQuery.data, generated, duration]);
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <ScreenHeader title="AI Lesson Generator" subtitle="Create AI-powered lesson plans" showBackButton />
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <ModelInUseIndicator modelId={selectedModel} label="Using" showCostDots compact />
      </View>
      <View style={styles.headerRow}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}><Ionicons name="sparkles" size={16} color={theme.onPrimary} /></View>
        <Text style={[styles.headerText, { color: palette.text }]}>Dash • Lesson Generator</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={[styles.actionBtn, { borderColor: palette.outline, marginRight: 8 }]} onPress={onExportPDF}><Ionicons name="document-outline" size={16} color={palette.text} /><Text style={[styles.actionBtnText, { color: palette.text }]}>PDF</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { borderColor: palette.outline }]} onPress={onOpenWithDash}><Ionicons name="chatbubbles-outline" size={16} color={palette.text} /><Text style={[styles.actionBtnText, { color: palette.text }]}>Dash</Text></TouchableOpacity>
      </View>
      {(isQuickMode || quickLessonContextLoading || !!quickLessonContext) && (
        <View style={[styles.quickModeBanner, { backgroundColor: theme.primary + '20', borderColor: theme.primary }]}>
          <Ionicons name="flash" size={16} color={theme.primary} />
          <View style={styles.quickModeTextWrap}>
            <Text style={[styles.quickModeText, { color: theme.primary }]}>
              {isQuickMode ? 'Quick Lesson Mode • Low prep • Fast classroom recovery' : 'Weekly Alignment Mode • Planning context active'}
            </Text>
            <Text style={[styles.quickModeSubText, { color: palette.textSec }]}>
              {quickLessonContextLoading
                ? 'Loading weekly planning alignment...'
                : summarizeQuickLessonContext(quickLessonContext)}
            </Text>
          </View>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefreshHandler} tintColor="#3B82F6" />}>
        {/* Parameters Card */}
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline, marginTop: 16 }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>Lesson Parameters</Text>
          <Text style={[styles.label, { color: palette.textSec, marginTop: 8 }]}>Topic</Text>
          <TextInput style={[styles.input, { color: palette.text, borderColor: palette.outline }]} value={topic} onChangeText={setTopic} placeholder="e.g., Fractions" />
          <Text style={[styles.label, { color: palette.textSec, marginTop: 8 }]}>Subject</Text>
          <TextInput style={[styles.input, { color: palette.text, borderColor: palette.outline }]} value={subject} onChangeText={setSubject} placeholder="e.g., Mathematics" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Text style={[styles.label, { color: palette.textSec, marginTop: 8 }]}>Grade</Text><TextInput style={[styles.input, { color: palette.text, borderColor: palette.outline }]} value={gradeLevel} onChangeText={setGradeLevel} keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}><Text style={[styles.label, { color: palette.textSec, marginTop: 8 }]}>Duration</Text><TextInput style={[styles.input, { color: palette.text, borderColor: palette.outline }]} value={duration} onChangeText={setDuration} keyboardType="numeric" /></View>
          </View>
          <Text style={[styles.label, { color: palette.textSec, marginTop: 8 }]}>Objectives (;)</Text>
          <TextInput style={[styles.input, { color: palette.text, borderColor: palette.outline }]} value={objectives} onChangeText={setObjectives} />
          <Text style={{ color: palette.textSec, marginTop: 12 }}>This month: {usage.lesson_generation} lessons</Text>
          <QuotaBar used={usage.lesson_generation} limit={quotaStatus?.limit || 5} />
        </View>
        {/* Model Selector */}
        {!modelsLoading && (
          <ModelSelectorChips
            availableModels={availableModels}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            feature="lesson_generation"
            onPersist={async (modelId, feat) => { await setPreferredModel(modelId, feat as 'lesson_generation'); }}
            title="AI Model"
          />
        )}
        {/* Buttons */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={handleGenerate} style={[styles.btn, { backgroundColor: isQuotaExhausted ? '#9CA3AF' : theme.primary, flex: 1 }]} disabled={pending}>
            {pending ? <EduDashSpinner color={theme.onPrimary} /> : <Text style={[styles.btnText, { color: theme.onPrimary }]}>{isQuotaExhausted ? 'Upgrade' : 'Generate'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onSave} style={[styles.btn, { backgroundColor: generatedContentText ? theme.accent : palette.outline, flex: 1 }]} disabled={saving || !generatedContentText}>
            {saving ? <EduDashSpinner color={theme.onAccent} /> : <Text style={[styles.btnText, { color: generatedContentText ? theme.onAccent : palette.textSec }]}>Save</Text>}
          </TouchableOpacity>
        </View>
        {lessonFullscreenEnabled && !!generatedContentText && (
          <TouchableOpacity
            onPress={() => setShowFullscreenLesson(true)}
            style={[styles.btn, { backgroundColor: theme.primary + '20', borderWidth: 1, borderColor: theme.primary, marginTop: 8 }]}
          >
            <Ionicons name="expand-outline" size={16} color={theme.primary} />
            <Text style={[styles.btnText, { color: theme.primary, marginLeft: 8 }]}>Open Fullscreen Lesson</Text>
          </TouchableOpacity>
        )}
        {/* Progress */}
        {showInlineProgress && (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: theme.primary, marginTop: 16 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><EduDashSpinner color={theme.primary} /><Text style={{ color: theme.primary, marginLeft: 8, fontWeight: '600' }}>Generating...</Text></View>
              <TouchableOpacity style={{ backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }} onPress={onCancel}><Text style={{ color: '#FFF', fontSize: 12 }}>Cancel</Text></TouchableOpacity>
            </View>
            <Text style={{ color: palette.textSec, fontSize: 13 }}>{progressMessage || 'Generating lesson...'}</Text>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: '#E5E7EB', marginTop: 8 }}><View style={{ width: `${safeProgress}%`, height: 6, borderRadius: 3, backgroundColor: theme.primary }} /></View>
            <Text style={{ color: palette.textSec, fontSize: 11, textAlign: 'center', marginTop: 4 }}>{Math.round(safeProgress)}% • {progressPhase.replace('_', ' ')}</Text>
          </View>
        )}
        {/* Error */}
        {errorMsg && !pending && (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: '#EF4444', borderWidth: 1, marginTop: 16 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Ionicons name="warning-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
              <Text style={{ color: '#EF4444', fontWeight: '600', flex: 1 }}>Failed</Text>
              {lastPayload && <TouchableOpacity onPress={() => onGenerate({ topic, subject, gradeLevel, duration, objectives, language, selectedModel }, lastPayload)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#EF4444' }}><Text style={{ color: '#EF4444', fontSize: 12 }}>Retry</Text></TouchableOpacity>}
            </View>
            <Text style={{ color: palette.textSec, fontSize: 13 }}>{errorMsg}</Text>
          </View>
        )}
        {/* Generated Content - No maxHeight to allow full scrolling */}
        {showInlineGenerated && (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: theme.success, borderWidth: 2, marginTop: 16, marginBottom: 100 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}><Ionicons name="checkmark-circle" size={18} color={theme.success} /><Text style={{ color: theme.success, fontWeight: '600', marginLeft: 8 }}>Lesson Generated!</Text></View>
            <View style={styles.resultViewToggleRow}>
              <TouchableOpacity
                onPress={() => setResultViewMode('cards')}
                style={[
                  styles.resultViewPill,
                  { borderColor: resultViewMode === 'cards' ? theme.primary : palette.outline, backgroundColor: resultViewMode === 'cards' ? theme.primary + '20' : 'transparent' },
                ]}
              >
                <Text style={{ color: resultViewMode === 'cards' ? theme.primary : palette.textSec, fontSize: 12, fontWeight: '700' }}>Card View</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setResultViewMode('raw')}
                style={[
                  styles.resultViewPill,
                  { borderColor: resultViewMode === 'raw' ? theme.primary : palette.outline, backgroundColor: resultViewMode === 'raw' ? theme.primary + '20' : 'transparent' },
                ]}
              >
                <Text style={{ color: resultViewMode === 'raw' ? theme.primary : palette.textSec, fontSize: 12, fontWeight: '700' }}>Raw View</Text>
              </TouchableOpacity>
            </View>
            <View style={{ backgroundColor: palette.bg, borderRadius: 8, padding: 10, minHeight: 100 }}>
              {(() => {
                const contentText = generatedContentText || 'No content generated';
                if (resultViewMode === 'cards') {
                  const sections = parseLessonSections(contentText);
                  return (
                    <View style={styles.resultCardsWrap}>
                      {sections.map((section, idx) => (
                        <View
                          key={`${section.title}-${idx}`}
                          style={[styles.resultCardItem, { borderColor: theme.primary + '33', backgroundColor: theme.primary + '10' }]}
                        >
                          <Text style={[styles.resultCardTitle, { color: theme.primary }]}>{section.title}</Text>
                          <Text style={[styles.resultCardBody, { color: palette.text }]}>{section.body}</Text>
                        </View>
                      ))}
                    </View>
                  );
                }
                return (
                  <Text style={{ color: palette.text, fontSize: 14, lineHeight: 22 }}>
                    {contentText || 'No content generated. Please try again.'}
                  </Text>
                );
              })()}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={onSave} style={[styles.btn, { backgroundColor: theme.primary, flex: 1 }]} disabled={saving}>{saving ? <EduDashSpinner color={theme.onPrimary} size="small" /> : <Text style={[styles.btnText, { color: theme.onPrimary }]}>Save</Text>}</TouchableOpacity>
              <TouchableOpacity onPress={() => { setGenerated(null); toast.info('Cleared'); }} style={[styles.btn, { backgroundColor: palette.outline, paddingHorizontal: 12 }]}><Ionicons name="refresh-outline" size={16} color={palette.text} /></TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
      {lessonFullscreenEnabled && (
        <LessonGenerationFullscreen
          visible={showFullscreenLesson && (pending || !!generatedContentText)}
          isGenerating={pending}
          progress={progressContractEnabled ? safeProgress : 0}
          phase={progressPhase}
          progressMessage={progressMessage}
          plan={parsedLessonPlan}
          rawContent={generatedContentText || generated?.description || ''}
          supplementarySections={[]}
          onCancel={pending ? onCancel : undefined}
          onClose={() => {
            if (pending) {
              onCancel();
            }
            setShowFullscreenLesson(false);
          }}
          footerActions={
            pending
              ? undefined
              : [
                  { label: 'Save', onPress: onSave, disabled: saving, tone: 'primary' as const },
                  { label: 'PDF', onPress: onExportPDF, tone: 'secondary' as const },
                  {
                    label: 'Clear',
                    onPress: () => {
                      setGenerated(null);
                      setShowFullscreenLesson(false);
                    },
                    tone: 'danger' as const,
                  },
                ]
          }
        />
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, marginTop: 16 },
  quickModeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  quickModeTextWrap: { flex: 1 },
  quickModeText: { fontSize: 12, fontWeight: '700' },
  quickModeSubText: { fontSize: 11, marginTop: 3, lineHeight: 16 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  headerText: { fontSize: 14, fontWeight: '700' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  actionBtnText: { fontSize: 12, marginLeft: 6, fontWeight: '600' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '600' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'transparent' },
  resultViewToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  resultViewPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultCardsWrap: { gap: 8 },
  resultCardItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  resultCardTitle: { fontSize: 12, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  resultCardBody: { fontSize: 13, lineHeight: 20 },
  btn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  btnText: { fontWeight: '700' },
});
