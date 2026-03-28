import { assertSupabase } from '@/lib/supabase';
import { getSenderDisplayName, sendMessagePushNotification } from '@/lib/messaging/pushNotifications';

type SupabaseLike = ReturnType<typeof assertSupabase>;

type RecipientRole = 'parent' | 'teacher';
type BroadcastAudience = 'all_parents' | 'all_teachers' | 'all_staff' | 'everyone';
type BroadcastChannelMode = 'announcement_channel' | 'parent_group';
type RsvpStatus = 'attending' | 'not_attending' | 'maybe' | 'no_response';

type ParentCandidate = {
  userId: string;
  displayName: string;
  studentId: string | null;
  studentName: string | null;
};

type TeacherCandidate = {
  userId: string;
  displayName: string;
};

type ThreadParticipant = {
  user_id: string;
  role?: string | null;
};

type ThreadRow = {
  id: string;
  student_id?: string | null;
  message_participants?: ThreadParticipant[] | null;
};

export interface SendDirectInboxMessageInput {
  organizationId: string;
  senderId: string;
  senderRole: string;
  recipientName: string;
  body: string;
  subject?: string;
  recipientRole?: RecipientRole;
  studentName?: string;
  supabase?: SupabaseLike | null;
}

export interface SendBroadcastInboxMessageInput {
  organizationId: string;
  senderId: string;
  senderRole: string;
  subject: string;
  body: string;
  audience?: BroadcastAudience;
  channelMode?: BroadcastChannelMode;
  allowReplies?: boolean;
  requireRsvp?: boolean;
  supabase?: SupabaseLike | null;
}

export interface SummarizeBroadcastRsvpInput {
  organizationId: string;
  senderId?: string;
  subject?: string;
  threadName?: string;
  supabase?: SupabaseLike | null;
}

type RsvpMessageRow = {
  id: string;
  sender_id: string;
  content: string;
  reply_to_id?: string | null;
  created_at?: string | null;
};

type RsvpReactionRow = {
  message_id: string;
  user_id: string;
  emoji: string;
};

type RsvpThreadLookupRow = {
  id: string;
  created_by?: string | null;
  group_name?: string | null;
  group_type?: string | null;
  last_message_at?: string | null;
};

function getClient(client?: SupabaseLike | null): SupabaseLike {
  return client || assertSupabase();
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDisplayName(firstName?: unknown, lastName?: unknown, email?: unknown): string {
  const name = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
  return name || String(email || '').trim();
}

function matchesSearch(query: string, ...haystacks: Array<string | null | undefined>): boolean {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return false;
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (tokens.length === 0) return false;
  const haystack = normalizeText(haystacks.filter(Boolean).join(' '));
  return tokens.every((token) => haystack.includes(token));
}

function normalizeRecipientRole(value?: unknown): RecipientRole {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'teacher' || normalized === 'staff') {
    return 'teacher';
  }
  return 'parent';
}

function normalizeParticipantRole(value?: unknown): 'principal' | 'teacher' {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'teacher' ? 'teacher' : 'principal';
}

function normalizeBroadcastAudience(value?: unknown): BroadcastAudience {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'all_teachers') return 'all_teachers';
  if (normalized === 'all_staff') return 'all_staff';
  if (normalized === 'everyone' || normalized === 'all') return 'everyone';
  return 'all_parents';
}

function normalizeBroadcastChannelMode(value?: unknown): BroadcastChannelMode {
  return String(value || '').trim().toLowerCase() === 'parent_group'
    ? 'parent_group'
    : 'announcement_channel';
}

function getAudienceFilter(organizationId: string): string {
  return `preschool_id.eq.${organizationId},organization_id.eq.${organizationId}`;
}

function sanitizeThreadNamePart(value?: string): string {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > 72 ? `${normalized.slice(0, 69).trim()}...` : normalized;
}

