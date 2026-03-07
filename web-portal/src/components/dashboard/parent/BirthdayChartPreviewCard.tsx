'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
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

interface BirthdayChartPreviewCardProps {
  organizationId?: string | null;
}

export function BirthdayChartPreviewCard({ organizationId }: BirthdayChartPreviewCardProps) {
  const { t } = useTranslation('common');
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [birthdays, setBirthdays] = useState<WebStudentBirthday[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!organizationId) {
        if (isMounted) {
          setBirthdays([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('students')
        .select('id, first_name, last_name, date_of_birth, class_id, avatar_url, classes!students_class_id_fkey(name)')
        .or(`organization_id.eq.${organizationId},preschool_id.eq.${organizationId}`)
        .eq('is_active', true)
        .not('date_of_birth', 'is', null);

      if (!isMounted) return;

      if (fetchError) {
        setBirthdays([]);
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const mapped: WebStudentBirthday[] = (data || []).map((row: StudentRow): WebStudentBirthday => {
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

    return () => {
      isMounted = false;
    };
  }, [organizationId, supabase, t]);

  if (loading) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div className="sectionTitle">{t('birthdayChart.title')}</div>
        <div className="muted">{t('birthdayChart.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div className="sectionTitle">{t('birthdayChart.title')}</div>
        <div className="muted">{t('birthdayChart.noneThisMonth')}</div>
      </div>
    );
  }

  if (birthdays.length === 0) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div className="sectionTitle">{t('birthdayChart.title')}</div>
        <div className="muted">{t('birthdayChart.noneThisMonth')}</div>
      </div>
    );
  }

  return <BirthdayChartWeb birthdays={birthdays} />;
}
