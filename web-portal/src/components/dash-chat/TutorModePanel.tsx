'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, GraduationCap, BookOpen, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getGradeNumber } from '@/lib/utils/gradeUtils';
import { SUBJECTS_BY_PHASE, GRADES, getPhaseFromGrade } from '@/lib/exam-prep/types';

interface TutorModePanelProps {
  onStart: (prompt: string) => void;
  learnerContext?: {
    learnerName?: string | null;
    grade?: string | null;
    ageYears?: number | null;
    usageType?: string | null;
    schoolType?: string | null;
  } | null;
}

const K12_GRADE_LABELS = GRADES.map(g => g.label);

const PRESCHOOL_GRADES = [
  'Preschool (3-4)',
  'Preschool (4-5)',
  'Preschool (5-6)',
  'Grade R',
];

const FOUNDATION_GRADES = [
  'Grade R',
  'Grade 1',
  'Grade 2',
  'Grade 3',
];

const LANGUAGES = ['English', 'Afrikaans', 'isiZulu'];

const STORAGE_KEY = 'edudash_tutor_panel_collapsed';
const REMEMBER_KEY = 'edudash_tutor_panel_remember';
const AUTO_COLLAPSE_KEY = 'edudash_tutor_panel_auto_collapse';

const formatGradeLabel = (value?: string | null): string => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.startsWith('grade')) return raw.replace(/\s+/g, ' ');
  if (lower === 'r' || lower.includes('grade r')) return 'Grade R';
  const match = raw.match(/\d+/);
  if (match) return `Grade ${match[0]}`;
  if (lower.includes('preschool') || lower.includes('pre-k') || lower.includes('prek')) return 'Preschool';
  return raw;
};

