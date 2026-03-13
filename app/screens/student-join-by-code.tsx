import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { assertSupabase } from '@/lib/supabase';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Generic join-by-code for adults/learners (invitation types like 'student' or 'member').
export default function StudentJoinByCodeScreen() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { showAlert, alertProps } = useAlertModal();

  const params = useLocalSearchParams<{ code?: string }>();
  const initialCode = typeof params?.code === 'string' ? params.code : '';

  const [code, setCode] = useState(initialCode);
  const [email, setEmail] = useState<string>(user?.email || '');
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState<any | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  const onValidate = async () => {
    if (!code.trim() || !email.trim()) {
      showAlert({ title: 'Missing info', message: 'Enter the invite code and your email.', type: 'warning' });
      return;
    }
    try {
      setValidated(null);
      setValidating(true);
      const { data, error } = await assertSupabase()
        .rpc('validate_invitation_code', { p_code: code.trim(), p_email: email.trim() });
      if (error) throw error;
      if (!data) throw new Error('Code not found or inactive');
      // Handle new JSON response format with school/org info
      if (typeof data === 'object' && 'valid' in data) {
        if (!(data as any).valid) {
          throw new Error((data as any).error || 'Invalid invitation code');
        }
      }
      setValidated(data);
      showAlert({ title: 'Code valid', message: 'You can join this organization.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Invalid code', message: e?.message || 'This code is invalid or expired.', type: 'error' });
    } finally {
      setValidating(false);
    }
  };

  const onJoin = async () => {
    if (!user?.id) {
      showAlert({ title: 'Sign in required', message: 'Please sign in first.', type: 'warning' });
      return;
    }
    if (!code.trim()) {
      showAlert({ title: 'Missing code', message: 'Enter a code first.', type: 'warning' });
      return;
    }
    try {
      setRedeeming(true);
      const fullName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Member';
      const { error } = await assertSupabase()
        .rpc('use_invitation_code', {
          p_auth_user_id: user.id,
          p_code: code.trim(),
          p_name: fullName,
          p_phone: (profile as any)?.phone || null,
        });
      if (error) throw error;
      showAlert({ title: 'Joined!', message: 'Your account is now linked.', type: 'success' });
      router.replace('/');
    } catch (e: any) {
      showAlert({ title: 'Failed', message: e?.message || 'Could not join with this code.', type: 'error' });
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Join by Code' }} />
      <Text style={styles.label}>Invite code</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder="Enter your code"
        autoCapitalize="characters"
      />
      <Text style={styles.label}>Your email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TouchableOpacity style={styles.button} onPress={onValidate} disabled={validating}>
        {validating ? <EduDashSpinner color={theme?.onPrimary || '#000'} /> : <Text style={styles.buttonText}>Validate Code</Text>}
      </TouchableOpacity>

      {validated && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Invite Details</Text>
          <Text style={styles.cardText}>Type: {validated.invitation_type}</Text>
          <Text style={styles.cardText}>Active: {String(validated.is_active)}</Text>
          <Text style={styles.cardText}>Uses: {validated.current_uses ?? 0}{validated.max_uses ? ` / ${validated.max_uses}` : ' / ∞'}</Text>
          <Text style={styles.cardText}>Expires: {validated.expires_at ? new Date(validated.expires_at).toLocaleString() : 'No expiry'}</Text>

          <TouchableOpacity style={[styles.button, styles.joinBtn]} onPress={onJoin} disabled={redeeming}>
            {redeeming ? <EduDashSpinner color={theme?.onPrimary || '#000'} /> : <Text style={styles.buttonText}>Join</Text>}
          </TouchableOpacity>
        </View>
      )}
      <AlertModal {...alertProps} />
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme?.background || '#0b1220' },
  label: { color: theme?.text || '#fff', marginTop: 8, marginBottom: 6 },
  input: { backgroundColor: theme?.surface || '#111827', color: theme?.text || '#fff', borderRadius: 8, borderWidth: 1, borderColor: theme?.border || '#1f2937', padding: 12 },
  button: { marginTop: 12, backgroundColor: theme?.primary || '#00f5ff', padding: 12, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: theme?.onPrimary || '#000', fontWeight: '800' },
  card: { marginTop: 16, backgroundColor: theme?.surface || '#111827', borderRadius: 12, padding: 12, borderColor: theme?.border || '#1f2937', borderWidth: 1 },
  cardTitle: { color: theme?.text || '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  cardText: { color: theme?.text || '#fff', marginBottom: 4 },
  joinBtn: { marginTop: 8 },
});