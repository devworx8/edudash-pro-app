import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useTeacherStudents, type TeacherStudentSummary } from '@/hooks/useTeacherStudents';
import { BirthdayDonationsService } from '@/features/birthday-donations/services/BirthdayDonationsService';
import type { BirthdayDonationEntry } from '@/features/birthday-donations/types/birthdayDonations.types';
import { assertSupabase } from '@/lib/supabase';
import { getOrganizationType } from '@/lib/tenant/compat';
import {
  DEFAULT_AMOUNT,
  formatDateKey,
  getBirthdayWindow,
  getCelebrationFriday,
} from './types';
import type { BirthdayWindowMode, PaymentMethod, StudentRow } from './types';

export function useBirthdayDonationData({ organizationId }: { organizationId?: string | null }) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const orgType = useMemo(() => getOrganizationType(profile), [profile]);
  const isPreschool = orgType === 'preschool';
  const normalizedRole = String(profile?.role || '').toLowerCase().trim();
  const isTeacherRole = normalizedRole === 'teacher';
  const canManageDonations = ['teacher', 'principal', 'principal_admin', 'admin', 'super_admin', 'org_admin'].includes(normalizedRole);
  const canToggleSchoolWide = canManageDonations && isTeacherRole;
  const [useSchoolWide, setUseSchoolWide] = useState(canManageDonations && !isTeacherRole);

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedBirthdayKey, setSelectedBirthdayKey] = useState<string | null>(null);
  const [birthdayWindowMode, setBirthdayWindowMode] = useState<BirthdayWindowMode>('upcoming');
  const [useFridayCelebration, setUseFridayCelebration] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [reminderClassId, setReminderClassId] = useState<string>('all');
  const [donations, setDonations] = useState<BirthdayDonationEntry[]>([]);
  const [loadingDonations, setLoadingDonations] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schoolStudents, setSchoolStudents] = useState<TeacherStudentSummary[]>([]);
  const [loadingSchoolStudents, setLoadingSchoolStudents] = useState(false);

  useEffect(() => {
    if (!canManageDonations) {
      setUseSchoolWide(false);
      return;
    }
    if (!canToggleSchoolWide) {
      setUseSchoolWide(true);
    }
  }, [canManageDonations, canToggleSchoolWide]);

  // ── Student data ─────────────────────────────────────────────────────────
  const { students: teacherStudents, loading: teacherStudentsLoading } = useTeacherStudents({
    teacherId: user?.id || null, organizationId, limit: 0,
  });

  const loadSchoolStudents = useCallback(async () => {
    if (!organizationId) return;
    setLoadingSchoolStudents(true);
    setError(null);
    try {
      const { data, error: qErr } = await assertSupabase()
        .from('students')
        .select('id, first_name, last_name, avatar_url, date_of_birth, class_id, parent_id, guardian_id, classes(name)')
        .or(`preschool_id.eq.${organizationId},organization_id.eq.${organizationId}`)
        .eq('is_active', true)
        .order('first_name');
      if (qErr) throw new Error(qErr.message);
      setSchoolStudents(((data as StudentRow[] | null) || []).map((s) => ({
        id: s.id, firstName: s.first_name || 'Child', lastName: s.last_name || '',
        avatarUrl: s.avatar_url ?? null, dateOfBirth: s.date_of_birth ?? null,
        className: s.classes?.name ?? null, classId: s.class_id ?? null,
        parentId: s.parent_id ?? null, guardianId: s.guardian_id ?? null,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setLoadingSchoolStudents(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (useSchoolWide) void loadSchoolStudents();
  }, [useSchoolWide, loadSchoolStudents]);

  const activeStudents = useSchoolWide ? schoolStudents : teacherStudents;
  const activeStudentsLoading = useSchoolWide ? loadingSchoolStudents : teacherStudentsLoading;
  const teacherStudentIds = useMemo(() => new Set(teacherStudents.map((s) => s.id)), [teacherStudents]);

  // ── Class groups ─────────────────────────────────────────────────────────
  const unassignedLabel = t('dashboard.class_unassigned', { defaultValue: 'Unassigned' });

  const classGroups = useMemo(() => {
    if (useSchoolWide) return [];
    const groups = new Map<string, { id: string; name: string; students: TeacherStudentSummary[] }>();
    activeStudents.forEach((s) => {
      const cid = s.classId || 'unassigned';
      const cn = s.className || unassignedLabel;
      const g = groups.get(cid) || { id: cid, name: cn, students: [] };
      g.students.push(s);
      groups.set(cid, g);
    });
    return Array.from(groups.values());
  }, [activeStudents, useSchoolWide, unassignedLabel]);

  useEffect(() => {
    if (!useSchoolWide && !selectedClassId && classGroups.length > 0) setSelectedClassId(classGroups[0].id);
  }, [classGroups, useSchoolWide, selectedClassId]);

  const selectedClass = useMemo(
    () => classGroups.find((g) => g.id === selectedClassId) || null,
    [classGroups, selectedClassId],
  );

  const reminderClassGroups = useMemo(() => {
    if (!useSchoolWide) return [];
    const groups = new Map<string, { id: string; name: string; students: TeacherStudentSummary[] }>();
    schoolStudents.forEach((s) => {
      const cid = s.classId || 'unassigned';
      const cn = s.className || unassignedLabel;
      const g = groups.get(cid) || { id: cid, name: cn, students: [] };
      g.students.push(s);
      groups.set(cid, g);
    });
    return Array.from(groups.values());
  }, [useSchoolWide, schoolStudents, unassignedLabel]);

  useEffect(() => {
    if (!useSchoolWide || reminderClassId === 'all') return;
    if (!reminderClassGroups.some((g) => g.id === reminderClassId)) setReminderClassId('all');
  }, [useSchoolWide, reminderClassGroups, reminderClassId]);

  // ── Birthday window ──────────────────────────────────────────────────────
  const classStudents = selectedClass?.students ?? [];
  const birthdaySourceStudents = useSchoolWide ? schoolStudents : classStudents;
  const upcomingBirthdays = useMemo(
    () => getBirthdayWindow(birthdaySourceStudents, birthdayWindowMode),
    [birthdaySourceStudents, birthdayWindowMode],
  );

  useEffect(() => {
    if (upcomingBirthdays.length === 0) {
      if (selectedBirthdayKey !== null) setSelectedBirthdayKey(null);
      return;
    }
    if (!selectedBirthdayKey || !upcomingBirthdays.some((e) => e.key === selectedBirthdayKey)) {
      setSelectedBirthdayKey(upcomingBirthdays[0].key);
    }
  }, [selectedBirthdayKey, upcomingBirthdays]);

  const selectedBirthday = useMemo(
    () => upcomingBirthdays.find((e) => e.key === selectedBirthdayKey) || upcomingBirthdays[0] || null,
    [selectedBirthdayKey, upcomingBirthdays],
  );

  const celebrationDate = useMemo(
    () => (selectedBirthday && isPreschool && useFridayCelebration ? getCelebrationFriday(selectedBirthday.date) : null),
    [selectedBirthday, isPreschool, useFridayCelebration],
  );

  const donationDate = selectedBirthday ? formatDateKey(celebrationDate ?? selectedBirthday.date) : null;
  const classIdForRecord = !useSchoolWide
    ? (selectedClassId && selectedClassId !== 'unassigned' ? selectedClassId : selectedBirthday?.student.classId ?? undefined)
    : undefined;

  const emptyMessage = useMemo(() => {
    const scope = useSchoolWide;
    if (birthdayWindowMode === 'recent') {
      return t(scope ? 'dashboard.birthday_donations.no_birthdays_recent_school' : 'dashboard.birthday_donations.no_birthdays_recent', {
        defaultValue: scope ? 'No recent birthdays for the school.' : 'No recent birthdays for this class.',
      });
    }
    if (birthdayWindowMode === 'all') {
      return t(scope ? 'dashboard.birthday_donations.no_birthdays_all_school' : 'dashboard.birthday_donations.no_birthdays_all', {
        defaultValue: scope ? 'No birthdays found for the selected range.' : 'No birthdays found for the selected range.',
      });
    }
    return t(scope ? 'dashboard.birthday_donations.no_birthdays_school' : 'dashboard.birthday_donations.no_birthdays', {
      defaultValue: scope ? 'No upcoming birthdays for the school.' : 'No upcoming birthdays for this class.',
    });
  }, [birthdayWindowMode, useSchoolWide, t]);

  // ── Donations data ───────────────────────────────────────────────────────
  const loadDonations = useCallback(async () => {
    if (!organizationId || !donationDate || !selectedBirthday) return;
    setLoadingDonations(true);
    setError(null);
    try {
      const data = await BirthdayDonationsService.getDonationsForBirthday(
        organizationId, donationDate, selectedBirthday.student.id, classIdForRecord,
      );
      setDonations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load donations');
    } finally {
      setLoadingDonations(false);
    }
  }, [organizationId, donationDate, selectedBirthday, classIdForRecord]);

  useEffect(() => { void loadDonations(); }, [loadDonations]);

  const visibleDonations = useMemo(
    () => (isPreschool && !useSchoolWide
      ? donations.filter((e) => !e.payerStudentId || teacherStudentIds.has(e.payerStudentId))
      : donations),
    [donations, isPreschool, useSchoolWide, teacherStudentIds],
  );

  const paidStudentIds = useMemo(
    () => new Set(visibleDonations.map((e) => e.payerStudentId).filter((id): id is string => Boolean(id))),
    [visibleDonations],
  );

  const paidEntriesByStudentId = useMemo(() => {
    const map = new Map<string, BirthdayDonationEntry>();
    visibleDonations.forEach((e) => { if (e.payerStudentId) map.set(e.payerStudentId, e); });
    return map;
  }, [visibleDonations]);

  const payerStudents = useMemo(
    () => birthdaySourceStudents.filter((s) => s.id !== selectedBirthday?.student.id),
    [birthdaySourceStudents, selectedBirthday],
  );

  const paidStudents = payerStudents.filter((s) => paidStudentIds.has(s.id));
  const unpaidStudents = payerStudents.filter((s) => !paidStudentIds.has(s.id));

  const reminderUnpaidStudents = useMemo(() => {
    if (!useSchoolWide || reminderClassId === 'all') return unpaidStudents;
    return unpaidStudents.filter((s) => (s.classId || 'unassigned') === reminderClassId);
  }, [useSchoolWide, reminderClassId, unpaidStudents]);

  const reminderParentIds = useMemo(() => {
    const ids = new Set<string>();
    reminderUnpaidStudents.forEach((s) => {
      if (s.parentId) ids.add(s.parentId);
      if (s.guardianId) ids.add(s.guardianId);
    });
    return Array.from(ids);
  }, [reminderUnpaidStudents]);

  // ── Summary amounts ──────────────────────────────────────────────────────
  const schoolPayerCount = useMemo(
    () => birthdaySourceStudents.filter((s) => s.id !== selectedBirthday?.student.id).length,
    [birthdaySourceStudents, selectedBirthday],
  );
  const classExpectedAmount = payerStudents.length * DEFAULT_AMOUNT;
  const expectedAmount = isPreschool && useSchoolWide ? schoolPayerCount * DEFAULT_AMOUNT : classExpectedAmount;
  const totalReceived = (useSchoolWide ? donations : visibleDonations).reduce((sum, e) => sum + e.amount, 0);
  const classReceived = visibleDonations.reduce((sum, e) => sum + e.amount, 0);
  const remainingAmount = Math.max(expectedAmount - totalReceived, 0);

  return {
    user, isPreschool, useSchoolWide, setUseSchoolWide, canToggleSchoolWide,
    selectedClassId, setSelectedClassId, classGroups, selectedClass,
    reminderClassId, setReminderClassId, reminderClassGroups,
    birthdayWindowMode, setBirthdayWindowMode,
    useFridayCelebration, setUseFridayCelebration,
    selectedBirthdayKey, setSelectedBirthdayKey,
    upcomingBirthdays, selectedBirthday, celebrationDate,
    donationDate, classIdForRecord, emptyMessage,
    paymentMethod, setPaymentMethod,
    activeStudentsLoading, loadingDonations, savingId, setSavingId,
    sendingReminders, setSendingReminders, error, setError,
    loadDonations, paidStudents, unpaidStudents, paidEntriesByStudentId,
    reminderUnpaidStudents, reminderParentIds,
    expectedAmount, totalReceived, classReceived, remainingAmount, classExpectedAmount,
  };
}
