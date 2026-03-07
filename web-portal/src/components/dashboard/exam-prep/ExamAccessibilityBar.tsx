'use client';

/**
 * ExamAccessibilityBar
 *
 * Floating accessibility toolbar for the exam interface.
 * Helps learners who have limited English/Afrikaans proficiency.
 *
 * Features:
 *  - Auto-read questions aloud (TTS) when toggled on
 *  - Voice answer input (STT → maps spoken "A", "B", "C", "D" to choice)
 *  - Language selector (11 official SA languages)
 *  - Font size controls
 *  - "Simplify question" + "Translate question" per-question helpers
 *
 * Designed to sit at the top of ExamInteractiveView.
 */

import { useState, useCallback, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  ZoomIn,
  ZoomOut,
  Globe,
  Accessibility,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SupportedLang =
  | 'en-ZA' | 'af-ZA' | 'zu-ZA' | 'xh-ZA' | 'st-ZA'
  | 'tn-ZA' | 'ss-ZA' | 've-ZA' | 'ts-ZA' | 'nr-ZA' | 'nso-ZA';

export interface AccessibilitySettings {
  autoReadQuestions: boolean;
  voiceAnswerMode: boolean;
  selectedLanguage: SupportedLang;
  fontSize: 'normal' | 'large' | 'xlarge';
}

interface ExamAccessibilityBarProps {
  settings: AccessibilitySettings;
  onChange: (settings: AccessibilitySettings) => void;
  onSimplifyQuestion?: (questionText: string) => Promise<string>;
  onTranslateQuestion?: (questionText: string, targetLang: SupportedLang) => Promise<string>;
  isSpeaking?: boolean;
  onStopSpeaking?: () => void;
  userId?: string;
}

// ─── Language Catalogue ───────────────────────────────────────────────────────

const SA_LANGUAGES: { code: SupportedLang; label: string; nativeLabel: string }[] = [
  { code: 'en-ZA', label: 'English', nativeLabel: 'English' },
  { code: 'af-ZA', label: 'Afrikaans', nativeLabel: 'Afrikaans' },
  { code: 'zu-ZA', label: 'isiZulu', nativeLabel: 'isiZulu' },
  { code: 'xh-ZA', label: 'isiXhosa', nativeLabel: 'isiXhosa' },
  { code: 'st-ZA', label: 'Sesotho', nativeLabel: 'Sesotho' },
  { code: 'tn-ZA', label: 'Setswana', nativeLabel: 'Setswana' },
  { code: 'nso-ZA', label: 'Sepedi', nativeLabel: 'Sepedi' },
  { code: 'ss-ZA', label: 'siSwati', nativeLabel: 'siSwati' },
  { code: 've-ZA', label: 'Tshivenda', nativeLabel: 'Tshivenda' },
  { code: 'ts-ZA', label: 'Xitsonga', nativeLabel: 'Xitsonga' },
  { code: 'nr-ZA', label: 'isiNdebele', nativeLabel: 'isiNdebele' },
];

const FONT_SIZE_LABELS: Record<AccessibilitySettings['fontSize'], string> = {
  normal: 'Normal',
  large: 'Large',
  xlarge: 'Extra Large',
};

export const FONT_SIZE_SCALE: Record<AccessibilitySettings['fontSize'], number> = {
  normal: 1,
  large: 1.2,
  xlarge: 1.45,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ExamAccessibilityBar({
  settings,
  onChange,
  isSpeaking = false,
  onStopSpeaking,
}: ExamAccessibilityBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  const update = useCallback(
    (partial: Partial<AccessibilitySettings>) => onChange({ ...settings, ...partial }),
    [settings, onChange],
  );

  const cycleFontSize = useCallback(() => {
    const order: AccessibilitySettings['fontSize'][] = ['normal', 'large', 'xlarge'];
    const next = order[(order.indexOf(settings.fontSize) + 1) % order.length];
    update({ fontSize: next });
  }, [settings.fontSize, update]);

  const selectedLang = SA_LANGUAGES.find((l) => l.code === settings.selectedLanguage) ?? SA_LANGUAGES[0];

  return (
    <div
      role="toolbar"
      aria-label="Exam accessibility tools"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 200,
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
        borderBottom: '2px solid rgba(167, 139, 250, 0.3)',
        padding: expanded ? '12px 16px' : '8px 16px',
        transition: 'padding 0.2s ease',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}
    >
      {/* ── Compact Row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Header label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: '#a5b4fc',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <Accessibility style={{ width: 16, height: 16 }} />
          Accessibility
        </div>

        <div style={{ flex: 1 }} />

        {/* Read aloud toggle */}
        <button
          onClick={() => {
            if (isSpeaking && onStopSpeaking) onStopSpeaking();
            update({ autoReadQuestions: !settings.autoReadQuestions });
          }}
          aria-pressed={settings.autoReadQuestions}
          title={settings.autoReadQuestions ? 'Turn off auto-read' : 'Auto-read questions aloud'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
            background: settings.autoReadQuestions ? '#7c3aed' : 'rgba(255,255,255,0.08)',
            color: settings.autoReadQuestions ? '#fff' : '#c4b5fd',
            transition: 'all 0.2s ease',
          }}
        >
          {settings.autoReadQuestions ? (
            <Volume2 style={{ width: 15, height: 15 }} />
          ) : (
            <VolumeX style={{ width: 15, height: 15 }} />
          )}
          {settings.autoReadQuestions ? 'Read On' : 'Read Off'}
        </button>

        {/* Voice answer toggle */}
        <button
          onClick={() => update({ voiceAnswerMode: !settings.voiceAnswerMode })}
          aria-pressed={settings.voiceAnswerMode}
          title={settings.voiceAnswerMode ? 'Turn off voice answers' : 'Answer by voice (say A, B, C, D)'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
            background: settings.voiceAnswerMode ? '#059669' : 'rgba(255,255,255,0.08)',
            color: settings.voiceAnswerMode ? '#fff' : '#6ee7b7',
            transition: 'all 0.2s ease',
          }}
        >
          {settings.voiceAnswerMode ? (
            <Mic style={{ width: 15, height: 15 }} />
          ) : (
            <MicOff style={{ width: 15, height: 15 }} />
          )}
          {settings.voiceAnswerMode ? 'Voice On' : 'Voice Off'}
        </button>

        {/* Language selector */}
        <div style={{ position: 'relative' }} ref={langMenuRef}>
          <button
            onClick={() => setLangMenuOpen((v) => !v)}
            title="Change language"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              background: settings.selectedLanguage !== 'en-ZA' ? '#0891b2' : 'rgba(255,255,255,0.08)',
              color: settings.selectedLanguage !== 'en-ZA' ? '#fff' : '#7dd3fc',
              transition: 'all 0.2s ease',
            }}
          >
            <Globe style={{ width: 15, height: 15 }} />
            {selectedLang.nativeLabel}
            <ChevronDown style={{ width: 12, height: 12 }} />
          </button>

          {langMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                background: '#1e1b4b',
                border: '1px solid rgba(167, 139, 250, 0.4)',
                borderRadius: 10,
                overflow: 'hidden',
                zIndex: 300,
                minWidth: 180,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#a5b4fc',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  borderBottom: '1px solid rgba(167,139,250,0.2)',
                }}
              >
                Select language
              </div>
              {SA_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    update({ selectedLanguage: lang.code });
                    setLangMenuOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '10px 14px',
                    background: settings.selectedLanguage === lang.code ? 'rgba(124,58,237,0.3)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: settings.selectedLanguage === lang.code ? '#c4b5fd' : '#e0e7ff',
                    fontSize: 14,
                    fontWeight: settings.selectedLanguage === lang.code ? 700 : 400,
                    textAlign: 'left',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,58,237,0.15)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = settings.selectedLanguage === lang.code ? 'rgba(124,58,237,0.3)' : 'transparent'; }}
                >
                  <span>{lang.nativeLabel}</span>
                  {settings.selectedLanguage === lang.code && (
                    <span style={{ fontSize: 12, color: '#a5b4fc' }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Font size */}
        <button
          onClick={cycleFontSize}
          title={`Font size: ${FONT_SIZE_LABELS[settings.fontSize]} (click to change)`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 10px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
            background: settings.fontSize !== 'normal' ? '#d97706' : 'rgba(255,255,255,0.08)',
            color: settings.fontSize !== 'normal' ? '#fff' : '#fcd34d',
            transition: 'all 0.2s ease',
          }}
        >
          {settings.fontSize === 'xlarge' ? (
            <ZoomOut style={{ width: 15, height: 15 }} />
          ) : (
            <ZoomIn style={{ width: 15, height: 15 }} />
          )}
          {FONT_SIZE_LABELS[settings.fontSize]}
        </button>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Collapse' : 'More options'}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 8px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.08)',
            color: '#a5b4fc',
          }}
        >
          {expanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
        </button>
      </div>

      {/* ── Expanded Panel ── */}
      {expanded && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid rgba(167,139,250,0.25)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {/* Tip boxes */}
          {[
            settings.autoReadQuestions && {
              icon: '🔊',
              text: 'Questions will be read aloud automatically as you scroll to them.',
            },
            settings.voiceAnswerMode && {
              icon: '🎤',
              text: 'Say "A", "B", "C" or "D" to select your answer. Say "skip" to move on.',
            },
            settings.selectedLanguage !== 'en-ZA' && {
              icon: '🌍',
              text: `Questions will be translated to ${selectedLang.label}. Click the translate icon next to any question.`,
            },
            settings.fontSize !== 'normal' && {
              icon: '🔤',
              text: `Text is at ${FONT_SIZE_LABELS[settings.fontSize]} size for easier reading.`,
            },
          ]
            .filter(Boolean)
            .map((tip, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#c4b5fd',
                  maxWidth: 280,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ fontSize: 16 }}>{(tip as { icon: string }).icon}</span>
                <span>{(tip as { text: string }).text}</span>
              </div>
            ))}

          {!settings.autoReadQuestions && !settings.voiceAnswerMode && settings.selectedLanguage === 'en-ZA' && settings.fontSize === 'normal' && (
            <div style={{ color: '#a5b4fc', fontSize: 13, lineHeight: 1.6 }}>
              Enable options above to activate accessibility support. Each question will show{' '}
              <strong>🔊 Read</strong>, <strong>💡 Simplify</strong>, and <strong>🌍 Translate</strong> buttons.
            </div>
          )}
        </div>
      )}

      {/* Click-away for language menu */}
      {langMenuOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 250 }}
          onClick={() => setLangMenuOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Per-Question Accessibility Controls ──────────────────────────────────────

interface QuestionAccessibilityControlsProps {
  questionId: string;
  questionText: string;
  settings: AccessibilitySettings;
  onReadAloud: (text: string) => void;
  onVoiceAnswer: (questionId: string, callback: (answer: string) => void) => void;
  onSimplify: (questionId: string, text: string) => Promise<string | null>;
  onTranslate: (questionId: string, text: string, lang: SupportedLang) => Promise<string | null>;
  simplifiedText?: string;
  translatedText?: string;
  isLoadingSimplify?: boolean;
  isLoadingTranslate?: boolean;
  isSpeakingThisQuestion?: boolean;
  isListeningThisQuestion?: boolean;
}

export function QuestionAccessibilityControls({
  questionId,
  questionText,
  settings,
  onReadAloud,
  onSimplify,
  onTranslate,
  simplifiedText,
  translatedText,
  isLoadingSimplify = false,
  isLoadingTranslate = false,
  isSpeakingThisQuestion = false,
}: QuestionAccessibilityControlsProps) {
  if (!settings.autoReadQuestions && !settings.voiceAnswerMode && settings.selectedLanguage === 'en-ZA' && settings.fontSize === 'normal') {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        marginTop: 6,
        marginBottom: 4,
      }}
    >
      {/* Read question aloud */}
      <button
        onClick={() => onReadAloud(questionText)}
        title="Read this question aloud"
        style={accessBtn(isSpeakingThisQuestion ? '#7c3aed' : 'rgba(124,58,237,0.15)', isSpeakingThisQuestion ? '#fff' : '#a78bfa')}
      >
        <Volume2 style={{ width: 13, height: 13 }} />
        {isSpeakingThisQuestion ? 'Reading…' : 'Read'}
      </button>

      {/* Simplify */}
      <button
        onClick={() => onSimplify(questionId, questionText)}
        disabled={isLoadingSimplify || !!simplifiedText}
        title="Rewrite this question in simpler language"
        style={accessBtn('rgba(245,158,11,0.15)', '#fcd34d', isLoadingSimplify || !!simplifiedText)}
      >
        💡 {isLoadingSimplify ? 'Simplifying…' : simplifiedText ? 'Simplified ✓' : 'Simplify'}
      </button>

      {/* Translate */}
      {settings.selectedLanguage !== 'en-ZA' && (
        <button
          onClick={() => onTranslate(questionId, questionText, settings.selectedLanguage)}
          disabled={isLoadingTranslate || !!translatedText}
          title={`Translate to ${SA_LANGUAGES.find((l) => l.code === settings.selectedLanguage)?.label}`}
          style={accessBtn('rgba(6,182,212,0.15)', '#67e8f9', isLoadingTranslate || !!translatedText)}
        >
          🌍 {isLoadingTranslate ? 'Translating…' : translatedText ? 'Translated ✓' : 'Translate'}
        </button>
      )}
    </div>
  );
}

