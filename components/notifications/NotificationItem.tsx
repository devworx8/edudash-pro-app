/**
 * NotificationItem Component
 * 
 * Renders a single notification item with icon, title, body, read status,
 * and quick action buttons (Reply, Mark as Read, Mute) for relevant types.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { Notification, NotificationType } from './types';

interface NotificationItemProps {
  notification: Notification;
  onPress: () => void;
  onMarkRead: () => void;
  onReply?: (notification: Notification) => void;
  onMute?: (notification: Notification) => void;
  /** When true the item renders in multi-select mode */
  selected?: boolean;
  /** Called when the user long-presses to enter selection mode */
  onLongPressSelect?: (notification: Notification) => void;
  /** Called when the item is swiped away */
  onDismiss?: (notification: Notification) => void;
}

/**
 * Format relative time from date string
 */
const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/**
 * Get icon config based on notification type
 */
const getIconConfig = (type: NotificationType, theme: ReturnType<typeof useTheme>['theme']) => {
  switch (type) {
    case 'message':
      return { icon: 'chatbubble', color: theme.primary, bgColor: theme.primary + '20' };
    case 'call':
      return { icon: 'call', color: theme.error, bgColor: theme.error + '20' };
    case 'announcement':
      return { icon: 'megaphone', color: theme.warning, bgColor: theme.warning + '20' };
    case 'homework':
      return { icon: 'book', color: theme.info, bgColor: theme.info + '20' };
    case 'grade':
      return { icon: 'school', color: theme.success, bgColor: theme.success + '20' };
    case 'attendance':
      return { icon: 'calendar-outline', color: '#9C27B0', bgColor: '#9C27B020' };
    case 'registration':
      return { icon: 'person-add', color: '#00BCD4', bgColor: '#00BCD420' };
    case 'billing':
      return { icon: 'card', color: '#4CAF50', bgColor: '#4CAF5020' };
    case 'calendar':
      return { icon: 'calendar', color: '#FF5722', bgColor: '#FF572220' };
    case 'birthday':
      return { icon: 'gift', color: '#E91E63', bgColor: '#E91E6320' };
    default:
      return { icon: 'notifications', color: theme.textSecondary, bgColor: theme.border };
  }
};

/**
 * Determine which quick actions are relevant for this notification type
 */
