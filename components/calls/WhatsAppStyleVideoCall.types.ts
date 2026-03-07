import type { CallState } from './types';

export interface WhatsAppStyleVideoCallProps {
  isOpen: boolean;
  onClose: () => void;
  roomName?: string;
  userName?: string;
  userPhoto?: string | null;
  remoteUserName?: string;
  remoteUserPhoto?: string | null;
  isOwner?: boolean;
  calleeId?: string;
  callId?: string;
  meetingUrl?: string;
  threadId?: string;
  onCallStateChange?: (state: CallState) => void;
  onMinimize?: () => void;
}
