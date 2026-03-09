/**
 * Chat Header Component
 * WhatsApp-style header with avatar, online status, and action buttons
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectionStatusBar } from './ConnectionStatusBar';

interface ChatHeaderProps {
  displayName: string;
  isOnline: boolean;
  lastSeenText: string;
  isLoading: boolean;
  isGroup?: boolean;
  participantCount?: number;
  onlineCount?: number;
  isTyping?: boolean;
  typingName?: string;
  typingText?: string | null;
  recipientRole?: string | null;
  avatarUrl?: string | null;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onOptionsPress: () => void;
  onHeaderPress?: () => void;
  borderColor?: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  displayName,
  isOnline,
  lastSeenText,
  isLoading,
  isGroup = false,
  participantCount,
  onlineCount = 0,
  isTyping,
  typingName,
  typingText,
  recipientRole,
  avatarUrl,
  onVoiceCall,
  onVideoCall,
  onOptionsPress,
  onHeaderPress,
  borderColor = 'rgba(148, 163, 184, 0.15)',
}) => {
  const insets = useSafeAreaInsets();
  const typingLabel = typingText || (typingName ? `${typingName} is typing...` : 'Typing...');
  const isAway = !isOnline && lastSeenText === 'Away';
  const statusColor = isTyping
    ? '#fbbf24'
    : isGroup
      ? '#60a5fa'
    : isOnline
      ? '#22c55e'
      : isAway
        ? '#f59e0b'
        : '#94a3b8';
  const groupSubtitle = isGroup
    ? `${onlineCount} online${typeof participantCount === 'number' ? ` • ${participantCount} member${participantCount === 1 ? '' : 's'}` : ''}`
    : null;
  const subtitle = isLoading
    ? 'Loading...'
    : isTyping
      ? typingLabel
      : groupSubtitle || (isOnline ? 'Online' : lastSeenText);

  return (
    <>
    <LinearGradient
      colors={['#081027', '#101b42', '#1f174d']}
      style={[styles.header, { borderBottomColor: borderColor, paddingTop: insets.top + 10 }]}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={21} color="#f8fafc" />
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.headerInfo}
        activeOpacity={onHeaderPress ? 0.7 : 1}
        onPress={onHeaderPress}
        disabled={!onHeaderPress}
      >
        <LinearGradient
          colors={['#6f7dff', '#7c3aed', '#1cc8ff']}
          style={styles.avatar}
        >
          {avatarUrl && !isGroup ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : isGroup ? (
            <Ionicons name="people" size={18} color="#fff" />
          ) : (
            <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          )}
        </LinearGradient>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.onlineStatus}>
            <View style={[
              styles.onlineDot,
              isGroup && styles.groupDot,
              !isGroup && (!isOnline || isTyping) && styles.offlineDot,
              !isGroup && isAway && styles.awayDot,
            ]} />
            <Text style={[styles.headerSub, { color: statusColor }]}>
              {subtitle}
            </Text>
            {recipientRole && !isTyping && !isGroup && (
              <Text style={styles.roleInline}> · {recipientRole}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.headerActions}>
        <TouchableOpacity style={styles.headerBtn} onPress={onVoiceCall}>
          <Ionicons name="call-outline" size={17} color="#d9e3ff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={onVideoCall}>
          <Ionicons name="videocam-outline" size={17} color="#d9e3ff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={onOptionsPress}>
          <Ionicons name="ellipsis-vertical" size={17} color="#d9e3ff" />
        </TouchableOpacity>
      </View>
    </LinearGradient>
    <ConnectionStatusBar />
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  backBtn: { 
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.14)',
  },
  headerInfo: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center',
    marginLeft: 5,
    minWidth: 0,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#010e24ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },
  avatarText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
  },
  headerText: {
    flex: 1,
    marginLeft: 8,
    minWidth: 0,
  },
  headerTitle: { 
    fontSize: 16, 
    fontWeight: '700',
    color: '#f8fafc',
  },
  onlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 6,
  },
  offlineDot: {
    backgroundColor: '#64748b',
  },
  awayDot: {
    backgroundColor: '#f59e0b',
  },
  groupDot: {
    backgroundColor: '#60a5fa',
  },
  headerSub: { 
    fontSize: 11,
    color: '#bfd4ff',
    flexShrink: 1,
  },
  roleInline: {
    fontSize: 11,
    color: '#d0a7ff',
    marginLeft: 3,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 5,
  },
  headerBtn: { 
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.12)',
  },
});
