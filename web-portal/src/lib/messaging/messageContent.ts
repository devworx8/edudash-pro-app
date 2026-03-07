// Prefix guards ensure plain-text payloads never get parsed as structured media blocks
const MEDIA_PREFIX = '__media__';
const CALL_EVENT_PREFIX = '__call_event__';

export type MediaType = 'image' | 'audio' | 'file';

export interface MediaMessageContent {
  kind: 'media';
  mediaType: MediaType;
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
  durationMs?: number;
}

export interface TextMessageContent {
  kind: 'text';
  text: string;
}

export type RichMessageContent = MediaMessageContent | TextMessageContent;

export interface EncodeMediaOptions {
  mediaType: MediaType;
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
  durationMs?: number;
}

export type CallEventType = 'missed_call';

export interface CallEventContent {
  eventType: CallEventType;
  callId: string;
  callType: 'voice' | 'video';
  callerId?: string;
  callerName?: string;
  threadId?: string;
  occurredAt?: string;
}

export interface EncodeCallEventOptions {
  eventType: CallEventType;
  callId: string;
  callType: 'voice' | 'video';
  callerId?: string;
  callerName?: string;
  threadId?: string;
  occurredAt?: string;
}

export const encodeMediaContent = (options: EncodeMediaOptions): string => {
  return `${MEDIA_PREFIX}${JSON.stringify(options)}`;
};

export const encodeCallEventContent = (options: EncodeCallEventOptions): string => {
  return `${CALL_EVENT_PREFIX}${JSON.stringify(options)}`;
};

export const parseCallEventContent = (rawContent: string): CallEventContent | null => {
  if (typeof rawContent !== 'string' || !rawContent.startsWith(CALL_EVENT_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawContent.slice(CALL_EVENT_PREFIX.length));
    const callId = typeof parsed?.callId === 'string' ? parsed.callId : parsed?.call_id;
    const rawCallType = typeof parsed?.callType === 'string' ? parsed.callType : parsed?.call_type;
    if (!parsed || typeof callId !== 'string' || typeof rawCallType !== 'string') {
      return null;
    }

    const eventType = parsed.eventType || parsed.event_type;
    if (eventType !== 'missed_call') {
      return null;
    }

    return {
      eventType: 'missed_call',
      callId,
      callType: rawCallType === 'video' ? 'video' : 'voice',
      callerId: typeof parsed.callerId === 'string' ? parsed.callerId : parsed.caller_id,
      callerName: typeof parsed.callerName === 'string' ? parsed.callerName : parsed.caller_name,
      threadId: typeof parsed.threadId === 'string' ? parsed.threadId : parsed.thread_id,
      occurredAt: typeof parsed.occurredAt === 'string' ? parsed.occurredAt : parsed.occurred_at,
    };
  } catch (_err) {
    return null;
  }
};

export const parseMessageContent = (rawContent: string): RichMessageContent => {
  if (typeof rawContent !== 'string') {
    return { kind: 'text', text: '' };
  }

  if (rawContent.startsWith(MEDIA_PREFIX)) {
    try {
      const parsed = JSON.parse(rawContent.slice(MEDIA_PREFIX.length));
      if (parsed && typeof parsed.url === 'string' && typeof parsed.mediaType === 'string') {
        return {
          kind: 'media',
          mediaType: parsed.mediaType,
          url: parsed.url,
          name: parsed.name,
          mimeType: parsed.mimeType,
          size: parsed.size,
          durationMs: parsed.durationMs,
        };
      }
    } catch (_err) {
      // Intentionally fallback to text rendering if parsing fails
    }
  }

  return { kind: 'text', text: rawContent };
};

export const isImageMedia = (content: RichMessageContent): content is MediaMessageContent => {
  return content.kind === 'media' && content.mediaType === 'image';
};

export const isAudioMedia = (content: RichMessageContent): content is MediaMessageContent => {
  return content.kind === 'media' && content.mediaType === 'audio';
};

export const isFileMedia = (content: RichMessageContent): content is MediaMessageContent => {
  return content.kind === 'media' && content.mediaType === 'file';
};

/**
 * Get a human-readable display text for a message content string.
 * Converts __media__ encoded messages to friendly text like "🎤 Voice message"
 */
export const getMessageDisplayText = (rawContent: string): string => {
  if (!rawContent || typeof rawContent !== 'string') {
    return '';
  }

  const callEvent = parseCallEventContent(rawContent);
  if (callEvent?.eventType === 'missed_call') {
    return callEvent.callType === 'video' ? '📹 Missed video call' : '📞 Missed call';
  }

  const content = parseMessageContent(rawContent);
  
  if (content.kind === 'media') {
    switch (content.mediaType) {
      case 'audio':
        return '🎤 Voice message';
      case 'image':
        return '📷 Image';
      case 'file':
        return content.name ? `📎 ${content.name}` : '📎 File attachment';
      default:
        return '📎 Attachment';
    }
  }
  
  return content.text;
};
