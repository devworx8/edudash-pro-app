import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExamQuestion } from '@/lib/examParser';
import {
  extractChoiceLetter,
  normalizeChoiceText,
  sanitizeChoiceText,
} from '@/components/exam-prep/question-card/helpers';
import { questionCardStyles as styles } from '@/components/exam-prep/question-card/styles';
import { containsMathSyntax } from '@/components/exam-prep/mathSegments';

type ObjectiveOptionsProps = {
  currentAnswer: string;
  displayOptions?: string[];
  isLocked: boolean;
  question: ExamQuestion;
  resolvedCorrectLetter: string | null;
  theme: Record<string, string>;
  onSelectOption: (option: string, optionId?: string) => void;
  renderRichMathText: (value: string, textStyle: any, textColor: string) => React.ReactNode;
};

function getLockedStyles(params: {
  isLocked: boolean;
  isSelected: boolean;
  isCorrectOption: boolean;
  theme: Record<string, string>;
}) {
  const { isLocked, isSelected, isCorrectOption, theme } = params;

  let lockedBg = theme.background;
  let lockedBorder = theme.border;
  let lockedTextColor = theme.text;
  let lockedIcon: React.ReactNode = null;

  if (!isLocked) {
    return { lockedBg, lockedBorder, lockedTextColor, lockedIcon };
  }

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

  return { lockedBg, lockedBorder, lockedTextColor, lockedIcon };
}

function renderMultipleChoice({
  currentAnswer,
  displayOptions,
  isLocked,
  onSelectOption,
  question,
  renderRichMathText,
  resolvedCorrectLetter,
  theme,
}: ObjectiveOptionsProps) {
  if (question.type !== 'multiple_choice' || !question.options?.length) return null;

  return (
    <View style={styles.optionsContainer}>
      {question.options.map((option, index) => {
        const optionLetter = String.fromCharCode(65 + index);
        const cleanedOption = option.replace(/^\s*[A-D]\s*[\.\)\-:]\s*/i, '').trim();
        const translatedOption = displayOptions?.[index];
        const displayOption = String(translatedOption || cleanedOption).trim();
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

        const { lockedBg, lockedBorder, lockedIcon, lockedTextColor } = getLockedStyles({
          isLocked,
          isSelected,
          isCorrectOption,
          theme,
        });

        return (
          <TouchableOpacity
            key={index}
            style={[
              styles.optionButton,
              {
                backgroundColor: isLocked
                  ? lockedBg
                  : isSelected
                    ? `${theme.primary}20`
                    : theme.background,
                borderColor: isLocked ? lockedBorder : isSelected ? theme.primary : theme.border,
                opacity: isLocked && !isSelected && !isCorrectOption ? 0.7 : 1,
              },
            ]}
            onPress={() => {
              if (!isLocked) onSelectOption(cleanedOption, optionLetter);
            }}
            disabled={isLocked}
            activeOpacity={isLocked ? 1 : 0.7}
          >
            <View
              style={[
                styles.optionCircle,
                {
                  borderColor: isLocked ? lockedBorder : isSelected ? theme.primary : theme.border,
                },
              ]}
            >
              {isLocked
                ? lockedIcon
                : isSelected && <Ionicons name="checkmark" size={12} color={theme.primary} />}
            </View>
            <View style={styles.optionTextWrap}>
              <Text
                style={[
                  styles.optionText,
                  styles.optionTextPrefix,
                  {
                    color: isLocked ? lockedTextColor : isSelected ? theme.primary : theme.text,
                  },
                ]}
              >
                {optionLetter}.
              </Text>
              {containsMathSyntax(displayOption) ? (
                renderRichMathText(
                  displayOption,
                  styles.optionText,
                  isLocked ? lockedTextColor : isSelected ? theme.primary : theme.text,
                )
              ) : (
                <Text
                  style={[
                    styles.optionText,
                    {
                      color: isLocked ? lockedTextColor : isSelected ? theme.primary : theme.text,
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
  );
}

function renderTrueFalse({
  currentAnswer,
  displayOptions,
  isLocked,
  onSelectOption,
  question,
  resolvedCorrectLetter,
  theme,
}: ObjectiveOptionsProps) {
  if (question.type !== 'true_false') return null;

  const options =
    displayOptions?.length
      ? displayOptions
      : question.options?.length
        ? question.options.map((option) => sanitizeChoiceText(option))
        : ['True', 'False'];

  return (
    <View style={styles.optionsContainer}>
      {options.map((option, index) => {
        const optionLabel = sanitizeChoiceText(option);
        const optionLetter = String.fromCharCode(65 + index);
        const optionLetterLower = optionLetter.toLowerCase();
        const normalizedCurrentAnswer = String(currentAnswer || '').trim();
        const isSelected =
          normalizeChoiceText(normalizedCurrentAnswer) === normalizeChoiceText(optionLabel) ||
          extractChoiceLetter(normalizedCurrentAnswer) === optionLetterLower;
        const isCorrectOption = Boolean(
          (resolvedCorrectLetter && resolvedCorrectLetter === optionLetterLower) ||
            normalizeChoiceText(String(question.correctAnswer || '')) === normalizeChoiceText(optionLabel),
        );

        const { lockedBg, lockedBorder, lockedIcon, lockedTextColor } = getLockedStyles({
          isLocked,
          isSelected,
          isCorrectOption,
          theme,
        });

        return (
          <TouchableOpacity
            key={`${optionLabel}-${index}`}
            style={[
              styles.optionButton,
              {
                backgroundColor: isLocked
                  ? lockedBg
                  : isSelected
                    ? `${theme.primary}20`
                    : theme.background,
                borderColor: isLocked ? lockedBorder : isSelected ? theme.primary : theme.border,
                opacity: isLocked && !isSelected && !isCorrectOption ? 0.7 : 1,
              },
            ]}
            onPress={() => {
              if (!isLocked) onSelectOption(optionLabel, optionLetter);
            }}
            disabled={isLocked}
            activeOpacity={isLocked ? 1 : 0.7}
          >
            <View
              style={[
                styles.optionCircle,
                {
                  borderColor: isLocked ? lockedBorder : isSelected ? theme.primary : theme.border,
                },
              ]}
            >
              {isLocked
                ? lockedIcon
                : isSelected && <Ionicons name="checkmark" size={12} color={theme.primary} />}
            </View>
            <Text
              style={[
                styles.optionText,
                {
                  color: isLocked ? lockedTextColor : isSelected ? theme.primary : theme.text,
                },
              ]}
            >
              {optionLabel}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ObjectiveOptions(props: ObjectiveOptionsProps) {
  if (props.question.type === 'multiple_choice') {
    return renderMultipleChoice(props);
  }
  if (props.question.type === 'true_false') {
    return renderTrueFalse(props);
  }
  return null;
}
