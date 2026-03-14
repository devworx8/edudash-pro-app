-- Migration: Add p_weight parameter to increment_ai_usage
-- Purpose: Model-weighted quota consumption (e.g. Dash Pro x8, Dash Quick x1)
-- The weight maps directly to MODEL_WEIGHTS in lib/ai/models.ts and ai-proxy

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
  v_request_type text := lower(coalesce(trim(p_request_type), 'chat_message'));
  v_weight integer := GREATEST(1, coalesce(p_weight, 1));
BEGIN
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
      WHERE user_id = p_user_id;
    ELSIF v_request_type = 'explanation' THEN
      UPDATE public.user_ai_usage
      SET explanations_requested_this_month = explanations_requested_this_month + v_weight,
          total_explanations_requested = total_explanations_requested + v_weight,
          updated_at = NOW()
      WHERE user_id = p_user_id;
    ELSIF v_request_type = 'image_generation' THEN
      UPDATE public.user_ai_usage
      SET images_generated_this_month = images_generated_this_month + v_weight,
          total_images_generated = total_images_generated + v_weight,
          updated_at = NOW()
      WHERE user_id = p_user_id;
    ELSIF v_request_type = 'transcription' THEN
      UPDATE public.user_ai_usage
      SET transcriptions_this_month = transcriptions_this_month + v_weight,
          updated_at = NOW()
      WHERE user_id = p_user_id;
    ELSE
      UPDATE public.user_ai_usage
      SET chat_messages_today = chat_messages_today + v_weight,
          chat_messages_this_month = chat_messages_this_month + v_weight,
          total_chat_messages = total_chat_messages + v_weight,
          updated_at = NOW()
      WHERE user_id = p_user_id;
    END IF;
  END IF;

  INSERT INTO public.ai_request_log (user_id, request_type, status, metadata)
  VALUES (
    p_user_id,
    v_request_type,
    p_status,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'original_request_type', p_request_type,
      'weight', v_weight
    )
  );
END;
$function$;
