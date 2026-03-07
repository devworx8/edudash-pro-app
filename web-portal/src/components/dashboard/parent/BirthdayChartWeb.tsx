'use client';

import { useMemo, useState } from 'react';
import { Cake, PartyPopper } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parseDateOnly } from '@/lib/utils/dateUtils';

export interface WebStudentBirthday {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  ageTurning: number;
  className?: string | null;
}

interface BirthdayChartWebProps {
  birthdays: WebStudentBirthday[];
  onViewMemories?: (birthday: WebStudentBirthday) => void;
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index);

export function BirthdayChartWeb({ birthdays, onViewMemories }: BirthdayChartWebProps) {
  const { t, i18n } = useTranslation('common');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const today = new Date();
  const todayMonth = today.getMonth();
  const todayDate = today.getDate();
  const monthLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language || 'en', { month: 'long' });
    return MONTHS.map((monthIndex) => formatter.format(new Date(2020, monthIndex, 1)));
  }, [i18n.language]);

  const grouped = useMemo(() => {
    const map = new Map<number, WebStudentBirthday[]>();
    birthdays.forEach((b) => {
      const dob = parseDateOnly(b.dateOfBirth);
      if (!dob) return;
      const month = dob.getMonth();
      const list = map.get(month) || [];
      list.push(b);
      map.set(month, list);
    });

    for (let i = 0; i < 12; i += 1) {
      const list = map.get(i) || [];
      list.sort((a, b) => {
        const aDate = parseDateOnly(a.dateOfBirth);
        const bDate = parseDateOnly(b.dateOfBirth);
        if (!aDate || !bDate) return 0;
        return aDate.getDate() - bDate.getDate();
      });
      map.set(i, list);
    }

    return map;
  }, [birthdays]);

  const todaysBirthdays = useMemo(() => {
    return birthdays.filter((b) => {
      const dob = parseDateOnly(b.dateOfBirth);
      return dob && dob.getMonth() === todayMonth && dob.getDate() === todayDate;
    });
  }, [birthdays, todayMonth, todayDate]);

  const selectedList = selectedMonth !== null ? grouped.get(selectedMonth) || [] : [];

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <PartyPopper size={20} style={{ color: 'var(--primary)' }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{t('birthdayChart.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {birthdays.length === 1
              ? t('birthdayChart.totalStudentsSingle', { count: birthdays.length })
              : t('birthdayChart.totalStudentsMultiple', { count: birthdays.length })}
          </div>
        </div>
      </div>

      {todaysBirthdays.length > 0 && (
        <div style={{
          padding: 12,
          borderRadius: 12,
          background: 'rgba(34, 197, 94, 0.12)',
          color: '#22c55e',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontWeight: 600
        }}>
          <Cake size={16} />
          {todaysBirthdays.length === 1
            ? t('birthdayChart.todaySingle', { name: todaysBirthdays[0].firstName })
            : t('birthdayChart.todayMultiple', { count: todaysBirthdays.length })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {MONTHS.map((monthIndex, index) => {
          const list = grouped.get(index) || [];
          const isSelected = selectedMonth === index;
          const isCurrent = index === todayMonth;
          return (
            <button
              key={monthIndex}
              onClick={() => setSelectedMonth(isSelected ? null : index)}
              style={{
                padding: 12,
                borderRadius: 14,
                border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: isSelected ? 'rgba(124, 58, 237, 0.12)' : 'var(--surface-2)',
                color: 'var(--text)',
                textAlign: 'left',
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{monthLabels[index]}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {list.length === 1
                  ? t('birthdayChart.monthBirthdaysSingle', { count: list.length })
                  : t('birthdayChart.monthBirthdaysMultiple', { count: list.length })}
              </div>
              {isCurrent && (
                <span style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  fontSize: 10,
                  color: 'var(--primary)',
                  fontWeight: 600
                }}>
                  {t('birthdayChart.thisMonth')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedMonth !== null && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            {t('birthdayChart.monthHeading', { month: monthLabels[selectedMonth] })}
          </div>
          {selectedList.length === 0 ? (
            <div className="muted">{t('birthdayChart.noneThisMonth')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {selectedList.map((b) => (
                <div key={b.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 10,
                  borderRadius: 12,
                  border: '1px solid var(--border)'
                }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600
                  }}>
                    {b.firstName.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{b.firstName} {b.lastName}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {t('birthdayChart.turning', { age: b.ageTurning })}{b.className ? ` • ${b.className}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <div style={{ fontSize: 12, color: 'var(--primary)' }}>{
                      parseDateOnly(b.dateOfBirth)?.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                    }</div>
                    {onViewMemories && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => onViewMemories(b)}
                        style={{ padding: '4px 10px', fontSize: 11 }}
                      >
                        Memories
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
