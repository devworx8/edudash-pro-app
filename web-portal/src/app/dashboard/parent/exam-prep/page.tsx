'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { useParentDashboardData } from '@/lib/hooks/useParentDashboardData';
import { getGradeNumber, isExamEligibleChild } from '@/lib/utils/gradeUtils';
import { BookOpen, Target, FileText, Sparkles } from 'lucide-react';

const GRADES = [
  { value: 'grade_4', label: 'Grade 4' },
  { value: 'grade_5', label: 'Grade 5' },
  { value: 'grade_6', label: 'Grade 6' },
  { value: 'grade_7', label: 'Grade 7' },
  { value: 'grade_8', label: 'Grade 8' },
  { value: 'grade_9', label: 'Grade 9' },
  { value: 'grade_10', label: 'Grade 10' },
  { value: 'grade_11', label: 'Grade 11' },
  { value: 'grade_12', label: 'Grade 12' },
];

const SUBJECTS = [
  'Mathematics',
  'Physical Sciences',
  'Life Sciences',
  'English',
  'Afrikaans',
  'History',
  'Geography',
  'Accounting',
  'Business Studies',
  'Economics',
  'Computer Applications Technology',
];

export default function ExamPrepPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    profile,
    userName,
    preschoolName,
    hasOrganization,
    unreadCount,
    loading,
    childrenCards,
    activeChildId,
  } = useParentDashboardData();

  const activeChild = useMemo(
    () => childrenCards.find((child) => child.id === activeChildId),
    [childrenCards, activeChildId]
  );
  const hasExamEligibleChild = useMemo(() => {
    if (!activeChild) return false;
    return isExamEligibleChild(activeChild.grade, activeChild.dateOfBirth);
  }, [activeChild]);
  
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [examType, setExamType] = useState<'practice_test' | 'revision_notes'>('practice_test');

  const resolveActiveChildGradeParam = (): string => {
    const gradeNumber = getGradeNumber(activeChild?.grade);
    if (gradeNumber >= 4 && gradeNumber <= 12) {
      return `grade_${gradeNumber}`;
    }
    return '';
  };

  const quickLaunchGradeParam = resolveActiveChildGradeParam() || selectedGrade || 'grade_6';
  const quickLaunchGradeLabel =
    GRADES.find((grade) => grade.value === quickLaunchGradeParam)?.label || 'Selected Grade';
  const quickLaunchSubjectLabel = selectedSubject || 'Afrikaans';

  const handleGenerate = () => {
    if (!selectedGrade || !selectedSubject) {
      alert('Please select both grade and subject');
      return;
    }

    const params = new URLSearchParams();
    params.set('grade', selectedGrade);
    params.set('subject', selectedSubject);
    params.set('type', examType);

    if (activeChild?.id) params.set('studentId', activeChild.id);
    if (activeChild?.classId) params.set('classId', activeChild.classId);
    if (profile?.organizationId || profile?.preschoolId) {
      params.set('schoolId', profile.organizationId || profile.preschoolId || '');
    }
    const childName = [activeChild?.firstName, activeChild?.lastName].filter(Boolean).join(' ').trim();
    if (childName) params.set('childName', childName);
    
    router.push(`/dashboard/parent/generate-exam?${params.toString()}`);
  };

  const handleViewHistory = () => {
    router.push('/dashboard/parent/my-exams');
  };

  const handleQuickStartAfrikaansLive = () => {
    const params = new URLSearchParams();
    const activeChildGrade = resolveActiveChildGradeParam();
    const gradeToUse = activeChildGrade || selectedGrade || 'grade_6';
    params.set('grade', gradeToUse);
    params.set('subject', selectedSubject || 'Afrikaans');
    params.set('type', 'practice_test');
    params.set('language', 'af-ZA');
    params.set('useTeacherContext', '1');

    if (activeChild?.id) params.set('studentId', activeChild.id);
    if (activeChild?.classId) params.set('classId', activeChild.classId);
    if (profile?.organizationId || profile?.preschoolId) {
      params.set('schoolId', profile.organizationId || profile.preschoolId || '');
    }
    const childName = [activeChild?.firstName, activeChild?.lastName].filter(Boolean).join(' ').trim();
    if (childName) params.set('childName', childName);

    router.push(`/dashboard/parent/generate-exam?${params.toString()}`);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!hasExamEligibleChild) {
    return (
      <ParentShell
        userEmail={profile?.email}
        userName={userName}
        preschoolName={preschoolName}
        unreadCount={unreadCount}
        hasOrganization={hasOrganization}
        hideHeader={true}
      >
        <div style={{ padding: 'var(--space-4)', maxWidth: '720px', margin: '0 auto' }}>
          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: 8 }}>
              {t('dashboard.parent.exam_prep.locked.title', { defaultValue: 'Exam Prep Locked' })}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: 16 }}>
              {t('dashboard.parent.exam_prep.locked.description', { defaultValue: 'Exam prep is available for Grade 4+ school-age learners. Link a Grade 4 or higher child to unlock this section.' })}
            </p>
            <button
              className="btn btnSecondary"
              onClick={() => router.push('/dashboard/parent')}
            >
              {t('dashboard.parent.exam_prep.locked.cta', { defaultValue: 'Back to Dashboard' })}
            </button>
          </div>
        </div>
      </ParentShell>
    );
  }

  return (
    <ParentShell
      userEmail={profile?.email}
      userName={userName}
      preschoolName={preschoolName}
      unreadCount={unreadCount}
      hasOrganization={hasOrganization}
      hideHeader={true}
    >
      <div style={{ padding: 'var(--space-4)', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>
            📚 Exam Prep
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Generate CAPS-aligned practice exams, revision notes, and study materials
          </p>
        </div>

        {/* Main Card */}
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div
            style={{
              marginBottom: 'var(--space-4)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '14px',
              background: 'var(--surface-1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Sparkles className="icon16" />
              <span style={{ fontWeight: 700, fontSize: '14px' }}>Quick Live Session</span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '10px' }}>
              Open interactive in-canvas practice for {quickLaunchGradeLabel} • {quickLaunchSubjectLabel} with instant correct/incorrect markers and explanations.
            </p>
            <button
              onClick={handleQuickStartAfrikaansLive}
              className="btn btnPrimary"
              style={{ width: '100%' }}
            >
              <Sparkles className="icon16" />
              Start Live Practice: {quickLaunchGradeLabel}
            </button>
          </div>

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>
              Grade Level
            </label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="select-input"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface-1)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <option value="">Select Grade</option>
              {GRADES.map(g => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>
              Subject
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="select-input"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface-1)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <option value="">Select Subject</option>
              {SUBJECTS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>
              Type
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setExamType('practice_test')}
                className={examType === 'practice_test' ? 'btn btnPrimary' : 'btn btnSecondary'}
                style={{ flex: 1 }}
              >
                <Target className="icon16" />
                Practice Test
              </button>
              <button
                onClick={() => setExamType('revision_notes')}
                className={examType === 'revision_notes' ? 'btn btnPrimary' : 'btn btnSecondary'}
                style={{ flex: 1 }}
              >
                <BookOpen className="icon16" />
                Revision Notes
              </button>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            className="btn btnPrimary"
            style={{ width: '100%', padding: '14px', fontSize: '16px' }}
            disabled={!selectedGrade || !selectedSubject}
          >
            <Sparkles className="icon20" />
            Generate with AI
          </button>
        </div>

        {/* Quick Actions */}
        <div style={{ marginTop: 'var(--space-4)', display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
          <button
            onClick={handleViewHistory}
            className="btn btnSecondary"
            style={{ padding: '14px' }}
          >
            <FileText className="icon16" />
            View My Exams
          </button>
        </div>
      </div>

      <style jsx>{`
        .select-input option {
          background: var(--surface-1);
          color: var(--text-primary);
          padding: 8px;
        }
        
        .select-input:focus option {
          background: var(--surface-1);
          color: var(--text-primary);
        }
        
        .select-input::-webkit-scrollbar {
          width: 8px;
        }
        
        .select-input::-webkit-scrollbar-track {
          background: var(--bg-secondary);
        }
        
        .select-input::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 4px;
        }
      `}</style>
    </ParentShell>
  );
}
