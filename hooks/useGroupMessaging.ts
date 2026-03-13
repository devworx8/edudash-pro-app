/**
 * Group Messaging Hook
 * 
 * Provides group creation, management, and parent-to-parent messaging.
 * Uses Supabase RPC functions for group operations.
 * 
 * Supports:
 * - Class group creation (auto-adds all parents + teacher)
 * - Custom parent group creation
 * - Announcement channel creation
 * - Parent-to-parent direct messaging
 * - Group participant management
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assertSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────────

export interface GroupThread {
  id: string;
  preschool_id: string;
  group_name: string;
  group_type: 'class_group' | 'parent_group' | 'teacher_group' | 'announcement' | 'custom';
  group_description?: string;
  is_group: boolean;
  allow_replies: boolean;
  class_id?: string;
  created_by: string;
  created_at: string;
  participant_count?: number;
}

export interface OrgMember {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  role: string;
  avatar_url?: string;
  display_name: string;
  initials: string;
}

interface GroupParticipantMutationArgs {
  threadId: string;
}

export interface ClassInfo {
  id: string;
  name: string;
  teacher_id: string;
  student_count?: number;
  parent_count?: number;
}

const normalizeMemberText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export function buildOrgMemberDisplayName(member: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  const fullName = `${normalizeMemberText(member.first_name)} ${normalizeMemberText(member.last_name)}`.trim();
  if (fullName) return fullName;
  return normalizeMemberText(member.email);
}

export function buildOrgMemberInitials(member: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  display_name?: string | null;
}): string {
  const first = normalizeMemberText(member.first_name);
  const last = normalizeMemberText(member.last_name);
  const initials = `${first.charAt(0)}${last.charAt(0)}`.trim();
  if (initials) return initials.toUpperCase();

  const displayName = normalizeMemberText(member.display_name);
  if (displayName) return displayName.charAt(0).toUpperCase();

  const email = normalizeMemberText(member.email);
  if (email) return email.charAt(0).toUpperCase();

  return '?';
}

// ─── Fetch org members (same school) ──────────────────────────────

export const useOrgMembers = (roleFilter?: string[]) => {
  const { user, profile } = useAuth();
  const preschoolId = (profile as any)?.preschool_id;
  const organizationId = (profile as any)?.organization_id;
  const orgId = preschoolId || organizationId;

  return useQuery({
    queryKey: ['org-members', orgId, roleFilter],
    queryFn: async (): Promise<OrgMember[]> => {
      if (!orgId) return [];
      const client = assertSupabase();

      let query = client
        .from('profiles')
        .select('id, first_name, last_name, email, role, avatar_url, is_active')
        .neq('id', user?.id || '')
        .neq('is_active', false);

      if (preschoolId) {
        query = query.eq('preschool_id', preschoolId);
      } else if (organizationId) {
        query = query.eq('organization_id', organizationId);
      } else {
        return [];
      }

      if (roleFilter && roleFilter.length > 0) {
        query = query.in('role', roleFilter);
      }

      const { data, error } = await query;
      if (error) {
        logger.warn('useOrgMembers', 'Error:', error.message);
        return [];
      }

      let linkedParentIds = new Set<string>();
      if (!roleFilter || roleFilter.includes('parent')) {
        let studentQuery = client.from('students').select('parent_id, guardian_id');
        if (preschoolId) {
          studentQuery = studentQuery.eq('preschool_id', preschoolId);
        } else if (organizationId) {
          studentQuery = studentQuery.eq('organization_id', organizationId);
        }

        const { data: studentLinks, error: studentError } = await studentQuery;
        if (studentError) {
          logger.warn('useOrgMembers', 'Student link lookup error:', studentError.message);
        } else {
          linkedParentIds = new Set(
            (studentLinks || []).flatMap((student: any) => [
              normalizeMemberText(student.parent_id),
              normalizeMemberText(student.guardian_id),
            ]).filter(Boolean),
          );
        }
      }

      const normalizedMembers = (data || [])
        .map((row: any) => {
          const first_name = normalizeMemberText(row.first_name);
          const last_name = normalizeMemberText(row.last_name);
          const email = normalizeMemberText(row.email);
          const role = normalizeMemberText(row.role).toLowerCase();
          const display_name = buildOrgMemberDisplayName({ first_name, last_name, email });

          return {
            id: row.id,
            first_name,
            last_name,
            email: email || undefined,
            role,
            avatar_url: row.avatar_url || undefined,
            display_name,
            initials: buildOrgMemberInitials({ first_name, last_name, email, display_name }),
            linkedToLearner: linkedParentIds.has(row.id),
          };
        })
        .filter((member) => {
          if (!member.display_name) return false;
          if (member.role !== 'parent') return true;
          return member.linkedToLearner || Boolean(member.email);
        })
        .sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }))
        .map(({ linkedToLearner, ...member }) => member);

      return normalizedMembers as OrgMember[];
    },
    enabled: !!orgId && !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 min
  });
};

// ─── Fetch classes in org ─────────────────────────────────────────

export const useOrgClasses = () => {
  const { profile } = useAuth();
  const preschoolId = (profile as any)?.preschool_id;
  const organizationId = (profile as any)?.organization_id;
  const orgId = preschoolId || organizationId;

  return useQuery({
    queryKey: ['org-classes', orgId],
    queryFn: async (): Promise<ClassInfo[]> => {
      if (!orgId) return [];
      const client = assertSupabase();

      let query = client
        .from('classes')
        .select('id, name, teacher_id, students(count)')
        .or('active.eq.true,active.is.null')
        .order('name');

      if (preschoolId) {
        query = query.eq('preschool_id', preschoolId);
      } else if (organizationId) {
        query = query.eq('organization_id', organizationId);
      } else {
        return [];
      }

      const { data, error } = await query;

      if (error) {
        logger.warn('useOrgClasses', 'Error:', error.message);
        return [];
      }
      return (data || []).map((cls: any) => ({
        id: cls.id,
        name: cls.name,
        teacher_id: cls.teacher_id,
        student_count: cls.students?.[0]?.count ?? 0,
        parent_count: cls.students?.[0]?.count ?? 0, // ~1 parent per student
      })) as ClassInfo[];
    },
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
  });
};

// ─── Create class group ───────────────────────────────────────────

export const useCreateClassGroup = () => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const orgId = (profile as any)?.preschool_id || (profile as any)?.organization_id;

  return useMutation({
    mutationFn: async ({ classId, groupName }: { classId: string; groupName?: string }) => {
      if (!orgId) throw new Error('No organization');
      const client = assertSupabase();
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await client.rpc('create_class_group', {
        p_class_id: classId,
        p_preschool_id: orgId,
        p_created_by: user.id,
        p_group_name: groupName || null,
      });

      if (error) throw error;
      return data as string; // thread_id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'threads'] });
    },
  });
};

// ─── Create custom parent group ───────────────────────────────────

export const useCreateParentGroup = () => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const orgId = (profile as any)?.preschool_id || (profile as any)?.organization_id;

  return useMutation({
    mutationFn: async ({
      groupName,
      parentIds,
      description,
      allowReplies = true,
    }: {
      groupName: string;
      parentIds: string[];
      description?: string;
      allowReplies?: boolean;
    }) => {
      if (!orgId) throw new Error('No organization');
      const client = assertSupabase();
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await client.rpc('create_parent_group', {
        p_preschool_id: orgId,
        p_created_by: user.id,
        p_group_name: groupName,
        p_parent_ids: parentIds,
        p_description: description || null,
        p_allow_replies: allowReplies,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'threads'] });
    },
  });
};

// ─── Create announcement channel ─────────────────────────────────

export const useCreateAnnouncementChannel = () => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const orgId = (profile as any)?.preschool_id || (profile as any)?.organization_id;

  return useMutation({
    mutationFn: async ({
      channelName,
      description,
      audience = 'all_parents',
    }: {
      channelName: string;
      description?: string;
      audience?: 'all_parents' | 'all_teachers' | 'all_staff' | 'everyone';
    }) => {
      if (!orgId) throw new Error('No organization');
      const client = assertSupabase();
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await client.rpc('create_announcement_channel', {
        p_preschool_id: orgId,
        p_created_by: user.id,
        p_channel_name: channelName,
        p_description: description || null,
        p_audience: audience,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'threads'] });
    },
  });
};

// ─── Create or get parent-to-parent DM thread ────────────────────

export const useCreateParentThread = () => {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const orgId = (profile as any)?.preschool_id || (profile as any)?.organization_id;

  return useMutation({
    mutationFn: async ({ otherParentId }: { otherParentId: string }) => {
      if (!user?.id || !orgId) throw new Error('Not authenticated');
      const client = assertSupabase();

      // Check if a parent-parent thread already exists between these two users
      const { data: existingParticipations } = await client
        .from('message_participants')
        .select('thread_id')
        .eq('user_id', user.id);

      if (existingParticipations && existingParticipations.length > 0) {
        const threadIds = existingParticipations.map(p => p.thread_id);

        // Find threads where the other parent is also a participant
        // and the thread is a parent-parent type (not a group)
        const { data: sharedThreads } = await client
          .from('message_participants')
          .select('thread_id')
          .eq('user_id', otherParentId)
          .in('thread_id', threadIds);

        if (sharedThreads && sharedThreads.length > 0) {
          // Check if any of these is a parent-parent DM (not group)
          const { data: dmThread } = await client
            .from('message_threads')
            .select('id')
            .in('id', sharedThreads.map(s => s.thread_id))
            .eq('type', 'parent-parent')
            .eq('is_group', false)
            .maybeSingle();

          if (dmThread) return dmThread.id;
        }
      }

      // Get other parent's name for the subject
      const { data: otherProfile } = await client
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', otherParentId)
        .maybeSingle();

      const otherName = otherProfile
        ? `${otherProfile.first_name || ''} ${otherProfile.last_name || ''}`.trim()
        : 'Parent';

      // Create new parent-parent thread
      const { data: thread, error } = await client
        .from('message_threads')
        .insert({
          preschool_id: orgId,
          created_by: user.id,
          subject: otherName,
          type: 'parent-parent',
          is_group: false,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Add both participants
      await client.from('message_participants').insert([
        { thread_id: thread.id, user_id: user.id, role: 'parent' },
        { thread_id: thread.id, user_id: otherParentId, role: 'parent' },
      ]);

      return thread.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
    },
  });
};

// ─── Toggle replies for existing groups ──────────────────────────

export const useUpdateGroupReplyPolicy = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      threadId,
      allowReplies,
    }: GroupParticipantMutationArgs & {
      allowReplies: boolean;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const client = assertSupabase();
      const { data, error } = await client.rpc('set_group_reply_policy', {
        p_thread_id: threadId,
        p_allow_replies: allowReplies,
        p_updated_by: user.id,
      });

      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'threads'] });
    },
  });
};

// ─── Add members to an existing group ────────────────────────────

export const useAddGroupParticipants = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      threadId,
      userIds,
    }: GroupParticipantMutationArgs & {
      userIds: string[];
    }) => {
      if (!user?.id) throw new Error('Not authenticated');
      if (userIds.length === 0) return true;

      const client = assertSupabase();
      const { data, error } = await client.rpc('add_group_participants', {
        p_thread_id: threadId,
        p_user_ids: userIds,
        p_added_by: user.id,
      });

      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'threads'] });
    },
  });
};

// ─── Remove a participant from an existing group ─────────────────

export const useRemoveGroupParticipant = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      threadId,
      userId,
    }: GroupParticipantMutationArgs & {
      userId: string;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const client = assertSupabase();
      const { data, error } = await client.rpc('remove_group_participant', {
        p_thread_id: threadId,
        p_user_id: userId,
        p_removed_by: user.id,
      });

      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parent', 'threads'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'threads'] });
    },
  });
};
