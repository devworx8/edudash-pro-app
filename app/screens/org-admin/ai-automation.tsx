/**
 * Dash AI Automation Tools
 * 
 * Provides AI-powered automation tools for organizations:
 * - Content generation (announcements, reports)
 * - Automated responses
 * - Learner insights
 * - Content suggestions
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';
import { useMutation } from '@tanstack/react-query';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
interface AutomationTool {
  id: string;
  title: string;
  description: string;
  icon: string;
  enabled: boolean;
  category: 'content' | 'analytics' | 'communication' | 'automation';
}

export default function AIAutomationScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const { profile } = useAuth();
  const styles = createStyles(theme);

  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const tools: AutomationTool[] = [
    {
      id: 'generate-announcement',
      title: t('ai_automation.generate_announcement', { defaultValue: 'Generate Announcement' }),
      description: t('ai_automation.announcement_desc', { defaultValue: 'Auto-generate announcements and updates' }),
      icon: 'megaphone-outline',
      enabled: true,
      category: 'content',
    },
    {
      id: 'generate-report',
      title: t('ai_automation.generate_report', { defaultValue: 'Generate Report' }),
      description: t('ai_automation.report_desc', { defaultValue: 'Create progress and analytics reports' }),
      icon: 'document-text-outline',
      enabled: true,
      category: 'content',
    },
    {
      id: 'learner-insights',
      title: t('ai_automation.learner_insights', { defaultValue: 'Learner Insights' }),
      description: t('ai_automation.insights_desc', { defaultValue: 'Get AI-powered insights on learner progress' }),
      icon: 'analytics-outline',
      enabled: true,
      category: 'analytics',
    },
    {
      id: 'auto-responses',
      title: t('ai_automation.auto_responses', { defaultValue: 'Auto Responses' }),
      description: t('ai_automation.auto_responses_desc', { defaultValue: 'Automated responses to common inquiries' }),
      icon: 'chatbubbles-outline',
      enabled: true,
      category: 'communication',
    },
    {
      id: 'content-suggestions',
      title: t('ai_automation.content_suggestions', { defaultValue: 'Content Suggestions' }),
      description: t('ai_automation.suggestions_desc', { defaultValue: 'Get suggestions for program content' }),
      icon: 'bulb-outline',
      enabled: true,
      category: 'automation',
    },
    {
      id: 'learner-matching',
      title: t('ai_automation.learner_matching', { defaultValue: 'Learner Matching' }),
      description: t('ai_automation.matching_desc', { defaultValue: 'Match learners to suitable programs' }),
      icon: 'people-outline',
      enabled: true,
      category: 'automation',
    },
  ];

  const generateContent = useMutation({
    mutationFn: async ({ toolId, prompt }: { toolId: string; prompt: string }) => {
      if (!profile?.organization_id) throw new Error('No organization found');

      const { data, error } = await assertSupabase().functions.invoke('dash-ai-automation', {
        body: {
          tool_id: toolId,
          prompt,
          organization_id: profile.organization_id,
          action: 'generate',
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setGeneratedContent(data.content || data.result || '');
      setIsGenerating(false);
    },
    onError: (error: any) => {
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: error.message || t('ai_automation.generation_failed', { defaultValue: 'Failed to generate content' }),
        type: 'error',
      });
      setIsGenerating(false);
    },
  });

  const handleGenerate = async (toolId: string) => {
    if (!inputText.trim()) {
      showAlert({
        title: t('common.error', { defaultValue: 'Error' }),
        message: t('ai_automation.enter_prompt', { defaultValue: 'Please enter a prompt or description' }),
        type: 'warning',
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedContent('');
    generateContent.mutate({ toolId, prompt: inputText });
  };

  const handleToolSelect = (tool: AutomationTool) => {
    setSelectedTool(tool.id);
    setInputText('');
    setGeneratedContent('');
  };

  const getToolByCategory = (category: AutomationTool['category']) => {
    return tools.filter((t) => t.category === category);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: t('ai_automation.title', { defaultValue: 'Dash AI Automation' }),
          headerBackTitle: t('common.back', { defaultValue: 'Back' }),
        }} 
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* AI Tools Overview */}
        <Card padding={20} margin={0} elevation="small" style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('ai_automation.available_tools', { defaultValue: 'Available AI Tools' })}
          </Text>
          <Text style={styles.sectionDescription}>
            {t('ai_automation.tools_description', {
              defaultValue: 'Use Dash AI to automate tasks and generate content for your organization',
            })}
          </Text>
        </Card>

        {/* Content Generation Tools */}
        <View style={styles.categorySection}>
          <Text style={styles.categoryTitle}>
            {t('ai_automation.content_generation', { defaultValue: 'Content Generation' })}
          </Text>
          {getToolByCategory('content').map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              isSelected={selectedTool === tool.id}
              onSelect={() => handleToolSelect(tool)}
              theme={theme}
              t={t}
            />
          ))}
        </View>

        {/* Analytics Tools */}
        <View style={styles.categorySection}>
          <Text style={styles.categoryTitle}>
            {t('ai_automation.analytics', { defaultValue: 'Analytics & Insights' })}
          </Text>
          {getToolByCategory('analytics').map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              isSelected={selectedTool === tool.id}
              onSelect={() => handleToolSelect(tool)}
              theme={theme}
              t={t}
            />
          ))}
        </View>

        {/* Communication Tools */}
        <View style={styles.categorySection}>
          <Text style={styles.categoryTitle}>
            {t('ai_automation.communication', { defaultValue: 'Communication' })}
          </Text>
          {getToolByCategory('communication').map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              isSelected={selectedTool === tool.id}
              onSelect={() => handleToolSelect(tool)}
              theme={theme}
              t={t}
            />
          ))}
        </View>

        {/* Automation Tools */}
        <View style={styles.categorySection}>
          <Text style={styles.categoryTitle}>
            {t('ai_automation.automation', { defaultValue: 'Automation' })}
          </Text>
          {getToolByCategory('automation').map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              isSelected={selectedTool === tool.id}
              onSelect={() => handleToolSelect(tool)}
              theme={theme}
              t={t}
            />
          ))}
        </View>

        {/* Tool Input & Output */}
        {selectedTool && (
          <Card padding={20} margin={0} elevation="medium" style={styles.generatorCard}>
            <View style={styles.generatorHeader}>
              <Ionicons name={tools.find((t) => t.id === selectedTool)?.icon as any} size={24} color={theme.primary} />
              <Text style={styles.generatorTitle}>
                {tools.find((t) => t.id === selectedTool)?.title}
              </Text>
            </View>

            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>
                {t('ai_automation.prompt', { defaultValue: 'Prompt or Description' })}
              </Text>
              <TextInput
                style={[styles.textInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
                value={inputText}
                onChangeText={setInputText}
                placeholder={t('ai_automation.enter_prompt_placeholder', {
                  defaultValue: 'Describe what you want to generate...',
                })}
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[styles.generateButton, { backgroundColor: theme.primary }]}
              onPress={() => handleGenerate(selectedTool)}
              disabled={isGenerating || !inputText.trim()}
            >
              {isGenerating ? (
                <EduDashSpinner color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color="#fff" />
                  <Text style={styles.generateButtonText}>
                    {t('ai_automation.generate', { defaultValue: 'Generate' })}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {generatedContent && (
              <View style={styles.outputSection}>
                <View style={styles.outputHeader}>
                  <Text style={styles.outputLabel}>
                    {t('ai_automation.generated_content', { defaultValue: 'Generated Content' })}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      // TODO: Copy to clipboard
                      showAlert({ title: t('common.copied', { defaultValue: 'Copied to clipboard' }), type: 'success' });
                    }}
                  >
                    <Ionicons name="copy-outline" size={20} color={theme.primary} />
                  </TouchableOpacity>
                </View>
                <View style={[styles.outputBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.outputText, { color: theme.text }]}>{generatedContent}</Text>
                </View>
              </View>
            )}

            {/* Note */}
            <View style={styles.noteBox}>
              <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
              <Text style={styles.noteText}>
                {t('ai_automation.note', {
                  defaultValue: 'AI content generation requires an Edge Function. Contact support to enable this feature.',
                })}
              </Text>
            </View>
          </Card>
        )}
      </ScrollView>
      <AlertModal {...alertProps} />
    </View>
  );
}