export function buildBroadcastThreadName(
  audience: BroadcastAudience,
  mode: BroadcastChannelMode,
  subject?: string,
  requireRsvp?: boolean,
): string {
  const normalizedSubject = sanitizeThreadNamePart(subject);
  if (normalizedSubject) {
    if (requireRsvp || mode === 'parent_group') {
      return `RSVP • ${normalizedSubject}`;
    }

    switch (audience) {
      case 'all_teachers':
        return `Teacher Update • ${normalizedSubject}`;
      case 'all_staff':
        return `Staff Update • ${normalizedSubject}`;
      case 'everyone':
        return `School Update • ${normalizedSubject}`;
      case 'all_parents':
      default:
        return `Parent Update • ${normalizedSubject}`;
    }
  }

  if (mode === 'parent_group') {
    return audience === 'everyone' ? 'School RSVP Broadcasts' : 'Parent RSVP Broadcasts';
  }

  switch (audience) {
    case 'all_teachers':
      return 'Teacher Updates';
    case 'all_staff':
      return 'Staff Updates';
    case 'everyone':
      return 'School Updates';
    case 'all_parents':
    default:
      return 'Parent Updates';
  }
}

function buildRsvpMessage(body: string): string {
  return [
    body.trim(),
    '',
    'RSVP:',
    'React with ✅ if attending, ❌ if not attending, or ❔ if maybe.',
    'If you are bringing visitors, reply with how many guests you expect.',
  ].join('\n');
}

function mapReactionToRsvpStatus(emoji?: string | null): RsvpStatus | null {
  const normalized = String(emoji || '').trim();
  if (normalized === '✅') return 'attending';
  if (normalized === '❌') return 'not_attending';
  if (normalized === '❔' || normalized === '🤔') return 'maybe';
  return null;
}

function extractRsvpStatusFromText(content?: string | null): RsvpStatus | null {
  const normalized = String(content || '').trim().toLowerCase();
  if (!normalized) return null;
  if (
    /\b(no|not attending|cannot attend|can't attend|unable to attend|won't attend|will not attend|not coming|decline|declined)\b/i.test(normalized)
  ) {
    return 'not_attending';
  }
  if (/\b(maybe|not sure|unsure|tentative)\b/i.test(normalized)) {
    return 'maybe';
  }
  if (
    /\b(yes|attend|attending|coming|we will be there|we'll be there|confirm|confirmed|i will be there|i'll be there)\b/i.test(normalized)
  ) {
    return 'attending';
  }
  return null;
}

function extractGuestCountFromText(content?: string | null): number | null {
  const normalized = String(content || '').trim().toLowerCase();
  if (!normalized) return null;

  const patterns = [
    /\b(?:guest|guests|visitor|visitors)\D{0,12}(\d{1,2})\b/i,
    /\bbringing\D{0,12}(\d{1,2})\b/i,
    /\bwith\D{0,12}(\d{1,2})\D{0,12}(?:guest|guests|visitor|visitors)\b/i,
    /\b(\d{1,2})\D{0,12}(?:guest|guests|visitor|visitors)\b/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  }

  if (/\bno guests?\b/i.test(normalized) || /\bno visitors?\b/i.test(normalized)) {
    return 0;
  }

  return null;
}

