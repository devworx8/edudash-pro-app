import type { DashAttachment, DashMessage } from '@/services/dash-ai/types';

const DIALOGUE_REQUEST_PATTERN =
  /\b(dialogue|dialog|script|role[- ]?play|roleplay|conversation example|chat transcript|transcript)\b/i;

const STRONG_ATTACHMENT_REFERENCE_PATTERNS: RegExp[] = [
  /\b(this|that|the|same|last|previous|above|earlier)\s+(image|photo|picture|worksheet|page|document|attachment|scan|question|part)\b/i,
  /\b(look at|check|mark|explain|read|solve|use|continue with|help with)\s+(it|this|that|the same one|the previous one)\b/i,
  /\b(part|question|number|item|answer)\s+([a-e]|\d{1,2})\b/i,
  /\b(next|last|previous|same)\s+(one|page|question|part)\b/i,
  /\b(is|are)\s+(it|this|that)\s+(right|correct)\b/i,
];

const LIGHT_ATTACHMENT_REFERENCE_PATTERN =
  /\b(it|this|that|these|those|same|again|next|last|previous|question|part|number|page)\b/i;
const CONFIRMATION_PATTERN =
  /\b(yes|yep|yeah|ok(?:ay)?|please do|go ahead|do it|confirm(?:ed)?|approved?|send(?: it| this)?|publish(?: it| this)?|post(?: it| this)?|share(?: it| this)?|proceed)\b/i;
const EMAIL_CONTEXT_PATTERN = /\b(email|subject line|reply[- ]?to)\b/i;
const ANNOUNCEMENT_CONTEXT_PATTERN =
  /\b(announcement|notice|reminder|broadcast|school[- ]?wide|parents?|teachers?|students?|message composer)\b/i;
const INBOX_CONTEXT_PATTERN =
  /\b(inbox message|message thread|direct message|parent message|teacher message|chat thread)\b/i;
const BROADCAST_CONTEXT_PATTERN =
  /\b(inbox broadcast|broadcast thread|parent group|announcement channel|group message)\b/i;

export type ConfirmedAnnouncementDraft = {
  subject: string;
  body: string;
  audience?: 'parents' | 'teachers' | 'students' | 'all';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
};

export type ConfirmedInboxDraft = {
  recipient_name: string;
  recipient_role?: 'parent' | 'teacher';
  student_name?: string;
  subject?: string;
  body: string;
};

export type ConfirmedBroadcastDraft = {
  subject: string;
  body: string;
  audience?: 'all_parents' | 'all_teachers' | 'all_staff' | 'everyone';
  channel_mode?: 'announcement_channel' | 'parent_group';
  allow_replies?: boolean;
  require_rsvp?: boolean;
};

export type ConfirmedToolCall =
  | { toolName: 'send_school_announcement'; args: ConfirmedAnnouncementDraft }
  | { toolName: 'send_inbox_message'; args: ConfirmedInboxDraft }
  | { toolName: 'send_broadcast_message'; args: ConfirmedBroadcastDraft };

function extractToolNames(message: DashMessage): string[] {
  const metadata = (message.metadata || {}) as Record<string, unknown>;
  const names = new Set<string>();

  const addName = (value: unknown) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) names.add(normalized);
  };

  addName(metadata.tool_name);

  const toolResults = Array.isArray(metadata.tool_results)
    ? metadata.tool_results
    : metadata.tool_results && typeof metadata.tool_results === 'object'
      ? [metadata.tool_results]
      : [];

  for (const entry of toolResults) {
    if (!entry || typeof entry !== 'object') continue;
    addName((entry as Record<string, unknown>).name);
    addName((entry as Record<string, unknown>).tool);
  }

  if (metadata.tool_result && typeof metadata.tool_result === 'object') {
    addName((metadata.tool_result as Record<string, unknown>).tool);
    addName((metadata.tool_result as Record<string, unknown>).name);
  }

  return Array.from(names);
}

function isReusableAttachment(attachment: DashAttachment | null | undefined): attachment is DashAttachment {
  if (!attachment) return false;
  const kind = String(attachment.kind || '').toLowerCase();
  return kind === 'image' || kind === 'pdf' || kind === 'document';
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function normalizeAnnouncementAudience(value: unknown): ConfirmedAnnouncementDraft['audience'] | undefined {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'parent') return 'parents';
  if (normalized === 'teacher' || normalized === 'staff' || normalized === 'admin') return 'teachers';
  if (normalized === 'student' || normalized === 'learner') return 'students';
  if (['everyone', 'everybody', 'school'].includes(normalized)) return 'all';
  if (['parents', 'teachers', 'students', 'all'].includes(normalized)) {
    return normalized as ConfirmedAnnouncementDraft['audience'];
  }
  return undefined;
}

