/**
 * SOA Chat Screen
 * Individual conversation view for EduPro messaging
 * Reuses existing messaging components (MessageBubble, MessageComposer)
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';
import { MessageBubble } from '@/components/messaging/MessageBubble';
import { MessageComposer } from '@/components/messaging/MessageComposer';
import { DateSeparator } from '@/components/messaging/DateSeparator';
import { TypingIndicator } from '@/components/messaging/TypingIndicator';
import { 
  useSOAMessages, 
  useSOASendMessage, 
  useSOAThread,
  useSOAReactions,
} from '@/hooks/useSOAMessaging';
import { 
  WING_CONFIG, 
  THREAD_TYPE_CONFIG,
  SOAMessage,
} from '@/components/soa-messaging/types';
import type { Message } from '@/components/messaging/types';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { logger } from '@/lib/logger';
export default function SOAChatScreen() {
  const { theme } = useTheme();
  const { profile, user } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, insets), [theme, insets]);

  const { thread_id, subject, wing, thread_type } = useLocalSearchParams<{
    thread_id?: string;
    subject?: string;
    wing?: string;
    thread_type?: string;
  }>();

  const threadId = thread_id || null;
  const flatListRef = useRef<FlatList>(null);
  const [replyingTo, setReplyingTo] = useState<SOAMessage | null>(null);

  // Fetch thread details
  const { thread, isLoading: threadLoading } = useSOAThread(threadId);

  // Fetch messages
  const { 
    messages, 
    isLoading: messagesLoading, 
    error,
    refetch,
  } = useSOAMessages({
    threadId,
    enabled: !!threadId,
  });

  // Send message hook
  const { sendMessage, sendVoiceMessage, sending } = useSOASendMessage(threadId);

  // Reactions hook
  const { addReaction, removeReaction } = useSOAReactions(threadId);

  // Get thread title
  const getThreadTitle = (): string => {
    if (subject) return subject;
    if (thread?.subject) return thread.subject;
    
    if (thread?.wing) {
      return WING_CONFIG[thread.wing].label;
    }
    
    if (thread?.thread_type) {
      return THREAD_TYPE_CONFIG[thread.thread_type].label;
    }
    
    return 'Chat';
  };

  // Get thread color for theming
  const getThreadColor = (): string => {
    const w = wing || thread?.wing;
    if (w && WING_CONFIG[w as keyof typeof WING_CONFIG]) {
      return WING_CONFIG[w as keyof typeof WING_CONFIG].color;
    }
    return theme.primary;
  };

  // Convert SOA messages to generic Message format for MessageBubble
  const convertToGenericMessage = (msg: SOAMessage): Message => ({
    id: msg.id,
    content: msg.content,
    sender_id: msg.sender_id,
    created_at: msg.created_at,
    sender: msg.sender ? {
      first_name: msg.sender.first_name,
      last_name: msg.sender.last_name,
      role: msg.sender.member_type,
    } : undefined,
    voice_url: msg.content_type === 'voice' ? msg.attachment_url || undefined : undefined,
    voice_duration: msg.voice_duration || undefined,
    reactions: msg.reactions?.map(r => ({
      emoji: r.emoji,
      count: 1,
      hasReacted: r.user_id === user?.id,
    })),
    read_by: msg.is_read ? [msg.sender_id] : [],
    delivered_at: msg.created_at,
  });

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: SOAMessage[] }[] = [];
    let currentDate = '';
    
    messages.forEach((msg) => {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });
    
    return groups;
  }, [messages]);

  // Flatten grouped messages for FlatList
  const flattenedItems = useMemo(() => {
    const items: { type: 'date' | 'message'; data: string | SOAMessage }[] = [];
    
    groupedMessages.forEach((group) => {
      items.push({ type: 'date', data: group.date });
      group.messages.forEach((msg) => {
        items.push({ type: 'message', data: msg });
      });
    });
    
    return items;
  }, [groupedMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = async (content: string) => {
    await sendMessage(content);
    setReplyingTo(null);
  };

  const handleVoiceRecording = async (uri: string, duration: number) => {
    // TODO: Upload to Supabase Storage first, then send
    // For now, we'll just send a placeholder
    logger.debug('Voice recording:', uri, duration);
    await sendVoiceMessage(uri, duration);
  };

  const handleLongPress = (msg: SOAMessage) => {
    // Show message actions (reply, react, copy, delete)
    setReplyingTo(msg);
  };

  const handleReactionPress = async (messageId: string, emoji: string) => {
    try {
      // Check if already reacted
      const message = messages.find(m => m.id === messageId);
      const hasReacted = message?.reactions?.some(
        r => r.user_id === user?.id && r.emoji === emoji
      );
      
      if (hasReacted) {
        await removeReaction(messageId, emoji);
      } else {
        await addReaction(messageId, emoji);
      }
    } catch (err) {
      logger.error('Error handling reaction:', err);
    }
  };

  const renderItem = ({ item }: { item: { type: 'date' | 'message'; data: string | SOAMessage } }) => {
    if (item.type === 'date') {
      return <DateSeparator label={item.data as string} />;
    }

    const msg = item.data as SOAMessage;
    const isOwn = msg.sender_id === user?.id;

    return (
      <MessageBubble
        msg={convertToGenericMessage(msg)}
        isOwn={isOwn}
        onLongPress={() => handleLongPress(msg)}
        onReactionPress={handleReactionPress}
      />
    );
  };

  const threadColor = getThreadColor();
  const isLoading = threadLoading || messagesLoading;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: getThreadTitle(),
          headerBackTitle: 'Back',
          headerRight: () => (
            <View style={styles.headerRight}>
              <TouchableOpacity
                onPress={() => {
                  // TODO: Show thread info/participants modal
                }}
                style={styles.headerButton}
              >
                <Ionicons name="information-circle-outline" size={24} color={theme.primary} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {/* Thread Type Banner */}
      {thread_type === 'broadcast' && (
        <View style={[styles.broadcastBanner, { backgroundColor: `${threadColor}20` }]}>
          <Ionicons name="megaphone" size={16} color={threadColor} />
          <Text style={[styles.broadcastText, { color: threadColor }]}>
            Announcement Channel - Leadership Only
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <EduDashSpinner size="large" color={theme.primary} />
            <Text style={styles.loadingText}>Loading messages...</Text>
          </View>
        ) : error ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Unable to Load Messages"
            description="Please check your connection and try again."
            actionLabel="Retry"
            onActionPress={refetch}
          />
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: `${threadColor}20` }]}>
              <Ionicons 
                name={wing ? (WING_CONFIG[wing as keyof typeof WING_CONFIG]?.icon as any) : 'chatbubbles'} 
                size={48} 
                color={threadColor} 
              />
            </View>
            <Text style={styles.emptyTitle}>Start the Conversation</Text>
            <Text style={styles.emptyDescription}>
              Be the first to send a message in this chat.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={flattenedItems}
            renderItem={renderItem}
            keyExtractor={(item, index) => 
              item.type === 'date' 
                ? `date-${item.data}` 
                : `msg-${(item.data as SOAMessage).id}`
            }
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: false });
            }}
          />
        )}

        {/* Typing Indicator */}
        {/* <TypingIndicator users={typingUsers} /> */}

        {/* Message Composer */}
        <View style={styles.composerContainer}>
          <MessageComposer
            onSend={handleSend}
            onVoiceRecording={handleVoiceRecording}
            sending={sending}
            replyingTo={replyingTo ? convertToGenericMessage(replyingTo) : null}
            onCancelReply={() => setReplyingTo(null)}
            placeholder={
              thread_type === 'broadcast' 
                ? 'Write an announcement...' 
                : 'Type a message...'
            }
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: any, insets: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerButton: {
      padding: 8,
    },
    broadcastBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
      gap: 8,
    },
    broadcastText: {
      fontSize: 12,
      fontWeight: '600',
    },
    keyboardAvoid: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      color: theme.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    emptyIcon: {
      width: 96,
      height: 96,
      borderRadius: 48,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyDescription: {
      fontSize: 14,
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    messageList: {
      paddingHorizontal: 12,
      paddingVertical: 16,
      flexGrow: 1,
    },
    composerContainer: {
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.background,
    },
  });
