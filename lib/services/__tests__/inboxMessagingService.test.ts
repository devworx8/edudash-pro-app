import {
  buildBroadcastThreadName,
  summarizeRsvpActivity,
} from '@/lib/services/inboxMessagingService';

describe('inboxMessagingService', () => {
  it('uses the subject to create a dedicated RSVP thread name', () => {
    expect(
      buildBroadcastThreadName(
        'all_parents',
        'announcement_channel',
        'Important: Parent Meeting Date Change',
        true,
      ),
    ).toBe('RSVP • Important: Parent Meeting Date Change');
  });

  it('uses the subject to create a dedicated one-way broadcast thread name', () => {
    expect(
      buildBroadcastThreadName(
        'all_teachers',
        'announcement_channel',
        'Staff briefing moved to Thursday',
        false,
      ),
    ).toBe('Teacher Update • Staff briefing moved to Thursday');
  });

  it('falls back to the generic thread names when no subject is provided', () => {
    expect(buildBroadcastThreadName('all_parents', 'announcement_channel')).toBe('Parent Updates');
    expect(buildBroadcastThreadName('everyone', 'parent_group')).toBe('School RSVP Broadcasts');
  });

  it('summarizes RSVP replies, reactions, and guest totals from a dedicated thread', () => {
    expect(
      summarizeRsvpActivity({
        recipientIds: ['parent-1', 'parent-2', 'parent-3'],
        organizerId: 'principal-1',
        rootMessageId: 'root-1',
        messages: [
          { id: 'root-1', sender_id: 'principal-1', content: 'Please RSVP for Thursday.' },
          { id: 'reply-1', sender_id: 'parent-2', content: 'Maybe, still checking transport.' },
          { id: 'reply-2', sender_id: 'parent-3', content: 'Yes, attending with 2 guests.' },
        ],
        reactions: [
          { message_id: 'root-1', user_id: 'parent-1', emoji: '✅' },
        ],
      }),
    ).toEqual({
      recipient_count: 3,
      responded_count: 3,
      attending_count: 2,
      declined_count: 0,
      maybe_count: 1,
      no_response_count: 0,
      guest_count: 2,
      expected_people_count: 4,
    });
  });
});
