/**
 * Preschool AI Lesson Generator
 * Creates age-appropriate lesson plans with teaching insights and take-home activities.
 * Specifically designed for preschool teachers at Young Eagles and similar preschools.
 * @module app/screens/preschool-lesson-generator
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, TextInput, Share, Platform } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { logger } from '@/lib/logger';
import { LinearGradient } from 'expo-linear-gradient';

const TAG = 'PreschoolLessonGenerator';

// Conditional import for markdown rendering on native
const isWeb = Platform.OS === 'web';
let Markdown: React.ComponentType<any> | null = null;
if (!isWeb) {
  try {
    Markdown = require('react-native-markdown-display').default;
  } catch (e) {
    console.warn('[PreschoolLessonGenerator] Markdown not available:', e);
  }
}

import { assertSupabase } from '@/lib/supabase';
import { LessonGeneratorService } from '@/lib/ai/lessonGenerator';
import { setPreferredModel } from '@/lib/ai/preferences';
import { useSimplePullToRefresh } from '@/hooks/usePullToRefresh';
import { useLessonGeneratorModels, useTierInfo } from '@/hooks/useAIModelSelection';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ModelInUseIndicator } from '@/components/ai/ModelInUseIndicator';
import { ModelSelectorChips } from '@/components/ai/ModelSelectorChips';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/ToastProvider';
import { EducationalPDFService } from '@/lib/services/EducationalPDFService';
import { QuotaBar } from '@/components/ai-lesson-generator';
import { getFeatureFlagsSync } from '@/lib/featureFlags';
import { getCombinedUsage, incrementUsage, logUsageEvent } from '@/lib/ai/usage';
import { SuccessModal } from '@/components/ui/SuccessModal';
import { canUseFeature, getQuotaStatus } from '@/lib/ai/limits';
import { track } from '@/lib/analytics';
import { formatAIGatewayErrorMessage, invokeAIGatewayWithRetry } from '@/lib/ai-gateway/invokeWithRetry';
import { parseLessonPlanResponse } from '@/lib/ai/parseLessonPlan';
import type { LessonPlanV2 } from '@/lib/ai/lessonPlanSchema';
import { LessonGenerationFullscreen } from '@/components/ai-lesson-generator';
import { clampPercent, percentWidth } from '@/lib/progress/clampPercent';
import {
  buildQuickLessonThemeHint,
  loadQuickLessonThemeContext,
  summarizeQuickLessonContext,
  type QuickLessonThemeContext,
} from '@/lib/lesson-planning/quickLessonThemeContext';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Preschool-specific constants
const AGE_GROUPS = [
  { id: 'toddlers', label: 'Toddlers (1-2 years)', ageRange: '1-2', description: 'Early exploration and sensory play' },
  { id: 'preschool', label: 'Preschool (3-4 years)', ageRange: '3-4', description: 'Building foundational skills' },
  { id: 'prek', label: 'Pre-K (4-5 years)', ageRange: '4-5', description: 'Preparing for kindergarten' },
  { id: 'kindergarten', label: 'Kindergarten (5-6 years)', ageRange: '5-6', description: 'School readiness' },
];

const PRESCHOOL_SUBJECTS = [
  { id: 'colors', label: '🎨 Colors & Art', icon: 'color-palette', description: 'Color recognition, mixing, art activities' },
  { id: 'shapes', label: '🔷 Shapes & Patterns', icon: 'shapes', description: 'Shape identification, patterns, spatial awareness' },
  { id: 'numbers', label: '🔢 Numbers & Counting', icon: 'calculator', description: 'Counting, number recognition, basic math concepts' },
  { id: 'letters', label: '🔤 Letters & Sounds', icon: 'text', description: 'Letter recognition, phonics, early literacy' },
  { id: 'nature', label: '🌿 Nature & Science', icon: 'leaf', description: 'Plants, animals, weather, simple experiments' },
  { id: 'social', label: '🤝 Social Skills', icon: 'people', description: 'Sharing, emotions, friendship, manners' },
  { id: 'motor', label: '🏃 Motor Skills', icon: 'body', description: 'Fine and gross motor development' },
  { id: 'music', label: '🎵 Music & Movement', icon: 'musical-notes', description: 'Songs, rhythm, dance, instruments' },
  { id: 'storytime', label: '📚 Storytime & Language', icon: 'book', description: 'Story comprehension, vocabulary, speaking' },
  { id: 'sensory', label: '👐 Sensory Play', icon: 'hand-left', description: 'Texture exploration, sensory bins, tactile learning' },
  { id: 'ai', label: '🤖 AI & Technology', icon: 'sparkles', description: 'Simple AI concepts, age-appropriate technology exploration' },
  { id: 'robotics', label: '🤖 Robotics', icon: 'hardware-chip', description: 'Robot movements, basic programming concepts, sequencing' },
  { id: 'computer_literacy', label: '💻 Computer Literacy', icon: 'laptop', description: 'Keyboard, mouse, basic apps, online safety' },
];

const DURATION_OPTIONS = [
  { value: '15', label: '15 min', description: 'Quick activity' },
  { value: '20', label: '20 min', description: 'Short lesson' },
  { value: '30', label: '30 min', description: 'Standard lesson' },
  { value: '45', label: '45 min', description: 'Extended lesson' },
];

type LanguageCode = 'en' | 'af' | 'zu' | 'st';

const resolveSubjectId = (value: string): string | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  const direct = PRESCHOOL_SUBJECTS.find((subject) => subject.id === normalized);
  if (direct) return direct.id;
  const byLabel = PRESCHOOL_SUBJECTS.find((subject) =>
    subject.label.toLowerCase().includes(normalized),
  );
  return byLabel?.id || null;
};

interface GeneratedContent {
  lesson: string;
  insights: string;
  homework: string;
}

export default function PreschoolLessonGeneratorScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { showAlert, alertProps } = useAlertModal();
  const params = useLocalSearchParams<{
    mode?: string;
    topic?: string;
    subject?: string;
    ageGroup?: string;
    duration?: string;
    objectives?: string;
    routineContext?: string;
  }>();
  const modeParam = Array.isArray(params?.mode) ? params.mode[0] : params?.mode;
  const isQuickMode = modeParam === 'quick';
  const quickDefaultsApplied = useRef(false);
  const palette = useMemo(() => ({
    bg: theme.background,
    text: theme.text,
    textSec: theme.textSecondary,
    outline: theme.border,
    surface: theme.surface,
    primary: theme.primary,
    accent: theme.accent,
  }), [theme]);

  // Markdown styles for rendering generated content
  const markdownStyles = useMemo(() => ({
    body: {
      color: theme.text,
      fontSize: 14,
      lineHeight: 22,
    },
    heading1: {
      color: '#FF6B6B',
      fontSize: 20,
      fontWeight: '700' as const,
      marginTop: 16,
      marginBottom: 8,
    },
    heading2: {
      color: theme.primary,
      fontSize: 17,
      fontWeight: '600' as const,
      marginTop: 12,
      marginBottom: 6,
    },
    heading3: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '600' as const,
      marginTop: 10,
      marginBottom: 4,
    },
    paragraph: {
      marginBottom: 8,
    },
    strong: {
      fontWeight: '700' as const,
      color: theme.text,
    },
    em: {
      fontStyle: 'italic' as const,
    },
    bullet_list: {
      marginLeft: 8,
    },
    ordered_list: {
      marginLeft: 8,
    },
    list_item: {
      marginBottom: 4,
    },
    code_inline: {
      backgroundColor: theme.surface,
      padding: 2,
      borderRadius: 4,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 13,
    },
    fence: {
      backgroundColor: theme.surface,
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
    },
    blockquote: {
      backgroundColor: theme.surface,
      borderLeftColor: '#FF6B6B',
      borderLeftWidth: 4,
      paddingLeft: 12,
      marginLeft: 0,
    },
    hr: {
      backgroundColor: theme.border,
      height: 1,
      marginVertical: 12,
    },
  }), [theme]);

  // Form state
  const [topic, setTopic] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string | null>(null);
  const [duration, setDuration] = useState('30');
  const [includeHomework, setIncludeHomework] = useState(true);
  const [includeInsights, setIncludeInsights] = useState(true);
  const [language, setLanguage] = useState<LanguageCode>('en');
  
  // Generation state
  const [generated, setGenerated] = useState<GeneratedContent | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState<'idle' | 'init' | 'quota_check' | 'request' | 'parse' | 'complete'>('idle');
  const [progressMessage, setProgressMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'lesson' | 'insights' | 'homework'>('lesson');
  const [showSaveSuccessModal, setShowSaveSuccessModal] = useState(false);
  const [showFullscreenLesson, setShowFullscreenLesson] = useState(false);
  const [quickLessonContext, setQuickLessonContext] = useState<QuickLessonThemeContext | null>(null);
  const [quickLessonContextLoading, setQuickLessonContextLoading] = useState(false);
  const [explicitRoutineContext, setExplicitRoutineContext] = useState('');
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Usage state
  const [usage, setUsage] = useState({ lesson_generation: 0 });
  const [quotaStatus, setQuotaStatus] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  
  const { availableModels, selectedModel, setSelectedModel, isLoading: modelsLoading } = useLessonGeneratorModels();
  const { tierInfo } = useTierInfo();
  
  const isQuotaExhausted = Boolean(quotaStatus && quotaStatus.limit !== -1 && quotaStatus.used >= quotaStatus.limit);
  const AI_ENABLED = process.env.EXPO_PUBLIC_AI_ENABLED === 'true' || process.env.EXPO_PUBLIC_ENABLE_AI_FEATURES === 'true';
  const flags = getFeatureFlagsSync();
  const progressContractEnabled = flags.progress_contract_v1 !== false;
  const lessonFullscreenEnabled = flags.lesson_fullscreen_v1 !== false;

  const categoriesQuery = useQuery({
    queryKey: ['lesson_categories'],
    queryFn: async () => {
      const { data, error } = await assertSupabase().from('lesson_categories').select('id,name');
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    staleTime: 60_000,
  });

  // Load initial usage
  useEffect(() => {
    (async () => {
      const u = await getCombinedUsage();
      setUsage({ lesson_generation: u.lesson_generation });
      try {
        const s = await getQuotaStatus('lesson_generation');
        setQuotaStatus(s);
      } catch (err) {
        console.warn('[PreschoolLessonGenerator] Failed to load quota:', err);
      }
    })();
  }, []);

  const refreshUsage = useCallback(async () => {
    const u = await getCombinedUsage();
    setUsage({ lesson_generation: u.lesson_generation });
    try {
      const s = await getQuotaStatus('lesson_generation');
      setQuotaStatus(s);
    } catch { /* non-fatal */ }
  }, []);

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const startProgressTimer = useCallback((minIncrement: number, maxIncrement: number, intervalMs: number) => {
    clearProgressTimer();
    progressTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        const next = Math.min(prev + (Math.random() * (maxIncrement - minIncrement) + minIncrement), 90);
        if (next < 20) setProgressMessage('Preparing lesson structure...');
        else if (next < 40) setProgressMessage('Creating activities...');
        else if (next < 60) setProgressMessage('Generating teaching insights...');
        else if (next < 80) setProgressMessage('Designing take-home activity...');
        else setProgressMessage('Finalizing...');
        return next;
      });
    }, intervalMs);
  }, [clearProgressTimer]);

  useEffect(() => {
    return () => {
      clearProgressTimer();
    };
  }, [clearProgressTimer]);

  const { refreshing, onRefreshHandler } = useSimplePullToRefresh(refreshUsage, 'preschool_lesson_generator');

  const selectedSubjectInfo = PRESCHOOL_SUBJECTS.find(s => s.id === selectedSubject);
  const selectedAgeGroupInfo = AGE_GROUPS.find(a => a.id === selectedAgeGroup);
  const schoolId = profile?.organization_id || profile?.preschool_id || null;

  useEffect(() => {
    const topicParam = String(params?.topic || '').trim();
    const subjectParam = String(params?.subject || '').trim();
    const ageGroupParam = String(params?.ageGroup || '').trim();
    const durationParam = String(params?.duration || '').trim();
    const objectivesParam = String(params?.objectives || '').trim();
    const routineContextParam = String(params?.routineContext || '').trim();

    if (topicParam) setTopic(topicParam);

    const subjectId = resolveSubjectId(subjectParam);
    if (subjectId) setSelectedSubject(subjectId);

    if (ageGroupParam && AGE_GROUPS.some((age) => age.id === ageGroupParam)) {
      setSelectedAgeGroup(ageGroupParam);
    }
    if (durationParam && /^\d+$/.test(durationParam)) {
      setDuration(durationParam);
    }
    if (objectivesParam) {
      setTopic((prev) => (prev.trim() ? prev : objectivesParam));
    }
    if (routineContextParam) {
      setExplicitRoutineContext(routineContextParam);
    }
  }, [params]);

  useEffect(() => {
    if (!isQuickMode || quickDefaultsApplied.current) return;
    if (!selectedAgeGroup) setSelectedAgeGroup('preschool');
    if (!selectedSubject) setSelectedSubject('letters');
    setDuration('15');
    setIncludeHomework(false);
    quickDefaultsApplied.current = true;
  }, [isQuickMode, selectedAgeGroup, selectedSubject]);

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

  const buildPrompt = useCallback(() => {
    const durationNum = parseInt(duration, 10) || 30;
    const subjectLabel = selectedSubjectInfo?.label.replace(/^[^\s]+\s/, '') || 'General';
    const ageLabel = selectedAgeGroupInfo?.label || 'Preschool (3-4 years)';
    const ageRange = selectedAgeGroupInfo?.ageRange || '3-4';
    const topicStr = topic.trim() || 'age-appropriate activity';
    const isSTEMSubject = selectedSubject === 'ai' || selectedSubject === 'robotics' || selectedSubject === 'computer_literacy';
    const quickModeNote = isQuickMode
      ? '\n\n**QUICK LESSON MODE:** Create a low-prep, high-engagement lesson that fits within the time limit. Use minimal materials, clear transitions, and simple instructions.'
      : '';
    const planningHint = buildQuickLessonThemeHint(quickLessonContext);
    const routineHint = explicitRoutineContext
      ? `\n**ROUTINE EXECUTION CONTEXT (MUST ALIGN):**\n${explicitRoutineContext}`
      : '';
    
    let prompt = `You are a highly experienced early childhood educator and curriculum specialist creating an engaging, developmentally appropriate preschool lesson plan. Your expertise spans child development, educational psychology, and hands-on learning methodologies.${quickModeNote}

**LESSON REQUIREMENTS:**
- Topic: ${topicStr}
- Subject Area: ${subjectLabel}
- Age Group: ${ageLabel} (ages ${ageRange})
- Duration: ${duration} minutes
- Language: ${language === 'af' ? 'Afrikaans' : language === 'zu' ? 'Zulu' : language === 'st' ? 'Sesotho' : 'English'}
${isSTEMSubject ? `- STEM Focus: ${selectedSubject === 'ai' ? 'Age-appropriate Artificial Intelligence concepts through play and discovery' : selectedSubject === 'robotics' ? 'Robotics and sequencing through movement and simple programming' : 'Digital literacy and computer basics for young learners'}` : ''}
${planningHint ? `\n**SCHOOL PLANNING ALIGNMENT (MUST FOLLOW):**\n${planningHint}` : ''}${routineHint}

**CRITICAL GUIDELINES FOR HIGH-QUALITY PRESCHOOL LESSONS:**\n\n**Age-Appropriate Design:**\n- Use simple, concrete language and concepts children can understand\n- Design activities that match developmental milestones for ages ${ageRange}\n- Consider attention spans: ${selectedAgeGroup === 'toddlers' ? '2-5 minutes per activity with frequent transitions' : selectedAgeGroup === 'preschool' ? '5-10 minutes per activity with engaging variety' : selectedAgeGroup === 'prek' ? '10-15 minutes per activity with structured progression' : '10-20 minutes per activity with clear objectives'}\n- Include multiple learning modalities (visual, auditory, kinesthetic, tactile)\n\n**Engagement & Learning:**\n- Start with a captivating hook or story element to grab attention\n- Include hands-on, sensory-rich activities that children can touch, see, and manipulate\n- Incorporate movement, songs, or rhymes to maintain engagement\n- Use repetition and reinforcement of key concepts throughout\n- Add social interaction opportunities for peer learning\n- Include reflection and discussion moments\n\n**Practical Implementation:**\n- Provide clear, step-by-step instructions teachers can easily follow\n- Specify exact materials needed with common classroom alternatives\n- Include timing estimates for each activity section\n- Add smooth transitions between activities with clear cues\n- Consider classroom management tips for group activities\n- Include adaptations for different learning needs and abilities\n${selectedSubject === 'ai' ? `\n**AI-SPECIFIC GUIDELINES:**\n- Introduce AI as "smart helpers" or "learning machines"\n- Use simple analogies (like teaching a robot to recognize shapes)\n- Focus on pattern recognition through games\n- Include activities like sorting, matching, and predicting\n- Emphasize that AI learns from examples (like children do)\n- Keep concepts concrete and visual` : ''}${selectedSubject === 'robotics' ? `\n**ROBOTICS-SPECIFIC GUIDELINES:**\n- Introduce robots as helpers and friends\n- Focus on movement sequences (forward, backward, turn left/right)\n- Use simple programming concepts through physical movement\n- Include activities like "programming" a friend to move\n- Emphasize sequencing and following instructions\n- Use building blocks or simple robot toys if available` : ''}${selectedSubject === 'computer_literacy' ? `\n**COMPUTER LITERACY-SPECIFIC GUIDELINES:**\n- Introduce basic computer parts (screen, keyboard, mouse)\n- Focus on mouse control through simple games\n- Teach keyboard basics (finding letters, numbers)\n- Include online safety basics (asking before clicking)\n- Use age-appropriate apps and games\n- Emphasize taking breaks and screen time limits` : ''}\n\n**FORMAT YOUR RESPONSE EXACTLY AS FOLLOWS:**\n\n## 📚 LESSON PLAN: [Create an engaging, descriptive title related to ${topicStr}]\n\n### Learning Objectives\n- [List 3-4 specific, measurable learning objectives that children will achieve]\n- [Focus on skills like: identifying, naming, sorting, creating, demonstrating, etc.]\n- [Ensure objectives match the ${ageRange} age group developmental stage]\n\n### Materials Needed\n**Primary Materials:**\n- [List 5-8 essential materials with specific quantities when relevant]\n- [Include both purchased and DIY/recyclable options]\n\n**Optional Extensions:**\n- [2-3 additional materials for extended activities]\n\n### Opening Circle Time (${Math.floor(durationNum * 0.15)} minutes)\n**Hook Activity:**\n- [Captivating opening - story, song, mystery box, or dramatic element]\n- [Clear connection to the lesson topic]\n- [Engagement questions to activate prior knowledge]\n\n### Main Learning Activities (${Math.floor(durationNum * 0.6)} minutes)\n**Activity 1: [Descriptive Name] (${Math.floor(durationNum * 0.3)} minutes)**\n- **Setup:** [Brief preparation instructions]\n- **Instructions:** [Step-by-step process with 3-5 clear steps]\n- **Teacher Facilitation:** [Specific questions and prompts to guide learning]\n- **Learning Check:** [How to assess children are understanding]\n\n**Activity 2: [Descriptive Name] (${Math.floor(durationNum * 0.3)} minutes)**\n- **Setup:** [Brief preparation instructions]\n- **Instructions:** [Step-by-step process with 3-5 clear steps]\n- **Teacher Facilitation:** [Specific questions and prompts to guide learning]\n- **Learning Check:** [How to assess children are understanding]\n\n### Movement & Transition (${Math.floor(durationNum * 0.1)} minutes)\n- [Physical activity that reinforces learning concepts]\n- [Clear transition cues and instructions]\n- [Connection between movement and lesson theme]\n\n### Closing & Reflection (${Math.floor(durationNum * 0.15)} minutes)\n- [Review key concepts learned]\n- [Children share what they discovered or created]\n- [Preview of take-home activity or next steps]\n- [Closing song or ritual]\n\n---`;

    if (includeInsights) {
      prompt += `\n\n## 🔍 TEACHER INSIGHTS\n\nNow provide helpful teaching insights:\n\n### Developmental Focus\n- What skills are being developed\n- Milestones this activity targets\n\n### Differentiation Tips\n- How to simplify for struggling learners\n- How to extend for advanced learners\n\n### Common Challenges\n- Typical issues and solutions\n- Behavior management tips\n\n### Assessment Ideas\n- Informal ways to check understanding\n- Observation checklist items\n\n---`;
    }

    if (includeHomework) {
      prompt += `\n\n## 🏠 TAKE-HOME ACTIVITY (Homework)\n\nCreate a simple take-home activity for parents:\n\n### Activity Name\n[Fun, engaging name]\n\n### Parent Instructions\n[Clear, simple instructions parents can follow]\n[Maximum 3-4 steps]\n\n### Materials at Home\n[Only common household items]\n\n### Learning Connection\n[Brief explanation of what child is learning]\n\n### Conversation Starters\n[3 questions parents can ask their child about the activity]\n\n### Photo Opportunity\n[Suggest a photo moment to share with teacher]`;
    }

    prompt += `\n\nIMPORTANT OUTPUT CONTRACT (REQUIRED): Return ONLY valid JSON with no markdown, no prose, and no code fences.
Schema:
{
  "lessonPlan": {
    "title": "string",
    "summary": "string",
    "objectives": ["string"],
    "materials": ["string"],
    "steps": [
      {
        "title": "string",
        "minutes": 8,
        "objective": "string",
        "instructions": ["string"],
        "teacherPrompt": "string",
        "example": "string"
      }
    ],
    "assessment": ["string"],
    "differentiation": { "support": "string", "extension": "string" },
    "closure": "string",
    "durationMinutes": ${durationNum}
  },
  "teacherInsights": "string (optional)",
  "takeHomeActivity": "string (optional)"
}`;

    return prompt;
  }, [topic, selectedSubject, selectedAgeGroup, duration, language, includeInsights, includeHomework, selectedSubjectInfo, selectedAgeGroupInfo, isQuickMode, quickLessonContext, explicitRoutineContext]);

  const parsedLessonPlan: LessonPlanV2 | null = useMemo(() => {
    const lessonText = generated?.lesson?.trim();
    if (!lessonText) return null;
    try {
      return parseLessonPlanResponse(lessonText);
    } catch (error) {
      logger.warn(TAG, 'Failed to parse lesson plan to structured format', error);
      return null;
    }
  }, [generated?.lesson]);
  const supplementarySections = useMemo(() => {
    const sections: Array<{ title: string; body: string }> = [];
    if (generated?.insights?.trim()) {
      sections.push({ title: 'Teacher Insights', body: generated.insights.trim() });
    }
    if (generated?.homework?.trim()) {
      sections.push({ title: 'Take-Home Activity', body: generated.homework.trim() });
    }
    return sections;
  }, [generated?.homework, generated?.insights]);
  const combinedGeneratedContent = useMemo(() => {
    if (!generated) return '';
    return [generated.lesson, generated.insights, generated.homework]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join('\n\n');
  }, [generated]);
  const safeProgress = clampPercent(progress, {
    source: 'app/screens/preschool-lesson-generator.progress',
  });
  const showInlineProgress = pending && !lessonFullscreenEnabled;
  const showInlineGenerated = !!generated && !lessonFullscreenEnabled;

  useEffect(() => {
    if (!lessonFullscreenEnabled) return;
    if (pending || generated?.lesson) {
      setShowFullscreenLesson(true);
    }
  }, [generated?.lesson, lessonFullscreenEnabled, pending]);

  const handleGenerate = useCallback(async () => {
    if (isQuotaExhausted) {
      router.push('/pricing');
      return;
    }
    
    if (!selectedSubject) {
      showAlert({ title: 'Select Subject', message: 'Please select a subject area for your lesson.', type: 'warning' });
      return;
    }
    
    if (!selectedAgeGroup) {
      showAlert({ title: 'Select Age Group', message: 'Please select an age group for your lesson.', type: 'warning' });
      return;
    }

    try {
      setPending(true);
      setProgress(0);
      setProgressPhase('init');
      setProgressMessage('Initializing...');
      setErrorMsg(null);
      setGenerated(null);
      if (lessonFullscreenEnabled) {
        setShowFullscreenLesson(true);
      }

      if (!AI_ENABLED || flags.ai_lesson_generation === false) {
        toast.warn('AI Lesson Generator is disabled.');
        return;
      }

      if (progressContractEnabled) {
        startProgressTimer(2, 6, 500);
      }

      // Check quota
      setProgressPhase('quota_check');
      setProgress(12);
      setProgressMessage('Checking quota...');
      let gate: { allowed: boolean } | null = null;
      try {
        gate = await canUseFeature('lesson_generation', 1);
      } catch {
        gate = { allowed: true };
      }

      if (!gate?.allowed) {
        clearProgressTimer();
        const status = await getQuotaStatus('lesson_generation');
        showAlert({
          title: 'Monthly limit reached',
          message: `You have used ${status.used} of ${status.limit} generations.`,
          type: 'warning',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'See plans', onPress: () => router.push('/pricing') },
          ]
        });
        return;
      }

      track('edudash.ai.preschool_lesson.generate_started', { subject: selectedSubject, ageGroup: selectedAgeGroup });
      setProgressPhase('request');
      setProgress(28);
      setProgressMessage('Preparing request...');

      const prompt = buildPrompt();
      const isSTEMSubject = selectedSubject === 'ai' || selectedSubject === 'robotics' || selectedSubject === 'computer_literacy';
      const stemCategory = selectedSubject === 'ai' ? 'ai' : selectedSubject === 'robotics' ? 'robotics' : selectedSubject === 'computer_literacy' ? 'computer_literacy' : 'none';
      
      const payload = {
        action: 'lesson_generation',
        prompt,
        topic: topic || 'Preschool Activity',
        subject: selectedSubjectInfo?.label || 'General',
        gradeLevel: 0, // Preschool
        duration: Number(duration) || 30,
        objectives: [],
        language: language || 'en',
        model: selectedModel || process.env.EXPO_PUBLIC_ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        isPreschool: true,
        ageGroup: selectedAgeGroup,
        includeHomework,
        includeInsights,
        stemCategory: stemCategory,
        lessonType: isSTEMSubject ? (selectedSubject === 'ai' ? 'ai_enhanced' : selectedSubject === 'robotics' ? 'robotics' : 'computer_literacy') : 'standard',
      };

      if (progressContractEnabled) {
        startProgressTimer(4, 8, 450);
      }

      const { data, error } = await invokeAIGatewayWithRetry(payload, {
        retries: 1,
        retryDelayMs: 1200,
      });

      clearProgressTimer();
      setProgress(95);
      setProgressPhase('parse');
      setProgressMessage('Processing results...');

      if (error) {
        throw new Error(formatAIGatewayErrorMessage(error, 'Failed to generate preschool lesson.'));
      }

      const content = data?.content || '';
      setProgress(100);
      setProgressPhase('complete');
      setProgressMessage('Complete!');

      // Debug: Log raw content for troubleshooting
      logger.debug(TAG, 'Raw content length:', content.length);
      logger.debug(TAG, 'Content preview:', content.substring(0, 200));

      // Parse sections from generated content with more flexible matching
      // Match lesson plan section (various emoji/heading variations)
      const lessonMatch = content.match(/##\s*📚?\s*LESSON\s*PLAN[\s\S]*?(?=##\s*🔍?\s*TEACHER|##\s*🏠?\s*TAKE[-\s]?HOME|$)/i);
      const insightsMatch = content.match(/##\s*🔍?\s*TEACHER\s*INSIGHTS[\s\S]*?(?=##\s*🏠?\s*TAKE[-\s]?HOME|$)/i);
      const homeworkMatch = content.match(/##\s*🏠?\s*TAKE[-\s]?HOME[\s\S]*$/i);
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
      let jsonPayload: Record<string, unknown> | null = null;
      try {
        const candidate = (jsonMatch?.[1] || content).trim();
        if (candidate.startsWith('{') || candidate.startsWith('[')) {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === 'object') {
            jsonPayload = parsed as Record<string, unknown>;
          }
        }
      } catch {
        jsonPayload = null;
      }

      // Fallback: If no structured sections found, treat entire content as lesson
      const parsedLesson = lessonMatch ? lessonMatch[0].trim() : content.trim();
      const parsedInsights = insightsMatch
        ? insightsMatch[0].trim()
        : String(jsonPayload?.teacherInsights || '').trim();
      const parsedHomework = homeworkMatch
        ? homeworkMatch[0].trim()
        : String(jsonPayload?.takeHomeActivity || '').trim();

      logger.debug(TAG, 'Parsed sections:', {
        lessonLength: parsedLesson.length,
        insightsLength: parsedInsights.length,
        homeworkLength: parsedHomework.length,
      });

      setGenerated({
        lesson: parsedLesson || 'Lesson content could not be parsed. Please try generating again.',
        insights: parsedInsights,
        homework: parsedHomework,
      });

      // Track usage
      try {
        await incrementUsage('lesson_generation', 1);
        await logUsageEvent({
          feature: 'lesson_generation',
          model: String(payload.model),
          tokensIn: data?.usage?.input_tokens || 0,
          tokensOut: data?.usage?.output_tokens || 0,
          estCostCents: data?.cost || 0,
          timestamp: new Date().toISOString(),
        });
      } catch (usageError) {
        console.error('[PreschoolLessonGenerator] Failed to track usage:', usageError);
      }

      await refreshUsage();
      toast.success('Lesson generated!');
      track('edudash.ai.preschool_lesson.generate_completed', { subject: selectedSubject, ageGroup: selectedAgeGroup });

    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Please try again';
      track('edudash.ai.preschool_lesson.generate_failed', { error: message });
      setErrorMsg(message);
      toast.error(`Generation failed: ${message}`);
    } finally {
      clearProgressTimer();
      setPending(false);
      setProgress(0);
      setProgressPhase('idle');
      setProgressMessage('');
    }
  }, [
    AI_ENABLED,
    buildPrompt,
    clearProgressTimer,
    duration,
    flags,
    includeHomework,
    includeInsights,
    isQuotaExhausted,
    language,
    lessonFullscreenEnabled,
    progressContractEnabled,
    refreshUsage,
    selectedAgeGroup,
    selectedModel,
    selectedSubject,
    selectedSubjectInfo,
    startProgressTimer,
    topic,
  ]);

  const onSave = useCallback(async () => {
    if (!generated?.lesson) {
      toast.warn('Generate a lesson first');
      return;
    }
    
    try {
      setSaving(true);
      const { data: auth } = await assertSupabase().auth.getUser();
      const { data: teacherProfile } = await assertSupabase()
        .from('profiles')
        .select('id,preschool_id,organization_id')
        .or(`id.eq.${auth?.user?.id || ''},auth_user_id.eq.${auth?.user?.id || ''}`)
        .maybeSingle();
        
      if (!teacherProfile) {
        toast.error('Not signed in');
        return;
      }
      
      const schoolId = teacherProfile.preschool_id || teacherProfile.organization_id;
      
      // Get or create a default category if none exists
      let categoryId = categoriesQuery.data?.[0]?.id;
      if (!categoryId) {
        // Try to create a default category
        const { data: newCat, error: catError } = await assertSupabase()
          .from('lesson_categories')
          .insert({ name: 'Preschool', description: 'Preschool lessons and activities' })
          .select('id')
          .single();
        
        if (catError) {
          console.error('[PreschoolLessonGen] Failed to create category:', catError);
          toast.warn('Could not create lesson category. Please contact support.');
          return;
        }
        categoryId = newCat.id;
        // Refresh categories query
        categoriesQuery.refetch();
      }

      // Combine all content for saving
      const fullDescription = [
        generated.lesson,
        generated.insights ? `\n---\n${generated.insights}` : '',
        generated.homework ? `\n---\n${generated.homework}` : '',
      ].filter(Boolean).join('\n');

      const res = await LessonGeneratorService.saveGeneratedLesson({
        lesson: {
          title: `${selectedSubjectInfo?.label || 'Activity'}: ${topic || 'Preschool Lesson'}`,
          description: fullDescription,
          content: generated.lesson,
        },
        teacherId: teacherProfile.id,
        preschoolId: schoolId || teacherProfile.id, // Fallback to teacher ID if no school
        ageGroupId: selectedAgeGroup || 'preschool',
        categoryId,
        template: { duration: Number(duration) || 30, complexity: 'moderate' },
        isPublished: true,
        subject: selectedSubject || 'general',
      });

      if (!res.success) {
        toast.error(`Save failed: ${res.error || 'Unknown error'}`);
        return;
      }

      toast.success(`Lesson saved! View in My Lessons`);
      track('edudash.ai.preschool_lesson.saved', { lessonId: res.lessonId });
      
      // Show custom success modal instead of Alert.alert
      setShowSaveSuccessModal(true);
    } catch (e: unknown) {
      toast.error(`Save error: ${e instanceof Error ? e.message : 'Failed'}`);
    } finally {
      setSaving(false);
    }
  }, [generated, categoriesQuery, selectedSubjectInfo, topic, selectedAgeGroup, duration, selectedSubject]);

  const onShareHomework = useCallback(async () => {
    if (!generated?.homework) {
      toast.warn('Generate a lesson with homework first');
      return;
    }

    try {
      const shareContent = `📚 Take-Home Activity from ${profile?.first_name || 'Teacher'}\n\n${generated.homework}\n\n---\nFrom EduDash Pro - Young Eagles`;
      
      await Share.share({
        message: shareContent,
        title: 'Take-Home Activity',
      });
      
      track('edudash.ai.preschool_lesson.homework_shared', {});
    } catch (error) {
      console.error('Share failed:', error);
    }
  }, [generated?.homework, profile?.first_name]);

  const onExportPDF = useCallback(async () => {
    if (!generated?.lesson) {
      showAlert({ title: 'Export PDF', message: 'Generate a lesson first.', type: 'info' });
      return;
    }

    try {
      const fullContent = [
        generated.lesson,
        generated.insights ? `\n\n${generated.insights}` : '',
        generated.homework ? `\n\n${generated.homework}` : '',
      ].join('');

      await EducationalPDFService.generateTextPDF(
        `${selectedSubjectInfo?.label || 'Lesson'}: ${topic || 'Preschool Activity'}`,
        fullContent
      );
      toast.success('PDF generated');
    } catch {
      toast.error('Failed to generate PDF');
    }
  }, [generated, selectedSubjectInfo, topic]);

  const renderSubjectButton = (subject: typeof PRESCHOOL_SUBJECTS[0]) => {
    const isSelected = selectedSubject === subject.id;
    return (
      <TouchableOpacity
        key={subject.id}
        style={[
          styles.subjectButton,
          {
            backgroundColor: isSelected ? theme.primary + '20' : palette.surface,
            borderColor: isSelected ? theme.primary : palette.outline,
          },
        ]}
        onPress={() => setSelectedSubject(subject.id)}
      >
        <Ionicons
          name={subject.icon as any}
          size={20}
          color={isSelected ? theme.primary : palette.textSec}
        />
        <Text style={[styles.subjectLabel, { color: isSelected ? theme.primary : palette.text }]}>
          {subject.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderAgeGroupButton = (ageGroup: typeof AGE_GROUPS[0]) => {
    const isSelected = selectedAgeGroup === ageGroup.id;
    return (
      <TouchableOpacity
        key={ageGroup.id}
        style={[
          styles.ageGroupButton,
          {
            backgroundColor: isSelected ? theme.accent + '20' : palette.surface,
            borderColor: isSelected ? theme.accent : palette.outline,
          },
        ]}
        onPress={() => setSelectedAgeGroup(ageGroup.id)}
      >
        <Text style={[styles.ageGroupLabel, { color: isSelected ? theme.accent : palette.text }]}>
          {ageGroup.label}
        </Text>
        <Text style={[styles.ageGroupDesc, { color: palette.textSec }]}>
          {ageGroup.description}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <ScreenHeader
        title="Preschool Lesson Creator"
        subtitle="Create age-appropriate lessons with insights & homework"
        showBackButton
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
        <ModelInUseIndicator modelId={selectedModel} label="Using" showCostDots compact />
      </View>
      {/* Hero Badge */}
      <LinearGradient
        colors={['#FF6B6B', '#FF8E53']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.heroBadge}
      >
        <Ionicons name="sparkles" size={16} color="#FFF" />
        <Text style={styles.heroText}>Preschool Edition</Text>
        <View style={styles.heroStats}>
          <Text style={styles.heroStat}>{usage.lesson_generation} this month</Text>
        </View>
      </LinearGradient>
      {isQuickMode && (
        <View style={[styles.quickModeBanner, { backgroundColor: theme.primary + '20', borderColor: theme.primary }]}>
          <Ionicons name="flash" size={16} color={theme.primary} />
          <View style={styles.quickModeTextWrap}>
            <Text style={[styles.quickModeText, { color: theme.primary }]}>
              Quick Lesson Mode • 15 min • Low prep
            </Text>
            <Text style={[styles.quickModeSubText, { color: palette.textSec }]}>
              {quickLessonContextLoading
                ? 'Loading weekly planning alignment...'
                : summarizeQuickLessonContext(quickLessonContext)}
            </Text>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefreshHandler}
            tintColor="#FF6B6B"
          />
        }
      >
        {/* Subject Selection */}
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>📚 Choose Subject</Text>
          <View style={styles.subjectsGrid}>
            {PRESCHOOL_SUBJECTS.map(renderSubjectButton)}
          </View>
        </View>

        {/* Age Group Selection */}
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>👶 Select Age Group</Text>
          <View style={styles.ageGroupsContainer}>
            {AGE_GROUPS.map(renderAgeGroupButton)}
          </View>
        </View>

        {/* Topic & Duration */}
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>✏️ Lesson Details</Text>
          
          <Text style={[styles.label, { color: palette.textSec }]}>Topic (optional)</Text>
          <TextInput
            style={[styles.input, { color: palette.text, borderColor: palette.outline }]}
            value={topic}
            onChangeText={setTopic}
            placeholder={`e.g., ${selectedSubjectInfo?.description || 'Learning about colors'}`}
            placeholderTextColor={palette.textSec}
          />

          <Text style={[styles.label, { color: palette.textSec, marginTop: 12 }]}>Duration</Text>
          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.durationButton,
                  {
                    backgroundColor: duration === opt.value ? theme.primary + '20' : 'transparent',
                    borderColor: duration === opt.value ? theme.primary : palette.outline,
                  },
                ]}
                onPress={() => setDuration(opt.value)}
              >
                <Text style={[styles.durationLabel, { color: duration === opt.value ? theme.primary : palette.text }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Options */}
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>⚙️ Include</Text>
          
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setIncludeInsights(!includeInsights)}
          >
            <Ionicons
              name={includeInsights ? 'checkbox' : 'square-outline'}
              size={24}
              color={includeInsights ? theme.primary : palette.textSec}
            />
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleLabel, { color: palette.text }]}>🔍 Teaching Insights</Text>
              <Text style={[styles.toggleDesc, { color: palette.textSec }]}>
                Differentiation tips, assessment ideas, common challenges
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setIncludeHomework(!includeHomework)}
          >
            <Ionicons
              name={includeHomework ? 'checkbox' : 'square-outline'}
              size={24}
              color={includeHomework ? theme.primary : palette.textSec}
            />
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleLabel, { color: palette.text }]}>🏠 Take-Home Activity</Text>
              <Text style={[styles.toggleDesc, { color: palette.textSec }]}>
                Simple homework parents can do with their child
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Quota Bar */}
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.outline }]}>
          <Text style={{ color: palette.textSec }}>Monthly usage: {usage.lesson_generation} lessons</Text>
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

        {/* Generate Button */}
        <TouchableOpacity
          onPress={handleGenerate}
          style={[
            styles.generateButton,
            { backgroundColor: isQuotaExhausted ? '#9CA3AF' : '#FF6B6B' },
          ]}
          disabled={pending}
        >
          {pending ? (
            <EduDashSpinner color="#FFF" />
          ) : (
            <>
              <Ionicons name="sparkles" size={20} color="#FFF" />
              <Text style={styles.generateButtonText}>
                {isQuotaExhausted ? 'Upgrade Plan' : 'Generate Lesson'}
              </Text>
            </>
          )}
        </TouchableOpacity>
        {lessonFullscreenEnabled && !!generated?.lesson && (
          <TouchableOpacity
            onPress={() => setShowFullscreenLesson(true)}
            style={[
              styles.generateButton,
              {
                marginTop: 8,
                backgroundColor: theme.primary + '20',
                borderWidth: 1,
                borderColor: theme.primary,
              },
            ]}
          >
            <Ionicons name="expand-outline" size={18} color={theme.primary} />
            <Text style={[styles.generateButtonText, { color: theme.primary }]}>Open Fullscreen Lesson</Text>
          </TouchableOpacity>
        )}

        {/* Progress */}
        {showInlineProgress && (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: '#FF6B6B', marginTop: 16 }]}>
            <View style={styles.progressHeader}>
              <EduDashSpinner color="#FF6B6B" />
              <Text style={[styles.progressTitle, { color: '#FF6B6B' }]}>Generating...</Text>
            </View>
            <Text style={{ color: palette.textSec, fontSize: 13 }}>{progressMessage}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: percentWidth(safeProgress) }]} />
            </View>
            <Text style={[styles.progressPercent, { color: palette.textSec }]}>
              {Math.round(safeProgress)}% • {progressPhase.replace('_', ' ')}
            </Text>
          </View>
        )}

        {/* Error */}
        {errorMsg && !pending && (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: '#EF4444', borderWidth: 1, marginTop: 16 }]}>
            <View style={styles.errorHeader}>
              <Ionicons name="warning-outline" size={18} color="#EF4444" />
              <Text style={styles.errorTitle}>Generation Failed</Text>
            </View>
            <Text style={{ color: palette.textSec, fontSize: 13 }}>{errorMsg}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleGenerate}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Generated Content */}
        {showInlineGenerated && (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: '#10B981', borderWidth: 2, marginTop: 16 }]}>
            <View style={styles.successHeader}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={styles.successTitle}>Lesson Generated!</Text>
            </View>

            {/* Tabs */}
            <View style={styles.tabsContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'lesson' && styles.tabActive]}
                onPress={() => setActiveTab('lesson')}
              >
                <Text style={[styles.tabText, activeTab === 'lesson' && styles.tabTextActive]}>📚 Lesson</Text>
              </TouchableOpacity>
              {generated.insights && (
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'insights' && styles.tabActive]}
                  onPress={() => setActiveTab('insights')}
                >
                  <Text style={[styles.tabText, activeTab === 'insights' && styles.tabTextActive]}>🔍 Insights</Text>
                </TouchableOpacity>
              )}
              {generated.homework && (
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'homework' && styles.tabActive]}
                  onPress={() => setActiveTab('homework')}
                >
                  <Text style={[styles.tabText, activeTab === 'homework' && styles.tabTextActive]}>🏠 Homework</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Content */}
            <View style={[styles.contentScroll, { backgroundColor: palette.surface }]}>
              {(() => {
                const content = activeTab === 'lesson' ? generated.lesson :
                               activeTab === 'insights' ? generated.insights :
                               generated.homework;
                
                // Debug: ensure content exists
                if (!content || !content.trim()) {
                  return (
                    <Text style={[styles.generatedText, { color: palette.textSec }]}>
                      No content available for this section. Please try generating again.
                    </Text>
                  );
                }
                
                if (Markdown) {
                  return (
                    <Markdown style={markdownStyles}>
                      {content}
                    </Markdown>
                  );
                }
                
                return (
                  <Text style={[styles.generatedText, { color: palette.text }]}>
                    {content}
                  </Text>
                );
              })()}
            </View>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.primary }]}
                onPress={onSave}
                disabled={saving}
              >
                {saving ? (
                  <EduDashSpinner color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={16} color="#FFF" />
                    <Text style={styles.actionButtonText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>

              {generated.homework && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                  onPress={onShareHomework}
                >
                  <Ionicons name="share-social-outline" size={16} color="#FFF" />
                  <Text style={styles.actionButtonText}>Share Homework</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: palette.textSec }]}
                onPress={onExportPDF}
              >
                <Ionicons name="document-outline" size={16} color="#FFF" />
                <Text style={styles.actionButtonText}>PDF</Text>
              </TouchableOpacity>
            </View>
            
            {/* View Saved Lessons Button */}
            <TouchableOpacity
              style={[styles.viewLessonsButton, { backgroundColor: theme.primary + '15', borderColor: theme.primary }]}
              onPress={() => router.push('/screens/teacher-lessons')}
            >
              <Ionicons name="library-outline" size={18} color={theme.primary} />
              <Text style={[styles.viewLessonsButtonText, { color: theme.primary }]}>
                Browse All Lessons
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {lessonFullscreenEnabled && (
        <LessonGenerationFullscreen
          visible={showFullscreenLesson && (pending || !!generated?.lesson)}
          isGenerating={pending}
          progress={progressContractEnabled ? safeProgress : 0}
          phase={progressPhase}
          progressMessage={progressMessage}
          plan={parsedLessonPlan}
          rawContent={combinedGeneratedContent}
          supplementarySections={supplementarySections}
          onClose={() => setShowFullscreenLesson(false)}
          footerActions={
            pending
              ? undefined
              : [
                  { label: 'Save', onPress: onSave, disabled: saving, tone: 'primary' as const },
                  ...(generated?.homework
                    ? [{ label: 'Share Homework', onPress: onShareHomework, tone: 'secondary' as const }]
                    : []),
                  { label: 'PDF', onPress: onExportPDF, tone: 'secondary' as const },
                ]
          }
        />
      )}

      {/* Success Modal for Save */}
      <SuccessModal
        visible={showSaveSuccessModal}
        title="Lesson Saved!"
        message="Your lesson has been saved. Would you like to browse your lessons?"
        buttonText="Browse Lessons"
        secondaryButtonText="Stay Here"
        onSecondaryPress={() => setShowSaveSuccessModal(false)}
        onClose={() => {
          setShowSaveSuccessModal(false);
          router.push('/screens/teacher-lessons');
        }}
        icon="checkmark-circle"
        type="success"
      />
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  quickModeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginTop: 6,
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
  heroText: { color: '#FFF', fontWeight: '700', fontSize: 14, marginLeft: 6 },
  heroStats: { marginLeft: 'auto' },
  heroStat: { color: '#FFF', fontSize: 12, opacity: 0.9 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  subjectsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subjectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  subjectLabel: { fontSize: 12, fontWeight: '600' },
  ageGroupsContainer: { gap: 8 },
  ageGroupButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  ageGroupLabel: { fontSize: 14, fontWeight: '600' },
  ageGroupDesc: { fontSize: 11, marginTop: 2 },
  durationRow: { flexDirection: 'row', gap: 8 },
  durationButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  durationLabel: { fontSize: 13, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggleDesc: { fontSize: 12, marginTop: 2 },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  generateButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  progressHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  progressTitle: { fontWeight: '600', marginLeft: 8 },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: '#E5E7EB', marginTop: 8 },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#FF6B6B' },
  progressPercent: { fontSize: 11, textAlign: 'center', marginTop: 4 },
  errorHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  errorTitle: { color: '#EF4444', fontWeight: '600', marginLeft: 8 },
  retryButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
    alignSelf: 'flex-start',
  },
  retryButtonText: { color: '#EF4444', fontWeight: '600' },
  successHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  successTitle: { color: '#10B981', fontWeight: '700', fontSize: 16, marginLeft: 8 },
  tabsContainer: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F3F4F6' },
  tabActive: { backgroundColor: '#FF6B6B' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#FFF' },
  contentScroll: { 
    backgroundColor: '#F9FAFB', 
    borderRadius: 8, 
    padding: 12,
    minHeight: 200,
  },
  generatedText: { fontSize: 14, lineHeight: 22 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  viewLessonsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    gap: 8,
  },
  viewLessonsButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