function normalizeAnnouncementPriority(value: unknown): ConfirmedAnnouncementDraft['priority'] | undefined {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'medium') return 'normal';
  if (['low', 'normal', 'high', 'urgent'].includes(normalized)) {
    return normalized as ConfirmedAnnouncementDraft['priority'];
  }
  return undefined;
}

function normalizeAnnouncementDraftPayload(
  payload: Record<string, unknown> | null | undefined,
): ConfirmedAnnouncementDraft | null {
  if (!payload) return null;

  const subject = firstNonEmptyString(payload.subject, payload.title);
  const body = firstNonEmptyString(payload.body, payload.message, payload.content);
  if (!subject || !body) {
    return null;
  }

  const audience = normalizeAnnouncementAudience(payload.audience || payload.recipient);
  const priority = normalizeAnnouncementPriority(payload.priority);

  return {
    subject,
    body,
    ...(audience ? { audience } : {}),
    ...(priority ? { priority } : {}),
  };
}

function normalizeRecipientRole(value: unknown): ConfirmedInboxDraft['recipient_role'] | undefined {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'teacher' || normalized === 'staff') return 'teacher';
  if (normalized === 'parent' || normalized === 'guardian') return 'parent';
  return undefined;
}

function normalizeBroadcastAudience(
  value: unknown,
): ConfirmedBroadcastDraft['audience'] | undefined {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'all' || normalized === 'everyone' || normalized === 'everybody') {
    return 'everyone';
  }
  if (normalized === 'parents' || normalized === 'all_parents') return 'all_parents';
  if (normalized === 'teachers' || normalized === 'all_teachers') return 'all_teachers';
  if (normalized === 'staff' || normalized === 'all_staff') return 'all_staff';
  return undefined;
}

function normalizeBroadcastChannelMode(
  value: unknown,
): ConfirmedBroadcastDraft['channel_mode'] | undefined {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'parent_group') return 'parent_group';
  if (normalized === 'announcement_channel' || normalized === 'announcement') {
    return 'announcement_channel';
  }
  return undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
    if (['false', 'no', 'n', '0'].includes(normalized)) return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
}

function normalizeInboxDraftPayload(
  payload: Record<string, unknown> | null | undefined,
): ConfirmedInboxDraft | null {
  if (!payload) return null;

  const recipientName = firstNonEmptyString(
    payload.recipient_name,
    payload.recipientName,
    payload.parent_name,
    payload.teacher_name,
    payload.recipient,
  );
  const body = firstNonEmptyString(payload.body, payload.message, payload.content);
  if (!recipientName || !body) {
    return null;
  }

  const recipientRole = normalizeRecipientRole(
    payload.recipient_role || payload.recipientRole || payload.recipient_type,
  );
  const studentName = firstNonEmptyString(
    payload.student_name,
    payload.studentName,
    payload.learner_name,
    payload.child_name,
  );
  const subject = firstNonEmptyString(payload.subject, payload.title);

  return {
    recipient_name: recipientName,
    body,
    ...(recipientRole ? { recipient_role: recipientRole } : {}),
    ...(studentName ? { student_name: studentName } : {}),
    ...(subject ? { subject } : {}),
  };
}

function normalizeBroadcastDraftPayload(
  payload: Record<string, unknown> | null | undefined,
): ConfirmedBroadcastDraft | null {
  if (!payload) return null;

  const subject = firstNonEmptyString(payload.subject, payload.title);
  const body = firstNonEmptyString(payload.body, payload.message, payload.content);
  if (!subject || !body) {
    return null;
  }

  const audience = normalizeBroadcastAudience(payload.audience || payload.recipient);
  const channelMode = normalizeBroadcastChannelMode(
    payload.channel_mode || payload.channelMode || payload.mode,
  );
  const allowReplies = normalizeBoolean(payload.allow_replies ?? payload.allowReplies);
  const requireRsvp = normalizeBoolean(payload.require_rsvp ?? payload.requireRsvp);

  return {
    subject,
    body,
    ...(audience ? { audience } : {}),
    ...(channelMode ? { channel_mode: channelMode } : {}),
    ...(typeof allowReplies === 'boolean' ? { allow_replies: allowReplies } : {}),
    ...(typeof requireRsvp === 'boolean' ? { require_rsvp: requireRsvp } : {}),
  };
}