const getQuickActions = (type: NotificationType): Array<'reply' | 'markRead' | 'mute'> => {
  switch (type) {
    case 'message':
      return ['reply', 'markRead', 'mute'];
    case 'call':
      return ['reply', 'markRead'];
    case 'announcement':
      return ['markRead', 'mute'];
    case 'homework':
    case 'grade':
    case 'attendance':
      return ['markRead'];
    default:
      return ['markRead'];
  }
};

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onPress,
  onMarkRead,
  onReply,
  onMute,
  selected,
  onLongPressSelect,
  onDismiss,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const iconConfig = getIconConfig(notification.type, theme);
  const isSelected = selected === true;
  
  const isUnread = !notification.read;
  const containerBg = isSelected
    ? theme.primary + '25'
    : isUnread ? theme.primary + '12' : theme.surface;
  const quickActions = getQuickActions(notification.type);

  const handleLongPress = useCallback(() => {
    if (onLongPressSelect) {
      onLongPressSelect(notification);
    } else if (isUnread) {
      setExpanded(prev => !prev);
    }
  }, [isUnread, onLongPressSelect, notification]);

  const handleReply = useCallback(() => {
    setExpanded(false);
    onReply?.(notification);
  }, [onReply, notification]);

  const handleMarkRead = useCallback(() => {
    setExpanded(false);
    onMarkRead();
  }, [onMarkRead]);

  const handleMute = useCallback(() => {
    setExpanded(false);
    onMute?.(notification);
  }, [onMute, notification]);

  const swipeEnabled = Platform.OS !== 'web' && !!onDismiss;

  const rowContent = (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: containerBg,
          borderLeftWidth: isSelected ? 3 : isUnread ? 3 : 0,
          borderLeftColor: isSelected ? theme.primary : isUnread ? theme.primary : 'transparent',
          opacity: isUnread ? 1 : 0.75,
        }
      ]}
      onPress={onPress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      {/* Multi-select checkbox */}
      {selected !== undefined && onLongPressSelect && (
        <View style={[styles.checkbox, { borderColor: isSelected ? theme.primary : theme.border }]}>
          {isSelected && <Ionicons name="checkmark" size={12} color={theme.primary} />}
        </View>
      )}
      {/* Unread indicator */}
      {isUnread && (
        <View style={[styles.unreadIndicator, { backgroundColor: theme.primary }]} />
      )}

      <View style={[
        styles.iconContainer,
        {
          backgroundColor: iconConfig.bgColor,
          opacity: isUnread ? 1 : 0.7,
        }
      ]}>
        <Ionicons
          name={iconConfig.icon as keyof typeof Ionicons.glyphMap}
          size={22}
          color={iconConfig.color}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text
            style={[
              styles.title,
              {
                color: theme.text,
                fontWeight: isUnread ? '700' : '400',
                opacity: isUnread ? 1 : 0.8,
              }
            ]}
            numberOfLines={1}
          >
            {notification.title}
          </Text>
          <Text style={[
            styles.time,
            {
              color: isUnread ? theme.primary : theme.textSecondary,
              fontWeight: isUnread ? '600' : '400',
            }
          ]}>
            {formatTime(notification.created_at)}
          </Text>
        </View>
        <Text
          style={[
            styles.body,
            {
              color: isUnread ? theme.text : theme.textSecondary,
              fontWeight: isUnread ? '500' : '400',
            }
          ]}
          numberOfLines={2}
        >
          {notification.body}
        </Text>

        {/* Quick action buttons — visible on long-press for unread notifications */}
        {expanded && isUnread && (
          <View style={styles.actionsRow}>
            {quickActions.includes('reply') && onReply && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.primary + '18' }]}
                onPress={handleReply}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-undo-outline" size={14} color={theme.primary} />
                <Text style={[styles.actionLabel, { color: theme.primary }]}>
                  {t('notifications.actions.reply', 'Reply')}
                </Text>
              </TouchableOpacity>
            )}

            {quickActions.includes('markRead') && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.success + '18' }]}
                onPress={handleMarkRead}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-done-outline" size={14} color={theme.success || '#22C55E'} />
                <Text style={[styles.actionLabel, { color: theme.success || '#22C55E' }]}> 
                  {t('notifications.actions.mark_read', 'Mark Read')}
                </Text>
              </TouchableOpacity>
            )}

            {quickActions.includes('mute') && onMute && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.warning + '18' }]}
                onPress={handleMute}
                activeOpacity={0.7}
              >
                <Ionicons name="notifications-off-outline" size={14} color={theme.warning || '#F59E0B'} />
                <Text style={[styles.actionLabel, { color: theme.warning || '#F59E0B' }]}> 
                  {t('notifications.actions.mute', 'Mute')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Unread dot (hidden when in select mode to not clash with checkbox) */}
      {isUnread && !onLongPressSelect && (
        <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
      )}
    </TouchableOpacity>
  );
  
  const renderRightActions = useCallback(() => (
    <TouchableOpacity
      style={[styles.swipeDeleteAction, { backgroundColor: theme.error || '#EF4444' }]}
      onPress={() => onDismiss?.(notification)}
      activeOpacity={0.8}
    >
      <Ionicons name="trash-outline" size={22} color="#fff" />
      <Text style={styles.swipeDeleteText}>
        {t('common.delete', { defaultValue: 'Delete' })}
      </Text>
    </TouchableOpacity>
  ), [onDismiss, notification, theme.error, t]);

  if (!swipeEnabled) {
    return rowContent;
  }

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      rightThreshold={60}
      overshootRight={false}
      onSwipeableOpen={(direction) => {
        if (direction === 'right') onDismiss?.(notification);
      }}
    >
      {rowContent}
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  unreadIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  unreadDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: 8,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  swipeDeleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 12,
    marginBottom: 10,
    gap: 4,
  },
  swipeDeleteText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
});

export default NotificationItem;
