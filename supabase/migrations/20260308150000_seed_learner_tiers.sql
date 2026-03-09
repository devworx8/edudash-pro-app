-- =============================================================
-- Seed learner_starter and learner_pro data
-- Step 2 of learner tier addition (enum values committed in previous migration)
-- =============================================================

-- ── 1. Expand CHECK constraints on text columns ───────────────

ALTER TABLE public.preschools DROP CONSTRAINT IF EXISTS preschools_subscription_tier_check;
ALTER TABLE public.preschools ADD CONSTRAINT preschools_subscription_tier_check
  CHECK (subscription_tier = ANY (ARRAY[
    'free', 'starter', 'professional', 'enterprise',
    'parent-starter', 'parent-plus',
    'parent_starter', 'parent_plus',
    'teacher_starter', 'teacher_pro',
    'learner_starter', 'learner_pro',
    'school_starter', 'school_premium', 'school_pro', 'school_enterprise',
    'skills_starter', 'skills_premium', 'skills_enterprise',
    'student_starter', 'student_pro'
  ]));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_plan_tier_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_plan_tier_check
  CHECK (plan_tier = ANY (ARRAY[
    'free', 'starter', 'professional', 'enterprise',
    'parent-starter', 'parent-plus',
    'parent_starter', 'parent_plus',
    'teacher_starter', 'teacher_pro',
    'learner_starter', 'learner_pro',
    'school_starter', 'school_premium', 'school_pro', 'school_enterprise',
    'skills_starter', 'skills_premium', 'skills_enterprise'
  ]));

-- ── 2. Seed subscription_plans rows ──────────────────────────

INSERT INTO public.subscription_plans
  (name, tier, description, price_monthly, price_annual, max_teachers, max_students, features, is_active, sort_order)
VALUES
  (
    'Learner Starter',
    'learner_starter',
    'For adult learners who want guided study, AI help and progress tracking.',
    99, 950,
    0, 0,
    '["AI study assistant","Progress tracking","Subject quizzes","Exam prep tools","Mobile app access"]'::jsonb,
    true, 20
  ),
  (
    'Learner Pro',
    'learner_pro',
    'Full AI features, unlimited practice, and priority support for serious learners.',
    199, 1910,
    0, 0,
    '["Everything in Learner Starter","Unlimited AI interactions","Advanced analytics","Priority support","Download study packs","Custom study plan"]'::jsonb,
    true, 21
  )
ON CONFLICT (tier) DO UPDATE
  SET name          = EXCLUDED.name,
      description   = EXCLUDED.description,
      price_monthly = EXCLUDED.price_monthly,
      price_annual  = EXCLUDED.price_annual,
      features      = EXCLUDED.features,
      is_active     = EXCLUDED.is_active,
      sort_order    = EXCLUDED.sort_order;

-- ── 3. AI usage tier rows for learner tiers ──────────────────
-- Copy all quota columns from teacher tiers (excluding pk fields).

INSERT INTO public.ai_usage_tiers (
  tier_name, chat_messages_per_day, chat_messages_per_month,
  exams_per_month, explanations_per_month, images_per_month,
  transcriptions_per_month, advanced_features, priority_queue,
  monthly_price_zar, is_active
)
SELECT
  'learner_starter', chat_messages_per_day, chat_messages_per_month,
  exams_per_month, explanations_per_month, images_per_month,
  transcriptions_per_month, advanced_features, priority_queue,
  monthly_price_zar, is_active
FROM   public.ai_usage_tiers
WHERE  tier_name = 'teacher_starter'
ON CONFLICT (tier_name) DO NOTHING;

INSERT INTO public.ai_usage_tiers (
  tier_name, chat_messages_per_day, chat_messages_per_month,
  exams_per_month, explanations_per_month, images_per_month,
  transcriptions_per_month, advanced_features, priority_queue,
  monthly_price_zar, is_active
)
SELECT
  'learner_pro', chat_messages_per_day, chat_messages_per_month,
  exams_per_month, explanations_per_month, images_per_month,
  transcriptions_per_month, advanced_features, priority_queue,
  monthly_price_zar, is_active
FROM   public.ai_usage_tiers
WHERE  tier_name = 'teacher_pro'
ON CONFLICT (tier_name) DO NOTHING;