export function summarizeRsvpActivity(input: {
  recipientIds: string[];
  organizerId: string;
  messages: RsvpMessageRow[];
  reactions: RsvpReactionRow[];
  rootMessageId?: string | null;
}) {
  const recipientIds = Array.from(new Set(input.recipientIds.filter(Boolean)));
  const summaryByUser = new Map<string, { status: RsvpStatus; guestCount: number }>();

  for (const recipientId of recipientIds) {
    summaryByUser.set(recipientId, { status: 'no_response', guestCount: 0 });
  }

  const rootMessageId =
    input.rootMessageId ||
    input.messages.find((message) => message.sender_id === input.organizerId)?.id ||
    input.messages[0]?.id ||
    null;

  if (rootMessageId) {
    for (const reaction of input.reactions) {
      if (reaction.message_id !== rootMessageId) continue;
      if (!summaryByUser.has(reaction.user_id)) continue;
      const status = mapReactionToRsvpStatus(reaction.emoji);
      if (!status) continue;
      const existing = summaryByUser.get(reaction.user_id)!;
      summaryByUser.set(reaction.user_id, { ...existing, status });
    }
  }

  for (const message of input.messages) {
    if (!message.sender_id || message.sender_id === input.organizerId) {
      continue;
    }
    if (!summaryByUser.has(message.sender_id)) {
      continue;
    }

    const existing = summaryByUser.get(message.sender_id)!;
    const parsedStatus = extractRsvpStatusFromText(message.content);
    const parsedGuestCount = extractGuestCountFromText(message.content);
    if (!parsedStatus && parsedGuestCount === null) {
      continue;
    }

    summaryByUser.set(message.sender_id, {
      status: parsedStatus || existing.status,
      guestCount: parsedGuestCount ?? existing.guestCount,
    });
  }

  let attendingCount = 0;
  let declinedCount = 0;
  let maybeCount = 0;
  let noResponseCount = 0;
  let guestCount = 0;
  let respondedCount = 0;

  for (const { status, guestCount: guestTotal } of summaryByUser.values()) {
    if (status === 'attending') {
      attendingCount += 1;
      respondedCount += 1;
      guestCount += guestTotal;
      continue;
    }
    if (status === 'not_attending') {
      declinedCount += 1;
      respondedCount += 1;
      continue;
    }
    if (status === 'maybe') {
      maybeCount += 1;
      respondedCount += 1;
      continue;
    }
    noResponseCount += 1;
  }

  return {
    recipient_count: recipientIds.length,
    responded_count: respondedCount,
    attending_count: attendingCount,
    declined_count: declinedCount,
    maybe_count: maybeCount,
    no_response_count: noResponseCount,
    guest_count: guestCount,
    expected_people_count: attendingCount + guestCount,
  };
}

function buildMessageContent(body: string, subject?: string): string {
  const trimmedBody = body.trim();
  const trimmedSubject = String(subject || '').trim();
  if (!trimmedSubject) return trimmedBody;
  return [`${trimmedSubject}`, '', trimmedBody].join('\n');
}

async function fetchParentCandidates(
  client: SupabaseLike,
  organizationId: string,
): Promise<ParentCandidate[]> {
  const { data: students, error: studentError } = await client
    .from('students')
    .select('id, first_name, last_name, parent_id, guardian_id')
    .or(getAudienceFilter(organizationId))
    .eq('status', 'active')
    .eq('is_active', true);

  if (studentError) {
    throw studentError;
  }

  const parentLinks = new Map<string, ParentCandidate[]>();
  const parentIds = new Set<string>();

  for (const student of students || []) {
    const studentId = String((student as any).id || '').trim() || null;
    const studentName = normalizeDisplayName(
      (student as any).first_name,
      (student as any).last_name,
      null,
    ) || null;
    const linkedIds = [
      String((student as any).parent_id || '').trim(),
      String((student as any).guardian_id || '').trim(),
    ].filter(Boolean);

    for (const linkedId of linkedIds) {
      parentIds.add(linkedId);
      const existing = parentLinks.get(linkedId) || [];
      existing.push({
        userId: linkedId,
        displayName: '',
        studentId,
        studentName,
      });
      parentLinks.set(linkedId, existing);
    }
  }

  if (parentIds.size === 0) {
    return [];
  }

  const { data: profiles, error: profileError } = await client
    .from('profiles')
    .select('id, first_name, last_name, email')
    .in('id', Array.from(parentIds));

  if (profileError) {
    throw profileError;
  }

  const candidates: ParentCandidate[] = [];
  for (const profile of profiles || []) {
    const userId = String((profile as any).id || '').trim();
    const displayName = normalizeDisplayName(
      (profile as any).first_name,
      (profile as any).last_name,
      (profile as any).email,
    );
    for (const linkedStudent of parentLinks.get(userId) || []) {
      candidates.push({
        ...linkedStudent,
        displayName,
      });
    }
  }

  return candidates;
}

async function fetchTeacherCandidates(
  client: SupabaseLike,
  organizationId: string,
): Promise<TeacherCandidate[]> {
  const { data, error } = await client
    .from('profiles')
    .select('id, first_name, last_name, email')
    .or(getAudienceFilter(organizationId))
    .eq('role', 'teacher')
    .neq('is_active', false);

  if (error) {
    throw error;
  }

  return (data || []).map((row: any) => ({
    userId: String(row.id || '').trim(),
    displayName: normalizeDisplayName(row.first_name, row.last_name, row.email),
  }));
}

