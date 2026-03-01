/**
 * ExamQuestionCard Component
 *
 * Renders the current question: reading passage, question text,
 * answer options / text input, and post-submission feedback.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExamQuestion, ExamSection } from '@/lib/examParser';
import type { StudentAnswer } from '@/hooks/useExamSession';
import { MathRenderer } from '@/components/ai/dash-assistant/MathRenderer';
import { containsMathDelimiters, parseMathSegments } from '@/components/exam-prep/mathSegments';
import { MathCalculator } from '@/components/exam-prep/MathCalculator';
import { assertSupabase } from '@/lib/supabase';

type WorkspaceTab = 'answer' | 'work';
type TranslatedQuestionContent = {
  sectionInstructions?: string;
  readingPassage?: string;
  question: string;
  options?: string[];
};

interface ExamQuestionCardProps {
  section: ExamSection;
  question: ExamQuestion;
  examLanguage?: string;
  currentIndex: number;
  currentAnswer: string;
  studentAnswer?: StudentAnswer;
  isLocked: boolean;
  onChangeAnswer: (text: string) => void;
  onSelectOption: (option: string) => void;
  theme: Record<string, string>;
}

function questionTypeIcon(type: ExamQuestion['type']): { name: string; label: string } {
  switch (type) {
    case 'multiple_choice':
      return { name: 'radio-button-on', label: 'Multiple Choice' };
    case 'true_false':
      return { name: 'swap-horizontal', label: 'True / False' };
    case 'short_answer':
    case 'fill_blank':
    case 'fill_in_blank':
      return { name: 'pencil', label: 'Short Answer' };
    case 'essay':
      return { name: 'document-text', label: 'Essay' };
    case 'matching':
      return { name: 'git-compare', label: 'Matching' };
    default:
      return { name: 'help-circle', label: '' };
  }
}

const MATH_HINT = 'Use LaTeX for maths: \\frac{1}{2}  \\sqrt{x}  x^2  \\times  \\div';

const isOpenAnswer = (type: ExamQuestion['type']) =>
  type === 'short_answer' || type === 'essay' || type === 'fill_blank' || type === 'fill_in_blank';

function sanitizeChoiceText(value: string): string {
  return String(value || '')
    .replace(/^(?:\s*[A-D]\s*[\.\)\-:]\s*)+/i, '')
    .trim();
}

function normalizeChoiceText(value: string): string {
  return sanitizeChoiceText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractChoiceLetter(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const exact = raw.match(/^\s*([A-D])\s*$/i);
  if (exact?.[1]) return exact[1].toLowerCase();

  const prefixed = raw.match(/^\s*([A-D])\s*[\.\)\-:]/i);
  if (prefixed?.[1]) return prefixed[1].toLowerCase();

  const labeled = raw.match(/\b(?:option|answer|correct(?:\s+answer)?)\s*[:\-]?\s*([A-D])\b/i);
  if (labeled?.[1]) return labeled[1].toLowerCase();

  return null;
}

function resolveChoiceLetter(value: string | undefined, options: string[] | undefined): string | null {
  if (!value) return null;

  const direct = extractChoiceLetter(value);
  if (direct) return direct;
  if (!Array.isArray(options) || options.length === 0) return null;

  const normalized = normalizeChoiceText(value);
  if (!normalized) return null;

  const index = options.findIndex((option) => normalizeChoiceText(option) === normalized);
  return index >= 0 ? String.fromCharCode(97 + index) : null;
}

function parseStandaloneMath(value: string): { expression: string; displayMode: boolean } | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  const blockMatch = trimmed.match(/^\$\$([\s\S]+)\$\$$/);
  if (blockMatch?.[1]) {
    return {
      expression: blockMatch[1].trim(),
      displayMode: true,
    };
  }

  const inlineMatch = trimmed.match(/^\$([^$\n]+)\$$/);
  if (inlineMatch?.[1]) {
    return {
      expression: inlineMatch[1].trim(),
      displayMode: false,
    };
  }

  return null;
}

export function ExamQuestionCard({
  section,
  question,
  examLanguage,
  currentIndex,
  currentAnswer,
  studentAnswer,
  isLocked,
  onChangeAnswer,
  onSelectOption,
  theme,
}: ExamQuestionCardProps) {
  const typeInfo = questionTypeIcon(question.type);
  const showWorkspace = isOpenAnswer(question.type);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('answer');
  const [workText, setWorkText] = useState('');
  const [showMathPreview, setShowMathPreview] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [translatedContentByQuestion, setTranslatedContentByQuestion] = useState<Record<string, TranslatedQuestionContent>>({});
  const [translatedVisibleByQuestion, setTranslatedVisibleByQuestion] = useState<Record<string, boolean>>({});
  const [translatingQuestionId, setTranslatingQuestionId] = useState<string | null>(null);
  const [translationErrorByQuestion, setTranslationErrorByQuestion] = useState<Record<string, string>>({});

  const canTranslateToEnglish = useMemo(() => {
    const normalized = String(examLanguage || '').trim().toLowerCase();
    if (!normalized) return false;
    return !normalized.startsWith('en');
  }, [examLanguage]);

  const translatedContent = translatedContentByQuestion[question.id];
  const showTranslated = translatedVisibleByQuestion[question.id] === true;

  const displaySectionInstructions = showTranslated
    ? translatedContent?.sectionInstructions || section.instructions || ''
    : section.instructions || '';
  const displayReadingPassage = showTranslated
    ? translatedContent?.readingPassage || section.readingPassage || ''
    : section.readingPassage || '';
  const displayQuestionText = showTranslated
    ? translatedContent?.question || question.question
    : question.question;
  const displayOptions = showTranslated && translatedContent?.options?.length
    ? translatedContent.options
    : question.options;

  const sectionInstructionsMath = parseStandaloneMath(displaySectionInstructions || '');
  const questionMath = parseStandaloneMath(displayQuestionText);
  const readingPassageMath = parseStandaloneMath(displayReadingPassage || '');
  const feedbackMath = parseStandaloneMath(studentAnswer?.feedback || '');
  const correctAnswerMath = parseStandaloneMath(question.correctAnswer || '');
  const resolvedCorrectLetter = useMemo(
    () => resolveChoiceLetter(question.correctAnswer, question.options),
    [question.correctAnswer, question.options],
  );
  const resolvedCorrectAnswerDisplay = useMemo(() => {
    const raw = String(question.correctAnswer || '').trim();
    if (!raw) return '';
    if (!Array.isArray(question.options) || question.options.length === 0) return raw;
    if (!resolvedCorrectLetter) return raw;
    const optionIndex = resolvedCorrectLetter.charCodeAt(0) - 97;
    const option = question.options[optionIndex];
    if (!option) return raw;
    return `${resolvedCorrectLetter.toUpperCase()}. ${sanitizeChoiceText(option)}`;
  }, [question.correctAnswer, question.options, resolvedCorrectLetter]);

  const translateTextToEnglish = useCallback(async (rawValue?: string): Promise<string> => {
    const value = String(rawValue || '').trim();
    if (!value) return '';

    const supabase = assertSupabase();
    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: {
        scope: 'student',
        service_type: 'lesson_generation',
        payload: {
          prompt: [
            'Translate this educational text into plain South African English.',
            'Preserve math notation, numbering, and mark references.',
            'Return only the translated text with no extra commentary.',
            '',
            value,
          ].join('\n'),
          context:
            'You are a precise translation assistant for a K-12 exam platform. Keep educational intent unchanged.',
        },
        stream: false,
        enable_tools: false,
        metadata: {
          source: 'exam_question.translate_to_english',
          target_language: 'en',
        },
      },
    });

    if (error) {
      throw new Error(error.message || 'Translation failed');
    }

    const translated =
      typeof data === 'string'
        ? data.trim()
        : String(data?.content || data?.choices?.[0]?.message?.content || '').trim();

    if (!translated) {
      throw new Error('Empty translation response');
    }

    return translated;
  }, []);

  const handleTranslateQuestion = useCallback(async () => {
    if (showTranslated) {
      setTranslatedVisibleByQuestion((prev) => ({ ...prev, [question.id]: false }));
      return;
    }

    if (translatedContentByQuestion[question.id]) {
      setTranslatedVisibleByQuestion((prev) => ({ ...prev, [question.id]: true }));
      return;
    }

    try {
      setTranslatingQuestionId(question.id);
      const [translatedInstructions, translatedPassage, translatedQuestion, translatedOptions] = await Promise.all([
        translateTextToEnglish(section.instructions),
        translateTextToEnglish(section.readingPassage),
        translateTextToEnglish(question.question),
        question.options?.length
          ? Promise.all(question.options.map((option) => translateTextToEnglish(option)))
          : Promise.resolve(undefined),
      ]);

      const translatedPayload: TranslatedQuestionContent = {
        sectionInstructions: translatedInstructions || undefined,
        readingPassage: translatedPassage || undefined,
        question: translatedQuestion || question.question,
        options: translatedOptions?.length ? translatedOptions : undefined,
      };

      setTranslatedContentByQuestion((prev) => ({ ...prev, [question.id]: translatedPayload }));
      setTranslatedVisibleByQuestion((prev) => ({ ...prev, [question.id]: true }));
      setTranslationErrorByQuestion((prev) => ({ ...prev, [question.id]: '' }));
    } catch {
      setTranslatedVisibleByQuestion((prev) => ({ ...prev, [question.id]: false }));
      setTranslationErrorByQuestion((prev) => ({
        ...prev,
        [question.id]: 'Translation failed. Please retry.',
      }));
    } finally {
      setTranslatingQuestionId((prev) => (prev === question.id ? null : prev));
    }
  }, [
    showTranslated,
    translatedContentByQuestion,
    question.id,
    question.question,
    question.options,
    section.instructions,
    section.readingPassage,
    translateTextToEnglish,
  ]);

  const renderRichMathText = (
    value: string,
    textStyle: any,
    textColor: string,
  ): React.ReactNode => {
    const segments = parseMathSegments(value);
    const hasBlock = segments.some((segment) => segment.type === 'block');

    if (segments.length === 0 || !containsMathDelimiters(value)) {
      return (
        <Text style={[textStyle, { color: textColor }]}>
          {value}
        </Text>
      );
    }

    if (hasBlock) {
      return (
        <View style={styles.mathBlockWrap}>
          {segments.map((segment, index) => {
            if (segment.type === 'text') {
              return (
                <Text key={`segment-${index}`} style={[textStyle, { color: textColor }]}>
                  {segment.value}
                </Text>
              );
            }

            return (
              <MathRenderer
                key={`segment-${index}`}
                expression={segment.value}
                displayMode={segment.type === 'block'}
              />
            );
          })}
        </View>
      );
    }

    return (
      <View style={styles.mathInlineWrap}>
        {segments.map((segment, index) => {
          if (segment.type === 'text') {
            return (
              <Text key={`segment-${index}`} style={[textStyle, { color: textColor }]}>
                {segment.value}
              </Text>
            );
          }
          return (
            <View key={`segment-${index}`} style={styles.mathInlineItem}>
              <MathRenderer expression={segment.value} displayMode={false} />
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <>
      {/* Section Title */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.primary }]}>
          {section.title}
        </Text>
        {displaySectionInstructions ? (
          sectionInstructionsMath ? (
            <MathRenderer
              expression={sectionInstructionsMath.expression}
              displayMode={sectionInstructionsMath.displayMode}
            />
          ) : containsMathDelimiters(displaySectionInstructions || '') ? (
            renderRichMathText(displaySectionInstructions || '', styles.sectionInstructions, theme.textSecondary)
          ) : (
            <Text style={[styles.sectionInstructions, { color: theme.textSecondary }]}>
              {displaySectionInstructions}
            </Text>
          )
        ) : null}
      </View>

      {/* Reading Passage */}
      {displayReadingPassage ? (
        <View style={[styles.readingPassageCard, { backgroundColor: theme.surface }]}>
          <View style={styles.passageLabelRow}>
            <Ionicons name="book-outline" size={14} color={theme.primary} />
          <Text style={[styles.readingPassageTitle, { color: theme.primary }]}>
            Passage
          </Text>
        </View>
          {readingPassageMath ? (
            <MathRenderer expression={readingPassageMath.expression} displayMode={readingPassageMath.displayMode} />
          ) : containsMathDelimiters(displayReadingPassage || '') ? (
            renderRichMathText(displayReadingPassage || '', styles.readingPassageText, theme.text)
          ) : (
            <Text style={[styles.readingPassageText, { color: theme.text }]}>
              {displayReadingPassage}
            </Text>
          )}
        </View>
      ) : null}

      {/* Question Card */}
      <View style={[styles.questionCard, { backgroundColor: theme.surface }]}>
        <View style={styles.questionHeader}>
          <View style={styles.questionNumberRow}>
            <Ionicons
              name={typeInfo.name as any}
              size={14}
              color={theme.textSecondary}
            />
            <Text style={[styles.questionNumber, { color: theme.textSecondary }]}>
              Question {currentIndex + 1}
            </Text>
          </View>
          <View style={[styles.marksBadge, { backgroundColor: theme.primary + '20' }]}>
            <Text style={[styles.marksLabel, { color: theme.primary }]}>
              {question.marks} {question.marks === 1 ? 'mark' : 'marks'}
            </Text>
          </View>
        </View>

        {canTranslateToEnglish ? (
          <View style={styles.translateRow}>
            <TouchableOpacity
              style={[
                styles.translateButton,
                {
                  borderColor: showTranslated ? theme.primary : theme.border,
                  backgroundColor: showTranslated ? `${theme.primary}20` : theme.background,
                },
              ]}
              onPress={handleTranslateQuestion}
              disabled={translatingQuestionId === question.id}
            >
              {translatingQuestionId === question.id ? (
                <View style={styles.translateBusy}>
                  <Ionicons name="sync-outline" size={12} color={theme.primary} />
                  <Text style={[styles.translateLabel, { color: theme.primary }]}>Translating...</Text>
                </View>
              ) : (
                <View style={styles.translateBusy}>
                  <Ionicons name="language-outline" size={12} color={theme.primary} />
                  <Text style={[styles.translateLabel, { color: theme.primary }]}>
                    {showTranslated ? 'Show original' : 'Translate to English'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            {translationErrorByQuestion[question.id] ? (
              <Text style={[styles.translateError, { color: theme.error || '#ef4444' }]}>
                {translationErrorByQuestion[question.id]}
              </Text>
            ) : null}
          </View>
        ) : null}

        {questionMath ? (
          <MathRenderer expression={questionMath.expression} displayMode={questionMath.displayMode} />
        ) : containsMathDelimiters(displayQuestionText || '') ? (
          renderRichMathText(displayQuestionText || '', styles.questionText, theme.text)
        ) : (
          <Text style={[styles.questionText, { color: theme.text }]}>
            {displayQuestionText}
          </Text>
        )}

        {/* Multiple Choice Options */}
        {question.type === 'multiple_choice' && question.options && (
          <View style={styles.optionsContainer}>
            {question.options.map((option, index) => {
              const optionLetter = String.fromCharCode(65 + index);
              const cleanedOption = option.replace(/^\s*[A-D]\s*[\.\)\-:]\s*/i, '').trim();
              const translatedOption = displayOptions?.[index];
              const displayOption = String(translatedOption || cleanedOption).trim();
              const optionMath = parseStandaloneMath(displayOption);
              const normalizedCurrentAnswer = String(currentAnswer || '').trim();
              const isSelected =
                normalizedCurrentAnswer === option ||
                normalizedCurrentAnswer === cleanedOption ||
                normalizedCurrentAnswer === optionLetter ||
                normalizedCurrentAnswer.toLowerCase() === optionLetter.toLowerCase() ||
                normalizeChoiceText(normalizedCurrentAnswer) === normalizeChoiceText(cleanedOption) ||
                extractChoiceLetter(normalizedCurrentAnswer) === optionLetter.toLowerCase();

              const optionLetterLower = optionLetter.toLowerCase();
              const isCorrectOption = Boolean(
                (resolvedCorrectLetter && resolvedCorrectLetter === optionLetterLower) ||
                  normalizeChoiceText(String(question.correctAnswer || '')) === normalizeChoiceText(cleanedOption),
              );

              let lockedBg = theme.background;
              let lockedBorder = theme.border;
              let lockedTextColor = theme.text;
              let lockedIcon: React.ReactNode = null;

              if (isLocked) {
                if (isSelected && isCorrectOption) {
                  lockedBg = '#10b98120';
                  lockedBorder = '#10b981';
                  lockedTextColor = '#10b981';
                  lockedIcon = <Ionicons name="checkmark" size={12} color="#10b981" />;
                } else if (isSelected && !isCorrectOption) {
                  lockedBg = '#ef444420';
                  lockedBorder = '#ef4444';
                  lockedTextColor = '#ef4444';
                  lockedIcon = <Ionicons name="close" size={12} color="#ef4444" />;
                } else if (isCorrectOption) {
                  lockedBg = '#10b98120';
                  lockedBorder = '#10b981';
                  lockedTextColor = '#10b981';
                  lockedIcon = <Ionicons name="checkmark" size={12} color="#10b981" />;
                }
              }

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.optionButton,
                    {
                      backgroundColor: isLocked
                        ? lockedBg
                        : isSelected ? theme.primary + '20' : theme.background,
                      borderColor: isLocked
                        ? lockedBorder
                        : isSelected ? theme.primary : theme.border,
                      opacity: isLocked && !isSelected && !isCorrectOption ? 0.7 : 1,
                    },
                  ]}
                  onPress={() => { if (!isLocked) onSelectOption(cleanedOption); }}
                  disabled={isLocked}
                  activeOpacity={isLocked ? 1 : 0.7}
                >
                  <View
                    style={[
                      styles.optionCircle,
                      {
                        borderColor: isLocked
                          ? lockedBorder
                          : isSelected ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    {isLocked
                      ? lockedIcon
                      : isSelected && (
                          <Ionicons name="checkmark" size={12} color={theme.primary} />
                        )}
                  </View>
                  <View style={styles.optionTextWrap}>
                    <Text
                      style={[
                        styles.optionText,
                        styles.optionTextPrefix,
                        {
                          color: isLocked
                            ? lockedTextColor
                            : isSelected ? theme.primary : theme.text,
                        },
                      ]}
                    >
                      {optionLetter}.
                    </Text>
                    {optionMath ? (
                      <MathRenderer
                        expression={optionMath.expression}
                        displayMode={false}
                      />
                    ) : containsMathDelimiters(displayOption) ? (
                      renderRichMathText(
                        displayOption,
                        styles.optionText,
                        isLocked
                          ? lockedTextColor
                          : isSelected ? theme.primary : theme.text,
                      )
                    ) : (
                      <Text
                        style={[
                          styles.optionText,
                          {
                            color: isLocked
                              ? lockedTextColor
                              : isSelected ? theme.primary : theme.text,
                          },
                        ]}
                      >
                        {displayOption}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* True / False */}
        {question.type === 'true_false' && (
          <View style={styles.optionsContainer}>
            {['True', 'False'].map((option) => {
              const isSelected = currentAnswer.toLowerCase() === option.toLowerCase();
              const isCorrectOption =
                question.correctAnswer?.toLowerCase() === option.toLowerCase();

              let lockedBg = theme.background;
              let lockedBorder = theme.border;
              let lockedTextColor = theme.text;
              let lockedIcon: React.ReactNode = null;

              if (isLocked) {
                if (isSelected && isCorrectOption) {
                  lockedBg = '#10b98120';
                  lockedBorder = '#10b981';
                  lockedTextColor = '#10b981';
                  lockedIcon = <Ionicons name="checkmark" size={12} color="#10b981" />;
                } else if (isSelected && !isCorrectOption) {
                  lockedBg = '#ef444420';
                  lockedBorder = '#ef4444';
                  lockedTextColor = '#ef4444';
                  lockedIcon = <Ionicons name="close" size={12} color="#ef4444" />;
                } else if (isCorrectOption) {
                  lockedBg = '#10b98120';
                  lockedBorder = '#10b981';
                  lockedTextColor = '#10b981';
                  lockedIcon = <Ionicons name="checkmark" size={12} color="#10b981" />;
                }
              }

              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.optionButton,
                    {
                      backgroundColor: isLocked
                        ? lockedBg
                        : isSelected ? theme.primary + '20' : theme.background,
                      borderColor: isLocked
                        ? lockedBorder
                        : isSelected ? theme.primary : theme.border,
                      opacity: isLocked && !isSelected && !isCorrectOption ? 0.7 : 1,
                    },
                  ]}
                  onPress={() => { if (!isLocked) onSelectOption(option); }}
                  disabled={isLocked}
                  activeOpacity={isLocked ? 1 : 0.7}
                >
                  <View
                    style={[
                      styles.optionCircle,
                      {
                        borderColor: isLocked
                          ? lockedBorder
                          : isSelected ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    {isLocked
                      ? lockedIcon
                      : isSelected && (
                          <Ionicons name="checkmark" size={12} color={theme.primary} />
                        )}
                  </View>
                  <Text
                    style={[
                      styles.optionText,
                      {
                        color: isLocked
                          ? lockedTextColor
                          : isSelected ? theme.primary : theme.text,
                      },
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Tabbed Workspace (Answer + Show Work) */}
        {showWorkspace && (
          <View style={styles.workspaceContainer}>
            {/* Tab Row */}
            <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'answer' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
                onPress={() => setActiveTab('answer')}
              >
                <Ionicons name="pencil" size={14} color={activeTab === 'answer' ? theme.primary : theme.textSecondary} />
                <Text style={[styles.tabLabel, { color: activeTab === 'answer' ? theme.primary : theme.textSecondary }]}>
                  Answer
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'work' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
                onPress={() => setActiveTab('work')}
              >
                <Ionicons name="calculator" size={14} color={activeTab === 'work' ? theme.primary : theme.textSecondary} />
                <Text style={[styles.tabLabel, { color: activeTab === 'work' ? theme.primary : theme.textSecondary }]}>
                  Show Work
                </Text>
              </TouchableOpacity>
            </View>

            {/* Answer Tab */}
            {activeTab === 'answer' && (
              <TextInput
                style={[
                  styles.answerInput,
                  question.type === 'essay' && styles.essayInput,
                  {
                    backgroundColor: isLocked ? theme.background + '80' : theme.background,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                  isLocked && { opacity: 0.7 },
                ]}
                value={currentAnswer}
                onChangeText={onChangeAnswer}
                placeholder="Type your answer here..."
                placeholderTextColor={theme.textTertiary}
                multiline
                numberOfLines={question.type === 'essay' ? 6 : 3}
                editable={!isLocked}
              />
            )}

            {/* Show Work Tab */}
            {activeTab === 'work' && (
              <View style={styles.workTab}>
                <View style={[styles.workHintRow, { backgroundColor: theme.primary + '18' }]}>
                  <Ionicons name="information-circle-outline" size={14} color={theme.primary} />
                  <Text style={[styles.workHint, { color: theme.primary }]}>{MATH_HINT}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.calculatorToggle, { borderColor: theme.border, backgroundColor: theme.surface }]}
                  onPress={() => setShowCalculator((p) => !p)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calculator-outline" size={16} color={theme.primary} />
                  <Text style={[styles.calculatorToggleLabel, { color: theme.text }]}>
                    {showCalculator ? 'Hide calculator' : 'Show calculator'}
                  </Text>
                  <Ionicons name={showCalculator ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
                </TouchableOpacity>

                {showCalculator && (
                  <MathCalculator
                    theme={theme as Record<string, string>}
                    onInsertResult={(value) => setWorkText((prev) => (prev ? `${prev} ${value}` : value))}
                  />
                )}

                <TextInput
                  style={[
                    styles.workInput,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                    isLocked && { opacity: 0.7 },
                  ]}
                  value={workText}
                  onChangeText={setWorkText}
                  placeholder="Write your working here… steps, calculations, diagrams described in text or LaTeX"
                  placeholderTextColor={theme.textTertiary}
                  multiline
                  numberOfLines={6}
                  editable={!isLocked}
                  textAlignVertical="top"
                />

                {/* LaTeX Preview toggle */}
                {workText.trim().length > 0 && (
                  <TouchableOpacity
                    style={[styles.previewToggle, { borderColor: theme.border }]}
                    onPress={() => setShowMathPreview(p => !p)}
                  >
                    <Ionicons
                      name={showMathPreview ? 'eye-off-outline' : 'eye-outline'}
                      size={16}
                      color={theme.textSecondary}
                    />
                    <Text style={[styles.previewToggleLabel, { color: theme.textSecondary }]}>
                      {showMathPreview ? 'Hide preview' : 'Preview maths'}
                    </Text>
                  </TouchableOpacity>
                )}

                {showMathPreview && workText.trim().length > 0 && (
                  <View style={[styles.mathPreviewCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.mathPreviewTitle, { color: theme.textSecondary }]}>
                      Rendered preview
                    </Text>
                    <ScrollView>
                      <MathRenderer expression={workText} displayMode />
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Feedback after submission */}
        {studentAnswer?.feedback && (
          <View
            style={[
              styles.feedbackCard,
              {
                backgroundColor: studentAnswer.isCorrect ? '#10b98120' : '#ef444420',
                borderColor: studentAnswer.isCorrect ? '#10b981' : '#ef4444',
              },
            ]}
          >
            <View style={styles.feedbackHeader}>
              <Ionicons
                name={studentAnswer.isCorrect ? 'checkmark-circle' : 'close-circle'}
                size={24}
                color={studentAnswer.isCorrect ? '#10b981' : '#ef4444'}
              />
              <Text
                style={[
                  styles.feedbackTitle,
                  { color: studentAnswer.isCorrect ? '#10b981' : '#ef4444' },
                ]}
              >
                {studentAnswer.isCorrect ? 'Correct!' : 'Incorrect'}
              </Text>
              {studentAnswer.marks !== undefined && (
                <Text
                  style={[
                    styles.feedbackMarks,
                    { color: studentAnswer.isCorrect ? '#10b981' : '#ef4444' },
                  ]}
                >
                  {studentAnswer.marks}/{question.marks}
                </Text>
              )}
            </View>
            {feedbackMath ? (
              <MathRenderer expression={feedbackMath.expression} displayMode={feedbackMath.displayMode} />
            ) : containsMathDelimiters(studentAnswer.feedback || '') ? (
              renderRichMathText(studentAnswer.feedback || '', styles.feedbackText, theme.text)
            ) : (
              <Text style={[styles.feedbackText, { color: theme.text }]}>
                {studentAnswer.feedback}
              </Text>
            )}
            {!studentAnswer.isCorrect && question.correctAnswer && (
              <View style={styles.correctAnswerRow}>
                <Text style={[styles.correctAnswerLabel, { color: '#10b981' }]}>
                  Correct answer:
                </Text>
                {correctAnswerMath ? (
                  <MathRenderer expression={correctAnswerMath.expression} displayMode={false} />
                ) : containsMathDelimiters(resolvedCorrectAnswerDisplay || question.correctAnswer || '') ? (
                  renderRichMathText(
                    resolvedCorrectAnswerDisplay || question.correctAnswer || '',
                    styles.correctAnswerValue,
                    theme.text,
                  )
                ) : (
                  <Text style={[styles.correctAnswerValue, { color: theme.text }]}>
                    {resolvedCorrectAnswerDisplay || question.correctAnswer}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionInstructions: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  mathBlockWrap: {
    gap: 8,
  },
  mathInlineWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 4,
    rowGap: 4,
  },
  mathInlineItem: {
    minWidth: 32,
  },
  readingPassageCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
  passageLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  readingPassageTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  readingPassageText: {
    fontSize: 16,
    lineHeight: 24,
  },
  questionCard: {
    borderRadius: 12,
    padding: 16,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  questionNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  questionNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  marksBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  marksLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  questionText: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  translateRow: {
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  translateButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  translateBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  translateLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  translateError: {
    fontSize: 11,
    marginTop: 6,
  },
  optionsContainer: {
    marginTop: 8,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    marginBottom: 8,
  },
  optionCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontSize: 15,
  },
  optionTextWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optionTextPrefix: {
    minWidth: 18,
  },
  workspaceContainer: {
    marginTop: 8,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginBottom: 10,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingBottom: 8,
    marginBottom: -1,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  answerInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  essayInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  workTab: {
    gap: 10,
  },
  calculatorToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  calculatorToggleLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  workHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  workHint: {
    fontSize: 11,
    fontFamily: 'monospace' as const,
    flex: 1,
    flexWrap: 'wrap' as const,
  },
  workInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 140,
    fontFamily: 'monospace' as const,
    textAlignVertical: 'top' as const,
  },
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start' as const,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  previewToggleLabel: {
    fontSize: 13,
  },
  mathPreviewCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    maxHeight: 200,
  },
  mathPreviewTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  feedbackCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  feedbackTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  feedbackMarks: {
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackText: {
    fontSize: 14,
    lineHeight: 20,
  },
  correctAnswerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.2)',
  },
  correctAnswerLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  correctAnswerValue: {
    fontSize: 13,
    flex: 1,
  },
});
