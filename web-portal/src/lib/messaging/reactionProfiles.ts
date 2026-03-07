type ReactorProfile = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
};

const toUniqueIds = (ids: string[]) =>
  Array.from(new Set(ids.map((value) => String(value || '').trim()).filter(Boolean)));

/**
 * Resolve reaction user ids to visible profile names.
 * Supports both direct profile ids and legacy users.id -> users.profile_id mappings.
 */
export async function resolveReactionProfiles(
  supabase: any,
  userIds: string[],
): Promise<Map<string, ReactorProfile>> {
  const reactorIds = toUniqueIds(userIds);
  const profileMap = new Map<string, ReactorProfile>();

  if (reactorIds.length === 0) {
    return profileMap;
  }

  const { data: directProfiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', reactorIds);

  (directProfiles || []).forEach((profile: ReactorProfile) => {
    if (!profile?.id) return;
    profileMap.set(String(profile.id), profile);
  });

  const unresolvedUserIds = reactorIds.filter((userId) => !profileMap.has(userId));
  if (unresolvedUserIds.length === 0) {
    return profileMap;
  }

  const { data: profilesByUserId, error: profilesByUserIdError } = await supabase
    .from('profiles')
    .select('id, user_id, first_name, last_name')
    .in('user_id', unresolvedUserIds);

  if (!profilesByUserIdError) {
    (profilesByUserId || []).forEach((profile: any) => {
      const userId = String(profile?.user_id || '');
      if (!userId || !profile?.id) return;
      profileMap.set(userId, {
        id: String(profile.id),
        first_name: profile.first_name,
        last_name: profile.last_name,
      });
    });
  }

  const stillUnresolvedUserIds = unresolvedUserIds.filter((userId) => !profileMap.has(userId));
  if (stillUnresolvedUserIds.length === 0) {
    return profileMap;
  }

  const { data: userRows } = await supabase
    .from('users')
    .select('id, profile_id')
    .in('id', stillUnresolvedUserIds);

  const profileIds = toUniqueIds(
    (userRows || [])
      .map((row: any) => row?.profile_id)
      .filter((value: unknown) => typeof value === 'string'),
  );

  if (profileIds.length === 0) {
    return profileMap;
  }

  const { data: linkedProfiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', profileIds);

  const linkedProfileById = new Map<string, ReactorProfile>();
  (linkedProfiles || []).forEach((profile: ReactorProfile) => {
    if (!profile?.id) return;
    linkedProfileById.set(String(profile.id), profile);
  });

  (userRows || []).forEach((row: any) => {
    const userId = String(row?.id || '');
    const profileId = String(row?.profile_id || '');
    if (!userId || !profileId) return;
    const linkedProfile = linkedProfileById.get(profileId);
    if (!linkedProfile) return;
    profileMap.set(userId, linkedProfile);
  });

  return profileMap;
}
