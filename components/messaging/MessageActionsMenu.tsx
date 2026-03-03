/**
 * MessageActionsMenu Component
 * WhatsApp-style bottom sheet with reactions and message actions
 * Triggered on long-press of a message bubble
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  Platform,
  Vibration,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import * as Clipboard from 'expo-clipboard';
import { toast } from '@/components/ui/ToastProvider';

// Lazy load EmojiPicker to avoid circular dependencies
let EmojiPickerComponent: React.FC<any> | null = null;
try {
  EmojiPickerComponent = require('@/components/messaging/EmojiPicker').EmojiPicker;
} catch {}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Common quick reactions
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export interface MessageAction {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  destructive?: boolean;
}

interface MessageActionsMenuProps {
  visible: boolean;
  onClose: () => void;
  messageId: string;
  messageContent: string;
  isOwnMessage: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onTranslate?: (language: 'en' | 'af' | 'zu') => void;
  isTranslating?: boolean;
  /** When true, show "Add to weekly program" (principal adding teacher's theme to curriculum) */
  showAddToWeeklyProgram?: boolean;
  onAddToWeeklyProgram?: () => void;
  /** When true, show "Convert to routine request" */
  showConvertToRoutineRequest?: boolean;
  onConvertToRoutineRequest?: () => void;
}

