-- Migration: SOA Messaging Schema
-- Extends existing messaging infrastructure for EduPro organization messaging
-- Supports regional, wing, and national communication channels

-- ============================================================================
-- 1. SOA Message Threads Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS soa_message_threads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  region_id UUID REFERENCES organization_regions(id) ON DELETE SET NULL,
  
  -- Thread classification
  wing TEXT CHECK (wing IN ('youth', 'women', 'men', 'seniors', 'national', 'all')),
  thread_type TEXT NOT NULL CHECK (thread_type IN (
    'broadcast',      -- One-way announcements from leadership
    'regional_chat',  -- Regional group discussions
    'wing_chat',      -- Wing-specific discussions
    'direct',         -- One-on-one messaging
    'national'        -- National-level communications
  )),
  
  -- Thread metadata
  subject TEXT,
  description TEXT,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_muted_by_default BOOLEAN DEFAULT FALSE,
  
  -- For direct messages
  participant_ids UUID[] DEFAULT '{}',
  
  -- Tracking
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  message_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- ============================================================================
-- 2. SOA Messages Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS soa_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES soa_message_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Message content
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN (
    'text', 'image', 'voice', 'document', 'system', 'announcement'
  )),
  
  -- Attachments
  attachment_url TEXT,
  attachment_type TEXT,
  attachment_name TEXT,
  attachment_size INTEGER,
  
  -- Voice message specific
  voice_duration INTEGER, -- Duration in seconds
  
  -- Reply functionality
  reply_to_id UUID REFERENCES soa_messages(id) ON DELETE SET NULL,
  
  -- Forwarded message
  forwarded_from_id UUID REFERENCES soa_messages(id) ON DELETE SET NULL,
  
  -- Edit tracking
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now()
);
-- ============================================================================
-- 3. SOA Message Participants Table (for tracking who can access threads)
-- ============================================================================
CREATE TABLE IF NOT EXISTS soa_message_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES soa_message_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id UUID REFERENCES organization_members(id) ON DELETE SET NULL,
  
  -- Participation details
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member', 'readonly')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  
  -- User preferences for this thread
  is_muted BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,
  notification_preference TEXT DEFAULT 'all' CHECK (notification_preference IN ('all', 'mentions', 'none')),
  
  -- Read tracking
  last_read_at TIMESTAMPTZ DEFAULT now(),
  last_read_message_id UUID REFERENCES soa_messages(id) ON DELETE SET NULL,
  unread_count INTEGER DEFAULT 0,
  
  -- Left/removed tracking
  left_at TIMESTAMPTZ,
  removed_by UUID REFERENCES auth.users(id),
  
  UNIQUE (thread_id, user_id)
);
-- ============================================================================
-- 4. SOA Message Reactions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS soa_message_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES soa_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
-- ============================================================================
-- 5. SOA Message Read Receipts Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS soa_message_read_receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES soa_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (message_id, user_id)
);
-- ============================================================================
-- 6. Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_soa_threads_org_id ON soa_message_threads(organization_id);
CREATE INDEX IF NOT EXISTS idx_soa_threads_region_id ON soa_message_threads(region_id);
CREATE INDEX IF NOT EXISTS idx_soa_threads_wing ON soa_message_threads(wing);
CREATE INDEX IF NOT EXISTS idx_soa_threads_type ON soa_message_threads(thread_type);
CREATE INDEX IF NOT EXISTS idx_soa_threads_last_message ON soa_message_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_soa_threads_created_by ON soa_message_threads(created_by);
CREATE INDEX IF NOT EXISTS idx_soa_messages_thread_id ON soa_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_soa_messages_sender_id ON soa_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_soa_messages_created_at ON soa_messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_soa_messages_reply_to ON soa_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_soa_participants_thread_id ON soa_message_participants(thread_id);
CREATE INDEX IF NOT EXISTS idx_soa_participants_user_id ON soa_message_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_soa_participants_member_id ON soa_message_participants(member_id);
CREATE INDEX IF NOT EXISTS idx_soa_reactions_message_id ON soa_message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_soa_read_receipts_message_id ON soa_message_read_receipts(message_id);
-- ============================================================================
-- 7. RLS Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE soa_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE soa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE soa_message_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE soa_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE soa_message_read_receipts ENABLE ROW LEVEL SECURITY;
-- Threads: Users can see threads they participate in or broadcast threads in their org/region
CREATE POLICY soa_threads_select ON soa_message_threads FOR SELECT USING (
  -- Direct participant
  EXISTS (
    SELECT 1 FROM soa_message_participants p
    WHERE p.thread_id = soa_message_threads.id
    AND p.user_id = auth.uid()
    AND p.left_at IS NULL
  )
  OR
  -- Broadcast/regional thread in user's organization
  (
    thread_type IN ('broadcast', 'regional_chat', 'wing_chat', 'national')
    AND EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.user_id = auth.uid()
      AND m.organization_id = soa_message_threads.organization_id
      AND (
        soa_message_threads.region_id IS NULL 
        OR m.region_id = soa_message_threads.region_id
      )
    )
  )
);
-- Threads: Leadership can create threads
CREATE POLICY soa_threads_insert ON soa_message_threads FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.user_id = auth.uid()
    AND m.organization_id = soa_message_threads.organization_id
    AND m.member_type IN (
      'ceo', 'president', 'vice_president', 'secretary', 'treasurer',
      'youth_president', 'youth_secretary', 'youth_treasurer',
      'regional_manager', 'regional_coordinator', 'national_admin'
    )
  )
  OR
  -- Anyone can create direct message threads
  thread_type = 'direct'
);
-- Threads: Creator and admins can update
CREATE POLICY soa_threads_update ON soa_message_threads FOR UPDATE USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM soa_message_participants p
    WHERE p.thread_id = soa_message_threads.id
    AND p.user_id = auth.uid()
    AND p.role IN ('admin', 'moderator')
  )
);
-- Messages: Participants can view messages
CREATE POLICY soa_messages_select ON soa_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM soa_message_threads t
    WHERE t.id = soa_messages.thread_id
    AND (
      -- Direct participant
      EXISTS (
        SELECT 1 FROM soa_message_participants p
        WHERE p.thread_id = t.id
        AND p.user_id = auth.uid()
        AND p.left_at IS NULL
      )
      OR
      -- Broadcast participant via organization membership
      (
        t.thread_type IN ('broadcast', 'regional_chat', 'wing_chat', 'national')
        AND EXISTS (
          SELECT 1 FROM organization_members m
          WHERE m.user_id = auth.uid()
          AND m.organization_id = t.organization_id
        )
      )
    )
  )
);
-- Messages: Participants can send messages (except readonly in broadcast)
CREATE POLICY soa_messages_insert ON soa_messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM soa_message_threads t
    WHERE t.id = soa_messages.thread_id
    AND (
      -- Participant with write access
      EXISTS (
        SELECT 1 FROM soa_message_participants p
        WHERE p.thread_id = t.id
        AND p.user_id = auth.uid()
        AND p.role != 'readonly'
        AND p.left_at IS NULL
      )
      OR
      -- Leadership can post to broadcast/regional threads
      (
        t.thread_type IN ('broadcast', 'regional_chat', 'wing_chat', 'national')
        AND EXISTS (
          SELECT 1 FROM organization_members m
          WHERE m.user_id = auth.uid()
          AND m.organization_id = t.organization_id
          AND m.member_type IN (
            'ceo', 'president', 'vice_president', 'secretary', 'treasurer',
            'youth_president', 'youth_secretary', 'youth_treasurer',
            'regional_manager', 'regional_coordinator', 'national_admin'
          )
        )
      )
    )
  )
);
-- Messages: Sender can update (edit) their own messages
CREATE POLICY soa_messages_update ON soa_messages FOR UPDATE USING (
  sender_id = auth.uid()
);
-- Messages: Sender can delete (soft delete) their own messages
CREATE POLICY soa_messages_delete ON soa_messages FOR DELETE USING (
  sender_id = auth.uid()
);
-- Participants: Can view participants in threads they're in
CREATE POLICY soa_participants_select ON soa_message_participants FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM soa_message_participants p
    WHERE p.thread_id = soa_message_participants.thread_id
    AND p.user_id = auth.uid()
  )
);
-- Participants: Admins can manage participants
CREATE POLICY soa_participants_insert ON soa_message_participants FOR INSERT WITH CHECK (
  -- Thread creator/admin adding participants
  EXISTS (
    SELECT 1 FROM soa_message_threads t
    WHERE t.id = soa_message_participants.thread_id
    AND (
      t.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM soa_message_participants p
        WHERE p.thread_id = t.id
        AND p.user_id = auth.uid()
        AND p.role = 'admin'
      )
    )
  )
  OR
  -- User adding themselves to a public thread
  (
    soa_message_participants.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM soa_message_threads t
      WHERE t.id = soa_message_participants.thread_id
      AND t.thread_type IN ('regional_chat', 'wing_chat')
    )
  )
);
-- Participants: Users can update their own preferences
CREATE POLICY soa_participants_update ON soa_message_participants FOR UPDATE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM soa_message_participants p
    WHERE p.thread_id = soa_message_participants.thread_id
    AND p.user_id = auth.uid()
    AND p.role = 'admin'
  )
);
-- Reactions: Anyone in thread can add reactions
CREATE POLICY soa_reactions_select ON soa_message_reactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM soa_messages m
    JOIN soa_message_participants p ON p.thread_id = m.thread_id
    WHERE m.id = soa_message_reactions.message_id
    AND p.user_id = auth.uid()
  )
);
CREATE POLICY soa_reactions_insert ON soa_message_reactions FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM soa_messages m
    JOIN soa_message_participants p ON p.thread_id = m.thread_id
    WHERE m.id = soa_message_reactions.message_id
    AND p.user_id = auth.uid()
  )
);
CREATE POLICY soa_reactions_delete ON soa_message_reactions FOR DELETE USING (
  user_id = auth.uid()
);
-- Read receipts: Users can manage their own
CREATE POLICY soa_read_receipts_select ON soa_message_read_receipts FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM soa_messages m
    JOIN soa_message_participants p ON p.thread_id = m.thread_id
    WHERE m.id = soa_message_read_receipts.message_id
    AND p.user_id = auth.uid()
  )
);
CREATE POLICY soa_read_receipts_insert ON soa_message_read_receipts FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
-- ============================================================================
-- 8. Functions and Triggers
-- ============================================================================