function extractToolDraftCandidates(message: DashMessage): Array<Record<string, unknown>> {
  const metadata = (message.metadata || {}) as Record<string, unknown>;
  const candidates: Array<Record<string, unknown>> = [];

  const pushCandidate = (value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      candidates.push(value as Record<string, unknown>);
    }
  };

  pushCandidate(metadata.tool_args);

  const toolResults = Array.isArray(metadata.tool_results)
    ? metadata.tool_results
    : metadata.tool_results && typeof metadata.tool_results === 'object'
      ? [metadata.tool_results]
      : [];

  for (const entry of toolResults) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    pushCandidate(record.input);
    pushCandidate(record.output);
  }

  if (metadata.tool_result && typeof metadata.tool_result === 'object') {
    const toolResult = metadata.tool_result as Record<string, unknown>;
    pushCandidate(toolResult.result);
  }

  if (metadata.dashboard_action && typeof metadata.dashboard_action === 'object') {
    const action = metadata.dashboard_action as Record<string, unknown>;
    const params = action.params;
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      pushCandidate({
        subject: (params as Record<string, unknown>).title,
        body: (params as Record<string, unknown>).content,
        audience: (params as Record<string, unknown>).audience,
        priority: (params as Record<string, unknown>).priority,
      });
    }
  }

  return candidates;
}

