'use client';

import { BookOpen, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ExamWeekBannerProps {
  onStartExamPrep: () => void;
}

export function ExamWeekBanner({ onStartExamPrep }: ExamWeekBannerProps) {
  const { t } = useTranslation();

  return (
    <div
      className="card"
      style={{
        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        color: 'white',
        padding: '16px 20px',
        marginBottom: 16,
        cursor: 'pointer',
        border: '2px solid #a5b4fc',
        boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)'
      }}
      onClick={onStartExamPrep}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <BookOpen size={32} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{
            fontWeight: 800,
            fontSize: 16,
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <Zap size={16} />
            {t('dashboard.parent.exam_week.title', { defaultValue: 'EXAM MODE' })}
          </div>
          <div style={{ fontSize: 13, opacity: 0.95, lineHeight: 1.4 }}>
            {t('dashboard.parent.exam_week.description', { defaultValue: 'Practice tests, revision notes & last-minute tips to ace your exams!' })}
          </div>
        </div>
        <button
          style={{
            background: 'white',
            color: '#4f46e5',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
          onClick={(e) => {
            e.stopPropagation();
            onStartExamPrep();
          }}
        >
          <BookOpen size={14} />
          {t('dashboard.parent.exam_week.cta', { defaultValue: 'Start Exam Prep' })}
        </button>
      </div>
    </div>
  );
}