-- Function to update thread's last_message_at and message_count
CREATE OR REPLACE FUNCTION update_soa_thread_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE soa_message_threads
  SET 
    last_message_at = NEW.created_at,
    message_count = message_count + 1,
    updated_at = now()
  WHERE id = NEW.thread_id;
  
  -- Update unread count for all participants except sender
  UPDATE soa_message_participants
  SET unread_count = unread_count + 1
  WHERE thread_id = NEW.thread_id
  AND user_id != NEW.sender_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER soa_message_insert_trigger
  AFTER INSERT ON soa_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_soa_thread_on_message();
-- Function to mark messages as read
CREATE OR REPLACE FUNCTION mark_soa_thread_read(p_thread_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Update participant's read tracking
  UPDATE soa_message_participants
  SET 
    last_read_at = now(),
    unread_count = 0,
    last_read_message_id = (
      SELECT id FROM soa_messages 
      WHERE thread_id = p_thread_id 
      ORDER BY created_at DESC 
      LIMIT 1
    )
  WHERE thread_id = p_thread_id
  AND user_id = auth.uid();
  
  -- Insert read receipts for all unread messages
  INSERT INTO soa_message_read_receipts (message_id, user_id)
  SELECT m.id, auth.uid()
  FROM soa_messages m
  WHERE m.thread_id = p_thread_id
  AND m.sender_id != auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM soa_message_read_receipts r
    WHERE r.message_id = m.id AND r.user_id = auth.uid()
  )
  ON CONFLICT (message_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================================================
-- 9. Default System Threads (created per region)
-- ============================================================================

-- Function to create default threads for a new region
CREATE OR REPLACE FUNCTION create_default_soa_threads_for_region(
  p_organization_id UUID,
  p_region_id UUID,
  p_created_by UUID
)
RETURNS VOID AS $$
BEGIN
  -- Youth Wing Chat
  INSERT INTO soa_message_threads (
    organization_id, region_id, wing, thread_type, 
    subject, description, created_by
  ) VALUES (
    p_organization_id, p_region_id, 'youth', 'wing_chat',
    'Youth Wing Discussion', 'General discussion for Youth Wing members',
    p_created_by
  );
  
  -- Regional Announcements (broadcast)
  INSERT INTO soa_message_threads (
    organization_id, region_id, wing, thread_type,
    subject, description, created_by, is_muted_by_default
  ) VALUES (
    p_organization_id, p_region_id, 'all', 'broadcast',
    'Regional Announcements', 'Important announcements for all members',
    p_created_by, true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================================================
-- 10. Comments for documentation
-- ============================================================================
COMMENT ON TABLE soa_message_threads IS 'SOA organization messaging threads - supports regional, wing, and direct messaging';
COMMENT ON TABLE soa_messages IS 'Individual messages within SOA threads';
COMMENT ON TABLE soa_message_participants IS 'Thread participants with roles and preferences';
COMMENT ON TABLE soa_message_reactions IS 'Emoji reactions on messages';
COMMENT ON TABLE soa_message_read_receipts IS 'Read receipt tracking for messages';
