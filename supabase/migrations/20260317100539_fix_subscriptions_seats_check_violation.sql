-- Migration: Fix subscriptions seats_check constraint violation
-- Problem:   Existing rows have seats_used > seats_total because seat assignment
--            previously validated against subscription_plans.max_teachers while
--            the DB constraint enforces seats_used <= seats_total.
--            Also, seats_total defaults to 0 which blocks even 1 seat assignment.
-- Fix:       1. Reconcile dirty data: raise seats_total to match reality
--            2. Ensure seats_total >= 1 for active subscriptions
--            3. Align with plan max_teachers where seats_total was never set
-- Scope:     Data fix only — the RPC fix is in 20260317092846.

BEGIN;

-- Step 1: For any subscription where seats_used > seats_total, raise the cap.
-- This makes the CHECK constraint pass for all existing rows.
UPDATE public.subscriptions
SET
    seats_total = GREATEST(seats_total, seats_used),
    updated_at = NOW()
WHERE seats_used > seats_total;

-- Step 2: Active subscriptions must allow at least 1 seat.
-- Prevents seats_total=0 (the column default) from blocking all assignments.
UPDATE public.subscriptions
SET
    seats_total = GREATEST(seats_total, 1),
    updated_at = NOW()
WHERE status = 'active'
  AND seats_total < 1;

-- Step 3: For active subscriptions that still have seats_total=1 (the old
-- default from PayFast webhook), align with the plan's max_teachers if higher.
-- This prevents principals from hitting artificial limits when they paid for a
-- larger plan.
UPDATE public.subscriptions s
SET
    seats_total = sp.max_teachers,
    updated_at = NOW()
FROM public.subscription_plans sp
WHERE sp.id = s.plan_id
  AND s.status = 'active'
  AND sp.max_teachers IS NOT NULL
  AND s.seats_total < sp.max_teachers;

COMMIT;