function ToolCard({
  tool,
  isSelected,
  onSelect,
  theme,
  t,
}: {
  tool: AutomationTool;
  isSelected: boolean;
  onSelect: () => void;
  theme: any;
  t: any;
}) {
  const styles = createStyles(theme);

  return (
    <TouchableOpacity
      style={[
        styles.toolCard,
        isSelected && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
      ]}
      onPress={onSelect}
    >
      <View style={styles.toolHeader}>
        <View style={[styles.toolIcon, { backgroundColor: isSelected ? theme.primary : theme.surface }]}>
          <Ionicons name={tool.icon as any} size={24} color={isSelected ? '#fff' : theme.primary} />
        </View>
        <View style={styles.toolInfo}>
          <Text style={[styles.toolTitle, { color: theme.text }]}>{tool.title}</Text>
          <Text style={[styles.toolDescription, { color: theme.textSecondary }]}>{tool.description}</Text>
        </View>
        <Ionicons
          name={isSelected ? 'chevron-up' : 'chevron-forward'}
          size={20}
          color={theme.textSecondary}
        />
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16, paddingBottom: 32 },
  section: { marginBottom: 16 },
  sectionTitle: { color: theme.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  sectionDescription: { color: theme.textSecondary, fontSize: 14, lineHeight: 20 },
  categorySection: { marginBottom: 24 },
  categoryTitle: { color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 12, marginHorizontal: 4 },
  toolCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  toolHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toolIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolInfo: { flex: 1 },
  toolTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  toolDescription: { fontSize: 13, lineHeight: 18 },
  generatorCard: { marginTop: 16 },
  generatorHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  generatorTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
  inputSection: { marginBottom: 16 },
  inputLabel: { color: theme.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  textInput: {
    minHeight: 100,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    gap: 8,
    marginBottom: 20,
  },
  generateButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  outputSection: { marginTop: 20 },
  outputHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  outputLabel: { color: theme.text, fontSize: 16, fontWeight: '600' },
  outputBox: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 150,
  },
  outputText: { fontSize: 14, lineHeight: 20 },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: theme.surface,
    borderRadius: 8,
  },
  noteText: { flex: 1, color: theme.textSecondary, fontSize: 12, lineHeight: 16 },
});





