import type { DashAttachment, DashMessage } from '@/services/dash-ai/types';
import {
  extractConfirmedAnnouncementDraft,
  extractConfirmedToolCall,
  extractConfirmedToolNames,
  findReusableRecentAttachments,
  sanitizeAssistantReply,
  shouldReuseRecentAttachmentContext,
} from '@/lib/dash-ai/conversationGuards';

function createAttachment(overrides: Partial<DashAttachment> = {}): DashAttachment {
  return {
    id: overrides.id || 'att_1',
    name: overrides.name || 'worksheet.jpg',
    mimeType: overrides.mimeType || 'image/jpeg',
    size: overrides.size || 1024,
    bucket: overrides.bucket || 'attachments',
    storagePath: overrides.storagePath || 'dash/worksheet.jpg',
    kind: overrides.kind || 'image',
    status: overrides.status || 'uploaded',
    ...overrides,
  };
}

function createMessage(
  id: string,
  type: DashMessage['type'],
  content: string,
  attachments?: DashAttachment[],
): DashMessage {
  return {
    id,
    type,
    content,
    timestamp: Number(id.replace(/\D/g, '') || Date.now()),
    attachments,
  };
}

describe('conversationGuards', () => {
  it('reuses a recent attachment only for explicit follow-up references', () => {
    const attachment = createAttachment();
    const messages = [
      createMessage('m1', 'user', 'Here is my worksheet', [attachment]),
      createMessage('m2', 'assistant', 'I can see it.'),
    ];

    expect(findReusableRecentAttachments(messages, 'Can you check number 2?')).toEqual([attachment]);
    expect(findReusableRecentAttachments(messages, 'How can I tell if I am pregnant?')).toEqual([]);
  });

  it('detects likely attachment follow-up turns without matching unrelated prompts', () => {
    expect(shouldReuseRecentAttachmentContext('Is this correct?')).toBe(true);
    expect(shouldReuseRecentAttachmentContext('What about part c?')).toBe(true);
    expect(shouldReuseRecentAttachmentContext('Please help')).toBe(false);
  });

  it('strips fabricated trailing user turns from assistant replies', () => {
    const cleaned = sanitizeAssistantReply([
      'Here is the help you need.',
      '',
      'User: Thank you, that was helpful.',
    ].join('\n'), 'Please help me with this worksheet');

    expect(cleaned).toBe('Here is the help you need.');
  });

  it('keeps dialogue labels when the user explicitly asked for a script', () => {
    const content = 'User: Hello\nAssistant: Hi there';
    expect(sanitizeAssistantReply(content, 'Write a short dialogue script')).toBe(content);
  });

  it('detects confirmed announcement sends after a compose_message step', () => {
    const assistantMessage = {
      ...createMessage('m3', 'assistant', 'Message composer opened'),
      metadata: {
        tool_name: 'compose_message',
        tool_result: { success: true, result: { opened: true } },
      },
    } as DashMessage;

    expect(extractConfirmedToolNames([assistantMessage], 'Yes please send it to all parents')).toEqual([
      'send_school_announcement',
    ]);
  });

  it('extracts the drafted announcement details from recent assistant tool metadata', () => {
    const assistantMessage = {
      ...createMessage('m3', 'assistant', 'Announcement composer opened'),
      metadata: {
        tool_name: 'compose_message',
        tool_args: {
          subject: 'Important: Parent Meeting Date Change',
          body: 'The Friday parent meeting has been moved to tomorrow at 18:00.',
          audience: 'parents',
          priority: 'high',
        },
      },
    } as DashMessage;

    expect(extractConfirmedAnnouncementDraft([assistantMessage])).toEqual({
      subject: 'Important: Parent Meeting Date Change',
      body: 'The Friday parent meeting has been moved to tomorrow at 18:00.',
      audience: 'parents',
      priority: 'high',
    });
  });

  it('extracts the latest confirmed direct inbox tool call with the drafted payload', () => {
    const assistantMessage = {
      ...createMessage('m9', 'assistant', 'Inbox message ready to send.'),
      metadata: {
        tool_name: 'send_inbox_message',
        tool_args: {
          recipient_name: 'Koketso Baloyi',
          recipient_role: 'parent',
          student_name: 'Koketso Junior',
          subject: 'Meeting reminder',
          body: 'Please remember the parent meeting starts at 18:00.',
        },
        tool_result: { success: false, error: 'Tool send_inbox_message requires explicit confirmation' },
      },
    } as DashMessage;

    expect(extractConfirmedToolCall([assistantMessage], 'Yes please send it now')).toEqual({
      toolName: 'send_inbox_message',
      args: {
        recipient_name: 'Koketso Baloyi',
        recipient_role: 'parent',
        student_name: 'Koketso Junior',
        subject: 'Meeting reminder',
        body: 'Please remember the parent meeting starts at 18:00.',
      },
    });
  });

  it('extracts the latest confirmed broadcast tool call and normalizes RSVP options', () => {
    const assistantMessage = {
      ...createMessage('m10', 'assistant', 'Broadcast thread ready to send.'),
      metadata: {
        tool_name: 'send_broadcast_message',
        tool_results: [
          {
            name: 'send_broadcast_message',
            input: {
              subject: 'Parent Meeting RSVP',
              body: 'Please confirm whether you will attend the parent meeting.',
              audience: 'parents',
              channel_mode: 'announcement_channel',
              require_rsvp: 'true',
            },
          },
        ],
      },
    } as DashMessage;

    expect(extractConfirmedToolCall([assistantMessage], 'Yes, send to all parents')).toEqual({
      toolName: 'send_broadcast_message',
      args: {
        subject: 'Parent Meeting RSVP',
        body: 'Please confirm whether you will attend the parent meeting.',
        audience: 'all_parents',
        channel_mode: 'announcement_channel',
        require_rsvp: true,
      },
    });
  });

  it('uses the most recent drafted communication when multiple send contexts exist', () => {
    const announcementMessage = {
      ...createMessage('m11', 'assistant', 'Announcement ready to send.'),
      metadata: {
        tool_name: 'send_school_announcement',
        tool_args: {
          subject: 'Old announcement',
          body: 'This should not be selected.',
          audience: 'parents',
        },
      },
    } as DashMessage;
    const inboxMessage = {
      ...createMessage('m12', 'assistant', 'Direct message ready to send.'),
      metadata: {
        tool_name: 'send_inbox_message',
        tool_args: {
          recipient_name: 'Naledi Chuene',
          body: 'This is the latest drafted message.',
        },
      },
    } as DashMessage;

    expect(extractConfirmedToolCall([announcementMessage, inboxMessage], 'Yes please send it')).toEqual({
      toolName: 'send_inbox_message',
      args: {
        recipient_name: 'Naledi Chuene',
        body: 'This is the latest drafted message.',
      },
    });
  });

  it('falls back to tool result input when the draft lives inside tool_results metadata', () => {
    const assistantMessage = {
      ...createMessage('m6', 'assistant', 'Ready when you are.'),
      metadata: {
        tool_results: [
          {
            name: 'compose_message',
            input: {
              subject: 'School closes early',
              body: 'Learners will be dismissed at 12:00 on Friday.',
              audience: 'all',
            },
            output: { success: true, opened: true },
          },
        ],
      },
    } as DashMessage;

    expect(extractConfirmedAnnouncementDraft([assistantMessage])).toEqual({
      subject: 'School closes early',
      body: 'Learners will be dismissed at 12:00 on Friday.',
      audience: 'all',
    });
  });

  it('detects confirmed email sends after an email draft approval prompt', () => {
    const assistantMessage = {
      ...createMessage('m4', 'assistant', 'Email draft ready to send.'),
      metadata: {
        tool_name: 'send_email',
        tool_result: { success: false, error: 'Tool send_email requires explicit confirmation' },
      },
    } as DashMessage;

    expect(extractConfirmedToolNames([assistantMessage], 'Yes, send the email')).toEqual([
      'send_email',
    ]);
  });

  it('detects confirmed inbox sends after a direct message approval prompt', () => {
    const assistantMessage = {
      ...createMessage('m7', 'assistant', 'Inbox message ready to send.'),
      metadata: {
        tool_name: 'send_inbox_message',
        tool_result: { success: false, error: 'Tool send_inbox_message requires explicit confirmation' },
      },
    } as DashMessage;

    expect(extractConfirmedToolNames([assistantMessage], 'Yes, send it now')).toEqual([
      'send_inbox_message',
    ]);
  });

  it('detects confirmed broadcast sends after a broadcast approval prompt', () => {
    const assistantMessage = {
      ...createMessage('m8', 'assistant', 'Broadcast thread ready to send.'),
      metadata: {
        tool_name: 'send_broadcast_message',
        tool_result: { success: false, error: 'Tool send_broadcast_message requires explicit confirmation' },
      },
    } as DashMessage;

    expect(extractConfirmedToolNames([assistantMessage], 'Yes please send to all parents')).toEqual([
      'send_broadcast_message',
    ]);
  });

  it('does not confirm tools for unrelated short replies', () => {
    const assistantMessage = createMessage('m5', 'assistant', 'I can help with your worksheet.');
    expect(extractConfirmedToolNames([assistantMessage], 'Yes, what is number 4?')).toEqual([]);
  });
});
