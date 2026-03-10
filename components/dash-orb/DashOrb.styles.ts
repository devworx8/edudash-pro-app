import { StyleSheet, Dimensions } from 'react-native';
import type { ThemeColors } from '@/contexts/ThemeContext';

const { width: screenWidth } = Dimensions.get('window');
const orbBubbleMaxWidth = screenWidth < 360 ? screenWidth * 0.9 : screenWidth * 0.88;

/**
 * Theme-aware style factory for DashOrb components.
 * Call with a ThemeColors object to get properly-themed styles.
 */
export const createDashOrbStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    orbContainer: {
      position: 'absolute',
      zIndex: 1000,
      elevation: 1000,
      alignItems: 'center',
      justifyContent: 'center',
    },
    orbGlow: {
      position: 'absolute',
      backgroundColor: theme.primary,
    },
    orb: {
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 12,
      elevation: 10,
    },
    orbGradient: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalContainer: {
      flex: 1,
      justifyContent: 'flex-start',
    },
    blurOverlay: {
      ...StyleSheet.absoluteFillObject,
    },
    dismissArea: {
      flex: 1,
    },
    chatContainer: {
      flex: 1,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      overflow: 'hidden',
    },
    chatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    headerSafeArea: {
      backgroundColor: 'transparent',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerOrb: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: {
      marginLeft: 12,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
    },
    headerSubtitle: {
      fontSize: 12,
      marginTop: 2,
    },
    lockBadge: {
      position: 'absolute',
      bottom: -4,
      right: -4,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    upgradeBubble: {
      position: 'absolute',
      minWidth: 200,
      maxWidth: 280,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 16,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.borderLight,
      alignSelf: 'flex-start',
      flexShrink: 0,
      zIndex: 2000,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 2000,
    },
    upgradeBubbleTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
    },
    upgradeBubbleText: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 16,
      color: theme.textSecondary,
    },
  upgradeBubbleActions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
    upgradeButton: {
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
    },
    upgradeButtonText: {
      color: theme.onPrimary,
      fontSize: 12,
      fontWeight: '600',
    },
    closeButton: {
      padding: 8,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      gap: 6,
    },
    backButtonText: {
      fontSize: 13,
      fontWeight: '600',
    },
    helpTooltip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginHorizontal: 16,
      marginTop: 8,
      borderRadius: 8,
    },
    helpTooltipText: {
      color: theme.onPrimary,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
    },
    usageBanner: {
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    usageBannerText: {
      fontSize: 12,
      fontWeight: '600',
      flex: 1,
    },
    usageProgress: {
      width: 80,
      height: 6,
      borderRadius: 999,
      overflow: 'hidden',
    },
    usageProgressFill: {
      height: '100%',
      borderRadius: 999,
    },
    nextGenRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 2,
    },
    nextGenChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    nextGenChipText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    nextGenMemoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
      flex: 1,
      minWidth: 0,
    },
    nextGenMemoryText: {
      fontSize: 11,
      flex: 1,
    },
    messagesContainer: {
      flex: 1,
    },
    messagesContent: {
      padding: 16,
      paddingBottom: 32,
    },
    messageBubble: {
      maxWidth: orbBubbleMaxWidth,
      padding: 12,
      borderRadius: 16,
      marginBottom: 12,
    },
    userMessage: {
      alignSelf: 'flex-end',
      borderBottomRightRadius: 4,
    },
    assistantMessage: {
      alignSelf: 'flex-start',
      borderBottomLeftRadius: 4,
    },
    messageText: {
      fontSize: 15,
      lineHeight: 22,
    },
    toolSummaryCard: {
      marginTop: 8,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    toolSummaryText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
    imagePreviewRow: {
      marginTop: 10,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    imagePreviewCard: {
      width: 160,
      height: 120,
      borderRadius: 12,
      borderWidth: 1,
      overflow: 'hidden',
      backgroundColor: theme.surfaceVariant,
    },
    imagePreview: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    messageActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 10,
    },
    messageAction: {
      padding: 4,
    },
    inlineReplyContainer: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    inlineReplyInput: {
      flex: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
    },
    inlineReplySend: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickReplyRow: {
      paddingTop: 8,
      gap: 8,
    },
    quickReplyChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    quickReplyText: {
      fontSize: 12,
      fontWeight: '600',
    },
    quickIntentRow: {
      paddingHorizontal: 12,
      paddingBottom: 8,
      gap: 8,
      alignItems: 'center',
    },
    quickIntentScroller: {
      flexGrow: 0,
      flexShrink: 0,
      maxHeight: 52,
    },
    quickIntentChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      minHeight: 34,
      justifyContent: 'center',
      alignSelf: 'center',
    },
    quickIntentText: {
      fontSize: 12,
      fontWeight: '600',
    },
    editingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 8,
    },
    editingText: {
      fontSize: 12,
      fontWeight: '600',
    },
    loadingContainer: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    loadingText: {
      marginTop: 8,
      fontSize: 13,
    },
    typingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
    },
    typingText: {
      fontSize: 12,
      fontWeight: '600',
    },
    toolCallsContainer: {
      marginTop: 12,
      gap: 6,
    },
    toolCall: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    toolCallText: {
      fontSize: 12,
      textTransform: 'capitalize',
    },
    quickActionsContainer: {
      marginTop: 16,
    },
    quickActionsHeader: {
      marginBottom: 12,
    },
    quickActionsHeroCard: {
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      marginBottom: 16,
    },
    quickActionsHeroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    quickActionsHeroIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionsHeroText: {
      flex: 1,
    },
    quickActionsHeroTitle: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 4,
    },
    quickActionsHeroSubtitle: {
      fontSize: 13,
      lineHeight: 18,
    },
    quickActionsCtasRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 14,
    },
    quickActionsCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
    },
    quickActionsCtaText: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    quickActionsSectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    quickActionsChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
    },
    quickActionChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    quickActionInput: {
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
    },
    quickActionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'space-between',
    },
    quickAction: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      gap: 8,
      justifyContent: 'space-between',
      flexBasis: '48%',
      flexGrow: 1,
      minHeight: 56,
    },
    quickActionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    quickActionLocked: {
      opacity: 0.55,
    },
    quickActionLockBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
    },
    lockBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    quickActionText: {
      fontSize: 13,
      fontWeight: '500',
    },
    categoryLabel: {
      fontSize: 12,
      fontWeight: '600',
      marginTop: 12,
      marginBottom: 8,
    },
    quickActionsReturn: {
      paddingHorizontal: 16,
      paddingBottom: 6,
      alignItems: 'flex-start',
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: 12,
      borderTopWidth: 1,
      gap: 10,
    },
    voiceControls: {
      flexDirection: 'row',
      gap: 8,
    },
    orbControl: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    orbControlRing: {
      position: 'absolute',
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2,
      opacity: 0.25,
    },
    voiceButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${theme.primary}18`,
    },
    voiceButtonActive: {
      backgroundColor: `${theme.primary}33`,
    },
    inputWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 18,
      borderWidth: 1,
      minHeight: 36,
    },
    inputAccessoryLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 10,
    },
    inputIconButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputText: {
      flex: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 15,
      maxHeight: 88,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachBadgeSmall: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 14,
      height: 14,
      borderRadius: 7,
      justifyContent: 'center',
      alignItems: 'center',
    },
    attachBadgeSmallText: {
      fontSize: 8,
      fontWeight: '600',
    },
    imageViewerBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(5, 9, 20, 0.9)',
    },
    imageViewerContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    imageViewerClose: {
      position: 'absolute',
      top: 16,
      right: 16,
      zIndex: 2,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.overlay,
      alignItems: 'center',
      justifyContent: 'center',
    },
    imageViewerImage: {
      width: '100%',
      height: '80%',
      resizeMode: 'contain',
    },
  });

/**
 * Dynamic markdown styles for assistant messages
 */
export const getMarkdownStyles = (theme: {
  text: string;
  textSecondary: string;
  primary: string;
  surface: string;
  background: string;
}) => ({
  body: {
    color: theme.text,
    fontSize: 15,
    lineHeight: 22,
  },
  heading1: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '700' as const,
    marginTop: 12,
    marginBottom: 6,
  },
  heading2: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '600' as const,
    marginTop: 10,
    marginBottom: 5,
  },
  heading3: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600' as const,
    marginTop: 8,
    marginBottom: 4,
  },
  paragraph: {
    color: theme.text,
    marginBottom: 8,
  },
  strong: {
    fontWeight: '600' as const,
    color: theme.text,
  },
  em: {
    fontStyle: 'italic' as const,
    color: theme.textSecondary,
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    marginBottom: 4,
  },
  bullet_list_icon: {
    color: theme.primary,
    marginRight: 8,
  },
  code_inline: {
    backgroundColor: theme.surface,
    color: theme.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  code_block: {
    backgroundColor: '#1e1e1e',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  fence: {
    backgroundColor: '#1e1e1e',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  blockquote: {
    backgroundColor: theme.primary + '15',
    borderLeftWidth: 3,
    borderLeftColor: theme.primary,
    paddingLeft: 12,
    paddingVertical: 8,
    marginVertical: 8,
    borderRadius: 4,
  },
  link: {
    color: theme.primary,
    textDecorationLine: 'underline' as const,
  },
  hr: {
    backgroundColor: theme.textSecondary,
    height: 1,
    marginVertical: 12,
  },
});
