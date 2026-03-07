'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { BirthdayChartWeb, type WebStudentBirthday } from '@/components/dashboard/parent/BirthdayChartWeb';
import { calculateAgeOnDate, getNextBirthdayDate, parseDateOnly } from '@/lib/utils/dateUtils';

interface StudentRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  class_id: string | null;
  avatar_url: string | null;
  classes?: { name?: string | null } | Array<{ name?: string | null }> | null;
}

export default function ParentBirthdayChartPage() {
  const router = useRouter();
  const { t } = useTranslation('common');
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [birthdays, setBirthdays] = useState<WebStudentBirthday[]>([]);
  const [tenantSlug, setTenantSlug] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.push('/sign-in');
        return;
      }

      const userId = session.user.id;
      setUserEmail(session.user.email || '');

      const { data: profileById } = await supabase
        .from('profiles')
        .select('id, auth_user_id, first_name, last_name, preschool_name, organization_name')
        .eq('id', userId)
        .maybeSingle();

      const { data: profileByAuth } = profileById
        ? { data: null }
        : await supabase
            .from('profiles')
            .select('id, auth_user_id, first_name, last_name, preschool_name, organization_name')
            .eq('auth_user_id', userId)
            .maybeSingle();

      const profile = profileById || profileByAuth;

      if (profile?.first_name || profile?.last_name) {
        setUserName(`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim());
      }

      setTenantSlug(profile?.preschool_name || profile?.organization_name || '');

      // Get organization ID from parent's children to load ALL birthdays in school
      // This allows parents to see all students' upcoming birthdays and plan ahead
      const resolvedParentId = profile?.id || userId;
      const resolvedAuthUserId = profile?.auth_user_id || userId;
      const parentFilters = [
        `parent_id.eq.${resolvedParentId}`,
        `guardian_id.eq.${resolvedParentId}`,
      ];
      if (resolvedAuthUserId && resolvedAuthUserId !== resolvedParentId) {
        parentFilters.push(`parent_id.eq.${resolvedAuthUserId}`);
        parentFilters.push(`guardian_id.eq.${resolvedAuthUserId}`);
      }

      // First, get one of the parent's children to determine the organization
      const { data: firstChild } = await supabase
        .from('students')
        .select('organization_id, preschool_id')
        .or(parentFilters.join(','))
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const organizationId = firstChild?.organization_id || firstChild?.preschool_id;

      if (!organizationId) {
        console.warn('[ParentBirthdayChart] No organization found from parent children');
        setBirthdays([]);
        setLoading(false);
        return;
      }

      // Load ALL students' birthdays in the organization (not just parent's children)
      // Parents can see general info (name, class, birthday) to plan ahead for classmates
      const allStudentsQuery = supabase
        .from('students')
        .select('id, first_name, last_name, date_of_birth, class_id, avatar_url, classes!students_class_id_fkey(name)')
        .or(`organization_id.eq.${organizationId},preschool_id.eq.${organizationId}`)
        .eq('is_active', true)
        .not('date_of_birth', 'is', null);

      const { data: allStudents } = await allStudentsQuery;
      const allChildren = (allStudents || []) as StudentRow[];

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const mapped: WebStudentBirthday[] = allChildren.map((row: StudentRow): WebStudentBirthday => {
        const dob = row.date_of_birth || '';
        const nextBirthday = dob ? getNextBirthdayDate(dob, today) : null;
        const ageTurning = dob && nextBirthday ? calculateAgeOnDate(dob, nextBirthday) : 0;
        const classData = Array.isArray(row.classes) ? row.classes[0] : row.classes;
        return {
          id: `birthday-${row.id}`,
          studentId: row.id,
          firstName: row.first_name || t('birthdayChart.studentFallback'),
          lastName: row.last_name || '',
          dateOfBirth: dob,
          ageTurning,
          className: classData?.name || null,
        };
      });

      mapped.sort((a: WebStudentBirthday, b: WebStudentBirthday) => {
        const aDate = parseDateOnly(a.dateOfBirth);
        const bDate = parseDateOnly(b.dateOfBirth);
        if (!aDate || !bDate) return 0;
        const monthDiff = aDate.getMonth() - bDate.getMonth();
        if (monthDiff !== 0) return monthDiff;
        return aDate.getDate() - bDate.getDate();
      });

      setBirthdays(mapped);
      setLoading(false);
    };

    void load();
  }, [router, supabase, t]);

function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

  return (
    <ParentShell tenantSlug={tenantSlug} userEmail={userEmail} userName={userName}>
      <div className="app" style={{ padding: 20 }}>
        {loading ? (
          <div className="card">
            <div className="sectionTitle">{t('birthdayChart.title')}</div>
            <div className="muted">{t('birthdayChart.loading')}</div>
          </div>
        ) : (
          <BirthdayChartWeb
            birthdays={birthdays}
            onViewMemories={(birthday) => {
              const eventDate = new Date(birthday.dateOfBirth || Date.now()).toISOString().slice(0, 10);
              const params = new URLSearchParams();
              params.set('birthdayStudentId', birthday.studentId);
              params.set('eventDate', eventDate);
              router.push(`/dashboard/parent/birthday-memories?${params.toString()}`);
            }}
          />
        )}
      </div>
    </ParentShell>
  );
}
