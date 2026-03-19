-- Migration: Harden AI quota RPCs — restore auth.uid() guard, add search_path, REVOKE/GRANT
--
-- The 20260330 weighted-usage migration regressed the auth.uid() enforcement
-- previously added in 20260316. This migration:
--   1. Re-applies auth.uid() guard to increment_ai_usage (preserving p_weight)
--   2. Adds SET search_path = public to both quota functions
--   3. Restricts EXECUTE to authenticated + service_role only
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT are safe to re-run.

-- ============================================================
-- 1) increment_ai_usage — restore auth.uid(), add search_path
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_ai_usage(
  p_user_id uuid,
  p_request_type character varying,
  p_status character varying DEFAULT 'success'::character varying,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_weight integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  -- Enforce caller identity: Edge Functions with service_role have NULL auth.uid(),
  -- so fall back to p_user_id only for service_role callers.
  v_user_id uuid := COALESCE(auth.uid(), p_user_id);
  v_request_type text := lower(coalesce(trim(p_request_type), 'chat_message'));
  v_weight integer := GREATEST(1, coalesce(p_weight, 1));
BEGIN
  -- Reject calls where no user identity can be resolved
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'increment_ai_usage: user identity required';
  END IF;

  -- Normalize request type to canonical bucket
  IF v_request_type IN ('dash_conversation', 'dash_ai', 'lesson_generation', 'homework_generation', 'grading',
    'agent_plan', 'agent_reflection', 'web_search', 'image_analysis', 'document_analysis', 'voice_chat', 'chat') THEN
    v_request_type := 'chat_message';
  ELSIF v_request_type IN ('exam', 'exam_prep') THEN
    v_request_type := 'exam_generation';
  ELSIF v_request_type IN ('homework_help', 'tutor_help', 'tutor_session') THEN
    v_request_type := 'explanation';
  ELSIF v_request_type IN ('generate_image') THEN
    v_request_type := 'image_generation';
  ELSIF v_request_type IN ('stt', 'tts', 'transcribe') THEN
    v_request_type := 'transcription';
  ELSIF v_request_type NOT IN ('chat_message', 'exam_generation', 'explanation', 'image_generation', 'transcription') THEN
    v_request_type := 'chat_message';
  END IF;

  IF p_status = 'success' THEN
    IF v_request_type = 'exam_generation' THEN
      UPDATE public.user_ai_usage
      SET exams_generated_this_month = exams_generated_this_month + v_weight,
          total_exams_generated = total_exams_generated + v_weight,
          updated_at = NOW()
      WHERE user_id = v_user_id;
    ELSIF v_request_type = 'explanation' THEN
      UPDATE public.user_ai_usage
      SET explanations_requested_this_month = explanations_requested_this_month + v_weight,
          total_explanations_requested = total_explanations_requested + v_weight,
          updated_at = NOW()
      WHERE user_id = v_user_id;
    ELSIF v_request_type = 'image_generation' THEN
      UPDATE public.user_ai_usage
      SET images_generated_this_month = images_generated_this_month + v_weight,
          total_images_generated = total_images_generated + v_weight,
          updated_at = NOW()
      WHERE user_id = v_user_id;
    ELSIF v_request_type = 'transcription' THEN
      UPDATE public.user_ai_usage
      SET transcriptions_this_month = transcriptions_this_month + v_weight,
          updated_at = NOW()
      WHERE user_id = v_user_id;
    ELSE
      UPDATE public.user_ai_usage
      SET chat_messages_today = chat_messages_today + v_weight,
          chat_messages_this_month = chat_messages_this_month + v_weight,
          total_chat_messages = total_chat_messages + v_weight,
          updated_at = NOW()
      WHERE user_id = v_user_id;
    END IF;
  END IF;

  INSERT INTO public.ai_request_log (user_id, request_type, status, metadata)
  VALUES (
    v_user_id,
    v_request_type,
    p_status,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'original_request_type', p_request_type,
      'weight', v_weight
    )
  );
END;
$function$;

-- Restrict execution to authenticated users and service_role only
REVOKE ALL ON FUNCTION public.increment_ai_usage(uuid, character varying, character varying, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, character varying, character varying, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, character varying, character varying, jsonb, integer) TO service_role;


-- ============================================================
-- 2) check_ai_usage_limit — add search_path + REVOKE/GRANT
--    (auth.uid() guard already present from 20260316)
-- ============================================================
-- We only add SET search_path and permission discipline here.
-- The function body is not re-created to avoid touching the
-- complex membership/tier logic; instead we ALTER the function.
DO $$
BEGIN
  -- Add SET search_path to check_ai_usage_limit if it exists
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'check_ai_usage_limit'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'ALTER FUNCTION public.check_ai_usage_limit SET search_path = public';
  END IF;
END $$;

-- Restrict execution (match all known overload signatures)
DO $$
DECLARE
  func_oid oid;
BEGIN
  FOR func_oid IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'check_ai_usage_limit'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', func_oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', func_oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', func_oid::regprocedure);
  END LOOP;
END $$;


-- ============================================================
-- 3) record_ai_usage — add search_path + REVOKE/GRANT
-- ============================================================
DO $$
DECLARE
  func_oid oid;
BEGIN
  FOR func_oid IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'record_ai_usage'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', func_oid::regprocedure);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', func_oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', func_oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', func_oid::regprocedure);
  END LOOP;
END $$;
