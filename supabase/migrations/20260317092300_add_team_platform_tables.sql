-- =============================================================================
-- Team Platform Tables: team channels, messages, and platform activity log
-- Supports internal superadmin team communication and audit trail
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. team_channels — Internal team communication channels
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_channels (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    description     text,
    channel_type    text NOT NULL DEFAULT 'general'
                    CHECK (channel_type IN ('general', 'announcements', 'dev', 'support', 'operations', 'custom')),
    created_by      uuid NOT NULL REFERENCES public.profiles(id),
    is_archived     boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.team_channels IS 'Internal team communication channels for platform admins';

-- ---------------------------------------------------------------------------
-- 2. team_channel_members — Who belongs to which channel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_channel_members (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id      uuid NOT NULL REFERENCES public.team_channels(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role            text NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'admin', 'member')),
    joined_at       timestamptz NOT NULL DEFAULT now(),
    last_read_at    timestamptz,
    is_muted        boolean NOT NULL DEFAULT false,
    UNIQUE (channel_id, user_id)
);

COMMENT ON TABLE public.team_channel_members IS 'Membership in team channels';

-- ---------------------------------------------------------------------------
-- 3. team_messages — Messages within team channels
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id      uuid NOT NULL REFERENCES public.team_channels(id) ON DELETE CASCADE,
    sender_id       uuid NOT NULL REFERENCES public.profiles(id),
    content         text NOT NULL,
    content_type    text NOT NULL DEFAULT 'text'
                    CHECK (content_type IN ('text', 'image', 'file', 'system')),
    reply_to_id     uuid REFERENCES public.team_messages(id) ON DELETE SET NULL,
    is_pinned       boolean NOT NULL DEFAULT false,
    is_edited       boolean NOT NULL DEFAULT false,
    metadata        jsonb DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.team_messages IS 'Messages in team channels';

-- ---------------------------------------------------------------------------
-- 4. platform_activity_log — Cross-org platform-level audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_activity_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        uuid REFERENCES public.profiles(id),
    action          text NOT NULL,
    entity_type     text,
    entity_id       text,
    metadata        jsonb DEFAULT '{}'::jsonb,
    ip_address      inet,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_activity_log IS 'Platform-level activity log for superadmin audit trail';

-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_team_channels_created_by
    ON public.team_channels(created_by);

CREATE INDEX IF NOT EXISTS idx_team_channel_members_channel_id
    ON public.team_channel_members(channel_id);

CREATE INDEX IF NOT EXISTS idx_team_channel_members_user_id
    ON public.team_channel_members(user_id);

CREATE INDEX IF NOT EXISTS idx_team_messages_channel_id_created
    ON public.team_messages(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_messages_sender_id
    ON public.team_messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_platform_activity_log_actor
    ON public.platform_activity_log(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_activity_log_action
    ON public.platform_activity_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_activity_log_entity
    ON public.platform_activity_log(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- 6. RLS Policies — Superadmin-only access
-- ---------------------------------------------------------------------------
ALTER TABLE public.team_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_activity_log ENABLE ROW LEVEL SECURITY;

-- Helper: check if the current JWT user is a superadmin
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('superadmin', 'super_admin', 'platform_admin', 'admin')
    );
$$;

-- team_channels: platform admins can read/write
CREATE POLICY "team_channels_admin_all"
    ON public.team_channels
    FOR ALL
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

-- team_channel_members: platform admins can manage, members can read own
CREATE POLICY "team_channel_members_admin_all"
    ON public.team_channel_members
    FOR ALL
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

-- team_messages: platform admins full access
CREATE POLICY "team_messages_admin_all"
    ON public.team_messages
    FOR ALL
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

-- platform_activity_log: admins can read, service role writes
CREATE POLICY "platform_activity_log_admin_read"
    ON public.platform_activity_log
    FOR SELECT
    USING (public.is_platform_admin());

CREATE POLICY "platform_activity_log_admin_insert"
    ON public.platform_activity_log
    FOR INSERT
    WITH CHECK (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 7. Updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_team_channels_updated_at
    BEFORE UPDATE ON public.team_channels
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_team_messages_updated_at
    BEFORE UPDATE ON public.team_messages
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Seed default channels (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.team_channels (id, name, description, channel_type, created_by)
SELECT
    gen_random_uuid(),
    ch.name,
    ch.description,
    ch.channel_type,
    (SELECT id FROM public.profiles WHERE role IN ('superadmin', 'super_admin', 'platform_admin') ORDER BY created_at ASC LIMIT 1)
FROM (VALUES
    ('General',      'Team-wide discussion',                 'general'),
    ('Announcements', 'Important platform announcements',    'announcements'),
    ('Development',   'Engineering & technical discussion',  'dev'),
    ('Support',       'Customer support coordination',       'support'),
    ('Operations',    'Day-to-day platform operations',      'operations')
) AS ch(name, description, channel_type)
WHERE NOT EXISTS (SELECT 1 FROM public.team_channels WHERE team_channels.name = ch.name)
  AND EXISTS (SELECT 1 FROM public.profiles WHERE role IN ('superadmin', 'super_admin', 'platform_admin'));
