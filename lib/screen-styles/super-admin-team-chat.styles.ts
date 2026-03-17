import { StyleSheet, Platform } from 'react-native';

export function createStyles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background || '#0f172a',
    },
    header: {
      backgroundColor: theme.headerBackground || '#1e293b',
      paddingBottom: 12,
    },
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 12,
    },
    backButton: {
      padding: 8,
    },
    headerTitleContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: '#ffffff',
    },
    subtitle: {
      fontSize: 13,
      color: '#94a3b8',
      marginTop: 2,
    },
    content: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 80,
    },
    loadingText: {
      color: '#94a3b8',
      marginTop: 12,
      fontSize: 14,
    },
    // Channel list
    channelItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border || '#1e293b',
      gap: 12,
    },
    channelIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    channelInfo: {
      flex: 1,
    },
    channelName: {
      fontSize: 16,
      fontWeight: '600',
      color: '#ffffff',
    },
    channelPreview: {
      fontSize: 13,
      color: '#94a3b8',
      marginTop: 2,
    },
    channelMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    channelMetaText: {
      fontSize: 11,
      color: '#64748b',
    },
    unreadBadge: {
      backgroundColor: '#3b82f6',
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
    },
    unreadText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#ffffff',
    },
    // Chat view
    chatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border || '#1e293b',
      backgroundColor: theme.headerBackground || '#1e293b',
      gap: 12,
    },
    chatHeaderInfo: {
      flex: 1,
    },
    chatHeaderName: {
      fontSize: 17,
      fontWeight: '700',
      color: '#ffffff',
    },
    chatHeaderMembers: {
      fontSize: 12,
      color: '#94a3b8',
      marginTop: 2,
    },
    messagesContainer: {
      flex: 1,
      paddingHorizontal: 16,
    },
    messageRow: {
      marginVertical: 4,
      maxWidth: '85%',
    },
    messageRowOwn: {
      alignSelf: 'flex-end',
    },
    messageRowOther: {
      alignSelf: 'flex-start',
    },
    messageSender: {
      fontSize: 11,
      fontWeight: '600',
      color: '#3b82f6',
      marginBottom: 2,
    },
    messageBubble: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    messageBubbleOwn: {
      backgroundColor: '#3b82f6',
      borderBottomRightRadius: 4,
    },
    messageBubbleOther: {
      backgroundColor: theme.card || '#1e293b',
      borderBottomLeftRadius: 4,
    },
    messageText: {
      fontSize: 15,
      lineHeight: 20,
    },
    messageTextOwn: {
      color: '#ffffff',
    },
    messageTextOther: {
      color: '#e2e8f0',
    },
    messageTime: {
      fontSize: 10,
      color: '#64748b',
      marginTop: 4,
      alignSelf: 'flex-end',
    },
    systemMessage: {
      alignSelf: 'center',
      backgroundColor: 'transparent',
      paddingVertical: 8,
    },
    systemText: {
      fontSize: 12,
      color: '#64748b',
      fontStyle: 'italic',
      textAlign: 'center',
    },
    // Input area
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: theme.border || '#1e293b',
      backgroundColor: theme.headerBackground || '#1e293b',
      gap: 8,
      ...(Platform.OS === 'ios' ? { paddingBottom: 24 } : {}),
    },
    textInput: {
      flex: 1,
      minHeight: 40,
      maxHeight: 120,
      borderRadius: 20,
      backgroundColor: theme.background || '#0f172a',
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      color: '#ffffff',
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#3b82f6',
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    // Empty state
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 60,
      paddingHorizontal: 32,
    },
    emptyText: {
      color: '#94a3b8',
      fontSize: 16,
      fontWeight: '600',
      marginTop: 16,
    },
    emptySubText: {
      color: '#64748b',
      fontSize: 14,
      textAlign: 'center',
      marginTop: 8,
    },
    // Members sidebar
    membersButton: {
      padding: 8,
    },
    deniedContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    deniedText: {
      color: '#ef4444',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
