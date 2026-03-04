-- Birthday reminder idempotency log
-- Prevents duplicate sends for the same student/user/reminder window per birthday year.

BEGIN;

CREATE TABLE IF NOT EXISTS public.birthday_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preschool_id UUID NOT NULL REFERENCES public.preschools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  reminder_offset_days INTEGER NOT NULL CHECK (reminder_offset_days >= 0 AND reminder_offset_days <= 365),
  birthday_year INTEGER NOT NULL CHECK (birthday_year >= 2000),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT birthday_reminder_logs_unique
    UNIQUE (student_id, recipient_user_id, event_type, reminder_offset_days, birthday_year)
);

CREATE INDEX IF NOT EXISTS idx_birthday_reminder_logs_student_offset
  ON public.birthday_reminder_logs (student_id, reminder_offset_days, birthday_year);

CREATE INDEX IF NOT EXISTS idx_birthday_reminder_logs_recipient_sent_at
  ON public.birthday_reminder_logs (recipient_user_id, sent_at DESC);

ALTER TABLE public.birthday_reminder_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.birthday_reminder_logs TO service_role;

COMMIT;
