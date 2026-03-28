/**
 * Message content parsing and display utilities
 * Handles __media__ encoded messages for both mobile and web
 */

// Prefix guards ensure plain-text payloads never get parsed as structured media blocks
const MEDIA_PREFIX = '__media__';
const CALL_EVENT_PREFIX = '__call_event__';
const INLINE_IMAGE_REGEX = /\[image\]\((.+?)\)/i;
const INLINE_VIDEO_REGEX = /\[video\]\((.+?)\)/i;
const DIRECT_URL_REGEX = /^https?:\/\/\S+$/i;
const GIF_URL_REGEX = /(\.gif($|[?#]))|(giphy\.com\/media\/)|(media\d*\.giphy\.com\/media\/)|(media\.tenor\.com\/)/i;
const IMAGE_URL_REGEX = /\.(png|jpe?g|webp|bmp|heic|heif|svg)($|[?#])/i;
const VIDEO_URL_REGEX = /\.(mp4|mov|m4v|webm|avi)($|[?#])/i;

export type MediaType = 'image' | 'audio' | 'file' | 'video' | 'gif';

export interface MediaMessageContent {
  kind: 'media';
  mediaType: MediaType;
  url: string;
  caption?: string;
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

/**
 * Encode media content as a __media__ prefixed string
 */
export const encodeMediaContent = (options: EncodeMediaOptions): string => {
  return `${MEDIA_PREFIX}${JSON.stringify(options)}`;
};

/**
 * Encode call events as a __call_event__ prefixed payload for thread cards.
 */
export const encodeCallEventContent = (options: EncodeCallEventOptions): string => {
  return `${CALL_EVENT_PREFIX}${JSON.stringify(options)}`;
};

/**
 * Parse __call_event__ payloads for rich call cards.
 */
export const parseCallEventContent = (rawContent: string): CallEventContent | null => {
  if (typeof rawContent !== 'string') {
    return null;
  }

  const normalizedRawContent = rawContent.trimStart();
  if (!normalizedRawContent.startsWith(CALL_EVENT_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalizedRawContent.slice(CALL_EVENT_PREFIX.length));
    const callId = typeof parsed?.callId === 'string' ? parsed.callId : parsed?.call_id;
    const rawCallType = typeof parsed?.callType === 'string' ? parsed.callType : parsed?.call_type;
    if (!parsed || typeof callId !== 'string' || typeof rawCallType !== 'string') {
      return null;
    }

    const eventTypeRaw =
      typeof parsed?.eventType === 'string'
        ? parsed.eventType
        : typeof parsed?.event_type === 'string'
          ? parsed.event_type
          : 'missed_call';
    const normalizedEventType =
      eventTypeRaw === 'missed_video_call' || eventTypeRaw === 'missed_voice_call'
        ? 'missed_call'
        : eventTypeRaw;
    if (normalizedEventType !== 'missed_call') {
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

const extractCaption = (rawContent: string, token: string, defaultLead: RegExp): string | undefined => {
  const trimmed = rawContent.trim();
  const withoutToken = trimmed.replace(token, '').trim();
  const withoutLead = withoutToken.replace(defaultLead, '').trim();
  return withoutLead || undefined;
};

const parseInlineMediaContent = (rawContent: string): MediaMessageContent | null => {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return null;
  }

  const imageMatch = trimmed.match(INLINE_IMAGE_REGEX);
  if (imageMatch?.[1]) {
    const url = imageMatch[1].trim();
    const isGif = GIF_URL_REGEX.test(url);
    return {
      kind: 'media',
      mediaType: isGif ? 'gif' : 'image',
      url,
      caption: extractCaption(trimmed, imageMatch[0], /^📷\s*Photo\s*/i),
      mimeType: isGif ? 'image/gif' : undefined,
    };
  }

  const videoMatch = trimmed.match(INLINE_VIDEO_REGEX);
  if (videoMatch?.[1]) {
    return {
      kind: 'media',
      mediaType: 'video',
      url: videoMatch[1].trim(),
      caption: extractCaption(trimmed, videoMatch[0], /^🎬\s*Video\s*/i),
    };
  }

  if (!DIRECT_URL_REGEX.test(trimmed)) {
    return null;
  }

  if (GIF_URL_REGEX.test(trimmed)) {
    return { kind: 'media', mediaType: 'gif', url: trimmed, mimeType: 'image/gif' };
  }
  if (IMAGE_URL_REGEX.test(trimmed)) {
    return { kind: 'media', mediaType: 'image', url: trimmed };
  }
  if (VIDEO_URL_REGEX.test(trimmed)) {
    return { kind: 'media', mediaType: 'video', url: trimmed };
  }

  return null;
};

/**
 * Parse a raw message content string into structured content
 */
export const parseMessageContent = (rawContent: string): RichMessageContent => {
  if (typeof rawContent !== 'string') {
    return { kind: 'text', text: '' };
  }

  const normalizedRawContent = rawContent.trimStart();

  if (normalizedRawContent.startsWith(MEDIA_PREFIX)) {
    try {
      const parsed = JSON.parse(normalizedRawContent.slice(MEDIA_PREFIX.length));
      if (parsed && typeof parsed.url === 'string' && typeof parsed.mediaType === 'string') {
        return {
          kind: 'media',
          mediaType: parsed.mediaType,
          url: parsed.url,
          caption: parsed.caption,
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

  const inlineMedia = parseInlineMediaContent(rawContent);
  if (inlineMedia) {
    return inlineMedia;
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

export const isVideoMedia = (content: RichMessageContent): content is MediaMessageContent => {
  return content.kind === 'media' && content.mediaType === 'video';
};

export const isGifMedia = (content: RichMessageContent): content is MediaMessageContent => {
  return content.kind === 'media' && content.mediaType === 'gif';
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
      case 'gif':
        return '✨ GIF';
      case 'image':
        return '📷 Image';
      case 'video':
        return '🎬 Video';
      case 'file':
        return content.name ? `📎 ${content.name}` : '📎 File attachment';
      default:
        return '📎 Attachment';
    }
  }
  
  return content.text;
};
