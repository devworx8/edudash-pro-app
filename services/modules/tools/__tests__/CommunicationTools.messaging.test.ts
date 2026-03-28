import { registerCommunicationTools } from '@/services/modules/tools/CommunicationTools';
import type { AgentTool } from '@/services/modules/DashToolRegistry';

const pushMock = jest.fn();
const createAnnouncementMock = jest.fn();
const sendDirectMessageMock = jest.fn();
const sendBroadcastMessageMock = jest.fn();
const summarizeBroadcastRsvpMock = jest.fn();

jest.mock('@/lib/navigation/safeRouter', () => ({
  safeRouter: {
    push: (...args: any[]) => pushMock(...args),
  },
}));

jest.mock('@/lib/services/announcementService', () => ({
  __esModule: true,
  default: {
    createAnnouncement: (...args: any[]) => createAnnouncementMock(...args),
  },
}));

jest.mock('@/lib/services/inboxMessagingService', () => ({
  __esModule: true,
  default: {
    sendDirectMessage: (...args: any[]) => sendDirectMessageMock(...args),
    sendBroadcastMessage: (...args: any[]) => sendBroadcastMessageMock(...args),
    summarizeBroadcastRsvp: (...args: any[]) => summarizeBroadcastRsvpMock(...args),
  },
}));

function getTool(name: string): AgentTool {
  const tools: AgentTool[] = [];
  registerCommunicationTools((tool) => tools.push(tool));
  const target = tools.find((tool) => tool.name === name);
  if (!target) {
    throw new Error(`${name} tool not registered`);
  }
  return target;
}

describe('CommunicationTools messaging flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes principal compose_message requests to the announcement composer', async () => {
    const tool = getTool('compose_message');

    const result = await tool.execute(
      {
        subject: 'Parent Meeting Date Change',
        body: 'The Friday parent meeting has moved to Thursday at 18:00.',
        recipient: 'parent',
      },
      { role: 'principal' },
    );

    expect(result.success).toBe(true);
    expect(result.route).toBe('/screens/principal-announcement');
    expect(pushMock).toHaveBeenCalledWith({
      pathname: '/screens/principal-announcement',
      params: {
        compose: 'true',
        title: 'Parent Meeting Date Change',
        content: 'The Friday parent meeting has moved to Thursday at 18:00.',
        audience: 'parents',
        priority: 'normal',
      },
    });
  });

  it('sends a school announcement after confirmation with resolved context', async () => {
    const tool = getTool('send_school_announcement');
    createAnnouncementMock.mockResolvedValue({
      success: true,
      data: {
        id: 'announcement-1',
        target_audience: 'parents',
      },
    });

    const result = await tool.execute(
      {
        subject: 'Parent Meeting Date Change',
        body: 'The Friday parent meeting has moved to Thursday at 18:00.',
        audience: 'parents',
        priority: 'high',
      },
      {
        userId: 'user-1',
        organizationId: 'org-1',
        supabaseClient: {},
      },
    );

    expect(createAnnouncementMock).toHaveBeenCalledWith('org-1', 'user-1', {
      title: 'Parent Meeting Date Change',
      message: 'The Friday parent meeting has moved to Thursday at 18:00.',
      audience: ['parents'],
      priority: 'high',
    });
    expect(result).toMatchObject({
      success: true,
      announcement_id: 'announcement-1',
      audience: 'parents',
      priority: 'high',
    });
  });

  it('sends a direct inbox message to one parent through the inbox service', async () => {
    const tool = getTool('send_inbox_message');
    sendDirectMessageMock.mockResolvedValue({
      success: true,
      thread_id: 'thread-1',
      recipient_name: 'Koketso Baloyi',
      message: 'Inbox message sent to Koketso Baloyi.',
    });

    const result = await tool.execute(
      {
        recipient_name: 'Koketso Baloyi',
        recipient_role: 'parent',
        student_name: 'Koketso Junior',
        subject: 'Meeting reminder',
        body: 'Please remember the parent meeting starts at 18:00.',
      },
      {
        role: 'principal',
        userId: 'user-1',
        organizationId: 'org-1',
        supabaseClient: {},
      },
    );

    expect(sendDirectMessageMock).toHaveBeenCalledWith({
      organizationId: 'org-1',
      senderId: 'user-1',
      senderRole: 'principal',
      recipientName: 'Koketso Baloyi',
      recipientRole: 'parent',
      studentName: 'Koketso Junior',
      subject: 'Meeting reminder',
      body: 'Please remember the parent meeting starts at 18:00.',
      supabase: {},
    });
    expect(result).toMatchObject({
      success: true,
      thread_id: 'thread-1',
      recipient_name: 'Koketso Baloyi',
    });
  });

  it('sends an inbox broadcast with RSVP support through the inbox service', async () => {
    const tool = getTool('send_broadcast_message');
    sendBroadcastMessageMock.mockResolvedValue({
      success: true,
      thread_id: 'thread-broadcast',
      audience: 'all_parents',
      require_rsvp: true,
      message: 'Broadcast sent to all_parents.',
    });

    const result = await tool.execute(
      {
        subject: 'Parent Meeting RSVP',
        body: 'Please confirm whether you will attend the parent meeting.',
        audience: 'all_parents',
        channel_mode: 'announcement_channel',
        require_rsvp: true,
      },
      {
        role: 'principal',
        userId: 'user-1',
        organizationId: 'org-1',
        supabaseClient: {},
      },
    );

    expect(sendBroadcastMessageMock).toHaveBeenCalledWith({
      organizationId: 'org-1',
      senderId: 'user-1',
      senderRole: 'principal',
      subject: 'Parent Meeting RSVP',
      body: 'Please confirm whether you will attend the parent meeting.',
      audience: 'all_parents',
      channelMode: 'announcement_channel',
      allowReplies: false,
      requireRsvp: true,
      supabase: {},
    });
    expect(result).toMatchObject({
      success: true,
      thread_id: 'thread-broadcast',
      require_rsvp: true,
    });
  });

  it('summarizes RSVP responses for a named broadcast thread', async () => {
    const tool = getTool('summarize_broadcast_rsvp');
    summarizeBroadcastRsvpMock.mockResolvedValue({
      success: true,
      thread_id: 'thread-broadcast',
      attending_count: 12,
      guest_count: 4,
      message: 'RSVP summary ready.',
    });

    const result = await tool.execute(
      {
        subject: 'Parent Meeting RSVP',
      },
      {
        role: 'principal',
        userId: 'user-1',
        organizationId: 'org-1',
        supabaseClient: {},
      },
    );

    expect(summarizeBroadcastRsvpMock).toHaveBeenCalledWith({
      organizationId: 'org-1',
      senderId: 'user-1',
      subject: 'Parent Meeting RSVP',
      threadName: undefined,
      supabase: {},
    });
    expect(result).toMatchObject({
      success: true,
      thread_id: 'thread-broadcast',
      attending_count: 12,
      guest_count: 4,
    });
  });
});
