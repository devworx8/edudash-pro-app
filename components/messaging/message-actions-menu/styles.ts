import { Platform, StyleSheet } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

const SCREEN_SHEET_BG = 'rgba(7, 12, 30, 0.98)';
const SURFACE_BORDER = 'rgba(125, 211, 252, 0.14)';
const SOFT_BORDER = 'rgba(125, 211, 252, 0.12)';
const SOFT_SURFACE = 'rgba(255,255,255,0.06)';

export const createMessageActionsStyles = ({
  theme,
  insets,
  viewportWidth,
  screenHeight,
}: {
  theme: {
    primary: string;
    text: string;
    textSecondary: string;
  };
  insets: EdgeInsets;
  viewportWidth: number;
  screenHeight: number;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.62)',
    },
    sheet: {
      backgroundColor: SCREEN_SHEET_BG,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: insets.bottom + 16,
      maxHeight: screenHeight * 0.6,
      width: '100%',
      alignSelf: 'center',
      maxWidth: Platform.OS === 'web' ? Math.min(viewportWidth, 760) : undefined,
      borderWidth: 1,
      borderColor: SURFACE_BORDER,
      ...Platform.select({
        ios: {
          shadowColor: '#050816',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.4,
          shadowRadius: 24,
        },
        android: {
          elevation: 16,
        },
      }),
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: 'rgba(191, 212, 255, 0.28)',
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 16,
    },
    messagePreview: {
      marginHorizontal: 16,
      marginBottom: 16,
      padding: 14,
      backgroundColor: 'rgba(21, 31, 58, 0.9)',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgba(74, 222, 128, 0.28)',
    },
    previewText: {
      color: '#dbe4ff',
      fontSize: 14,
      lineHeight: 20,
    },
    reactionsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: SOFT_BORDER,
    },
    reactionButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: SOFT_SURFACE,
      borderWidth: 1,
      borderColor: 'rgba(191, 212, 255, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    reactionEmoji: {
      fontSize: 24,
    },
    moreReactionsButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: SOFT_SURFACE,
      borderWidth: 1,
      borderColor: 'rgba(191, 212, 255, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fullEmojiPickerContainer: {
      borderBottomWidth: 1,
      borderBottomColor: SOFT_BORDER,
    },
    emojiPickerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    emojiPickerTitle: {
      fontSize: 16,
      fontWeight: '600',
    },
    actionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 8,
      paddingTop: 8,
    },
    actionButton: {
      width: '25%',
      alignItems: 'center',
      paddingVertical: 16,
    },
    actionIconContainer: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: SOFT_SURFACE,
      borderWidth: 1,
      borderColor: 'rgba(191, 212, 255, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    actionLabel: {
      fontSize: 12,
      color: theme.text,
      fontWeight: '500',
    },
    destructiveLabel: {
      color: '#ef4444',
    },
    translateContainer: {
      borderBottomWidth: 1,
      borderBottomColor: SOFT_BORDER,
      paddingBottom: 8,
    },
    translateHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    translateTitle: {
      fontSize: 16,
      fontWeight: '600',
    },
    translateOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      gap: 12,
    },
    translateFlag: {
      fontSize: 22,
    },
    translateLabel: {
      fontSize: 15,
      fontWeight: '500',
      flex: 1,
    },
    translateLoading: {
      fontSize: 13,
    },
  });
