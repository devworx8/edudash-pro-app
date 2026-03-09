import { StyleSheet } from 'react-native';

export const OWN_BUBBLE_COLORS: [string, string, string] = ['rgba(77, 123, 255, 0.98)', 'rgba(109, 76, 246, 0.97)', 'rgba(67, 30, 135, 0.96)'];
export const OTHER_BUBBLE_COLORS: [string, string, string] = ['rgba(11, 22, 46, 0.96)', 'rgba(22, 25, 70, 0.95)', 'rgba(18, 11, 54, 0.94)'];
export const OTHER_CALL_BUTTON_COLORS: [string, string] = ['rgba(45, 212, 191, 0.22)', 'rgba(56, 189, 248, 0.2)'];
export const OWN_CALL_BUTTON_COLORS: [string, string] = ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.1)'];

export const messageBubbleStyles = StyleSheet.create({
  container: {
    marginVertical: 2,
    paddingHorizontal: 0,
    width: '100%',
    maxWidth: '100%',
  },
  containerWithReactions: {
    marginBottom: 8,
  },
  groupedMessage: {
    marginVertical: 1,
  },
  bubbleMiddle: {
    borderTopRightRadius: 18,
    borderTopLeftRadius: 18,
  },
  own: {
    alignSelf: 'stretch',
    alignItems: 'flex-end',
  },
  other: {
    alignSelf: 'stretch',
    alignItems: 'flex-start',
  },
  pressableBubble: {
    maxWidth: '90%',
    flexShrink: 1,
  },
  pressableBubbleWide: {
    width: '92%',
    maxWidth: '92%',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    width: '100%',
  },
  bubbleRowOwn: {
    justifyContent: 'flex-end',
    paddingRight: 4,
  },
  bubbleRowOther: {
    justifyContent: 'flex-start',
    paddingLeft: 4,
  },
  senderAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 0,
    marginBottom: 2,
    flexShrink: 0,
  },
  senderAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  senderAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  senderAvatarSpacer: {
    width: 32,
  },
  voiceBubbleWrapper: {
    maxWidth: '88%',
    flexShrink: 1,
  },
  name: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f8ca59',
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    marginLeft: 6,
    gap: 6,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  seenByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  seenByText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minWidth: 96,
    borderWidth: 1,
  },
  mediaBubble: {
    paddingHorizontal: 3,
    paddingVertical: 3,
    minWidth: 0,
  },
  mediaBubbleTight: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  richCardBubble: {
    alignSelf: 'stretch',
  },
  bubbleOwn: {
    borderTopRightRadius: 6,
    borderColor: 'rgba(122, 192, 255, 0.35)',
    shadowColor: '#5b61ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  bubbleOther: {
    borderTopLeftRadius: 6,
    borderColor: 'rgba(82, 164, 255, 0.22)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 2,
  },
  voiceBubble: {
    minWidth: 260,
    maxWidth: 300,
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingRight: 14,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  time: { fontSize: 11 },
  ticksContainer: { marginLeft: 2 },
  reactionsBelowBubble: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
    marginBottom: 2,
  },
  reactionsBelowOwn: {
    justifyContent: 'flex-end',
    marginRight: 8,
  },
  reactionsBelowOther: {
    justifyContent: 'flex-start',
    marginLeft: 8,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(10, 18, 38, 0.96)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(111, 206, 255, 0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    gap: 2,
  },
  reactionPillActive: {
    borderColor: 'rgba(124, 58, 237, 0.52)',
    backgroundColor: 'rgba(91, 33, 182, 0.28)',
  },
  reactionEmoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  reactionCount: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  forwardedLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
    marginLeft: 12,
  },
  forwardedText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#9fb3e7',
  },
  editedLabel: {
    fontSize: 10,
    fontStyle: 'italic',
    marginRight: 2,
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  failedLabel: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '600',
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    opacity: 0.6,
  },
  pendingLabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
});
