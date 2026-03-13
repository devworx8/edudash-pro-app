import {
  getGroupCreationCopy,
  getReplyPolicyCopy,
} from '@/lib/messaging/groupCreationSuggestions';

describe('groupCreationSuggestions', () => {
  it('uses the selected class name in class group suggestions', () => {
    const copy = getGroupCreationCopy({
      groupType: 'class_group',
      className: 'Panda',
    });

    expect(copy.namePlaceholder).toBe('e.g. Panda Parents');
    expect(copy.nameSuggestions).toContain('Panda Parents');
  });

  it('adjusts announcement suggestions by audience', () => {
    const copy = getGroupCreationCopy({
      groupType: 'announcement',
      audience: 'all_staff',
    });

    expect(copy.nameSuggestions).toEqual([
      'Staff Updates',
      'Operations Notices',
      'Team Bulletin',
    ]);
  });

  it('explains when parent groups are read only', () => {
    const policy = getReplyPolicyCopy({
      groupType: 'parent_group',
      allowReplies: false,
    });

    expect(policy).toEqual({
      title: 'Admins only can send',
      body: 'Parents will be read-only. The principal or other group admins can still post updates.',
    });
  });
});
