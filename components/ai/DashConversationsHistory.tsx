/**
 * Dash Conversations History Component
 * 
 * Displays and manages past conversations with the Dash AI Assistant,
 * allowing users to resume, delete, or export conversations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Share,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import type { DashConversation } from '@/services/dash-ai/types';
import type { IDashAIAssistant } from '@/services/dash-ai/DashAICompat';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';

interface DashConversationsHistoryProps {
  onConversationSelect?: (conversationId: string) => void;
}

export const DashConversationsHistory: React.FC<DashConversationsHistoryProps> = ({
  onConversationSelect,
}) => {
  const { theme } = useTheme();
  const { showAlert, alertProps } = useAlertModal();
  const [conversations, setConversations] = useState<DashConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashInstance, setDashInstance] = useState<IDashAIAssistant | null>(null);

  // Initialize Dash instance
  useEffect(() => {
    const initializeDash = async () => {
      try {
        const module = await import('@/services/dash-ai/DashAICompat');
        const DashClass = (module as any).DashAIAssistant || (module as any).default;
        const dash: IDashAIAssistant | null = DashClass?.getInstance?.() || null;
        if (!dash) throw new Error('DashAIAssistant unavailable');
        await dash.initialize();
        setDashInstance(dash);
        await loadConversations(dash);
      } catch (error) {
        console.error('Failed to initialize Dash:', error);
        setLoading(false);
      }
    };

    initializeDash();
  }, []);

  // Reload conversations when screen focuses
  useFocusEffect(
    useCallback(() => {
      if (dashInstance) {
        loadConversations(dashInstance);
      }
    }, [dashInstance])
  );

  const loadConversations = async (dash: IDashAIAssistant) => {
    try {
      const convs = await dash.getAllConversations();
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    if (dashInstance) {
      setRefreshing(true);
      loadConversations(dashInstance);
    }
  };

  const handleConversationPress = (conversation: DashConversation) => {
    if (onConversationSelect) {
      onConversationSelect(conversation.id);
    } else {
      router.push({
        pathname: '/screens/dash-assistant',
        params: { conversationId: conversation.id },
      });
    }
  };

  const handleConversationLongPress = (conversation: DashConversation) => {
    const options = [
      'Resume Conversation',
      'Export Conversation',
      'Delete Conversation',
      'Cancel'
    ];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: 2,
          cancelButtonIndex: 3,
        },
        (buttonIndex) => {
          switch (buttonIndex) {
            case 0:
              handleConversationPress(conversation);
              break;
            case 1:
              handleExportConversation(conversation);
              break;
            case 2:
              handleDeleteConversation(conversation);
              break;
          }
        }
      );
    } else {
      // Android alert
      showAlert({
        title: 'Conversation Options',
        message: `What would you like to do with "${conversation.title}"?`,
        type: 'info',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Resume', onPress: () => handleConversationPress(conversation) },
          { text: 'Export', onPress: () => handleExportConversation(conversation) },
          { text: 'Delete', style: 'destructive', onPress: () => handleDeleteConversation(conversation) },
        ],
      });
    }
  };

  const handleDeleteConversation = (conversation: DashConversation) => {
    showAlert({
      title: 'Delete Conversation',
      message: `Are you sure you want to delete "${conversation.title}"? This action cannot be undone.`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (dashInstance) {
                await dashInstance.deleteConversation(conversation.id);
                await loadConversations(dashInstance);
              }
            } catch (error) {
              console.error('Failed to delete conversation:', error);
              showAlert({
                title: 'Error',
                message: 'Failed to delete conversation',
                type: 'error',
              });
            }
          },
        },
      ],
    });
  };

  const handleExportConversation = async (conversation: DashConversation) => {
    try {
      if (dashInstance) {
        const exportText = await dashInstance.exportConversation(conversation.id);
        
        await Share.share({
          message: exportText,
          title: `Dash Conversation: ${conversation.title}`,
        });
      }
    } catch (error) {
      console.error('Failed to export conversation:', error);
      showAlert({
        title: 'Error',
        message: 'Failed to export conversation',
        type: 'error',
      });
    }
  };

  const startNewConversation = async () => {
    try {
      if (dashInstance) {
        const newConvId = await dashInstance.startNewConversation();
        handleConversationPress({ id: newConvId } as DashConversation);
      }
    } catch (error) {
      console.error('Failed to start new conversation:', error);
      showAlert({
        title: 'Error',
        message: 'Failed to start new conversation',
        type: 'error',
      });
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getLastMessagePreview = (conversation: DashConversation) => {
    const msgs = Array.isArray((conversation as any)?.messages) ? (conversation as any).messages : [];
    if (msgs.length === 0) return 'No messages';
    const lastMessage = msgs[msgs.length - 1];
    if (!lastMessage || !lastMessage.content) return 'No messages';
    const preview = String(lastMessage.content).substring(0, 60);
    return preview.length < String(lastMessage.content).length ? `${preview}...` : preview;
  };

  const renderConversationItem = ({ item }: ListRenderItemInfo<DashConversation>) => (
    <TouchableOpacity
      style={[styles.conversationItem, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
      onPress={() => handleConversationPress(item)}
      onLongPress={() => handleConversationLongPress(item)}
    >
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={[styles.conversationTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.conversationDate, { color: theme.textTertiary }]}>
            {formatDate(item.updated_at)}
          </Text>
        </View>
        
        <Text style={[styles.conversationPreview, { color: theme.textSecondary }]} numberOfLines={2}>
          {getLastMessagePreview(item)}
        </Text>
        
        <View style={styles.conversationFooter}>
          <View style={styles.messageCount}>
            <Ionicons name="chatbubble-outline" size={14} color={theme.textTertiary} />
            <Text style={[styles.messageCountText, { color: theme.textTertiary }]}>
              {(item as any).messages?.length ?? 0} messages
            </Text>
          </View>
          
          {item.tags && item.tags.length > 0 && (
            <View style={styles.tags}>
              {item.tags.slice(0, 2).map((tag, index) => (
                <View key={index} style={[styles.tag, { backgroundColor: theme.primaryLight }]}>
                  <Text style={[styles.tagText, { color: theme.primary }]}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
      
      <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceVariant }]}>
        <Ionicons name="chatbubbles-outline" size={48} color={theme.textSecondary} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        No conversations yet
      </Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Start chatting with Dash to see your conversations here
      </Text>
      <TouchableOpacity
        style={[styles.startButton, { backgroundColor: theme.primary }]}
        onPress={startNewConversation}
      >
        <Ionicons name="add" size={20} color={theme.onPrimary} />
        <Text style={[styles.startButtonText, { color: theme.onPrimary }]}>
          Start New Conversation
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Loading conversations...
        </Text>
        <AlertModal {...alertProps} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {conversations.length > 0 && (
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={[styles.toolbarButton, { borderColor: theme.error }]}
            onPress={() => {
              showAlert({
                title: 'Delete All Conversations',
                message: 'This will permanently delete all conversations. Continue?',
                type: 'warning',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete All',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        if (!dashInstance) return;
                        const all = await dashInstance.getAllConversations();
                        for (const c of all) { await dashInstance.deleteConversation(c.id); }
                        await loadConversations(dashInstance);
                      } catch (e) {
                        showAlert({
                          title: 'Error',
                          message: 'Failed to delete all conversations',
                          type: 'error',
                        });
                      }
                    },
                  },
                ],
              });
            }}
          >
            <Ionicons name="trash" size={16} color={theme.error} />
            <Text style={[styles.toolbarButtonText, { color: theme.error }]}>Delete All</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolbarButton, { borderColor: theme.border }]}
            onPress={() => {
              const runDelete = async (days: number) => {
                try {
                  if (!dashInstance) return;
                  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
                  const all = await dashInstance.getAllConversations();
                  for (const c of all) { if (c.updated_at < cutoff) { await dashInstance.deleteConversation(c.id); } }
                  await loadConversations(dashInstance);
                } catch (e) {
                  showAlert({
                    title: 'Error',
                    message: 'Failed to delete old conversations',
                    type: 'error',
                  });
                }
              };

              const options = ['Older than 7 days', 'Older than 30 days', 'Older than 90 days', 'Cancel'];
              if (Platform.OS === 'ios') {
                ActionSheetIOS.showActionSheetWithOptions(
                  { options, cancelButtonIndex: 3, destructiveButtonIndex: undefined },
                  (idx) => {
                    if (idx === 0) runDelete(7);
                    else if (idx === 1) runDelete(30);
                    else if (idx === 2) runDelete(90);
                  }
                );
              } else {
                showAlert({
                  title: 'Delete Old Conversations',
                  message: 'Choose a cutoff:',
                  type: 'warning',
                  buttons: [
                    { text: 'Cancel', style: 'cancel' },
                    { text: '7 days', onPress: () => runDelete(7) },
                    { text: '30 days', onPress: () => runDelete(30) },
                    { text: '90 days', onPress: () => runDelete(90) },
                  ],
                });
              }
            }}
          >
            <Ionicons name="time" size={16} color={theme.textSecondary} />
            <Text style={[styles.toolbarButtonText, { color: theme.textSecondary }]}>Delete Old…</Text>
          </TouchableOpacity>
        </View>
      )}

      {conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          {renderEmptyState()}
        </View>
      ) : (
        <FlashList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
      
      {conversations.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.primary }]}
          onPress={startNewConversation}
        >
          <Ionicons name="add" size={24} color={theme.onPrimary} />
        </TouchableOpacity>
      )}
      <AlertModal {...alertProps} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  toolbarButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  conversationContent: {
    flex: 1,
    marginRight: 12,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  conversationDate: {
    fontSize: 12,
  },
  conversationPreview: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  messageCount: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  messageCountText: {
    fontSize: 12,
    marginLeft: 4,
  },
  tags: {
    flexDirection: 'row',
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});

export default DashConversationsHistory;
