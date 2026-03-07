'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, XCircle, FileCheck, AlertCircle, Bot, Sparkles, Save as SaveIcon, Printer, X, Download, Volume2, VolumeX, Pause, Play } from 'lucide-react';
import { ParsedExam, ExamQuestion, gradeAnswer } from '@/lib/examParser';
import { useExamSession } from '@/lib/hooks/useExamSession';
import { useQuotaCheck } from '@/hooks/useQuotaCheck';
import { useTTS } from '@/hooks/useTTS';
import { UpgradeModal } from '@/components/modals/UpgradeModal';
import { createClient } from '@/lib/supabase/client';
import { exportExamToPDF } from '@/lib/utils/pdf-export';
import { downloadExamPdf } from '@/lib/exam-prep/pdfExport';
import { saveExam } from '@/lib/exam-prep/examStorage';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExamDiagram } from './ExamDiagram';
import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import {
  ExamAccessibilityBar,
  QuestionAccessibilityControls,
  AlternativeTextPanel,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  FONT_SIZE_SCALE,
} from './ExamAccessibilityBar';
import type { AccessibilitySettings, SupportedLang } from './ExamAccessibilityBar';

// Helper component to render text with optional math support
// Only uses KaTeX if the text contains actual math expressions
function MathText({ text }: { text: string }) {
  // More conservative math detection - only treat as math if it has clear math indicators
  // Avoid false positives on regular text with numbers or basic punctuation
  const hasMath = (
    /\\[a-zA-Z]+/.test(text) ||           // LaTeX commands like \frac, \sqrt, \int
    /\^[{0-9]/.test(text) ||               // Superscripts like x^2, x^{10}
    /_[{0-9]/.test(text) ||                // Subscripts like x_1, x_{10}
    /\$.*\$/.test(text) ||                 // Inline math delimiters
    /\\\(.*\\\)/.test(text) ||             // LaTeX inline math
    /\\\[.*\\\]/.test(text) ||             // LaTeX display math
    (/[0-9]+\/[0-9]+/.test(text) && text.length < 20) // Fractions like 3/4 (but not dates or long text)
  );
  
  if (!hasMath) {
    // Plain text - no math font, just regular system font
    return <span style={{ fontFamily: 'inherit' }}>{text}</span>;
  }
  
  // Has math - use KaTeX
  try {
    return <InlineMath math={text} />;
  } catch (error) {
    // Fallback if KaTeX fails to parse
    console.warn('[MathText] KaTeX parsing failed:', error);
    return <span style={{ fontFamily: 'inherit' }}>{text}</span>;
  }
}



interface ExamInteractiveViewProps {
  exam: ParsedExam;
  generationId?: string | null;
  userId?: string;
  onClose?: () => void;
  onSubmitted?: (score: { earned: number; total: number }) => void;
}

interface StudentAnswers {
  [questionId: string]: string;
}

interface QuestionFeedback {
  isCorrect: boolean;
  feedback: string;
  marks: number;
}

type BrowserSpeechResult = {
  transcript?: string;
};

type BrowserSpeechEvent = {
  results: ArrayLike<ArrayLike<BrowserSpeechResult>>;
};

interface BrowserSpeechRecognition {
  lang: string;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechEvent) => void) | null;
  start: () => void;
}

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

type BrowserSpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionCtor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
};

