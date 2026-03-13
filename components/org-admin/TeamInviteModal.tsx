import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { InviteService, type JoinRequestType } from '@/services/InviteService';
import { useAlertModal } from '@/hooks/useAlertModal';
import AlertModal from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';

interface TeamInviteModalProps {
  visible: boolean;
  onClose: () => void;
  theme: any;
  role: 'instructor' | 'admin' | 'manager';
}

const ROLE_CONFIG: Record<string, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; inviteType: JoinRequestType; dbRole: string }> = {
  instructor: { label: 'Teacher', icon: 'school', inviteType: 'teacher_invite', dbRole: 'teacher' },
  admin: { label: 'Administrator', icon: 'shield-checkmark', inviteType: 'staff_invite', dbRole: 'admin' },
  manager: { label: 'Manager', icon: 'briefcase', inviteType: 'staff_invite', dbRole: 'principal_admin' },
};

export function TeamInviteModal({ visible, onClose, theme, role }: TeamInviteModalProps) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id || (profile as any)?.preschool_id;
  const { alertState, showAlert, hideAlert } = useAlertModal();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);

  const config = ROLE_CONFIG[role] || ROLE_CONFIG.instructor;
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleSendInvite = async () => {
    if (!email.trim() || !name.trim()) {
      showAlert('Missing information', 'Please fill in both the name and email address.', 'warning');
      return;
    }
    if (!orgId) {
      showAlert('Error', 'No organization found. Please complete school setup first.', 'error');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@')) {
      showAlert('Invalid email', 'Please enter a valid email address.', 'warning');
      return;
    }

    setSending(true);
    const result = await InviteService.createInvite({
      type: config.inviteType,
      organizationId: orgId,
      preschoolId: orgId,
      email: cleanEmail,
      message: `Invited as ${config.label}: ${name.trim()}`,
      requestedRole: config.dbRole,
      expiresInDays: 14,
    });
    setSending(false);

    if (result.success) {
      showAlert(
        'Invitation Sent',
        `${name.trim()} will receive an email at ${cleanEmail} with a link to join as ${config.label}.${result.inviteLink ? '\n\nYou can also share the link directly.' : ''}`,
        'success',
        [
          ...(result.inviteLink ? [{
            text: 'Share Link',
            onPress: () => {
              const schoolName = profile?.organization_name || 'our school';
              Share.share({
                message: `You are invited to join ${schoolName} as ${config.label}! Use this link: ${result.inviteLink}`,
                title: `Team Invitation - ${schoolName}`,
              });
            },
            style: 'default' as const,
          }] : []),
          { text: 'Done', onPress: () => resetAndClose(), style: 'default' as const },
        ],
      );
    } else {
      showAlert('Failed', result.error || 'Could not send the invitation. Please try again.', 'error');
    }
  };

  const resetAndClose = () => {
    setEmail('');
    setName('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: theme.cardBackground || theme.card || theme.surface }]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerIcon, { backgroundColor: `${theme.primary}15` }]}>
                <Ionicons name={config.icon} size={22} color={theme.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.text }]}>Invite {config.label}</Text>
                <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
                  Send a join invitation
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={[styles.roleIndicator, { backgroundColor: theme.primary + '0A', borderColor: theme.primary + '20' }]}>
              <Ionicons name={config.icon} size={16} color={theme.primary} />
              <Text style={[styles.roleText, { color: theme.primary }]}>
                Joining as {config.label}
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Full Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Sarah Johnson"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Email Address</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={email}
                onChangeText={setEmail}
                placeholder="e.g. sarah@school.co.za"
                placeholderTextColor={theme.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
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
                style={[styles.button, { backgroundColor: theme.primary }, (!email.trim() || !name.trim() || sending) && styles.buttonDisabled]}
                onPress={handleSendInvite}
                disabled={sending || !email.trim() || !name.trim()}
              >
                {sending ? (
                  <EduDashSpinner color="#fff" />
                ) : (
                  <View style={styles.sendRow}>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={styles.sendText}>Send Invite</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
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
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontSize: 12, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(128,128,128,0.1)' },
  title: { fontSize: 18, fontWeight: '700' },
  content: { gap: 16 },
  roleIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  roleText: { fontSize: 13, fontWeight: '700' },
  inputGroup: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 15 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  button: { flex: 1, padding: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  cancelButton: { borderWidth: 1, backgroundColor: 'transparent' },
  buttonDisabled: { opacity: 0.5 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sendText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
