import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Switch, Share, Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { InviteCodeService, SchoolInvitationCode } from '@/lib/services/inviteCodeService';
import { Picker } from '@react-native-picker/picker';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { buildEduDashWebUrl } from '@/lib/config/urls';

let Clipboard: any = null;
try { Clipboard = require('expo-clipboard'); } catch (e) { /* optional */ }

export default function PrincipalParentInviteCodeScreen() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const organizationId = (profile?.organization_id as string) || null;
  const preschoolId = ((profile as any)?.preschool_id as string) || null;
  // Prefer a valid preschoolId for school_invitation_codes linkage, but capture org context too
  const schoolId = preschoolId || organizationId || null;

  const [codes, setCodes] = useState<SchoolInvitationCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteType, setInviteType] = useState<'parent' | 'student' | 'member'>('parent');

  // New code form
  const [unlimited, setUnlimited] = useState(true);
  const [maxUses, setMaxUses] = useState('50');
  const [expiryDays, setExpiryDays] = useState('30');

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const list = await InviteCodeService.listCodes(schoolId, inviteType);
      setCodes(list);
    } catch (e: any) {
      showAlert({ title: 'Error', message: e?.message || 'Failed to load invite codes' });
    } finally {
      setLoading(false);
    }
  }, [schoolId, inviteType]);

  useEffect(() => { load(); }, [load]);

  const onGenerate = async () => {
    if (!schoolId || !user?.id) {
      showAlert({ title: 'Missing context', message: 'You need a school to create invites.' });
      return;
    }
    try {
      setLoading(true);
      const uses = unlimited ? null : Number(maxUses) > 0 ? Number(maxUses) : 1;
      const days = Number(expiryDays);
      const expiresAt = isFinite(days) && days > 0
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const created = await InviteCodeService.createInviteCode({
        invitationType: inviteType,
        preschoolId: schoolId!,
        organizationId: organizationId,
        organizationKind: preschoolId ? 'preschool' : 'org',
        invitedBy: user.id,
        maxUses: uses,
        expiresAt,
        description: inviteType === 'parent' ? 'Parent invite' : inviteType === 'student' ? 'Learner invite' : 'Member invite',
      });
      // Optimistically show the new/active code at the top while we refresh from server
      setCodes(prev => [created, ...prev.filter(c => c.id !== created.id)]);
      await load();
      showAlert({ title: 'Invite created', message: `Code: ${created.code}` });
    } catch (e: any) {
      showAlert({ title: 'Error', message: e?.message || 'Failed to create invite' });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(value);
        showAlert({ title: 'Copied', message: 'Invite code copied to clipboard' });
      } else {
        throw new Error('Clipboard not available');
      }
    } catch {
      showAlert({ title: 'Copy failed', message: 'Clipboard not available on this platform' });
    }
  };

  const buildShareMessage = (code: string) => {
    const path = inviteType === 'parent' ? 'parent' : 'student';
    const shareUrl = buildEduDashWebUrl(`/invite/${path}?code=${encodeURIComponent(code)}`);
    const who = inviteType === 'parent' ? 'our school' : 'our organization';
    return `Join ${who} on EduDash Pro\n\nUse this code: ${code}\n\nTap the link to open the app: ${shareUrl}`;
  };

  const shareInvite = async (item: SchoolInvitationCode) => {
    try {
      const message = buildShareMessage(item.code);
      await Share.share({ message });
    } catch (e: any) {
      showAlert({ title: 'Share failed', message: e?.message || 'Unable to open share dialog' });
    }
  };

  const shareWhatsApp = async (item: SchoolInvitationCode) => {
    try {
      const message = encodeURIComponent(buildShareMessage(item.code));
      const url = `whatsapp://send?text=${message}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        showAlert({ title: 'WhatsApp not available', message: 'Please install WhatsApp or use Share/Copy instead.' });
      }
    } catch (e: any) {
      showAlert({ title: 'Share failed', message: e?.message || 'Unable to share via WhatsApp' });
    }
  };

  const toggleActive = async (item: SchoolInvitationCode) => {
    try {
      setLoading(true);
      await InviteCodeService.setActive(item.id, !(item.is_active ?? false));
      await load();
    } catch (e: any) {
      showAlert({ title: 'Error', message: e?.message || 'Failed to update' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Create School-wide Invite',
          headerShown: false,
          headerBackVisible: false,
        }} 
      />
      <ScrollView contentContainerStyle={styles.content}>
        {!schoolId ? (
          <Text style={styles.text}>No school found on your profile. Create a school first.</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Create an Organization Invite</Text>
            <View style={styles.card}>
              <Text style={styles.inputLabel}>Invitation Type</Text>
              {/* Segmented toggle for invite type */}
              <View style={styles.segmentRow}>
                {(['parent','student','member'] as const).map((type) => {
                  const selected = inviteType === type;
                  const label = type === 'parent' ? 'Parent' : type === 'student' ? 'Student' : 'Member';
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.segmentBtn, selected ? styles.segmentBtnActive : undefined]}
                      onPress={() => setInviteType(type)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.segmentText, selected ? styles.segmentTextActive : undefined]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Quick share row for the latest code of selected type */}
              <View style={[styles.row, { marginTop: 8 }]}> 
                {(() => {
                  const latest = codes[0];
                  const path = inviteType === 'parent' ? 'parent' : 'student';
                  const link = latest
                    ? buildEduDashWebUrl(`/invite/${path}?code=${encodeURIComponent(latest.code)}`)
                    : '';

                  const copyLink = async () => {
                    if (!latest) return showAlert({ title: 'No code', message: 'Generate an invite first.' });
                    try {
                      if (Clipboard?.setStringAsync) {
                        await Clipboard.setStringAsync(link);
                        showAlert({ title: 'Copied', message: 'Share link copied to clipboard' });
                      } else {
                        throw new Error('Clipboard not available');
                      }
                    } catch {
                      showAlert({ title: 'Copy failed', message: 'Clipboard not available on this platform' });
                    }
                  };

                  const shareQuick = async () => {
                    if (!latest) return showAlert({ title: 'No code', message: 'Generate an invite first.' });
                    try {
                      const message = buildShareMessage(latest.code);
                      await Share.share({ message });
                    } catch (e: any) {
                      showAlert({ title: 'Share failed', message: e?.message || 'Unable to open share dialog' });
                    }
                  };

                  const waQuick = async () => {
                    if (!latest) return showAlert({ title: 'No code', message: 'Generate an invite first.' });
                    try {
                      const message = encodeURIComponent(buildShareMessage(latest.code));
                      const url = `whatsapp://send?text=${message}`;
                      const supported = await Linking.canOpenURL(url);
                      if (supported) await Linking.openURL(url);
                      else showAlert({ title: 'WhatsApp not available', message: 'Please install WhatsApp or use Share/Copy instead.' });
                    } catch (e: any) {
                      showAlert({ title: 'Share failed', message: e?.message || 'Unable to share via WhatsApp' });
                    }
                  };

                  return (
                    <>
                      <TouchableOpacity style={[styles.smallButton, { flex: 1 }]} onPress={copyLink}>
                        <Text style={styles.smallButtonText}>Copy Link</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallButton, { flex: 1 }]} onPress={shareQuick}>
                        <Text style={styles.smallButtonText}>Share</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallButton, styles.whatsapp, { flex: 1 }]} onPress={waQuick}>
                        <Text style={[styles.smallButtonText, styles.smallButtonTextDark]}>WhatsApp</Text>
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </View>

              <View style={styles.rowBetween}>
                <Text style={styles.label}>Unlimited uses</Text>
                <Switch value={unlimited} onValueChange={setUnlimited} />
              </View>
              {!unlimited && (
                <View style={styles.fieldRow}>
                  <Text style={styles.inputLabel}>Max uses</Text>
                  <TextInput
                    keyboardType="number-pad"
                    value={maxUses}
                    onChangeText={setMaxUses}
                    placeholder="e.g. 50"
                    style={styles.input}
                  />
                </View>
              )}
              <View style={styles.fieldRow}>
                <Text style={styles.inputLabel}>Expires in (days)</Text>
                <TextInput
                  keyboardType="number-pad"
                  value={expiryDays}
                  onChangeText={setExpiryDays}
                  placeholder="30"
                  style={styles.input}
                />
              </View>
              <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={onGenerate} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? 'Working…' : 'Generate Invite Code'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.button} onPress={() => router.push('/screens/principal-parents')}>
              <Text style={styles.buttonText}>View Parents</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Existing Codes ({inviteType})</Text>
            {codes.length === 0 ? (
              <Text style={styles.muted}>No invite codes yet.</Text>
            ) : (
              codes.map((item) => {
                const active = !!item.is_active;
                const usesText = item.max_uses ? `${item.current_uses || 0}/${item.max_uses}` : `${item.current_uses || 0}/∞`;
                return (
                  <View key={item.id} style={styles.card}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.code}>{item.code}</Text>
                      <View style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}>
                        <Text style={styles.badgeText}>{active ? 'ACTIVE' : 'INACTIVE'}</Text>
                      </View>
                    </View>
                    <Text style={styles.text}>Uses: {usesText}</Text>
                    <Text style={styles.text}>Expires: {item.expires_at ? new Date(item.expires_at).toLocaleString() : 'No expiry'}</Text>
                    <View style={styles.row}>
                      <TouchableOpacity style={styles.smallButton} onPress={() => copyToClipboard(item.code)}>
                        <Text style={styles.smallButtonText}>Copy</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.smallButton} onPress={() => shareInvite(item)}>
                        <Text style={styles.smallButtonText}>Share</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallButton, styles.whatsapp]} onPress={() => shareWhatsApp(item)}>
                        <Text style={[styles.smallButtonText, styles.smallButtonTextDark]}>WhatsApp</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallButton, active ? styles.deactivate : styles.activate]} onPress={() => toggleActive(item)}>
                        <Text style={[styles.smallButtonText, styles.smallButtonTextDark]}>{active ? 'Deactivate' : 'Activate'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
      <AlertModal {...alertProps} />
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme?.background || '#0b1220' },
  content: { padding: 16 },
  text: { color: theme?.text || '#fff' },
  muted: { color: theme?.textSecondary || '#9CA3AF', marginBottom: 12 },
  sectionTitle: { color: theme?.text || '#fff', fontSize: 16, fontWeight: '700', marginVertical: 8 },
  card: { backgroundColor: theme?.surface || '#111827', borderRadius: 12, padding: 12, borderColor: theme?.border || '#1f2937', borderWidth: 1, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  fieldRow: { marginBottom: 12 },
  label: { color: theme?.text || '#fff' },
  inputLabel: { color: theme?.text || '#fff', marginBottom: 6 },
  input: { backgroundColor: theme?.surface || '#0b1220', color: theme?.text || '#fff', borderRadius: 8, borderWidth: 1, borderColor: theme?.border || '#1f2937', padding: 10 },
  button: { marginTop: 12, backgroundColor: theme?.primary || '#00f5ff', padding: 12, borderRadius: 10, alignItems: 'center' },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: theme?.onPrimary || '#000', fontWeight: '800' },
  code: { color: theme?.text || '#fff', fontSize: 18, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeActive: { backgroundColor: '#059669' },
  badgeInactive: { backgroundColor: '#6B7280' },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 10 },
  smallButton: { flex: 1, backgroundColor: theme?.surface || '#0b1220', padding: 10, borderRadius: 10, alignItems: 'center', borderColor: theme?.border || '#1f2937', borderWidth: 1 },
  smallButtonText: { color: theme?.text || '#fff', fontWeight: '700' },
  smallButtonTextDark: { color: '#000' },
  deactivate: { backgroundColor: '#F59E0B' },
  activate: { backgroundColor: '#22C55E' },
  whatsapp: { backgroundColor: '#25D366' },
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 8 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: theme?.surface || '#0b1220', borderWidth: 1, borderColor: theme?.border || '#1f2937', alignItems: 'center' },
  segmentBtnActive: { backgroundColor: theme?.primary || '#00f5ff', borderColor: theme?.primary || '#00f5ff' },
  segmentText: { color: theme?.text || '#fff', fontWeight: '700' },
  segmentTextActive: { color: theme?.onPrimary || '#000' },
});