// ─── Simplified / Translated Text Display ────────────────────────────────────

interface AlternativeTextPanelProps {
  simplifiedText?: string;
  translatedText?: string;
  translatedLangLabel?: string;
  onDismissSimplified?: () => void;
  onDismissTranslated?: () => void;
  fontSize: AccessibilitySettings['fontSize'];
  onReadAloud?: (text: string) => void;
}

export function AlternativeTextPanel({
  simplifiedText,
  translatedText,
  translatedLangLabel,
  onDismissSimplified,
  onDismissTranslated,
  fontSize,
  onReadAloud,
}: AlternativeTextPanelProps) {
  const scale = FONT_SIZE_SCALE[fontSize];
  if (!simplifiedText && !translatedText) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      {simplifiedText && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 8,
            fontSize: 14 * scale,
            lineHeight: 1.6,
            position: 'relative',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            💡 Simplified
          </div>
          <p style={{ margin: 0, color: 'var(--text)' }}>{simplifiedText}</p>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {onReadAloud && (
              <button onClick={() => onReadAloud(simplifiedText)} style={accessBtn('rgba(245,158,11,0.15)', '#fcd34d')}>
                <Volume2 style={{ width: 12, height: 12 }} /> Listen
              </button>
            )}
            {onDismissSimplified && (
              <button onClick={onDismissSimplified} style={accessBtn('rgba(0,0,0,0.08)', 'var(--text-muted)')}>
                <X style={{ width: 12, height: 12 }} /> Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {translatedText && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(6,182,212,0.08)',
            border: '1px solid rgba(6,182,212,0.3)',
            borderRadius: 8,
            fontSize: 14 * scale,
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0891b2', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            🌍 {translatedLangLabel ?? 'Translation'}
          </div>
          <p style={{ margin: 0, color: 'var(--text)' }}>{translatedText}</p>
          {onReadAloud && (
            <button onClick={() => onReadAloud(translatedText)} style={{ ...accessBtn('rgba(6,182,212,0.15)', '#67e8f9'), marginTop: 8 }}>
              <Volume2 style={{ width: 12, height: 12 }} /> Listen
            </button>
          )}
          {onDismissTranslated && (
            <button onClick={onDismissTranslated} style={{ ...accessBtn('rgba(0,0,0,0.08)', 'var(--text-muted)'), marginTop: 8, marginLeft: 6 }}>
              <X style={{ width: 12, height: 12 }} /> Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function accessBtn(bg: string, color: string, disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 6,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    fontSize: 12,
    background: bg,
    color,
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s ease',
  };
}

// ─── Default Settings ─────────────────────────────────────────────────────────

export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  autoReadQuestions: false,
  voiceAnswerMode: false,
  selectedLanguage: 'en-ZA',
  fontSize: 'normal',
};