export const MessageActionsMenu: React.FC<MessageActionsMenuProps> = ({
  visible,
  onClose,
  messageId,
  messageContent,
  isOwnMessage,
  onReact,
  onReply,
  onCopy,
  onForward,
  onDelete,
  onEdit,
  onTranslate,
  isTranslating = false,
  showAddToWeeklyProgram = false,
  onAddToWeeklyProgram,
  showConvertToRoutineRequest = false,
  onConvertToRoutineRequest,
}) => {
  const { theme } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [showFullEmojiPicker, setShowFullEmojiPicker] = useState(false);
  const [showTranslateOptions, setShowTranslateOptions] = useState(false);
  const actionButtonWidth =
    viewportWidth < 420 ? '50%' :
    viewportWidth < 680 ? '33.333%' :
    '25%';
  
  // Safe message content with fallback to prevent crashes
  const safeMessageContent = messageContent || '';
  
  useEffect(() => {
    if (!visible) {
      setShowFullEmojiPicker(false);
      setShowTranslateOptions(false);
    }
  }, [visible]);
  
  useEffect(() => {
    if (visible && safeMessageContent) {
      // Haptic feedback on open
      if (Platform.OS !== 'web') {
        Vibration.vibrate(10);
      }
      
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim, safeMessageContent]);
  
  const handleCopy = async () => {
    await Clipboard.setStringAsync(safeMessageContent);
    toast.success('Copied to clipboard');
    onCopy();
    onClose();
  };
  
  const handleReaction = (emoji: string) => {
    setShowFullEmojiPicker(false);
    onReact(emoji);
    onClose();
  };
  
  const handleOpenEmojiPicker = () => {
    setShowFullEmojiPicker(true);
  };
  
  const handleAction = (action: () => void) => {
    action();
    onClose();
  };
  
  // Build action items
  const actions: MessageAction[] = [
    { id: 'reply', label: 'Reply', icon: 'arrow-undo' },
    { id: 'forward', label: 'Forward', icon: 'arrow-redo' },
    { id: 'copy', label: 'Copy', icon: 'copy-outline' },
    ...(showAddToWeeklyProgram && onAddToWeeklyProgram ? [{ id: 'add_to_weekly_program', label: 'Add to weekly program', icon: 'calendar-outline' as keyof typeof Ionicons.glyphMap, color: theme.primary }] : []),
    ...(showConvertToRoutineRequest && onConvertToRoutineRequest ? [{ id: 'convert_to_routine_request', label: 'Convert to routine request', icon: 'clipboard-outline' as keyof typeof Ionicons.glyphMap, color: theme.primary }] : []),
    ...(isOwnMessage && onEdit ? [{ id: 'edit', label: 'Edit', icon: 'pencil-outline' as keyof typeof Ionicons.glyphMap }] : []),
    ...(onTranslate ? [{ id: 'translate', label: 'Translate', icon: 'language-outline' as keyof typeof Ionicons.glyphMap }] : []),
    { id: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true, color: '#ef4444' },
  ];
  
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: insets.bottom + 16,
      maxHeight: SCREEN_HEIGHT * 0.6,
      width: '100%',
      alignSelf: 'center',
      maxWidth: Platform.OS === 'web' ? Math.min(viewportWidth, 760) : undefined,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.25,
          shadowRadius: 16,
        },
        android: {
          elevation: 16,
        },
      }),
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: theme.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 16,
    },
    messagePreview: {
      marginHorizontal: 16,
      marginBottom: 16,
      padding: 12,
      backgroundColor: theme.elevated,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: theme.primary,
    },
    previewText: {
      color: theme.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    reactionsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    reactionButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.elevated,
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
      backgroundColor: theme.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fullEmojiPickerContainer: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
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
      backgroundColor: theme.elevated,
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
      borderBottomColor: theme.border,
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

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Backdrop */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View 
            style={[
              styles.backdrop,
              { opacity: backdropAnim },
            ]} 
          />
        </TouchableWithoutFeedback>
        
        {/* Bottom Sheet */}
        <Animated.View 
          style={[
            styles.sheet,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Handle */}
          <View style={styles.handle} />
          
          {/* Message Preview */}
          <View style={styles.messagePreview}>
            <Text style={styles.previewText} numberOfLines={2}>
              {safeMessageContent.startsWith('__media__') ? '📎 Media' : safeMessageContent}
            </Text>
          </View>
          
          {/* Full Emoji Picker (shown when + is pressed) */}
          {showFullEmojiPicker && EmojiPickerComponent && (
            <View style={styles.fullEmojiPickerContainer}>
              <View style={styles.emojiPickerHeader}>
                <Text style={[styles.emojiPickerTitle, { color: theme.text }]}>Choose Reaction</Text>
                <TouchableOpacity onPress={() => setShowFullEmojiPicker(false)}>
                  <Ionicons name="close" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              <EmojiPickerComponent
                visible={true}
                onClose={() => setShowFullEmojiPicker(false)}
                onEmojiSelect={handleReaction}
                height={220}
              />
            </View>
          )}
          
          {/* Quick Reactions (hidden when full picker is shown) */}
          {!showFullEmojiPicker && (
            <View style={styles.reactionsContainer}>
              {REACTION_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactionButton}
                  onPress={() => handleReaction(emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.moreReactionsButton}
                onPress={handleOpenEmojiPicker}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          
          {/* Translation language picker */}
          {showTranslateOptions && onTranslate && (
            <View style={styles.translateContainer}>
              <View style={styles.translateHeader}>
                <Text style={[styles.translateTitle, { color: theme.text }]}>Translate to</Text>
                <TouchableOpacity onPress={() => setShowTranslateOptions(false)}>
                  <Ionicons name="close" size={22} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              {([
                { code: 'en' as const, label: 'English', flag: '🇬🇧' },
                { code: 'af' as const, label: 'Afrikaans', flag: '🇿🇦' },
                { code: 'zu' as const, label: 'isiZulu', flag: '🇿🇦' },
              ]).map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={styles.translateOption}
                  onPress={() => {
                    onTranslate(lang.code);
                    onClose();
                  }}
                  disabled={isTranslating}
                  activeOpacity={0.7}
                >
                  <Text style={styles.translateFlag}>{lang.flag}</Text>
                  <Text style={[styles.translateLabel, { color: theme.text }]}>{lang.label}</Text>
                  {isTranslating && (
                    <Text style={[styles.translateLoading, { color: theme.textSecondary }]}>...</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Action Buttons (hidden when emoji picker or translate picker is shown) */}
          {!showFullEmojiPicker && !showTranslateOptions && (
            <View style={styles.actionsGrid}>
              {actions.map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={[styles.actionButton, { width: actionButtonWidth }]}
                  onPress={() => {
                    switch (action.id) {
                      case 'reply':
                        handleAction(onReply);
                        break;
                      case 'forward':
                        handleAction(onForward);
                        break;
                      case 'copy':
                        handleCopy();
                        break;
                      case 'edit':
                        if (onEdit) handleAction(onEdit);
                        break;
                      case 'translate':
                        setShowTranslateOptions(true);
                        break;
                      case 'add_to_weekly_program':
                        if (onAddToWeeklyProgram) handleAction(onAddToWeeklyProgram);
                        break;
                      case 'convert_to_routine_request':
                        if (onConvertToRoutineRequest) handleAction(onConvertToRoutineRequest);
                        break;
                      case 'delete':
                        handleAction(onDelete);
                        break;
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.actionIconContainer,
                    action.destructive && { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
                  ]}>
                    <Ionicons 
                      name={action.icon} 
                      size={24} 
                      color={action.color || theme.text} 
                    />
                  </View>
                  <Text style={[
                    styles.actionLabel,
                    action.destructive && styles.destructiveLabel,
                  ]}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

export default MessageActionsMenu;
