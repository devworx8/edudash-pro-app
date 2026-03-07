import { getEduDashWebBaseUrl } from '@/lib/config/urls';

const APP_SCHEME = 'edudashpro';
const DEFAULT_WEB_URL = getEduDashWebBaseUrl();
export const TEACHER_INVITE_DEEP_LINK = (token: string, email: string): string => {
  const safeToken = encodeURIComponent(token);
  const safeEmail = encodeURIComponent(email);
  // Use triple-slash to avoid treating the first path segment as hostname on Android.
  return `${APP_SCHEME}:///screens/teacher-invite-accept?token=${safeToken}&email=${safeEmail}`;
};

interface BuildTeacherInviteMessageInput {
  token: string;
  email: string;
  schoolName?: string | null;
  inviterName?: string | null;
  roleLabel?: string | null;
}

export const buildTeacherInviteLink = (token: string, email: string): string => {
  const safeToken = encodeURIComponent(token);
  const safeEmail = encodeURIComponent(email);
  return `${DEFAULT_WEB_URL}/invite/teacher?token=${safeToken}&email=${safeEmail}`;
};

export const buildTeacherInviteMessage = ({
  token,
  email,
  schoolName,
  inviterName,
  roleLabel,
}: BuildTeacherInviteMessageInput): string => {
  const inviteLink = buildTeacherInviteLink(token, email);
  const schoolLabel = schoolName || 'your school';
  const role = roleLabel || 'teacher';
  const inviterLine = inviterName ? `Invited by: ${inviterName}\n` : '';

  return (
    `You're invited to join ${schoolLabel} on EduDash Pro as a ${role}.\n\n` +
    `${inviterLine}` +
    `Open the invite link: ${inviteLink}\n` +
    `Invite token: ${token}\n` +
    `Email: ${email}\n\n` +
    `If the app doesn't open, install EduDash Pro (${DEFAULT_WEB_URL}) and enter the token on "Accept ${role} Invite".`
  );
};