export function ExamInteractiveView({ exam, generationId, userId, onClose, onSubmitted }: ExamInteractiveViewProps) {
  const [studentAnswers, setStudentAnswers] = useState<StudentAnswers>({});
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, QuestionFeedback>>({});
  const [score, setScore] = useState<{ earned: number; total: number } | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [loadingExplanations, setLoadingExplanations] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalData, setUpgradeModalData] = useState<{ currentUsage: number; currentLimit: number } | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [currentTier, setCurrentTier] = useState<'free' | 'trial' | 'parent_starter' | 'parent_plus' | 'premium' | 'school'>('free');
  const [speakingQuestionId, setSpeakingQuestionId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [savingExam, setSavingExam] = useState(false);
  const [a11y, setA11y] = useState<AccessibilitySettings>(DEFAULT_ACCESSIBILITY_SETTINGS);
  const [simplifiedTexts, setSimplifiedTexts] = useState<Record<string, string>>({});
  const [translatedTexts, setTranslatedTexts] = useState<Record<string, string>>({});
  const [loadingSimplify, setLoadingSimplify] = useState<Record<string, boolean>>({});
  const [loadingTranslate, setLoadingTranslate] = useState<Record<string, boolean>>({});
  const autoReadRef = useRef<boolean>(false);
  autoReadRef.current = a11y.autoReadQuestions;
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };
  const { saveProgress } = useExamSession(generationId || null);
  const { checkQuota, incrementUsage } = useQuotaCheck(userId);
  const { speak, pause, resume, stop, isSpeaking, isPaused, isSupported: ttsSupported, error: ttsError, quota: ttsQuota, userTier: ttsUserTier, voicePreference, setVoice, checkQuota: checkTTSQuota } = useTTS(userId);
  const supabase = createClient();

  // Format school name helper - converts "edudash-pro-community-school" to "EduDash Pro Community School"
  const formatSchoolName = (name: string): string => {
    if (!name) return name;
    // Handle special case for EduDash Pro Community School
    if (name.toLowerCase().includes('edudash') && name.toLowerCase().includes('community')) {
      return 'EduDash Pro Community School';
    }
    // Generic formatting: replace dashes with spaces and capitalize words
    return name
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Fetch user info for UpgradeModal
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!userId) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
        setUserName(user.user_metadata?.full_name || '');
      }

      const { data: tierData } = await supabase
        .from('user_ai_tiers')
        .select('tier')
        .eq('user_id', userId)
        .single();
      if (tierData) {
        setCurrentTier(tierData.tier || 'free');
      }
    };
    fetchUserInfo();
  }, [userId, supabase]);

  // Helper key for clearing active exam session from parent page (set there)
  const activeKeyFromMeta = typeof window !== 'undefined' && exam?.grade && exam?.subject
    ? `ACTIVE_EXAM_${String(exam.grade)}_${String(exam.subject)}_practice_test`
    : null;

  // Autosave: persist answers so refresh won't reset progress
  const autosaveKey = typeof window !== 'undefined'
    ? `EXAM_AUTOSAVE_${generationId || (exam?.title || 'untitled')}`
    : '';

  // Hydrate from autosave on mount
  useEffect(() => {
    try {
      if (!autosaveKey) return;
      const raw = localStorage.getItem(autosaveKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.answers && typeof saved.answers === 'object') {
          setStudentAnswers(saved.answers);
        }
      }
    } catch (e) {
      console.warn('[ExamInteractiveView] Failed to load autosave:', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on every answer change (lightweight)
  useEffect(() => {
    try {
      if (!autosaveKey) return;
      const payload = {
        answers: studentAnswers,
        examTitle: exam?.title,
        grade: exam?.grade,
        subject: exam?.subject,
        updatedAt: Date.now(),
      };
      localStorage.setItem(autosaveKey, JSON.stringify(payload));
    } catch (e) {
      console.warn('[ExamInteractiveView] Failed to autosave:', e);
    }
  }, [studentAnswers, autosaveKey, exam?.title, exam?.grade, exam?.subject]);

  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleAnswerChange = (questionId: string, answer: string) => {
    setStudentAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  };

  // ── Accessibility helpers ──────────────────────────────────────────────────

  const handleReadAloud = useCallback((text: string, questionId?: string) => {
    if (questionId) setSpeakingQuestionId(questionId);
    speak(text, { style: 'friendly', rate: 0, pitch: 0 });
  }, [speak]);

  const handleSimplify = useCallback(async (questionId: string, text: string): Promise<string | null> => {
    if (simplifiedTexts[questionId]) return simplifiedTexts[questionId];
    setLoadingSimplify((p) => ({ ...p, [questionId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('ai-gateway', {
        body: {
          action: 'general_assistance',
          messages: [{
            role: 'user',
            content: `Rewrite this exam question in very simple, clear language for a learner who is still learning English. Keep it as short as possible. Do NOT give the answer. Only rewrite the question.\n\nOriginal question: "${text}"\n\nSimplified version (1-2 sentences only):`,
          }],
          model: 'claude-3-5-haiku-20241022',
          maxTokens: 200,
        },
      });
      const simplified: string = error ? text : (String(data?.content || text));
      setSimplifiedTexts((p) => ({ ...p, [questionId]: simplified }));
      return simplified;
    } catch {
      return null;
    } finally {
      setLoadingSimplify((p) => ({ ...p, [questionId]: false }));
    }
  }, [simplifiedTexts, supabase]);

  const handleTranslate = useCallback(async (questionId: string, text: string, targetLang: SupportedLang): Promise<string | null> => {
    if (translatedTexts[questionId]) return translatedTexts[questionId];
    setLoadingTranslate((p) => ({ ...p, [questionId]: true }));
    const langNames: Record<string, string> = {
      'af-ZA': 'Afrikaans', 'zu-ZA': 'isiZulu', 'xh-ZA': 'isiXhosa',
      'st-ZA': 'Sesotho', 'tn-ZA': 'Setswana', 'nso-ZA': 'Sepedi',
      'ss-ZA': 'siSwati', 've-ZA': 'Tshivenda', 'ts-ZA': 'Xitsonga', 'nr-ZA': 'isiNdebele',
    };
    const langName = langNames[targetLang] ?? targetLang;
    try {
      const { data, error } = await supabase.functions.invoke('ai-gateway', {
        body: {
          action: 'general_assistance',
          messages: [{
            role: 'user',
            content: `Translate ONLY this exam question to ${langName}. Do NOT answer the question. Keep the same meaning. Return ONLY the translation, no preamble.\n\nQuestion: "${text}"`,
          }],
          model: 'claude-3-5-haiku-20241022',
          maxTokens: 300,
        },
      });
      const translated: string = error ? text : (String(data?.content || text));
      setTranslatedTexts((p) => ({ ...p, [questionId]: translated }));
      return translated;
    } catch {
      return null;
    } finally {
      setLoadingTranslate((p) => ({ ...p, [questionId]: false }));
    }
  }, [translatedTexts, supabase]);

  const handleVoiceAnswer = useCallback((_questionId: string, _callback: (answer: string) => void) => {
    // Voice answer: web uses SpeechRecognition API
    if (typeof window === 'undefined') return;

    const speechWindow = window as BrowserSpeechWindow;
    const SpeechRecognitionCtor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = a11y.selectedLanguage;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: BrowserSpeechEvent) => {
      const spoken = event.results[0]?.[0]?.transcript?.trim().toUpperCase() ?? '';
      const letter = spoken.charAt(0);
      if (['A', 'B', 'C', 'D'].includes(letter)) {
        _callback(letter);
      }
    };
    recognition.start();
  }, [a11y.selectedLanguage]);  
  
  /**
   * Get AI-powered explanations for incorrect answers
   */
  // Individual question explanation
  const getAIExplanation = async (questionId: string) => {
    // ✅ CHECK QUOTA BEFORE REQUESTING EXPLANATION
    if (userId) {
      const quotaResult = await checkQuota('explanation');
      if (!quotaResult?.allowed && quotaResult) {
        setUpgradeModalData({
          currentUsage: quotaResult.remaining === 0 ? quotaResult.limit : quotaResult.limit - quotaResult.remaining,
          currentLimit: quotaResult.limit,
        });
        setShowUpgradeModal(true);
        return;
      }
    }

    setLoadingExplanations((prev) => ({ ...prev, [questionId]: true }));
    const user = await supabase.auth.getUser();
    if (!user.data.user?.id) {
      console.error('User not authenticated');
      setLoadingExplanations((prev) => ({ ...prev, [questionId]: false }));
      return;
    }

    const questionFeedback = feedback[questionId];
    const question = exam.sections.flatMap(s => s.questions).find((q) => q.id === questionId);
    if (!question || !questionFeedback) {
      setLoadingExplanations((prev) => ({ ...prev, [questionId]: false }));
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('explain-answer', {
        body: {
          questionText: question.text,
          questionType: question.type,
          options: question.options,
          studentAnswer: studentAnswers[questionId],
          correctAnswer: question.correctAnswer,
          grade: exam.grade,
        },
      });

      if (error) {
        console.error('Explanation service error:', error);
        // Show fallback explanation on error
        const fallbackExplanation = generateFallbackExplanation(question, studentAnswers[questionId]);
        setExplanations((prev) => ({
          ...prev,
          [questionId]: fallbackExplanation,
        }));
      } else if (data?.explanation) {
        setExplanations((prev) => ({
          ...prev,
          [questionId]: data.explanation,
        }));
        // ✅ INCREMENT USAGE COUNTER AFTER SUCCESSFUL EXPLANATION
        if (userId) {
          incrementUsage('explanation', 'success').catch(err => {
            console.error('[ExamInteractiveView] Failed to increment explanation usage:', err);
          });
        }
      } else if (data?.warning) {
        // Service returned a fallback with warning
        const fallbackExplanation = data.explanation || generateFallbackExplanation(question, studentAnswers[questionId]);
        setExplanations((prev) => ({
          ...prev,
          [questionId]: `⚠️ ${data.warning}\n\n${fallbackExplanation}`,
        }));
      }
    } catch (err) {
      console.error('Error getting AI explanation:', err);
      // Show fallback explanation on exception
      const fallbackExplanation = generateFallbackExplanation(question, studentAnswers[questionId]);
      setExplanations((prev) => ({
        ...prev,
        [questionId]: fallbackExplanation,
      }));
    }

    setLoadingExplanations((prev) => ({ ...prev, [questionId]: false }));
  };

  // Generate a comprehensive, teacher-like fallback explanation when AI is unavailable
  const generateFallbackExplanation = (question: ExamQuestion, studentAnswer: string): string => {
    const correctAnswer = question.correctAnswer || 'N/A';
    
    if (question.type === 'multiple_choice') {
      return `**Let's work through this together! 🎓**

The correct answer is **${correctAnswer}**, but I can see you selected **${studentAnswer}**. Don't worry - mistakes are how we learn!

**Understanding What Happened:**
When answering multiple choice questions, it's important to carefully read each option and compare them to what the question is asking. Your answer might have seemed right at first, but let's think about why ${correctAnswer} is the better choice.

**How to Approach Similar Questions:**
1. Read the question twice to make sure you understand what's being asked
2. Look at each option carefully before choosing
3. Eliminate options that you know are incorrect
4. Choose the best remaining answer

**Keep Practicing!**
You're building important skills by working through these questions. Each attempt helps you understand the material better. Try reviewing the concepts related to this question and then attempt similar practice questions. You've got this! 💪`;
    } else {
      return `**Let's learn from this together! 🎓**

**Correct Answer:** ${correctAnswer}

**Your Answer:** ${studentAnswer}

**Understanding the Difference:**
Sometimes we make mistakes because we're still building our understanding of the topic. That's completely normal and part of the learning process! The key is to figure out where our thinking needs adjusting.

**Building Your Understanding:**
Take some time to review the concepts related to this question. Look back at your notes or textbook to strengthen your grasp of the material. Try to understand *why* ${correctAnswer} is correct - not just memorize it.

**Strategy for Success:**
Break down complex questions into smaller parts. Make sure you understand what each part is asking before you answer. Practice similar questions to build confidence.

**You're Making Progress!**
Every question you attempt is helping you learn and grow. Keep up the great work, and don't hesitate to ask for help when you need it! 🌟`;
    }
  };

  const getAIExplanations = async () => {
    const wrongAnswers = Object.entries(feedback).filter(([_, f]) => !f.isCorrect);
    
    // Call getAIExplanation for each wrong answer sequentially to avoid overload
    for (const [questionId] of wrongAnswers) {
      if (!explanations[questionId]) {
        await getAIExplanation(questionId);
        // Add a small delay between requests to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    const feedbackResults: Record<string, QuestionFeedback> = {};
    let earnedMarks = 0;

    exam.sections.forEach((section) => {
      section.questions.forEach((question) => {
        const answer = studentAnswers[question.id] || '';
        const result = gradeAnswer(question, answer);
        feedbackResults[question.id] = result;
        earnedMarks += result.marks;
      });
    });

    setFeedback(feedbackResults);
    const finalScore = { earned: earnedMarks, total: exam.totalMarks };
    setScore(finalScore);
    setSubmitted(true);

    // Save progress to database
    await saveProgress(
      studentAnswers,
      finalScore,
      exam.title,
      exam.grade || 'Grade 12',
      exam.subject || 'General'
    );

    // Clear autosave after successful submission and active exam key
    try {
      if (autosaveKey) localStorage.removeItem(autosaveKey);
      if (activeKeyFromMeta) localStorage.removeItem(activeKeyFromMeta);
    } catch {}
    
    setSaving(false);

    // Notify parent
    try { onSubmitted?.(finalScore); } catch {}

    // Scroll to top to see results
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderQuestion = (question: ExamQuestion) => {
    const answer = studentAnswers[question.id] || '';
    const questionFeedback = feedback[question.id];
    const isAnswered = answer.trim() !== '';

    return (
      <div
        key={question.id}
        style={{
          padding: isMobile ? 'var(--space-4)' : 'var(--space-5)',
          background: 'var(--card)',
          borderRadius: isMobile ? '0' : 'var(--radius-2)',
          ...(submitted ? {
            borderTop: `2px solid ${questionFeedback?.isCorrect ? 'var(--success)' : 'var(--danger)'}`,
            borderRight: `2px solid ${questionFeedback?.isCorrect ? 'var(--success)' : 'var(--danger)'}`,
            borderBottom: `2px solid ${questionFeedback?.isCorrect ? 'var(--success)' : 'var(--danger)'}`,
            borderLeft: `2px solid ${questionFeedback?.isCorrect ? 'var(--success)' : 'var(--danger)'}`,
          } : {
            borderTop: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            borderLeft: '1px solid var(--border)',
          }),
          marginBottom: isMobile ? '0' : 'var(--space-4)',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Question Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
          <div style={{ flex: 1 }}>
            <p style={{ 
              fontWeight: 600, 
              fontSize: (isMobile ? 17 : 16) * FONT_SIZE_SCALE[a11y.fontSize], 
              lineHeight: 1.5, 
              marginBottom: 'var(--space-2)',
              fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
            }}>
              <MathText text={question.text} />
            </p>
            {/* Accessibility: per-question controls */}
            <QuestionAccessibilityControls
              questionId={question.id}
              questionText={question.text}
              settings={a11y}
              onReadAloud={(t) => handleReadAloud(t, question.id)}
              onVoiceAnswer={handleVoiceAnswer}
              onSimplify={handleSimplify}
              onTranslate={handleTranslate}
              simplifiedText={simplifiedTexts[question.id]}
              translatedText={translatedTexts[question.id]}
              isLoadingSimplify={loadingSimplify[question.id]}
              isLoadingTranslate={loadingTranslate[question.id]}
              isSpeakingThisQuestion={speakingQuestionId === question.id && isSpeaking}
            />
            {/* Show simplified / translated text panels */}
            <AlternativeTextPanel
              simplifiedText={simplifiedTexts[question.id]}
              translatedText={translatedTexts[question.id]}
              translatedLangLabel={SA_LANGUAGES_MAP[a11y.selectedLanguage]}
              onDismissSimplified={() => setSimplifiedTexts((p) => { const n = { ...p }; delete n[question.id]; return n; })}
              onDismissTranslated={() => setTranslatedTexts((p) => { const n = { ...p }; delete n[question.id]; return n; })}
              fontSize={a11y.fontSize}
              onReadAloud={(t) => handleReadAloud(t, question.id)}
            />
          </div>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary), rgba(124, 58, 237, 0.85))',
            color: '#fff',
            padding: '5px 10px',
            borderRadius: 'var(--radius-1)',
            fontSize: 13,
            fontWeight: 700,
            marginLeft: 'var(--space-2)',
            letterSpacing: '0.02em',
            boxShadow: '0 2px 4px rgba(124, 58, 237, 0.3)',
          }}>
            [{question.marks} {question.marks === 1 ? 'mark' : 'marks'}]
          </div>
        </div>

        {/* Diagram (if present) */}
        {question.diagram && <ExamDiagram diagram={question.diagram} />}

        {/* Question Input */}
        {question.type === 'multiple_choice' && question.options ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 'var(--space-3)' : 'var(--space-2)' }}>
            {question.options.map((option, idx) => {
              const optionLetter = String.fromCharCode(65 + idx); // A, B, C, D
              // Strip any existing letter prefix (A., A), a., a), etc.)
              const cleanOption = option.replace(/^(?:\s*[a-dA-D][\.\)]\s*)+/, '').trim();
              const isSelected = answer === optionLetter;
              return (
                <label
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: isMobile ? 'var(--space-4)' : 'var(--space-3)',
                    background: isSelected ? 'rgba(var(--primary-rgb), 0.1)' : 'var(--surface)',
                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                    borderRadius: isMobile ? 'var(--radius-1)' : 'var(--radius-2)',
                    cursor: submitted ? 'not-allowed' : 'pointer',
                    opacity: submitted ? 0.7 : 1,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!submitted) {
                      e.currentTarget.style.background = isSelected 
                        ? 'rgba(var(--primary-rgb), 0.15)' 
                        : 'var(--surface-1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isSelected 
                      ? 'rgba(var(--primary-rgb), 0.1)' 
                      : 'var(--surface)';
                  }}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={optionLetter}
                    checked={isSelected}
                    onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    disabled={submitted}
                    style={{ 
                      marginRight: isMobile ? 'var(--space-3)' : 'var(--space-2)',
                      minWidth: isMobile ? '18px' : '16px',
                      minHeight: isMobile ? '18px' : '16px',
                      marginTop: '2px',
                      flexShrink: 0
                    }}
                  />
                  <span style={{ 
                    fontSize: isMobile ? 15 : 16, 
                    lineHeight: isMobile ? 1.6 : 1.5,
                    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                    flex: 1
                  }}>
                    <strong>{optionLetter}.</strong> <MathText text={cleanOption} />
                  </span>
                </label>
              );
            })}
          </div>
        ) : question.type === 'essay' ? (
          <textarea
            value={answer}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            disabled={submitted}
            placeholder="Write your answer here..."
            rows={isMobile ? 8 : 6}
            style={{
              width: '100%',
              padding: isMobile ? 'var(--space-4)' : 'var(--space-3)',
              borderRadius: 'var(--radius-2)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: isMobile ? 16 : 15,
              fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
              lineHeight: 1.6,
              resize: 'vertical',
              minHeight: isMobile ? 150 : 120,
            }}
          />
        ) : (
          <input
            type="text"
            inputMode={question.type === 'numeric' ? 'text' : 'text'}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={answer}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            disabled={submitted}
            placeholder={question.type === 'numeric' ? 'Enter your answer (e.g., 3/6 or 0.5)' : 'Enter your answer...'}
            style={{
              width: '100%',
              padding: isMobile ? '14px 16px' : '12px 14px',
              minHeight: isMobile ? 48 : 44,
              borderRadius: 'var(--radius-2)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: isMobile ? 16 : 15,
              lineHeight: 1.5,
              fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            }}
          />
        )}

        {/* Feedback */}
        {submitted && questionFeedback && (
          <>
            <div
              style={{
                marginTop: 'var(--space-3)',
                padding: 'var(--space-3)',
                background: questionFeedback.isCorrect
                  ? 'rgba(52, 199, 89, 0.1)'
                  : 'rgba(255, 59, 48, 0.1)',
                borderRadius: 'var(--radius-2)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-2)',
              }}
            >
              {questionFeedback.isCorrect ? (
                <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
              ) : (
                <XCircle className="w-5 h-5" style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
              )}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>{questionFeedback.feedback}</p>
                <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 0 }}>
                  Marks awarded: {questionFeedback.marks}/{question.marks}
                </p>
                
                {/* Individual Explain Button for Wrong Answers */}
                {!questionFeedback.isCorrect && !explanations[question.id] && (
                  <button
                    className="btn"
                    onClick={() => getAIExplanation(question.id)}
                    disabled={loadingExplanations[question.id]}
                    style={{
                      marginTop: 'var(--space-2)',
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      background: 'linear-gradient(135deg, var(--primary), rgba(124, 58, 237, 0.8))',
                      color: '#fff',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Sparkles className="w-4 h-4" />
                    {loadingExplanations[question.id] ? 'Loading...' : 'Explain Answer'}
                  </button>
                )}
              </div>
            </div>
            
            {/* AI Explanation (if available) */}
            {explanations[question.id] && (
              <div style={{
                marginTop: 'var(--space-3)',
                padding: 'var(--space-4)',
                background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.05), rgba(124, 58, 237, 0.1))',
                borderRadius: 'var(--radius-2)',
                borderLeft: '3px solid var(--primary)',
                boxShadow: '0 2px 8px rgba(124, 58, 237, 0.1)'
              }}>
                <div style={{ 
                  fontWeight: 600, 
                  marginBottom: 'var(--space-3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  color: 'var(--primary)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bot className="icon20" />
                    <span style={{ fontSize: 15 }}>🤖 Dash AI Explanation</span>
                  </div>
                  
                  {/* TTS Controls */}
                  {ttsSupported && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      {/* Quota Display */}
                      {ttsQuota && (
                        <div style={{
                          fontSize: 10,
                          color: ttsQuota.remaining === 0 ? 'var(--danger)' : 'var(--text-muted)',
                          fontWeight: 500,
                        }}>
                          {ttsQuota.remaining}/{ttsQuota.limit} TTS left today ({ttsQuota.tier})
                        </div>
                      )}
                      
                      {/* Controls */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {isSpeaking && speakingQuestionId === question.id ? (
                          <>
                            {isPaused ? (
                              <button
                                onClick={() => resume()}
                                title="Resume"
                                style={{
                                  padding: '6px 10px',
                                  background: 'var(--primary)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: 'var(--radius-1)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                <Play className="w-3.5 h-3.5" />
                                Resume
                              </button>
                            ) : (
                              <button
                                onClick={() => pause()}
                                title="Pause"
                                style={{
                                  padding: '6px 10px',
                                  background: 'var(--warning)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: 'var(--radius-1)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                <Pause className="w-3.5 h-3.5" />
                                Pause
                              </button>
                            )}
                            <button
                              onClick={() => {
                                stop();
                                setSpeakingQuestionId(null);
                              }}
                              title="Stop"
                              style={{
                                padding: '6px 10px',
                                background: 'var(--danger)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 'var(--radius-1)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 12,
                                fontWeight: 600,
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <VolumeX className="w-3.5 h-3.5" />
                              Stop
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={async () => {
                              // Check quota before speaking
                              const quotaCheck = await checkTTSQuota();
                              if (!quotaCheck.allowed) {
                                setUpgradeModalData({
                                  currentUsage: quotaCheck.limit,
                                  currentLimit: quotaCheck.limit,
                                });
                                setShowUpgradeModal(true);
                                return;
                              }
                              
                              setSpeakingQuestionId(question.id);
                              // Use Azure TTS with friendly style and auto-detect language
                              speak(explanations[question.id], {
                                style: 'friendly',
                                rate: 5,
                                pitch: 0,
                              });
                            }}
                            title={`Listen to explanation (${voicePreference} voice)`}
                            disabled={ttsQuota?.remaining === 0}
                            style={{
                              padding: '6px 10px',
                              background: ttsQuota?.remaining === 0 ? 'var(--border)' : 'var(--primary)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 'var(--radius-1)',
                              cursor: ttsQuota?.remaining === 0 ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 12,
                              fontWeight: 600,
                              transition: 'all 0.2s ease',
                              opacity: ttsQuota?.remaining === 0 ? 0.5 : 1,
                            }}
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            {ttsQuota?.remaining === 0 ? 'Limit Reached' : 'Listen'}
                          </button>
                        )}
                      </div>
                      
                      {/* Error Display */}
                      {ttsError && (
                        <div style={{
                          fontSize: 10,
                          color: 'var(--danger)',
                          maxWidth: 200,
                          textAlign: 'right',
                        }}>
                          {ttsError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="markdown-content" style={{ fontSize: 14, lineHeight: 1.6 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {explanations[question.id]}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const answeredCount = Object.values(studentAnswers).filter(a => a.trim() !== '').length;
  const totalQuestions = exam.sections.reduce((sum, s) => sum + s.questions.length, 0);

  const SA_LANGUAGES_MAP: Record<SupportedLang, string> = {
    'en-ZA': 'English', 'af-ZA': 'Afrikaans', 'zu-ZA': 'isiZulu', 'xh-ZA': 'isiXhosa',
    'st-ZA': 'Sesotho', 'tn-ZA': 'Setswana', 'nso-ZA': 'Sepedi', 'ss-ZA': 'siSwati',
    've-ZA': 'Tshivenda', 'ts-ZA': 'Xitsonga', 'nr-ZA': 'isiNdebele',
  };

  return (
    <div style={{ 
      width: '100%',
      margin: '0',
      padding: '0',
      minHeight: '100vh',
      background: isMobile ? 'var(--bg)' : 'transparent',
    }}>
      {/* Accessibility Bar */}
      <ExamAccessibilityBar
        settings={a11y}
        onChange={setA11y}
        isSpeaking={isSpeaking}
        onStopSpeaking={() => { stop(); setSpeakingQuestionId(null); }}
        userId={userId}
      />

      {/* Header */}
      <div style={{
        padding: isMobile ? 'var(--space-4)' : 'var(--space-5)',
        background: 'var(--card)',
        borderRadius: isMobile ? '0' : 'var(--radius-2)',
        marginBottom: isMobile ? '0' : 'var(--space-4)',
        marginLeft: isMobile ? '0' : 'var(--space-4)',
        marginRight: isMobile ? '0' : 'var(--space-4)',
        borderBottom: isMobile ? '1px solid var(--border)' : undefined,
        position: 'relative',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      }}>
        {/* Close button for mobile-friendly exit */}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close exam and return to chat"
            title="Close exam and return to chat"
            className={`absolute z-10 ${isMobile ? 'top-4 right-4' : 'top-5 right-5'} w-11 h-11 flex items-center justify-center rounded-full bg-white/90 border border-black/20 shadow backdrop-blur-sm text-slate-900 dark:bg-slate-700 dark:text-white dark:border-white/30 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500`}
          >
            <X className={`${isMobile ? 'w-6 h-6' : 'w-5 h-5'}`} strokeWidth={2.5} />
          </button>
        )}
        
        {/* Title with school branding */}
        <div style={{
          marginBottom: isMobile ? 'var(--space-3)' : 'var(--space-4)',
          paddingRight: isMobile ? '40px' : '0',
        }}>
          {/* School Name Badge */}
          {exam.schoolName && (
            <div style={{
              display: 'inline-block',
              padding: '4px 12px',
              background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
              color: 'white',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: 'var(--space-2)',
              letterSpacing: '0.02em'
            }}>
              {formatSchoolName(exam.schoolName)}
            </div>
          )}
          
          {/* Main Title */}
          <h1 style={{ 
            fontSize: isMobile ? 20 : 26, 
            fontWeight: 700, 
            marginBottom: 'var(--space-2)',
            letterSpacing: '-0.02em',
            lineHeight: 1.3
          }}>
            {exam.title}
          </h1>
          
          {/* Metadata Row */}
          <div style={{
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            fontSize: isMobile ? 13 : 14,
            color: 'var(--text-muted)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 600 }}>Grade:</span>
              <span>{exam.grade || 'N/A'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 600 }}>Subject:</span>
              <span>{exam.subject || 'N/A'}</span>
            </div>
            {exam.duration && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 600 }}>Duration:</span>
                <span>{exam.duration}</span>
              </div>
            )}
            {exam.totalMarks && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 600 }}>Total Marks:</span>
                <span>{exam.totalMarks}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Actions: Export / Save */}
        <div style={{ 
          display: 'flex', 
          gap: 'var(--space-2)',
          flexDirection: isMobile ? 'column' : 'row',
          width: isMobile ? '100%' : 'auto'
        }}>
            <button
              className="btn"
              onClick={() => {
                try {
                  // Print-friendly export
                  const printWindow = window.open('', '_blank');
                  if (!printWindow) return;
                  const html = `<!doctype html><html><head><title>${exam.title}</title>
                    <style>
                      body{font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:24px; color:#111}
                      h1,h2{margin:0 0 12px 0}
                      .q{margin:12px 0; padding:12px; border:1px solid #ddd; border-radius:8px}
                      .marks{font-size:12px;color:#666}
                    </style>
                  </head><body>
                    <h1>${exam.title}</h1>
                    ${exam.sections.map(s => `
                      <h2>${s.title}</h2>
                      ${s.questions.map(q => `<div class='q'><div>${q.text}</div><div class='marks'>[${q.marks} ${q.marks===1?'mark':'marks'}]</div></div>`).join('')}
                    `).join('')}
                  </body></html>`;
                  printWindow.document.write(html);
                  printWindow.document.close();
                  printWindow.focus();
                  printWindow.print();
                } catch (e) {
                  console.error('Print failed', e);
                }
              }}
              style={{
                width: isMobile ? '100%' : 'auto',
                justifyContent: isMobile ? 'center' : 'flex-start'
              }}
            >
              <Printer className="icon16" />
              {isMobile ? 'Print' : 'Print'}
            </button>
            <button
              className="btn btnPrimary"
              onClick={() => {
                try {
                  // Build a markdown-like string from parsed exam for the new PDF exporter
                  const markdownLines: string[] = [];
                  markdownLines.push(`# ${exam.title || 'Practice Exam'}`);
                  if (exam.instructions?.length) {
                    markdownLines.push('', '**INSTRUCTIONS:**');
                    exam.instructions.forEach((inst, idx) => markdownLines.push(`${idx + 1}. ${inst}`));
                  }
                  exam.sections?.forEach((section, sIdx) => {
                    markdownLines.push('', `## ${section.title || `SECTION ${String.fromCharCode(65 + sIdx)}`}`);
                    section.questions?.forEach((q, qIdx) => {
                      const markTag = q.marks ? ` (${q.marks} marks)` : '';
                      markdownLines.push(`${qIdx + 1}. ${q.text}${markTag}`);
                      if (q.options?.length) {
                        q.options.forEach((opt, oIdx) => markdownLines.push(`${String.fromCharCode(65 + oIdx)}) ${opt}`));
                      }
                    });
                  });
                  const mdContent = markdownLines.join('\n');

                  downloadExamPdf(mdContent, {
                    title: exam.title || 'Practice Exam',
                    grade: exam.grade || 'N/A',
                    subject: exam.subject || 'N/A',
                    duration: exam.duration || 'N/A',
                    totalMarks: exam.totalMarks || 0,
                  });
                  showToast('PDF downloaded successfully!');
                  
                  // Track download
                  if (generationId) {
                    const sb = createClient();
                    sb.from('exam_generations')
                      .update({ downloaded_at: new Date().toISOString() })
                      .eq('id', generationId)
                      .then(() => console.log('Download tracked'));
                  }
                } catch (e) {
                  console.error('PDF export failed', e);
                  showToast('Failed to generate PDF. Please try again.', 'error');
                }
              }}
              style={{
                width: isMobile ? '100%' : 'auto',
                justifyContent: isMobile ? 'center' : 'flex-start'
              }}
            >
              <Download className="icon16" />
              {isMobile ? 'Download PDF' : 'Download PDF'}
            </button>
            <button
              className="btn btnSecondary"
              disabled={savingExam}
              onClick={async () => {
                if (!userId) {
                  showToast('You must be logged in to save exams.', 'error');
                  return;
                }
                setSavingExam(true);
                try {
                  // Rebuild content string from parsed exam
                  const contentLines: string[] = [];
                  contentLines.push(`# ${exam.title || 'Practice Exam'}`);
                  if (exam.instructions?.length) {
                    contentLines.push('', '**INSTRUCTIONS:**');
                    exam.instructions.forEach((inst, idx) => contentLines.push(`${idx + 1}. ${inst}`));
                  }
                  exam.sections?.forEach((section, sIdx) => {
                    contentLines.push('', `## ${section.title || `SECTION ${String.fromCharCode(65 + sIdx)}`}`);
                    section.questions?.forEach((q, qIdx) => {
                      const markTag = q.marks ? ` (${q.marks} marks)` : '';
                      contentLines.push(`${qIdx + 1}. ${q.text}${markTag}`);
                      if (q.options?.length) {
                        q.options.forEach((opt, oIdx) => contentLines.push(`${String.fromCharCode(65 + oIdx)}) ${opt}`));
                      }
                    });
                  });

                  await saveExam({
                    userId,
                    grade: exam.grade,
                    subject: exam.subject,
                    content: contentLines.join('\n'),
                    title: exam.title || 'Practice Exam',
                  });
                  showToast('Exam saved to your history!');
                } catch (e) {
                  console.error('Save failed', e);
                  showToast('Failed to save exam. Please try again.', 'error');
                } finally {
                  setSavingExam(false);
                }
              }}
              style={{
                width: isMobile ? '100%' : 'auto',
                justifyContent: isMobile ? 'center' : 'flex-start'
              }}
            >
              <SaveIcon className="icon16" />
              {savingExam ? 'Saving...' : isMobile ? 'Save Exam' : 'Save Exam'}
            </button>
          </div>

        {/* Score Display (if submitted) */}
        {submitted && score && (
          <div style={{
            padding: 'var(--space-4)',
            margin: isMobile ? 'var(--space-3) 0' : 'var(--space-3) 0',
            background: score.earned / score.total >= 0.5
              ? 'linear-gradient(135deg, rgba(52, 199, 89, 0.1) 0%, rgba(52, 199, 89, 0.2) 100%)'
              : 'linear-gradient(135deg, rgba(255, 149, 0, 0.1) 0%, rgba(255, 149, 0, 0.2) 100%)',
            borderRadius: isMobile ? '0' : 'var(--radius-2)',
            border: '2px solid',
            borderColor: score.earned / score.total >= 0.5 ? 'var(--success)' : 'var(--warning)',
            borderLeft: isMobile ? 'none' : '2px solid',
            borderRight: isMobile ? 'none' : '2px solid',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 42, fontWeight: 800, marginBottom: 'var(--space-2)', letterSpacing: '-0.02em' }}>
              {score.earned}/{score.total}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
              {Math.round((score.earned / score.total) * 100)}% Score
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 'var(--space-2)', marginBottom: 0 }}>
              {score.earned / score.total >= 0.8 ? '?? Outstanding!' :
               score.earned / score.total >= 0.7 ? '? Well done!' :
               score.earned / score.total >= 0.5 ? '?? Good effort!' :
               '?? Keep practicing!'}
            </p>
          </div>
        )}

        {/* Instructions */}
        {exam.instructions && Array.isArray(exam.instructions) && exam.instructions.length > 0 && !submitted && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 'var(--space-2)', color: 'var(--text)' }}>
              Instructions:
            </h3>
            <ul style={{ paddingLeft: 'var(--space-4)', margin: 0 }}>
              {exam.instructions.map((instruction, idx) => (
                <li key={idx} style={{ fontSize: 14, marginBottom: 'var(--space-1)', lineHeight: 1.6 }}>
                  {instruction}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Progress Indicator */}
        {!submitted && (
          <div style={{
            marginTop: 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-2)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}>
            <AlertCircle className="w-5 h-5" style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 14 }}>
              Answered: {answeredCount}/{totalQuestions} questions
            </span>
          </div>
        )}
      </div>

      {/* Sections */}
      {exam.sections && Array.isArray(exam.sections) && exam.sections.map((section, sectionIdx) => (
        <div 
          key={sectionIdx} 
          style={{ 
            marginBottom: isMobile ? '0' : 'var(--space-4)',
            marginLeft: isMobile ? '0' : 'var(--space-4)',
            marginRight: isMobile ? '0' : 'var(--space-4)',
            paddingBottom: (sectionIdx === exam.sections.length - 1 && !submitted) ? '140px' : '0'
          }}
        >
          <h2 style={{
            fontSize: isMobile ? 17 : 18,
            fontWeight: 700,
            marginBottom: isMobile ? '0' : 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'var(--primary)',
            color: '#fff',
            borderRadius: isMobile ? '0' : 'var(--radius-2)',
            letterSpacing: '-0.01em',
            textTransform: 'uppercase'
          }}>
            {section.title}
          </h2>
          {(section.readingPassage || section.instructions) && (
            <div
              style={{
                marginBottom: 'var(--space-3)',
                padding: 'var(--space-3)',
                borderRadius: isMobile ? 0 : 'var(--radius-2)',
                border: '1px solid var(--border)',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(99,102,241,0.08))',
              }}
            >
              {section.readingPassage && (
                <div>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8, color: 'var(--primary)' }}>
                    Reading passage
                  </div>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {section.readingPassage}
                  </p>
                </div>
              )}
              {section.instructions && (
                <p style={{ marginTop: section.readingPassage ? 12 : 0, marginBottom: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                  {section.instructions}
                </p>
              )}
            </div>
          )}
          {section.questions && Array.isArray(section.questions) && section.questions.map(renderQuestion)}
        </div>
      ))}

      {/* Submit Button */}
      {!submitted && (
        <div style={{ 
          position: 'fixed',
          bottom: 0, 
          left: 0,
          right: 0,
          width: '100%',
          maxWidth: '100vw',
          margin: '0',
          padding: 'var(--space-4)', 
          background: 'var(--bg)', 
          borderTop: '1px solid var(--border)', 
          zIndex: 1000,
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)'
        }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <button
            className="btn btnPrimary"
            onClick={handleSubmit}
            disabled={answeredCount === 0 || saving}
            style={{ 
              width: '100%', 
              fontSize: isMobile ? 18 : 16, 
              padding: isMobile ? 'var(--space-4) var(--space-3)' : 'var(--space-4)',
              fontWeight: 600
            }}
          >
            <FileCheck className="icon16" />
            {saving ? 'Submitting...' : `Submit Exam (${answeredCount}/${totalQuestions} answered)`}
          </button>
          {answeredCount === 0 && (
            <p className="muted text-center" style={{ fontSize: 12, marginTop: 'var(--space-2)', marginBottom: 0 }}>
              Please answer at least one question before submitting
            </p>
          )}
          </div>
        </div>
      )}
      
      {/* AI Explanations Button */}
      {submitted && Object.values(feedback).some(f => !f.isCorrect) && (
        <div style={{ 
          marginTop: 'var(--space-4)', 
          padding: 'var(--space-4)',
          background: 'linear-gradient(135deg, var(--surface), var(--surface-2))',
          borderRadius: 'var(--radius-2)',
          border: '1px solid var(--border)',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <Sparkles style={{ width: 32, height: 32, color: 'var(--primary)', margin: '0 auto' }} />
          </div>
          <h3 style={{ fontSize: 19, fontWeight: 700, marginBottom: 'var(--space-2)', letterSpacing: '-0.01em' }}>
            Need help understanding your mistakes?
          </h3>
          <p className="muted" style={{ fontSize: 14, marginBottom: 'var(--space-4)' }}>
            Dash AI can provide detailed step-by-step explanations for each question you got wrong, helping you learn from your mistakes.
          </p>
          <button 
            className="btn btnPrimary"
            onClick={getAIExplanations}
            disabled={Object.values(loadingExplanations).some(loading => loading) || Object.keys(explanations).length > 0}
            style={{ 
              fontSize: 16, 
              padding: 'var(--space-3) var(--space-6)',
              minWidth: 280
            }}
          >
            <Bot className="icon20" />
            {Object.values(loadingExplanations).some(loading => loading)
              ? 'Getting Explanations...' 
              : Object.keys(explanations).length > 0
              ? '✓ Explanations Loaded'
              : '🤖 Get AI Explanations'}
          </button>
          {Object.keys(explanations).length > 0 && (
            <p className="muted" style={{ fontSize: 12, marginTop: 'var(--space-2)', marginBottom: 0 }}>
              ? Scroll up to see explanations for each incorrect answer
            </p>
          )}
        </div>
      )}

      {/* Close Button (after submission) */}
      {submitted && onClose && (
        <div style={{ marginTop: 'var(--space-4)', textAlign: 'center' }}>
          <button
            className="btn btnSecondary"
            onClick={onClose}
            style={{ padding: 'var(--space-3) var(--space-6)' }}
          >
            Return to Dashboard
          </button>
        </div>
      )}

      {/* UpgradeModal for explanation quota exceeded */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentTier={currentTier}
        userId={userId || ''}
        userEmail={userEmail}
        userName={userName}
        featureBlocked="explanation"
        currentUsage={upgradeModalData?.currentUsage}
        currentLimit={upgradeModalData?.currentLimit}
      />

      {/* Toast notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: submitted ? 24 : 90,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 24px',
            borderRadius: 'var(--radius-2)',
            background: toastMessage.type === 'success'
              ? 'linear-gradient(135deg, #34c759, #30b350)'
              : 'linear-gradient(135deg, #ff3b30, #d63027)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            zIndex: 9999,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            animation: 'fadeIn 0.25s ease',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: '90vw',
          }}
        >
          {toastMessage.type === 'success' ? '✓' : '✗'} {toastMessage.text}
        </div>
      )}
    </div>
  );
}
