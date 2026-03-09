-- ============================================================================
-- Next-Gen Messaging Suite — Database Enhancements
-- Phase 1: Auto-translate per-participant
-- Phase 2: Scheduled messages, pinned messages, message templates
-- Phase 3: Group emoji, auto-create class groups setting
-- ============================================================================

-- ── Phase 1: Auto-Translate ─────────────────────────────────────────────────

ALTER TABLE message_participants
  ADD COLUMN IF NOT EXISTS auto_translate boolean DEFAULT false;

COMMENT ON COLUMN message_participants.auto_translate
  IS 'When true, incoming messages in this thread are auto-translated to the user preferred language';

-- ── Phase 2: Scheduled Messages ─────────────────────────────────────────────

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_scheduled boolean DEFAULT false;

COMMENT ON COLUMN messages.scheduled_at
  IS 'When set, the message will be delivered at this time instead of immediately';
COMMENT ON COLUMN messages.is_scheduled
  IS 'True while the message is waiting to be sent at scheduled_at';

-- Index for the cron job that finds due scheduled messages
CREATE INDEX IF NOT EXISTS idx_messages_scheduled
  ON messages (scheduled_at)
  WHERE is_scheduled = true;

-- ── Phase 2: Pinned Messages ────────────────────────────────────────────────

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES profiles(id);

COMMENT ON COLUMN messages.is_pinned IS 'Whether this message is pinned to the top of the thread';

-- Index for fetching pinned messages per thread
CREATE INDEX IF NOT EXISTS idx_messages_pinned
  ON messages (thread_id)
  WHERE is_pinned = true;

-- ── Phase 2: Message Templates ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES preschools(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'attendance', 'fees', 'events', 'general', 'homework', 'health', 'transport'
  )),
  title text NOT NULL,
  body text NOT NULL,
  variables text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE message_templates IS 'School-specific message templates for quick reply';

-- RLS: members of the org can read, teachers/principals/admins can insert/update
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_templates_select"
  ON message_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = message_templates.organization_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "message_templates_insert"
  ON message_templates FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('teacher', 'principal', 'principal_admin', 'admin', 'superadmin')
    )
    AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = message_templates.organization_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "message_templates_update"
  ON message_templates FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('principal', 'principal_admin', 'admin', 'superadmin')
    )
  );

CREATE POLICY "message_templates_delete"
  ON message_templates FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('principal', 'principal_admin', 'admin', 'superadmin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_message_templates_org
  ON message_templates (organization_id)
  WHERE is_active = true;

-- ── Phase 3: Group Emoji ────────────────────────────────────────────────────

ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS group_emoji text;

COMMENT ON COLUMN message_threads.group_emoji
  IS 'Optional emoji displayed as group avatar/icon';

-- ── Phase 3: Auto-Create Class Groups Setting ───────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'preschools' AND column_name = 'auto_create_class_groups'
  ) THEN
    ALTER TABLE preschools ADD COLUMN auto_create_class_groups boolean DEFAULT true;
  END IF;
END $$;

COMMENT ON COLUMN preschools.auto_create_class_groups
  IS 'When true, creating a new class automatically creates a parent messaging group';