function dedupeParentCandidates(candidates: ParentCandidate[]): ParentCandidate[] {
  const byUserId = new Map<string, ParentCandidate>();

  for (const candidate of candidates) {
    const existing = byUserId.get(candidate.userId);
    if (!existing) {
      byUserId.set(candidate.userId, candidate);
      continue;
    }

    if (!existing.studentName && candidate.studentName) {
      byUserId.set(candidate.userId, candidate);
    }
  }

  return Array.from(byUserId.values());
}

async function resolveDirectRecipient(
  client: SupabaseLike,
  organizationId: string,
  recipientName: string,
  recipientRole: RecipientRole,
  studentName?: string,
): Promise<
  | { role: 'parent'; userId: string; displayName: string; studentId: string | null; studentName: string | null }
  | { role: 'teacher'; userId: string; displayName: string; studentId: null; studentName: null }
> {
  if (recipientRole === 'teacher') {
    const teachers = await fetchTeacherCandidates(client, organizationId);
    const matches = teachers.filter((candidate) =>
      matchesSearch(recipientName, candidate.displayName),
    );

    if (matches.length === 0) {
      throw new Error(`I could not find a teacher named "${recipientName}".`);
    }
    if (matches.length > 1) {
      throw new Error(`I found multiple teachers matching "${recipientName}". Please be more specific.`);
    }

    return {
      role: 'teacher',
      userId: matches[0].userId,
      displayName: matches[0].displayName,
      studentId: null,
      studentName: null,
    };
  }

  let matches = await fetchParentCandidates(client, organizationId);
  matches = matches.filter((candidate) => matchesSearch(recipientName, candidate.displayName));

  if (studentName) {
    matches = matches.filter((candidate) =>
      matchesSearch(studentName, candidate.studentName || ''),
    );
  }

  if (matches.length === 0) {
    throw new Error(
      studentName
        ? `I could not find a parent named "${recipientName}" linked to "${studentName}".`
        : `I could not find a parent named "${recipientName}". Try including the learner's name.`,
    );
  }

  const uniqueMatches = dedupeParentCandidates(matches);
  if (uniqueMatches.length > 1) {
    const linkedLearners = uniqueMatches
      .map((candidate) => candidate.studentName)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');
    throw new Error(
      linkedLearners
        ? `I found multiple parents matching "${recipientName}". Please include the learner's name, for example: ${linkedLearners}.`
        : `I found multiple parents matching "${recipientName}". Please include the learner's name.`,
    );
  }

  const match = uniqueMatches[0];
  return {
    role: 'parent',
    userId: match.userId,
    displayName: match.displayName,
    studentId: match.studentId,
    studentName: match.studentName,
  };
}

