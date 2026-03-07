-- Auto-activate 14-day free trial on new profile creation.
-- Sets is_trial = true and trial_ends_at = now() + 14 days for all new signups
-- that don't already have a paid subscription tier.
-- The trial is DB-driven — no client-side timers needed.

CREATE OR REPLACE FUNCTION public._activate_new_user_trial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only activate trial for users with no paid tier (free or null)
  IF COALESCE(NEW.subscription_tier, 'free') = 'free' THEN
    NEW.is_trial := true;
    NEW.trial_ends_at := now() + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activate_new_user_trial ON public.profiles;
CREATE TRIGGER activate_new_user_trial
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._activate_new_user_trial();

-- Backfill: activate trial for existing free-tier users who never had one set
-- (is_trial IS NULL means they pre-date this trigger)
UPDATE public.profiles
SET
  is_trial     = true,
  trial_ends_at = GREATEST(created_at + INTERVAL '14 days', now() + INTERVAL '3 days')
WHERE
  COALESCE(subscription_tier, 'free') = 'free'
  AND is_trial IS NULL
  AND trial_ends_at IS NULL;

COMMENT ON FUNCTION public._activate_new_user_trial() IS
  'Automatically starts a 14-day free trial for every new profile with no paid tier.';
