import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { Stack, router } from 'expo-router';
import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { useCapability } from '@/hooks/useCapability';
import { useRealtimeTier } from '@/hooks/useRealtimeTier';
import { useDashConversation, useSendMessage, useStartConversation } from '@/hooks/useDashConversation';
import { extractOrganizationId } from '@/lib/tenant/compat';
import { useOrganizationTerminology } from '@/lib/hooks/useOrganizationTerminology';
import { FormBuilderService } from '@/features/forms/services/FormBuilderService';
import type { FieldType, FormAudience, FormField } from '@/features/forms/types/form.types';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done';
}

const buildDashStudioPrompt = (guardianLabel: string, instructorLabel: string) => `You are Dash, the principal's AI advisor. Help design a school workflow without duplicating existing tools.
- Reuse existing modules: excursions, meetings, activities, lessons, calendar, announcements, POP review.
- Provide a concise plan: summary, steps, forms needed, notifications, and risks.
- Keep it brief and actionable.
- Use ${guardianLabel.toLowerCase()} and ${instructorLabel.toLowerCase()} terminology.`;

const buildDefaultTemplates = (guardianLabel: string, instructorLabel: string) => [
  { id: 'excursion', label: 'Plan an Excursion', hint: 'Consent, payment, transport, staffing' },
  { id: 'meeting', label: `Schedule a ${guardianLabel} Meeting`, hint: 'RSVP, agenda, reminders' },
  { id: 'activity', label: 'Launch a School Activity', hint: `${instructorLabel} tasks + ${guardianLabel.toLowerCase()} updates` },
  { id: 'workshop', label: `${guardianLabel} Workshop`, hint: 'Sign‑ups, materials, follow‑ups' },
];

type IoniconName = keyof typeof Ionicons.glyphMap;

interface ModuleLink {
  id: string;
  label: string;
  icon: IoniconName;
  route: Href;
}