async function findExistingDirectThread(
  client: SupabaseLike,
  organizationId: string,
  type: string,
  participantIds: string[],
  studentId?: string | null,
): Promise<string | null> {
  let query = client
    .from('message_threads')
    .select('id, student_id, message_participants(user_id, role)')
    .eq('preschool_id', organizationId)
    .eq('type', type);

  if (typeof studentId === 'string') {
    query = query.eq('student_id', studentId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const threads = (data || []) as ThreadRow[];
  const match = threads.find((thread) => {
    const ids = new Set((thread.message_participants || []).map((participant) => participant.user_id));
    return participantIds.every((participantId) => ids.has(participantId));
  });

  return match?.id || null;
}

async function createDirectThread(
  client: SupabaseLike,
  input: {
    organizationId: string;
    senderId: string;
    senderRole: string;
    recipientId: string;
    recipientRole: RecipientRole;
    recipientDisplayName: string;
    studentId?: string | null;
    studentName?: string | null;
    subject?: string;
  },
): Promise<string> {
  const threadType = input.recipientRole === 'teacher' ? 'general' : 'parent-principal';
  const participantIds = [input.senderId, input.recipientId];

  const existingId = await findExistingDirectThread(
    client,
    input.organizationId,
    threadType,
    participantIds,
    input.studentId,
  );
  if (existingId) {
    return existingId;
  }

  const subject = input.subject?.trim() || (
    input.recipientRole === 'teacher'
      ? `Teacher • ${input.recipientDisplayName}`
      : `${input.recipientDisplayName}${input.studentName ? ` • ${input.studentName}` : ''}`
  );

  const { data: thread, error: threadError } = await client
    .from('message_threads')
    .insert({
      preschool_id: input.organizationId,
      created_by: input.senderId,
      subject,
      type: threadType,
      student_id: input.studentId ?? null,
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (threadError) {
    throw threadError;
  }

  const senderParticipantRole = normalizeParticipantRole(input.senderRole);

  const { error: participantError } = await client
    .from('message_participants')
    .insert([
      { thread_id: thread.id, user_id: input.senderId, role: senderParticipantRole },
      { thread_id: thread.id, user_id: input.recipientId, role: input.recipientRole },
    ]);

  if (participantError) {
    throw participantError;
  }

  return String(thread.id);
}

async function insertMessageAndNotify(
  client: SupabaseLike,
  input: {
    threadId: string;
    senderId: string;
    content: string;
  },
): Promise<{ messageId: string; recipientIds: string[] }> {
  const trimmedContent = input.content.trim();
  if (!trimmedContent) {
    throw new Error('A message body is required.');
  }

  const { data: message, error: messageError } = await client
    .from('messages')
    .insert({
      thread_id: input.threadId,
      sender_id: input.senderId,
      content: trimmedContent,
      content_type: 'text',
    })
    .select('id, content')
    .single();

  if (messageError) {
    throw messageError;
  }

  await client
    .from('message_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', input.threadId);

  const { data: participants, error: participantError } = await client
    .from('message_participants')
    .select('user_id')
    .eq('thread_id', input.threadId);

  if (participantError) {
    throw participantError;
  }

  const recipientIds = (participants || [])
    .map((participant: any) => String(participant.user_id || '').trim())
    .filter(Boolean);

  const senderName = await getSenderDisplayName(input.senderId, 'School');
  await sendMessagePushNotification({
    threadId: input.threadId,
    messageId: String(message.id),
    senderId: input.senderId,
    senderName,
    messageContent: trimmedContent,
    recipientIds,
  });

  return { messageId: String(message.id), recipientIds };
}

async function fetchAllLinkedParentIds(client: SupabaseLike, organizationId: string): Promise<string[]> {
  const { data: students, error } = await client
    .from('students')
    .select('parent_id, guardian_id')
    .or(getAudienceFilter(organizationId))
    .eq('status', 'active')
    .eq('is_active', true);

  if (error) {
    throw error;
  }

  return Array.from(new Set(
    (students || []).flatMap((student: any) => [
      String(student.parent_id || '').trim(),
      String(student.guardian_id || '').trim(),
    ]).filter(Boolean),
  ));
}

async function findExistingGroupThread(
  client: SupabaseLike,
  organizationId: string,
  groupType: 'announcement' | 'parent_group',
  groupName: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('message_threads')
    .select('id')
    .eq('preschool_id', organizationId)
    .eq('group_type', groupType)
    .eq('group_name', groupName)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data?.id || null;
}

async function resolveBroadcastThread(
  client: SupabaseLike,
  input: {
    organizationId: string;
    senderId?: string;
    threadName?: string;
    subject?: string;
  },
): Promise<RsvpThreadLookupRow | null> {
  const normalizedThreadName = sanitizeThreadNamePart(input.threadName);
  const normalizedSubject = sanitizeThreadNamePart(input.subject);

  let query = client
    .from('message_threads')
    .select('id, created_by, group_name, group_type, last_message_at')
    .eq('preschool_id', input.organizationId)
    .in('group_type', ['parent_group', 'announcement'])
    .order('last_message_at', { ascending: false })
    .limit(12);

  if (input.senderId) {
    query = query.eq('created_by', input.senderId);
  }

  if (normalizedThreadName) {
    query = query.eq('group_name', normalizedThreadName);
  } else if (normalizedSubject) {
    query = query.ilike('group_name', `%${normalizedSubject}%`);
  } else {
    query = query.ilike('group_name', 'RSVP%');
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const rows = (data || []) as RsvpThreadLookupRow[];
  if (rows.length === 0) {
    return null;
  }

  if (normalizedThreadName) {
    const exact = rows.find((row) => String(row.group_name || '').trim() === normalizedThreadName);
    if (exact) {
      return exact;
    }
  }

  if (normalizedSubject) {
    const exactSubjectMatches = rows.filter((row) =>
      String(row.group_name || '').toLowerCase().includes(normalizedSubject.toLowerCase()),
    );
    if (exactSubjectMatches.length === 1) {
      return exactSubjectMatches[0];
    }
    if (exactSubjectMatches.length > 1) {
      throw new Error(`I found multiple RSVP threads matching "${normalizedSubject}". Please be more specific.`);
    }
  }

  return rows[0];
}

async function ensureBroadcastThread(
  client: SupabaseLike,
  input: {
    organizationId: string;
    senderId: string;
    audience: BroadcastAudience;
    subject?: string;
    channelMode: BroadcastChannelMode;
    allowReplies: boolean;
    requireRsvp?: boolean;
  },
): Promise<{ threadId: string; threadName: string; mode: BroadcastChannelMode }> {
  const effectiveMode = input.allowReplies ? 'parent_group' : input.channelMode;
  const threadName = buildBroadcastThreadName(
    input.audience,
    effectiveMode,
    input.subject,
    input.requireRsvp,
  );
  const existingId = await findExistingGroupThread(
    client,
    input.organizationId,
    effectiveMode === 'announcement_channel' ? 'announcement' : 'parent_group',
    threadName,
  );
  if (existingId) {
    return { threadId: existingId, threadName, mode: effectiveMode };
  }

  if (effectiveMode === 'announcement_channel') {
    const { data, error } = await client.rpc('create_announcement_channel', {
      p_preschool_id: input.organizationId,
      p_created_by: input.senderId,
      p_channel_name: threadName,
      p_description: 'Inbox broadcast channel managed by Dash',
      p_audience: input.audience,
    });
    if (error) {
      throw error;
    }
    return { threadId: String(data), threadName, mode: effectiveMode };
  }

  const parentIds = await fetchAllLinkedParentIds(client, input.organizationId);
  const { data, error } = await client.rpc('create_parent_group', {
    p_preschool_id: input.organizationId,
    p_created_by: input.senderId,
    p_group_name: threadName,
    p_parent_ids: parentIds,
    p_description: 'Inbox parent broadcast managed by Dash',
    p_allow_replies: input.allowReplies,
  });
  if (error) {
    throw error;
  }

  return { threadId: String(data), threadName, mode: effectiveMode };
}

export class InboxMessagingService {
  static async sendDirectMessage(input: SendDirectInboxMessageInput) {
    const client = getClient(input.supabase);
    const recipientRole = normalizeRecipientRole(input.recipientRole);
    const resolvedRecipient = await resolveDirectRecipient(
      client,
      input.organizationId,
      input.recipientName,
      recipientRole,
      input.studentName,
    );

    const threadId = await createDirectThread(client, {
      organizationId: input.organizationId,
      senderId: input.senderId,
      senderRole: input.senderRole,
      recipientId: resolvedRecipient.userId,
      recipientRole: resolvedRecipient.role,
      recipientDisplayName: resolvedRecipient.displayName,
      studentId: resolvedRecipient.studentId,
      studentName: resolvedRecipient.studentName,
      subject: input.subject,
    });

    const { messageId } = await insertMessageAndNotify(client, {
      threadId,
      senderId: input.senderId,
      content: buildMessageContent(input.body, input.subject),
    });

    return {
      success: true,
      thread_id: threadId,
      message_id: messageId,
      recipient_id: resolvedRecipient.userId,
      recipient_name: resolvedRecipient.displayName,
      recipient_role: resolvedRecipient.role,
      student_name: resolvedRecipient.studentName,
      message: `Inbox message sent to ${resolvedRecipient.displayName}.`,
    };
  }

  static async sendBroadcastMessage(input: SendBroadcastInboxMessageInput) {
    const client = getClient(input.supabase);
    const audience = normalizeBroadcastAudience(input.audience);
    const requestedMode = normalizeBroadcastChannelMode(input.channelMode);
    const allowReplies = Boolean(input.allowReplies || input.requireRsvp);

    const thread = await ensureBroadcastThread(client, {
      organizationId: input.organizationId,
      senderId: input.senderId,
      audience,
      subject: input.subject,
      channelMode: requestedMode,
      allowReplies,
      requireRsvp: Boolean(input.requireRsvp),
    });

    const draftBody = buildMessageContent(input.body, input.subject);
    const finalBody = input.requireRsvp ? buildRsvpMessage(draftBody) : draftBody;
    const { messageId, recipientIds } = await insertMessageAndNotify(client, {
      threadId: thread.threadId,
      senderId: input.senderId,
      content: finalBody,
    });

    return {
      success: true,
      thread_id: thread.threadId,
      thread_name: thread.threadName,
      message_id: messageId,
      audience,
      channel_mode: thread.mode,
      replies_enabled: allowReplies,
      require_rsvp: Boolean(input.requireRsvp),
      recipient_count: Math.max(0, recipientIds.filter((id) => id !== input.senderId).length),
      message: input.requireRsvp
        ? `RSVP broadcast sent to ${audience} in "${thread.threadName}". Parents can reply and react in that inbox thread.`
        : `Broadcast inbox message sent to ${audience} in "${thread.threadName}".`,
    };
  }

  static async summarizeBroadcastRsvp(input: SummarizeBroadcastRsvpInput) {
    const client = getClient(input.supabase);
    const thread = await resolveBroadcastThread(client, {
      organizationId: input.organizationId,
      senderId: input.senderId,
      threadName: input.threadName,
      subject: input.subject,
    });

    if (!thread?.id) {
      throw new Error(
        input.subject
          ? `I could not find an RSVP thread matching "${input.subject}".`
          : 'I could not find a recent RSVP thread to summarize.',
      );
    }

    const { data: participants, error: participantError } = await client
      .from('message_participants')
      .select('user_id')
      .eq('thread_id', thread.id);

    if (participantError) {
      throw participantError;
    }

    const recipientIds = (participants || [])
      .map((participant: any) => String(participant.user_id || '').trim())
      .filter((userId) => userId && userId !== input.senderId);

    const { data: messages, error: messageError } = await client
      .from('messages')
      .select('id, sender_id, content, reply_to_id, created_at')
      .eq('thread_id', thread.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (messageError) {
      throw messageError;
    }

    const rootMessageId =
      (messages || []).find((message: any) => String(message.sender_id || '') === String(input.senderId || ''))?.id ||
      (messages || [])[0]?.id ||
      null;

    const messageIds = (messages || [])
      .map((message: any) => String(message.id || '').trim())
      .filter(Boolean);

    const { data: reactions, error: reactionError } = messageIds.length > 0
      ? await client
          .from('message_reactions')
          .select('message_id, user_id, emoji')
          .in('message_id', messageIds)
      : { data: [], error: null };

    if (reactionError) {
      throw reactionError;
    }

    const summary = summarizeRsvpActivity({
      recipientIds,
      organizerId: String(input.senderId || thread.created_by || ''),
      messages: (messages || []) as RsvpMessageRow[],
      reactions: (reactions || []) as RsvpReactionRow[],
      rootMessageId,
    });

    return {
      success: true,
      thread_id: thread.id,
      thread_name: String(thread.group_name || '').trim() || null,
      ...summary,
      message: [
        `RSVP summary for ${String(thread.group_name || 'this thread').trim() || 'this thread'}:`,
        `${summary.attending_count} attending`,
        `${summary.maybe_count} maybe`,
        `${summary.declined_count} declined`,
        `${summary.no_response_count} no response`,
        `${summary.guest_count} guests expected`,
        `${summary.expected_people_count} total people expected`,
      ].join(', '),
    };
  }
}

export default InboxMessagingService;
