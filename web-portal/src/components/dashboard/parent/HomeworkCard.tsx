'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { FileText, Clock, Calendar, ArrowRight, CheckCircle } from 'lucide-react';
import { usePendingHomework } from '@/lib/hooks/parent/usePendingHomework';

interface HomeworkCardProps {
  userId: string;
}

export function HomeworkCard({ userId }: HomeworkCardProps) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { pendingHomework, loading, count } = usePendingHomework(userId);

  // Get the most urgent homework (closest due date)
  const urgentHomework = pendingHomework
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 3);

  const getDueStatus = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: t('dashboard.parent.homework_card.status.overdue', { defaultValue: 'Overdue' }), color: '#ef4444', urgent: true };
    } else if (diffDays === 0) {
      return { text: t('dashboard.parent.homework_card.status.due_today', { defaultValue: 'Due today' }), color: '#f59e0b', urgent: true };
    } else if (diffDays === 1) {
      return { text: t('dashboard.parent.homework_card.status.due_tomorrow', { defaultValue: 'Due tomorrow' }), color: '#f59e0b', urgent: false };
    } else if (diffDays <= 3) {
      return { text: t('dashboard.parent.homework_card.status.days_left', { defaultValue: '{{count}} days left', count: diffDays }), color: '#10b981', urgent: false };
    } else {
      return { text: new Date(dueDate).toLocaleDateString(i18n.language || 'en-ZA', { month: 'short', day: 'numeric' }), color: 'var(--muted)', urgent: false };
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '24px' }}>
        <div className="loading-skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{
        padding: '24px',
        background: count > 0 
          ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(236, 72, 153, 0.05) 100%)'
          : 'var(--surface)',
        border: count > 0 ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid var(--border)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '12px',
              background: count > 0
                ? 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)'
                : 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <FileText size={24} color="white" />
            {count > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  background: '#ef4444',
                  color: 'white',
                  borderRadius: '50%',
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                }}
              >
                {count}
              </div>
            )}
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
              {t('dashboard.parent.homework_card.title', { defaultValue: 'Homework' })}
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--muted)', margin: '2px 0 0 0' }}>
              {count === 0
                ? t('dashboard.parent.homework_card.summary.all_caught_up', { defaultValue: 'All caught up! 🎉' })
                : t('dashboard.parent.homework_card.summary.assignments_pending', {
                    defaultValue: '{{count}} assignment pending',
                    count,
                  })}
            </p>
          </div>
        </div>
        <button
          onClick={() => router.push('/dashboard/parent/homework')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 8,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <ArrowRight size={20} color="var(--primary)" />
        </button>
      </div>

      {/* Homework List or Empty State */}
      {count === 0 ? (
        <div
          style={{
            padding: '32px 20px',
            textAlign: 'center',
            background: 'var(--surface-2)',
            borderRadius: '12px',
          }}
        >
          <CheckCircle size={48} color="#10b981" style={{ marginBottom: '12px', opacity: 0.8 }} />
          <p style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 500, margin: '0 0 4px 0' }}>
            {t('dashboard.parent.homework_card.empty.title', { defaultValue: 'No pending homework' })}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>
            {t('dashboard.parent.homework_card.empty.description', { defaultValue: 'Check back later for new assignments' })}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {urgentHomework.map((hw) => {
            const dueStatus = getDueStatus(hw.due_date);
            return (
              <div
                key={hw.id}
                onClick={() => router.push(`/dashboard/parent/homework/${hw.id}`)}
                style={{
                  padding: '16px',
                  background: 'var(--surface)',
                  borderRadius: '12px',
                  border: dueStatus.urgent ? `2px solid ${dueStatus.color}` : '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateX(4px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      margin: '0 0 4px 0',
                      color: 'var(--text)',
                    }}>
                      {hw.title}
                    </h4>
                    {hw.subject && (
                      <p style={{
                        fontSize: '12px',
                        color: 'var(--muted)',
                        margin: '0 0 8px 0',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: 600,
                      }}>
                        {hw.subject}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: dueStatus.color }}>
                      {dueStatus.urgent ? <Clock size={14} /> : <Calendar size={14} />}
                      <span style={{ fontWeight: 600 }}>{dueStatus.text}</span>
                    </div>
                  </div>
                  <ArrowRight size={18} color="var(--muted)" />
                </div>
              </div>
            );
          })}

          {count > 3 && (
            <button
              onClick={() => router.push('/dashboard/parent/homework')}
              style={{
                width: '100%',
                padding: '12px',
                background: 'transparent',
                border: '2px dashed var(--border)',
                borderRadius: '12px',
                color: 'var(--primary)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-2)';
                e.currentTarget.style.borderColor = 'var(--primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              {t('dashboard.parent.homework_card.view_more', {
                defaultValue: 'View {{count}} more assignment',
                count: count - 3,
              })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
