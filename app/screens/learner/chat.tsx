import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { assertSupabase } from '@/lib/supabase';
import { getMessageDisplayText } from '@/lib/utils/messageContent';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallSafe } from '@/components/calls/CallProvider';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function LearnerChatScreen() {
  const { profile, user } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const callContext = useCallSafe();
  const styles = React.useMemo(() => createStyles(theme, insets), [theme, insets]);
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);

  const { user_id, thread_id, name } = useLocalSearchParams<{ user_id?: string; thread_id?: string; name?: string }>();
  const otherUserId = user_id || '';
  const threadId = thread_id || null;
  const otherUserName = name || 'User';

  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);

  // Check if other user is online
  const isOnline = otherUserId && callContext ? callContext.isUserOnline(otherUserId) : false;
  const lastSeenText = otherUserId && callContext ? callContext.getLastSeenText(otherUserId) : 'Offline';

  // Get or create message thread
  const { data: thread, isLoading: threadLoading } = useQuery({
    queryKey: ['learner-thread', profile?.id, threadId, otherUserId],
    queryFn: async () => {
      if (!profile?.id) return null;
      
      // If thread_id provided, fetch it
      if (threadId) {
        const { data, error } = await assertSupabase()
          .from('message_threads')
          .select('*')
          .eq('id', threadId)
          .single();
        if (error) throw error;
        return data;
      }
      
      // If user_id provided, find or create thread
      if (!otherUserId) return null;
      
      // Try to find existing thread
      const { data: participants } = await assertSupabase()
        .from('message_participants')
        .select('thread_id')
        .eq('user_id', profile.id);
      
      if (participants && participants.length > 0) {
        const threadIds = participants.map(p => p.thread_id);
        const { data: existingThread } = await assertSupabase()
          .from('message_threads')
          .select('*')
          .in('id', threadIds)
          .maybeSingle();
        
        if (existingThread) {
          // Check if other user is also a participant
          const { data: otherParticipant } = await assertSupabase()
            .from('message_participants')
            .select('user_id')
            .eq('thread_id', existingThread.id)
            .eq('user_id', otherUserId)
            .maybeSingle();
          
          if (otherParticipant) return existingThread;
        }
      }

      // Create new thread (requires organization_id for message_threads)
      const orgId = (profile as any)?.organization_id || (profile as any)?.preschool_id;
      if (!orgId) {
        throw new Error('Cannot create thread without organization');
      }

      const threadPayload = {
        preschool_id: orgId, // Using preschool_id for compatibility
        type: 'general',
        subject: `Chat with ${otherUserName}`,
        created_by: profile.id,
      };

      let newThread: { id: string } | null = null;
      const { data: createdThread, error } = await assertSupabase()
        .from('message_threads')
        .insert(threadPayload)
        .select()
        .single();

      if (error) {
        const errorMessage = error.message?.toLowerCase() || '';
        if (errorMessage.includes('created_by')) {
          const { data: fallbackThread, error: fallbackError } = await assertSupabase()
            .from('message_threads')
            .insert({
              preschool_id: orgId,
              type: 'general',
              subject: `Chat with ${otherUserName}`,
            })
            .select()
            .single();

          if (fallbackError) throw fallbackError;
          newThread = fallbackThread;
        } else {
          throw error;
        }
      } else {
        newThread = createdThread;
      }

      if (!newThread?.id) {
        throw new Error('Unable to create conversation.');
      }

      // Add participants
      await assertSupabase()
        .from('message_participants')
        .insert([
          { thread_id: newThread.id, user_id: profile.id, role: 'student' },
          { thread_id: newThread.id, user_id: otherUserId, role: 'student' },
        ]);

      return newThread;
    },
    enabled: !!profile?.id && (!!threadId || !!otherUserId),
  });

  // Fetch messages
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['learner-messages', thread?.id],
    queryFn: async () => {
      if (!thread?.id) return [];
      const { data, error } = await assertSupabase()
        .from('messages')
        .select('*, sender:profiles(id, first_name, last_name, avatar_url)')
        .eq('thread_id', thread.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!thread?.id,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!thread?.id || !profile?.id) throw new Error('Missing thread or user');
      const { data, error } = await assertSupabase()
        .from('messages')
        .insert({
          thread_id: thread.id,
          sender_id: profile.id,
          content,
          content_type: 'text',
        })
        .select()
        .single();
      if (error) throw error;
      
      // Update thread's last_message_at
      await assertSupabase()
        .from('message_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', thread.id);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learner-messages', thread?.id] });
      queryClient.invalidateQueries({ queryKey: ['learner-message-threads', profile?.id] });
      setMessageText('');
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    },
  });

  const handleSend = async () => {
    if (!messageText.trim() || sending) return;
    setSending(true);
    try {
      await sendMessageMutation.mutateAsync(messageText.trim());
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleVoiceCall = () => {
    if (callContext && otherUserId) {
      callContext.startVoiceCall(otherUserId, otherUserName, thread?.id ? { threadId: thread.id } : undefined);
    }
  };

  const handleVideoCall = () => {
    if (callContext && otherUserId) {
      callContext.startVideoCall(otherUserId, otherUserName, thread?.id ? { threadId: thread.id } : undefined);
    }
  };

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          title: otherUserName,
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 12, marginRight: 16 }}>
              <TouchableOpacity onPress={handleVoiceCall}>
                <Ionicons name="call" size={24} color={theme.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleVideoCall}>
                <Ionicons name="videocam" size={24} color={theme.primary} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Online Status */}
        {otherUserId && (
          <View style={styles.statusBar}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? '#10B981' : '#9CA3AF' }]} />
            <Text style={styles.statusText}>
              {isOnline ? t('learner.online', { defaultValue: 'Online' }) : lastSeenText}
            </Text>
          </View>
        )}

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {threadLoading || messagesLoading ? (
            <View style={styles.loadingContainer}>
              <EduDashSpinner size="large" color={theme.primary} />
            </View>
          ) : (
            messages.map((message: any) => {
              const isMe = message.sender_id === profile?.id;
              return (
                <View
                  key={message.id}
                  style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isMe
                        ? { backgroundColor: theme.primary, alignSelf: 'flex-end' }
                        : { backgroundColor: theme.surface, alignSelf: 'flex-start' },
                    ]}
                  >
                    <Text style={[styles.messageText, { color: isMe ? '#fff' : theme.text }]}>
                      {getMessageDisplayText(message.content)}
                    </Text>
                    <Text style={[styles.messageTime, { color: isMe ? 'rgba(255,255,255,0.7)' : theme.textSecondary }]}>
                      {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Input */}
        <View style={[styles.inputContainer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
            value={messageText}
            onChangeText={setMessageText}
            placeholder={t('learner.type_message', { defaultValue: 'Type a message...' })}
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={1000}
            onSubmitEditing={handleSend}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: messageText.trim() ? theme.primary : theme.border }]}
            onPress={handleSend}
            disabled={!messageText.trim() || sending}
          >
            {sending ? (
              <EduDashSpinner size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: any, insets: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme?.background || '#0b1220' },
  keyboardView: { flex: 1 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme?.surface || '#1f2937',
    borderBottomWidth: 1,
    borderBottomColor: theme?.border || '#374151',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: theme?.textSecondary || '#9CA3AF',
    fontSize: 12,
  },
  messagesContainer: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 8 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  messageRow: {
    marginBottom: 12,
    maxWidth: '75%',
  },
  messageRowMe: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageRowOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    maxWidth: '100%',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 4,
  },
  messageTime: {
    fontSize: 11,
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Math.max(insets.bottom, 12),
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
