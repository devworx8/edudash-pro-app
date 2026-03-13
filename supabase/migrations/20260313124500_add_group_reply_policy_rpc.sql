-- ============================================================================
-- Migration: Add group reply policy RPC for post-create admin controls
-- Description: Lets group admins toggle reply permissions after group creation
--              and keeps participant send permissions in sync.
-- Date: 2026-03-13
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_group_reply_policy(
  p_thread_id uuid,
  p_allow_replies boolean,
  p_updated_by uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_record public.message_threads%ROWTYPE;
  v_is_admin boolean;
BEGIN
  SELECT *
  INTO v_thread_record
  FROM public.message_threads
  WHERE id = p_thread_id;

  IF v_thread_record.id IS NULL OR v_thread_record.is_group IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Thread not found or not a group';
  END IF;

  IF v_thread_record.group_type = 'announcement' THEN
    RAISE EXCEPTION 'Announcement channels are one-way and cannot enable replies';
  END IF;

  SELECT is_admin
  INTO v_is_admin
  FROM public.message_participants
  WHERE thread_id = p_thread_id
    AND user_id = p_updated_by;

  IF v_is_admin IS DISTINCT FROM TRUE AND v_thread_record.created_by <> p_updated_by THEN
    RAISE EXCEPTION 'Only group admins can update reply permissions';
  END IF;

  UPDATE public.message_threads
  SET allow_replies = p_allow_replies,
      updated_at = timezone('utc', now())
  WHERE id = p_thread_id;

  UPDATE public.message_participants
  SET can_send_messages = p_allow_replies
  WHERE thread_id = p_thread_id
    AND COALESCE(is_admin, FALSE) = FALSE;

  RETURN TRUE;
END;
$$;
