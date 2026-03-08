import { useState, useCallback } from 'react';
import { Linking, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { assertSupabase } from '@/lib/supabase';
import { TeacherInviteService } from '@/lib/services/teacherInviteService';
import {
  buildTeacherInviteLink,
  buildTeacherInviteMessage,
} from '@/lib/utils/teacherInviteLink';
import { removeTeacherFromSchool } from '@/lib/services/teacherRemovalService';

export interface InviteShareData {
  token: string;
  email: string;
  link: string;
  message: string;
}

interface UseTeacherInvitesOptions {
  getPreschoolId: () => string | null | undefined;
  userId: string | undefined;
  schoolName: string;
  inviterName: string;
  invites: any[];
  loadInvites: () => Promise<void>;
  fetchTeachers: () => Promise<void>;
  showAlert: (opts: any) => void;
}

export function useTeacherInvites(opts: UseTeacherInvitesOptions) {
  const {
    getPreschoolId, userId, schoolName, inviterName,
    invites, loadInvites, fetchTeachers, showAlert,
  } = opts;

  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteShare, setInviteShare] = useState<InviteShareData | null>(null);
  const [showInviteShareModal, setShowInviteShareModal] = useState(false);

  const closeInviteShareModal = useCallback(() => {
    setShowInviteShareModal(false);
    setInviteShare(null);
  }, []);

  const handleShareInvite = useCallback(async (token: string, email: string) => {
    try {
      const link = buildTeacherInviteLink(token, email);
      const message = buildTeacherInviteMessage({
        token, email, schoolName, inviterName, roleLabel: 'teacher',
      });
      setInviteShare({ token, email, link, message });
      setShowInviteShareModal(true);
    } catch {
      showAlert({ title: 'Share Error', message: 'Could not prepare invite for sharing.', type: 'error' });
    }
  }, [schoolName, inviterName, showAlert]);

  const handleInviteTeacher = useCallback(async (email: string) => {
    const e = email.trim().toLowerCase();
    const schoolId = getPreschoolId();
    if (!schoolId) { showAlert({ title: 'Error', message: 'No school associated.', type: 'error' }); return; }
    if (!e || !e.includes('@')) { showAlert({ title: 'Invalid Email', message: 'Please enter a valid email address.', type: 'warning' }); return; }
    setInviteLoading(true);
    try {
      const { TeacherInviteService } = await import('@/lib/services/teacherInviteService');
      const invite = await TeacherInviteService.createInvite({ schoolId, email: e, invitedBy: userId || '' });
      await loadInvites();
      try {
        const inviteLink = buildTeacherInviteLink(invite.token, e);
        const msg = buildTeacherInviteMessage({ token: invite.token, email: e, schoolName, inviterName, roleLabel: 'teacher' });
        await assertSupabase().functions.invoke('send-email', {
          body: {
            to: e,
            subject: `EduDash Pro teacher invite from ${schoolName}`,
            body: buildInviteEmailHtml(schoolName, inviterName, inviteLink, invite.token, e, msg),
            confirmed: true,
            is_html: true,
          },
        });
      } catch {
        showAlert({ title: 'Email Failed', message: 'Invite created, but email delivery failed. Share the link manually.', type: 'warning' });
      }
      await handleShareInvite(invite.token, e);
    } catch (err: unknown) {
      showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to create invite', type: 'error' });
    } finally { setInviteLoading(false); }
  }, [getPreschoolId, userId, schoolName, inviterName, loadInvites, showAlert, handleShareInvite]);

  const handleCopyInviteLink = useCallback(async () => {
    try {
      const existing = invites.find((inv: any) => inv.status === 'pending' && inv.token);
      let token: string;
      let email: string;
      if (existing) {
        token = existing.token;
        email = existing.email || 'general@invite.edudashpro.co.za';
      } else {
        const schoolId = getPreschoolId();
        if (!schoolId) { showAlert({ title: 'Error', message: 'No school associated.', type: 'error' }); return; }
        const { TeacherInviteService } = await import('@/lib/services/teacherInviteService');
        email = 'general@invite.edudashpro.co.za';
        const inv = await TeacherInviteService.createInvite({ schoolId, email, invitedBy: userId || '' });
        token = inv.token;
        await loadInvites();
      }
      await Clipboard.setStringAsync(buildTeacherInviteLink(token, email));
      showAlert({ title: 'Link Copied', message: 'Teacher invite link copied to clipboard.', type: 'success' });
    } catch (err: unknown) {
      showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to copy invite link', type: 'error' });
    }
  }, [invites, getPreschoolId, userId, loadInvites, showAlert]);

  const handleDeleteInvite = useCallback(async (inviteId: string) => {
    showAlert({
      title: 'Delete Invite', message: 'Are you sure you want to delete this invite?', type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await TeacherInviteService.deleteInvite(inviteId, { schoolId: getPreschoolId() });
            await loadInvites();
            showAlert({ title: 'Deleted', message: 'Invite has been removed.', type: 'success' });
          } catch (err: unknown) {
            showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to delete invite', type: 'error' });
          }
        }},
      ],
    });
  }, [getPreschoolId, loadInvites, showAlert]);

  const handleDeleteTeacher = useCallback(async (
    teacherRecordId: string,
    teacherName: string,
    teacherUserId?: string | null,
  ) => {
    showAlert({
      title: 'Archive Teacher',
      message: `Archive ${teacherName} from your school? They will be hidden from active lists but retained in history.`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: async () => {
          try {
            const schoolId = getPreschoolId();
            if (!schoolId) return;
            await removeTeacherFromSchool({
              teacherRecordId,
              organizationId: schoolId,
              teacherUserId: teacherUserId || null,
              reason: 'Archived via teacher management',
            });
            showAlert({ title: 'Archived', message: `${teacherName} has been archived.`, type: 'success' });
            await fetchTeachers();
          } catch (err: unknown) {
            showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to archive teacher', type: 'error' });
          }
        }},
      ],
    });
  }, [getPreschoolId, fetchTeachers, showAlert]);

  const handleInviteShareAction = useCallback(async (action: string) => {
    if (!inviteShare) return;
    const { link, message, token, email } = inviteShare;
    try {
      switch (action) {
        case 'whatsapp': {
          const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
          if (await Linking.canOpenURL(url)) await Linking.openURL(url);
          else showAlert({ title: 'WhatsApp Not Available', message: 'WhatsApp is not installed on this device.', type: 'warning' });
          break;
        }
        case 'sms': await Linking.openURL(`sms:?body=${encodeURIComponent(message)}`); break;
        case 'email': await Linking.openURL(`mailto:${email}?subject=${encodeURIComponent('Teacher Invite')}&body=${encodeURIComponent(message)}`); break;
        case 'share': await Share.share({ message, url: link }); break;
        case 'copyLink': await Clipboard.setStringAsync(link); showAlert({ title: 'Copied', message: 'Link copied.', type: 'success' }); break;
        case 'copyCode': await Clipboard.setStringAsync(token); showAlert({ title: 'Copied', message: 'Code copied.', type: 'success' }); break;
      }
    } catch { showAlert({ title: 'Error', message: 'Failed to share invite.', type: 'error' }); }
  }, [inviteShare, showAlert]);

  return {
    inviteLoading, inviteShare, showInviteShareModal, closeInviteShareModal,
    handleShareInvite, handleInviteTeacher, handleCopyInviteLink,
    handleDeleteInvite, handleDeleteTeacher, handleInviteShareAction,
  };
}

function buildInviteEmailHtml(
  schoolName: string, inviterName: string, inviteLink: string,
  token: string, email: string, message: string,
): string {
  return `<div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
  <h2 style="color: #4f46e5; margin-bottom: 8px;">You're invited to join ${schoolName}</h2>
  <p>${inviterName} invited you to join EduDash Pro as a teacher.</p>
  <p>Open in the app:</p>
  <p style="margin: 16px 0;">
    <a href="${inviteLink}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-weight: 600;">Accept Teacher Invite</a>
  </p>
  <p>Invite token: <strong>${token}</strong><br/>Email: <strong>${email}</strong></p>
  <p style="font-size: 12px; color: #64748b;">If the button doesn't open the app, install EduDash Pro and enter the token on "Accept Teacher Invite".</p>
  <p style="font-size: 12px; color: #94a3b8; margin-top: 12px;">${message.replace(/\n/g, '<br/>')}</p>
</div>`;
}
