export type GroupCreationType =
  | 'class_group'
  | 'parent_group'
  | 'announcement'
  | 'parent_dm';

export type GroupAudience =
  | 'all_parents'
  | 'all_teachers'
  | 'all_staff'
  | 'everyone';

interface GroupCreationContext {
  groupType: GroupCreationType | null;
  audience?: GroupAudience;
  className?: string | null;
  allowReplies?: boolean;
}

export interface GroupCreationCopy {
  namePlaceholder: string;
  descriptionPlaceholder: string;
  nameSuggestions: string[];
  descriptionSuggestions: string[];
}

export interface ReplyPolicyCopy {
  title: string;
  body: string;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function audienceLabel(audience: GroupAudience): string {
  switch (audience) {
    case 'all_parents':
      return 'parents';
    case 'all_teachers':
      return 'teachers';
    case 'all_staff':
      return 'staff';
    case 'everyone':
      return 'the whole school community';
    default:
      return 'parents';
  }
}

function announcementNames(audience: GroupAudience): string[] {
  switch (audience) {
    case 'all_teachers':
      return ['Staff Briefing', 'Teaching Updates', 'Timetable Notices'];
    case 'all_staff':
      return ['Staff Updates', 'Operations Notices', 'Team Bulletin'];
    case 'everyone':
      return ['School Announcements', 'Campus Alerts', 'Community Notices'];
    case 'all_parents':
    default:
      return ['School Updates', 'Principal Notices', 'Events & Reminders'];
  }
}

function announcementDescriptions(audience: GroupAudience): string[] {
  const audienceText = audienceLabel(audience);
  return unique([
    `Official one-way updates for ${audienceText}.`,
    `Important notices, reminders, and schedule changes for ${audienceText}.`,
    audience === 'everyone'
      ? 'School-wide announcements, urgent alerts, and key operational updates.'
      : '',
  ]);
}

export function getGroupCreationCopy({
  groupType,
  audience = 'all_parents',
  className,
  allowReplies = true,
}: GroupCreationContext): GroupCreationCopy {
  if (groupType === 'class_group') {
    return {
      namePlaceholder: className ? `e.g. ${className} Parents` : 'e.g. Grade 1 Parents',
      descriptionPlaceholder: 'Optional note about how this class group will be used',
      nameSuggestions: unique([
        className ? `${className} Parents` : '',
        className ? `${className} Family Updates` : '',
        className ? `${className} Home & School` : '',
      ]),
      descriptionSuggestions: unique([
        className ? `Updates, reminders, and coordination for ${className} families.` : '',
        className ? `Class notices, homework reminders, and event planning for ${className}.` : '',
      ]),
    };
  }

  if (groupType === 'parent_group') {
    return {
      namePlaceholder: 'e.g. Fundraising Committee',
      descriptionPlaceholder: 'What is this parent group for?',
      nameSuggestions: [
        'Fundraising Committee',
        'School Trip Parents',
        'Transport Coordination',
      ],
      descriptionSuggestions: unique([
        allowReplies
          ? 'Parents can discuss updates, planning, and questions in this group.'
          : 'Read-only updates from the school team for this parent group.',
        'Coordination space for reminders, logistics, and parent support.',
        'Use this group for focused communication around one activity or topic.',
      ]),
    };
  }

  if (groupType === 'announcement') {
    return {
      namePlaceholder: announcementNames(audience)[0],
      descriptionPlaceholder: 'What will this channel be used to announce?',
      nameSuggestions: announcementNames(audience),
      descriptionSuggestions: announcementDescriptions(audience),
    };
  }

  return {
    namePlaceholder: 'Enter a group name',
    descriptionPlaceholder: 'Add an optional description',
    nameSuggestions: [],
    descriptionSuggestions: [],
  };
}

export function getReplyPolicyCopy({
  groupType,
  allowReplies = true,
}: Pick<GroupCreationContext, 'groupType' | 'allowReplies'>): ReplyPolicyCopy | null {
  if (groupType === 'parent_group') {
    return allowReplies
      ? {
          title: 'Parents can reply',
          body: 'Selected parents will be able to send messages in this group. The creator remains an admin.',
        }
      : {
          title: 'Admins only can send',
          body: 'Parents will be read-only. The principal or other group admins can still post updates.',
        };
  }

  if (groupType === 'announcement') {
    return {
      title: 'One-way announcement channel',
      body: 'Audience members can read updates, but only principals and admins can send messages here.',
    };
  }

  return null;
}