export function shouldReuseRecentAttachmentContext(userInput: string): boolean {
  const text = String(userInput || '').trim();
  if (!text) return false;

  if (STRONG_ATTACHMENT_REFERENCE_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  return text.length <= 48 && LIGHT_ATTACHMENT_REFERENCE_PATTERN.test(text);
}

export function findReusableRecentAttachments(
  messages: DashMessage[],
  userInput: string,
  maxLookbackMessages: number = 4,
): DashAttachment[] {
  if (!shouldReuseRecentAttachmentContext(userInput)) {
    return [];
  }

  const startIndex = Math.max(0, messages.length - maxLookbackMessages);

  for (let index = messages.length - 1; index >= startIndex; index -= 1) {
    const message = messages[index];
    if (message.type !== 'user') continue;
    const attachments = (message.attachments || []).filter(isReusableAttachment);
    if (attachments.length > 0) {
      return attachments;
    }
  }

  return [];
}

export function extractConfirmedToolNames(messages: DashMessage[], userInput: string): string[] {
  const text = String(userInput || '').trim();
  if (!text || text.length > 180) {
    return [];
  }

  const lowerText = text.toLowerCase();
  const looksLikeConfirmation = CONFIRMATION_PATTERN.test(lowerText);
  const hasExplicitSendVerb = /\b(send|publish|post|share|deliver)\b/i.test(lowerText);
  if (!looksLikeConfirmation && !hasExplicitSendVerb) {
    return [];
  }

  const recentAssistantMessages = messages
    .slice(-6)
    .filter((message) => message.type === 'assistant');

  const sawEmailContext = recentAssistantMessages.some((message) => {
    const toolNames = extractToolNames(message);
    return toolNames.includes('send_email') || EMAIL_CONTEXT_PATTERN.test(String(message.content || ''));
  });

  const sawAnnouncementContext = recentAssistantMessages.some((message) => {
    const toolNames = extractToolNames(message);
    if (toolNames.includes('send_broadcast_message')) {
      return false;
    }
    return (
      toolNames.includes('compose_message') ||
      toolNames.includes('send_school_announcement') ||
      ANNOUNCEMENT_CONTEXT_PATTERN.test(String(message.content || ''))
    );
  });

  const sawInboxContext = recentAssistantMessages.some((message) => {
    const toolNames = extractToolNames(message);
    return (
      toolNames.includes('send_inbox_message') ||
      INBOX_CONTEXT_PATTERN.test(String(message.content || ''))
    );
  });

  const sawBroadcastContext = recentAssistantMessages.some((message) => {
    const toolNames = extractToolNames(message);
    return (
      toolNames.includes('send_broadcast_message') ||
      BROADCAST_CONTEXT_PATTERN.test(String(message.content || ''))
    );
  });

  if (!sawEmailContext && !sawAnnouncementContext && !sawInboxContext && !sawBroadcastContext) {
    return [];
  }

  const confirmedTools = new Set<string>();
  if (sawEmailContext) {
    confirmedTools.add('send_email');
  }
  if (sawAnnouncementContext) {
    confirmedTools.add('send_school_announcement');
  }
  if (sawInboxContext) {
    confirmedTools.add('send_inbox_message');
  }
  if (sawBroadcastContext) {
    confirmedTools.add('send_broadcast_message');
  }

  return Array.from(confirmedTools);
}

export function extractConfirmedAnnouncementDraft(
  messages: DashMessage[],
): ConfirmedAnnouncementDraft | null {
  const recentAssistantMessages = messages
    .slice(-6)
    .filter((message) => message.type === 'assistant')
    .reverse();

  for (const message of recentAssistantMessages) {
    const toolNames = extractToolNames(message);
    const looksAnnouncementRelated =
      toolNames.includes('compose_message') ||
      toolNames.includes('send_school_announcement') ||
      ANNOUNCEMENT_CONTEXT_PATTERN.test(String(message.content || ''));

    if (!looksAnnouncementRelated) {
      continue;
    }

    for (const candidate of extractToolDraftCandidates(message)) {
      const normalized = normalizeAnnouncementDraftPayload(candidate);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

export function extractConfirmedInboxDraft(
  messages: DashMessage[],
): ConfirmedInboxDraft | null {
  const recentAssistantMessages = messages
    .slice(-6)
    .filter((message) => message.type === 'assistant')
    .reverse();

  for (const message of recentAssistantMessages) {
    const toolNames = extractToolNames(message);
    const looksInboxRelated =
      toolNames.includes('send_inbox_message') ||
      INBOX_CONTEXT_PATTERN.test(String(message.content || ''));

    if (!looksInboxRelated) {
      continue;
    }

    for (const candidate of extractToolDraftCandidates(message)) {
      const normalized = normalizeInboxDraftPayload(candidate);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

export function extractConfirmedBroadcastDraft(
  messages: DashMessage[],
): ConfirmedBroadcastDraft | null {
  const recentAssistantMessages = messages
    .slice(-6)
    .filter((message) => message.type === 'assistant')
    .reverse();

  for (const message of recentAssistantMessages) {
    const toolNames = extractToolNames(message);
    const looksBroadcastRelated =
      toolNames.includes('send_broadcast_message') ||
      BROADCAST_CONTEXT_PATTERN.test(String(message.content || ''));

    if (!looksBroadcastRelated) {
      continue;
    }

    for (const candidate of extractToolDraftCandidates(message)) {
      const normalized = normalizeBroadcastDraftPayload(candidate);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

export function extractConfirmedToolCall(
  messages: DashMessage[],
  userInput: string,
): ConfirmedToolCall | null {
  const text = String(userInput || '').trim();
  if (!text || text.length > 180) {
    return null;
  }

  const lowerText = text.toLowerCase();
  const looksLikeConfirmation = CONFIRMATION_PATTERN.test(lowerText);
  const hasExplicitSendVerb = /\b(send|publish|post|share|deliver)\b/i.test(lowerText);
  if (!looksLikeConfirmation && !hasExplicitSendVerb) {
    return null;
  }

  const recentAssistantMessages = messages
    .slice(-6)
    .filter((message) => message.type === 'assistant')
    .reverse();

  for (const message of recentAssistantMessages) {
    const toolNames = extractToolNames(message);
    const content = String(message.content || '');
    const candidates = extractToolDraftCandidates(message);

    const looksBroadcastRelated =
      toolNames.includes('send_broadcast_message') ||
      BROADCAST_CONTEXT_PATTERN.test(content);
    if (looksBroadcastRelated) {
      for (const candidate of candidates) {
        const normalized = normalizeBroadcastDraftPayload(candidate);
        if (normalized) {
          return { toolName: 'send_broadcast_message', args: normalized };
        }
      }
    }

    const looksInboxRelated =
      toolNames.includes('send_inbox_message') ||
      INBOX_CONTEXT_PATTERN.test(content);
    if (looksInboxRelated) {
      for (const candidate of candidates) {
        const normalized = normalizeInboxDraftPayload(candidate);
        if (normalized) {
          return { toolName: 'send_inbox_message', args: normalized };
        }
      }
    }

    const looksAnnouncementRelated =
      !toolNames.includes('send_broadcast_message') &&
      (
        toolNames.includes('compose_message') ||
        toolNames.includes('send_school_announcement') ||
        ANNOUNCEMENT_CONTEXT_PATTERN.test(content)
      );
    if (looksAnnouncementRelated) {
      for (const candidate of candidates) {
        const normalized = normalizeAnnouncementDraftPayload(candidate);
        if (normalized) {
          return { toolName: 'send_school_announcement', args: normalized };
        }
      }
    }
  }

  return null;
}

export function sanitizeAssistantReply(content: string, userInput?: string): string {
  let text = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const preserveDialogueLabels = DIALOGUE_REQUEST_PATTERN.test(String(userInput || ''));
  if (!preserveDialogueLabels) {
    text = text.replace(/^\s*Assistant:\s*/gmi, '').trim();
    const fabricatedTurn = text.match(/^\s*(User|Student|Learner|Parent)\s*:/im);
    if (fabricatedTurn && typeof fabricatedTurn.index === 'number' && fabricatedTurn.index > 0) {
      text = text.slice(0, fabricatedTurn.index).trim();
    }
  }

  return text.replace(/\n{3,}/g, '\n\n').trim();
}
