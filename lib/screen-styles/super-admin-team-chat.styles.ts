import { StyleSheet, Platform } from 'react-native';

export function createStyles(theme: any) {
  return StyleSheet.create({
    // ── Layout ───────────────────────────────────────
    root: {
      flex: 1,
      backgroundColor: '#0f172a',
    },
    splitRow: {
      flex: 1,
      flexDirection: 'row',
    },
    accessDenied: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
    },
    accessDeniedText: {
      color: '#ef4444',
      fontSize: 16,
      fontWeight: '600',
    },

    // ── No channel selected (desktop idle state) ─────
    noChannel: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
      backgroundColor: '#0f172a',
    },
    noChannelTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#334155',
      marginTop: 4,
    },
    noChannelSub: {
      fontSize: 14,
      color: '#475569',
    },

    // ── Chat Pane ────────────────────────────────────
    chatPane: {
      flex: 1,
      backgroundColor: '#0f172a',
    },
    chatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#1e293b',
      backgroundColor: '#0c1222',
    },
    chatTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: '#f1f5f9',
      letterSpacing: -0.3,
    },
    chatSub: {
      fontSize: 12,
      color: '#64748b',
      marginTop: 2,
    },
    headerIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: '#1e293b',
      justifyContent: 'center',
      alignItems: 'center',
    },

    // ── Empty chat ───────────────────────────────────
    emptyChat: {
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    emptyChatCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: '#1e293b',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    emptyChatTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#475569',
      marginBottom: 8,
    },
    emptyChatSub: {
      fontSize: 14,
      color: '#64748b',
      textAlign: 'center',
      lineHeight: 20,
    },

    // ── Messages (Slack-style) ───────────────────────
    msgRow: {
      flexDirection: 'row',
      paddingVertical: 2,
    },
    msgRowSpaced: {
      marginTop: 16,
    },
    msgAvatarCol: {
      width: 40,
      alignItems: 'center',
      paddingTop: 2,
    },
    msgAvatar: {
      width: 32,
      height: 32,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    msgAvatarText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#ffffff',
    },
    msgAvatarSpacer: {
      width: 32,
    },
    msgBody: {
      flex: 1,
      paddingLeft: 8,
    },
    msgMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 3,
    },
    msgName: {
      fontSize: 14,
      fontWeight: '700',
      color: '#e2e8f0',
    },
    msgRolePill: {
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    msgRoleLabel: {
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    msgTimestamp: {
      fontSize: 11,
      color: '#475569',
    },
    msgContent: {
      fontSize: 14,
      color: '#cbd5e1',
      lineHeight: 21,
    },

    // ── System messages ──────────────────────────────
    systemMsg: {
      alignSelf: 'center',
      paddingVertical: 8,
    },
    systemMsgText: {
      fontSize: 12,
      color: '#475569',
      fontStyle: 'italic',
    },

    // ── Date separator ───────────────────────────────
    dateSep: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 20,
      gap: 12,
    },
    dateSepLine: {
      flex: 1,
      height: 1,
      backgroundColor: '#1e293b',
    },
    dateSepLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: '#475569',
      paddingHorizontal: 8,
    },

    // ── Input bar ────────────────────────────────────
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: '#1e293b',
      backgroundColor: '#0c1222',
    },
    textInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      borderRadius: 12,
      backgroundColor: '#1e293b',
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 14,
      color: '#e2e8f0',
      borderWidth: 1,
      borderColor: '#334155',
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: '#3b82f6',
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendBtnOff: {
      opacity: 0.3,
    },

    // ── Members Panel ────────────────────────────────
    headerIconBtnActive: {
      backgroundColor: '#1e3a5f',
      borderWidth: 1,
      borderColor: '#3b82f6',
    },
    membersPanel: {
      backgroundColor: '#0c1222',
      borderTopWidth: 1,
      borderTopColor: '#1e293b',
      maxHeight: 260,
    },
    membersPanelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#1e293b',
    },
    membersPanelTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: '#94a3b8',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    memberItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 12,
    },
    memberAvatarWrap: {
      position: 'relative',
    },
    memberAvatar: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    memberAvatarText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#ffffff',
    },
    memberOnlineDot: {
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#22c55e',
      borderWidth: 2,
      borderColor: '#0c1222',
    },
    memberName: {
      fontSize: 14,
      fontWeight: '600',
      color: '#e2e8f0',
    },
    memberRole: {
      fontSize: 12,
      color: '#64748b',
      textTransform: 'capitalize',
      marginTop: 1,
    },
    memberOwnerBadge: {
      backgroundColor: '#f59e0b20',
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    memberOwnerText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#f59e0b',
    },
    memberAdminBadge: {
      backgroundColor: '#3b82f620',
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    memberAdminText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#3b82f6',
    },
  });
}
