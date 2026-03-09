/**
 * CV Builder Enhanced Screen
 * Refactored to meet WARP.md ≤500 line limit
 * Original: 1,273 lines → Refactored: ~200 lines
 * Now with template selection and enhanced preview
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { useLearnerCVs, useCreateCV } from '@/hooks/useLearnerData';

import {
  CVSection,
  getSectionTitle,
  getDefaultSectionData,
  handleShare,
  PersonalInfoSection,
  SectionCard,
  SectionEditorModal,
} from '@/components/cv-builder';
import { CVTemplate } from '@/components/cv-builder/templates';
import { TemplateSelector } from '@/components/cv-builder/TemplateSelector';
import { CVPreviewEnhanced } from '@/components/cv-builder/CVPreviewEnhanced';
import { ContentTemplateSelector } from '@/components/cv-builder/ContentTemplateSelector';
import { ContentTemplate, getContentTemplate } from '@/components/cv-builder/sampleContent';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function CVBuilderEnhancedScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const { data: cvs } = useLearnerCVs();
  const existingCV = cvs?.find((cv) => cv.id === id);
  const createCV = useCreateCV();
  const { showAlert, alertProps } = useAlertModal();
  
  // Show template selector for new CVs
  const [showContentTemplateSelector, setShowContentTemplateSelector] = useState(!id && !existingCV);

  const [cvTitle, setCvTitle] = useState(existingCV?.title || 'My CV');
  const [sections, setSections] = useState<CVSection[]>(
    existingCV?.cv_data?.sections || [
      { id: '1', type: 'personal', title: 'Personal Information', data: {} },
    ]
  );
  const [activeSection, setActiveSection] = useState<CVSection | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [isSharing, setIsSharing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<CVTemplate>(
    existingCV?.cv_data?.template || 'modern'
  );

  // Handle content template selection
  const handleContentTemplateSelect = (templateId: ContentTemplate) => {
    const templateSections = getContentTemplate(templateId);
    // Pre-fill user's name and email if available
    if (profile && templateSections[0]?.type === 'personal') {
      templateSections[0].data.fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
      templateSections[0].data.email = profile.email || '';
    }
    setSections(templateSections);
    setShowContentTemplateSelector(false);
  };

  const addSection = (type: CVSection['type']) => {
    const newSection: CVSection = {
      id: Date.now().toString(),
      type,
      title: getSectionTitle(type, t),
      data: getDefaultSectionData(type),
    };
    setSections([...sections, newSection]);
    setActiveSection(newSection);
  };

  const updateSection = (sectionId: string, updates: Partial<CVSection>) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...updates } : s)));
  };

  const removeSection = (sectionId: string) => {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    if (activeSection?.id === sectionId) setActiveSection(null);
  };

  const handleSave = async () => {
    if (!cvTitle.trim()) {
      showAlert({ title: t('common.error', { defaultValue: 'Error' }), message: t('cv.title_required', { defaultValue: 'Please enter a CV title' }), type: 'warning' });
      return;
    }
    setIsSaving(true);
    try {
      await createCV.mutateAsync({ title: cvTitle, cv_data: { sections, template: selectedTemplate } });
      showAlert({ title: t('common.success', { defaultValue: 'Success' }), message: t('cv.saved', { defaultValue: 'CV saved successfully' }), type: 'success', buttons: [{ text: t('common.ok', { defaultValue: 'OK' }), onPress: () => router.back() }] });
    } catch (error: any) {
      showAlert({ title: t('common.error', { defaultValue: 'Error' }), message: error.message || t('common.save_failed', { defaultValue: 'Failed to save CV' }), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const showShareOptions = () => {
    showAlert({
      title: t('cv.share_cv', { defaultValue: 'Share CV' }),
      message: t('cv.select_share_method', { defaultValue: 'Select sharing method' }),
      type: 'info',
      buttons: [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: t('cv.share_as_pdf', { defaultValue: 'Share as PDF' }), onPress: () => doShare('pdf') },
        { text: t('cv.share_as_text', { defaultValue: 'Share as Text' }), onPress: () => doShare('native') },
        { text: 'LinkedIn', onPress: () => doShare('linkedin') },
        { text: 'WhatsApp', onPress: () => doShare('whatsapp') },
        { text: t('cv.email', { defaultValue: 'Email' }), onPress: () => doShare('email') },
      ]
    });
  };

  const doShare = async (method: 'native' | 'pdf' | 'linkedin' | 'whatsapp' | 'email') => {
    setIsSharing(true);
    try {
      await handleShare(method, sections, cvTitle, profile, theme, t);
    } catch (error: any) {
      showAlert({ title: t('common.error', { defaultValue: 'Error' }), message: error.message || t('cv.share_failed', { defaultValue: 'Failed to share CV' }), type: 'error' });
    } finally {
      setIsSharing(false);
    }
  };

  const showAddSectionMenu = () => {
    const options: Array<{ type: CVSection['type']; label: string }> = [
      { type: 'experience', label: t('cv.experience', { defaultValue: 'Experience' }) },
      { type: 'education', label: t('cv.education', { defaultValue: 'Education' }) },
      { type: 'skills', label: t('cv.skills', { defaultValue: 'Skills' }) },
      { type: 'certifications', label: t('cv.certifications', { defaultValue: 'Certifications' }) },
      { type: 'languages', label: t('cv.languages', { defaultValue: 'Languages' }) },
      { type: 'projects', label: t('cv.projects', { defaultValue: 'Projects' }) },
      { type: 'references', label: t('cv.references', { defaultValue: 'References' }) },
      { type: 'achievements', label: t('cv.achievements', { defaultValue: 'Achievements' }) },
      { type: 'volunteer', label: t('cv.volunteer', { defaultValue: 'Volunteer Work' }) },
    ];
    showAlert({
      title: t('cv.add_section', { defaultValue: 'Add Section' }),
      message: t('cv.select_section_type', { defaultValue: 'Select section type' }),
      type: 'info',
      buttons: [{ text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' }, ...options.map((o) => ({ text: o.label, onPress: () => addSection(o.type) }))]
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          title: existingCV ? t('cv.edit_cv', { defaultValue: 'Edit CV' }) : t('cv.create_cv', { defaultValue: 'Create CV' }),
          headerRight: () => (
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={() => setViewMode(viewMode === 'edit' ? 'preview' : 'edit')}>
                <Ionicons name={viewMode === 'edit' ? 'eye-outline' : 'create-outline'} size={24} color={theme.primary} />
              </TouchableOpacity>
              {viewMode === 'preview' && (
                <TouchableOpacity onPress={showShareOptions} disabled={isSharing}>
                  {isSharing ? <EduDashSpinner size="small" color={theme.primary} /> : <Ionicons name="share-outline" size={24} color={theme.primary} />}
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleSave} disabled={isSaving || createCV.isPending}>
                {isSaving || createCV.isPending ? (
                  <EduDashSpinner size="small" color={theme.primary} />
                ) : (
                  <Text style={[styles.saveButton, { color: theme.primary }]}>{t('common.save', { defaultValue: 'Save' })}</Text>
                )}
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {viewMode === 'edit' ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]} showsVerticalScrollIndicator={false}>
          {/* Template Selector */}
          <TemplateSelector
            selectedTemplate={selectedTemplate}
            onSelectTemplate={setSelectedTemplate}
            theme={theme}
          />

          {/* CV Title */}
          <Card padding={16} margin={0} elevation="small" style={styles.section}>
            <Text style={[styles.label, { color: theme.text }]}>{t('cv.cv_title', { defaultValue: 'CV Title' })}</Text>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
              value={cvTitle}
              onChangeText={setCvTitle}
              placeholder={t('cv.cv_title_placeholder', { defaultValue: 'e.g., Software Developer CV' })}
              placeholderTextColor={theme.textSecondary}
            />
          </Card>

          {/* Personal Information */}
          <PersonalInfoSection
            section={sections.find((s) => s.type === 'personal')}
            onUpdate={(data) => {
              const ps = sections.find((s) => s.type === 'personal');
              if (ps) updateSection(ps.id, { data });
            }}
            theme={theme}
            t={t}
          />

          {/* Other Sections */}
          {sections.filter((s) => s.type !== 'personal').map((section) => (
            <SectionCard key={section.id} section={section} onEdit={() => setActiveSection(section)} onDelete={() => removeSection(section.id)} theme={theme} t={t} />
          ))}

          {/* Add Section Button */}
          <TouchableOpacity style={[styles.addButton, { borderColor: theme.border }]} onPress={showAddSectionMenu}>
            <Ionicons name="add-circle-outline" size={24} color={theme.primary} />
            <Text style={[styles.addButtonText, { color: theme.primary }]}>{t('cv.add_section', { defaultValue: 'Add Section' })}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={styles.previewContainer}>
          {/* Compact template switcher in preview mode */}
          <View style={styles.previewHeader}>
            <TemplateSelector
              selectedTemplate={selectedTemplate}
              onSelectTemplate={setSelectedTemplate}
              theme={theme}
              compact
            />
          </View>
          <CVPreviewEnhanced 
            sections={sections} 
            cvTitle={cvTitle} 
            profile={profile} 
            theme={theme} 
            insets={insets} 
            t={t}
            template={selectedTemplate}
          />
        </View>
      )}

      {/* Section Editor Modal */}
      {activeSection && (
        <SectionEditorModal section={activeSection} onUpdate={(data) => updateSection(activeSection.id, { data })} onClose={() => setActiveSection(null)} theme={theme} t={t} insets={insets} />
      )}

      {/* Content Template Selector Modal - shows on new CV creation */}
      <ContentTemplateSelector
        visible={showContentTemplateSelector}
        onSelectTemplate={handleContentTemplateSelect}
        onClose={() => setShowContentTemplateSelector(false)}
        theme={theme}
      />
      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 8 },
  section: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { height: 44, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, fontSize: 16 },
  headerRight: { flexDirection: 'row', gap: 12, marginRight: 16 },
  saveButton: { fontSize: 16, fontWeight: '600' },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', gap: 8, marginTop: 8 },
  addButtonText: { fontSize: 16, fontWeight: '600' },
  previewContainer: { flex: 1 },
  previewHeader: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' },
});
