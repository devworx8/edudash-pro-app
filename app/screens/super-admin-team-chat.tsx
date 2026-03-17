import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isPlatformStaff } from '@/lib/roleUtils';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import { useSuperAdminTeamChat } from '@/hooks/useSuperAdminTeamChat';
import { CHANNEL_TYPE_CONFIG } from '@/hooks/super-admin-team-chat/types';
import type { TeamChannel, TeamMessage } from '@/hooks/super-admin-team-chat/types';
import { createStyles } from '@/lib/screen-styles/super-admin-team-chat.styles';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function SuperAdminTeamChatScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();
  const [messageText, setMessageText] = useState('');
  const scrollRef = useRef<FlatList>(null);

  const {
    profile,
    channels,
    activeChannel,
    messages,
    members,
    loading,
    sendingMessage,
    refreshing,
    selectChannel,
    handleSendMessage,
    onRefresh,
    goBackToChannels,
  } = useSuperAdminTeamChat(showAlert);

  if (!profile || !isPlatformStaff(profile.role)) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Team Chat', headerShown: false }} />
        <ThemedStatusBar />
        <SafeAreaView style={styles.deniedContainer}>
          <Text style={styles.deniedText}>Access Denied - Super Admin Only</Text>
        </SafeAreaView>
      </View>
    );
  }

  const onSend = async () => {
    if (!messageText.trim()) return;
    const text = messageText;
    setMessageText('');
    await handleSendMessage(text);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // ── Channel List View ──
  if (!activeChannel) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Team Chat', headerShown: false }} />
        <ThemedStatusBar />

        <SafeAreaView style={styles.header}>
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Ionicons name="chatbubbles" size={28} color="#6366f1" />
              <View>
                <Text style={styles.title}>Team Chat</Text>
                <Text style={styles.subtitle}>{channels.length} channels</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>

        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
          }
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <EduDashSpinner size="large" color="#3b82f6" />
              <Text style={styles.loadingText}>Loading channels...</Text>
            </View>
          ) : channels.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color="#64748b" />
              <Text style={styles.emptyText}>No channels yet</Text>
              <Text style={styles.emptySubText}>
                Run the database migration to create default team channels.
              </Text>
            </View>
          ) : (
            channels.map((channel) => (
              <ChannelListItem
                key={channel.id}
                channel={channel}
                styles={styles}
                onPress={() => selectChannel(channel)}
              />
            ))
          )}
        </ScrollView>
        <AlertModal {...alertProps} />
      </View>
    );
  }

  // ── Chat View ──
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: activeChannel.name, headerShown: false }} />
      <ThemedStatusBar />

      {/* Chat Header */}
      <SafeAreaView style={{ backgroundColor: styles.chatHeader.backgroundColor }}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={goBackToChannels} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatHeaderName}># {activeChannel.name}</Text>
            <Text style={styles.chatHeaderMembers}>
              {members.length} member{members.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.membersButton}>
            <Ionicons name="people" size={22} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <FlatList
          ref={scrollRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 16 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <MessageBubble message={item} isOwn={item.sender_id === profile.id} styles={styles} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubble-outline" size={40} color="#64748b" />
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubText}>
                Be the first to say something in #{activeChannel.name}
              </Text>
            </View>
          }
        />

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={messageText}
            onChangeText={setMessageText}
            placeholder={`Message #${activeChannel.name}`}
            placeholderTextColor="#64748b"
            multiline
            maxLength={4000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!messageText.trim() || sendingMessage) && styles.sendButtonDisabled,
            ]}
            onPress={onSend}
            disabled={!messageText.trim() || sendingMessage}
          >
            <Ionicons name="send" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <AlertModal {...alertProps} />
    </View>
  );
}

// ── Sub-components ──

function ChannelListItem({
  channel,
  styles,
  onPress,
}: {
  channel: TeamChannel;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}) {
  const config = CHANNEL_TYPE_CONFIG[channel.channel_type] || CHANNEL_TYPE_CONFIG.custom;
  return (
    <TouchableOpacity style={styles.channelItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.channelIcon, { backgroundColor: config.color + '20' }]}>
        <Ionicons name={config.icon as any} size={22} color={config.color} />
      </View>
      <View style={styles.channelInfo}>
        <Text style={styles.channelName}># {channel.name}</Text>
        <Text style={styles.channelPreview} numberOfLines={1}>
          {channel.last_message?.content || channel.description || 'No messages yet'}
        </Text>
        <View style={styles.channelMeta}>
          <Text style={styles.channelMetaText}>
            {channel.member_count || 0} member{(channel.member_count || 0) !== 1 ? 's' : ''}
          </Text>
          {channel.last_message && (
            <Text style={styles.channelMetaText}>
              · {formatTime(channel.last_message.created_at)}
            </Text>
          )}
        </View>
      </View>
      {(channel.unread_count || 0) > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>{channel.unread_count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function MessageBubble({
  message,
  isOwn,
  styles,
}: {
  message: TeamMessage;
  isOwn: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  if (message.content_type === 'system') {
    return (
      <View style={styles.systemMessage}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.messageRow, isOwn ? styles.messageRowOwn : styles.messageRowOther]}>
      {!isOwn && <Text style={styles.messageSender}>{message.sender?.full_name || 'Unknown'}</Text>}
      <View
        style={[styles.messageBubble, isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther]}
      >
        <Text style={[styles.messageText, isOwn ? styles.messageTextOwn : styles.messageTextOther]}>
          {message.content}
        </Text>
      </View>
      <Text style={styles.messageTime}>{formatTime(message.created_at)}</Text>
    </View>
  );
}
