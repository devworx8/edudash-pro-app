/**
 * Message Styles
 * 
 * Styles for message bubbles, attachments, and related components:
 * - DashMessageBubble
 * - DashAssistantMessages
 * - DashTypingIndicator
 */

import { StyleSheet, Dimensions, Platform } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');
const bubbleMaxWidth = screenWidth < 360 ? screenWidth * 0.9 : screenWidth < 420 ? screenWidth * 0.9 : screenWidth * 0.88;
const bubbleMinWidth = screenWidth < 360 ? 128 : 148;

export const messageStyles = StyleSheet.create({
  // Messages Container
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },

  // Phase Rail
  phaseRailContainer: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  phaseRailTrack: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '50%',
    height: 2,
    borderRadius: 1,
  },
  phaseRailStep: {
    alignItems: 'center',
    gap: 4,
  },
  phaseRailDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  phaseRailLabel: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Message Bubbles
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
    width: '100%',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  assistantMessage: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
    marginRight: 8,
    marginTop: 4,
    flexShrink: 0,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 2,
    } : {
      elevation: 2,
    }),
  },
  messageBubble: {
    maxWidth: bubbleMaxWidth,
    minWidth: bubbleMinWidth,
    paddingHorizontal: screenWidth < 400 ? 14 : 16,
    paddingVertical: screenWidth < 400 ? 10 : 12,
    minHeight: 48,
    alignSelf: 'flex-start',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  userBubble: {
    borderRadius: 18,
    borderBottomRightRadius: 8,
    marginLeft: 10,
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    borderRadius: 18,
    borderBottomLeftRadius: 8,
    marginRight: 10,
  },
  userMessageStack: {
    width: '100%',
    alignItems: 'flex-end',
    gap: 8,
  },
  userTextBubble: {
    alignSelf: 'flex-end',
  },
  userStandaloneMediaContainer: {
    alignSelf: 'flex-end',
    maxWidth: bubbleMaxWidth,
    gap: 8,
  },

  // Message Content
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0.2,
    flexShrink: 1,
    fontWeight: '400',
  },
  messageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  messageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  messageRoleLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  phasePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  phaseText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  messageContentRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 6,
    position: 'relative',
  },
  bubbleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  inlineAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    flexShrink: 0,
  },
  voiceNoteIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  voiceNoteDuration: {
    fontSize: 10,
    marginLeft: 4,
  },
  messageBubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  inlineFooterRetryButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  messageTime: {
    fontSize: 10,
    letterSpacing: 0.2,
    marginTop: 0,
    alignSelf: 'flex-end',
  },

  // Message Attachments
  messageAttachmentsContainer: {
    marginTop: 8,
    gap: 6,
  },
  imagePreviewRow: {
    marginTop: 6,
    gap: 6,
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  imagePreviewRowFlush: {
    marginTop: 0,
  },
  imagePreviewCard: {
    alignSelf: 'flex-end',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 0,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    } : {
      elevation: 2,
    }),
  },
  imagePreview: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  messageAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  messageAttachmentName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  messageAttachmentSize: {
    fontSize: 10,
  },

  // Inline Answer Input
  inlineAnswerContainer: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  inlineAnswerLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  inlineAnswerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineAnswerInput: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.05)',
    fontSize: 15,
    fontWeight: '400',
  },
  inlineAnswerSend: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
    } : {
      elevation: 2,
    }),
  },

  // Follow-up Questions
  followUpContainer: {
    marginTop: 10,
  },
  followUpScroll: {
    paddingRight: 12,
    gap: 8,
  },
  followUpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'rgba(0,0,0,0.03)',
    gap: 8,
    minHeight: 40,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    } : {
      elevation: 2,
    }),
  },
  followUpText: {
    maxWidth: screenWidth < 360 ? 180 : 220,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  followUpSendIcon: {
    width: 22,
    height: 22,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Action Buttons
  speakButton: {
    width: screenWidth < 400 ? 30 : 32,
    height: screenWidth < 400 ? 30 : 32,
    borderRadius: screenWidth < 400 ? 15 : 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: screenWidth < 400 ? 6 : 8,
    minWidth: 30,
    minHeight: 30,
  },
  inlineSpeakButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  retryButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },

  // Typing Indicator
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  typingBubble: {
    padding: 12,
    borderRadius: 18,
    marginLeft: 28,
  },
  typingContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingText: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 8,
  },
  typingDots: {
    flexDirection: 'row',
    marginLeft: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 2,
  },

  // Suggested Actions
  suggestedActionsContainer: {
    marginTop: 8,
    marginBottom: 8,
    width: screenWidth,
    marginLeft: -16,
  },
  suggestedActionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  suggestedActionsScrollContent: {
    paddingLeft: 16,
    paddingRight: 16,
    gap: 8,
  },
  suggestedAction: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    marginRight: 0,
  },
  suggestedActionText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'none',
  },

  // Scroll Controls
  scrollToBottomFab: {
    position: 'absolute',
    right: 16,
    bottom: 96,
    zIndex: 120,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    } : {}),
  },
  scrollToBottomBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ffffff',
  },
  scrollToBottomBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Empty State
  emptyStateContainer: {
    flexGrow: 1,
    width: '100%',
    alignItems: 'stretch',
    paddingBottom: 12,
  },
  emptyStateHero: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  emptyStateHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyStateHeroText: {
    flex: 1,
  },
  emptyStateGradient: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyStateLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#7c3aed',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
    } : {
      elevation: 8,
    }),
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 0,
  },
  primaryCtasRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    minHeight: 44,
    flexGrow: 1,
    flexBasis: screenWidth < 380 ? '100%' : '30%',
  },
  primaryCtaText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionBlock: {
    marginBottom: 16,
  },
  profileHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  profileHintText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ageChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  ageChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  journeyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  journeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  journeyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  journeySteps: {
    gap: 10,
  },
  journeyStep: {
    paddingVertical: 2,
  },
  journeyStepLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  journeyStepSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  journeyButton: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  journeyButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  resumeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resumeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  quickActionsContainer: {
    width: '100%',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    } : {
      elevation: 2,
    }),
  },
  actionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
