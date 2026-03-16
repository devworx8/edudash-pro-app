-- Harden AI quota RPCs: enforce auth.uid() for client-side calls.
--
-- Previously, check_ai_usage_limit and increment_ai_usage accepted a
-- caller-supplied p_user_id, allowing clients to spoof another user's
-- quota. This migration adds an auth.uid() enforcement block:
--   - When auth.uid() IS NOT NULL (anon-key / user-JWT calls): the
--     function ignores p_user_id and uses auth.uid().
--   - When auth.uid() IS NULL (service-role calls from Edge Functions):
--     the function trusts p_user_id as before.
-- This prevents quota spoofing from the client while keeping Edge
-- Functions working unchanged.

-- ──────────────────────────────────────────────────────────────────────
-- 1) check_ai_usage_limit — full replacement with auth.uid() guard
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_ai_usage_limit(
  p_user_id uuid,
  p_request_type character varying
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
  v_usage RECORD;
  v_limits RECORD;
  v_profile RECORD;
  v_membership RECORD;

  v_can_proceed BOOLEAN := false;
  v_remaining INTEGER := 0;
  v_limit INTEGER := 0;

  v_effective_tier text;
  v_profile_tier text;
  v_school_tier text;
  v_request_type text := lower(coalesce(trim(p_request_type), 'chat_message'));

  v_school_id uuid;
BEGIN
  -- SECURITY: when called with a user JWT, always use the authenticated
  -- user's ID. This blocks client-side spoofing via p_user_id.
  v_user_id := COALESCE(auth.uid(), p_user_id);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'remaining', 0, 'limit', 0,
      'current_tier', 'unknown', 'upgrade_available', false,
      'request_type', v_request_type, 'error', 'no_user_id'
    );
  END IF;

  -- Resolve profile using either profiles.id or profiles.auth_user_id.
  SELECT
    p.id,
    p.auth_user_id,
    lower(coalesce(p.role, '')) AS role,
    lower(coalesce(p.subscription_tier::text, '')) AS subscription_tier,
    p.preschool_id,
    p.organization_id,
    coalesce(p.preschool_id, p.organization_id) AS school_id
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_user_id OR p.auth_user_id = v_user_id
  ORDER BY CASE WHEN p.id = v_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  v_school_id := v_profile.school_id;

  -- Fallback: infer school from organization_members when profile school IDs are missing.
  IF v_school_id IS NULL THEN
    SELECT
      om.organization_id,
      lower(coalesce(om.membership_status, '')) AS membership_status
    INTO v_membership
    FROM public.organization_members om
    WHERE om.user_id = v_user_id
    ORDER BY
      CASE WHEN lower(coalesce(om.membership_status, '')) = 'active' THEN 0 ELSE 1 END,
      om.updated_at DESC NULLS LAST,
      om.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_membership.organization_id IS NOT NULL THEN
      v_school_id := v_membership.organization_id;
    END IF;

  END IF;

  -- BYPASS 1: Community School (platform demo)
  IF v_school_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', -1,
      'limit', -1,
      'current_tier', 'community_unlimited',
      'upgrade_available', false,
      'request_type', v_request_type
    );
  END IF;

  -- BYPASS 2: EduDash Pro Main School (platform admin)
  IF v_school_id = '00000000-0000-0000-0000-000000000003'::uuid THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', -1,
      'limit', -1,
      'current_tier', 'platform_admin_unlimited',
      'upgrade_available', false,
      'request_type', v_request_type
    );
  END IF;

  -- Ensure usage row exists.
  INSERT INTO public.user_ai_usage (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Monthly reset.
  UPDATE public.user_ai_usage
  SET
    exams_generated_this_month = 0,
    explanations_requested_this_month = 0,
    chat_messages_this_month = 0,
    images_generated_this_month = 0,
    last_monthly_reset_at = NOW()
  WHERE user_id = v_user_id
    AND last_monthly_reset_at < (NOW() - INTERVAL '30 days');

  -- Daily chat reset (analytics counter).
  UPDATE public.user_ai_usage
  SET
    chat_messages_today = 0,
    last_daily_reset_at = NOW()
  WHERE user_id = v_user_id
    AND last_daily_reset_at < (NOW() - INTERVAL '1 day');

  SELECT * INTO v_usage
  FROM public.user_ai_usage
  WHERE user_id = v_user_id;

  v_profile_tier := coalesce(v_profile.subscription_tier, '');

  -- Resolve active school plan tier (if any).
  IF v_school_id IS NOT NULL THEN
    SELECT lower(sp.tier::text)
    INTO v_school_tier
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.id = s.plan_id
    WHERE s.school_id = v_school_id
      AND s.status IN ('active', 'trialing')
    ORDER BY CASE WHEN s.status = 'active' THEN 0 ELSE 1 END, s.created_at DESC
    LIMIT 1;
  END IF;

  -- Fallback to organization tier if there is no direct school subscription row.
  IF v_school_tier IS NULL AND v_school_id IS NOT NULL THEN
    SELECT lower(coalesce(o.subscription_tier::text, o.plan_tier::text, ''))
    INTO v_school_tier
    FROM public.organizations o
    WHERE o.id = v_school_id
    LIMIT 1;

    IF v_school_tier = '' THEN
      v_school_tier := NULL;
    END IF;
  END IF;

  -- Some tenants store school subscription on preschools while profiles carry organization_id.
  IF v_school_tier IS NULL
     AND v_profile.organization_id IS NOT NULL
     AND v_profile.preschool_id IS NULL THEN
    SELECT lower(coalesce(pr.subscription_tier::text, ''))
    INTO v_school_tier
    FROM public.profiles p2
    JOIN public.preschools pr ON pr.id = p2.preschool_id
    WHERE p2.organization_id = v_profile.organization_id
      AND p2.preschool_id IS NOT NULL
    ORDER BY p2.created_at DESC NULLS LAST
    LIMIT 1;

    IF v_school_tier = '' THEN
      v_school_tier := NULL;
    END IF;
  END IF;

  -- Tier precedence:
  -- 1) parent_* profile tiers (personal parent plans)
  -- 2) active school plan tier
  -- 3) profile.subscription_tier
  -- 4) existing user_ai_usage.current_tier
  IF v_profile_tier LIKE 'parent_%' THEN
    v_effective_tier := v_profile_tier;
  ELSIF v_school_tier IS NOT NULL THEN
    v_effective_tier := v_school_tier;
  ELSIF v_profile_tier <> '' THEN
    v_effective_tier := v_profile_tier;
  ELSE
    v_effective_tier := lower(coalesce(v_usage.current_tier::text, 'free'));
  END IF;

  -- Ensure resolved tier exists in ai_usage_tiers.
  IF NOT EXISTS (
    SELECT 1
    FROM public.ai_usage_tiers t
    WHERE t.tier_name::text = v_effective_tier
      AND t.is_active = true
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.ai_usage_tiers t
      WHERE t.tier_name::text = lower(coalesce(v_usage.current_tier::text, ''))
        AND t.is_active = true
    ) THEN
      v_effective_tier := lower(v_usage.current_tier::text);
    ELSE
      v_effective_tier := 'free';
    END IF;
  END IF;

  -- Sync effective tier back to usage row for consistency.
  IF coalesce(v_usage.current_tier::text, '') <> v_effective_tier THEN
    UPDATE public.user_ai_usage
    SET current_tier = v_effective_tier::public.tier_name_aligned,
        updated_at = NOW()
    WHERE user_id = v_user_id;

    SELECT * INTO v_usage
    FROM public.user_ai_usage
    WHERE user_id = v_user_id;
  END IF;

  SELECT * INTO v_limits
  FROM public.ai_usage_tiers
  WHERE tier_name::text = v_effective_tier
    AND is_active = true
  LIMIT 1;

  -- Normalize request type into quota buckets.
  IF v_request_type IN (
    'dash_conversation',
    'dash_ai',
    'lesson_generation',
    'homework_generation',
    'grading',
    'agent_plan',
    'agent_reflection',
    'web_search',
    'image_analysis',
    'document_analysis',
    'voice_chat',
    'chat'
  ) THEN
    v_request_type := 'chat_message';
  ELSIF v_request_type IN ('exam', 'exam_prep') THEN
    v_request_type := 'exam_generation';
  ELSIF v_request_type IN ('homework_help', 'tutor_help', 'tutor_session') THEN
    v_request_type := 'explanation';
  ELSIF v_request_type IN ('generate_image') THEN
    v_request_type := 'image_generation';
  ELSIF v_request_type NOT IN ('chat_message', 'exam_generation', 'explanation', 'image_generation') THEN
    v_request_type := 'chat_message';
  END IF;

  IF v_request_type = 'exam_generation' THEN
    v_limit := v_limits.exams_per_month;
    v_remaining := v_limit - v_usage.exams_generated_this_month;
    v_can_proceed := v_usage.exams_generated_this_month < v_limit;
  ELSIF v_request_type = 'explanation' THEN
    v_limit := v_limits.explanations_per_month;
    v_remaining := v_limit - v_usage.explanations_requested_this_month;
    v_can_proceed := v_usage.explanations_requested_this_month < v_limit;
  ELSIF v_request_type = 'image_generation' THEN
    v_limit := v_limits.images_per_month;
    v_remaining := v_limit - v_usage.images_generated_this_month;
    v_can_proceed := v_usage.images_generated_this_month < v_limit;
  ELSE
    v_limit := v_limits.chat_messages_per_month;
    v_remaining := v_limit - v_usage.chat_messages_this_month;
    v_can_proceed := v_usage.chat_messages_this_month < v_limit;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_can_proceed,
    'remaining', GREATEST(v_remaining, 0),
    'limit', v_limit,
    'current_tier', v_effective_tier,
    'upgrade_available', v_effective_tier IN ('free', 'trial'),
    'request_type', v_request_type
  );
END;
$function$;


-- ──────────────────────────────────────────────────────────────────────
-- 2) increment_ai_usage — full replacement with auth.uid() guard
-- ──────────────────────────────────────────────────────────────────────

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
AS $function$
DECLARE
  v_user_id uuid;
  v_request_type text := lower(coalesce(trim(p_request_type), 'chat_message'));
  v_weight integer := GREATEST(1, coalesce(p_weight, 1));
BEGIN
  -- SECURITY: when called with a user JWT, always use the authenticated
  -- user's ID. This blocks client-side spoofing via p_user_id.
  v_user_id := COALESCE(auth.uid(), p_user_id);
  IF v_user_id IS NULL THEN
    RETURN;
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