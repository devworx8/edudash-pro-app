import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { useAlertModal, AlertModal } from '@/components/ui/AlertModal';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function TeacherProfileCompletionScreen() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { showAlert, alertProps } = useAlertModal();

  // Personal details
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState(''); // YYYY-MM-DD
  const [gender, setGender] = useState('');
  const [idNumber, setIdNumber] = useState('');

  // Employment
  const [department, setDepartment] = useState('');
  const [positionTitle, setPositionTitle] = useState('');
  const [employmentStart, setEmploymentStart] = useState(''); // YYYY-MM-DD

  // Emergency
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');

  // Education
  const [highestQualification, setHighestQualification] = useState('');
  const [qualificationYear, setQualificationYear] = useState('');
  const [experienceYears, setExperienceYears] = useState('');

  // Skills
  const [languagesSpoken, setLanguagesSpoken] = useState(''); // comma-separated
  const [subjectsTaught, setSubjectsTaught] = useState(''); // comma-separated
  const [ageGroupsTaught, setAgeGroupsTaught] = useState(''); // comma-separated
  const [biography, setBiography] = useState('');

  const [saving, setSaving] = useState(false);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { flexGrow: 1, padding: 16, gap: 12 },
    label: { color: theme.text, fontWeight: '600', marginTop: 6 },
    input: { backgroundColor: theme.surface, borderRadius: 10, padding: 12, color: theme.text, borderWidth: 1, borderColor: theme.border },
    textArea: { backgroundColor: theme.surface, borderRadius: 10, padding: 12, color: theme.text, borderWidth: 1, borderColor: theme.border, minHeight: 100, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: 10 },
    col: { flex: 1 },
    btn: { backgroundColor: theme.primary, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
    btnText: { color: theme.onPrimary, fontWeight: '800' },
    hint: { color: theme.textSecondary, fontSize: 12, marginBottom: 4 },
  }), [theme]);

  const parseCsv = (s: string) => s.split(',').map(v => v.trim()).filter(Boolean);

  const onSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      showAlert({ title: 'Missing info', message: 'Please provide your first and last name', type: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const supa = assertSupabase();
      const { data: authData, error: authErr } = await supa.auth.getUser();
      if (authErr) throw authErr;
      const authId = authData.user?.id;
      if (!authId) throw new Error('No authenticated user');

      // 1) profiles: upsert by id (which equals auth_user_id)
      const { data: existingProfile, error: profileSelErr } = await supa
        .from('profiles')
        .select('id')
        .eq('id', authId)
        .maybeSingle();
      if (profileSelErr) throw profileSelErr;

      const profilesPayload: any = {
        id: authId,
        email: profile?.email || null,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone || null,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        id_number: idNumber || null,
        department: department || null,
        position_title: positionTitle || null,
        employment_start_date: employmentStart || null,
        emergency_contact_name: emergencyName || null,
        emergency_contact_phone: emergencyPhone || null,
        emergency_contact_relationship: emergencyRelationship || null,
        highest_qualification: highestQualification || null,
        qualification_year: qualificationYear ? Number(qualificationYear) : null,
        teaching_experience_years: experienceYears ? Number(experienceYears) : null,
        languages_spoken: languagesSpoken ? parseCsv(languagesSpoken) : null,
        subjects_taught: subjectsTaught ? parseCsv(subjectsTaught) : null,
        age_groups_taught: ageGroupsTaught ? parseCsv(ageGroupsTaught) : null,
        biography: biography || null,
        organization_id: profile?.organization_id || null,
        preschool_id: profile?.organization_id || null,
        role: 'teacher',
      };

      if (existingProfile?.id) {
        const { error: profileUpdateErr } = await supa.from('profiles').update(profilesPayload).eq('id', authId);
        if (profileUpdateErr) throw profileUpdateErr;
      } else {
        const { error: profileInsertErr } = await supa
          .from('profiles')
          .insert(profilesPayload);
        if (profileInsertErr) throw profileInsertErr;
      }

      // 2) teachers: upsert by auth_user_id
      // 2) teachers: upsert by auth_user_id
      const { data: existingTeacher, error: teacherSelErr } = await supa
        .from('teachers')
        .select('id')
        .eq('auth_user_id', authId)
        .maybeSingle();
      if (teacherSelErr) throw teacherSelErr;

      const subjectSpec = subjectsTaught ? parseCsv(subjectsTaught).join(', ') : null;
      const teacherPayload: any = {
        auth_user_id: authId,
        user_id: authId,  // Use auth_user_id directly since profiles.id = auth_user_id
        preschool_id: profile?.organization_id || null,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: profile?.email || null,
        phone: phone || null,
        subject_specialization: subjectSpec,
        role: 'teacher',
        is_active: true,
      };

      if (existingTeacher?.id) {
        const { error: teacherUpdateErr } = await supa.from('teachers').update(teacherPayload).eq('id', existingTeacher.id);
        if (teacherUpdateErr) throw teacherUpdateErr;
      } else {
        const { error: teacherInsertErr } = await supa.from('teachers').insert(teacherPayload);
        if (teacherInsertErr) throw teacherInsertErr;
      }

      // Profile already updated above via profiles table upsert
      showAlert({ title: 'Saved', message: 'Your profile has been updated.', type: 'success' });
    } catch (e: any) {
      console.error('Teacher profile save error:', e);
      showAlert({ title: 'Failed to save', message: e?.message || 'Please try again', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Complete Teacher Profile', headerStyle: { backgroundColor: theme.background }, headerTitleStyle: { color: theme.text }, headerTintColor: theme.primary }} />
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>First name</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="e.g. Lerato" placeholderTextColor={theme.textSecondary} />

          <Text style={styles.label}>Last name</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="e.g. Mokoena" placeholderTextColor={theme.textSecondary} />

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Phone</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="e.g. +27 82 123 4567" placeholderTextColor={theme.textSecondary} />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Date of birth</Text>
              <Text style={styles.hint}>YYYY-MM-DD</Text>
              <TextInput style={styles.input} value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="1990-05-10" placeholderTextColor={theme.textSecondary} />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Gender</Text>
              <TextInput style={styles.input} value={gender} onChangeText={setGender} placeholder="Male / Female / Other" placeholderTextColor={theme.textSecondary} />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>ID / Passport</Text>
              <TextInput style={styles.input} value={idNumber} onChangeText={setIdNumber} placeholder="e.g. 8001015009087" placeholderTextColor={theme.textSecondary} />
            </View>
          </View>

          <Text style={styles.label}>Department</Text>
          <TextInput style={styles.input} value={department} onChangeText={setDepartment} placeholder="e.g. Sciences" placeholderTextColor={theme.textSecondary} />

          <Text style={styles.label}>Position title</Text>
          <TextInput style={styles.input} value={positionTitle} onChangeText={setPositionTitle} placeholder="e.g. Senior Teacher" placeholderTextColor={theme.textSecondary} />

          <Text style={styles.label}>Employment start date</Text>
          <Text style={styles.hint}>YYYY-MM-DD</Text>
          <TextInput style={styles.input} value={employmentStart} onChangeText={setEmploymentStart} placeholder="2022-01-15" placeholderTextColor={theme.textSecondary} />

          <Text style={styles.label}>Emergency contact name</Text>
          <TextInput style={styles.input} value={emergencyName} onChangeText={setEmergencyName} placeholder="e.g. Thandi Ndlovu" placeholderTextColor={theme.textSecondary} />

          <Text style={styles.label}>Emergency contact phone</Text>
          <TextInput style={styles.input} value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="e.g. +27 73 456 7890" placeholderTextColor={theme.textSecondary} />

          <Text style={styles.label}>Emergency contact relationship</Text>
          <TextInput style={styles.input} value={emergencyRelationship} onChangeText={setEmergencyRelationship} placeholder="e.g. Spouse, Sister" placeholderTextColor={theme.textSecondary} />

          <Text style={styles.label}>Highest qualification</Text>
          <TextInput style={styles.input} value={highestQualification} onChangeText={setHighestQualification} placeholder="e.g. B.Ed" placeholderTextColor={theme.textSecondary} />

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Qualification year</Text>
              <TextInput style={styles.input} value={qualificationYear} onChangeText={setQualificationYear} placeholder="e.g. 2015" keyboardType={Platform.OS === 'android' ? 'numeric' : 'number-pad'} placeholderTextColor={theme.textSecondary} />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Years of experience</Text>
              <TextInput style={styles.input} value={experienceYears} onChangeText={setExperienceYears} placeholder="e.g. 8" keyboardType={Platform.OS === 'android' ? 'numeric' : 'number-pad'} placeholderTextColor={theme.textSecondary} />
            </View>
          </View>

          <Text style={styles.label}>Languages spoken (comma-separated)</Text>
          <TextInput style={styles.input} value={languagesSpoken} onChangeText={setLanguagesSpoken} placeholder="e.g. English, isiZulu" placeholderTextColor={theme.textSecondary} />

          <Text style={styles.label}>Subjects taught (comma-separated)</Text>
          <TextInput style={styles.input} value={subjectsTaught} onChangeText={setSubjectsTaught} placeholder="e.g. Mathematics, Physical Science" placeholderTextColor={theme.textSecondary} />

          <Text style={styles.label}>Age groups taught (comma-separated)</Text>
          <TextInput style={styles.input} value={ageGroupsTaught} onChangeText={setAgeGroupsTaught} placeholder="e.g. Grade 8, Grade 9" placeholderTextColor={theme.textSecondary} />

          <Text style={styles.label}>Short biography</Text>
          <TextInput style={styles.textArea} value={biography} onChangeText={setBiography} placeholder="Tell us a bit about your teaching journey" placeholderTextColor={theme.textSecondary} multiline />

          <TouchableOpacity style={styles.btn} onPress={onSave} disabled={saving}>
            {saving ? <EduDashSpinner color={theme.onPrimary} /> : <Text style={styles.btnText}>Save Profile</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
      <AlertModal {...alertProps} />
    </View>
  );
}
