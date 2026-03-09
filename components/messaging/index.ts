/**
 * Messaging Components
 * Shared components for WhatsApp-style chat interfaces
 */

export type { Message, MessageStatus } from './types';
export { formatTime, getDateSeparatorLabel, getDateKey, isVoiceNote, getVoiceNoteDuration } from './utils';
export { DateSeparator } from './DateSeparator';
export { MessageTicks } from './MessageTicks';
export { ReplyPreview } from './ReplyPreview';
export { MessageBubble } from './MessageBubble';
export { ReplyBubbleQuote } from './ReplyBubbleQuote';
export { SwipeableMessageRow } from './SwipeableMessageRow';
export { LinkedText } from './LinkedText';
export { TypingIndicator } from './TypingIndicator';
export { ChatHeader } from './ChatHeader';
export { ChatParticipantSheet } from './ChatParticipantSheet';
export { MessageComposer } from './MessageComposer';

// New components for messaging overhaul
export { ForwardMessagePicker } from './ForwardMessagePicker';
export { ChatSearchOverlay } from './ChatSearchOverlay';
export { MediaGalleryView } from './MediaGalleryView';
export { StarredMessagesView } from './StarredMessagesView';

// Unique messaging upgrades
export { ReactionBar, ReactionBubbles, REACTIONS } from './MessageReactions';
export type { Reaction } from './MessageReactions';
export { SmartQuickReplies } from './SmartQuickReplies';
export { SmartReplyChips } from './SmartReplyChips';
export { DashAssistBar } from './DashAssistBar';
export { VoiceWaveform } from './VoiceWaveform';
export { OnlineStatusDot, OnlineStatusBadge } from './OnlineStatusIndicator';
export { MessageScheduler, ScheduledBadge } from './MessageScheduler';
export { MessageHeader, MessagesListHeader } from './MessageHeader';
export { GlobalSearchModal } from './GlobalSearchModal';
