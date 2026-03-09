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
import { getMessageDisplayText } from '@/lib/utils/messageContent';
import { createMessageActionsStyles } from './message-actions-menu/styles';

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
  onStar?: () => void;
  isStarred?: boolean;
  /** Pin/unpin callback */
  onPin?: () => void;
  /** Whether the message is currently pinned */
  isPinned?: boolean;
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
  onStar,
  isStarred = false,
  onPin,
  isPinned = false,
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
  const previewText = getMessageDisplayText(safeMessageContent);
  
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
    ...(onStar ? [{ id: 'star', label: isStarred ? 'Unstar' : 'Star', icon: (isStarred ? 'star' : 'star-outline') as keyof typeof Ionicons.glyphMap, color: '#f8ca59' }] : []),
    ...(onPin ? [{ id: 'pin', label: isPinned ? 'Unpin' : 'Pin', icon: (isPinned ? 'pin-outline' : 'pin') as keyof typeof Ionicons.glyphMap }] : []),
    { id: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true, color: '#ef4444' },
  ];
  
  const styles = createMessageActionsStyles({
    theme,
    insets,
    viewportWidth,
    screenHeight: SCREEN_HEIGHT,
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
              {previewText}
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
                      case 'star':
                        if (onStar) handleAction(onStar);
                        break;
                      case 'add_to_weekly_program':
                        if (onAddToWeeklyProgram) handleAction(onAddToWeeklyProgram);
                        break;
                      case 'convert_to_routine_request':
                        if (onConvertToRoutineRequest) handleAction(onConvertToRoutineRequest);
                        break;
                      case 'pin':
                        if (onPin) handleAction(onPin);
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
