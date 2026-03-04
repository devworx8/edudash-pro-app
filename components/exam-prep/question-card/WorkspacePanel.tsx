import React from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MathCalculator } from '@/components/exam-prep/MathCalculator';
import { MathRenderer } from '@/components/ai/dash-assistant/MathRenderer';
import { questionCardStyles as styles } from '@/components/exam-prep/question-card/styles';
import { MATH_HINT } from '@/components/exam-prep/question-card/helpers';

export type WorkspaceTab = 'answer' | 'work';

type WorkspacePanelProps = {
  activeTab: WorkspaceTab;
  currentAnswer: string;
  isLocked: boolean;
  questionType: string;
  showCalculator: boolean;
  showMathPreview: boolean;
  theme: Record<string, string>;
  workText: string;
  onChangeAnswer: (text: string) => void;
  onSetActiveTab: (tab: WorkspaceTab) => void;
  onSetShowCalculator: (value: boolean | ((prev: boolean) => boolean)) => void;
  onSetShowMathPreview: (value: boolean | ((prev: boolean) => boolean)) => void;
  onSetWorkText: (value: string | ((prev: string) => string)) => void;
};

export function WorkspacePanel({
  activeTab,
  currentAnswer,
  isLocked,
  questionType,
  showCalculator,
  showMathPreview,
  theme,
  workText,
  onChangeAnswer,
  onSetActiveTab,
  onSetShowCalculator,
  onSetShowMathPreview,
  onSetWorkText,
}: WorkspacePanelProps) {
  return (
    <View style={styles.workspaceContainer}>
      <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'answer' && { borderBottomColor: theme.primary, borderBottomWidth: 2 },
          ]}
          onPress={() => onSetActiveTab('answer')}
        >
          <Ionicons
            name="pencil"
            size={14}
            color={activeTab === 'answer' ? theme.primary : theme.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === 'answer' ? theme.primary : theme.textSecondary },
            ]}
          >
            Answer
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'work' && { borderBottomColor: theme.primary, borderBottomWidth: 2 },
          ]}
          onPress={() => onSetActiveTab('work')}
        >
          <Ionicons
            name="calculator"
            size={14}
            color={activeTab === 'work' ? theme.primary : theme.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === 'work' ? theme.primary : theme.textSecondary },
            ]}
          >
            Show Work
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'answer' && (
        <TextInput
          style={[
            styles.answerInput,
            questionType === 'essay' && styles.essayInput,
            {
              backgroundColor: isLocked ? `${theme.background}80` : theme.background,
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
          numberOfLines={questionType === 'essay' ? 6 : 3}
          editable={!isLocked}
        />
      )}

      {activeTab === 'work' && (
        <View style={styles.workTab}>
          <View style={[styles.workHintRow, { backgroundColor: `${theme.primary}18` }]}>
            <Ionicons name="information-circle-outline" size={14} color={theme.primary} />
            <Text style={[styles.workHint, { color: theme.primary }]}>{MATH_HINT}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.calculatorToggle,
              { borderColor: theme.border, backgroundColor: theme.surface },
            ]}
            onPress={() => onSetShowCalculator((prev) => !prev)}
            activeOpacity={0.7}
          >
            <Ionicons name="calculator-outline" size={16} color={theme.primary} />
            <Text style={[styles.calculatorToggleLabel, { color: theme.text }]}>
              {showCalculator ? 'Hide calculator' : 'Show calculator'}
            </Text>
            <Ionicons
              name={showCalculator ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={theme.textSecondary}
            />
          </TouchableOpacity>

          {showCalculator && (
            <MathCalculator
              theme={theme}
              onInsertResult={(value) =>
                onSetWorkText((prev) => (prev ? `${prev} ${value}` : value))
              }
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
            onChangeText={(value) => onSetWorkText(value)}
            placeholder="Write your working here… steps, calculations, diagrams described in text or LaTeX"
            placeholderTextColor={theme.textTertiary}
            multiline
            numberOfLines={6}
            editable={!isLocked}
            textAlignVertical="top"
          />

          {workText.trim().length > 0 && (
            <TouchableOpacity
              style={[styles.previewToggle, { borderColor: theme.border }]}
              onPress={() => onSetShowMathPreview((prev) => !prev)}
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
            <View
              style={[
                styles.mathPreviewCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
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
  );
}
