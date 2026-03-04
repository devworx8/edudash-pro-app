/**
 * ExamQuestionCard Component
 *
 * Renders the current question: reading passage, question text,
 * answer options / text input, and post-submission feedback.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExamQuestion, ExamSection } from '@/lib/examParser';
import type { StudentAnswer } from '@/hooks/useExamSession';
import { MathRenderer } from '@/components/ai/dash-assistant/MathRenderer';
import { containsMathSyntax } from '@/components/exam-prep/mathSegments';
import { assertSupabase } from '@/lib/supabase';
import { questionCardStyles as styles } from '@/components/exam-prep/question-card/styles';
import {
  isOpenAnswer,
  parseStandaloneMath,
  questionTypeIcon,
  resolveChoiceLetter,
  sanitizeChoiceText,
} from '@/components/exam-prep/question-card/helpers';
import { RichMathText } from '@/components/exam-prep/question-card/RichMathText';
import { ObjectiveOptions } from '@/components/exam-prep/question-card/ObjectiveOptions';
import {
  WorkspacePanel,
  type WorkspaceTab,
} from '@/components/exam-prep/question-card/WorkspacePanel';
import { FeedbackPanel } from '@/components/exam-prep/question-card/FeedbackPanel';

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
  onSelectOption: (option: string, optionId?: string) => void;
  theme: Record<string, string>;
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
  const [translatedContentByQuestion, setTranslatedContentByQuestion] = useState<
    Record<string, TranslatedQuestionContent>
  >({});
  const [translatedVisibleByQuestion, setTranslatedVisibleByQuestion] = useState<
    Record<string, boolean>
  >({});
  const [translatingQuestionId, setTranslatingQuestionId] = useState<string | null>(null);
  const [translationErrorByQuestion, setTranslationErrorByQuestion] = useState<
    Record<string, string>
  >({});

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
  const displayOptions =
    showTranslated && translatedContent?.options?.length ? translatedContent.options : question.options;

  const sectionInstructionsMath = parseStandaloneMath(displaySectionInstructions || '');
  const questionMath = parseStandaloneMath(displayQuestionText);
  const readingPassageMath = parseStandaloneMath(displayReadingPassage || '');
  const feedbackMath = parseStandaloneMath(studentAnswer?.feedback || '');
  const correctAnswerMath = parseStandaloneMath(question.correctAnswer || '');

  const resolvedCorrectLetter = useMemo(() => {
    const explicit = String(question.correctOptionId || '').trim();
    if (/^[A-D]$/i.test(explicit)) return explicit.toLowerCase();
    return resolveChoiceLetter(question.correctAnswer, question.options);
  }, [question.correctAnswer, question.correctOptionId, question.options]);

  const resolvedCorrectAnswerDisplay = useMemo(() => {
    const raw = String(question.correctAnswer || question.correctOptionId || '').trim();
    if (!raw) return '';
    if (!Array.isArray(question.options) || question.options.length === 0) return raw;
    if (!resolvedCorrectLetter) return raw;
    const optionIndex = resolvedCorrectLetter.charCodeAt(0) - 97;
    const option = question.options[optionIndex];
    if (!option) return raw;
    return `${resolvedCorrectLetter.toUpperCase()}. ${sanitizeChoiceText(option)}`;
  }, [question.correctAnswer, question.correctOptionId, question.options, resolvedCorrectLetter]);

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

    if (error) throw new Error(error.message || 'Translation failed');

    const translated =
      typeof data === 'string'
        ? data.trim()
        : String(data?.content || data?.choices?.[0]?.message?.content || '').trim();

    if (!translated) throw new Error('Empty translation response');
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
      const [translatedInstructions, translatedPassage, translatedQuestion, translatedOptions] =
        await Promise.all([
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
    question.id,
    question.options,
    question.question,
    section.instructions,
    section.readingPassage,
    showTranslated,
    translateTextToEnglish,
    translatedContentByQuestion,
  ]);

  const renderRichMathText = useCallback(
    (value: string, textStyle: any, textColor: string) => (
      <RichMathText value={value} textStyle={textStyle} textColor={textColor} />
    ),
    [],
  );

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.primary }]}>{section.title}</Text>
        {displaySectionInstructions ? (
          sectionInstructionsMath ? (
            <MathRenderer
              expression={sectionInstructionsMath.expression}
              displayMode={sectionInstructionsMath.displayMode}
            />
          ) : containsMathSyntax(displaySectionInstructions || '') ? (
            renderRichMathText(displaySectionInstructions || '', styles.sectionInstructions, theme.textSecondary)
          ) : (
            <Text style={[styles.sectionInstructions, { color: theme.textSecondary }]}>
              {displaySectionInstructions}
            </Text>
          )
        ) : null}
      </View>

      {displayReadingPassage ? (
        <View style={[styles.readingPassageCard, { backgroundColor: theme.surface }]}>
          <View style={styles.passageLabelRow}>
            <Ionicons name="book-outline" size={14} color={theme.primary} />
            <Text style={[styles.readingPassageTitle, { color: theme.primary }]}>Passage</Text>
          </View>
          {readingPassageMath ? (
            <MathRenderer expression={readingPassageMath.expression} displayMode={readingPassageMath.displayMode} />
          ) : containsMathSyntax(displayReadingPassage || '') ? (
            renderRichMathText(displayReadingPassage || '', styles.readingPassageText, theme.text)
          ) : (
            <Text style={[styles.readingPassageText, { color: theme.text }]}>{displayReadingPassage}</Text>
          )}
        </View>
      ) : null}

      <View style={[styles.questionCard, { backgroundColor: theme.surface }]}>
        <View style={styles.questionHeader}>
          <View style={styles.questionNumberRow}>
            <Ionicons name={typeInfo.name as any} size={14} color={theme.textSecondary} />
            <Text style={[styles.questionNumber, { color: theme.textSecondary }]}>
              Question {currentIndex + 1}
            </Text>
          </View>
          <View style={[styles.marksBadge, { backgroundColor: `${theme.primary}20` }]}>
            <Text style={[styles.marksLabel, { color: theme.primary }]}>
              {question.marks} {question.marks === 1 ? 'mark' : 'marks'}
            </Text>
          </View>
        </View>

        {canTranslateToEnglish && (
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
        )}

        {questionMath ? (
          <MathRenderer expression={questionMath.expression} displayMode={questionMath.displayMode} />
        ) : containsMathSyntax(displayQuestionText || '') ? (
          renderRichMathText(displayQuestionText || '', styles.questionText, theme.text)
        ) : (
          <Text style={[styles.questionText, { color: theme.text }]}>{displayQuestionText}</Text>
        )}

        <ObjectiveOptions
          currentAnswer={currentAnswer}
          displayOptions={displayOptions}
          isLocked={isLocked}
          question={question}
          resolvedCorrectLetter={resolvedCorrectLetter}
          theme={theme}
          onSelectOption={onSelectOption}
          renderRichMathText={renderRichMathText}
        />

        {showWorkspace && (
          <WorkspacePanel
            activeTab={activeTab}
            currentAnswer={currentAnswer}
            isLocked={isLocked}
            questionType={question.type}
            showCalculator={showCalculator}
            showMathPreview={showMathPreview}
            theme={theme}
            workText={workText}
            onChangeAnswer={onChangeAnswer}
            onSetActiveTab={setActiveTab}
            onSetShowCalculator={setShowCalculator}
            onSetShowMathPreview={setShowMathPreview}
            onSetWorkText={setWorkText}
          />
        )}

        <FeedbackPanel
          correctAnswerMath={correctAnswerMath}
          feedbackMath={feedbackMath}
          question={question}
          resolvedCorrectAnswerDisplay={resolvedCorrectAnswerDisplay}
          studentAnswer={studentAnswer}
          theme={theme}
          renderRichMathText={renderRichMathText}
        />
      </View>
    </>
  );
}
