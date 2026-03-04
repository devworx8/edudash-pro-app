import { StyleSheet } from 'react-native';

export const questionCardStyles = StyleSheet.create({
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
    alignItems: 'flex-start',
    columnGap: 4,
    rowGap: 4,
  },
  mathInlineItem: {
    minWidth: 32,
    maxWidth: '100%',
    flexShrink: 1,
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
    alignItems: 'flex-start',
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
    marginTop: 2,
  },
  optionText: {
    fontSize: 15,
  },
  optionTextWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    flexWrap: 'wrap' as const,
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
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
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
    width: '100%',
  },
});