export function TutorModePanel({ onStart, learnerContext }: TutorModePanelProps) {
  const { t } = useTranslation('common');
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [language, setLanguage] = useState('English');
  const [collapsed, setCollapsed] = useState(true);
  const [rememberState, setRememberState] = useState(true);
  const [autoCollapse, setAutoCollapse] = useState(true);

  const normalizedSchool = `${learnerContext?.schoolType || learnerContext?.usageType || ''}`.toLowerCase();
  const gradeNumber = getGradeNumber(learnerContext?.grade || '');
  const ageYears = learnerContext?.ageYears ?? null;
  const isPreschoolContext =
    normalizedSchool.includes('preschool') ||
    normalizedSchool.includes('ecd') ||
    normalizedSchool.includes('early') ||
    gradeNumber === 0 ||
    (typeof ageYears === 'number' && ageYears <= 5);
  const isFoundationPhase = gradeNumber > 0 && gradeNumber <= 3;
  const isEarlyLearner = isPreschoolContext || isFoundationPhase || (typeof ageYears === 'number' && ageYears <= 8);

  const gradeOptions = useMemo(() => {
    const base = isPreschoolContext
      ? PRESCHOOL_GRADES
      : isFoundationPhase
        ? FOUNDATION_GRADES
        : K12_GRADE_LABELS;
    const childLabel = formatGradeLabel(learnerContext?.grade);
    if (childLabel && !base.includes(childLabel)) {
      return [childLabel, ...base];
    }
    return base;
  }, [isPreschoolContext, isFoundationPhase, learnerContext?.grade]);

  const subjectOptions = useMemo(() => {
    if (isPreschoolContext || isFoundationPhase) {
      return SUBJECTS_BY_PHASE.foundation;
    }
    if (grade) {
      const gradeEntry = GRADES.find(g => g.label === grade);
      const gradeValue = gradeEntry?.value || grade.toLowerCase().replace(/\s+/g, '_');
      const phase = getPhaseFromGrade(gradeValue);
      return SUBJECTS_BY_PHASE[phase];
    }
    return SUBJECTS_BY_PHASE.fet;
  }, [isPreschoolContext, isFoundationPhase, grade]);

  useEffect(() => {
    const childLabel = formatGradeLabel(learnerContext?.grade);
    if (!childLabel) return;
    setGrade((prev) => (prev ? prev : childLabel));
  }, [learnerContext?.grade]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedRemember = localStorage.getItem(REMEMBER_KEY);
      const remember = savedRemember !== null ? savedRemember === 'true' : true;
      setRememberState(remember);

      const savedAuto = localStorage.getItem(AUTO_COLLAPSE_KEY);
      const auto = savedAuto !== null ? savedAuto === 'true' : true;
      setAutoCollapse(auto);

      const defaultCollapsed = window.innerWidth < 900;
      const savedCollapsed = localStorage.getItem(STORAGE_KEY);
      if (remember && savedCollapsed !== null) {
        setCollapsed(savedCollapsed === 'true');
      } else {
        setCollapsed(defaultCollapsed);
      }
    } catch {
      // If localStorage fails, default to collapsed on mobile.
      if (window.innerWidth < 900) {
        setCollapsed(true);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(REMEMBER_KEY, rememberState ? 'true' : 'false');
    } catch {}
  }, [rememberState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(AUTO_COLLAPSE_KEY, autoCollapse ? 'true' : 'false');
    } catch {}
  }, [autoCollapse]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!rememberState) return;
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false');
    } catch {}
  }, [collapsed, rememberState]);

  const prompt = useMemo(() => {
    const missing: string[] = [];
    if (!grade && !ageYears) missing.push('age or grade');
    if (!subject) missing.push('subject');
    if (!topic) missing.push('topic');

    const missingText = missing.length > 0
      ? `Missing info: ${missing.join(', ')}. Ask me for these before teaching.`
      : 'All key info provided.';

    const learnerName = learnerContext?.learnerName ? `Learner: ${learnerContext.learnerName}.` : '';
    const ageLine = typeof ageYears === 'number' ? `Age: ${ageYears}.` : '';
    const schoolLine = learnerContext?.schoolType || learnerContext?.usageType ? `School type: ${learnerContext?.schoolType || learnerContext?.usageType}.` : '';
    const earlyRule = isEarlyLearner
      ? 'Use play-based, gentle scaffolding. Avoid exam-prep language. Speak directly to the learner, ask one simple question at a time, and offer interactive activities or games.'
      : 'Start with ONE short diagnostic question. Teach step-by-step. Ask one question at a time and wait for my response.';

    return [
      'Tutor mode.',
      learnerName,
      ageLine,
      schoolLine,
      `Grade: ${grade || 'unknown'}.`,
      `Subject: ${subject || 'unknown'}.`,
      `Topic: ${topic || 'unknown'}.`,
      `Goal: ${goal || (isEarlyLearner ? 'help me learn with simple practice' : 'help me understand and practice')}.`,
      `Preferred language: ${language}.`,
      missingText,
      earlyRule,
    ].filter(Boolean).join('\n');
  }, [grade, subject, topic, goal, language, learnerContext?.learnerName, learnerContext?.schoolType, learnerContext?.usageType, ageYears, isEarlyLearner]);

  const summaryBits = [
    grade ? `Grade: ${grade}` : null,
    subject ? `Subject: ${subject}` : null,
    topic ? `Topic: ${topic}` : null,
    language ? `Language: ${language}` : null,
  ].filter(Boolean);

  return (
    <div className="border-b border-gray-800 bg-gray-950/80" style={{
      padding: collapsed ? '8px 16px' : '12px 16px',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)'
    }}>
      <div className="w-full max-w-4xl mx-auto" style={{ display: 'flex', flexDirection: 'column', gap: collapsed ? 8 : 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} style={{ color: 'var(--primary)' }} />
            <div style={{ fontWeight: 600 }}>{t('dashChat.tutorModeTitle')}</div>
            {!collapsed && (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {t('dashChat.tutorModeSubtitle')}
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed((prev) => !prev)}
            aria-expanded={!collapsed}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            {collapsed ? t('dashChat.expand', { defaultValue: 'Expand' }) : t('dashChat.collapse', { defaultValue: 'Collapse' })}
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: collapsed ? 0 : -2,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid rgba(16,185,129,0.45)',
              background: 'rgba(16,185,129,0.16)',
              color: '#6ee7b7',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.25,
            }}
          >
            <GraduationCap size={12} />
            Tutor Session Active
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Mode: Diagnose → Teach → Practice
          </span>
        </div>

        {collapsed ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {summaryBits.length > 0 ? summaryBits.join(' • ') : t('dashChat.tutorModeSubtitle')}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => setRememberState((prev) => !prev)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  background: rememberState ? 'rgba(124, 58, 237, 0.18)' : 'transparent',
                  color: 'var(--text)',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {rememberState
                  ? t('dashChat.rememberOn', { defaultValue: 'Remember: On' })
                  : t('dashChat.rememberOff', { defaultValue: 'Remember: Off' })}
              </button>
              <button
                onClick={() => setAutoCollapse((prev) => !prev)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  background: autoCollapse ? 'rgba(236, 72, 153, 0.16)' : 'transparent',
                  color: 'var(--text)',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {autoCollapse
                  ? t('dashChat.autoCollapseOn', { defaultValue: 'Auto-collapse: On' })
                  : t('dashChat.autoCollapseOff', { defaultValue: 'Auto-collapse: Off' })}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => setRememberState((prev) => !prev)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  background: rememberState ? 'rgba(124, 58, 237, 0.18)' : 'transparent',
                  color: 'var(--text)',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {rememberState
                  ? t('dashChat.rememberOn', { defaultValue: 'Remember: On' })
                  : t('dashChat.rememberOff', { defaultValue: 'Remember: Off' })}
              </button>
              <button
                onClick={() => setAutoCollapse((prev) => !prev)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  background: autoCollapse ? 'rgba(236, 72, 153, 0.16)' : 'transparent',
                  color: 'var(--text)',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {autoCollapse
                  ? t('dashChat.autoCollapseOn', { defaultValue: 'Auto-collapse: On' })
                  : t('dashChat.autoCollapseOff', { defaultValue: 'Auto-collapse: Off' })}
              </button>
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('dashChat.gradeLabel')}</span>
                <div style={{ position: 'relative' }}>
                  <GraduationCap size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }} />
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px 8px 30px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                      color: 'var(--text)'
                    }}
                  >
                    <option value="">{t('dashChat.selectGrade')}</option>
                    {gradeOptions.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('dashChat.subjectLabel')}</span>
                <div style={{ position: 'relative' }}>
                  <BookOpen size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }} />
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px 8px 30px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                      color: 'var(--text)'
                    }}
                  >
                    <option value="">{t('dashChat.selectSubject')}</option>
                    {subjectOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('dashChat.topicLabel')}</span>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={t('dashChat.topicPlaceholder')}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text)'
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('dashChat.goalLabel')}</span>
                <input
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={isEarlyLearner ? t('dashChat.goalPlaceholderPreschool', { defaultValue: 'e.g., counting, letter sounds, social skills' }) : t('dashChat.goalPlaceholder')}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text)'
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('dashChat.languageLabel')}</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text)'
                  }}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  onStart(prompt);
                  if (autoCollapse) {
                    setCollapsed(true);
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                  color: 'white',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <MessageSquare size={16} />
                {t('dashChat.startTutorSession')}
              </button>
              <button
                onClick={() => {
                  setGrade('');
                  setSubject('');
                  setTopic('');
                  setGoal('');
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer'
                }}
              >
                {t('dashChat.clear')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
