/**
 * ThreadOptionsMenu Component
 * Dropdown menu from top with thread/chat options
 * - View contact
 * - Search in conversation
 * - Mute notifications
 * - Change wallpaper
 * - Clear chat
 * - Block user
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Animated,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { createThreadOptionsStyles } from './thread-options/styles';

interface ThreadOptionsMenuProps {
  visible: boolean;
  onClose: () => void;
  onChangeWallpaper: () => void;
  onMuteNotifications?: () => void;
  onSearchInChat?: () => void;
  onClearChat?: () => void;
  onBlockUser?: () => void;
  onViewContact?: () => void;
  onExportChat?: () => void;
  onMediaLinksAndDocs?: () => void;
  onStarredMessages?: () => void;
  onDisappearingMessages?: () => void;
  onAddShortcut?: () => void;
  onReport?: () => void;
  isMuted?: boolean;
  isBlocked?: boolean;
  disappearingLabel?: string;
  contactName?: string;
  isGroup?: boolean;
  participantCount?: number;
  onGroupInfo?: () => void;
  onTogglePin?: () => void;
  isPinned?: boolean;
  onSetNotificationMode?: (mode: 'all' | 'mentions' | 'muted') => void;
  notificationMode?: 'all' | 'mentions' | 'muted';
  onToggleAutoTranslate?: () => void;
  isAutoTranslateEnabled?: boolean;
}

interface OptionItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  theme: any;
}

const OptionItem: React.FC<OptionItemProps> = ({ 
  icon, 
  label, 
  onPress, 
  destructive = false,
  disabled = false,
  theme,
}) => {
  const styles = StyleSheet.create({
    optionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginHorizontal: 14,
      marginBottom: 8,
      borderRadius: 18,
      backgroundColor: 'rgba(16, 26, 52, 0.92)',
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.12)',
      opacity: disabled ? 0.5 : 1,
    },
    optionIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: destructive ? theme.error + '15' : theme.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    optionLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: destructive ? theme.error : theme.text,
      flex: 1,
    },
  });

  return (
    <TouchableOpacity
      style={styles.optionItem}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={styles.optionIcon}>
        <Ionicons 
          name={icon} 
          size={20} 
          color={destructive ? theme.error : theme.primary} 
        />
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={destructive ? theme.error : theme.textSecondary}
      />
    </TouchableOpacity>
  );
};

export const ThreadOptionsMenu: React.FC<ThreadOptionsMenuProps> = ({
  visible,
  onClose,
  onChangeWallpaper,
  onMuteNotifications,
  onSearchInChat,
  onClearChat,
  onBlockUser,
  onViewContact,
  onExportChat,
  onMediaLinksAndDocs,
  onStarredMessages,
  onDisappearingMessages,
  onAddShortcut,
  onReport,
  isMuted = false,
  isBlocked = false,
  disappearingLabel,
  contactName,
  isGroup = false,
  participantCount,
  onGroupInfo,
  onTogglePin,
  isPinned = false,
  onSetNotificationMode,
  notificationMode = 'all',
  onToggleAutoTranslate,
  isAutoTranslateEnabled = false,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      slideAnim.setValue(500);
    }
  }, [visible, slideAnim]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: 500,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleOptionPress = (callback: () => void) => {
    handleClose();
    // Small delay to let the menu close animation start
    setTimeout(callback, 100);
  };

  const styles = createThreadOptionsStyles(theme, insets);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <Animated.View 
              style={[
                styles.container,
                { transform: [{ translateY: slideAnim }] }
              ]}
            >
              <View style={styles.handle} />
              
              {(contactName || isGroup) && (
                <View style={styles.header}>
                  <Text style={styles.headerTitle}>{isGroup ? 'Group Options' : 'Chat Options'}</Text>
                  <Text style={styles.headerSubtitle}>
                    {isGroup && participantCount != null
                      ? `${contactName || 'Group'} • ${participantCount} participant${participantCount !== 1 ? 's' : ''}`
                      : contactName}
                  </Text>
                </View>
              )}
              
              <ScrollView 
                style={styles.scrollContainer}
                showsVerticalScrollIndicator={true}
                bounces={false}
              >
                <View style={styles.optionsContainer}>
                {isGroup && (onGroupInfo || participantCount != null) && (
                  <OptionItem
                    icon="people-outline"
                    label={participantCount != null ? `Group info (${participantCount} participants)` : 'Group info'}
                    onPress={() => handleOptionPress(onGroupInfo ?? (() => {}))}
                    theme={theme}
                  />
                )}
                {onViewContact && !isGroup && (
                  <OptionItem
                    icon="person-outline"
                    label="View Contact"
                    onPress={() => handleOptionPress(onViewContact)}
                    theme={theme}
                  />
                )}
                
                {onMediaLinksAndDocs && (
                  <OptionItem
                    icon="images-outline"
                    label="Media, Links, and Docs"
                    onPress={() => handleOptionPress(onMediaLinksAndDocs)}
                    theme={theme}
                  />
                )}
                
                {onSearchInChat && (
                  <OptionItem
                    icon="search-outline"
                    label="Search in Conversation"
                    onPress={() => handleOptionPress(onSearchInChat)}
                    theme={theme}
                  />
                )}
                
                {onMuteNotifications && (
                  <OptionItem
                    icon={isMuted ? "notifications-outline" : "notifications-off-outline"}
                    label={isMuted ? "Unmute Notifications" : "Mute Notifications"}
                    onPress={() => handleOptionPress(onMuteNotifications)}
                    theme={theme}
                  />
                )}
                
                {onToggleAutoTranslate && (
                  <OptionItem
                    icon={isAutoTranslateEnabled ? 'language' : 'language-outline'}
                    label={isAutoTranslateEnabled ? 'Auto-Translate: ON' : 'Auto-Translate Messages'}
                    onPress={() => handleOptionPress(onToggleAutoTranslate)}
                    theme={theme}
                  />
                )}

                {onDisappearingMessages && (
                  <OptionItem
                    icon="timer-outline"
                    label={disappearingLabel ? `Disappearing Messages (${disappearingLabel})` : 'Disappearing Messages'}
                    onPress={() => handleOptionPress(onDisappearingMessages)}
                    theme={theme}
                  />
                )}
                
                <OptionItem
                  icon="image-outline"
                  label="Change Wallpaper"
                  onPress={() => handleOptionPress(onChangeWallpaper)}
                  theme={theme}
                />
                
                {onStarredMessages && (
                  <OptionItem
                    icon="star-outline"
                    label="Starred Messages"
                    onPress={() => handleOptionPress(onStarredMessages)}
                    theme={theme}
                  />
                )}
                
                {onExportChat && (
                  <OptionItem
                    icon="download-outline"
                    label="Export Chat"
                    onPress={() => handleOptionPress(onExportChat)}
                    theme={theme}
                  />
                )}
                
                {onAddShortcut && (
                  <OptionItem
                    icon="add-circle-outline"
                    label="Add Shortcut"
                    onPress={() => handleOptionPress(onAddShortcut)}
                    theme={theme}
                  />
                )}

                {onTogglePin && (
                  <OptionItem
                    icon={isPinned ? 'pin' : 'pin-outline'}
                    label={isPinned ? 'Unpin Conversation' : 'Pin Conversation'}
                    onPress={() => handleOptionPress(onTogglePin)}
                    theme={theme}
                  />
                )}

                {onSetNotificationMode && (
                  <>
                    <OptionItem
                      icon={notificationMode === 'all' ? 'notifications' : 'notifications-outline'}
                      label="All Notifications"
                      onPress={() => handleOptionPress(() => onSetNotificationMode('all'))}
                      disabled={notificationMode === 'all'}
                      theme={theme}
                    />
                    <OptionItem
                      icon="at-outline"
                      label="Mentions Only"
                      onPress={() => handleOptionPress(() => onSetNotificationMode('mentions'))}
                      disabled={notificationMode === 'mentions'}
                      theme={theme}
                    />
                    <OptionItem
                      icon="notifications-off-outline"
                      label="Mute Conversation"
                      onPress={() => handleOptionPress(() => onSetNotificationMode('muted'))}
                      disabled={notificationMode === 'muted'}
                      theme={theme}
                    />
                  </>
                )}
                
                <View style={styles.divider} />
                
                {onReport && (
                  <OptionItem
                    icon="flag-outline"
                    label="Report User"
                    onPress={() => handleOptionPress(onReport)}
                    destructive
                    theme={theme}
                  />
                )}
                
                {onClearChat && (
                  <OptionItem
                    icon="trash-outline"
                    label="Clear Chat"
                    onPress={() => handleOptionPress(onClearChat)}
                    destructive
                    theme={theme}
                  />
                )}
                
                {onBlockUser && (
                  <OptionItem
                    icon={isBlocked ? 'lock-open-outline' : 'ban-outline'}
                    label={isBlocked ? 'Unblock User' : 'Block User'}
                    onPress={() => handleOptionPress(onBlockUser)}
                    destructive={!isBlocked}
                    theme={theme}
                  />
                )}
              </View>
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default ThreadOptionsMenu;
