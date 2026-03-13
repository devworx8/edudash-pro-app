import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView, Share, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { InviteService } from '@/services/InviteService';
import { useAlertModal } from '@/hooks/useAlertModal';
import AlertModal from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';

interface EnrollmentInviteModalProps {
  visible: boolean;
  onClose: () => void;
  theme: any;
  programId?: string;
}

interface Program {
  id: string;
  title: string;
  course_code: string | null;
}

export function EnrollmentInviteModal({
  visible,
  onClose,
  theme,
  programId,
}: EnrollmentInviteModalProps) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id || (profile as any)?.preschool_id;
  const { alertState, showAlert, hideAlert } = useAlertModal();

  const [emails, setEmails] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState<string>(programId || '');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: programs } = useQuery({
    queryKey: ['org-programs', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await assertSupabase()
        .from('courses')
        .select('id, title, course_code')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('title');
      if (error) return [];
      return (data || []) as Program[];
    },
    enabled: !!orgId && visible,
  });

  useEffect(() => {
    if (programId) setSelectedProgramId(programId);
  }, [programId]);

  const handleSendInvites = async () => {
    if (!emails.trim()) {
      showAlert('Missing emails', 'Please enter at least one email address.', 'warning');
      return;
    }
    if (!orgId) {
      showAlert('Error', 'No organization found. Please complete school setup first.', 'error');
      return;
    }

    const emailList = emails
      .split(/[,\n]/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && e.includes('@'));

    if (emailList.length === 0) {
      showAlert('Invalid emails', 'Please enter valid email addresses separated by commas or new lines.', 'warning');
      return;
    }

    setSending(true);
    let successCount = 0;
    let lastLink: string | null = null;

    for (const email of emailList) {
      const result = await InviteService.createInvite({
        type: 'learner_enroll',
        organizationId: orgId,
        preschoolId: orgId,
        email,
        message: selectedProgramId ? `Enrollment for program` : undefined,
        requestedRole: 'student',
        expiresInDays: 14,
      });
      if (result.success) {
        successCount += 1;
        if (result.inviteLink) lastLink = result.inviteLink;
      }
    }

    setSending(false);
    setSentCount(successCount);
    if (lastLink) setInviteLink(lastLink);

    if (successCount === emailList.length) {
      showAlert(
        'Invitations Sent',
        `${successCount} enrollment invitation${successCount > 1 ? 's' : ''} sent successfully. Learners will receive an email with a link to join.`,
        'success',
        [{ text: 'Done', onPress: () => { resetAndClose(); }, style: 'default' }],
      );
    } else if (successCount > 0) {
      showAlert(
        'Partially Sent',
        `${successCount} of ${emailList.length} invitations were sent. Some may have failed due to duplicates or invalid addresses.`,
        'warning',
        [{ text: 'OK', style: 'default' }],
      );
    } else {
      showAlert('Failed', 'Could not send invitations. Please check your connection and try again.', 'error');
    }
  };

  const handleShareLink = async () => {
    if (!orgId) return;
    const result = await InviteService.createInvite({
      type: 'learner_enroll',
      organizationId: orgId,
      preschoolId: orgId,
      requestedRole: 'student',
      expiresInDays: 30,
    });
    if (result.success && result.inviteLink) {
      setInviteLink(result.inviteLink);
      const schoolName = profile?.organization_name || 'our school';
      await Share.share({
        message: `You are invited to enroll at ${schoolName}! Use this link to register: ${result.inviteLink}`,
        title: `Enrollment Invitation - ${schoolName}`,
      });
    } else {
      showAlert('Error', 'Could not generate invite link. Please try again.', 'error');
    }
  };

  const resetAndClose = () => {
    setEmails('');
    setSelectedProgramId(programId || '');
    setSentCount(0);
    setInviteLink(null);
    onClose();
  };

  const selectedProgram = programs?.find((p) => p.id === selectedProgramId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: theme.cardBackground || theme.card || theme.surface }]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerIcon, { backgroundColor: `${theme.primary}15` }]}>
                <Ionicons name="school" size={22} color={theme.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.text }]}>Invite Learners</Text>
                <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
                  Send enrollment invitations
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {/* Quick share link */}
            <TouchableOpacity
              style={[styles.shareLinkCard, { borderColor: theme.primary + '30', backgroundColor: theme.primary + '08' }]}
              onPress={handleShareLink}
              activeOpacity={0.85}
            >
              <View style={[styles.shareLinkIcon, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="share-social" size={20} color={theme.primary} />
              </View>
              <View style={styles.shareLinkText}>
                <Text style={[styles.shareLinkTitle, { color: theme.text }]}>Share Enrollment Link</Text>
                <Text style={[styles.shareLinkSub, { color: theme.textSecondary }]}>
                  Generate a link to share via WhatsApp, SMS, or email
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textSecondary }]}>or invite by email</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            {programs && programs.length > 0 && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: theme.text }]}>Program (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.programList}>
                  {programs.map((program) => (
                    <TouchableOpacity
                      key={program.id}
                      style={[
                        styles.programChip,
                        { borderColor: theme.border },
                        selectedProgramId === program.id && { backgroundColor: theme.primary, borderColor: theme.primary },
                      ]}
                      onPress={() => setSelectedProgramId(prev => prev === program.id ? '' : program.id)}
                    >
                      <Text style={[
                        styles.programChipText,
                        { color: theme.text },
                        selectedProgramId === program.id && { color: '#fff' },
                      ]}>
                        {program.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Email Addresses</Text>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                Separate multiple emails with commas or new lines
              </Text>
              <TextInput
                style={[styles.textArea, {
                  backgroundColor: theme.background,
                  color: theme.text,
                  borderColor: theme.border,
                }]}
                value={emails}
                onChangeText={setEmails}
                placeholder="parent@email.com, guardian@email.com"
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton, { borderColor: theme.border }]}
                onPress={resetAndClose}
                disabled={sending}
              >
                <Text style={[styles.cancelText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: theme.primary }, (!emails.trim() || sending) && styles.buttonDisabled]}
                onPress={handleSendInvites}
                disabled={sending || !emails.trim()}
              >
                {sending ? (
                  <EduDashSpinner color="#fff" />
                ) : (
                  <View style={styles.sendRow}>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={styles.sendText}>Send Invites</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
      <AlertModal
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        buttons={alertState.buttons}
        onClose={hideAlert}
      />
    </Modal>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '88%', overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontSize: 12, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(128,128,128,0.1)' },
  title: { fontSize: 18, fontWeight: '700' },
  content: {},
  shareLinkCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  shareLinkIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  shareLinkText: { flex: 1 },
  shareLinkTitle: { fontSize: 14, fontWeight: '700' },
  shareLinkSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  hint: { fontSize: 12, marginBottom: 8 },
  programList: { flexDirection: 'row', marginBottom: 4 },
  programChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  programChipText: { fontSize: 13, fontWeight: '600' },
  textArea: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 15, minHeight: 100, maxHeight: 160 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  button: { flex: 1, padding: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  cancelButton: { borderWidth: 1, backgroundColor: 'transparent' },
  buttonDisabled: { opacity: 0.5 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
