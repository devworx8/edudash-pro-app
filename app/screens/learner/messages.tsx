import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { assertSupabase } from '@/lib/supabase';
import { getMessageDisplayText } from '@/lib/utils/messageContent';
import { useQuery } from '@tanstack/react-query';
import { useCallSafe } from '@/components/calls/CallProvider';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
export default function LearnerMessagesScreen() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const callContext = useCallSafe();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const { data: threads, isLoading } = useQuery({
    queryKey: ['learner-message-threads', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      // Fetch message threads where user is a participant
      const { data: participants, error: participantsError } = await assertSupabase()
        .from('message_participants')
        .select('thread_id')
        .eq('user_id', profile.id);
      
      if (participantsError) throw participantsError;
      if (!participants || participants.length === 0) return [];
      
      const threadIds = participants.map(p => p.thread_id);
      
      // Fetch threads with last message
      const { data: threadsData, error: threadsError } = await assertSupabase()
        .from('message_threads')
        .select(`
          *,
          participants:message_participants!inner(
            user_id,
            profile:profiles(id, first_name, last_name, avatar_url, role)
          )
        `)
        .in('id', threadIds)
        .order('last_message_at', { ascending: false })
        .limit(50);
      
      if (threadsError) throw threadsError;
      
      // Get last message for each thread
      const threadsWithMessages = await Promise.all(
        (threadsData || []).map(async (thread) => {
          const { data: lastMessage } = await assertSupabase()
            .from('messages')
            .select('id, content, created_at, sender_id')
            .eq('thread_id', thread.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          return {
            ...thread,
            last_message: lastMessage,
          };
        })
      );
      
      return threadsWithMessages;
    },
    enabled: !!profile?.id,
  });

  const handleStartChat = (userId: string, userName: string, threadId?: string) => {
    const threadQuery = threadId ? `&thread_id=${threadId}` : '';
    router.push(`/screens/learner/chat?user_id=${userId}&name=${encodeURIComponent(userName)}${threadQuery}`);
  };

  const handleVideoCall = (userId: string, userName: string, threadId?: string) => {
    if (callContext) {
      callContext.startVideoCall(userId, userName, threadId ? { threadId } : undefined);
    }
  };

  const handleVoiceCall = (userId: string, userName: string, threadId?: string) => {
    if (callContext) {
      callContext.startVoiceCall(userId, userName, threadId ? { threadId } : undefined);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen 
        options={{ 
          title: t('learner.messages', { defaultValue: 'Messages' }),
          headerBackTitle: t('common.back', { defaultValue: 'Back' }),
        }} 
      />
      <ScrollView 
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && (
          <View style={styles.empty}>
            <EduDashSpinner size="large" color={theme.primary} />
          </View>
        )}

        {!isLoading && (!threads || threads.length === 0) && (
          <EmptyState
            icon="chatbubbles-outline"
            title={t('learner.no_conversations', { defaultValue: 'No Conversations Yet' })}
            description={t('learner.messages_prompt', { defaultValue: 'Start a conversation with your facilitator or peers' })}
          />
        )}

        {threads && threads.map((thread: any) => {
          const otherParticipant = thread.participants?.find((p: any) => p.user_id !== profile?.id);
          if (!otherParticipant) return null;
          
          // Fetch profile for other participant
          const otherProfile = otherParticipant.profile;
          if (!otherProfile) return null;

          const participantName = `${otherProfile.first_name || ''} ${otherProfile.last_name || ''}`.trim() || 'Unknown';
          
          return (
            <Card key={thread.id} padding={16} margin={0} elevation="small" style={styles.conversationCard}>
              <TouchableOpacity
                onPress={() => handleStartChat(otherProfile.id, participantName, thread.id)}
                style={styles.conversationRow}
              >
                <View style={styles.avatarContainer}>
                  {otherProfile.avatar_url ? (
                    <Ionicons name="person-circle" size={48} color={theme.primary} />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                      <Text style={styles.avatarText}>
                        {participantName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.conversationInfo}>
                  <View style={styles.conversationHeader}>
                    <Text style={styles.conversationName}>{participantName}</Text>
                    {thread.last_message && (
                      <Text style={styles.conversationTime}>
                        {new Date(thread.last_message.created_at).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                  {thread.last_message && (
                    <Text style={styles.lastMessage} numberOfLines={1}>
                      {getMessageDisplayText(thread.last_message.content)}
                    </Text>
                  )}
                  <View style={styles.conversationActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: theme.primary + '20' }]}
                      onPress={() => router.push(`/screens/learner/chat?thread_id=${thread.id}&user_id=${otherProfile.id}&name=${encodeURIComponent(participantName)}`)}
                    >
                      <Ionicons name="chatbubble" size={18} color={theme.primary} />
                      <Text style={[styles.actionButtonText, { color: theme.primary }]}>
                        {t('learner.chat', { defaultValue: 'Chat' })}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: theme.primary + '20' }]}
                      onPress={() => handleVoiceCall(otherProfile.id, participantName, thread.id)}
                    >
                      <Ionicons name="call" size={18} color={theme.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: theme.primary + '20' }]}
                      onPress={() => handleVideoCall(otherProfile.id, participantName, thread.id)}
                    >
                      <Ionicons name="videocam" size={18} color={theme.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme?.background || '#0b1220' },
  content: { padding: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  conversationCard: { marginBottom: 12 },
  conversationRow: { flexDirection: 'row', alignItems: 'flex-start' },
  avatarContainer: { marginRight: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  conversationInfo: { flex: 1 },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationName: { color: theme?.text || '#fff', fontSize: 16, fontWeight: '600' },
  conversationTime: { color: theme?.textSecondary || '#9CA3AF', fontSize: 12 },
  lastMessage: { color: theme?.textSecondary || '#9CA3AF', fontSize: 14, marginBottom: 8 },
  conversationActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  actionButtonText: { fontSize: 12, fontWeight: '600' },
});
