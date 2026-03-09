-- =============================================================
-- Add learner_starter and learner_pro tiers — Step 1: Enum extension
-- ALTER TYPE ADD VALUE must be committed before values can be used.
-- Step 2 (seed data) is in 20260308150000_seed_learner_tiers.sql
-- =============================================================

-- ── 1. Extend enums ──────────────────────────────────────────
-- PostgreSQL enums can only ADD values, never remove.

ALTER TYPE public.tier_name_aligned ADD VALUE IF NOT EXISTS 'learner_starter';
ALTER TYPE public.tier_name_aligned ADD VALUE IF NOT EXISTS 'learner_pro';

ALTER TYPE public.subscription_tier ADD VALUE IF NOT EXISTS 'learner_starter';
ALTER TYPE public.subscription_tier ADD VALUE IF NOT EXISTS 'learner_pro';