const MODULE_LINKS: ModuleLink[] = [
  { id: 'excursions', label: 'Excursions', icon: 'bus', route: '/screens/principal-excursions' },
  { id: 'meetings', label: 'Meetings', icon: 'people', route: '/screens/principal-meetings' },
  { id: 'activities', label: 'Activities', icon: 'game-controller', route: '/screens/principal-activities' },
  { id: 'lessons', label: 'Lessons', icon: 'book', route: '/screens/teacher-lessons' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', route: '/screens/calendar-management' },
  { id: 'announcements', label: 'Announcements', icon: 'megaphone', route: '/screens/principal-announcement' },
  { id: 'pop-review', label: 'POP Review', icon: 'card', route: '/screens/pop-review' },
];

const SUBSCRIPTION_SETUP_ROUTE: Href = '/screens/subscription-setup';
const FORM_BUILDER_ROUTE: Href = '/screens/principal-form-builder';

const buildFallbackPlan = (prompt: string, guardianLabel: string, instructorLabel: string): string => {
  const lower = prompt.toLowerCase();
  const focus = lower.includes('excursion')
    ? 'Excursion'
    : lower.includes('meeting')
      ? 'Meeting'
      : lower.includes('lesson')
        ? 'Lesson'
        : lower.includes('activity')
          ? 'Activity'
          : 'School Workflow';

  return `Summary: ${focus} plan drafted with existing modules.\n\nSteps:\n1) Create the core item in its module (excursions/meetings/activities/lessons).\n2) Attach a consent/RSVP form and any payment requirements.\n3) Assign ${instructorLabel.toLowerCase()} and set reminders.\n4) Notify ${guardianLabel.toLowerCase()} and ${instructorLabel.toLowerCase()} with key dates.\n\nForms Needed:\n- Consent/RSVP form\n- Payment proof (if required)\n\nNotifications:\n- Immediate announcement\n- Reminder 72h before\n- Follow‑up on outstanding forms\n\nRisks to check:\n- Staff coverage\n- Budget limits\n- Transport availability`;
};

export default function DashStudioScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();
  const { can, ready, tier } = useCapability();
  const { tierStatus } = useRealtimeTier();
  const { profile } = useAuth();
  const { terminology } = useOrganizationTerminology();

  const canUseStudio = ready ? can('agent.workflows') : false;
  const organizationId = extractOrganizationId(profile);

  const [requestText, setRequestText] = useState('');
  const [advisorOutput, setAdvisorOutput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [isPlanning, setIsPlanning] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [isCreatingForm, setIsCreatingForm] = useState(false);

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAssistantIdRef = useRef<string | null>(null);

  const { data: conversation } = useDashConversation(conversationId);
  const { mutateAsync: startConversation } = useStartConversation();
  const { mutateAsync: sendMessage } = useSendMessage();

  const resetProgress = useCallback(() => {
    setProgressSteps([
      { id: 'understand', label: 'Understanding your request', status: 'active' },
      { id: 'map', label: 'Mapping to existing modules', status: 'pending' },
      { id: 'plan', label: 'Drafting plan + updates', status: 'pending' },
      { id: 'workflow', label: 'Preparing workflow + forms', status: 'pending' },
    ]);
  }, []);

  const stopTimers = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTimers();
    };
  }, [stopTimers]);

  const markProgressDone = useCallback(() => {
    setProgressSteps((prev) => prev.map((step) => ({ ...step, status: 'done' })));
  }, []);

  useEffect(() => {
    if (!conversation?.messages?.length) return;
    const assistant = [...conversation.messages].reverse().find((msg) => msg.type === 'assistant');
    if (!assistant || assistant.id === lastAssistantIdRef.current) return;

    lastAssistantIdRef.current = assistant.id;
    setAdvisorOutput(assistant.content);
    setStatusNote('Plan ready');
    setIsPlanning(false);
    markProgressDone();
    stopTimers();
  }, [conversation?.messages, markProgressDone, stopTimers]);

  const handleGeneratePlan = useCallback(async () => {
    if (!requestText.trim()) {
      showAlert({ title: 'Add a request', message: 'Describe what you want Dash to plan.', type: 'warning' });
      return;
    }
    if (!canUseStudio) {
      showAlert({ title: 'Premium Feature', message: 'Dash Studio is available on Premium/Pro tiers.', type: 'info' });
      return;
    }

    setIsPlanning(true);
    setStatusNote('Dash is working...');
    resetProgress();
    setAdvisorOutput('');

    let activeConversationId = conversationId;
    try {
      if (!activeConversationId) {
        activeConversationId = await startConversation({ title: 'Dash Studio Plan' });
        setConversationId(activeConversationId);
      }

    const fullPrompt = `${buildDashStudioPrompt(terminology.guardians, terminology.instructors)}\n\nRequest: ${requestText}`;
    await sendMessage({ conversationId: activeConversationId, content: fullPrompt });

      progressTimerRef.current = setInterval(() => {
        setProgressSteps((prev) => {
          const next = [...prev];
          const activeIndex = next.findIndex((step) => step.status === 'active');
          if (activeIndex === -1) return next;
          next[activeIndex] = { ...next[activeIndex], status: 'done' };
          if (activeIndex + 1 < next.length) {
            next[activeIndex + 1] = { ...next[activeIndex + 1], status: 'active' };
          }
          return next;
        });
      }, 2200);

      fallbackTimerRef.current = setTimeout(() => {
        if (!isPlanning) return;
        setAdvisorOutput(buildFallbackPlan(requestText, terminology.guardians, terminology.instructors));
        setStatusNote('Drafted by Dash (fallback)');
        setIsPlanning(false);
        markProgressDone();
      }, 15000);
    } catch (error) {
      stopTimers();
      setIsPlanning(false);
      setStatusNote('Dash could not complete the plan. Showing a fallback.');
      setAdvisorOutput(buildFallbackPlan(requestText, terminology.guardians, terminology.instructors));
      markProgressDone();
    }
  }, [requestText, canUseStudio, conversationId, startConversation, sendMessage, resetProgress, stopTimers, markProgressDone, isPlanning]);

  const buildField = useCallback(
    (label: string, type: FieldType, required = false, options?: string[]): FormField => ({
      id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      label,
      required,
      options,
    }),
    []
  );

  const buildAutoForm = useCallback(() => {
    const lower = requestText.toLowerCase();
    const guardianLabel = terminology.guardians;
    const instructorLabel = terminology.instructors;
    let title = 'New form';
    let description = 'Please complete this form.';
    let audience: FormAudience[] = ['parents'];
    let fields: FormField[] = [buildField('Your response', 'long_text', true)];

    if (lower.includes('excursion') || lower.includes('trip')) {
      title = 'Excursion Consent';
      description = 'Capture consent, emergency contacts, and payment details.';
      audience = ['parents'];
      fields = [
        buildField('Excursion date', 'date', true),
        buildField('Emergency contact', 'short_text', true),
        buildField('Allergies / medical notes', 'long_text'),
        buildField('Consent approval', 'consent', true),
        buildField('Excursion fee', 'fee_item'),
      ];
    } else if (lower.includes('meeting') || lower.includes('workshop')) {
      title = `${guardianLabel} Meeting RSVP`;
      description = 'Collect RSVPs, attendance counts, and questions.';
      audience = ['parents'];
      fields = [
        buildField('Meeting date', 'date', true),
        buildField('Number of attendees', 'number', true),
        buildField('Questions for the host', 'long_text'),
      ];
    } else if (lower.includes('training') || lower.includes('staff')) {
      title = `${instructorLabel} Training RSVP`;
      description = 'Confirm attendance and availability for staff training.';
      audience = ['teachers', 'staff'];
      fields = [
        buildField('Training date', 'date', true),
        buildField('Preferred session', 'dropdown', true, ['Morning', 'Afternoon']),
        buildField('Topics or focus areas', 'long_text'),
      ];
    }

    return { title, description, audience, fields };
  }, [requestText, terminology.guardians, terminology.instructors, buildField]);

  const handleGenerateForm = useCallback(async () => {
    if (!canUseStudio) {
      showAlert({ title: 'Premium Feature', message: 'Dash Studio is available on Premium/Pro tiers.', type: 'info' });
      return;
    }
    if (!organizationId) {
      showAlert({ title: 'Organization missing', message: 'Please refresh your profile and try again.', type: 'warning' });
      return;
    }
    const formDraft = buildAutoForm();
    if (!formDraft.title || formDraft.fields.length === 0) {
      showAlert({ title: 'Add details', message: 'Provide a clearer request so Dash can build the form.', type: 'warning' });
      return;
    }

    setIsCreatingForm(true);
    try {
      const savedForm = await FormBuilderService.createForm({
        organizationId,
        title: formDraft.title,
        description: formDraft.description,
        audience: formDraft.audience,
        fields: formDraft.fields,
        status: 'published',
      });

      await FormBuilderService.notifyFormPublished({
        organizationId: savedForm.organization_id,
        formId: savedForm.id,
        title: savedForm.title,
        audience: formDraft.audience,
      });

      showAlert({ title: 'Form published', message: `We notified ${formDraft.audience.join(', ')}.`, type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate the form.';
      showAlert({ title: 'Error', message, type: 'error' });
    } finally {
      setIsCreatingForm(false);
    }
  }, [canUseStudio, organizationId, buildAutoForm]);

  const quotaText = tierStatus
    ? `${tierStatus.quotaUsed}/${tierStatus.quotaLimit} used today`
    : 'Usage data loading…';

  if (!ready) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}> 
        <EduDashSpinner color={theme.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Dash AI Studio', headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.text }]}>Dash AI Studio</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Workflows + forms for principals</Text>
        </View>
        <View style={styles.tierBadge}>
          <Text style={[styles.tierText, { color: theme.primary }]}>{tier?.toUpperCase() || 'FREE'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!canUseStudio && (
          <View style={[styles.card, { borderColor: theme.border }]}> 
            <Text style={[styles.cardTitle, { color: theme.text }]}>Premium Feature</Text>
            <Text style={[styles.cardBody, { color: theme.textSecondary }]}>Dash Studio is available on Premium/Pro tiers.</Text>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={() => router.push(SUBSCRIPTION_SETUP_ROUTE)}
            >
              <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>Upgrade</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.card, { borderColor: theme.border }]}> 
          <Text style={[styles.cardTitle, { color: theme.text }]}>Describe your goal</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>Dash will reuse existing modules and produce a plan with forms + notifications.</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
            placeholder="e.g. Plan a Grade‑R excursion for next month"
            placeholderTextColor={theme.textSecondary}
            value={requestText}
            onChangeText={setRequestText}
            multiline
          />
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: canUseStudio ? 1 : 0.5 }]}
              onPress={handleGeneratePlan}
              disabled={!canUseStudio || isPlanning}
            >
              {isPlanning ? (
                <EduDashSpinner color={theme.onPrimary} size="small" />
              ) : (
                <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>Generate Plan</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: theme.border }]}
              onPress={() => router.push(FORM_BUILDER_ROUTE)}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Open Form Builder</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { borderColor: theme.border }]}> 
          <Text style={[styles.cardTitle, { color: theme.text }]}>Quick actions</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            Generate a form and notify {terminology.guardians.toLowerCase()} and {terminology.instructors.toLowerCase()}.
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: canUseStudio ? 1 : 0.5 }]}
              onPress={handleGenerateForm}
              disabled={!canUseStudio || isCreatingForm}
            >
              {isCreatingForm ? (
                <EduDashSpinner color={theme.onPrimary} size="small" />
              ) : (
                <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>Generate form + notify</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: theme.border }]}
              onPress={() => router.push('/screens/principal-form-builder')}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Open Form Builder</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { borderColor: theme.border }]}> 
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Dash status</Text>
            {statusNote ? <Text style={[styles.statusNote, { color: theme.primary }]}>{statusNote}</Text> : null}
          </View>
          {progressSteps.length === 0 ? (
            <Text style={[styles.cardBody, { color: theme.textSecondary }]}>Ready when you are.</Text>
          ) : (
            progressSteps.map((step) => (
              <View key={step.id} style={styles.progressRow}>
                <Ionicons
                  name={step.status === 'done' ? 'checkmark-circle' : 'ellipse'}
                  size={16}
                  color={step.status === 'done' ? theme.success : theme.textSecondary}
                />
                <Text style={[styles.progressText, { color: theme.text }]}>{step.label}</Text>
              </View>
            ))
          )}
        </View>

        <View style={[styles.card, { borderColor: theme.border }]}> 
          <Text style={[styles.cardTitle, { color: theme.text }]}>Dash output</Text>
          {advisorOutput ? (
            <Text style={[styles.planText, { color: theme.text }]}>{advisorOutput}</Text>
          ) : (
            <Text style={[styles.cardBody, { color: theme.textSecondary }]}>Your plan will appear here.</Text>
          )}
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: theme.border, marginTop: 12 }]}
            onPress={() => router.push({ pathname: '/screens/dash-assistant', params: { initialMessage: requestText || undefined } })}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Open full Dash chat</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { borderColor: theme.border }]}> 
          <Text style={[styles.cardTitle, { color: theme.text }]}>Templates</Text>
          {buildDefaultTemplates(terminology.guardians, terminology.instructors).map((template) => (
            <TouchableOpacity
              key={template.id}
              style={[styles.templateRow, { borderColor: theme.border }]}
              onPress={() => setRequestText(template.hint)}
            >
              <View>
                <Text style={[styles.templateTitle, { color: theme.text }]}>{template.label}</Text>
                <Text style={[styles.templateHint, { color: theme.textSecondary }]}>{template.hint}</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.card, { borderColor: theme.border }]}> 
          <Text style={[styles.cardTitle, { color: theme.text }]}>Leverage existing modules</Text>
          <View style={styles.moduleGrid}>
            {MODULE_LINKS.map((module) => (
              <TouchableOpacity
                key={module.id}
                style={[styles.moduleCard, { borderColor: theme.border }]}
                onPress={() => router.push(module.route)}
              >
                <Ionicons name={module.icon} size={18} color={theme.primary} />
                <Text style={[styles.moduleLabel, { color: theme.text }]}>{module.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.card, { borderColor: theme.border }]}> 
          <Text style={[styles.cardTitle, { color: theme.text }]}>AI usage</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>{quotaText}</Text>
        </View>
      </ScrollView>

      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backButton: { marginRight: 12 },
    headerText: { flex: 1 },
    title: { fontSize: 20, fontWeight: '700' },
    subtitle: { fontSize: 12, marginTop: 2 },
    tierBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
    },
    tierText: { fontSize: 10, fontWeight: '700' },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      marginBottom: 12,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
    cardBody: { fontSize: 13, lineHeight: 18 },
    input: {
      marginTop: 10,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      minHeight: 90,
      textAlignVertical: 'top',
    },
    actionRow: { flexDirection: 'row', gap: 12, marginTop: 12, flexWrap: 'wrap' },
    primaryButton: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 140,
    },
    primaryButtonText: { fontWeight: '700' },
    secondaryButton: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 140,
    },
    secondaryButtonText: { fontWeight: '600' },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    progressText: { fontSize: 13 },
    statusNote: { fontSize: 12, fontWeight: '700' },
    planText: { fontSize: 13, lineHeight: 20 },
    templateRow: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    templateTitle: { fontSize: 14, fontWeight: '700' },
    templateHint: { fontSize: 12, marginTop: 2 },
    moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
    moduleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: 12,
      padding: 10,
      width: '48%',
    },
    moduleLabel: { fontSize: 12, fontWeight: '600' },
  });
