import React, { useMemo } from 'react';
import { Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { formatEmploymentType } from '@/lib/hiring/jobPostingShare';
import { EmploymentType } from '@/types/hiring';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { ImageConfirmModal } from '@/components/ui/ImageConfirmModal';
import { LinearGradient } from 'expo-linear-gradient';
import JobPostingShareModal from '@/components/principal/JobPostingShareModal';
import JobPostingAIModal from '@/components/principal/JobPostingAIModal';
import JobPostingTemplateSaveModal from '@/components/principal/JobPostingTemplateSaveModal';
import { useJobPostingCreate } from '@/hooks/job-posting-create';
import { createStyles } from './job-posting-create.styles';

export default function JobPostingCreateScreen() {
  const {
    theme, showAlert, AlertModalComponent,
    title, setTitle, description, setDescription, requirements, setRequirements,
    salaryMin, setSalaryMin, salaryMax, setSalaryMax, location, setLocation,
    employmentType, setEmploymentType, expiresAt, setExpiresAt,
    ageGroup, setAgeGroup, whatsappNumber, setWhatsappNumber,
    submitting, handleSubmit, schoolInfo, draft, templates, ai, logo, share,
  } = useJobPostingCreate();
  const { draftParams, draftLoaded, draftSaving, draftLastSavedAt, clearDraftAndResetForm } = draft;
  const { allTemplates, savedTemplateIds, templatesLoaded, onPressTemplate, deleteSavedTemplate,
    openSaveTemplateModal, templateSaveModalVisible, setTemplateSaveModalVisible, templateName,
    setTemplateName, templateCategory, setTemplateCategory, savingTemplate, handleSaveTemplate } = templates;
  const { aiBusy, aiModalVisible, setAiModalVisible, aiSuggestions, aiUseSuggestedTitle,
    setAiUseSuggestedTitle, canUseAISuggestions, handleAISuggest, applyAISuggestions,
    aiWhatsAppShort, aiWhatsAppLong } = ai;
  const { jobLogoUrl, jobLogoUploading, pendingLogoUri, setPendingLogoUri,
    handlePickJobLogo, confirmLogoUpload, handleClearJobLogo } = logo;
  const { shareModalVisible, setShareModalVisible, shareJobPosting, shareMessage, setShareMessage,
    shareVariant, setShareVariant, broadcasting, setBroadcasting, polishingShareMessage,
    canPolishShareMessageWithAI, sharingPoster, includeSchoolHeader, setIncludeSchoolHeader,
    includeSchoolLogo, setIncludeSchoolLogo, includeSchoolDetails, setIncludeSchoolDetails,
    appWebBaseUrl, posterShotRef, formatSchoolDetails, buildShareMessageForVariant, attachApplyLink,
    handleShareToWhatsApp, handleCopyMessage, handleCopyApplyLink, handleSharePoster,
    handlePolishMessageWithAI, handleWhatsAppBroadcast } = share;
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Create Job Posting', headerShown: false }} />
      <AlertModalComponent />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Job Posting</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Draft + Templates + AI */}
        {draftParams ? (
          <View style={styles.draftBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.draftBarTitle}>Autosave</Text>
              <Text style={styles.draftBarSubtitle}>
                {!draftLoaded
                  ? 'Loading…'
                  : draftSaving
                  ? 'Saving…'
                  : draftLastSavedAt
                  ? `Saved ${new Date(draftLastSavedAt).toLocaleString()}`
                  : 'No draft saved yet'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.draftBarButton}
              onPress={() => {
                showAlert({
                  title: 'Clear Draft?',
                  message: 'This will clear the saved draft and reset the form.',
                  type: 'warning',
                  buttons: [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: () => {
                        void clearDraftAndResetForm();
                      },
                    },
                  ],
                });
              }}
            >
              <Ionicons name="trash-outline" size={18} color={theme.text} />
              <Text style={styles.draftBarButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="layers-outline" size={18} color={theme.textSecondary} />
              <Text style={styles.sectionTitle}>Templates</Text>
            </View>
            <TouchableOpacity style={styles.sectionHeaderButton} onPress={openSaveTemplateModal}>
              <Ionicons name="bookmark-outline" size={16} color={theme.primary} />
              <Text style={styles.sectionHeaderButtonText}>Save current</Text>
            </TouchableOpacity>
          </View>

          {!templatesLoaded ? (
            <Text style={styles.sectionHint}>Loading templates…</Text>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templatesRow}>
                {allTemplates.map((t) => {
                  const isSaved = savedTemplateIds.has(t.id);
                  return (
                    <TouchableOpacity key={t.id} style={styles.templateCard} activeOpacity={0.85} onPress={() => onPressTemplate(t)}>
                      <View style={styles.templateCardTop}>
                        <Text style={styles.templateName} numberOfLines={1}>
                          {t.name}
                        </Text>
                        {isSaved ? (
                          <TouchableOpacity
                            style={styles.templateDeleteButton}
                            onPress={() => deleteSavedTemplate(t.id)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Ionicons name="trash-outline" size={16} color={theme.textSecondary} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <Text style={styles.templateMeta} numberOfLines={1}>
                        {formatEmploymentType(String(t.employment_type))}
                        {t.category ? ` • ${t.category.toUpperCase()}` : ''}
                      </Text>
                      <Text style={styles.templateTitle} numberOfLines={2}>
                        {t.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text style={styles.sectionHint}>Tap a template to start fast. Use “Save current” to reuse your best posts.</Text>
            </>
          )}
        </View>

        <View style={styles.aiCard}>
          <LinearGradient
            colors={[theme.primary + '22', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.aiCardBg}
          />
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="sparkles-outline" size={18} color={theme.primary} />
              <Text style={styles.sectionTitle}>AI Assist</Text>
            </View>
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>Next-gen</Text>
            </View>
          </View>
          <Text style={styles.sectionHint}>
            Generate or improve your description and requirements using your school info and role type.
          </Text>
          <TouchableOpacity
            style={[styles.aiPrimaryButton, (aiBusy || !canUseAISuggestions) && styles.aiPrimaryButtonDisabled]}
            onPress={handleAISuggest}
            disabled={aiBusy || !canUseAISuggestions}
          >
            {aiBusy ? <EduDashSpinner color="#FFFFFF" /> : <Ionicons name="sparkles" size={18} color="#FFFFFF" />}
            <Text style={styles.aiPrimaryButtonText}>
              {description.trim() || requirements.trim() ? 'Improve With AI' : 'Generate With AI'}
            </Text>
          </TouchableOpacity>
          {!canUseAISuggestions ? (
            <Text style={styles.sectionHint}>Add a job title to enable AI suggestions.</Text>
          ) : null}
        </View>

        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Job Title <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Early Childhood Teacher"
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        {/* Job Logo */}
        <View style={styles.field}>
          <Text style={styles.label}>School Logo for This Job (Optional)</Text>
          <View style={styles.logoCard}>
            {jobLogoUrl ? (
              <Image source={{ uri: jobLogoUrl }} style={styles.logoPreview} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Ionicons name="image-outline" size={26} color={theme.textSecondary} />
                <Text style={styles.logoPlaceholderText}>No logo uploaded</Text>
              </View>
            )}
            <View style={styles.logoActions}>
              <TouchableOpacity
                style={[styles.logoButton, jobLogoUploading && styles.logoButtonDisabled]}
                disabled={jobLogoUploading}
                onPress={handlePickJobLogo}
              >
                <Text style={styles.logoButtonText}>
                  {jobLogoUploading ? 'Uploading…' : jobLogoUrl ? 'Change Logo' : 'Upload Logo'}
                </Text>
              </TouchableOpacity>
              {jobLogoUrl ? (
                <TouchableOpacity style={styles.logoSecondaryButton} onPress={handleClearJobLogo}>
                  <Text style={styles.logoSecondaryText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.hint}>
              If you skip this, we will use your school logo (or EduDash Pro if none exists).
            </Text>
          </View>
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Description <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the role, responsibilities, and expectations..."
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
        </View>

        {/* Requirements */}
        <View style={styles.field}>
          <Text style={styles.label}>Requirements</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={requirements}
            onChangeText={setRequirements}
            placeholder="List qualifications, experience, certifications..."
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Salary Range */}
        <View style={styles.field}>
          <Text style={styles.label}>Salary Range (R)</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                value={salaryMin}
                onChangeText={setSalaryMin}
                placeholder="Min"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
              />
            </View>
            <Text style={[styles.separator, { color: theme.textSecondary }]}>to</Text>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                value={salaryMax}
                onChangeText={setSalaryMax}
                placeholder="Max"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Location */}
        <View style={styles.field}>
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Johannesburg, Gauteng"
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        {/* Employment Type */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Employment Type <Text style={styles.required}>*</Text>
          </Text>
          <View style={[styles.pickerContainer, { backgroundColor: theme.surface }]}>
            <Picker
              selectedValue={employmentType}
              onValueChange={(value) => setEmploymentType(value as EmploymentType)}
              style={styles.picker}
              dropdownIconColor={theme.text}
            >
              <Picker.Item label="Full-Time" value={EmploymentType.FULL_TIME} />
              <Picker.Item label="Part-Time" value={EmploymentType.PART_TIME} />
              <Picker.Item label="Contract" value={EmploymentType.CONTRACT} />
              <Picker.Item label="Temporary" value={EmploymentType.TEMPORARY} />
            </Picker>
          </View>
        </View>

        {/* Age Group */}
        <View style={styles.field}>
          <Text style={styles.label}>Age Group</Text>
          <View style={[styles.pickerContainer, { backgroundColor: theme.surface }]}>
            <Picker
              selectedValue={ageGroup}
              onValueChange={(value) => setAgeGroup(value)}
              style={styles.picker}
              dropdownIconColor={theme.text}
            >
              <Picker.Item label="Select age group (optional)" value="" />
              <Picker.Item label="Babies (0–1 year)" value="0-1" />
              <Picker.Item label="Toddlers (1–2 years)" value="1-2" />
              <Picker.Item label="Toddlers (2–3 years)" value="2-3" />
              <Picker.Item label="Preschool (3–4 years)" value="3-4" />
              <Picker.Item label="Pre-K (4–5 years)" value="4-5" />
              <Picker.Item label="Grade R (5–6 years)" value="Grade R" />
              <Picker.Item label="Grade 1–3" value="Grade 1-3" />
              <Picker.Item label="Grade 4–6" value="Grade 4-6" />
              <Picker.Item label="Grade 7–9" value="Grade 7-9" />
              <Picker.Item label="Grade 10–12" value="Grade 10-12" />
              <Picker.Item label="Mixed / All Ages" value="Mixed" />
            </Picker>
          </View>
          <Text style={styles.hint}>What age group will the teacher be working with?</Text>
        </View>

        {/* WhatsApp Number */}
        <View style={styles.field}>
          <Text style={styles.label}>WhatsApp Number</Text>
          <TextInput
            style={styles.input}
            value={whatsappNumber}
            onChangeText={setWhatsappNumber}
            placeholder="e.g. +27 82 123 4567"
            placeholderTextColor={theme.textSecondary}
            keyboardType="phone-pad"
          />
          <Text style={styles.hint}>For quick communication with shortlisted candidates</Text>
        </View>

        {/* Expires At */}
        <View style={styles.field}>
          <Text style={styles.label}>Expires At (Optional)</Text>
          <TextInput
            style={styles.input}
            value={expiresAt}
            onChangeText={setExpiresAt}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
          />
          <Text style={styles.hint}>Leave blank for no expiration</Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <EduDashSpinner color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Create Job Posting</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Save Template Modal */}
      <JobPostingTemplateSaveModal
        visible={templateSaveModalVisible}
        onClose={() => setTemplateSaveModalVisible(false)}
        templateName={templateName}
        setTemplateName={setTemplateName}
        templateCategory={templateCategory}
        setTemplateCategory={setTemplateCategory}
        savingTemplate={savingTemplate}
        handleSaveTemplate={handleSaveTemplate}
        theme={theme}
        styles={styles}
      />

      {/* AI Suggestions Modal */}
      <Modal visible={aiModalVisible} transparent={false} animationType="slide" onRequestClose={() => setAiModalVisible(false)}>
        <JobPostingAIModal
          visible={aiModalVisible}
          onClose={() => setAiModalVisible(false)}
          aiSuggestions={aiSuggestions}
          aiUseSuggestedTitle={aiUseSuggestedTitle}
          setAiUseSuggestedTitle={setAiUseSuggestedTitle}
          applyAISuggestions={applyAISuggestions}
          showAlert={showAlert}
          theme={theme}
          styles={styles}
        />
      </Modal>

      <JobPostingShareModal
        visible={shareModalVisible}
        onClose={() => { setShareModalVisible(false); router.back(); }}
        shareJobPosting={shareJobPosting}
        shareMessage={shareMessage}
        setShareMessage={setShareMessage}
        shareVariant={shareVariant}
        setShareVariant={setShareVariant}
        schoolInfo={schoolInfo}
        jobLogoUrl={jobLogoUrl}
        title={title}
        description={description}
        requirements={requirements}
        location={location}
        employmentType={employmentType}
        includeSchoolHeader={includeSchoolHeader}
        setIncludeSchoolHeader={setIncludeSchoolHeader}
        includeSchoolLogo={includeSchoolLogo}
        setIncludeSchoolLogo={setIncludeSchoolLogo}
        includeSchoolDetails={includeSchoolDetails}
        setIncludeSchoolDetails={setIncludeSchoolDetails}
        polishingShareMessage={polishingShareMessage}
        canPolishShareMessageWithAI={canPolishShareMessageWithAI}
        sharingPoster={sharingPoster}
        broadcasting={broadcasting}
        aiWhatsAppShort={aiWhatsAppShort}
        aiWhatsAppLong={aiWhatsAppLong}
        appWebBaseUrl={appWebBaseUrl}
        posterShotRef={posterShotRef}
        buildShareMessageForVariant={buildShareMessageForVariant}
        attachApplyLink={attachApplyLink}
        handleShareToWhatsApp={handleShareToWhatsApp}
        handleCopyMessage={handleCopyMessage}
        handleCopyApplyLink={handleCopyApplyLink}
        handleSharePoster={handleSharePoster}
        handlePolishMessageWithAI={handlePolishMessageWithAI}
        handleBroadcast={() => {
          if (!shareJobPosting) return;
          showAlert({
            title: 'Broadcast to all contacts?',
            message: 'This will send the message to your full WhatsApp contact list. Continue?',
            type: 'warning',
            buttons: [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Broadcast',
                style: 'destructive',
                onPress: async () => {
                  setBroadcasting(true);
                  const success = await handleWhatsAppBroadcast(shareJobPosting, shareMessage);
                  setBroadcasting(false);
                  if (success) { setShareModalVisible(false); router.back(); }
                },
              },
            ],
          });
        }}
        formatSchoolDetails={formatSchoolDetails}
        theme={theme}
        styles={styles}
      />

      {/* Logo confirm modal */}
      <ImageConfirmModal
        visible={!!pendingLogoUri}
        imageUri={pendingLogoUri}
        onConfirm={confirmLogoUpload}
        onCancel={() => setPendingLogoUri(null)}
        title="Job Logo"
        confirmLabel="Set Logo"
        showCrop
        cropAspect={[1, 1]}
        loading={jobLogoUploading}
      />
    </SafeAreaView>
  );
}
