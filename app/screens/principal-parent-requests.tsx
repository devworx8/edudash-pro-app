import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { ParentJoinService, GuardianRequest, SearchedStudent } from '@/lib/services/parentJoinService';
import { assertSupabase } from '@/lib/supabase';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { InviteCodeService } from '@/lib/services/inviteCodeService';
import { toast } from '@/components/ui/ToastProvider';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { buildEduDashWebUrl } from '@/lib/config/urls';

export default function PrincipalParentRequestsScreen() {
  const { user, profile } = useAuth();
  const { theme } = useTheme();
  const schoolId = (profile?.organization_id as string) || (profile?.preschool_id as string) || null;
  const [requests, setRequests] = useState<GuardianRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [studentIdMap, setStudentIdMap] = useState<Record<string, string>>({});
  const [manualParentEmail, setManualParentEmail] = useState('');
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [manualSearchResults, setManualSearchResults] = useState<SearchedStudent[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<SearchedStudent | null>(null);
  const [manualLinking, setManualLinking] = useState(false);
  const [manualSearching, setManualSearching] = useState(false);
  const [parentLookupStatus, setParentLookupStatus] = useState<'idle' | 'checking' | 'found' | 'not_found'>('idle');
  const [inviteSent, setInviteSent] = useState<{ email: string; childName: string; code: string } | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { showAlert, alertProps } = useAlertModal();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const load = useCallback(async () => {
    if (!schoolId) return;
    const data = await ParentJoinService.listPendingForSchool(schoolId);
    setRequests(data);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setParentLookupStatus('idle'); }, [manualParentEmail]);

  const updateSelectionFromResults = useCallback((results: SearchedStudent[]) => {
    setSelectedStudent((prev) => {
      if (results.length === 1) return results[0];
      if (prev && results.some((student) => student.id === prev.id)) return prev;
      return null;
    });
  }, []);

  const performSearch = useCallback(
    async (query: string) => {
      if (!schoolId) return;
      setManualSearching(true);
      try {
        const results = await ParentJoinService.searchChild(schoolId, query);
        setManualSearchResults(results);
        updateSelectionFromResults(results);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to search';
        showAlert({ title: 'Error', message, type: 'error' });
        setManualSearchResults([]);
        updateSelectionFromResults([]);
      } finally {
        setManualSearching(false);
      }
    },
    [schoolId, updateSelectionFromResults]
  );

  useEffect(() => {
    if (!schoolId) return;
    const query = manualSearchQuery.trim();

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!query) {
      setManualSearchResults([]);
      setSelectedStudent(null);
      setManualSearching(false);
      return;
    }

    setManualSearching(true);
    searchDebounceRef.current = setTimeout(() => {
      void performSearch(query);
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [manualSearchQuery, performSearch, schoolId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const approve = async (req: GuardianRequest) => {
    const studentId = studentIdMap[req.id] || req.student_id || '';
    if (!studentId) {
      showAlert({ title: 'Student required', message: 'Enter the student ID to link the parent.', type: 'warning' });
      return;
    }
    try {
      await ParentJoinService.approve(req.id, studentId, user?.id || '');
      showAlert({ title: 'Approved', message: 'Parent linked to student.', type: 'success' });
      load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to approve';
      showAlert({ title: 'Error', message, type: 'error' });
    }
  };

  const reject = async (req: GuardianRequest) => {
    try {
      await ParentJoinService.reject(req.id, user?.id || '');
      load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to reject';
      showAlert({ title: 'Error', message, type: 'error' });
    }
  };

  const manualLinkSchema = z.object({
    parentEmail: z.string().email(),
    studentId: z.string().uuid(),
  });

  const handleManualSearch = async () => {
    if (!schoolId) return;
    const query = manualSearchQuery.trim();
    if (!query) {
      showAlert({ title: 'Search required', message: 'Enter a child name to search.', type: 'warning' });
      return;
    }
    await performSearch(query);
  };

  const handleManualLink = async () => {
    if (!schoolId) return;
    if (!selectedStudent) {
      showAlert({ title: 'Select a child', message: 'Please select a child from the search results.', type: 'warning' });
      return;
    }
    const parsed = manualLinkSchema.safeParse({
      parentEmail: manualParentEmail.trim().toLowerCase(),
      studentId: selectedStudent.id,
    });

    if (!parsed.success) {
      showAlert({ title: 'Invalid input', message: 'Enter a valid parent email and select a child.', type: 'warning' });
      return;
    }

    setManualLinking(true);
    try {
      const supabase = assertSupabase();
      const { parentEmail, studentId } = parsed.data;

      const parentProfile = await lookupParentProfile(parentEmail, supabase);
      if (!parentProfile) {
        setParentLookupStatus('not_found');
        throw new Error('Parent profile not found. Use Send Invite to create an account.');
      }
      setParentLookupStatus('found');

      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id, first_name, last_name, parent_id, guardian_id, preschool_id, student_id')
        .eq('preschool_id', schoolId)
        .eq('id', studentId)
        .maybeSingle();

      if (studentError || !student) {
        throw new Error('Student not found for this school.');
      }

      // Link via junction table (multi-parent support)
      const { data: existingLink } = await supabase
        .from('student_parent_relationships')
        .select('id')
        .eq('student_id', student.id)
        .eq('parent_id', parentProfile.id)
        .maybeSingle();

      if (!existingLink) {
        const { error: linkError } = await supabase
          .from('student_parent_relationships')
          .insert({
            student_id: student.id,
            parent_id: parentProfile.id,
            relationship_type: 'parent',
            is_primary: !student.parent_id,
          });
        if (linkError) throw linkError;
      }

      // Set parent_id/guardian_id on students if open slot exists
      if (!student.parent_id) {
        await supabase.from('students').update({ parent_id: parentProfile.id }).eq('id', student.id);
      } else if (!student.guardian_id && student.parent_id !== parentProfile.id) {
        await supabase.from('students').update({ guardian_id: parentProfile.id }).eq('id', student.id);
      }

      // Ensure parent profile is linked to school
      if (student.preschool_id) {
        await supabase.rpc('link_profile_to_school', {
          p_target_profile_id: parentProfile.id,
          p_school_id: student.preschool_id,
          p_role: 'parent',
        });
      }

      // Notify parent (push/email via notifications-dispatcher)
      try {
        await supabase.functions.invoke('notifications-dispatcher', {
          body: {
            event_type: 'parent_linked',
            user_ids: [parentProfile.id],
            preschool_id: student.preschool_id,
            student_id: student.id,
            include_email: true,
            include_push: true,
            custom_payload: {
              child_name: `${student.first_name} ${student.last_name}`,
              student_code: student.student_id,
            },
          },
        });
      } catch {
        // Non-blocking notification failure
      }

      const studentCode = student.student_id || student.id.slice(0, 8).toUpperCase();
      toast.success(`${student.first_name} (${studentCode}) linked`, 'Parent Connected');
      showAlert({ title: 'Linked', message: `Parent can now access ${student.first_name}'s profile.`, type: 'success' });
      setManualParentEmail('');
      setManualSearchQuery('');
      setManualSearchResults([]);
      setSelectedStudent(null);
      setParentLookupStatus('idle');
      load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to link parent';
      showAlert({ title: 'Error', message, type: 'error' });
    } finally {
      setManualLinking(false);
    }
  };

  const lookupParentProfile = async (
    email: string,
    supabase = assertSupabase()
  ): Promise<{ id: string; email: string | null } | null> => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return null;
    setParentLookupStatus('checking');
    const { data: parentProfile, error } = await supabase
      .from('profiles')
      .select('id, email')
      .ilike('email', trimmed)
      .maybeSingle();
    if (error || !parentProfile) {
      setParentLookupStatus('not_found');
      return null;
    }
    setParentLookupStatus('found');
    return parentProfile as { id: string; email: string | null };
  };

  const handleSendInvite = async () => {
    if (!schoolId) return;
    if (!selectedStudent) {
      showAlert({ title: 'Select a child', message: 'Please select a child before sending an invite.', type: 'warning' });
      return;
    }

    const email = manualParentEmail.trim().toLowerCase();
    const parsed = z.string().email().safeParse(email);
    if (!parsed.success) {
      showAlert({ title: 'Invalid email', message: 'Enter a valid parent email address.', type: 'warning' });
      return;
    }

    setManualLinking(true);
    try {
      const supabase = assertSupabase();
      const existing = await lookupParentProfile(email, supabase);
      if (existing) {
        toast.info('Parent already registered', 'Invite');
        return;
      }

      const invite = await InviteCodeService.createParentCode({
        preschoolId: schoolId,
        organizationId: (profile?.organization_id as string) || null,
        organizationKind: profile?.preschool_id ? 'preschool' : 'org',
        invitedBy: user?.id || null,
        description: 'Parent invite from Connect Parent',
      });

      const studentCode = selectedStudent.student_id || selectedStudent.id.slice(0, 8).toUpperCase();
      const childName = `${selectedStudent.first_name} ${selectedStudent.last_name}`;
      const schoolName = profile?.organization_name || 'your school';
      const inviteLink = buildEduDashWebUrl(`/invite/parent?code=${encodeURIComponent(invite.code)}`);
      const subject = `EduDash Pro invite from ${schoolName}`;
      const message = `Hello,\n\nYou've been invited to connect to ${schoolName} on EduDash Pro.\n\nChild: ${childName}\nStudent Code: ${studentCode}\n\nUse this invite code: ${invite.code}\nInvite Link: ${inviteLink}\n\nOnce you sign up, the school will connect your account to ${childName}.\n`;
      const html = `
        <p>Hello,</p>
        <p>You've been invited to connect to <strong>${schoolName}</strong> on EduDash Pro.</p>
        <p><strong>Child:</strong> ${childName}<br/>
        <strong>Student Code:</strong> ${studentCode}</p>
        <p><strong>Invite Code:</strong> ${invite.code}<br/>
        <strong>Invite Link:</strong> <a href="${inviteLink}">${inviteLink}</a></p>
        <p>Once you sign up, the school will connect your account to ${childName}.</p>
      `;

      const { data, error } = await supabase.functions.invoke('notifications-dispatcher', {
        body: {
          event_type: 'parent_invite',
          recipient_email: email,
          include_email: true,
          preschool_id: schoolId,
          custom_payload: {
            child_name: childName,
            student_code: studentCode,
            invite_code: invite.code,
            invite_link: inviteLink,
            school_name: schoolName,
          },
          email_template_override: {
            subject,
            text: message,
            html,
          },
        },
      });

      if (error || data?.success === false) {
        throw new Error('Invite email failed to send.');
      }

      toast.success(`Invite sent to ${email}`, 'Invite Sent');
      setInviteSent({ email, childName, code: invite.code });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to send invite';
      showAlert({ title: 'Error', message, type: 'error' });
    } finally {
      setManualLinking(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          headerShown: false,
        }} 
      />
      <ScreenHeader title="Connect Parent" subtitle="Link parents to learners" />
      <View style={styles.manualLinkCard}>
        <Text style={styles.manualTitle}>Connect Parent Manually</Text>
        <Text style={styles.manualSubtitle}>Use this when a parent can’t find their child.</Text>
        <TextInput
          style={styles.input}
          value={manualSearchQuery}
          onChangeText={setManualSearchQuery}
          placeholder="Search child by name or code"
          placeholderTextColor={theme?.textSecondary || '#9CA3AF'}
          autoCapitalize="words"
        />
        <TouchableOpacity
          style={[styles.btn, styles.searchButton, manualSearching && styles.btnDisabled]}
          onPress={handleManualSearch}
          disabled={manualSearching}
        >
          <Text style={styles.btnTextDark}>{manualSearching ? 'Searching...' : 'Search'}</Text>
        </TouchableOpacity>
        {manualSearching && (
          <Text style={styles.noticeText}>Searching...</Text>
        )}

        {manualSearchResults.length > 0 && (
          <View style={styles.searchResults}>
            {manualSearchResults.map((student) => {
              const isSelected = selectedStudent?.id === student.id;
              const studentCode = student.student_id || student.id.slice(0, 8).toUpperCase();
              return (
                <TouchableOpacity
                  key={student.id}
                  style={[styles.searchResultItem, isSelected && styles.searchResultSelected]}
                  onPress={() => setSelectedStudent(student)}
                >
                  <Text style={styles.searchResultName}>
                    {student.first_name} {student.last_name}
                  </Text>
                  <Text style={styles.searchResultMeta}>
                    {studentCode}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {manualSearchQuery.trim().length > 0 && !manualSearching && manualSearchResults.length === 0 && (
          <Text style={styles.noticeText}>No matching children found.</Text>
        )}

        {selectedStudent && (
          <View style={styles.selectedStudentCard}>
            <Text style={styles.selectedStudentLabel}>Selected Child</Text>
            <Text style={styles.selectedStudentName}>
              {selectedStudent.first_name} {selectedStudent.last_name}
            </Text>
            <Text style={styles.selectedStudentMeta}>
              Student Code: {selectedStudent.student_id || selectedStudent.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>
        )}
        <TextInput
          style={styles.input}
          value={manualParentEmail}
          onChangeText={setManualParentEmail}
          placeholder="Parent email"
          placeholderTextColor={theme?.textSecondary || '#9CA3AF'}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        {parentLookupStatus === 'not_found' && (
          <Text style={styles.noticeText}>Parent not registered — send invite.</Text>
        )}
        {parentLookupStatus === 'found' && (
          <Text style={styles.noticeText}>Parent account found.</Text>
        )}
        {inviteSent && inviteSent.email === manualParentEmail.trim().toLowerCase() && (
          <Text style={styles.noticeText}>
            Invite sent to {inviteSent.email} for {inviteSent.childName} (code: {inviteSent.code}).
          </Text>
        )}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.btn, styles.approve, manualLinking && styles.btnDisabled]}
            onPress={handleManualLink}
            disabled={manualLinking}
          >
            <Text style={styles.btnTextDark}>{manualLinking ? 'Linking...' : 'Connect Parent'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.inviteButton, manualLinking && styles.btnDisabled]}
            onPress={handleSendInvite}
            disabled={manualLinking}
          >
            <Text style={styles.btnTextDark}>
              {inviteSent && inviteSent.email === manualParentEmail.trim().toLowerCase() ? 'Resend Invite' : 'Send Invite'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlashList
        data={requests}
        keyExtractor={(item) => item.id}
        estimatedItemSize={150}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme?.primary || '#00f5ff'} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.text}>Parent: {item.parent_email || item.parent_auth_id}</Text>
            <Text style={styles.text}>Child: {item.child_full_name || '—'}</Text>
            <Text style={styles.text}>Requested: {new Date(item.created_at).toLocaleString()}</Text>
            <TextInput
              style={styles.input}
              value={studentIdMap[item.id] ?? ''}
              onChangeText={(v) => setStudentIdMap((m) => ({ ...m, [item.id]: v }))}
              placeholder={item.student_id || 'Enter student ID'}
              placeholderTextColor={theme?.textSecondary || '#9CA3AF'}
            />
            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, styles.approve]} onPress={() => approve(item)}>
                <Text style={styles.btnTextDark}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.reject]} onPress={() => reject(item)}>
                <Text style={styles.btnTextDark}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No pending requests</Text>}
      />
      <AlertModal {...alertProps} />
    </View>
  );
}

const createStyles = (theme: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme?.background || '#0b1220', padding: 12 },
  manualLinkCard: { backgroundColor: theme?.cardBackground || '#111827', borderRadius: 12, padding: 12, borderColor: theme?.border || '#1f2937', borderWidth: 1, marginBottom: 12 },
  manualTitle: { color: theme?.text || '#fff', fontWeight: '700', marginBottom: 4 },
  manualSubtitle: { color: theme?.textSecondary || '#9CA3AF', marginBottom: 8 },
  card: { backgroundColor: theme?.cardBackground || '#111827', borderRadius: 12, padding: 12, borderColor: theme?.border || '#1f2937', borderWidth: 1, marginBottom: 10 },
  text: { color: theme?.text || '#fff', marginBottom: 4 },
  input: { backgroundColor: theme?.surface || '#0b1220', color: theme?.text || '#fff', borderRadius: 8, borderWidth: 1, borderColor: theme?.border || '#1f2937', padding: 10, marginTop: 8 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 10 },
  approve: { backgroundColor: theme?.primary || '#00f5ff' },
  reject: { backgroundColor: theme?.error || '#ff0080' },
  searchButton: { backgroundColor: theme?.info || '#3B82F6', marginTop: 8 },
  inviteButton: { backgroundColor: '#F59E0B' },
  noticeText: { color: theme?.textSecondary || '#9CA3AF', marginTop: 6 },
  btnDisabled: { opacity: 0.6 },
  btnTextDark: { color: '#000', fontWeight: '800' },
  empty: { color: theme?.textSecondary || '#9CA3AF', textAlign: 'center', marginTop: 20 },
  searchResults: { marginTop: 8, borderRadius: 8, borderWidth: 1, borderColor: theme?.border || '#1f2937', overflow: 'hidden' },
  searchResultItem: { padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme?.border || '#1f2937' },
  searchResultSelected: { backgroundColor: theme?.primary ? `${theme.primary}22` : '#1f2937' },
  searchResultName: { color: theme?.text || '#fff', fontWeight: '600' },
  searchResultMeta: { color: theme?.textSecondary || '#9CA3AF', marginTop: 2 },
  selectedStudentCard: { marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: theme?.border || '#1f2937', backgroundColor: theme?.surface || '#0b1220' },
  selectedStudentLabel: { color: theme?.textSecondary || '#9CA3AF', fontSize: 12 },
  selectedStudentName: { color: theme?.text || '#fff', fontWeight: '700', marginTop: 2 },
  selectedStudentMeta: { color: theme?.textSecondary || '#9CA3AF', marginTop: 2 },
});
